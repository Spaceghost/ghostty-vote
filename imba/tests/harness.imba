# Shared set-up for the API tests: the real migrations and seed on the D1 shim, a
# stand-in Cache API, sign-in settings, signed sessions and a scripted fetch.
import assert from 'node:assert/strict'

import { createHash, randomBytes } from 'node:crypto'

import { readFileSync } from 'node:fs'

import { handle } from '../src/app.js'

import { BASE, parseCookies } from '../src/lib.js'

import { SESSION_COOKIE, sessionCookie } from '../src/session.js'

import { createD1 } from './d1-shim.js'

export const read = (do(p)
	return readFileSync(new URL(('../' + p), import.meta.url), 'utf8')
)

export const MIGRATIONS = [read('migrations/0001_init.sql'), read('migrations/0002_drop_site_assets.sql'), read('migrations/0003_note_only_votes.sql'), read('migrations/0004_sign_in.sql'), read('migrations/0005_gallery.sql'), read('migrations/0006_almanac.sql'), read('migrations/0007_analytics.sql'), read('migrations/0008_account_gate.sql'), read('migrations/0009_shot_votes.sql'), read('migrations/0010_mod_votes.sql')]

export const SEED = read('seed/seed.sql')

export const LEGACY_SEED = ((do()
	const cat = JSON.parse(read('data/catalogue.json'))
	const q = (do(v)
		return (('\'' + String(v).replaceAll('\'', '\'\'')) + '\'')
	)
	const out = [('INSERT INTO catalogue (id, version) VALUES (1, ' + String(cat.version) + ');')]
	let n = 0
	cat.categories.forEach(
		(do(c, ci)
			out.push(('INSERT INTO categories (name, tagline, sort_order) VALUES (' + String(q(c.name)) + ', ' + String(q((c.tagline || ''))) + ', ' + String(ci) + ');'))
			for i of c.ideas
				out.push(('INSERT INTO ideas (id, category, title, wow, sort_order, added_version) VALUES (' + String(q(i.id)) + ', ' + String(q(c.name)) + ', ' + String(q(i.title)) + ', ' + String(i.wow) + ', ' + String((n++)) + ', ' + String(i.added_version) + ');'))
			return
		)
	)
	return out.join('\n')
	return
)
)()

export const ORIGIN = 'https://spacegho.st'

export const API = (BASE + '/api/')

export const SECRETS = Object.freeze({SESSION_SECRET: 'test-session-secret-0123456789abcdef-0123456789', GITHUB_CLIENT_SECRET: 'test-github-client-secret', XIVAUTH_CLIENT_SECRET: 'test-xivauth-client-secret'})

export const sha256hex = (do(text)
	return createHash('sha256').update(text).digest('hex')
)

export def memoryCache()
	const store = new Map()
	return {
		store: store
		match: (do(req)
			return await (do()
				let cursor$1 = store
				let cursor$2 = undefined
				cursor$2 = cursor$1
				cursor$1 = cursor$1.get
				cursor$1 = Reflect.apply(cursor$1, cursor$2, [req.url])
				cursor$2 = undefined
				if cursor$1 == null
					return undefined
				cursor$2 = cursor$1
				cursor$1 = cursor$1.clone
				cursor$1 = Reflect.apply(cursor$1, cursor$2, [])
				cursor$2 = undefined
				return cursor$1
			)()
			return await undefined
		)
		put: (do(req, res)
			store.set(req.url, res)
			return await undefined
		)
		delete: (do(req)
			return await store.delete(req.url)
			return await undefined
		)
	}
	return

export def memoryKV()
	const store = new Map()
	return {
		store: store
		put: (do(key, value)
			store.set(key, new Uint8Array(value))
			return await undefined
		)
		get: (do(key, opts)
			const v = store.get(key)
			if (! v)
				return await null
			if ((do()
				let cursor$3 = opts
				let cursor$4 = undefined
				if cursor$3 == null
					return undefined
				cursor$4 = cursor$3
				cursor$3 = cursor$3.type
				return cursor$3
			)() !== 'stream')
				throw new Error('only streams are used')
			return await new Blob([v]).stream()
			return await undefined
		)
		delete: (do(key)
			store.delete(key)
			return await undefined
		)
	}
	return

export def scriptedFetch(routes)
	const calls = []
	const fetcher = (do(resource, init = {})
		const url = String(resource)
		calls.push({url: url, method: (init.method || 'GET'), headers: new Headers(init.headers), body: (init.body ? String(init.body) : '')})
		return await routes(url, init)
		return await undefined
	)
	return {fetcher: fetcher, calls: calls}
	return

export const jsonResponse = (do(data, status = 200)
	return new Response(JSON.stringify(data), {status: status, headers: {'content-type': 'application/json'}})
)

export def setup(extraEnv = {})
	const env = {DB: createD1(...MIGRATIONS, SEED), GITHUB_CLIENT_ID: 'Iv23liYsdX6oOuO47ulv', XIVAUTH_CLIENT_ID: '3yHMau3T_wNUzny9QQDeiSS9wRl6BjNKIN5IpHxzQyU', ADMIN_ACCOUNTS: 'github:251370', ...SECRETS, ...extraEnv}
	const cache = memoryCache()
	const waits = []
	const ctx = {
		waitUntil: (do(p)
			return waits.push(p)
		)
	}
	let fetcher = (do(url)
		throw new Error(('unexpected fetch ' + url))
		return await undefined
	)
	let nextId = 1000
	const call = (do(path, {method: method = 'GET', body: body, cookie: cookie, headers: headers = {}} = {})
		const res = (await handle(
			new Request((ORIGIN + path), {method: method, headers: {...((body !== undefined) ? {'content-type': 'application/json', origin: ORIGIN} : {}), ...(cookie ? {cookie: cookie} : {}), ...headers}, body: ((body === undefined) ? undefined : (((typeof body) === 'string') ? body : JSON.stringify(body)))}),
			env,
			ctx,
			cache,
			(do(...args)
				return fetcher(...args)
			)
		))
		(await Promise.all(waits.splice(0)))
		return res
		return
	)
	const signedIn = (do(provider = 'github', id = String((nextId++)))
		const set = (await sessionCookie(env, {p: provider, k: sha256hex(((provider + ':') + id))}))
		return set.split(';')[0]
		return
	)
	const tokens = new Map()
	const linked = (do(client = 'ghostty', {provider: provider = 'github', id: id, scope: scope, expiresAt: expiresAt = (Date.now() + 86400000), revokedAt: revokedAt = 0, fresh: fresh = false} = {})
		(id ??= String((nextId++)))
		const memo = [client, provider, id, scope, expiresAt, revokedAt].join('|')
		if ((! fresh) && tokens.has(memo))
			return tokens.get(memo)
		const token = ('gvt_' + randomBytes(32).toString('base64url'))
		const tokenId = randomBytes(16).toString('base64url')
		env.DB.raw.prepare(('INSERT INTO api_tokens (id, token_hash, provider, account, client, scope, created_at, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')).run(tokenId, sha256hex(token), provider, sha256hex(((provider + ':') + id)), client, (scope ?? ((client === 'almanac') ? 'almanac:submit' : 'gallery:upload')), Date.now(), expiresAt, revokedAt)
		const out = {token: token, tokenId: tokenId, account: sha256hex(((provider + ':') + id)), header: {authorization: ('Bearer ' + token)}}
		tokens.set(memo, out)
		return out
		return
	)
	const vote = (do(body, opts = {})
		return call((API + 'vote'), {method: 'POST', body: body, ...opts, cookie: (opts.cookie ?? (await signedIn()))})
	)
	const mine = (do(opts = {})
		return call((API + 'mine'), opts)
	)
	return {
		env: env
		cache: cache
		call: call
		vote: vote
		mine: mine
		signedIn: signedIn
		linked: linked
		useFetch: (do(fn)
			(fetcher = fn)
			return
		)
	}
	return

export const keyOfCookie = (do(cookieHeader)
	const value = parseCookies(cookieHeader)[SESSION_COOKIE]
	const payload = JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString('utf8'))
	return payload.k
	return
)

export def setCookies(res)
	const out = {}
	for line of res.headers.getSetCookie()
		const [pair, ...attrs] = line.split(';').map(
			(do(s)
				return s.trim()
			)
		)
		const eq = pair.indexOf('=')
		(out[pair.slice(0, eq)] = {value: pair.slice((eq + 1)), attrs: attrs, line: line})
	return out
	return

export def talliesMatchVotes(db)
	const rows = db.prepare(('SELECT id, want, maybe, skip,\n            (SELECT COUNT(*) FROM votes WHERE idea_id = ideas.id AND vote = \'want\') AS cw,\n            (SELECT COUNT(*) FROM votes WHERE idea_id = ideas.id AND vote = \'maybe\') AS cm,\n            (SELECT COUNT(*) FROM votes WHERE idea_id = ideas.id AND vote = \'skip\') AS cs\n     FROM ideas')).all()
	const off = rows.filter(
		(do(r)
			return (((r.want !== r.cw) || (r.maybe !== r.cm)) || (r.skip !== r.cs))
		)
	).map(
		(do(r)
			return r.id
		)
	)
	assert.deepEqual(off, [], 'tallies match the votes table')
	return

export const allTallies = (do(db)
	return db.prepare('SELECT id, want, maybe, skip FROM ideas ORDER BY id').all().map(
		(do(r)
			return {...r}
		)
	)
)
