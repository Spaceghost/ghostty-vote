# Scrobbles accounts provisioned by another service (scrobble-external.js, reached through
# the ScrobbleAccounts entrypoint): tokens, revocation, renaming and the one-time
# dashboard ticket, on the real migrations with the D1 shim.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { handle } from '../src/app.js'
import { EXTERNAL_COOKIE, issueTicket, provisionToken, renameExternal, revokeExternal } from '../src/scrobble-external.js'
import { ScrobbleError } from '../src/scrobble-data.js'
import { createD1 } from './d1-shim.js'

const ORIGIN = 'https://spacegho.st'
const SUBJECT = 'c3ViamVjdC1vbmUtb3BhcXVlLWhtYWM'
const OTHER = 'b3RoZXItc3ViamVjdC1vcGFxdWUtaG1hYw'
const who = {provider: 'spacegho.st', subject: SUBJECT}

def env
	const dir = new URL('../migrations/', import.meta.url)
	const files = readdirSync(dir).filter(do(n) n.endsWith('.sql')).sort().map(do(n) readFileSync(new URL(n, dir), 'utf8'))
	return {DB: createD1(...files), SESSION_SECRET: 'test-session-secret-0123456789abcdef-0123456789'}

def call(e, path, {method = 'GET', headers = {}, body} = {})
	const tasks = []
	const res = await handle(new Request(ORIGIN + path, {method: method, headers: headers, body: body}), e, {waitUntil: do(p) tasks.push(p)}, undefined, do() throw new Error('no network in tests'))
	await Promise.allSettled(tasks)
	return res

def validate(e, token)
	return await call(e, '/mods/ffxiv/scrobble/1/validate-token', {headers: {authorization: 'Token ' + token}})

def submit(e, token, track)
	return await call(e, '/mods/ffxiv/scrobble/1/submit-listens', {method: 'POST', headers: {authorization: 'Token ' + token, 'content-type': 'application/json'}, body: JSON.stringify({listen_type: 'single', payload: [{listened_at: Math.floor(Date.now() / 1000) - 100, track_metadata: {artist_name: 'Artist', track_name: track, release_name: 'Album'}}]})})

test('provision: account + token for an external identity; the token scrobbles under the display name', do
	const e = env()
	const a = await provisionToken(e, {...who, display_name: 'lynn', label: 'melodica web'})
	assert.match(a.token, /^sgs_[A-Za-z0-9_-]{43}$/)
	assert.equal(a.user_name, 'lynn')
	const v = await validate(e, a.token)
	assert.equal(v.status, 200)
	assert.equal((await v.json()).user_name, 'lynn')
	assert.equal((await submit(e, a.token, 'One')).status, 200)
	const key = createHash('sha256').update('spacegho.st:' + SUBJECT).digest('hex')
	const rows = e.DB.raw.prepare('SELECT account, provider FROM scrobble_accounts').all()
	assert.deepEqual(rows.map(do(r) ({...r})), [{account: key, provider: 'spacegho.st'}])
	assert.equal(e.DB.raw.prepare('SELECT COUNT(*) AS n FROM scrobble_listens WHERE account=?').get(key).n, 1)
	# The identity table has only the opaque subject, never anything else about the person.
	assert.deepEqual({...e.DB.raw.prepare('SELECT provider, subject, display_name FROM scrobble_external').get()}, {provider: 'spacegho.st', subject: SUBJECT, display_name: 'lynn'})
	# Provisioning again keeps the name unless renaming.
	const b = await provisionToken(e, {...who, display_name: 'other', label: 'melodica extension'})
	assert.equal(b.user_name, 'lynn')
	assert.equal((await renameExternal(e, {...who, display_name: ' Lynn O '})).user_name, 'Lynn O')
	assert.equal((await (await validate(e, b.token)).json()).user_name, 'Lynn O')
)

test('revoke: listed tokens, then all; a revoked token is a 401 at validate-token', do
	const e = env()
	const a = await provisionToken(e, {...who, label: 'web'})
	const b = await provisionToken(e, {...who, label: 'web', revoke: [a.token_id]})
	assert.equal((await validate(e, a.token)).status, 401)
	assert.equal((await validate(e, b.token)).status, 200)
	const c = await provisionToken(e, {...who, label: 'extension'})
	assert.deepEqual(await revokeExternal(e, {...who, token_ids: [c.token_id]}), {revoked: 1})
	assert.equal((await validate(e, c.token)).status, 401)
	assert.equal((await validate(e, b.token)).status, 200)
	assert.deepEqual(await revokeExternal(e, who), {revoked: 1})
	assert.equal((await validate(e, b.token)).status, 401)
	assert.equal((await submit(e, b.token, 'Late')).status, 401)
	# Opting back in issues a fresh, working token for the same account.
	const d = await provisionToken(e, {...who, label: 'web'})
	assert.equal((await validate(e, d.token)).status, 200)
)

test('at most eight active tokens: the oldest is revoked', do
	const e = env()
	const tokens = []
	for i in [0 ... 10]
		tokens.push(await provisionToken(e, {...who, label: 'x'}))
	assert.equal(e.DB.raw.prepare('SELECT COUNT(*) AS n FROM scrobble_tokens WHERE revoked_at=0').get().n, 8)
	assert.equal((await validate(e, tokens[0].token)).status, 401)
	assert.equal((await validate(e, tokens[9].token)).status, 200)
)

test('identities are validated; other providers and short subjects are refused', do
	const e = env()
	for bad of [{provider: 'github', subject: SUBJECT}, {provider: 'spacegho.st', subject: 'short'}, {provider: 'spacegho.st', subject: 'has spaces and more than sixteen'}, null]
		await assert.rejects(provisionToken(e, bad), ScrobbleError)
	await assert.rejects(renameExternal(e, {...who, display_name: '   '}), ScrobbleError)
)

test('ticket: one-time dashboard sign-in for that account only; logout clears it', do
	const e = env()
	const a = await provisionToken(e, {...who, display_name: 'lynn'})
	await submit(e, a.token, 'Mine')
	const other = await provisionToken(e, {provider: 'spacegho.st', subject: OTHER, display_name: 'someone'})
	await submit(e, other.token, 'Theirs')
	const t = await issueTicket(e, who)
	const u = new URL(t.url)
	assert.equal(u.origin + u.pathname, ORIGIN + '/mods/ffxiv/term/vote/api/scrobble/ticket')
	const r = await call(e, u.pathname + u.search, {headers: {'sec-fetch-site': 'cross-site'}})
	assert.equal(r.status, 303)
	assert.equal(r.headers.get('location'), '/mods/ffxiv/scrobble/')
	const set = r.headers.get('set-cookie')
	assert.match(set, new RegExp('^' + EXTERNAL_COOKIE + '=v1\\.'))
	assert.match(set, /Path=\/mods\/ffxiv\/term\/vote\/api;/)
	assert.match(set, /HttpOnly; Secure; SameSite=Lax/)
	assert.equal((await call(e, u.pathname + u.search)).status, 400, 'a ticket works once')
	const cookie = set.split(';')[0]
	const st = await call(e, '/mods/ffxiv/term/vote/api/scrobble/state', {headers: {cookie: cookie, 'sec-fetch-site': 'same-origin'}})
	const body = await st.json()
	assert.equal(body.signed_in, true)
	assert.equal(body.user_name, 'lynn')
	assert.deepEqual(body.history.map(do(h) h.track_metadata.track_name), ['Mine'])
	# The external session reaches scrobble controls only: not voting's auth/me, not recordings.
	const me = await (await call(e, '/mods/ffxiv/term/vote/api/auth/me', {headers: {cookie: cookie, 'sec-fetch-site': 'same-origin'}})).json()
	assert.notEqual(me.signed_in, true)
	assert.equal((await call(e, '/mods/ffxiv/term/vote/api/scrobble/recordings', {headers: {cookie: cookie, 'sec-fetch-site': 'same-origin'}})).status, 403)
	assert.equal((await call(e, '/mods/ffxiv/scrobble/1/recordings', {headers: {authorization: 'Token ' + a.token}})).status, 403)
	const out = await call(e, '/mods/ffxiv/term/vote/api/auth/logout', {method: 'POST', headers: {cookie: cookie, origin: ORIGIN, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json'}, body: '{}'})
	assert.equal(out.status, 200)
	assert.ok(out.headers.getSetCookie().some(do(c) c.startsWith(EXTERNAL_COOKIE + '=;') && c.includes('Max-Age=0')))
	# Expired and malformed tickets.
	const late = await issueTicket(e, who)
	e.DB.raw.exec('UPDATE scrobble_tickets SET expires_at = 0')
	assert.equal((await call(e, new URL(late.url).pathname + new URL(late.url).search)).status, 400)
	assert.equal((await call(e, '/mods/ffxiv/term/vote/api/scrobble/ticket?t=nope')).status, 400)
)
