import {randomToken, sha256hex} from './lib.js'
import {problem} from './scrobble-data.js'

const CLIENT_TOKEN = new RegExp('^Token (sgs_[A-Za-z0-9_-]{43})$', 'i')

export def validAccountSQL()
	return 'EXISTS (SELECT 1 FROM scrobble_accounts a JOIN scrobble_tokens t ON t.account=a.account WHERE a.account=?1 AND a.epoch=?2 AND t.id=?3 AND t.revoked_at=0 AND NOT EXISTS (SELECT 1 FROM account_bans b WHERE b.account=a.account))'

export def clientAccount(request, env)
	const match = CLIENT_TOKEN.exec(request.headers.get('authorization') || '')
	if !match
		problem(401, 'invalid_token', 'Use Authorization: Token followed by your Spaceghost client token.')
	const row = await env.DB.prepare('SELECT a.account,a.provider,a.epoch,t.id AS token_id,t.last_used_at FROM scrobble_tokens t JOIN scrobble_accounts a ON a.account=t.account WHERE t.token_hash=? AND t.revoked_at=0 AND NOT EXISTS (SELECT 1 FROM account_bans b WHERE b.account=a.account)').bind(await sha256hex(match[1])).first()
	if !row
		problem(401, 'invalid_token', 'This client token is invalid or revoked.')
	return row

export def accountRecord(env, session)
	await env.DB.prepare('INSERT OR IGNORE INTO scrobble_accounts(account,provider,epoch,created_at) VALUES(?,?,?,?)').bind(session.k, session.p, randomToken(16), Date.now()).run()
	return await env.DB.prepare('SELECT account,provider,epoch FROM scrobble_accounts WHERE account=?').bind(session.k).first()

