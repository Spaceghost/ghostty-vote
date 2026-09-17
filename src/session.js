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
import { BASE, base64url, cookie, fromBase64url, parseCookies, randomToken, sha256hex, utf8 } from './lib.js';

export const TOKEN_VERSION = 'v1';
export const SESSION_COOKIE = '__Secure-ghostty_session';
export const STATE_COOKIE = '__Secure-ghostty_oauth';
export const AUTH_PATH = BASE + '/api/auth';
export const SESSION_TTL_S = 30 * 24 * 60 * 60;
export const SESSION_RENEW_S = 15 * 24 * 60 * 60; // api/auth/me re-issues a session with less than this left
export const SESSION_MAX_AGE_S = 90 * 24 * 60 * 60; // since sign-in, renewals included
export const ADMIN_SESSION_MAX_AGE_S = 14 * 24 * 60 * 60;
export const STATE_TTL_S = 20 * 60; // long enough to log in (or sign up) at the provider
export const SECRET_MIN = 32;
export const PROVIDERS = Object.freeze(['github', 'xivauth']);
const KEY_RE = /^[0-9a-f]{64}$/;
const MAX_TOKEN = 2048;

export const nowSeconds = () => Math.floor(Date.now() / 1000);
const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// [signing secret, older secrets still accepted]; empty when SESSION_SECRET is unusable.
export function sessionSecrets(env) {
  const ok = (s) => typeof s === 'string' && s.length >= SECRET_MIN;
  if (!ok(env?.SESSION_SECRET)) return [];
  return [env.SESSION_SECRET, env.SESSION_SECRET_PREVIOUS].filter(ok);
}

const keys = new Map();
function hmacKey(secret) {
  let key = keys.get(secret);
  if (!key) {
    key = crypto.subtle.importKey('raw', utf8(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
    keys.set(secret, key);
  }
  return key;
}

export async function signValue(secret, purpose, payload) {
  const body = base64url(utf8(JSON.stringify(payload)));
  const mac = await crypto.subtle.sign('HMAC', await hmacKey(secret), utf8(`${TOKEN_VERSION}.${purpose}.${body}`));
  return `${TOKEN_VERSION}.${body}.${base64url(new Uint8Array(mac))}`;
}

// The payload, or null if the value is malformed, signed with no accepted secret, for
// another purpose, or expired. crypto.subtle.verify compares the MAC in constant time.
export async function verifyValue(secrets, purpose, value, now = nowSeconds()) {
  if (typeof value !== 'string' || value.length > MAX_TOKEN) return null;
  const parts = value.split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) return null;
  const mac = fromBase64url(parts[2]);
  if (!mac || mac.length !== 32) return null;
  const signed = utf8(`${TOKEN_VERSION}.${purpose}.${parts[1]}`);
  for (const secret of secrets) {
    if (!(await crypto.subtle.verify('HMAC', await hmacKey(secret), mac, signed))) continue;
    let payload;
    try {
      payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(fromBase64url(parts[1])));
    } catch {
      return null;
    }
    if (!isObject(payload) || !Number.isSafeInteger(payload.exp) || payload.exp <= now) return null;
    return payload;
  }
  return null;
}

// For comparing secrets that are not MACs (the OAuth state): time depends only on length.
export function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let n = 0; n < a.length; n++) diff |= a.charCodeAt(n) ^ b.charCodeAt(n);
  return diff === 0;
}

// ---- accounts -------------------------------------------------------------------
// One ballot per account: the voter key is sha256hex('provider:' + provider_user_id).
// Nothing else about the account (no login name, email or token) is kept.
export const accountKey = (provider, userId) => sha256hex(provider + ':' + userId);

export const isAccountId = (provider, id) => PROVIDERS.includes(provider) && typeof id === 'string' &&
  (provider === 'github' ? /^[1-9]\d{0,15}$/.test(id) : /^[A-Za-z0-9-]{1,64}$/.test(id));

// ADMIN_ACCOUNTS: 'provider:user_id' entries separated by commas or spaces.
export function adminAccounts(value) {
  if (typeof value !== 'string') return [];
  return value.split(/[\s,]+/).filter((entry) => {
    const at = entry.indexOf(':');
    return at > 0 && isAccountId(entry.slice(0, at), entry.slice(at + 1));
  });
}

export async function isAdmin(env, session) {
  if (!session) return false;
  let match = false;
  for (const entry of adminAccounts(env?.ADMIN_ACCOUNTS)) {
    const at = entry.indexOf(':');
    if (entry.slice(0, at) === session.p && constantTimeEqual(await sha256hex(entry), session.k)) match = true;
  }
  return match;
}

// ---- cookies ----------------------------------------------------------------------
// The latest `exp` a session signed in at `iat` may ever have.
export const sessionLimit = (iat, admin) => iat + (admin ? ADMIN_SESSION_MAX_AGE_S : SESSION_MAX_AGE_S);

// A new session (no iat: signing in now) or a renewal (iat copied from the old session).
// exp is 30 days away, but never past sessionLimit.
export async function sessionCookie(env, { p, k, iat }, now = nowSeconds()) {
  const [secret] = sessionSecrets(env);
  if (!secret) throw new Error('SESSION_SECRET is not configured');
  if (iat === undefined) iat = now;
  const exp = Math.min(now + SESSION_TTL_S, sessionLimit(iat, await isAdmin(env, { p, k })));
  if (!Number.isSafeInteger(iat) || exp <= now) throw new Error('session is past its maximum age');
  const value = await signValue(secret, 'session', { p, k, iat, exp });
  return cookie(SESSION_COOKIE, value, BASE, exp - now);
}
export const clearSessionCookie = () => cookie(SESSION_COOKIE, '', BASE, 0);

// {p, k, iat, exp} from a valid session cookie, else null. A session older than its
// maximum age is expired whatever its exp says; the admin check (a hash per
// ADMIN_ACCOUNTS entry) runs only for sessions older than the admin limit.
export async function readSession(request, env, now = nowSeconds()) {
  const value = parseCookies(request.headers.get('cookie'))[SESSION_COOKIE];
  if (!value) return null;
  const s = await verifyValue(sessionSecrets(env), 'session', value, now);
  if (!s || !PROVIDERS.includes(s.p) || typeof s.k !== 'string' || !KEY_RE.test(s.k)) return null;
  if (!Number.isSafeInteger(s.iat) || s.iat > s.exp) return null;
  const session = { p: s.p, k: s.k, iat: s.iat, exp: s.exp };
  const age = now - s.iat;
  if (age > SESSION_MAX_AGE_S || (age > ADMIN_SESSION_MAX_AGE_S && await isAdmin(env, session))) return null;
  return session;
}

// The OAuth round trip: {p: provider, s: state, cv: PKCE verifier, m: 'signin'|'link',
// k: the voter key a link attaches to (link only), r: return path}.
export async function stateCookie(env, state, now = nowSeconds()) {
  const [secret] = sessionSecrets(env);
  const value = await signValue(secret, 'oauth', { ...state, exp: now + STATE_TTL_S });
  return cookie(STATE_COOKIE, value, AUTH_PATH, STATE_TTL_S);
}
export const clearStateCookie = () => cookie(STATE_COOKIE, '', AUTH_PATH, 0);

export async function readState(request, env, now = nowSeconds()) {
  const value = parseCookies(request.headers.get('cookie'))[STATE_COOKIE];
  if (!value) return null;
  const s = await verifyValue(sessionSecrets(env), 'oauth', value, now);
  if (!s || !PROVIDERS.includes(s.p) || typeof s.s !== 'string' || typeof s.cv !== 'string') return null;
  if (s.m !== 'signin' && !(s.m === 'link' && typeof s.k === 'string' && KEY_RE.test(s.k))) return null;
  return s;
}

// The query-string state must equal the one in the signed cookie.
export const stateMatches = (cookieState, queryState) => !!cookieState && constantTimeEqual(cookieState.s, queryState);

// ---- redirects and PKCE -----------------------------------------------------------
// Sign-in only ever returns to the vote page or its admin page on this site, keeping
// nothing but a numeric ?since=. Anything else (other hosts, scheme-relative or
// backslash tricks, API paths, encoded slashes) falls back to the vote page.
const RETURNS = new Set([BASE + '/', BASE + '/admin/']);
export function safeReturnPath(raw) {
  const fallback = BASE + '/';
  if (typeof raw !== 'string' || raw.length > 256 || !raw.startsWith('/') || raw.startsWith('//')) return fallback;
  if (/[\\\u0000-\u0020\u007f]/.test(raw)) return fallback;
  let u;
  try { u = new URL(raw, 'https://return.invalid'); } catch { return fallback; }
  if (u.origin !== 'https://return.invalid' || !RETURNS.has(u.pathname) || u.username || u.password) return fallback;
  const since = u.searchParams.get('since');
  return u.pathname + (since !== null && /^\d{1,9}$/.test(since) ? '?since=' + since : '');
}

export async function pkcePair() {
  const verifier = randomToken(32); // 43 characters of [A-Za-z0-9_-], as RFC 7636 allows
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(verifier))));
  return { verifier, challenge };
}
