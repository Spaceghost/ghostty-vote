# Scrobbles accounts provisioned by other spacegho.st services. Reached only through
# the service-binding entrypoint in entry.js (no public route provisions anything):
# a caller names an external identity {provider, subject} and gets an ordinary
# Scrobbles account plus client tokens for it. Everything else (private history,
# retention, export, delete, forwarding) is the same code path as any account.
#
# The dashboard sign-in for these accounts is a one-time ticket the provisioning
# service asks for and hands to its user as a link. Redeeming it sets a separate,
# path-scoped session cookie that only the scrobble and recording controls read;
# it never signs anybody in to voting or the rest of the site.
import {BASE, cookie, parseCookies, randomToken, sha256hex, cleanText} from './lib.js'
import {nowSeconds, sessionSecrets, signValue, verifyValue} from './session.js'
import {SCROBBLE_BASE, SCROBBLE_BROWSER, problem} from './scrobble-data.js'

export const EXTERNAL_PROVIDERS = Object.freeze(['spacegho.st'])
export const EXTERNAL_COOKIE = '__Secure-scrobble_external'
export const EXTERNAL_COOKIE_PATH = BASE + '/api'
export const EXTERNAL_SESSION_S = (12 * 3600)
export const TICKET_TTL_MS = 120000
export const TICKET_PATH = SCROBBLE_BROWSER + 'ticket'
const SUBJECT_RE = new RegExp('^[A-Za-z0-9_-]{16,128}$')
const KEY_RE = new RegExp('^[0-9a-f]{64}$')
const TICKET_RE = new RegExp('^sgt_[A-Za-z0-9_-]{43}$')
const ID_RE = new RegExp('^[A-Za-z0-9_-]{1,64}$')
const MAX_TOKENS = 8

export def isExternalProvider(provider)
	return EXTERNAL_PROVIDERS.includes(provider)

def identity(input)
	if !input || typeof input !== 'object' || !isExternalProvider(input.provider) || typeof input.subject !== 'string' || !SUBJECT_RE.test(input.subject)
		problem(400, 'invalid_identity', 'An external identity needs a known provider and an opaque subject.')
	return {provider: input.provider, subject: input.subject}

export def displayName(value)
	const name = cleanText(typeof value === 'string' ? value : '') || ''
	return name.replace(new RegExp('[<>]', 'g'), '').slice(0, 40)

def label(value)
	return (cleanText(typeof value === 'string' ? value : '') || 'external client').slice(0, 80)

export def externalKey(provider, subject)
	return sha256hex(provider + ':' + subject)

# Creates the account on first use; a display name is set only when there is none yet,
# or when `rename` is true.
export def ensureExternal(env, input, rename = false)
	const who = identity(input)
	const key = await externalKey(who.provider, who.subject)
	const name = displayName(input.display_name)
	const now = Date.now()
	await env.DB.batch([
		env.DB.prepare('INSERT OR IGNORE INTO scrobble_accounts(account,provider,epoch,created_at) VALUES(?,?,?,?)').bind(key, who.provider, randomToken(16), now),
		env.DB.prepare('INSERT INTO scrobble_external(account,provider,subject,display_name,created_at) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(account) DO UPDATE SET display_name=CASE WHEN ?6=1 AND ?4<>\'\' THEN ?4 WHEN scrobble_external.display_name=\'\' THEN ?4 ELSE scrobble_external.display_name END').bind(key, who.provider, who.subject, name, now, rename ? 1 : 0)
	])
	return await env.DB.prepare('SELECT a.account,a.provider,a.epoch,e.display_name FROM scrobble_accounts a JOIN scrobble_external e ON e.account=a.account WHERE a.account=?').bind(key).first()

# {token, token_id, user_name}. `revoke` lists earlier token ids of this account to
# revoke first; beyond eight active tokens the oldest is revoked.
export def provisionToken(env, input)
	const account = await ensureExternal(env, input)
	const key = account.account
	const now = Date.now()
	const revoke = Array.isArray(input.revoke) ? input.revoke.filter(do(id) typeof id === 'string' && ID_RE.test(id)).slice(0, 16) : []
	if revoke.length
		await env.DB.prepare('UPDATE scrobble_tokens SET revoked_at=?1 WHERE account=?2 AND revoked_at=0 AND id IN (SELECT value FROM json_each(?3))').bind(now, key, JSON.stringify(revoke)).run()
	await env.DB.prepare('UPDATE scrobble_tokens SET revoked_at=?1 WHERE id IN (SELECT id FROM scrobble_tokens WHERE account=?2 AND revoked_at=0 ORDER BY created_at DESC LIMIT -1 OFFSET ?3)').bind(now, key, MAX_TOKENS - 1).run()
	const token = 'sgs_' + randomToken(32)
	const id = randomToken(16)
	await env.DB.prepare('INSERT INTO scrobble_tokens(id,account,token_hash,label,prefix,created_at) VALUES(?,?,?,?,?,?)').bind(id, key, await sha256hex(token), label(input.label), token.slice(0, 12), now).run()
	return {token: token, token_id: id, user_name: account.display_name || userNameFor(account)}

# Revokes the listed tokens, or every active token of the account when none are listed.
export def revokeExternal(env, input)
	const who = identity(input)
	const key = await externalKey(who.provider, who.subject)
	const now = Date.now()
	const ids = Array.isArray(input.token_ids) ? input.token_ids.filter(do(id) typeof id === 'string' && ID_RE.test(id)).slice(0, 64) : null
	let result
	if ids
		result = await env.DB.prepare('UPDATE scrobble_tokens SET revoked_at=?1 WHERE account=?2 AND revoked_at=0 AND id IN (SELECT value FROM json_each(?3)) RETURNING id').bind(now, key, JSON.stringify(ids)).all()
	else
		result = await env.DB.prepare('UPDATE scrobble_tokens SET revoked_at=?1 WHERE account=?2 AND revoked_at=0 RETURNING id').bind(now, key).all()
	return {revoked: result.results.length}

export def renameExternal(env, input)
	if !displayName(input && input.display_name)
		problem(400, 'invalid_display_name', 'A display name needs at least one visible character.')
	const account = await ensureExternal(env, input, true)
	return {user_name: account.display_name}

# {url, expires_at}: a one-time link that signs the identity in to the dashboard.
export def issueTicket(env, input, origin = 'https://spacegho.st')
	const account = await ensureExternal(env, input)
	const ticket = 'sgt_' + randomToken(32)
	const now = Date.now()
	if Math.random() < 0.1
		await env.DB.prepare('DELETE FROM scrobble_tickets WHERE expires_at<?').bind(now).run()
	await env.DB.prepare('INSERT INTO scrobble_tickets(ticket_hash,account,expires_at) VALUES(?,?,?)').bind(await sha256hex(ticket), account.account, now + TICKET_TTL_MS).run()
	return {url: origin + TICKET_PATH + '?t=' + ticket, expires_at: now + TICKET_TTL_MS}

export def userNameFor(account)
	return account.provider + '-' + account.account.slice(0, 12)

def page(status, message)
	const body = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Spaceghost Scrobbles</title></head><body><main><h1>Spaceghost Scrobbles</h1><p>' + message + '</p><p><a href="' + SCROBBLE_BASE + '/">Open the dashboard</a></p></main></body></html>'
	return new Response(body, {status: status, headers: {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'"}})

# GET <TICKET_PATH>?t=…: consume the ticket, set the external session cookie, go to the dashboard.
export def redeemTicket(request, env, url)
	if request.method !== 'GET'
		return new Response(null, {status: 405, headers: {allow: 'GET'}})
	const ticket = url.searchParams.get('t') || ''
	const [secret] = sessionSecrets(env)
	if !TICKET_RE.test(ticket) || !secret
		return page(400, 'This sign-in link is not valid. Open your listening history from the app again.')
	const row = await env.DB.prepare('DELETE FROM scrobble_tickets WHERE ticket_hash=? RETURNING account,expires_at').bind(await sha256hex(ticket)).first()
	if !row || row.expires_at <= Date.now()
		return page(400, 'This sign-in link has expired or was already used. Open your listening history from the app again.')
	const account = await env.DB.prepare('SELECT a.account,a.provider FROM scrobble_accounts a JOIN scrobble_external e ON e.account=a.account WHERE a.account=?').bind(row.account).first()
	if !account
		return page(400, 'This account no longer exists.')
	const now = nowSeconds()
	const value = await signValue(secret, 'scrobble-external', {p: account.provider, k: account.account, iat: now, exp: now + EXTERNAL_SESSION_S})
	const res = new Response(null, {status: 303, headers: {location: SCROBBLE_BASE + '/', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer'}})
	res.headers.append('set-cookie', cookie(EXTERNAL_COOKIE, value, EXTERNAL_COOKIE_PATH, EXTERNAL_SESSION_S))
	return res

export def readExternalSession(request, env, now = nowSeconds())
	const value = parseCookies(request.headers.get('cookie'))[EXTERNAL_COOKIE]
	if !value
		return null
	const s = await verifyValue(sessionSecrets(env), 'scrobble-external', value, now)
	if !s || !isExternalProvider(s.p) || typeof s.k !== 'string' || !KEY_RE.test(s.k)
		return null
	return {p: s.p, k: s.k, iat: s.iat, exp: s.exp, external: true}

export def clearExternalCookie()
	return cookie(EXTERNAL_COOKIE, '', EXTERNAL_COOKIE_PATH, 0)

export def externalName(env, key)
	const row = await env.DB.prepare('SELECT display_name FROM scrobble_external WHERE account=?').bind(key).first()
	return (row && row.display_name) || ''
