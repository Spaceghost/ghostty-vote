# Durable retry state, independent of the client's request lifetime. Delivery is
# at least once after an ambiguous provider/network failure, using stable timestamps.
import {randomToken} from './lib.js'
import {SCROBBLE_MAX_ATTEMPTS, SCROBBLE_RETENTION_MS} from './scrobble-data.js'
import {DeliveryError, decryptCredentials, deliver} from './scrobble-providers.js'

export def drainScrobbles(env, fetcher = fetch, limit = 8)
	const now = Date.now()
	# A terminated invocation relinquishes its lease. Never retry indefinitely.
	await env.DB.prepare('UPDATE scrobble_outbox SET status=CASE WHEN attempts>=? THEN \'failed\' ELSE \'retry\' END,lease=\'\',lease_until=0,last_error=\'delivery_interrupted\',next_attempt_at=? WHERE status=\'sending\' AND lease_until<?').bind(SCROBBLE_MAX_ATTEMPTS, now, now).run()
	const due = await env.DB.prepare('SELECT id FROM scrobble_outbox WHERE status IN (\'pending\',\'retry\') AND next_attempt_at<=? AND attempts<? AND created_at>? ORDER BY next_attempt_at,id LIMIT ?').bind(now, SCROBBLE_MAX_ATTEMPTS, now - SCROBBLE_RETENTION_MS, limit).all()
	for candidate of due.results
		const lease = randomToken(16)
		const row = await env.DB.prepare('UPDATE scrobble_outbox SET status=\'sending\',lease=?1,lease_until=?2,attempts=attempts+1,updated_at=?3 WHERE id=?4 AND status IN (\'pending\',\'retry\') AND next_attempt_at<=?3 AND attempts<?5 RETURNING *').bind(lease, Date.now() + 90000, Date.now(), candidate.id, SCROBBLE_MAX_ATTEMPTS).first()
		if !row
			continue
		const provider = await env.DB.prepare('SELECT p.* FROM scrobble_providers p WHERE p.account=? AND p.provider=? AND p.generation=? AND p.status=\'connected\' AND NOT EXISTS(SELECT 1 FROM account_bans b WHERE b.account=p.account)').bind(row.account, row.provider, row.generation).first()
		let cancelled = !provider
		if row.kind === 'playing_now'
			const current = await env.DB.prepare('SELECT id FROM scrobble_nowplaying WHERE account=? AND id=? AND expires_at>?').bind(row.account, row.listen_id, Date.now()).first()
			cancelled = cancelled || !current
		else
			const exists = await env.DB.prepare('SELECT 1 AS present FROM scrobble_listens WHERE account=? AND id=?').bind(row.account, row.listen_id).first()
			cancelled = cancelled || !exists
		if cancelled
			await env.DB.prepare('UPDATE scrobble_outbox SET status=\'cancelled\',last_error=\'destination_or_listen_removed\',lease=\'\',lease_until=0,updated_at=? WHERE id=? AND lease=?').bind(Date.now(), row.id, lease).run()
			continue
		let status = 'delivered'
		let code = ''
		let next = 0
		try
			const credentials = await decryptCredentials(env, provider)
			# Recheck after asynchronous decryption. A request already in flight when
			# disconnected cannot be recalled; queued requests cannot use the old key.
			const active = await env.DB.prepare('SELECT 1 AS active FROM scrobble_outbox o JOIN scrobble_providers p ON p.account=o.account AND p.provider=o.provider AND p.generation=o.generation WHERE o.id=? AND o.lease=? AND o.status=\'sending\' AND p.status=\'connected\' AND NOT EXISTS(SELECT 1 FROM account_bans b WHERE b.account=o.account) AND (o.kind=\'single\' OR EXISTS(SELECT 1 FROM scrobble_nowplaying n WHERE n.account=o.account AND n.id=o.listen_id AND n.expires_at>?))').bind(row.id, lease, Date.now()).first()
			if !active
				continue
			await deliver(fetcher, row.provider, credentials, row)
		catch error
			const known = error instanceof DeliveryError
			code = known ? error.code : 'delivery_internal_error'
			const retryable = known ? error.retryable : true
			status = retryable && row.attempts < SCROBBLE_MAX_ATTEMPTS ? 'retry' : 'failed'
			# Backoff 1m,2m,4m,... capped at one hour. At most eight attempts.
			next = Date.now() + Math.min(3600000, 60000 * 2 ** (row.attempts - 1))
		await env.DB.prepare('UPDATE scrobble_outbox SET status=?,last_error=?,next_attempt_at=?,lease=\'\',lease_until=0,updated_at=? WHERE id=? AND lease=? AND status=\'sending\'').bind(status, code, next, Date.now(), row.id, lease).run()

export def scheduledScrobbles(event, env, ctx)
	ctx.waitUntil((do()
		try
			await pruneScrobbles(env)
			await drainScrobbles(env)
		catch
			console.error('scrobble_queue: scheduled_run_failed')
	)())

export def pruneScrobbles(env)
	const now = Date.now()
	const cutoff = now - SCROBBLE_RETENTION_MS
	# Bounded deletions keep housekeeping within the same invocation budget. Rows
	# beyond retention are never shown or exported while a prune backlog is drained.
	await env.DB.batch([
		env.DB.prepare('DELETE FROM scrobble_outbox WHERE id IN(SELECT id FROM scrobble_outbox WHERE created_at<? OR (kind=\'playing_now\' AND created_at<?) LIMIT 1000)').bind(cutoff, now - 86400000),
		env.DB.prepare('DELETE FROM scrobble_listens WHERE (account,id) IN(SELECT account,id FROM scrobble_listens WHERE created_at<? LIMIT 1000)').bind(cutoff),
		env.DB.prepare('DELETE FROM scrobble_nowplaying WHERE account IN(SELECT account FROM scrobble_nowplaying WHERE expires_at<? LIMIT 1000)').bind(now),
		env.DB.prepare('DELETE FROM scrobble_rate WHERE bucket<?').bind(Math.floor(now / 60000) - 60),
		env.DB.prepare('UPDATE scrobble_providers SET status=\'disconnected\',credentials=\'\' WHERE status IN (\'pending_auth\',\'connecting\') AND updated_at<?').bind(now - 3600000)
	])
