// Generated from imba/src/session.imba; edit the Imba source.
import {iterable$} from 'imba/runtime';

/*body*/
// Sign-in building blocks with no bindings and no network: signed cookies (HMAC-SHA256
// through WebCrypto), account voter keys, admin gating, the return-path check and PKCE.
//
// A signed value is `v1.<base64url JSON payload>.<base64url HMAC>`. The MAC covers the
// version, a purpose ('session' or 'oauth') and the payload, so a state cookie can never
// pass as a session. Every payload carries `exp` (Unix seconds). SESSION_SECRET signs;
// SESSION_SECRET_PREVIOUS (optional) still verifies, so the secret can be rotated
// without signing everybody out.
//
// A session also carries `iat`, the sign-in time. Renewal copies it, so a session can be
// renewed for at most SESSION_MAX_AGE_S after sign-in (ADMIN_SESSION_MAX_AGE_S for an
// ADMIN_ACCOUNTS entry); after that it counts as expired and the voter signs in again.
import {BASE,VOTE_MODS,base64url,cookie,fromBase64url,parseCookies,randomToken,sha256hex,utf8} from './lib.js';

export const TOKEN_VERSION = 'v1';

export const SESSION_COOKIE = '__Secure-ghostty_session';

export const STATE_COOKIE = '__Secure-ghostty_oauth';

export const AUTH_PATH = (BASE + '/api/auth');

export const SESSION_TTL_S = (((30 * 24) * 60) * 60);

export const SESSION_RENEW_S = (((15 * 24) * 60) * 60);

export const SESSION_MAX_AGE_S = (((90 * 24) * 60) * 60);

export const ADMIN_SESSION_MAX_AGE_S = (((14 * 24) * 60) * 60);

export const STATE_TTL_S = (20 * 60);

export const SECRET_MIN = 32;

export const PROVIDERS = Object.freeze(['github','xivauth']);

const KEY_RE = new RegExp('^[0-9a-f]{64}$','');

const MAX_TOKEN = 2048;

export const nowSeconds = function() {
	return Math.floor((Date.now() / 1000));
};

const isObject = function(v) {
	return (((!(!v)) && ((typeof v) === 'object')) && (!Array.isArray(v)));
};

export function sessionSecrets(env){
	const ok = function(s) {
		return (((typeof s) === 'string') && (s.length >= SECRET_MIN));
	};
	if ((!(ok(
		function() {
			let cursor$1 = env;
			let cursor$2 = undefined;
			if (cursor$1 == null) {
				return undefined;
			};
			cursor$2 = cursor$1;
			cursor$1 = cursor$1.SESSION_SECRET;
			return cursor$1;
		}()
	)))) {
		return [];
	};
	return [env.SESSION_SECRET,env.SESSION_SECRET_PREVIOUS].filter(ok);
	return;
};

const keys = new Map();

function hmacKey(secret){
	let key = keys.get(secret);
	if ((!key)) {
		key = crypto.subtle.importKey('raw',utf8(secret),{name: 'HMAC',hash: 'SHA-256'},false,['sign','verify']);
		keys.set(secret,key);
	};
	return key;
	return;
};

export async function signValue(secret,purpose,payload){
	const body = base64url(utf8(JSON.stringify(payload)));
	const mac = (await crypto.subtle.sign('HMAC',(await hmacKey(secret)),utf8(('' + String(TOKEN_VERSION) + '.' + String(purpose) + '.' + String(body) + ''))));
	return ('' + String(TOKEN_VERSION) + '.' + String(body) + '.' + String(base64url(new Uint8Array(mac))) + '');
	return;
};

export async function verifyValue(secrets,purpose,value,now = nowSeconds()){
	if ((((typeof value) !== 'string') || (value.length > MAX_TOKEN))) {
		return null;
	};
	const parts = value.split('.');
	if (((parts.length !== 3) || (parts[0] !== TOKEN_VERSION))) {
		return null;
	};
	const mac = fromBase64url(parts[2]);
	if (((!mac) || (mac.length !== 32))) {
		return null;
	};
	const signed = utf8(('' + String(TOKEN_VERSION) + '.' + String(purpose) + '.' + String(parts[1]) + ''));
	for (let secret of iterable$(secrets)){
		if ((!((await crypto.subtle.verify('HMAC',(await hmacKey(secret)),mac,signed))))) {
			continue;
		};
		let payload;
		try {
			payload = JSON.parse(new TextDecoder('utf-8',{fatal: true}).decode(fromBase64url(parts[1])));
		} catch ($1) {
			return null;
		};
		if ((((!isObject(payload)) || (!Number.isSafeInteger(payload.exp))) || (payload.exp <= now))) {
			return null;
		};
		return payload;
	};
	return null;
	return;
};

export function constantTimeEqual(a,b){
	if (((((typeof a) !== 'string') || ((typeof b) !== 'string')) || (a.length !== b.length))) {
		return false;
	};
	let diff = 0;
	let cursor$3 = 0;
	while ((cursor$3 < a.length)){
		diff |= (a.charCodeAt(cursor$3) ^ b.charCodeAt(cursor$3));
		cursor$3++;
	};
	return (diff === 0);
	return;
};

export const accountKey = function(provider,userId) {
	return sha256hex(((provider + ':') + userId));
};

export const isAccountId = function(provider,id) {
	return ((PROVIDERS.includes(provider) && ((typeof id) === 'string')) && ((provider === 'github') ? (new RegExp('^[1-9]\\d{0,15}$','').test(id)) : (new RegExp('^[A-Za-z0-9-]{1,64}$','').test(id))));
};

export function adminAccounts(value){
	if (((typeof value) !== 'string')) {
		return [];
	};
	return value.split(new RegExp('[\\s,]+','')).filter(
		function(entry) {
			const at = entry.indexOf(':');
			return ((at > 0) && isAccountId(entry.slice(0,at),entry.slice((at + 1))));
			return;
		}
	);
	return;
};

export async function isAdmin(env,session){
	if ((!session)) {
		return false;
	};
	let match = false;
	for (let entry of iterable$(adminAccounts(
		function() {
			let cursor$4 = env;
			let cursor$5 = undefined;
			if (cursor$4 == null) {
				return undefined;
			};
			cursor$5 = cursor$4;
			cursor$4 = cursor$4.ADMIN_ACCOUNTS;
			return cursor$4;
		}()
	))){
		const at = entry.indexOf(':');
		if (((entry.slice(0,at) === session.p) && constantTimeEqual((await sha256hex(entry)),session.k))) {
			match = true;
		};
	};
	return match;
	return;
};

export const sessionLimit = function(iat,admin) {
	return (iat + (admin ? ADMIN_SESSION_MAX_AGE_S : SESSION_MAX_AGE_S));
};

export async function sessionCookie(env,{p: p,k: k,iat: iat},now = nowSeconds()){
	const [secret] = sessionSecrets(env);
	if ((!secret)) {
		throw new Error('SESSION_SECRET is not configured');
	};
	if ((iat === undefined)) {
		iat = now;
	};
	const exp = Math.min((now + SESSION_TTL_S),sessionLimit(iat,(await isAdmin(env,{p: p,k: k}))));
	if (((!Number.isSafeInteger(iat)) || (exp <= now))) {
		throw new Error('session is past its maximum age');
	};
	const value = (await signValue(secret,'session',{p: p,k: k,iat: iat,exp: exp}));
	return cookie(SESSION_COOKIE,value,BASE,(exp - now));
	return;
};

export const clearSessionCookie = function() {
	return cookie(SESSION_COOKIE,'',BASE,0);
};

export async function readSession(request,env,now = nowSeconds()){
	const value = parseCookies(request.headers.get('cookie'))[SESSION_COOKIE];
	if ((!value)) {
		return null;
	};
	const s = (await verifyValue(sessionSecrets(env),'session',value,now));
	if (((((!s) || (!PROVIDERS.includes(s.p))) || ((typeof s.k) !== 'string')) || (!KEY_RE.test(s.k)))) {
		return null;
	};
	if (((!Number.isSafeInteger(s.iat)) || (s.iat > s.exp))) {
		return null;
	};
	const session = {p: s.p,k: s.k,iat: s.iat,exp: s.exp};
	const age = (now - s.iat);
	if (((age > SESSION_MAX_AGE_S) || ((age > ADMIN_SESSION_MAX_AGE_S) && (await isAdmin(env,session))))) {
		return null;
	};
	return session;
	return;
};

export async function stateCookie(env,state,now = nowSeconds()){
	const [secret] = sessionSecrets(env);
	const value = (await signValue(secret,'oauth',{...state,exp: (now + STATE_TTL_S)}));
	return cookie(STATE_COOKIE,value,AUTH_PATH,STATE_TTL_S);
	return;
};

export const clearStateCookie = function() {
	return cookie(STATE_COOKIE,'',AUTH_PATH,0);
};

export async function readState(request,env,now = nowSeconds()){
	const value = parseCookies(request.headers.get('cookie'))[STATE_COOKIE];
	if ((!value)) {
		return null;
	};
	const s = (await verifyValue(sessionSecrets(env),'oauth',value,now));
	if (((((!s) || (!PROVIDERS.includes(s.p))) || ((typeof s.s) !== 'string')) || ((typeof s.cv) !== 'string'))) {
		return null;
	};
	if (((s.m !== 'signin') && (!((((s.m === 'link') && ((typeof s.k) === 'string')) && KEY_RE.test(s.k)))))) {
		return null;
	};
	return s;
	return;
};

export const stateMatches = function(cookieState,queryState) {
	return ((!(!cookieState)) && constantTimeEqual(cookieState.s,queryState));
};

const RETURNS = new Set(['/mods/ffxiv/scrobble/',(BASE + '/'),(BASE + '/admin/'),(BASE + '/apps/'),'/mods/ffxiv/term/gallery/','/mods/ffxiv/term/','/mods/ffxiv/xivmcp/','/mods/ffxiv/xivdesktop/','/mods/ffxiv/xivarcade/','/mods/ffxiv/xivwayfinder/','/mods/ffxiv/xivlantern/','/mods/ffxiv/xivpiano/','/mods/ffxiv/almanac/about/',...Object.values(VOTE_MODS)]);

const USER_CODE_RE = new RegExp('^[A-Z]{4}-[A-Z]{4}$','');

export function safeReturnPath(raw){
	const fallback = (BASE + '/');
	if ((((((typeof raw) !== 'string') || (raw.length > 256)) || (!raw.startsWith('/'))) || raw.startsWith('//'))) {
		return fallback;
	};
	if (new RegExp('[\\\\\\u0000-\\u0020\\u007f]','').test(raw)) {
		return fallback;
	};
	let u;
	try {
		u = new URL(raw,'https://return.invalid');
	} catch ($2) {
		return fallback;
	};
	if ((((u.origin !== 'https://return.invalid') || u.username) || u.password)) {
		return fallback;
	};
	if (((!RETURNS.has(u.pathname)) || raw.includes('..'))) {
		return fallback;
	};
	if ((u.pathname === (BASE + '/apps/'))) {
		const code = u.searchParams.get('code');
		return (u.pathname + (((code !== null) && USER_CODE_RE.test(code)) ? (('?code=' + code)) : ''));
	};
	const since = u.searchParams.get('since');
	return (u.pathname + (((since !== null) && new RegExp('^\\d{1,9}$','').test(since)) ? (('?since=' + since)) : ''));
	return;
};

export async function pkcePair(){
	const verifier = randomToken(32);
	const challenge = base64url(new Uint8Array((await crypto.subtle.digest('SHA-256',utf8(verifier)))));
	return {verifier: verifier,challenge: challenge};
	return;
};
