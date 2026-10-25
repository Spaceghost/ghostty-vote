# Private MP3 storage, quota reservations and revocable fragment-only sharing.
import {PRIVATE, isSameOrigin, json, randomToken, readJsonBody, sha256hex} from './lib.js'
import {readSession} from './session.js'
import {isBanned} from './account.js'
import {clientAccount, accountRecord, validAccountSQL} from './scrobble-auth.js'
import {SCROBBLE_BASE, SCROBBLE_BROWSER, ScrobbleError, metadata, problem} from './scrobble-data.js'

const CLIENT = SCROBBLE_BASE + '/1/recordings'
const BROWSER = SCROBBLE_BROWSER + 'recordings'
const MAX_BYTES = 67108864
const ACCOUNT_BYTES = 2147483648
const TOTAL_BYTES = 21474836480
const ID = new RegExp('^[0-9a-f]{64}$')
const SECRET = new RegExp('^[A-Za-z0-9_-]{43}$')
const HEADERS = {...PRIVATE, 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff'}

def reply(value, status = 200, extra = {})
	return json(value, {status: status, headers: {...HEADERS, ...extra}})

def recordingId(value)
	if typeof value !== 'string' || !ID.test(value)
		problem(400, 'invalid_recording', 'Choose a saved recording.')
	return value

def body(request)
	const input = await readJsonBody(request, 16384)
	if !input.ok
		problem(input.status, input.error, input.message)
	if !input.value || typeof input.value !== 'object' || Array.isArray(input.value)
		problem(400, 'invalid_body', 'Send a JSON object.')
	return input.value

def publicRow(row)
	return {id: row.id, bytes: row.bytes, track_metadata: JSON.parse(row.metadata), saved_at: row.created_at, share_expires_at: row.share_expires_at}

def storage(env)
	if !env.RECORDINGS
		problem(503, 'recordings_unavailable', 'Recording storage is not configured. Your local files are still available.')
	return env.RECORDINGS

def owned(env, account, id)
	const row = await env.DB.prepare("SELECT * FROM recordings WHERE account=? AND id=? AND status='ready'").bind(account, recordingId(id)).first()
	if !row
		problem(404, 'recording_not_found', 'This recording is not available.')
	return row

def list(env, account, url)
	const before = url.searchParams.get('before') || '9007199254740991'
	const cursor = url.searchParams.get('cursor') || 'z'
	if !new RegExp('^[0-9]{1,16}$').test(before) || !Number.isSafeInteger(Number(before)) || (cursor !== 'z' && !ID.test(cursor))
		problem(400, 'invalid_cursor', 'Use the next_cursor returned by this endpoint.')
	const rows = await env.DB.prepare("SELECT * FROM recordings WHERE account=? AND status='ready' AND (created_at<? OR (created_at=? AND id<?)) ORDER BY created_at DESC,id DESC LIMIT 51").bind(account, Number(before), Number(before), cursor).all()
	const page = rows.results.slice(0, 50)
	const last = page[page.length - 1]
	const usage = await env.DB.prepare('SELECT COALESCE(SUM(bytes),0) AS bytes FROM recordings WHERE account=?').bind(account).first()
	return reply({recordings: page.map(publicRow), next_cursor: rows.results.length > 50 && last ? {before: last.created_at, cursor: last.id} : null, bytes_used: usage.bytes, bytes_limit: ACCOUNT_BYTES})

def reserve(request, env, account)
	storage(env)
	const input = await body(request)
	const id = recordingId(input.id)
	if !Number.isSafeInteger(input.bytes) || input.bytes <= 0 || input.bytes > MAX_BYTES
		problem(400, 'invalid_size', 'A recording must be between one byte and 64 MiB.')
	const meta = JSON.stringify(metadata(input.track_metadata))
	const existing = await env.DB.prepare('SELECT id,status,bytes,upload_id FROM recordings WHERE account=? AND id=?').bind(account.account, id).first()
	if existing
		if existing.bytes !== input.bytes || ['deleting', 'uploading'].includes(existing.status)
			problem(409, 'upload_busy', 'This recording is changing. Try again shortly.')
		return reply(existing)
	const now = Date.now()
	const upload = randomToken(16)
	const key = account.account + '/' + id + '/' + upload + '.mp3'
	# One SQLite statement reserves both account and service capacity atomically.
	const quota = '(SELECT COALESCE(SUM(bytes),0) FROM recordings WHERE account=?1)+?6<=?9 AND (SELECT COALESCE(SUM(bytes),0) FROM recordings)+?6<=?10 AND (SELECT COUNT(*) FROM recordings)<20000'
	const row = await env.DB.prepare("INSERT INTO recordings(account,id,object_key,upload_id,bytes,metadata,status,created_at,upload_expires_at) SELECT ?1,?4,?5,?11,?6,?7,'pending',?8,?8+900000 WHERE " + validAccountSQL() + ' AND ' + quota + ' ON CONFLICT(account,id) DO NOTHING RETURNING id,status,bytes,upload_id').bind(account.account, account.epoch, account.token_id, id, key, input.bytes, meta, now, ACCOUNT_BYTES, TOTAL_BYTES, upload).first()
	if !row
		problem(409, 'recording_capacity', 'Storage is full or this upload changed. Delete unused hosted recordings, then retry.')
	return reply(row, 201)

def uploadAudio(request, env, account, id)
	const bucket = storage(env)
	const upload = request.headers.get('x-recording-upload')
	const row = await env.DB.prepare("UPDATE recordings SET status='uploading' WHERE account=? AND id=? AND upload_id=? AND status='pending' AND upload_expires_at>? RETURNING *").bind(account.account, recordingId(id), upload || '', Date.now()).first()
	if !row
		problem(409, 'upload_expired', 'Start this recording upload again.')
	try
		if request.headers.get('content-type') !== 'audio/mpeg' || request.headers.get('content-length') !== String(row.bytes) || !request.body
			problem(400, 'invalid_audio', 'Send the declared MP3 bytes with Content-Length and audio/mpeg.')
		# R2 consumes the request stream and checks its declared SHA256. No whole-file buffer.
		const checksum = Uint8Array.from(row.id.match(new RegExp('..', 'g')), do(pair) parseInt(pair, 16))
		const object = await bucket.put(row.object_key, request.body, {httpMetadata: {contentType: 'audio/mpeg'}, sha256: checksum.buffer})
		if object.size !== row.bytes
			await bucket.delete(row.object_key)
			problem(400, 'invalid_size', 'The uploaded audio did not match its declared size.')
		const result = await env.DB.prepare("UPDATE recordings SET status='ready' WHERE account=?1 AND id=?4 AND upload_id=?5 AND status='uploading' AND " + validAccountSQL() + ' RETURNING id').bind(account.account, account.epoch, account.token_id, row.id, row.upload_id).first()
		if !result
			await bucket.delete(row.object_key)
			problem(409, 'upload_changed', 'This recording or client token changed during upload.')
		return reply({id: row.id, status: 'ready'})
	catch error
		await env.DB.prepare("UPDATE recordings SET status='pending' WHERE account=? AND id=? AND upload_id=? AND status='uploading'").bind(account.account, row.id, row.upload_id).run()
		throw error

def share(env, account, id, url)
	await owned(env, account, id)
	const secret = randomToken(32)
	const expires = Date.now() + 2592000000
	const row = await env.DB.prepare("UPDATE recordings SET share_hash=?,share_expires_at=? WHERE account=? AND id=? AND status='ready' RETURNING id").bind(await sha256hex(secret), expires, account, id).first()
	if !row
		problem(409, 'recording_changed', 'This recording changed. Refresh and retry.')
	return reply({url: url.origin + SCROBBLE_BASE + '/listen/#' + secret, expires_at: expires})

def revoke(env, account, id)
	await env.DB.batch([
		env.DB.prepare('DELETE FROM recording_grants WHERE account=? AND recording_id=? AND share_hash IS NOT NULL').bind(account, recordingId(id)),
		env.DB.prepare('UPDATE recordings SET share_hash=NULL,share_expires_at=0 WHERE account=? AND id=?').bind(account, id)
	])
	return reply({ok: true})

def remove(env, account, id)
	const row = await env.DB.prepare("UPDATE recordings SET status='deleting',share_hash=NULL,share_expires_at=0 WHERE account=? AND id=? RETURNING object_key,upload_id").bind(account, recordingId(id)).first()
	if row
		await storage(env).delete(row.object_key)
		await env.DB.prepare("DELETE FROM recordings WHERE account=? AND id=? AND upload_id=? AND status='deleting'").bind(account, id, row.upload_id).run()
	return reply({ok: true})

def grant(env, row, shareHash = null)
	const secret = randomToken(32)
	const now = Date.now()
	await env.DB.prepare('DELETE FROM recording_grants WHERE account=? AND expires_at<=?').bind(row.account, now).run()
	const added = await env.DB.prepare("INSERT INTO recording_grants(token_hash,account,recording_id,share_hash,expires_at) SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM recording_grants WHERE account=?)<256 AND EXISTS(SELECT 1 FROM recordings WHERE account=? AND id=? AND status='ready' AND (? IS NULL OR (share_hash=? AND share_expires_at>?))) RETURNING token_hash").bind(await sha256hex(secret), row.account, row.id, shareHash, now + 3600000, row.account, row.account, row.id, shareHash, shareHash, now).first()
	if !added
		problem(429, 'playback_busy', 'Too many playback sessions. Try again later.')
	const path = CLIENT + '/audio/' + row.id
	return reply({recording: publicRow(row), audio_url: path, expires_at: now + 3600000}, 200, {'set-cookie': 'piano_audio=' + secret + '; Path=' + path + '; Max-Age=3600; HttpOnly; Secure; SameSite=Strict'})

def access(request, env, url)
	if !isSameOrigin(request, url) || request.headers.get('origin') !== url.origin
		problem(403, 'forbidden', 'Open this link in the browser player.')
	const input = await body(request)
	if typeof input.secret !== 'string' || !SECRET.test(input.secret)
		problem(404, 'link_unavailable', 'This listening link is unavailable or expired.')
	const hash = await sha256hex(input.secret)
	const row = await env.DB.prepare("SELECT r.* FROM recordings r WHERE share_hash=? AND share_expires_at>? AND status='ready' AND NOT EXISTS(SELECT 1 FROM account_bans b WHERE b.account=r.account)").bind(hash, Date.now()).first()
	if !row
		problem(404, 'link_unavailable', 'This listening link is unavailable or expired.')
	return await grant(env, row, hash)

def rangeFor(header, size)
	if !header
		return null
	const match = new RegExp('^bytes=([0-9]*)-([0-9]*)$').exec(header)
	if !match || (!match[1] && !match[2])
		return false
	const a = match[1] ? Number(match[1]) : null
	const b = match[2] ? Number(match[2]) : null
	if (a !== null && !Number.isSafeInteger(a)) || (b !== null && !Number.isSafeInteger(b))
		return false
	const start = a === null ? Math.max(0, size - b) : a
	const end = a === null || b === null ? size - 1 : Math.min(b, size - 1)
	return start >= 0 && start < size && end >= start ? {offset: start, length: end - start + 1} : false

def audio(request, env, id)
	recordingId(id)
	const matches = Array.from((request.headers.get('cookie') || '').matchAll(new RegExp('(?:^|;\\s*)piano_audio=([A-Za-z0-9_-]{43})(?=;|$)', 'g'))).slice(0, 16)
	let row = null
	for match of matches
		row = await env.DB.prepare("SELECT r.* FROM recording_grants g JOIN recordings r ON r.account=g.account AND r.id=g.recording_id WHERE g.token_hash=? AND g.recording_id=? AND g.expires_at>? AND r.status='ready' AND (g.share_hash IS NULL OR (g.share_hash=r.share_hash AND r.share_expires_at>?)) AND NOT EXISTS(SELECT 1 FROM account_bans b WHERE b.account=r.account)").bind(await sha256hex(match[1]), id, Date.now(), Date.now()).first()
		if row
			break
	if !row
		problem(401, 'playback_expired', 'Open the listening link again to start a playback session.')
	const range = rangeFor(request.headers.get('range'), row.bytes)
	if range === false
		return new Response(null, {status: 416, headers: {...HEADERS, 'content-range': 'bytes */' + row.bytes}})
	const bucket = storage(env)
	const object = request.method === 'HEAD' ? await bucket.head(row.object_key) : await bucket.get(row.object_key, range ? {range: range} : {})
	if !object
		problem(404, 'recording_missing', 'This audio file is no longer available.')
	const headers = {...HEADERS, 'content-type': 'audio/mpeg', 'accept-ranges': 'bytes', 'content-length': String(range ? range.length : row.bytes), etag: object.httpEtag}
	if range
		headers['content-range'] = 'bytes ' + range.offset + '-' + (range.offset + range.length - 1) + '/' + row.bytes
	return new Response(request.method === 'HEAD' ? null : object.body, {status: range ? 206 : 200, headers: headers})

export def handleRecordings(request, env, ctx, url)
	const client = url.pathname === CLIENT || url.pathname.startsWith(CLIENT + '/')
	const browser = url.pathname === BROWSER || url.pathname.startsWith(BROWSER + '/')
	if !client && !browser
		return null
	try
		const name = url.pathname.slice((client ? CLIENT : BROWSER).length).replace(new RegExp('^/|/$', 'g'), '')
		if client && name === 'access' && request.method === 'POST'
			return await access(request, env, url)
		if client && name.startsWith('audio/') && ['GET', 'HEAD'].includes(request.method)
			return await audio(request, env, name.slice(6))
		let account
		if client
			account = await clientAccount(request, env)
		else
			if !isSameOrigin(request, url) || (request.method !== 'GET' && request.headers.get('origin') !== url.origin)
				problem(403, 'forbidden', 'Same-origin browser requests are required.')
			const session = await readSession(request, env)
			if !session
				problem(401, 'sign_in_required', 'Sign in to manage your recordings.')
			if await isBanned(env, session.k)
				problem(403, 'account_banned', 'This account cannot manage recordings.')
			account = await accountRecord(env, session)
		if !name && request.method === 'GET'
			return await list(env, account.account, url)
		if client && name === 'uploads' && request.method === 'POST'
			return await reserve(request, env, account)
		const parts = name.split('/')
		if client && parts.length === 2 && parts[1] === 'audio' && request.method === 'PUT'
			return await uploadAudio(request, env, account, parts[0])
		if parts.length === 2 && request.method === 'POST'
			const id = recordingId(parts[0])
			if parts[1] === 'share'
				return await share(env, account.account, id, url)
			if parts[1] === 'revoke'
				return await revoke(env, account.account, id)
			if parts[1] === 'delete'
				return await remove(env, account.account, id)
			if browser && parts[1] === 'open'
				return await grant(env, await owned(env, account.account, id))
		return reply({error: 'not_found'}, 404)
	catch error
		if error instanceof ScrobbleError
			return reply({error: error.code, message: error.message}, error.status)
		console.error('recordings_api: internal_error')
		return reply({error: 'server_error', message: 'Recording storage is temporarily unavailable. Your local copy is unchanged.'}, 500)

export def pruneRecordings(env)
	if !env.RECORDINGS
		return
	const now = Date.now()
	await env.DB.prepare('DELETE FROM recording_grants WHERE token_hash IN(SELECT token_hash FROM recording_grants WHERE expires_at<=? LIMIT 1000)').bind(now).run()
	const rows = await env.DB.prepare("UPDATE recordings SET status='deleting',share_hash=NULL,share_expires_at=0 WHERE (account,id) IN(SELECT account,id FROM recordings WHERE status='deleting' OR (status IN ('pending','uploading') AND upload_expires_at<?) LIMIT 10) RETURNING account,id,object_key,upload_id").bind(now).all()
	for row of rows.results
		await env.RECORDINGS.delete(row.object_key)
		await env.DB.prepare("DELETE FROM recordings WHERE account=? AND id=? AND upload_id=? AND status='deleting'").bind(row.account, row.id, row.upload_id).run()
	const state = await env.DB.prepare('SELECT cursor FROM recording_gc_state WHERE id=1').first()
	const page = await env.RECORDINGS.list({limit: 20, cursor: state && state.cursor || undefined})
	for object of page.objects
		if object.uploaded.getTime() > now - 86400000
			continue
		const present = await env.DB.prepare('SELECT 1 AS present FROM recordings WHERE object_key=?').bind(object.key).first()
		if !present
			await env.RECORDINGS.delete(object.key)
	await env.DB.prepare('UPDATE recording_gc_state SET cursor=? WHERE id=1').bind(page.truncated ? page.cursor : '').run()
