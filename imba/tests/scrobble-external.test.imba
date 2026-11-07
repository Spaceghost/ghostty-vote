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
	assert.deepEqual({...e.DB.raw.prepare('SELECT provider, subject FROM scrobble_external').get()}, {provider: 'spacegho.st', subject: SUBJECT})
	assert.deepEqual({...e.DB.raw.prepare('SELECT display_name, leaderboard FROM scrobble_accounts').get()}, {display_name: 'lynn', leaderboard: 1})
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
	assert.equal(r.headers.get('location'), '/scrobble/')
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

def profileOf(e, token, body)
	const init = body === undefined ? {headers: {authorization: 'Token ' + token}} : {method: 'POST', headers: {authorization: 'Token ' + token, 'content-type': 'application/json'}, body: JSON.stringify(body)}
	return await call(e, '/scrobble/1/user/settings', init)

def siteAccount(e, login)
	const key = createHash('sha256').update('github:' + login).digest('hex')
	e.DB.raw.prepare("INSERT INTO scrobble_accounts(account,provider,epoch,created_at) VALUES(?, 'github', 'ep', 1)").run(key)
	const token = 'sgs_' + 'A'.repeat(42) + String(login).slice(-1)
	e.DB.raw.prepare("INSERT INTO scrobble_tokens(id,account,token_hash,label,prefix,created_at) VALUES(?, ?, ?, 'XivPiano', 'sgs_', 1)").run('t-' + login, key, createHash('sha256').update(token).digest('hex'))
	return {key: key, token: token}

test('handles, display names and the leaderboard switch: provisioned on, site accounts off', do
	const e = env()
	const a = await provisionToken(e, {...who, label: 'web'})
	const key = createHash('sha256').update('spacegho.st:' + SUBJECT).digest('hex')
	assert.equal(a.user_name, 'listener-' + key.slice(0, 6))
	let p = await (await profileOf(e, a.token)).json()
	assert.deepEqual(p, {display_name: '', handle: 'listener-' + key.slice(0, 6), name: 'listener-' + key.slice(0, 6), leaderboard: true})
	for bad of ['me@mail.example', 'https://x.example', 'a'.repeat(41), 42]
		assert.equal((await profileOf(e, a.token, {display_name: bad})).status, 400, String(bad))
	p = await (await profileOf(e, a.token, {display_name: 'Night Owl', leaderboard: false})).json()
	assert.deepEqual([p.name, p.leaderboard], ['Night Owl', false])
	assert.equal((await (await validate(e, a.token)).json()).user_name, 'Night Owl')
	p = await (await profileOf(e, a.token, {display_name: ''})).json()
	assert.equal(p.name, 'listener-' + key.slice(0, 6))
	# A site (XivPiano) account: off by default; its token cannot change the settings.
	const site = siteAccount(e, 'x1')
	assert.equal((await (await profileOf(e, site.token)).json()).leaderboard, false)
	assert.equal((await profileOf(e, site.token, {leaderboard: true})).status, 403)
)

test('recent listens: token-only, newest first, at most limit, art kept only as https', do
	const e = env()
	const a = await provisionToken(e, who)
	const t0 = Math.floor(Date.now() / 1000) - 1000
	for i in [0 ... 20]
		const body = {listen_type: 'single', payload: [{listened_at: t0 + i, track_metadata: {artist_name: 'Artist', track_name: 'Song ' + i, release_name: 'Album', additional_info: {duration_ms: 200000, art_url: 'https://content-images.p-cdn.com/x' + i + '.jpg'}}}]}
		const r = await call(e, '/scrobble/1/submit-listens', {method: 'POST', headers: {authorization: 'Token ' + a.token, 'content-type': 'application/json'}, body: JSON.stringify(body)})
		assert.equal(r.status, 200)
	const bad = {listen_type: 'single', payload: [{listened_at: t0, track_metadata: {artist_name: 'A', track_name: 'B', additional_info: {art_url: 'http://insecure.example/x.jpg'}}}]}
	assert.equal((await call(e, '/scrobble/1/submit-listens', {method: 'POST', headers: {authorization: 'Token ' + a.token, 'content-type': 'application/json'}, body: JSON.stringify(bad)})).status, 400)
	const r = await (await call(e, '/scrobble/1/user/recent?limit=15', {headers: {authorization: 'Token ' + a.token}})).json()
	assert.equal(r.listens.length, 15)
	assert.deepEqual(r.listens[0], {listened_at: t0 + 19, artist: 'Artist', title: 'Song 19', album: 'Album', duration_ms: 200000, art: 'https://content-images.p-cdn.com/x19.jpg'})
	assert.equal((await call(e, '/scrobble/1/user/recent')).status, 401)
	assert.equal((await call(e, '/mods/ffxiv/scrobble/1/user/recent?limit=500', {headers: {authorization: 'Token ' + a.token}})).status, 400)
)

test('leaderboards: only opted-in accounts count; listeners by name or handle only; windows', do
	const e = env()
	const a = await provisionToken(e, who)
	const b = await provisionToken(e, {provider: 'spacegho.st', subject: OTHER})
	await profileOf(e, b.token, {display_name: 'Bee'})
	const site = siteAccount(e, 'x2')
	const now = Math.floor(Date.now() / 1000)
	const send = do(token, track, artist, at)
		const body = {listen_type: 'single', payload: [{listened_at: at, track_metadata: {artist_name: artist, track_name: track}}]}
		return await call(e, '/scrobble/1/submit-listens', {method: 'POST', headers: {authorization: 'Token ' + token, 'content-type': 'application/json'}, body: JSON.stringify(body)})
	await send(a.token, 'Hit', 'Band', now - 10)
	await send(a.token, 'Hit', 'Band', now - 20)
	await send(b.token, 'hit', 'band', now - 30)
	await send(b.token, 'Old', 'Band', now - 40 * 86400)
	assert.equal((await send(site.token, 'Secret', 'Private', now - 5)).status, 200)
	const week = await (await call(e, '/scrobble/1/leaderboard?window=7d')).json()
	assert.deepEqual(week.songs.map(do(s) [s.title.toLowerCase(), s.listens]), [['hit', 3]])
	assert.deepEqual(week.artists.map(do(s) s.listens), [3])
	const key = createHash('sha256').update('spacegho.st:' + SUBJECT).digest('hex')
	assert.deepEqual(week.listeners, [{name: 'listener-' + key.slice(0, 6), listens: 2}, {name: 'Bee', listens: 1}])
	assert.ok(!JSON.stringify(week).includes('Secret'), 'an account that did not opt in is not counted')
	assert.ok(!JSON.stringify(week).includes(SUBJECT))
	const all = await (await call(e, '/mods/ffxiv/scrobble/1/leaderboard?window=all')).json()
	assert.equal(all.listeners.find(do(l) l.name === 'Bee').listens, 2)
	assert.equal((await call(e, '/scrobble/1/leaderboard?window=year')).status, 400)
	const page = await call(e, '/scrobble/leaderboard?window=7d')
	assert.equal(page.status, 200)
	const html = await page.text()
	assert.ok(html.includes('Top listeners') && html.includes('Bee') && !html.includes('Secret'))
	assert.equal((await call(e, '/mods/ffxiv/scrobble/leaderboard')).status, 200)
)

test('spacegho.st/scrobble: redirect, API alias, static dashboard through ASSETS', do
	const e = env()
	const seen = []
	e.ASSETS = {fetch: do(req)
		seen.push(new URL(req.url).pathname)
		return new Response('dashboard')
	}
	const r = await call(e, '/scrobble')
	assert.equal(r.status, 301)
	assert.equal(r.headers.get('location'), '/scrobble/')
	assert.equal(await (await call(e, '/scrobble/')).text(), 'dashboard')
	await call(e, '/scrobble/listen/')
	assert.deepEqual(seen, ['/mods/ffxiv/scrobble/', '/mods/ffxiv/scrobble/listen/'])
	assert.equal((await call(e, '/scrobble/1/validate-token')).status, 401)
	assert.equal((await call(e, '/scrobble/1/nope')).status, 404)
)

test('dashboard profile: external session and site session both use the browser action', do
	const e = env()
	await provisionToken(e, who)
	const t = new URL((await issueTicket(e, who)).url)
	const cookie = (await call(e, t.pathname + t.search)).headers.get('set-cookie').split(';')[0]
	const h = {cookie: cookie, origin: ORIGIN, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json'}
	const r = await call(e, '/mods/ffxiv/term/vote/api/scrobble/profile', {method: 'POST', headers: h, body: JSON.stringify({display_name: 'Owl', leaderboard: false})})
	assert.equal(r.status, 200)
	const st = await (await call(e, '/mods/ffxiv/term/vote/api/scrobble/state', {headers: {cookie: cookie, 'sec-fetch-site': 'same-origin'}})).json()
	assert.equal(st.user_name, 'Owl')
	assert.equal(st.profile.leaderboard, false)
)
