# Private analytics and the abuse deny list, wrapped around the app rather than woven
# into it: worker.js calls analyticsFetch, which answers the three analytics paths
# itself, refuses anything on the deny list, and otherwise hands the request to
# src/app.js untouched and counts what came back. Every part of that is inside a
# try/catch and every write is fire-and-forget through ctx.waitUntil, so a fault here —
# or D1 being out of its free daily allowance — changes nothing about the answer the
# visitor gets. It degrades to silence.
#
# What is collected is in migrations/0007_analytics.sql and, for readers, on the privacy
# page at /mods/ffxiv/term/vote/privacy/. In short: aggregate daily counters for
# everything that works, a 30-day log of refused requests keyed by a rotating digest so
# the owner can ban an abuser, and nothing else.
#
# Cost: one D1 write batch per edge location per five minutes at the very most
# (ANALYTICS.flushGapMs), one deny-list read per edge location per minute, and both only
# when there is something to write or something to enforce.
import { ADMIN_ANALYTICS_PATH, ADMIN_DENY_PATH, ANALYTICS, BEACON_PATH, DENY_KINDS, asnOf, banExpiry, bucketOf, classOf, countAbuse, countDeny, countHit, countRef, countryOf, dayKey, dayShift, denyMatch, drain, isAbuse, newState, optedOut, outcomeOf, parseBeacon, refHost, saltWindow, shouldFlush, unpackKey, validDenyValue } from './analytics-lib.js'

import { PRIVATE, cleanText, isSameOrigin, json, randomToken, sha256hex } from './lib.js'

import { isAdmin, readSession } from './session.js'

let state = newState()

let deny = {at: 0, entries: [], hasIp: false}

export def _resetForTests()
	(state = newState())
	(deny = {at: 0, entries: [], hasIp: false})
	return

export const _state = (do()
	return state
)

const noStore = {'cache-control': 'no-store', 'x-content-type-options': 'nosniff'}

const fail = (do(status, error, message)
	return json({ok: false, error: error, message: message}, {status: status, headers: PRIVATE})
)

export def analyticsFetch(request, env, ctx, handle, cache, fetcher)
	const url = new URL(request.url)
	if (url.pathname === BEACON_PATH)
		return handleBeacon(request, env, ctx, url)
	if (url.pathname === ADMIN_ANALYTICS_PATH)
		return guard(
			(do()
				return getAdminAnalytics(request, env, url, fetcher)
			)
		)
	if (url.pathname === ADMIN_DENY_PATH)
		return guard(
			(do()
				return postAdminDeny(request, env, url)
			)
		)
	const banned = (await quiet(
		(do()
			return blocked(request, env, ctx, url)
		),
		null
	))
	if banned
		const res = json({error: 'refused', message: 'This request was refused. If you think that is wrong, open an issue at github.com/Spaceghost.'}, {status: 451, headers: {...noStore, 'retry-after': '3600'}})
		watch(request, res, env, ctx, url, banned)
		return res
	const res = (await handle(request, env, ctx, cache, fetcher))
	watch(request, res, env, ctx, url, null)
	return res
	return

def guard(fn)
	try
		return (await fn())
	catch err
		console.error('analytics:', ((err && err.stack) ? err.stack : String(err)))
		return fail(500, 'server_error', 'Something went wrong; try again shortly.')
	return

def quiet(fn, fallback)
	try
		return (await fn())
	catch
		return fallback
	return

def watch(request, response, env, ctx, url, banned)
	try
		const now = Date.now()
		const work = quiet(
			(do()
				return record(request, response, env, url, banned, now)
			),
			null
		).then(
			(do()
				return (shouldFlush(state, now) ? claimFlush(env, now) : null)
			)
		)
		if (ctx && ((typeof ctx.waitUntil) === 'function'))
			ctx.waitUntil(work)
		return work
	catch
		return null
	return

def record(request, response, env, url, banned, now)
	const day = dayKey(now)
	const bucket = bucketOf(url.pathname)
	const waiting = ((bucket === 'device-link') && (response.status === 400))
	const outcome = (banned ? 'banned' : (waiting ? 'ok' : outcomeOf(response.status)))
	const cf = (request.cf || {})
	const country = countryOf(cf.country)
	const ua = (request.headers.get('user-agent') || '')
	countHit(state, {day: day, bucket: bucket, klass: classOf(ua), outcome: outcome, country: country})
	countRef(state, {day: day, bucket: bucket, host: refHost(request.headers.get('referer'), url.hostname)})
	if banned
		countDeny(state, banned.id)
	if isAbuse(outcome)
		countAbuse(state, {day: day, who: (await abuseKey(env, request, now)), bucket: bucket, outcome: outcome, country: country, asn: asnOf(cf.asn), at: now})
	return

const abuseKey = (do(env, request, now)
	return sha256hex(((((('ghostty-abuse:' + (env.SESSION_SECRET || '')) + ':') + saltWindow(now)) + ':') + (request.headers.get('cf-connecting-ip') || '')))
)

def claimFlush(env, now)
	if (! shouldFlush(state, now))
		return null
	(state.lastFlush = now)
	return quiet(
		(do()
			return flush(env, now)
		),
		null
	)
	return

def flush(env, now)
	const {hits: hits, refs: refs, abuse: abuse, denyHits: denyHits} = drain(state)
	const day = dayKey(now)
	const b = []
	for [key, v] of hits
		const [d, bucket, klass, outcome, country] = unpackKey(key)
		b.push(env.DB.prepare(('INSERT INTO hit_rollup (day, bucket, class, outcome, country, hits, samples) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)\n       ON CONFLICT (day, bucket, class, outcome, country) DO UPDATE SET hits = hits + ?6, samples = samples + ?7')).bind(d, bucket, klass, outcome, country, v.hits, v.samples))
	for [key, v] of refs
		const [d, bucket, host] = unpackKey(key)
		b.push(env.DB.prepare(('INSERT INTO ref_rollup (day, bucket, host, hits) VALUES (?1, ?2, ?3, ?4)\n       ON CONFLICT (day, bucket, host) DO UPDATE SET hits = hits + ?4')).bind(d, bucket, host, v.hits))
	for [key, v] of abuse
		const [d, who, bucket, outcome] = unpackKey(key)
		b.push(env.DB.prepare(('INSERT INTO abuse_log (day, who, bucket, outcome, country, asn, hits, last_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)\n       ON CONFLICT (day, who, bucket, outcome) DO UPDATE SET hits = hits + ?7, country = ?5, asn = ?6, last_at = MAX(last_at, ?8)')).bind(d, who, bucket, outcome, v.country, v.asn, v.hits, v.at))
	for [id, n] of denyHits
		b.push(env.DB.prepare('UPDATE deny_list SET hits = hits + ? WHERE id = ?').bind(n, id))
	if (state.prunedDay !== day)
		(state.prunedDay = day)
		b.push(env.DB.prepare('DELETE FROM hit_rollup WHERE day < ?').bind(dayShift(now, (- ANALYTICS.rollupDays))), env.DB.prepare('DELETE FROM ref_rollup WHERE day < ?').bind(dayShift(now, (- ANALYTICS.rollupDays))), env.DB.prepare('DELETE FROM abuse_log WHERE day < ?').bind(dayShift(now, (- ANALYTICS.abuseDays))), env.DB.prepare('DELETE FROM deny_list WHERE expires_at > 0 AND expires_at <= ?').bind(now))
	if b.length
		(await env.DB.batch(b))
	return b.length
	return

def denyEntries(env, ctx, now)
	if ((now - deny.at) < ANALYTICS.denyTtlMs)
		return deny
	(deny = {...deny, at: now})
	const load = quiet(
		(do()
			const {results: results} = (await env.DB.prepare('SELECT id, kind, value FROM deny_list WHERE expires_at = 0 OR expires_at > ? LIMIT ?').bind(now, ANALYTICS.denyMax).all())
			(deny = {
				at: now
				entries: results
				hasIp: results.some(
					(do(e)
						return (e.kind === 'ip')
					)
				)
			})
			return deny
			return
		),
		deny
	)
	if ((ctx && ((typeof ctx.waitUntil) === 'function')) && deny.entries.length)
		ctx.waitUntil(load)
		return deny
	return (await load)
	return

def blocked(request, env, ctx, url)
	if (bucketOf(url.pathname) === 'admin')
		return null
	const list = (await denyEntries(env, ctx, Date.now()))
	if (! list.entries.length)
		return null
	const cf = (request.cf || {})
	const ipDigest = (list.hasIp ? (await abuseKey(env, request, Date.now())) : '')
	return denyMatch(list.entries, {ipDigest: ipDigest, asn: asnOf(cf.asn), country: countryOf(cf.country), userAgent: (request.headers.get('user-agent') || '')})
	return

def handleBeacon(request, env, ctx, url)
	const res = new Response(null, {status: 204, headers: noStore})
	if (((request.method !== 'POST') || (! isSameOrigin(request, url))) || optedOut(request.headers))
		return res
	(await quiet(
		(do()
			const text = (await request.text())
			const view = parseBeacon(text.slice(0, (ANALYTICS.beaconBytes + 1)), url.hostname)
			if (! view)
				return
			const now = Date.now()
			const day = dayKey(now)
			countHit(state, {day: day, bucket: view.bucket, klass: 'page', outcome: 'view', country: countryOf((request.cf || {}).country)})
			countRef(state, {day: day, bucket: view.bucket, host: view.host})
			const work = (shouldFlush(state, now) ? claimFlush(env, now) : null)
			if ((work && ctx) && ((typeof ctx.waitUntil) === 'function'))
				ctx.waitUntil(work)
			else
				if work
					(await work)
			return
		),
		null
	))
	return res
	return

def adminGate(request, env, url)
	if (! isSameOrigin(request, url))
		return fail(403, 'forbidden', 'Cross-site request refused.')
	const session = (await readSession(request, env))
	if (! session)
		return fail(401, 'sign_in_required', 'Sign in first.')
	if (! (await isAdmin(env, session)))
		return fail(403, 'forbidden', 'Only the site owner can see this.')
	return null
	return

def getAdminAnalytics(request, env, url, fetcher)
	const gate = (await adminGate(request, env, url))
	if gate
		return gate
	if (request.method !== 'GET')
		return fail(405, 'method_not_allowed', 'Use GET.')
	const now = Date.now()
	const since = dayShift(now, (- ANALYTICS.adminDays))
	const since30 = dayShift(now, (- 30))
	const [series, countries, refs, abuse, denied, spans] = (await env.DB.batch([env.DB.prepare(('SELECT day, bucket, class, SUM(hits) AS hits, SUM(samples) AS samples\n       FROM hit_rollup WHERE day >= ?1 GROUP BY day, bucket, class ORDER BY day')).bind(since), env.DB.prepare(('SELECT country, SUM(hits) AS hits FROM hit_rollup WHERE day >= ?1\n       GROUP BY country ORDER BY hits DESC LIMIT 40')).bind(since30), env.DB.prepare(('SELECT host, SUM(hits) AS hits FROM ref_rollup WHERE day >= ?1\n       GROUP BY host ORDER BY hits DESC LIMIT 40')).bind(since30), env.DB.prepare(('SELECT who, SUM(hits) AS hits, MAX(last_at) AS last_at, MAX(country) AS country, MAX(asn) AS asn,\n              GROUP_CONCAT(DISTINCT outcome) AS outcomes, GROUP_CONCAT(DISTINCT bucket) AS buckets\n       FROM abuse_log WHERE day >= ?1 GROUP BY who ORDER BY hits DESC LIMIT 100')).bind(since30), env.DB.prepare('SELECT id, kind, value, reason, created_at, expires_at, hits FROM deny_list ORDER BY created_at DESC LIMIT 500'), env.DB.prepare(('SELECT bucket, outcome,\n              SUM(CASE WHEN day = ?1 THEN hits ELSE 0 END) AS today,\n              SUM(CASE WHEN day >= ?2 THEN hits ELSE 0 END) AS week,\n              SUM(CASE WHEN day >= ?3 THEN hits ELSE 0 END) AS month\n       FROM hit_rollup WHERE day >= ?3 GROUP BY bucket, outcome')).bind(dayKey(now), dayShift(now, (- 6)), since30)]))
	return json(
		{
			generated_at: now
			days: ANALYTICS.adminDays
			retention: {rollup_days: ANALYTICS.rollupDays, abuse_days: ANALYTICS.abuseDays, salt_window_days: ANALYTICS.saltWindowDays}
			series: series.results
			countries: countries.results
			refs: refs.results
			abuse: abuse.results
			deny: denied.results
			spans: spans.results
			cloudflare: (await quiet(
				(do()
					return zoneAnalytics(env, fetcher, now)
				),
				{configured: false, error: 'unavailable'}
			))
		},
		{headers: PRIVATE}
	)
	return

const GRAPHQL = 'https://api.cloudflare.com/client/v4/graphql'

const ZONE_QUERY = ('query($zone: String!, $since: String!, $until: String!) {\n  viewer { zones(filter: {zoneTag: $zone}) {\n    httpRequests1dGroups(limit: 60, filter: {date_geq: $since, date_leq: $until}, orderBy: [date_ASC]) {\n      dimensions { date }\n      sum { requests bytes cachedRequests threats pageViews }\n      uniq { uniques }\n    }\n  } }\n}')

def zoneAnalytics(env, fetcher, now)
	if ((! env.CF_ZONE_ID) || (! env.CF_ANALYTICS_TOKEN))
		return {configured: false, hint: 'Set CF_ZONE_ID (var) and CF_ANALYTICS_TOKEN (secret, zone Analytics:Read) to show Cloudflare zone totals here.'}
	const call = (fetcher || (do(...a)
		return fetch(...a)
	))
	const res = (await call(GRAPHQL, {method: 'POST', headers: {authorization: ('Bearer ' + env.CF_ANALYTICS_TOKEN), 'content-type': 'application/json'}, body: JSON.stringify({query: ZONE_QUERY, variables: {zone: env.CF_ZONE_ID, since: dayShift(now, (- 29)), until: dayKey(now)}}), signal: AbortSignal.timeout(8000)}))
	if (! res.ok)
		return {configured: true, error: ('Cloudflare answered ' + res.status)}
	const body = (await res.json())
	if (body.errors && body.errors.length)
		return {configured: true, error: String((body.errors[0].message || 'query rejected')).slice(0, 200)}
	const groups = ((do()
		let cursor$1 = body
		let cursor$2 = undefined
		if cursor$1 == null
			return undefined
		cursor$2 = cursor$1
		cursor$1 = cursor$1.data
		if cursor$1 == null
			return undefined
		cursor$2 = cursor$1
		cursor$1 = cursor$1.viewer
		if cursor$1 == null
			return undefined
		cursor$2 = cursor$1
		cursor$1 = cursor$1.zones
		if cursor$1 == null
			return undefined
		cursor$2 = cursor$1
		cursor$1 = cursor$1[0]
		if cursor$1 == null
			return undefined
		cursor$2 = cursor$1
		cursor$1 = cursor$1.httpRequests1dGroups
		return cursor$1
	)() || [])
	return {
		configured: true
		days: groups.map(
			(do(g)
				return {
					date: g.dimensions.date
					requests: g.sum.requests
					cached: g.sum.cachedRequests
					bytes: g.sum.bytes
					threats: g.sum.threats
					page_views: g.sum.pageViews
					uniques: ((do()
						let cursor$3 = g
						let cursor$4 = undefined
						cursor$4 = cursor$3
						cursor$3 = cursor$3.uniq
						if cursor$3 == null
							return undefined
						cursor$4 = cursor$3
						cursor$3 = cursor$3.uniques
						return cursor$3
					)() ?? null)
				}
			)
		)
	}
	return

def postAdminDeny(request, env, url)
	const gate = (await adminGate(request, env, url))
	if gate
		return gate
	if (request.method !== 'POST')
		return fail(405, 'method_not_allowed', 'Use POST.')
	let body
	try
		(body = (await request.json()))
	catch
		return fail(400, 'bad_json', 'Body is not valid JSON.')
	if ((! body) || ((typeof body) !== 'object'))
		return fail(400, 'bad_json', 'Body must be a JSON object.')
	const now = Date.now()
	if (body.action === 'unban')
		const id = (((typeof body.id) === 'string') ? body.id : '')
		if (! new RegExp('^[A-Za-z0-9_-]{22}$', '').test(id))
			return fail(400, 'bad_id', 'id is missing or malformed.')
		(await env.DB.prepare('DELETE FROM deny_list WHERE id = ?').bind(id).run())
		(deny = {at: 0, entries: deny.entries, hasIp: deny.hasIp})
		return json({ok: true, id: id}, {headers: PRIVATE})
	if (body.action !== 'ban')
		return fail(400, 'bad_action', 'action must be \'ban\' or \'unban\'.')
	const kind = (((typeof body.kind) === 'string') ? body.kind : '')
	if (! DENY_KINDS.includes(kind))
		return fail(400, 'bad_kind', 'kind must be ip, asn, country or ua.')
	const value = validDenyValue(kind, body.value)
	if (! value)
		return fail(400, 'bad_value', 'value is missing or malformed for that kind.')
	const reason = (cleanText(body.reason) || '').slice(0, 200)
	const expires = banExpiry(kind, Number(body.days), now)
	const id = randomToken(16)
	(await env.DB.prepare(('INSERT INTO deny_list (id, kind, value, reason, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)\n     ON CONFLICT (kind, value) DO UPDATE SET reason = ?4, expires_at = ?6')).bind(id, kind, value, reason, now, expires).run())
	(deny = {at: 0, entries: deny.entries, hasIp: (deny.hasIp || (kind === 'ip'))})
	return json({ok: true, kind: kind, value: value, expires_at: expires}, {status: 201, headers: PRIVATE})
	return
