# Sign-in end to end through the API handler with a scripted fetch standing in for
# GitHub and XIVAuth: start, callback, the anonymous-ballot claim, link, me, logout,
# forget, and the owner-only voter list. The provider response shapes used here come
# from their docs and source, not from live calls.
import { test } from 'node:test'

import assert from 'node:assert/strict'

import { BASE, COOKIE_NAME, voterKey } from '../src/lib.js'

import { PROVIDER, claimStatements, pickCharacter, safeImageUrl } from '../src/auth.js'

import { ADMIN_SESSION_MAX_AGE_S, SESSION_COOKIE, SESSION_MAX_AGE_S, SESSION_RENEW_S, STATE_COOKIE, readSession, signValue } from '../src/session.js'

import { createD1 } from './d1-shim.js'

import { API, LEGACY_SEED, MIGRATIONS, ORIGIN, SECRETS, SEED, allTallies, jsonResponse, keyOfCookie, scriptedFetch, setCookies, setup, sha256hex, talliesMatchVotes } from './harness.js'

const PAGE = ((ORIGIN + BASE) + '/')

const XIV_USER = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'

const PORTRAIT = 'https://img2.finalfantasyxiv.com/f/0123abcd_4567ef01fl0_640x873.jpg?1726000000'

const CHARACTER = {persistent_key: 'pk', lodestone_id: '12345678', name: 'Wyn Ghostty', home_world: 'Gilgamesh', data_center: 'Aether', avatar_url: 'https://img2.finalfantasyxiv.com/f/0123abcd_4567ef01fc0_96x96.jpg', portrait_url: PORTRAIT, created_at: '2026-01-01T00:00:00Z', verified_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z'}

def providers({githubId: githubId = 251370, githubToken: githubToken = {access_token: 'ghu_testtoken', token_type: 'bearer'}, xivUser: xivUser = {id: XIV_USER, display_name: 'Wyn'}, characters: characters = [CHARACTER], fail: fail = {}} = {})
	return scriptedFetch(
		(do(url)
			if fail[url]
				return fail[url]()
			switch url
				when PROVIDER.github.token
					return jsonResponse(githubToken)
				when PROVIDER.github.user
					return jsonResponse({login: 'Spaceghost', id: githubId, name: 'Jack', avatar_url: 'x'})
				when PROVIDER.xivauth.token
					return jsonResponse({access_token: 'xiv-token', token_type: 'Bearer', expires_in: 7200, scope: 'user', created_at: 1})
				when PROVIDER.xivauth.user
					return jsonResponse(xivUser)
				when PROVIDER.xivauth.characters
					return jsonResponse(characters)
				else
					throw new Error(('unexpected fetch ' + url))
			return
		)
	)
	return

def signIn(t, provider, {cookie: cookie = '', mode: mode = 'start', query: query, returnTo: returnTo, callbackCookie: callbackCookie} = {})
	const start = (await t.call(((API + ('auth/' + String(provider) + '/' + String(mode) + '')) + (returnTo ? ('?return=' + encodeURIComponent(returnTo)) : '')), {cookie: cookie, headers: {'sec-fetch-site': 'same-origin'}}))
	assert.equal(start.status, 303)
	const location = new URL(start.headers.get('location'))
	const stateSet = setCookies(start)[STATE_COOKIE]
	if (! stateSet)
		return {start: start, location: location}
	const state = location.searchParams.get('state')
	const jar = [cookie, ('' + String(STATE_COOKIE) + '=' + String(stateSet.value) + '')].filter(Boolean).join('; ')
	const params = (query ?? {code: 'the-code', state: state})
	const callback = (await t.call(((API + ('auth/' + String(provider) + '/callback?')) + new URLSearchParams(params)), {cookie: (callbackCookie ?? jar), headers: {'sec-fetch-site': 'cross-site'}}))
	return {start: start, location: location, state: state, stateSet: stateSet, callback: callback, set: setCookies(callback)}
	return

const fragment = (do(res)
	return new URL(res.headers.get('location')).hash
)

test(
	'GitHub: start redirects with state and PKCE; callback signs in and drops the token',
	(do()
		const t = setup()
		const p = providers()
		t.useFetch(p.fetcher)
		const {start: start, location: location, stateSet: stateSet, callback: callback, set: set} = (await signIn(t, 'github', {returnTo: (BASE + '/?since=1')}))
		assert.equal((location.origin + location.pathname), PROVIDER.github.authorize)
		const q = Object.fromEntries(location.searchParams)
		assert.deepEqual(Object.keys(q).sort(), ['client_id', 'code_challenge', 'code_challenge_method', 'redirect_uri', 'state'])
		assert.equal(q.client_id, 'Iv23liYsdX6oOuO47ulv')
		assert.equal(q.redirect_uri, ((ORIGIN + BASE) + '/api/auth/github/callback'))
		assert.equal(q.code_challenge_method, 'S256')
		assert.match(q.state, new RegExp('^[A-Za-z0-9_-]{43}$', ''))
		assert.equal(start.headers.get('cache-control'), 'no-store')
		assert.equal(start.headers.get('referrer-policy'), 'no-referrer')
		assert.ok(((stateSet.attrs.includes('HttpOnly') && stateSet.attrs.includes('Secure')) && stateSet.attrs.includes('SameSite=Lax')))
		assert.equal(p.calls.length, 2)
		const [tokenCall, userCall] = p.calls
		assert.equal(tokenCall.url, PROVIDER.github.token)
		assert.equal(tokenCall.method, 'POST')
		assert.equal(tokenCall.headers.get('accept'), 'application/json')
		assert.equal(tokenCall.headers.get('content-type'), 'application/x-www-form-urlencoded')
		assert.ok(tokenCall.headers.get('user-agent'))
		const form = Object.fromEntries(new URLSearchParams(tokenCall.body))
		assert.deepEqual(Object.keys(form).sort(), ['client_id', 'client_secret', 'code', 'code_verifier', 'redirect_uri'])
		assert.equal(form.client_secret, SECRETS.GITHUB_CLIENT_SECRET)
		assert.equal(form.code, 'the-code')
		assert.equal(form.redirect_uri, q.redirect_uri)
		assert.equal(sha256b64url(form.code_verifier), q.code_challenge)
		assert.equal(userCall.url, 'https://api.github.com/user')
		assert.equal(userCall.headers.get('authorization'), 'Bearer ghu_testtoken')
		assert.equal(userCall.headers.get('accept'), 'application/vnd.github+json')
		assert.match(userCall.headers.get('user-agent'), new RegExp('ghostty-vote', ''))
		assert.equal(callback.status, 303)
		assert.equal(callback.headers.get('location'), (PAGE + '?since=1#signed-in'))
		assert.equal(set[STATE_COOKIE].value, '', 'state cookie cleared')
		assert.ok(set[STATE_COOKIE].attrs.includes('Max-Age=0'))
		const session = set[SESSION_COOKIE]
		assert.ok((((session.attrs.includes(('Path=' + String(BASE) + '')) && session.attrs.includes('HttpOnly')) && session.attrs.includes('Secure')) && session.attrs.includes('SameSite=Lax')))
		assert.equal(keyOfCookie(('' + String(SESSION_COOKIE) + '=' + String(session.value) + '')), sha256hex('github:251370'))
		assert.ok((! Reflect.has(set, COOKIE_NAME)), 'no anonymous cookie to clear')
		assert.equal(t.env.DB.stats.calls, 0, 'a GitHub sign-in without an old ballot never touches D1')
		assert.ok(((! session.value.includes('ghu_')) && (! Buffer.from(session.value.split('.')[1], 'base64url').toString().includes('ghu_'))), 'token not in the cookie')
		const cookie = ('' + String(SESSION_COOKIE) + '=' + String(session.value) + '')
		assert.equal((await t.vote({idea_id: 'ops-weather', vote: 'want'}, {cookie: cookie})).status, 200)
		const me = (await (await t.call((API + 'auth/me'), {cookie: cookie})).json())
		assert.deepEqual(me, {signed_in: true, provider: 'github', character: null, admin: true})
		return
	)
)

def sha256b64url(text)
	return Buffer.from(sha256hex(text), 'hex').toString('base64url')
	return

test(
	'callback refuses bad state, missing or foreign state cookies, denials and bad codes without calling out',
	(do()
		const t = setup()
		const p = providers()
		t.useFetch(p.fetcher)
		const expectError = (do(res, code)
			assert.equal(res.status, 303)
			assert.equal(fragment(res), ('#auth-error=' + code))
			assert.ok(new URL(res.headers.get('location')).href.startsWith(PAGE), 'always back to the vote page')
			const set = setCookies(res)
			assert.ok((! Reflect.has(set, SESSION_COOKIE)), 'no session')
			assert.equal(
				(do()
					let cursor$1 = set
					let cursor$2 = undefined
					cursor$2 = cursor$1
					cursor$1 = cursor$1[STATE_COOKIE]
					if cursor$1 == null
						return undefined
					cursor$2 = cursor$1
					cursor$1 = cursor$1.value
					return cursor$1
				)(),
				'',
				'state cleared'
			)
			return await undefined
		)
		let r = (await signIn(t, 'github', {query: {code: 'c', state: 'not-the-state'}}))
		(await expectError(r.callback, 'state'))
		(r = (await signIn(t, 'github', {query: {code: 'c'}})))
		(await expectError(r.callback, 'state'))
		(r = (await signIn(t, 'github', {query: {error: 'access_denied', state: 'x'}})))
		(await expectError(r.callback, 'denied'))
		(r = (await signIn(t, 'github', {callbackCookie: ''})))
		(await expectError(r.callback, 'expired'))
		(r = (await signIn(t, 'github', {query: {}})))
		const tampered = (r.stateSet.value.slice(0, (- 3)) + (r.stateSet.value.endsWith('AAA') ? 'BBB' : 'AAA'))
		(await expectError((await t.call(((API + 'auth/github/callback?code=c&state=') + r.state), {cookie: ('' + String(STATE_COOKIE) + '=' + String(tampered) + '')})), 'expired'))
		const fresh = (await signIn(t, 'github', {query: {}}))
		(await expectError((await t.call(((API + 'auth/xivauth/callback?code=c&state=') + fresh.state), {cookie: ('' + String(STATE_COOKIE) + '=' + String(fresh.stateSet.value) + '')})), 'expired'))
		const old = (await signValue(SECRETS.SESSION_SECRET, 'oauth', {p: 'github', s: 'st', cv: 'v', m: 'signin', r: (BASE + '/'), exp: (Math.floor((Date.now() / 1000)) - 60)}))
		(await expectError((await t.call((API + 'auth/github/callback?code=c&state=st'), {cookie: ('' + String(STATE_COOKIE) + '=' + String(old) + '')})), 'expired'))
		const long = (await signIn(t, 'github', {query: {}}))
		(await expectError((await t.call(((API + 'auth/github/callback?') + new URLSearchParams({code: 'x'.repeat(600), state: long.state})), {cookie: ('' + String(STATE_COOKIE) + '=' + String(long.stateSet.value) + '')})), 'bad-request'))
		assert.equal(p.calls.length, 0, 'none of them reached GitHub')
		return
	)
)

test(
	'callback: provider failures sign nobody in',
	(do()
		const cases = [['GitHub 200 with {error}', 'github', {githubToken: {error: 'bad_verification_code', error_description: 'The code passed is incorrect or expired.'}}], ['GitHub token 500', 'github', {
			fail: {
				[PROVIDER.github.token]: (do()
					return new Response('oops', {status: 500})
				)
			}
		}], ['GitHub network', 'github', {
			fail: {
				[PROVIDER.github.token]: (do()
					throw new TypeError('network')
					return
				)
			}
		}], ['GitHub user 401', 'github', {
			fail: {
				[PROVIDER.github.user]: (do()
					return jsonResponse({message: 'Bad credentials'}, 401)
				)
			}
		}], ['GitHub user without id', 'github', {githubId: 'nope'}], ['GitHub user HTML', 'github', {
			fail: {
				[PROVIDER.github.user]: (do()
					return new Response('<html>', {status: 200})
				)
			}
		}], ['XIVAuth token 400', 'xivauth', {
			fail: {
				[PROVIDER.xivauth.token]: (do()
					return jsonResponse({error: 'invalid_grant'}, 400)
				)
			}
		}], ['XIVAuth user without id', 'xivauth', {xivUser: {display_name: 'x'}}], ['XIVAuth user with odd id', 'xivauth', {xivUser: {id: '../../x'}}]]
		const logged = []
		const original = console.error
		(console.error = (do(...args)
			return logged.push(args.join(' '))
		))
		try
			for [name, provider, opts] of cases
				const t = setup()
				t.useFetch(providers(opts).fetcher)
				const {callback: callback, set: set} = (await signIn(t, provider))
				assert.equal(fragment(callback), '#auth-error=provider', name)
				assert.ok((! Reflect.has(set, SESSION_COOKIE)), name)
				assert.equal(t.env.DB.raw.prepare('SELECT COUNT(*) AS n FROM characters').get().n, 0)
		finally
			(console.error = original)
		assert.ok((logged.length >= cases.length))
		for line of logged
			assert.ok((! new RegExp('ghu_|xiv-token|the-code|secret', 'i').test(line)), ('logs carry no codes, tokens or secrets: ' + line))
		return
	)
)

test(
	'XIVAuth: sign-in asks for `user` only, reads no character and signs in as xivauth:<user id>',
	(do()
		const t = setup()
		const p = providers(
			{
				characters: []
				fail: {
					[PROVIDER.xivauth.characters]: (do()
						return jsonResponse({error: 'forbidden'}, 403)
					)
				}
			}
		)
		t.useFetch(p.fetcher)
		const {location: location, callback: callback, set: set} = (await signIn(t, 'xivauth'))
		const q = Object.fromEntries(location.searchParams)
		assert.equal((location.origin + location.pathname), 'https://xivauth.net/oauth/authorize')
		assert.equal(q.response_type, 'code')
		assert.equal(q.scope, 'user')
		assert.equal(q.client_id, '3yHMau3T_wNUzny9QQDeiSS9wRl6BjNKIN5IpHxzQyU')
		assert.equal(q.redirect_uri, ((ORIGIN + BASE) + '/api/auth/xivauth/callback'))
		assert.equal(q.code_challenge_method, 'S256')
		assert.deepEqual(
			p.calls.map(
				(do(c)
					return c.url
				)
			),
			[PROVIDER.xivauth.token, PROVIDER.xivauth.user],
			'no character lookup on sign-in'
		)
		const [tokenCall, userCall] = p.calls
		const form = Object.fromEntries(new URLSearchParams(tokenCall.body))
		assert.equal(form.grant_type, 'authorization_code')
		assert.equal(form.client_id, q.client_id)
		assert.equal(form.client_secret, SECRETS.XIVAUTH_CLIENT_SECRET)
		assert.equal(form.redirect_uri, q.redirect_uri)
		assert.equal(sha256b64url(form.code_verifier), q.code_challenge)
		assert.equal(userCall.headers.get('authorization'), 'Bearer xiv-token')
		assert.equal(userCall.headers.get('accept'), 'application/json')
		assert.equal(fragment(callback), '#signed-in')
		const cookie = ('' + String(SESSION_COOKIE) + '=' + String(set[SESSION_COOKIE].value) + '')
		assert.equal(keyOfCookie(cookie), sha256hex(('xivauth:' + XIV_USER)))
		assert.equal(t.env.DB.stats.calls, 0, 'an XIVAuth sign-in without an old ballot never touches D1')
		assert.equal(t.env.DB.raw.prepare('SELECT COUNT(*) AS n FROM characters').get().n, 0)
		assert.ok((! Buffer.from(set[SESSION_COOKIE].value.split('.')[1], 'base64url').toString().includes(XIV_USER)), 'no user id in the cookie')
		const me = (await t.call((API + 'auth/me'), {cookie: cookie}))
		assert.deepEqual((await me.json()), {signed_in: true, provider: 'xivauth', character: null, admin: false})
		assert.equal((await t.vote({idea_id: 'ops-weather', vote: 'want'}, {cookie: cookie})).status, 200)
		return
	)
)

test(
	'character data is reduced and checked before it is stored',
	(do()
		assert.equal(safeImageUrl(PORTRAIT), PORTRAIT)
		assert.equal(safeImageUrl('https://lds-img.finalfantasyxiv.com/h/x.png'), 'https://lds-img.finalfantasyxiv.com/h/x.png')
		for bad of ['http://img2.finalfantasyxiv.com/f/x.jpg', 'https://evil.example/x.jpg', 'https://finalfantasyxiv.com.evil.example/x.jpg', 'https://user:pw@img2.finalfantasyxiv.com/x.jpg', 'https://img2.finalfantasyxiv.com:8443/x.jpg', 'javascript:alert(1)', 'x'.repeat(600), null]
			assert.equal(safeImageUrl(bad), '', String(bad))
		assert.equal(pickCharacter([]), null)
		assert.equal(pickCharacter({}), null)
		assert.deepEqual(pickCharacter([null, {lodestone_id: 'abc', name: 'x'}, {lodestone_id: 42, name: '  A‮B  ', home_world: 'W'.repeat(40), portrait_url: 'https://evil.example/p.jpg'}]), {lodestone_id: '42', name: 'AB', world: 'W'.repeat(32), portrait_url: ''})
		assert.equal(pickCharacter([{lodestone_id: '1', name: 'n'.repeat(65)}]), null)
		return
	)
)

test(
	'link: a GitHub voter attaches a character with a character-only XIVAuth authorization',
	(do()
		const t = setup()
		const p = providers()
		t.useFetch(p.fetcher)
		const github = (await t.signedIn('github', '777'))
		const {location: location, callback: callback, set: set} = (await signIn(t, 'xivauth', {mode: 'link', cookie: github}))
		assert.equal(location.searchParams.get('scope'), 'character')
		assert.equal(location.searchParams.get('redirect_uri'), ((ORIGIN + BASE) + '/api/auth/xivauth/callback'))
		assert.equal(fragment(callback), '#character-linked')
		assert.ok((! Reflect.has(set, SESSION_COOKIE)), 'the GitHub session is unchanged')
		assert.deepEqual(
			p.calls.map(
				(do(c)
					return c.url
				)
			),
			[PROVIDER.xivauth.token, PROVIDER.xivauth.characters],
			'no user lookup for a link'
		)
		assert.equal(p.calls[1].headers.get('authorization'), 'Bearer xiv-token')
		assert.equal(p.calls[1].headers.get('accept'), 'application/json')
		const row = {...t.env.DB.raw.prepare('SELECT * FROM characters').get()}
		assert.ok(((row.first_seen > 0) && (row.first_seen === row.last_seen)))
		assert.deepEqual({...row, first_seen: 0, last_seen: 0}, {voter: sha256hex('github:777'), lodestone_id: '12345678', name: 'Wyn Ghostty', world: 'Gilgamesh', portrait_url: PORTRAIT, first_seen: 0, last_seen: 0})
		const me = (await (await t.call((API + 'auth/me'), {cookie: github})).json())
		assert.equal(me.provider, 'github')
		assert.equal(me.character.name, 'Wyn Ghostty')
		const again = (await signIn(t, 'xivauth', {mode: 'link', cookie: github, query: {}}))
		for intruder of [(await t.signedIn('github', '888')), (await t.signedIn('xivauth', XIV_USER))]
			const res = (await t.call(((API + 'auth/xivauth/callback?code=c&state=') + again.state), {cookie: ('' + String(intruder) + '; ' + String(STATE_COOKIE) + '=' + String(again.stateSet.value) + '')}))
			assert.equal(fragment(res), '#auth-error=sign-in-first')
		const res = (await t.call(((API + 'auth/xivauth/callback?code=c&state=') + again.state), {cookie: ('' + String(STATE_COOKIE) + '=' + String(again.stateSet.value) + '')}))
		assert.equal(fragment(res), '#auth-error=sign-in-first', 'signed out meanwhile')
		assert.equal(t.env.DB.raw.prepare('SELECT COUNT(*) AS n FROM characters').get().n, 1, 'nothing linked to the intruders')
		const start = (await signIn(t, 'xivauth', {mode: 'link'}))
		assert.equal(start.location.hash, '#auth-error=sign-in-first')
		assert.ok((! setCookies(start.start)[STATE_COOKIE]))
		t.useFetch(providers({characters: []}).fetcher)
		const empty = (await signIn(t, 'xivauth', {mode: 'link', cookie: (await t.signedIn('github', '999'))}))
		assert.equal(fragment(empty.callback), '#auth-error=no-character')
		assert.equal(t.env.DB.raw.prepare('SELECT COUNT(*) AS n FROM characters').get().n, 1)
		return
	)
)

test(
	'link: an FFXIV voter can link a character after signing in; relinking keeps or restarts first_seen',
	(do()
		const t = setup()
		t.useFetch(providers().fetcher)
		const {set: set} = (await signIn(t, 'xivauth'))
		const cookie = ('' + String(SESSION_COOKIE) + '=' + String(set[SESSION_COOKIE].value) + '')
		const key = sha256hex(('xivauth:' + XIV_USER))
		const p = providers()
		t.useFetch(p.fetcher)
		const link = (await signIn(t, 'xivauth', {mode: 'link', cookie: cookie}))
		assert.equal(link.location.searchParams.get('scope'), 'character')
		assert.equal(fragment(link.callback), '#character-linked')
		assert.ok((! Reflect.has(link.set, SESSION_COOKIE)), 'the FFXIV session is unchanged')
		assert.deepEqual(
			p.calls.map(
				(do(c)
					return c.url
				)
			),
			[PROVIDER.xivauth.token, PROVIDER.xivauth.characters]
		)
		assert.equal(t.env.DB.raw.prepare('SELECT voter FROM characters').get().voter, key)
		const dump = (JSON.stringify(t.env.DB.raw.prepare('SELECT * FROM characters').all()) + JSON.stringify(t.env.DB.raw.prepare('SELECT * FROM votes').all()))
		assert.ok(((! dump.includes(XIV_USER)) && (! dump.includes('xiv-token'))), 'neither the XIVAuth user id nor the token is stored')
		const calls = t.env.DB.stats.calls
		const me = (await t.call((API + 'auth/me'), {cookie: cookie}))
		assert.equal((t.env.DB.stats.calls - calls), 1)
		assert.equal(me.headers.get('cache-control'), 'private, no-store')
		assert.deepEqual((await me.json()), {signed_in: true, provider: 'xivauth', character: {name: 'Wyn Ghostty', world: 'Gilgamesh', portrait_url: PORTRAIT}, admin: false})
		t.env.DB.raw.exec('UPDATE characters SET first_seen = 5, last_seen = 5')
		(await signIn(t, 'xivauth'))
		assert.deepEqual({...t.env.DB.raw.prepare('SELECT first_seen, last_seen FROM characters').get()}, {first_seen: 5, last_seen: 5})
		(await signIn(t, 'xivauth', {mode: 'link', cookie: cookie}))
		let again = t.env.DB.raw.prepare('SELECT first_seen, last_seen FROM characters').get()
		assert.equal(again.first_seen, 5)
		assert.ok((again.last_seen > 5))
		t.useFetch(providers({characters: [{...CHARACTER, lodestone_id: '87654321', name: 'Other Alt', home_world: 'Ravana'}]}).fetcher)
		(await signIn(t, 'xivauth', {mode: 'link', cookie: cookie}))
		(again = t.env.DB.raw.prepare('SELECT lodestone_id, name, world, first_seen FROM characters').get())
		assert.deepEqual({...again, first_seen: (again.first_seen > 5)}, {lodestone_id: '87654321', name: 'Other Alt', world: 'Ravana', first_seen: true})
		assert.equal(t.env.DB.raw.prepare('SELECT COUNT(*) AS n FROM characters').get().n, 1, 'one character per voter')
		t.useFetch(
			providers(
				{
					fail: {
						[PROVIDER.xivauth.characters]: (do()
							return jsonResponse({error: 'forbidden'}, 403)
						)
					}
				}
			).fetcher
		)
		const original = console.error
		(console.error = (do()
			undefined
			return
		))
		try
			const failed = (await signIn(t, 'xivauth', {mode: 'link', cookie: cookie}))
			assert.equal(fragment(failed.callback), '#auth-error=provider')
		finally
			(console.error = original)
		assert.equal(t.env.DB.raw.prepare('SELECT name FROM characters').get().name, 'Other Alt')
		return
	)
)

test(
	'claim: signing in moves the anonymous ballot onto the account, account rows win, tallies stay exact',
	(do()
		const t = setup()
		t.useFetch(providers().fetcher)
		const db = t.env.DB.raw
		const token = 'T'.repeat(43)
		const anon = (await voterKey(token))
		const account = sha256hex('github:251370')
		const [a, b, c, d] = db.prepare('SELECT id FROM ideas WHERE mod = \'ghostty\' ORDER BY sort_order LIMIT 4').all().map(
			(do(r)
				return r.id
			)
		)
		const insert = db.prepare('INSERT INTO votes (voter, idea_id, vote, note, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?)')
		insert.run(anon, a, 'want', 'anon note on a', 10)
		insert.run(anon, b, 'skip', 'anon note on b', 11)
		insert.run(anon, c, '', 'note only', 12)
		insert.run(account, b, 'maybe', '', 20)
		insert.run(account, d, 'want', 'account only', 21)
		insert.run('e'.repeat(64), a, 'want', '', 30)
		db.prepare('INSERT INTO suggestions (voter, title, detail, created_at) VALUES (?, ?, ?, ?)').run(anon, 'anon idea', '', 5)
		db.prepare('INSERT INTO write_log (voter, at) VALUES (?, ?)').run(anon, Date.now())
		talliesMatchVotes(db)
		const tally = (do(id)
			return {...db.prepare('SELECT want, maybe, skip FROM ideas WHERE id = ?').get(id)}
		)
		assert.deepEqual([tally(a), tally(b)], [{want: 2, maybe: 0, skip: 0}, {want: 0, maybe: 1, skip: 1}])
		const calls = t.env.DB.stats.calls
		const {callback: callback, set: set} = (await signIn(t, 'github', {cookie: ('' + String(COOKIE_NAME) + '=' + String(token) + '')}))
		assert.equal(fragment(callback), '#signed-in')
		assert.equal((t.env.DB.stats.calls - calls), 1, 'the claim is one D1 batch')
		assert.equal(set[COOKIE_NAME].value, '', 'the anonymous cookie is cleared')
		assert.ok((set[COOKIE_NAME].attrs.includes('Max-Age=0') && set[COOKIE_NAME].attrs.includes(('Path=' + String(BASE) + ''))))
		const rows = (do(voter)
			return db.prepare('SELECT idea_id, vote, note FROM votes WHERE voter = ? ORDER BY idea_id').all(voter).map(
				(do(r)
					return {...r}
				)
			)
		)
		assert.deepEqual(rows(anon), [], 'nothing left under the anonymous key')
		assert.deepEqual(
			rows(account),
			[{idea_id: a, vote: 'want', note: 'anon note on a'}, {idea_id: b, vote: 'maybe', note: 'anon note on b'}, {idea_id: c, vote: '', note: 'note only'}, {idea_id: d, vote: 'want', note: 'account only'}].sort(
				(do(x, y)
					return ((x.idea_id < y.idea_id) ? (- 1) : 1)
				)
			)
		)
		assert.deepEqual(tally(a), {want: 2, maybe: 0, skip: 0}, 'a moved vote still counts once')
		assert.deepEqual(tally(b), {want: 0, maybe: 1, skip: 0}, 'the losing anonymous vote left b\'s tally')
		talliesMatchVotes(db)
		assert.equal(db.prepare('SELECT voter FROM suggestions').get().voter, account)
		assert.equal(db.prepare('SELECT COUNT(*) AS n FROM write_log WHERE voter = ?').get(account).n, 1)
		const cookie = ('' + String(SESSION_COOKIE) + '=' + String(set[SESSION_COOKIE].value) + '')
		const mine = (await (await t.mine({cookie: cookie})).json())
		assert.deepEqual(Object.keys(mine.votes).sort(), [a, b, c, d].sort())
		assert.deepEqual(
			mine.suggestions.map(
				(do(s)
					return s.title
				)
			),
			['anon idea']
		)
		const before = allTallies(db)
		(await signIn(t, 'github', {cookie: ('' + String(COOKIE_NAME) + '=' + String(token) + '')}))
		assert.deepEqual(allTallies(db), before)
		assert.equal(rows(account).length, 4)
		return
	)
)

test(
	'claim statements on their own: all-or-nothing, and a no-op for the same key',
	(do()
		const env = {DB: createD1(...MIGRATIONS, SEED)}
		assert.deepEqual(claimStatements(env.DB, 'a'.repeat(64), 'a'.repeat(64)), [])
		assert.equal(claimStatements(env.DB, 'a'.repeat(64), 'b'.repeat(64)).length, 5)
		return
	)
)

test(
	'claim merge: where both rows exist, the account row keeps its vote and note and fills only what is empty',
	(do()
		const t = setup()
		t.useFetch(providers().fetcher)
		const db = t.env.DB.raw
		const token = 'M'.repeat(43)
		const anon = (await voterKey(token))
		const account = sha256hex('github:251370')
		const ids = db.prepare('SELECT id FROM ideas WHERE mod = \'ghostty\' ORDER BY sort_order LIMIT 6').all().map(
			(do(r)
				return r.id
			)
		)
		const insert = db.prepare('INSERT INTO votes (voter, idea_id, vote, note, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?)')
		const cases = [[['', 'mine', 'want', 'theirs'], ['want', 'mine']], [['skip', '', 'maybe', 'theirs'], ['skip', 'theirs']], [['', 'mine', '', 'theirs'], ['', 'mine']], [['maybe', 'mine', 'want', 'theirs'], ['maybe', 'mine']], [['want', '', 'skip', ''], ['want', '']], [['', 'mine', 'skip', ''], ['skip', 'mine']]]
		cases.forEach(
			(do([[av, an, xv, xn]], n)
				insert.run(account, ids[n], av, an, 100)
				insert.run(anon, ids[n], xv, xn, (200 + n))
				insert.run('f'.repeat(64), ids[n], 'want', '', 50)
				return
			)
		)
		talliesMatchVotes(db)
		const calls = t.env.DB.stats.calls
		const {callback: callback} = (await signIn(t, 'github', {cookie: ('' + String(COOKIE_NAME) + '=' + String(token) + '')}))
		assert.equal(fragment(callback), '#signed-in')
		assert.equal((t.env.DB.stats.calls - calls), 1, 'still one D1 batch')
		const row = (do(voter, id)
			return db.prepare('SELECT vote, note, updated_at FROM votes WHERE voter = ? AND idea_id = ?').get(voter, id)
		)
		cases.forEach(
			(do([cursor$3, want], n)
				const r = row(account, ids[n])
				assert.deepEqual([r.vote, r.note], want, ('case ' + String(n) + ''))
				const filled = ((r.vote !== cases[n][0][0]) || (r.note !== cases[n][0][1]))
				assert.equal(r.updated_at, (filled ? (200 + n) : 100), ('case ' + String(n) + ' updated_at'))
				assert.equal(row(anon, ids[n]), undefined, ('case ' + String(n) + ': anonymous row deleted'))
				return
			)
		)
		talliesMatchVotes(db)
		const tally = (do(id)
			return {...db.prepare('SELECT want, maybe, skip FROM ideas WHERE id = ?').get(id)}
		)
		assert.deepEqual(tally(ids[0]), {want: 2, maybe: 0, skip: 0}, 'the filled vote counts once, the bystander once')
		assert.deepEqual(tally(ids[3]), {want: 1, maybe: 1, skip: 0}, 'the losing anonymous \'want\' left the tally')
		return
	)
)

test(
	'XIVAuth sign-in with an old anonymous ballot claims it in one batch',
	(do()
		const t = setup()
		t.useFetch(providers().fetcher)
		const token = 'X'.repeat(43)
		const db = t.env.DB.raw
		db.prepare('INSERT INTO votes (voter, idea_id, vote, note, created_at, updated_at) VALUES (?, \'ops-weather\', \'want\', \'\', 1, 1)').run((await voterKey(token)))
		const calls = t.env.DB.stats.calls
		const {set: set} = (await signIn(t, 'xivauth', {cookie: ('' + String(COOKIE_NAME) + '=' + String(token) + '')}))
		assert.equal((t.env.DB.stats.calls - calls), 1)
		const key = sha256hex(('xivauth:' + XIV_USER))
		assert.equal(db.prepare('SELECT voter FROM votes').get().voter, key)
		assert.equal(db.prepare('SELECT COUNT(*) AS n FROM characters').get().n, 0)
		assert.equal(set[COOKIE_NAME].value, '')
		talliesMatchVotes(db)
		return
	)
)

test(
	'start: refuses cross-site starts and missing configuration; return paths stay on the vote page',
	(do()
		const t = setup()
		let res = (await t.call((API + 'auth/github/start'), {headers: {'sec-fetch-site': 'cross-site'}}))
		assert.equal(res.headers.get('location'), (PAGE + '#auth-error=refused'))
		assert.ok((! res.headers.get('set-cookie')))
		(res = (await t.call(((API + 'auth/github/start?return=') + encodeURIComponent('https://evil.example/')), {headers: {'sec-fetch-site': 'none'}})))
		assert.ok(res.headers.get('location').startsWith(PROVIDER.github.authorize))
		t.useFetch(providers().fetcher)
		for evil of ['https://evil.example/', '//evil.example', '/\\evil.example', (BASE + '/api/auth/logout')]
			const {callback: callback} = (await signIn(t, 'github', {returnTo: evil}))
			assert.equal(callback.headers.get('location'), (PAGE + '#signed-in'), evil)
		const admin = (await signIn(t, 'github', {returnTo: (BASE + '/admin/')}))
		assert.equal(admin.callback.headers.get('location'), ((ORIGIN + BASE) + '/admin/#signed-in'))
		for missing of ['SESSION_SECRET', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET']
			const bare = setup({[missing]: undefined})
			const r = (await bare.call((API + 'auth/github/start')))
			assert.equal(r.headers.get('location'), (PAGE + '#auth-error=not-configured'), missing)
		const short = setup({SESSION_SECRET: 'too-short'})
		assert.equal((await short.call((API + 'auth/xivauth/start'))).headers.get('location'), (PAGE + '#auth-error=not-configured'))
		assert.equal((await short.call((API + 'auth/xivauth/callback?code=c&state=s'))).headers.get('location'), (PAGE + '#auth-error=not-configured'))
		return
	)
)

test(
	'me: signed out costs no D1 and reports an old anonymous ballot; sessions near expiry are renewed',
	(do(context)
		# Freeze seconds so asynchronous signing cannot cross the cookie-age assertion.
		context.mock.timers.enable({apis: ['Date'], now: Date.now()})
		const t = setup()
		let res = (await t.call((API + 'auth/me')))
		assert.deepEqual((await res.json()), {signed_in: false, legacy_ballot: false})
		(res = (await t.call((API + 'auth/me'), {cookie: ('' + String(COOKIE_NAME) + '=' + String('A'.repeat(43)) + '')})))
		assert.deepEqual((await res.json()), {signed_in: false, legacy_ballot: true})
		assert.equal(res.headers.get('cache-control'), 'private, no-store')
		assert.equal(t.env.DB.stats.calls, 0)
		assert.equal((await t.call((API + 'auth/me'), {headers: {'sec-fetch-site': 'cross-site'}})).status, 403)
		const fresh = (await t.signedIn())
		(res = (await t.call((API + 'auth/me'), {cookie: fresh})))
		assert.equal(res.headers.get('set-cookie'), null, 'a fresh session is not re-issued')
		const k = sha256hex('github:5')
		const now = Math.floor((Date.now() / 1000))
		const DAY = (24 * 3600)
		const session = (do(payload)
			return signValue(SECRETS.SESSION_SECRET, 'session', {p: 'github', k: k, ...payload}).then(
				(do(v)
					return ('' + String(SESSION_COOKIE) + '=' + String(v) + '')
				)
			)
		)
		const read = (do(value)
			return readSession(new Request(ORIGIN, {headers: {cookie: ('' + String(SESSION_COOKIE) + '=' + String(value) + '')}}), t.env)
		)
		const iat = (now - (20 * DAY))
		(res = (await t.call((API + 'auth/me'), {cookie: (await session({iat: iat, exp: ((now + SESSION_RENEW_S) - 60)}))})))
		const renewed = setCookies(res)[SESSION_COOKIE]
		assert.ok(renewed, 'renewed')
		const s = (await read(renewed.value))
		assert.equal(s.k, k)
		assert.equal(s.iat, iat, 'renewal copies iat')
		assert.ok((s.exp > (now + SESSION_RENEW_S)))
		const old = ((now - SESSION_MAX_AGE_S) + (5 * DAY))
		(res = (await t.call((API + 'auth/me'), {cookie: (await session({iat: old, exp: (now + DAY)}))})))
		const capped = (await read(setCookies(res)[SESSION_COOKIE].value))
		assert.deepEqual([capped.iat, capped.exp], [old, (old + SESSION_MAX_AGE_S)])
		assert.ok(setCookies(res)[SESSION_COOKIE].attrs.includes(('Max-Age=' + String(((old + SESSION_MAX_AGE_S) - now)) + '')))
		(res = (await t.call((API + 'auth/me'), {cookie: (await session({iat: old, exp: (old + SESSION_MAX_AGE_S)}))})))
		assert.equal((await res.json()).signed_in, true)
		assert.equal(res.headers.get('set-cookie'), null, 'no renewal past the maximum age')
		(res = (await t.call((API + 'auth/me'), {cookie: (await session({iat: ((now - SESSION_MAX_AGE_S) - 1), exp: (now + DAY)}))})))
		assert.deepEqual((await res.json()), {signed_in: false, legacy_ballot: false})
		assert.equal(res.headers.get('set-cookie'), null)
		assert.equal((await t.vote({idea_id: 'ops-weather', vote: 'want'}, {cookie: (await session({iat: ((now - SESSION_MAX_AGE_S) - 1), exp: (now + DAY)}))})).status, 401)
		const owner = sha256hex('github:251370')
		const adminSession = (do(payload)
			return signValue(SECRETS.SESSION_SECRET, 'session', {p: 'github', k: owner, ...payload}).then(
				(do(v)
					return ('' + String(SESSION_COOKIE) + '=' + String(v) + '')
				)
			)
		)
		(res = (await t.call((API + 'auth/me'), {cookie: (await adminSession({iat: ((now - ADMIN_SESSION_MAX_AGE_S) - 1), exp: (now + DAY)}))})))
		assert.equal((await res.json()).signed_in, false, 'admin sessions end after 14 days')
		(res = (await t.call((API + 'auth/me'), {cookie: (await adminSession({iat: (now - (13 * DAY)), exp: (now + (DAY / 2))}))})))
		assert.equal((await res.json()).admin, true)
		const adminRenewed = (await read(setCookies(res)[SESSION_COOKIE].value))
		assert.equal(adminRenewed.exp, ((now - (13 * DAY)) + ADMIN_SESSION_MAX_AGE_S), 'an admin renewal stops at 14 days')
		return
	)
)

test(
	'logout clears the session cookie (same-origin POST only); forget deletes the character and keeps the votes',
	(do()
		const t = setup()
		t.useFetch(providers().fetcher)
		const {set: set} = (await signIn(t, 'xivauth'))
		const cookie = ('' + String(SESSION_COOKIE) + '=' + String(set[SESSION_COOKIE].value) + '')
		assert.equal(fragment((await signIn(t, 'xivauth', {mode: 'link', cookie: cookie})).callback), '#character-linked')
		assert.equal((await t.vote({idea_id: 'ops-weather', vote: 'want', note: 'keep me'}, {cookie: cookie})).status, 200)
		assert.equal((await t.call((API + 'auth/character/forget'), {method: 'POST', body: {}, cookie: cookie, headers: {origin: 'https://evil.example'}})).status, 403)
		assert.equal((await t.call((API + 'auth/character/forget'), {method: 'POST', body: {}})).status, 401)
		let res = (await t.call((API + 'auth/character/forget'), {method: 'POST', body: {}, cookie: cookie}))
		assert.equal(res.status, 200)
		assert.equal(t.env.DB.raw.prepare('SELECT COUNT(*) AS n FROM characters').get().n, 0)
		assert.equal(t.env.DB.raw.prepare('SELECT note FROM votes').get().note, 'keep me')
		assert.equal((await (await t.call((API + 'auth/me'), {cookie: cookie})).json()).character, null)
		(res = (await t.call((API + 'auth/logout'), {method: 'POST', body: {}, cookie: cookie, headers: {origin: 'https://evil.example'}})))
		assert.equal(res.status, 403)
		assert.equal(res.headers.get('set-cookie'), null)
		const calls = t.env.DB.stats.calls
		(res = (await t.call((API + 'auth/logout'), {method: 'POST', body: {}, cookie: cookie})))
		assert.equal(res.status, 200)
		assert.equal(t.env.DB.stats.calls, calls, 'logout never touches D1')
		const cleared = setCookies(res)[SESSION_COOKIE]
		assert.equal(cleared.value, '')
		assert.ok((cleared.attrs.includes('Max-Age=0') && cleared.attrs.includes(('Path=' + String(BASE) + ''))))
		return
	)
)

test(
	'admin/voters: owner only, never cached, with characters, counts, notes and suggestions',
	(do()
		const t = setup()
		const db = t.env.DB.raw
		t.useFetch(providers().fetcher)
		const {set: set} = (await signIn(t, 'xivauth'))
		const player = ('' + String(SESSION_COOKIE) + '=' + String(set[SESSION_COOKIE].value) + '')
		(await signIn(t, 'xivauth', {mode: 'link', cookie: player}))
		const owner = (await t.signedIn('github', '251370'))
		const quiet = (await t.signedIn('github', '31337'))
		const [a, b] = db.prepare('SELECT id FROM ideas WHERE mod = \'ghostty\' ORDER BY sort_order LIMIT 2').all().map(
			(do(r)
				return r.id
			)
		)
		(await t.vote({idea_id: a, vote: 'want', note: 'take my gil'}, {cookie: player}))
		(await t.vote({idea_id: b, vote: 'skip'}, {cookie: player}))
		(await t.call((API + 'suggest'), {method: 'POST', body: {title: 'Chocobo CI', detail: 'kweh'}, cookie: player}))
		(await t.vote({idea_id: a, vote: 'maybe'}, {cookie: quiet}))
		for [cookie, status, error] of [[undefined, 401, 'sign_in_required'], [player, 403, 'forbidden'], [quiet, 403, 'forbidden']]
			const calls = t.env.DB.stats.calls
			const res = (await t.call((API + 'admin/voters'), {cookie: cookie}))
			assert.equal(res.status, status)
			assert.equal(res.headers.get('cache-control'), 'private, no-store')
			const body = (await res.json())
			assert.deepEqual(Object.keys(body).sort(), ['error', 'message'], 'nothing else in a refusal')
			assert.equal(body.error, error)
			assert.equal(t.env.DB.stats.calls, calls, 'refused before D1')
		assert.equal((await t.call((API + 'admin/voters'), {cookie: owner, headers: {'sec-fetch-site': 'cross-site'}})).status, 403)
		const noAdmins = setup({ADMIN_ACCOUNTS: ''})
		assert.equal((await noAdmins.call((API + 'admin/voters'), {cookie: (await noAdmins.signedIn('github', '251370'))})).status, 403)
		const calls = t.env.DB.stats.calls
		const res = (await t.call((API + 'admin/voters'), {cookie: owner}))
		assert.equal(res.status, 200)
		assert.equal((t.env.DB.stats.calls - calls), 1, 'one batch')
		assert.equal(res.headers.get('cache-control'), 'private, no-store')
		const data = (await res.json())
		assert.deepEqual(data.totals, {voters: 2, with_character: 1, notes: 1, suggestions: 1})
		const byKey = Object.fromEntries(
			data.voters.map(
				(do(v)
					return [v.voter, v]
				)
			)
		)
		const p = byKey[sha256hex(('xivauth:' + XIV_USER))]
		assert.deepEqual({want: p.want, maybe: p.maybe, skip: p.skip}, {want: 1, maybe: 0, skip: 1})
		assert.deepEqual({...p.character, first_seen: 0, last_seen: 0}, {lodestone_id: '12345678', name: 'Wyn Ghostty', world: 'Gilgamesh', portrait_url: PORTRAIT, first_seen: 0, last_seen: 0})
		assert.deepEqual(
			p.notes.map(
				(do(n)
					return [n.idea_id, n.vote, n.note]
				)
			),
			[[a, 'want', 'take my gil']]
		)
		assert.ok(p.notes[0].title)
		assert.deepEqual(
			p.suggestions.map(
				(do(s)
					return [s.title, s.detail, s.status]
				)
			),
			[['Chocobo CI', 'kweh', 'new']]
		)
		const q = byKey[sha256hex('github:31337')]
		assert.deepEqual({character: q.character, want: q.want, maybe: q.maybe, notes: q.notes, you: q.you}, {character: null, want: 0, maybe: 1, notes: [], you: false})
		assert.ok((! JSON.stringify(data).includes(XIV_USER)), 'no provider user ids')
		return
	)
)

test(
	'migration 0004 is additive and safe to re-run on a database with 0001-0003 and votes',
	(do()
		const db = createD1(MIGRATIONS[0], MIGRATIONS[1], MIGRATIONS[2], LEGACY_SEED).raw
		db.exec('INSERT INTO votes (voter, idea_id, vote, note, created_at, updated_at) VALUES (\'v\', \'ops-weather\', \'want\', \'n\', 1, 1)')
		const schemaBefore = db.prepare('SELECT type, name, sql FROM sqlite_master ORDER BY name').all().map(
			(do(r)
				return {...r}
			)
		)
		const tallies = allTallies(db)
		db.exec('BEGIN')
		db.exec(MIGRATIONS[3])
		db.exec('COMMIT')
		db.exec(MIGRATIONS[3])
		const schemaAfter = db.prepare('SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE \'%characters%\' ORDER BY name').all().map(
			(do(r)
				return {...r}
			)
		)
		assert.deepEqual(schemaAfter, schemaBefore, 'nothing existing changed')
		assert.deepEqual(allTallies(db), tallies)
		assert.equal(db.prepare('SELECT COUNT(*) AS n FROM votes').get().n, 1)
		const ins = db.prepare('INSERT INTO characters (voter, lodestone_id, name, world, portrait_url, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, 1, 1)')
		ins.run('a'.repeat(64), '1', 'Name', 'World', '')
		assert.throws(
			(do()
				return ins.run('b'.repeat(63), '1', 'Name', 'World', '')
			),
			new RegExp('CHECK', '')
		)
		assert.throws(
			(do()
				return ins.run('b'.repeat(64), '1', '', 'World', '')
			),
			new RegExp('CHECK', '')
		)
		assert.throws(
			(do()
				return ins.run('a'.repeat(64), '2', 'Name', 'World', '')
			),
			new RegExp('UNIQUE|PRIMARY KEY', '')
		)
		return
	)
)
