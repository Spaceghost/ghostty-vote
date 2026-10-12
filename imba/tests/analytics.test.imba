# The private analytics layer and the abuse deny list: src/analytics-lib.js (pure) and
# src/analytics.js (D1, the deny list, the beacon and the owner's API). The point of
# most of these is not that the numbers are right but that nothing here can ever change
# the answer the site gives, so several deliberately break D1 and assert the response is
# untouched.
import assert from 'node:assert/strict'

import test from 'node:test'

import { ANALYTICS, banExpiry, bucketOf, bump, classOf, countAbuse, countHit, countRef, denyMatch, drain, isAbuse, newState, optedOut, outcomeOf, parseBeacon, refHost, saltWindow, shouldFlush, unpackKey, validDenyValue, weigh, windowEnd } from '../src/analytics-lib.js'

import { _resetForTests, _state, analyticsFetch } from '../src/analytics.js'

import { handle } from '../src/app.js'

import { ORIGIN, setup } from './harness.js'

test(
	'bucketOf matches on path prefixes, not a list of files',
	(do()
		assert.equal(bucketOf('/mods/ffxiv/plugins.json'), 'plugins-repo')
		assert.equal(bucketOf('/mods/ffxiv/plugins/'), 'plugins-page')
		assert.equal(bucketOf('/mods/ffxiv/plugins/changelog/'), 'plugins-page')
		assert.equal(bucketOf('/mods/ffxiv/almanac/recommendations.json'), 'almanac-recs')
		assert.equal(bucketOf('/mods/ffxiv/almanac/leaderboard.json'), 'almanac-board')
		assert.equal(bucketOf('/mods/ffxiv/xivmcp/vote/'), 'vote-page')
		assert.equal(bucketOf('/mods/ffxiv/almanac/vote/'), 'vote-page')
		assert.equal(bucketOf('/mods/ffxiv/term/vote/api/admin/voters'), 'admin')
		assert.equal(bucketOf('/mods/ffxiv/almanac/api/results'), 'almanac-api')
		assert.equal(bucketOf('/mods/ffxiv/term/gallery/api/shots'), 'gallery-shots')
		assert.equal(bucketOf('/mods/ffxiv/term/gallery/thumb/aaaaaaaaaaaaaaaaaaaaaa'), 'gallery-image')
		assert.equal(bucketOf('/mods/ffxiv/term/vote/api/admin/analytics'), 'admin')
		assert.equal(bucketOf('/mods/ffxiv/term/vote/api/beacon'), 'beacon')
		assert.equal(bucketOf('/mods/ffxiv/term/vote/'), 'vote-page')
		assert.equal(bucketOf('/something/else'), 'other')
		assert.equal(bucketOf('not a path'), 'other')
		return
	)
)

test(
	'a release download is a download whatever it is called',
	(do()
		assert.equal(bucketOf('/mods/ffxiv/plugins/download/Ghostty.zip'), 'download')
		assert.equal(bucketOf('/mods/ffxiv/releases/latest/Ghostty.dll'), 'download')
		assert.equal(bucketOf('/mods/ffxiv/plugins/latest.zip'), 'download')
		return
	)
)

test(
	'classOf puts the plugin, bots and browsers apart and keeps no string',
	(do()
		assert.equal(classOf('Dalamud/12.0.0.17 (FFXIV)'), 'dalamud')
		assert.equal(classOf('XIVLauncher'), 'dalamud')
		assert.equal(classOf('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/141 Safari/537.36'), 'browser')
		assert.equal(classOf('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'), 'bot')
		assert.equal(classOf('curl/8.5.0'), 'bot')
		assert.equal(classOf('python-requests/2.31'), 'bot')
		assert.equal(classOf(''), 'none')
		assert.equal(classOf(undefined), 'none')
		assert.equal(classOf('something-bespoke/1.0'), 'other')
		assert.equal(classOf('Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)'), 'bot')
		return
	)
)

test(
	'outcomeOf and isAbuse: a server fault is never the callers fault',
	(do()
		assert.equal(outcomeOf(200), 'ok')
		assert.equal(outcomeOf(304), 'fresh')
		assert.equal(outcomeOf(303), 'redirect')
		assert.equal(outcomeOf(404), 'notfound')
		assert.equal(outcomeOf(429), 'limited')
		assert.equal(outcomeOf(451), 'banned')
		assert.equal(outcomeOf(403), 'refused')
		assert.equal(outcomeOf(500), 'error')
		assert.equal(isAbuse('error'), false)
		assert.equal(isAbuse('ok'), false)
		for o of ['refused', 'notfound', 'limited', 'banned']
			assert.equal(isAbuse(o), true)
		return
	)
)

test(
	'refHost keeps the host and nothing else',
	(do()
		assert.equal(refHost('https://www.reddit.com/r/ffxiv/comments/abc?utm_source=x', 'spacegho.st'), 'reddit.com')
		assert.equal(refHost('https://spacegho.st/mods/ffxiv/term/vote/', 'spacegho.st'), 'self')
		assert.equal(refHost('', 'spacegho.st'), '')
		assert.equal(refHost('not a url', 'spacegho.st'), '')
		assert.equal(refHost('javascript:alert(1)', 'spacegho.st'), '')
		assert.equal(refHost((('https://' + 'a'.repeat(200)) + '.com/'), 'spacegho.st'), '')
		return
	)
)

test(
	'parseBeacon takes a path and a referrer host, and refuses anything else',
	(do()
		assert.deepEqual(parseBeacon('{"p":"/mods/ffxiv/term/gallery/","r":"https://reddit.com/x"}', 'spacegho.st'), {bucket: 'gallery-page', host: 'reddit.com'})
		assert.deepEqual(parseBeacon('{"p":"/mods/ffxiv/term/vote/?secret=hunter2"}', 'spacegho.st'), {bucket: 'vote-page', host: ''})
		assert.equal(parseBeacon('{"p":"https://evil.example/"}', 'spacegho.st'), null)
		assert.equal(parseBeacon('{"p":"/etc/passwd"}', 'spacegho.st'), null)
		assert.equal(parseBeacon('not json', 'spacegho.st'), null)
		assert.equal(parseBeacon('[1,2,3]', 'spacegho.st'), null)
		assert.equal(parseBeacon('x'.repeat((ANALYTICS.beaconBytes + 1)), 'spacegho.st'), null)
		return
	)
)

test(
	'optedOut honours Do Not Track and Global Privacy Control',
	(do()
		assert.equal(optedOut(new Headers({dnt: '1'})), true)
		assert.equal(optedOut(new Headers({'sec-gpc': '1'})), true)
		assert.equal(optedOut(new Headers({dnt: '0'})), false)
		assert.equal(optedOut(new Headers()), false)
		return
	)
)

test(
	'weigh counts every event until the spike threshold, then one in ten weighted ten',
	(do()
		const s = newState()
		let total = 0
		let cursor$1 = 0
		while (cursor$1 < ANALYTICS.sampleAfter)
			(total += weigh(s))
			(cursor$1++)
		assert.equal(total, ANALYTICS.sampleAfter, 'nothing is sampled below the threshold')
		assert.equal(s.sampledAny, false)
		let after = 0
		let written = 0
		let cursor$2 = 0
		while (cursor$2 < 10)
			const w = weigh(s)
			(after += w)
			if w
				(written += 1)
			(cursor$2++)
		assert.equal(after, 10)
		assert.equal(written, 1)
		assert.equal(s.sampledAny, true)
		let est = 0
		let cursor$3 = 0
		while (cursor$3 < 100_000)
			(est += weigh(s))
			(cursor$3++)
		assert.equal(est, 100_000)
		return
	)
)

test(
	'bump never lets one isolate hold more keys than the cap',
	(do()
		const m = new Map()
		let cursor$4 = 0
		while (cursor$4 < 500)
			bump(m, ('k' + cursor$4), 1, 8, 'spill')
			(cursor$4++)
		assert.equal(m.size, 9, '8 real keys plus the spill')
		assert.equal(m.get('spill').hits, 492)
		let sum = 0
		for v of m.values()
			(sum += v.hits)
		assert.equal(sum, 500)
		return
	)
)

test(
	'countHit folds repeats into one row and drain hands them over exactly once',
	(do()
		const s = newState()
		const ev = {day: '2026-09-19', bucket: 'plugins-repo', klass: 'dalamud', outcome: 'ok', country: 'US'}
		let cursor$5 = 0
		while (cursor$5 < 40)
			countHit(s, ev)
			(cursor$5++)
		assert.equal(s.hits.size, 1, '40 fetches, one row')
		const [key, value] = [...s.hits.entries()][0]
		assert.deepEqual(unpackKey(key), ['2026-09-19', 'plugins-repo', 'dalamud', 'ok', 'US'])
		assert.equal(value.hits, 40)
		const out = drain(s)
		assert.equal(out.hits.size, 1)
		assert.equal(s.hits.size, 0, 'draining starts fresh so a slow write cannot double-count')
		return
	)
)

test(
	'shouldFlush writes the first event at once and then coalesces for five minutes',
	(do()
		const s = newState()
		const now = 1_800_000_000_000
		assert.equal(shouldFlush(s, now), false, 'nothing pending, nothing to write')
		countHit(s, {day: '2026-09-19', bucket: 'vote-page', klass: 'browser', outcome: 'ok', country: 'US'})
		assert.equal(shouldFlush(s, now), true)
		(s.lastFlush = now)
		drain(s)
		countHit(s, {day: '2026-09-19', bucket: 'vote-page', klass: 'browser', outcome: 'ok', country: 'US'})
		assert.equal(shouldFlush(s, (now + 1000)), false)
		assert.equal(shouldFlush(s, (now + ANALYTICS.flushGapMs)), true)
		assert.equal(Math.floor((86_400_000 / ANALYTICS.flushGapMs)), 288)
		return
	)
)

test(
	'countRef ignores an empty host and countAbuse keeps the newest time',
	(do()
		const s = newState()
		assert.equal(countRef(s, {day: 'd', bucket: 'vote-page', host: ''}), null)
		assert.equal(s.refs.size, 0)
		countAbuse(s, {day: 'd', who: 'w', bucket: 'vote-api', outcome: 'limited', country: 'US', asn: 64500, at: 5})
		countAbuse(s, {day: 'd', who: 'w', bucket: 'vote-api', outcome: 'limited', country: 'US', asn: 64500, at: 9})
		assert.equal(s.abuse.size, 1)
		assert.equal([...s.abuse.values()][0].hits, 2)
		assert.equal([...s.abuse.values()][0].at, 9)
		return
	)
)

test(
	'validDenyValue accepts a digest, an AS number, a country and a UA fragment only',
	(do()
		assert.equal(validDenyValue('ip', 'a'.repeat(64)), 'a'.repeat(64))
		assert.equal(validDenyValue('ip', '203.0.113.9'), null, 'an address can never be put on the list')
		assert.equal(validDenyValue('ip', 'A'.repeat(64)), null, 'digests are lower-case hex')
		assert.equal(validDenyValue('asn', '64500'), '64500')
		assert.equal(validDenyValue('asn', '0'), null)
		assert.equal(validDenyValue('country', 'ru'), 'RU')
		assert.equal(validDenyValue('country', 'RUS'), null)
		assert.equal(validDenyValue('ua', 'EvilScraper'), 'evilscraper')
		assert.equal(validDenyValue('ua', 'ab'), null)
		assert.equal(validDenyValue('nonsense', 'x'), null)
		return
	)
)

test(
	'denyMatch checks the cheap fields first and the digest only when it has one',
	(do()
		const entries = [{id: '1', kind: 'asn', value: '64500'}, {id: '2', kind: 'country', value: 'AQ'}, {id: '3', kind: 'ua', value: 'evilscraper'}, {id: '4', kind: 'ip', value: 'b'.repeat(64)}]
		assert.equal(denyMatch(entries, {asn: 64500, country: 'US', userAgent: 'x'}).id, '1')
		assert.equal(denyMatch(entries, {asn: 1, country: 'AQ', userAgent: 'x'}).id, '2')
		assert.equal(denyMatch(entries, {asn: 1, country: 'US', userAgent: 'EvilScraper/2'}).id, '3')
		assert.equal(denyMatch(entries, {ipDigest: 'b'.repeat(64), asn: 1, country: 'US', userAgent: 'x'}).id, '4')
		assert.equal(denyMatch(entries, {asn: 1, country: 'US', userAgent: 'Dalamud'}), null)
		assert.equal(denyMatch([], {asn: 64500}), null)
		return
	)
)

test(
	'a ban on an address digest cannot outlive the window that digest belongs to',
	(do()
		const now = Date.UTC(2026, 8, 19, 12)
		assert.equal(banExpiry('ip', 0, now), windowEnd(now), 'no expiry asked for still ends with the window')
		assert.equal(banExpiry('ip', 365, now), windowEnd(now), 'a year asked for is clamped to the window')
		assert.ok(((banExpiry('ip', 365, now) - now) <= (ANALYTICS.saltWindowDays * 86_400_000)))
		assert.equal(banExpiry('asn', 30, now), (now + (30 * 86_400_000)))
		assert.equal(banExpiry('asn', 0, now), 0)
		assert.notEqual(saltWindow(now), saltWindow((now + (ANALYTICS.saltWindowDays * 86_400_000))))
		return
	)
)

const req = (do(path, init = {})
	return new Request((ORIGIN + path), init)
)

const rows = (do(env, sql)
	return env.DB.raw.prepare(sql).all().map(
		(do(r)
			return {...r}
		)
	)
)

def wrap(t, extraEnv)
	_resetForTests()
	t.after(_resetForTests)
	const h = setup(extraEnv)
	const waits = []
	const ctx = {
		waitUntil: (do(p)
			return waits.push(p)
		)
	}
	const settle = (do()
		while waits.length
			(await Promise.all(waits.splice(0)))
		return
	)
	let fetcher = (do(url)
		throw new Error(('unexpected fetch ' + url))
		return await undefined
	)
	const go = (do(path, init, inner = handle)
		const res = (await analyticsFetch(
			req(path, init),
			h.env,
			ctx,
			inner,
			h.cache,
			(do(...args)
				return fetcher(...args)
			)
		))
		(await settle())
		return res
		return
	)
	return {
		...h
		ctx: ctx
		go: go
		settle: settle
		useFetch: (do(fn)
			(fetcher = fn)
			return
		)
	}
	return

const ok = (do()
	return await new Response('{}', {status: 200, headers: {'content-type': 'application/json'}})
)

test(
	'a machine fetch becomes one aggregate row and nothing else',
	(do(t)
		const a = wrap(t)
		const res = (await a.go('/mods/ffxiv/plugins.json', {headers: {'user-agent': 'Dalamud/12.0.0.17', 'cf-connecting-ip': '203.0.113.9', referer: 'https://reddit.com/r/ffxiv?x=1'}}, ok))
		assert.equal(res.status, 200)
		const hits = rows(a.env, 'SELECT * FROM hit_rollup')
		assert.equal(hits.length, 1)
		assert.equal(hits[0].bucket, 'plugins-repo')
		assert.equal(hits[0].class, 'dalamud')
		assert.equal(hits[0].outcome, 'ok')
		assert.equal(hits[0].hits, 1)
		assert.deepEqual(rows(a.env, 'SELECT host, hits FROM ref_rollup'), [{host: 'reddit.com', hits: 1}])
		assert.deepEqual(rows(a.env, 'SELECT * FROM abuse_log'), [])
		const dump = JSON.stringify([...rows(a.env, 'SELECT * FROM hit_rollup'), ...rows(a.env, 'SELECT * FROM ref_rollup')])
		assert.equal(dump.includes('203.0.113.9'), false, 'no address anywhere')
		assert.equal(dump.includes('Dalamud/12'), false, 'no User-Agent string anywhere')
		return
	)
)

test(
	'a burst is coalesced: one write, then everything folded in memory',
	(do(t)
		const a = wrap(t)
		let cursor$6 = 0
		while (cursor$6 < 25)
			(await a.go('/mods/ffxiv/plugins.json', {headers: {'user-agent': 'Dalamud/12'}}, ok))
			(cursor$6++)
		const hits = rows(a.env, 'SELECT hits FROM hit_rollup')
		assert.equal(hits.length, 1)
		assert.equal(hits[0].hits, 1, 'only the first event was written; the gap has not elapsed')
		assert.equal([..._state().hits.values()][0].hits, 24)
		return
	)
)

test(
	'a refused request is logged by a rotating digest; a server fault is not',
	(do(t)
		const a = wrap(t)
		const limited = (do()
			return await new Response('{}', {status: 429})
		)
		const broke = (do()
			return await new Response('{}', {status: 500})
		)
		(await a.go('/mods/ffxiv/almanac/api/results', {method: 'POST', headers: {'cf-connecting-ip': '203.0.113.9'}}, limited))
		const log = rows(a.env, 'SELECT * FROM abuse_log')
		assert.equal(log.length, 1)
		assert.equal(log[0].outcome, 'limited')
		assert.match(log[0].who, new RegExp('^[0-9a-f]{64}$', ''))
		assert.notEqual(log[0].who, '203.0.113.9')
		_resetForTests()
		(await a.go('/mods/ffxiv/almanac/api/results', {method: 'POST', headers: {'cf-connecting-ip': '203.0.113.9'}}, broke))
		assert.equal(rows(a.env, 'SELECT * FROM abuse_log').length, 1, 'a 500 is our fault and is not held against anyone')
		return
	)
)

test(
	'the deny list refuses at the edge, counts the hit, and never locks the owner out',
	(do(t)
		const a = wrap(t)
		(await a.env.DB.prepare('INSERT INTO deny_list (id, kind, value, reason, created_at, expires_at) VALUES (\'aaaaaaaaaaaaaaaaaaaaaa\', \'ua\', \'evilscraper\', \'test\', 1, 0)').run())
		let reached = 0
		const inner = (do()
			(reached += 1)
			return await new Response('{}', {status: 200})
			return await undefined
		)
		const res = (await a.go('/mods/ffxiv/plugins.json', {headers: {'user-agent': 'EvilScraper/2.0'}}, inner))
		assert.equal(res.status, 451)
		assert.equal(reached, 0, 'the app was never called')
		assert.equal(rows(a.env, 'SELECT outcome FROM hit_rollup')[0].outcome, 'banned')
		const fine = (await a.go('/mods/ffxiv/plugins.json', {headers: {'user-agent': 'Dalamud/12'}}, inner))
		assert.equal(fine.status, 200)
		assert.equal(reached, 1)
		const admin = (await a.go('/mods/ffxiv/term/vote/api/admin/voters', {headers: {'user-agent': 'EvilScraper/2.0'}}, inner))
		assert.notEqual(admin.status, 451)
		return
	)
)

test(
	'a deny list that cannot be read fails open',
	(do(t)
		const a = wrap(t)
		(a.env.DB = {
			prepare: (do()
				throw new Error('D1 is unwell')
				return
			)
			batch: (do()
				throw new Error('D1 is unwell')
				return
			)
		})
		const res = (await a.go('/mods/ffxiv/plugins.json', {}, ok))
		assert.equal(res.status, 200, 'a database that is unwell must not start refusing visitors')
		return
	)
)

test(
	'analytics never changes the answer, even when every write throws',
	(do(t)
		const a = wrap(t)
		const real = a.env.DB
		(a.env.DB = {
			prepare: (do(...args)
				return real.prepare(...args)
			)
			batch: (do()
				throw new Error('D1 daily write limit reached')
				return
			)
		})
		const res = (await a.go(
			'/mods/ffxiv/plugins.json',
			{headers: {'user-agent': 'Dalamud/12'}},
			(do()
				return await new Response('["entry"]', {status: 200, headers: {'content-type': 'application/json'}})
			)
		))
		assert.equal(res.status, 200)
		assert.equal((await res.text()), '["entry"]', 'the body is exactly what the app produced')
		return
	)
)

test(
	'the beacon counts a page view and answers 204 whatever it is sent',
	(do(t)
		const a = wrap(t)
		const post = (do(body, headers)
			return a.go('/mods/ffxiv/term/vote/api/beacon', {method: 'POST', body: body, headers: {origin: ORIGIN, ...headers}}, ok)
		)
		assert.equal((await post('{"p":"/mods/ffxiv/term/gallery/","r":"https://reddit.com/x"}')).status, 204)
		const view = rows(a.env, 'SELECT * FROM hit_rollup WHERE outcome = \'view\'')
		assert.equal(view.length, 1)
		assert.equal(view[0].bucket, 'gallery-page')
		assert.equal(view[0].class, 'page')
		assert.deepEqual(rows(a.env, 'SELECT host FROM ref_rollup'), [{host: 'reddit.com'}])
		const before = rows(a.env, 'SELECT SUM(hits) AS n FROM hit_rollup')[0].n
		assert.equal((await post('garbage')).status, 204)
		assert.equal((await post('{"p":"https://evil.example/"}')).status, 204)
		assert.equal(rows(a.env, 'SELECT SUM(hits) AS n FROM hit_rollup')[0].n, before)
		return
	)
)

test(
	'the beacon counts nothing for Do Not Track, GPC or another site',
	(do(t)
		const a = wrap(t)
		const body = '{"p":"/mods/ffxiv/term/vote/"}'
		for headers of [{dnt: '1'}, {'sec-gpc': '1'}, {origin: 'https://evil.example'}, {}]
			const res = (await a.go('/mods/ffxiv/term/vote/api/beacon', {method: 'POST', body: body, headers: {origin: ORIGIN, ...headers}}, ok))
			assert.equal(res.status, 204)
		const counted = rows(a.env, 'SELECT SUM(hits) AS n FROM hit_rollup WHERE outcome = \'view\'')[0].n
		assert.equal(counted, 1, 'only the request with no opt-out, from this site')
		assert.equal((await a.go('/mods/ffxiv/term/vote/api/beacon', {method: 'GET'}, ok)).status, 204)
		assert.equal(rows(a.env, 'SELECT SUM(hits) AS n FROM hit_rollup WHERE outcome = \'view\'')[0].n, 1)
		return
	)
)

test(
	'the analytics API is the owners alone',
	(do(t)
		const a = wrap(t)
		const get = (do(cookie)
			return a.go('/mods/ffxiv/term/vote/api/admin/analytics', (cookie ? {headers: {cookie: cookie}} : {}), ok)
		)
		assert.equal((await get()).status, 401)
		assert.equal((await get((await a.signedIn('github', '999999')))).status, 403)
		const res = (await get((await a.signedIn('github', '251370'))))
		assert.equal(res.status, 200)
		assert.equal(res.headers.get('cache-control'), 'private, no-store')
		const body = (await res.json())
		for k of ['series', 'countries', 'refs', 'abuse', 'deny', 'spans']
			assert.ok(Array.isArray(body[k]), k)
		assert.equal(body.retention.rollup_days, ANALYTICS.rollupDays)
		assert.equal(body.retention.abuse_days, ANALYTICS.abuseDays)
		assert.equal(body.cloudflare.configured, false, 'no token set, so it says so instead of guessing')
		assert.equal((await a.go('/mods/ffxiv/term/vote/api/admin/analytics', {headers: {origin: 'https://evil.example'}}, ok)).status, 403)
		return
	)
)

test(
	'the owner can ban and unban, and only ever handles a digest',
	(do(t)
		const a = wrap(t)
		const owner = (await a.signedIn('github', '251370'))
		const post = (do(body, cookie = owner)
			return a.go('/mods/ffxiv/term/vote/api/admin/deny', {method: 'POST', body: JSON.stringify(body), headers: {cookie: cookie, origin: ORIGIN, 'content-type': 'application/json'}}, ok)
		)
		assert.equal((await post({action: 'ban', kind: 'asn', value: '64500'}, (await a.signedIn('github', '7')))).status, 403)
		assert.equal((await post({action: 'ban', kind: 'ip', value: '203.0.113.9'})).status, 400, 'an address is not a digest')
		assert.equal((await post({action: 'nonsense'})).status, 400)
		const made = (await post({action: 'ban', kind: 'asn', value: '64500', days: 30, reason: 'scraping the repository'}))
		assert.equal(made.status, 201)
		const list = rows(a.env, 'SELECT * FROM deny_list')
		assert.equal(list.length, 1)
		assert.equal(list[0].kind, 'asn')
		assert.equal(list[0].reason, 'scraping the repository')
		assert.ok((list[0].expires_at > Date.now()))
		assert.equal((await post({action: 'ban', kind: 'asn', value: '64500', reason: 'still scraping'})).status, 201)
		assert.equal(rows(a.env, 'SELECT * FROM deny_list').length, 1)
		assert.equal((await post({action: 'unban', id: list[0].id})).status, 200)
		assert.equal(rows(a.env, 'SELECT * FROM deny_list').length, 0)
		assert.equal((await post({action: 'unban', id: 'nope'})).status, 400)
		return
	)
)

test(
	'the dashboard gets per-day, per-week and per-month totals for each link',
	(do(t)
		const a = wrap(t)
		const today = new Date().toISOString().slice(0, 10)
		(await a.env.DB.batch([a.env.DB.prepare('INSERT INTO hit_rollup VALUES (?, \'plugins-repo\', \'dalamud\', \'ok\', \'US\', 120, 120)').bind(today), a.env.DB.prepare('INSERT INTO hit_rollup VALUES (?, \'plugins-repo\', \'bot\', \'notfound\', \'DE\', 8, 8)').bind(today), a.env.DB.prepare('INSERT INTO ref_rollup VALUES (?, \'vote-page\', \'reddit.com\', 42)').bind(today)]))
		const res = (await a.go('/mods/ffxiv/term/vote/api/admin/analytics', {headers: {cookie: (await a.signedIn('github', '251370'))}}, ok))
		const body = (await res.json())
		const repo = body.spans.filter(
			(do(r)
				return (r.bucket === 'plugins-repo')
			)
		)
		assert.equal(
			repo.reduce(
				(do(n, r)
					return (n + r.today)
				),
				0
			),
			128
		)
		assert.equal(
			repo.reduce(
				(do(n, r)
					return (n + r.week)
				),
				0
			),
			128
		)
		assert.equal(
			repo.find(
				(do(r)
					return (r.outcome === 'notfound')
				)
			).month,
			8
		)
		assert.deepEqual(body.refs, [{host: 'reddit.com', hits: 42}])
		const dalamud = body.series.find(
			(do(r)
				return (r.class === 'dalamud')
			)
		)
		assert.equal(dalamud.hits, 120)
		return
	)
)

test(
	'retention deletes rollups past 400 days and refusals past 30',
	(do(t)
		const a = wrap(t)
		const old = (do(n)
			return new Date((Date.now() - (n * 86_400_000))).toISOString().slice(0, 10)
		)
		(await a.env.DB.batch([a.env.DB.prepare('INSERT INTO hit_rollup VALUES (?, \'vote-page\', \'browser\', \'ok\', \'US\', 1, 1)').bind(old(401)), a.env.DB.prepare('INSERT INTO hit_rollup VALUES (?, \'vote-page\', \'browser\', \'ok\', \'US\', 1, 1)').bind(old(399)), a.env.DB.prepare('INSERT INTO abuse_log VALUES (?, \'w\', \'vote-api\', \'limited\', \'US\', 1, 1, 1)').bind(old(31)), a.env.DB.prepare('INSERT INTO abuse_log VALUES (?, \'w\', \'vote-api\', \'limited\', \'US\', 1, 1, 1)').bind(old(29)), a.env.DB.prepare('INSERT INTO deny_list VALUES (\'bbbbbbbbbbbbbbbbbbbbbb\', \'asn\', \'1\', \'\', 1, 2, 0)')]))
		(await a.go('/mods/ffxiv/plugins.json', {headers: {'user-agent': 'Dalamud/12'}}, ok))
		assert.equal(
			rows(a.env, 'SELECT day FROM hit_rollup').some(
				(do(r)
					return (r.day === old(401))
				)
			),
			false
		)
		assert.equal(
			rows(a.env, 'SELECT day FROM hit_rollup').some(
				(do(r)
					return (r.day === old(399))
				)
			),
			true
		)
		assert.equal(rows(a.env, 'SELECT day FROM abuse_log').length, 1)
		assert.equal(rows(a.env, 'SELECT id FROM deny_list').length, 0, 'an expired ban is dropped')
		return
	)
)

test(
	'Cloudflare zone totals are optional and a failure there is just a note',
	(do(t)
		const a = wrap(t, {CF_ZONE_ID: 'zone-tag', CF_ANALYTICS_TOKEN: 'not-a-real-token'})
		const owner = (await a.signedIn('github', '251370'))
		a.useFetch(
			(do(url, init)
				assert.equal(url, 'https://api.cloudflare.com/client/v4/graphql')
				assert.equal(init.headers.authorization, 'Bearer not-a-real-token')
				return await new Response(JSON.stringify({data: {viewer: {zones: [{httpRequests1dGroups: [{dimensions: {date: '2026-09-18'}, sum: {requests: 900, bytes: 10, cachedRequests: 700, threats: 2, pageViews: 40}, uniq: {uniques: 31}}]}]}}}), {status: 200, headers: {'content-type': 'application/json'}})
				return await undefined
			)
		)
		const body = (await (await a.go('/mods/ffxiv/term/vote/api/admin/analytics', {headers: {cookie: owner}}, ok)).json())
		assert.equal(body.cloudflare.configured, true)
		assert.deepEqual(body.cloudflare.days[0], {date: '2026-09-18', requests: 900, cached: 700, bytes: 10, threats: 2, page_views: 40, uniques: 31})
		assert.equal(JSON.stringify(body).includes('not-a-real-token'), false, 'the token is never returned')
		a.useFetch(
			(do()
				throw new Error('network')
				return await undefined
			)
		)
		const broken = (await (await a.go('/mods/ffxiv/term/vote/api/admin/analytics', {headers: {cookie: owner}}, ok)).json())
		assert.equal(broken.cloudflare.error, 'unavailable')
		assert.ok(Array.isArray(broken.series), 'the rest of the dashboard still arrives')
		return
	)
)
