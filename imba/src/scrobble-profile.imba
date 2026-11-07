# Display names, the leaderboard switch, the owner's recent listens, the public
# leaderboards, and the spacegho.st/scrobble alias of /mods/ffxiv/scrobble.
#
# Privacy defaults: an account appears on any leaderboard (songs, artists and listeners
# alike) only while its `leaderboard` switch is on. Accounts that existed before the
# leaderboards keep it off until the owner turns it on; accounts provisioned by another
# service start with it on. A listener is shown only by display name, or by a handle
# generated from the account key ("listener-" + six hex digits) when none is set. Names
# cannot contain an email address or a link. Boards are aggregate counts of completed
# listens; nothing per listen is published.
import {cleanText} from './lib.js'
import {SCROBBLE_BASE, SCROBBLE_RETENTION_MS, problem} from './scrobble-data.js'

export const PUBLIC_BASE = '/scrobble'
export const WINDOWS = Object.freeze({'7d': 7, '30d': 30, all: 0})
export const BOARD_SIZE = 25
const BOARD_TTL_S = 300

export def handleOf(account)
	return 'listener-' + String(account).slice(0, 6)

export def publicName(row)
	return (row && row.display_name) || handleOf(row.account)

export def validName(value)
	if typeof value !== 'string'
		problem(400, 'invalid_display_name', 'Choose a display name.')
	const name = (cleanText(value) || '').replace(new RegExp('[<>]', 'g'), '')
	if !name || name.length > 40
		problem(400, 'invalid_display_name', 'A display name has 1 to 40 visible characters.')
	if name.includes('@') || new RegExp('https?:|www\\.', 'i').test(name)
		problem(400, 'invalid_display_name', 'A display name cannot contain an email address or a link.')
	return name

export def readProfile(env, key)
	const row = await env.DB.prepare('SELECT account,display_name,leaderboard FROM scrobble_accounts WHERE account=?').bind(key).first()
	const value = row || {account: key, display_name: '', leaderboard: 0}
	return {display_name: value.display_name || '', handle: handleOf(key), name: publicName(value), leaderboard: value.leaderboard === 1}

# {display_name?: string ('' = back to the handle), leaderboard?: boolean}
export def updateProfile(env, key, input)
	let name = null
	let board = null
	if input.display_name !== undefined && input.display_name !== null
		name = (typeof input.display_name === 'string' && input.display_name.trim() === '') ? '' : validName(input.display_name)
	if input.leaderboard !== undefined
		if typeof input.leaderboard !== 'boolean'
			problem(400, 'invalid_leaderboard', 'leaderboard must be true or false.')
		board = input.leaderboard ? 1 : 0
	await env.DB.prepare('UPDATE scrobble_accounts SET display_name=COALESCE(?2,display_name),leaderboard=COALESCE(?3,leaderboard) WHERE account=?1').bind(key, name, board).run()
	return await readProfile(env, key)

# The owner's last completed listens, newest first (token-only; history stays private).
export def recentListens(env, key, url)
	const raw = url.searchParams.get('limit')
	const limit = raw === null ? 15 : Number(raw)
	if !Number.isSafeInteger(limit) || limit < 1 || limit > 100
		problem(400, 'invalid_limit', 'limit must be between 1 and 100.')
	const result = await env.DB.prepare('SELECT listened_at,metadata FROM scrobble_listens WHERE account=? AND created_at>? ORDER BY listened_at DESC,id DESC LIMIT ?').bind(key, Date.now() - SCROBBLE_RETENTION_MS, limit).all()
	return result.results.map(do(row)
		const m = JSON.parse(row.metadata)
		const info = m.additional_info || {}
		const out = {listened_at: row.listened_at, artist: m.artist_name, title: m.track_name}
		if m.release_name
			out.album = m.release_name
		if info.duration_ms !== undefined
			out.duration_ms = info.duration_ms
		if info.art_url
			out.art = info.art_url
		return out
	)

export def boardWindow(url)
	const value = url.searchParams.get('window') || '7d'
	if !Object.hasOwn(WINDOWS, value)
		problem(400, 'invalid_window', 'window must be 7d, 30d or all.')
	return value

export def leaderboard(env, windowName)
	const cache = typeof caches !== 'undefined' && caches && caches.default
	const cacheKey = new Request('https://spacegho.st' + PUBLIC_BASE + '/1/leaderboard?window=' + windowName)
	if cache
		const hit = await cache.match(cacheKey)
		if hit
			return await hit.json()
	const now = Date.now()
	const days = WINDOWS[windowName]
	const since = days ? Math.floor(now / 1000) - days * 86400 : 0
	const base = "WITH l AS MATERIALIZED (SELECT l.account, json_extract(l.metadata,'$.artist_name') AS artist, json_extract(l.metadata,'$.track_name') AS title FROM scrobble_listens l JOIN scrobble_accounts a ON a.account=l.account WHERE a.leaderboard=1 AND l.listened_at>=?1 AND l.created_at>?2 AND NOT EXISTS (SELECT 1 FROM account_bans b WHERE b.account=l.account)) "
	const [songs, artists, listeners] = await env.DB.batch([
		env.DB.prepare(base + 'SELECT MAX(artist) AS artist, MAX(title) AS title, COUNT(*) AS listens FROM l GROUP BY lower(artist), lower(title) ORDER BY listens DESC, lower(artist), lower(title) LIMIT ?3').bind(since, now - SCROBBLE_RETENTION_MS, BOARD_SIZE),
		env.DB.prepare(base + 'SELECT MAX(artist) AS artist, COUNT(*) AS listens FROM l GROUP BY lower(artist) ORDER BY listens DESC, lower(artist) LIMIT ?3').bind(since, now - SCROBBLE_RETENTION_MS, BOARD_SIZE),
		env.DB.prepare(base + 'SELECT l.account AS account, a.display_name AS display_name, COUNT(*) AS listens FROM l JOIN scrobble_accounts a ON a.account=l.account GROUP BY l.account ORDER BY listens DESC, l.account LIMIT ?3').bind(since, now - SCROBBLE_RETENTION_MS, BOARD_SIZE)
	])
	const board = {
		window: windowName
		generated_at: now
		songs: songs.results.map(do(r) {artist: r.artist, title: r.title, listens: r.listens})
		artists: artists.results.map(do(r) {artist: r.artist, listens: r.listens})
		listeners: listeners.results.map(do(r) {name: publicName(r), listens: r.listens})
	}
	if cache
		await cache.put(cacheKey, new Response(JSON.stringify(board), {headers: {'content-type': 'application/json', 'cache-control': 'public, max-age=' + BOARD_TTL_S}}))
	return board

const esc = do(value) String(value ?? '').replace(new RegExp('[&<>"\']', 'g'), do(c) ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c])

const STYLE = ':root{color-scheme:dark;--ink:#0b0e14;--ink-2:#111622;--solid:#151b28;--line:rgba(216,178,106,.22);--line-2:#2a3448;--text:#ece6d6;--muted:#a3acbc;--gold:#d8b26a;--gold-2:#f0d9a4;--aether:#6fd6d0;--glow-a:rgba(111,214,208,.13);--glow-g:rgba(216,178,106,.10);--shadow:0 18px 50px rgba(0,0,0,.45);--display:"Palatino Linotype",Palatino,"Book Antiqua","URW Palladio L","Iowan Old Style",Georgia,serif;--body:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans","Helvetica Neue",Arial,sans-serif;--mono:ui-monospace,"Cascadia Mono","JetBrains Mono","SF Mono",Menlo,Consolas,monospace;--radius:14px}' +
	'@media (prefers-color-scheme:light){:root{color-scheme:light;--ink:#f5f0e4;--ink-2:#efe7d6;--solid:#fffbf2;--line:rgba(134,97,31,.32);--line-2:#d8ccb6;--text:#1c212b;--muted:#535c6b;--gold:#7d5a1a;--gold-2:#5e430f;--aether:#0b6f6a;--glow-a:rgba(12,122,116,.10);--glow-g:rgba(134,97,31,.10);--shadow:0 14px 36px rgba(60,45,15,.16)}}' +
	'*{box-sizing:border-box}html{background:var(--ink)}body{margin:0;min-height:100vh;color:var(--text);font:16px/1.5 var(--body);background:radial-gradient(120vw 60vh at 15% -10%,var(--glow-a),transparent 70%),radial-gradient(120vw 60vh at 90% -10%,var(--glow-g),transparent 70%),var(--ink)}' +
	'header{display:flex;align-items:baseline;gap:.8rem;flex-wrap:wrap;max-width:1100px;margin:0 auto;padding:22px 16px 8px}header b{font:400 1.7rem var(--display);color:var(--gold-2)}header span{color:var(--muted);font:600 .74rem var(--mono);letter-spacing:.2em;text-transform:uppercase}' +
	'nav{max-width:1100px;margin:0 auto;padding:4px 16px 0;display:flex;gap:.5rem;flex-wrap:wrap}nav a{border:1px solid var(--line);border-radius:999px;padding:.3rem .85rem;color:var(--text);text-decoration:none;background:var(--solid)}nav a[aria-current]{background:var(--gold);color:var(--ink);border-color:var(--gold)}' +
	'main{max-width:1100px;margin:0 auto;padding:16px;display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))}' +
	'section{background:var(--solid);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:1.1rem 1.1rem .8rem;min-width:0}h2{margin:0 0 .6rem;font:400 1.35rem var(--display);color:var(--gold-2)}' +
	'ol{margin:0;padding:0;list-style:none;counter-reset:n}li{counter-increment:n;display:grid;grid-template-columns:2rem 1fr auto;gap:.5rem;align-items:baseline;padding:.4rem 0;border-top:1px solid var(--line-2)}li:first-child{border-top:0}li::before{content:counter(n);color:var(--gold);font:600 .85rem var(--mono)}' +
	'li span{overflow-wrap:anywhere}li small{display:block;color:var(--muted)}li b{font:600 .85rem var(--mono);color:var(--aether)}p{color:var(--muted);margin:0}.foot{max-width:1100px;margin:0 auto;padding:0 16px 32px;font-size:.88rem}.foot a{color:var(--aether)}'

def list(items, render)
	if !items.length
		return '<p>Nobody on this board yet.</p>'
	return '<ol>' + items.map(render).join('') + '</ol>'

export def leaderboardPage(board)
	const tabs = [['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['all', 'All time']].map(do([key, label])
		'<a href="' + PUBLIC_BASE + '/leaderboard?window=' + key + '"' + (key === board.window ? ' aria-current="page"' : '') + '>' + label + '</a>'
	).join('')
	const songs = list(board.songs, do(r) '<li><span>' + esc(r.title) + '<small>' + esc(r.artist) + '</small></span><b>' + r.listens + '</b></li>')
	const artists = list(board.artists, do(r) '<li><span>' + esc(r.artist) + '</span><b>' + r.listens + '</b></li>')
	const listeners = list(board.listeners, do(r) '<li><span>' + esc(r.name) + '</span><b>' + r.listens + '</b></li>')
	return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>Scrobbles leaderboard · spacegho.st</title><meta name="description" content="Top songs, artists and listeners on Spaceghost Scrobbles."><link rel="canonical" href="https://spacegho.st' + PUBLIC_BASE + '/leaderboard?window=' + board.window + '"><style>' + STYLE + '</style></head><body>' +
		'<header><b>Scrobbles leaderboard</b><span>spacegho.st</span></header><nav aria-label="Time window">' + tabs + '</nav>' +
		'<main><section aria-labelledby="songs"><h2 id="songs">Top songs</h2>' + songs + '</section><section aria-labelledby="artists"><h2 id="artists">Top artists</h2>' + artists + '</section><section aria-labelledby="listeners"><h2 id="listeners">Top listeners</h2>' + listeners + '</section></main>' +
		'<p class="foot">Completed listens from accounts that chose to appear here; history itself stays private. Updated every few minutes. <a href="' + PUBLIC_BASE + '/1/leaderboard?window=' + board.window + '">JSON</a> · <a href="' + PUBLIC_BASE + '/">Your dashboard</a></p></body></html>'

const PUBLIC_HEADERS = {'cache-control': 'public, max-age=60', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer'}

export def leaderboardHtml(env, url)
	let windowName = url.searchParams.get('window') || '7d'
	if !Object.hasOwn(WINDOWS, windowName)
		windowName = '7d'
	const board = await leaderboard(env, windowName)
	return new Response(leaderboardPage(board), {headers: {...PUBLIC_HEADERS, 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"}})

export def leaderboardJson(env, url)
	const board = await leaderboard(env, boardWindow(url))
	return new Response(JSON.stringify(board), {headers: {...PUBLIC_HEADERS, 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*'}})

# spacegho.st/scrobble/... is the canonical base; /mods/ffxiv/scrobble/... stays an alias.
# /scrobble/1/* runs the same API, /scrobble/leaderboard is the public page, anything
# else is the dashboard's static files. Returns null for other paths.
export def scrobbleAlias(request, env, ctx, url, handle)
	const p = url.pathname
	if p === SCROBBLE_BASE + '/leaderboard' || p === SCROBBLE_BASE + '/leaderboard/'
		return await leaderboardHtml(env, url)
	if p !== PUBLIC_BASE && !p.startsWith(PUBLIC_BASE + '/')
		return null
	if p === PUBLIC_BASE
		return new Response(null, {status: 301, headers: {location: PUBLIC_BASE + '/' + url.search}})
	const rest = p.slice(PUBLIC_BASE.length)
	if rest === '/leaderboard' || rest === '/leaderboard/'
		return await leaderboardHtml(env, url)
	const target = new URL(SCROBBLE_BASE + rest + url.search, url.origin)
	if rest.startsWith('/1/')
		return await handle(new Request(target, request), env, ctx)
	if !env.ASSETS || !['GET', 'HEAD'].includes(request.method)
		return new Response('Not found\n', {status: 404, headers: {'content-type': 'text/plain; charset=utf-8'}})
	return await env.ASSETS.fetch(new Request(target, {method: request.method, headers: request.headers}))
