# Pure request helpers: routing, cookies, voter identity, body parsing and
# validation. No bindings, so `node --test` can exercise them directly.
# Signed sessions and sign-in helpers live in session.js.
# The page, script, styles, ideas.json and version.json are static assets
# (public/); only the API paths below ever reach the Worker.

export const BASE = '/mods/ffxiv/term/vote'

export const API_PREFIX = (BASE + '/api/')

export const VOTE_MODS = Object.freeze({ghostty: '/mods/ffxiv/term/vote/', xivmcp: '/mods/ffxiv/xivmcp/vote/', xivdesktop: '/mods/ffxiv/xivdesktop/vote/', xivarcade: '/mods/ffxiv/xivarcade/vote/', xivwayfinder: '/mods/ffxiv/xivwayfinder/vote/', xivlantern: '/mods/ffxiv/xivlantern/vote/', xivpiano: '/mods/ffxiv/xivpiano/vote/', almanac: '/mods/ffxiv/almanac/vote/', xivprism: '/mods/ffxiv/xivprism/vote/', xivdispatch: '/mods/ffxiv/xivdispatch/vote/', xivcamp: '/mods/ffxiv/xivcamp/vote/', ackerman: '/os/ackerman-os/vote/', 'ackerman-android': '/os/ackerman-os/vote/android/', 'ackerman-deck': '/os/ackerman-os/vote/tdeck/', 'ackerman-watch': '/os/ackerman-os/vote/twatch/'})

export const DEFAULT_VOTE_MOD = 'ghostty'

export def voteMod(raw)
	if (((raw === null) || (raw === undefined)) || (raw === ''))
		return DEFAULT_VOTE_MOD
	return (Object.hasOwn(VOTE_MODS, raw) ? raw : null)
	return

export const GALLERY_BASE = '/mods/ffxiv/term/gallery'

export const ALMANAC_BASE = '/mods/ffxiv/almanac'

import { PLUGINS_PATH } from '../scripts/plugins-lib.js'

export { PLUGINS_PATH }

const SHOT_ID_RE = new RegExp('^[A-Za-z0-9_-]{22}$', '')

export const COOKIE_NAME = '__Secure-ghostty_voter'

export const VOTES = Object.freeze(['want', 'maybe', 'skip'])

export const ID_RE = new RegExp('^[a-z0-9][a-z0-9-]{0,63}$', '')

const TOKEN_RE = new RegExp('^[A-Za-z0-9_-]{43}$', '')

export const LIMITS = Object.freeze({note: 280, title: 80, titleMin: 3, detail: 600, bodyBytes: 4096, windowMs: ((10 * 60) * 1000), writesPerWindow: 300, dayMs: (((24 * 60) * 60) * 1000), suggestionsPerVoterPerDay: 10, suggestionsPerDay: 300, mySuggestions: 50, adminSuggestions: 1000, tallyTtlSeconds: 60})

export const API = Object.freeze({vote: 'POST', suggest: 'POST', tallies: 'GET', mine: 'GET', 'auth/github/start': 'GET', 'auth/github/callback': 'GET', 'auth/xivauth/start': 'GET', 'auth/xivauth/callback': 'GET', 'auth/xivauth/link': 'GET', 'auth/logout': 'POST', 'auth/me': 'GET', 'auth/character/forget': 'POST', 'shots/upload': 'POST', 'admin/voters': 'GET', 'admin/gallery': 'GET', 'admin/gallery/image': 'GET', 'admin/gallery/review': 'POST', 'admin/gallery/thumb': 'POST', 'admin/almanac': 'GET', 'admin/almanac/review': 'POST', 'admin/almanac/suite': 'POST', 'gallery/upload': 'POST', 'gallery/vote': 'POST', 'gallery/mine': 'GET', 'device/code': 'POST', 'device/token': 'POST', 'device/lookup': 'POST', 'device/approve': 'POST', apps: 'GET', 'apps/revoke': 'POST', 'token/revoke': 'POST', 'admin/accounts': 'GET', 'admin/accounts/ban': 'POST', 'admin/tokens/revoke': 'POST'})

const GALLERY_API = Object.freeze({'/api/upload': 'POST', '/api/shots': 'GET'})

export const isShotId = (do(id)
	return (((typeof id) === 'string') && SHOT_ID_RE.test(id))
)

const ALMANAC_API = Object.freeze({'/api/results': ['almanac/results', 'POST'], '/leaderboard.json': ['almanac/leaderboard', 'GET'], '/recommendations.json': ['almanac/recommendations', 'GET']})

export def route(pathname)
	if (pathname === PLUGINS_PATH)
		return {kind: 'api', name: 'plugins', method: 'GET'}
	if pathname.startsWith((ALMANAC_BASE + '/'))
		const rest = pathname.slice(ALMANAC_BASE.length)
		return (Object.hasOwn(ALMANAC_API, rest) ? {kind: 'api', name: ALMANAC_API[rest][0], method: ALMANAC_API[rest][1]} : {kind: 'none'})
	if pathname.startsWith((GALLERY_BASE + '/'))
		const rest = pathname.slice(GALLERY_BASE.length)
		if Object.hasOwn(GALLERY_API, rest)
			return {kind: 'api', name: ('gallery' + rest.slice(4)), method: GALLERY_API[rest]}
		const m = new RegExp('^\\/(img|thumb)\\/([^/]+)$', '').exec(rest)
		if (m && isShotId(m[2]))
			return {kind: 'api', name: ('gallery/' + m[1]), method: 'GET', id: m[2]}
		return {kind: 'none'}
	if (! pathname.startsWith(API_PREFIX))
		return {kind: 'none'}
	const name = pathname.slice(API_PREFIX.length)
	return (Object.hasOwn(API, name) ? {kind: 'api', name: name, method: API[name]} : {kind: 'none'})
	return

export def parseCookies(header)
	const out = Object.create(null)
	if ((typeof header) !== 'string')
		return out
	for part of header.split(';')
		const eq = part.indexOf('=')
		if (eq <= 0)
			continue
		const name = part.slice(0, eq).trim()
		if (name && (! Reflect.has(out, name)))
			(out[name] = part.slice((eq + 1)).trim())
	return out
	return

export def voterToken(cookieHeader)
	const t = parseCookies(cookieHeader)[COOKIE_NAME]
	return ((((typeof t) === 'string') && TOKEN_RE.test(t)) ? t : null)
	return

export const utf8 = (do(text)
	return new TextEncoder().encode(text)
)

export def base64url(bytes)
	let s = ''
	for b of bytes
		(s += String.fromCharCode(b))
	return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replace(new RegExp('=+$', ''), '')
	return

export def fromBase64url(text)
	if ((((typeof text) !== 'string') || (! new RegExp('^[A-Za-z0-9_-]*$', '').test(text))) || ((text.length % 4) === 1))
		return null
	const bin = atob((text.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat(((4 - (text.length % 4)) % 4))))
	const out = new Uint8Array(bin.length)
	let cursor$1 = 0
	while (cursor$1 < bin.length)
		(out[cursor$1] = bin.charCodeAt(cursor$1))
		(cursor$1++)
	return out
	return

export def sha256hex(text)
	const digest = (await crypto.subtle.digest('SHA-256', utf8(text)))
	return [...new Uint8Array(digest)].map(
		(do(b)
			return b.toString(16).padStart(2, '0')
		)
	).join('')
	return

export def randomToken(byteLength = 32)
	const bytes = new Uint8Array(byteLength)
	crypto.getRandomValues(bytes)
	return base64url(bytes)
	return

export const voterKey = (do(token)
	return sha256hex(('ghostty-vote:' + token))
)

export const cookie = (do(name, value, path, maxAge)
	return ('' + String(name) + '=' + String(value) + '; Path=' + String(path) + '; Max-Age=' + String(maxAge) + '; HttpOnly; Secure; SameSite=Lax')
)

export const clearVoterCookie = (do()
	return cookie(COOKIE_NAME, '', BASE, 0)
)

export def isJsonContentType(value)
	return (((typeof value) === 'string') && new RegExp('^application\\/json\\s*(;|$)', 'i').test(value.trim()))
	return

export def isSameOrigin(request, url)
	const origin = request.headers.get('origin')
	if ((origin !== null) && (origin !== url.origin))
		return false
	const site = request.headers.get('sec-fetch-site')
	return (! ((site && (site !== 'same-origin')) && (site !== 'none')))
	return

const fail = (do(status, error, message)
	return {ok: false, status: status, error: error, message: message}
)

export def readJsonBody(request, maxBytes = LIMITS.bodyBytes)
	if (! isJsonContentType(request.headers.get('content-type')))
		return fail(415, 'not_json', 'Send a JSON body with Content-Type: application/json.')
	const declared = Number(request.headers.get('content-length'))
	if (declared > maxBytes)
		return fail(413, 'too_large', 'Request body is too large.')
	const chunks = []
	let total = 0
	if request.body
		const reader = request.body.getReader()
		while true
			const {done: done, value: value} = (await reader.read())
			if done
				break
			(total += value.byteLength)
			if (total > maxBytes)
				(await reader.cancel().catch(
					(do()
						undefined
						return
					)
				))
				return fail(413, 'too_large', 'Request body is too large.')
			chunks.push(value)
	const bytes = new Uint8Array(total)
	let off = 0
	for c of chunks
		bytes.set(c, off)
		(off += c.byteLength)
	let value
	try
		(value = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)))
	catch
		return fail(400, 'bad_json', 'Body is not valid JSON.')
	if (((value === null) || ((typeof value) !== 'object')) || Array.isArray(value))
		return fail(400, 'bad_json', 'Body must be a JSON object.')
	return {ok: true, value: value}
	return

export def cleanText(value, {multiline: multiline = false} = {})
	if ((typeof value) !== 'string')
		return null
	let s = value.normalize('NFC').replace(new RegExp('\\r\\n?', 'g'), '\n')
	(s = s.replace(new RegExp('[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f-\\u009f\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069]', 'g'), ''))
	(s = (multiline ? s.replace(new RegExp('\\t', 'g'), ' ').replace(new RegExp('\\n{3,}', 'g'), '\n\n') : s.replace(new RegExp('\\s+', 'g'), ' ')))
	return s.trim()
	return

export def validateVote(body)
	const {idea_id: ideaId} = body
	if (((typeof ideaId) !== 'string') || (! ID_RE.test(ideaId)))
		return fail(400, 'bad_idea_id', 'idea_id is missing or malformed.')
	let vote = null
	if ((body.vote === null) || (body.vote === ''))
		(vote = '')
	else
		if (body.vote !== undefined)
			if (! VOTES.includes(body.vote))
				return fail(400, 'bad_vote', 'vote must be "want", "maybe", "skip", or null to clear it.')
			(vote = body.vote)
	let note = null
	if ((body.note !== undefined) && (body.note !== null))
		(note = cleanText(body.note, {multiline: true}))
		if (note === null)
			return fail(400, 'bad_note', 'note must be a string.')
		if (note.length > LIMITS.note)
			return fail(400, 'note_too_long', ('note must be at most ' + String(LIMITS.note) + ' characters.'))
	if ((body.vote === undefined) && (note === null))
		return fail(400, 'nothing_to_save', 'Send a vote, a note, or both.')
	return {ok: true, value: {idea_id: ideaId, vote: vote, note: note}}
	return

export def validateSuggestion(body)
	const title = cleanText(body.title)
	if ((title === null) || (title.length < LIMITS.titleMin))
		return fail(400, 'bad_title', ('title must be at least ' + String(LIMITS.titleMin) + ' characters.'))
	if (title.length > LIMITS.title)
		return fail(400, 'title_too_long', ('title must be at most ' + String(LIMITS.title) + ' characters.'))
	let detail = ''
	if ((body.detail !== undefined) && (body.detail !== null))
		(detail = cleanText(body.detail, {multiline: true}))
		if (detail === null)
			return fail(400, 'bad_detail', 'detail must be a string.')
		if (detail.length > LIMITS.detail)
			return fail(400, 'detail_too_long', ('detail must be at most ' + String(LIMITS.detail) + ' characters.'))
	const mod = voteMod(body.mod)
	if (mod === null)
		return fail(400, 'unknown_mod', 'No vote for that mod.')
	return {ok: true, value: {title: title, detail: detail, mod: mod}}
	return

export const PRIVATE = Object.freeze({'cache-control': 'private, no-store', vary: 'Cookie'})

export def json(data, {status: status = 200, headers: headers = {}} = {})
	return new Response(JSON.stringify(data), {status: status, headers: {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers}})
	return
