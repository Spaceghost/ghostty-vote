// Who is writing. Every write on this site needs an account from one of the two sign-ins
// (GitHub or XIVAuth), proved one of two ways:
//
//   a browser    the signed session cookie (session.js)
//   a linked app `Authorization: Bearer gvt_...`, an API token the player approved through
//                the device link (device.js), carrying the scope the endpoint needs
//
// authorize() answers {ok: true, account: {p, k}, via, tokenId} or {ok: false, response}.
// The 401 body is machine readable: it says where a person signs in and where an app
// starts a device link, and names the first version of each app that can link.
// D1 cost: one read (the ban check, joined to the token row for a token), plus one
// write at most once an hour per token to move last_used_at.
import { API_PREFIX, BASE, PRIVATE, json, sha256hex } from './lib.js';
import { PROVIDERS, readSession } from './session.js';
import { CLIENTS } from './clients.js';

export const TOKEN_PREFIX = 'gvt_';
const TOKEN_RE = /^gvt_[A-Za-z0-9_-]{43}$/;
const USED_EVERY_MS = 60 * 60 * 1000;

export const APPS_PATH = BASE + '/apps/';

// What an unauthenticated client needs to know, the same on every gated endpoint.
export function signInInfo(origin) {
  const api = origin + API_PREFIX;
  return {
    providers: [...PROVIDERS],
    github: api + 'auth/github/start',
    xivauth: api + 'auth/xivauth/start',
    device: {
      code_endpoint: api + 'device/code',
      token_endpoint: api + 'device/token',
      verification_uri: origin + APPS_PATH,
    },
  };
}

const MESSAGES = Object.freeze({
  'gallery:upload': `Sharing a screenshot now needs a sign-in with GitHub or FFXIV (XIVAuth). On the web, sign in on the page. In game, update Ghostty to ${CLIENTS.ghostty.min_version} or newer and run /term share again to link it.`,
  'almanac:submit': `Submitting a result now needs a sign-in with GitHub or FFXIV (XIVAuth). Update Almanac to ${CLIENTS.almanac.min_version} or newer (plugin and CLI), then link it when it asks.`,
  default: 'Sign in with GitHub or FFXIV to vote.',
});

const minClient = () => Object.fromEntries(Object.entries(CLIENTS).map(([id, c]) => [id, c.min_version]));

// Ghostty before 0.3.0 keeps only the first 240 characters of an answer and shows `message`
// only if what it kept still parses as JSON. For a request of that shape (it names itself in
// X-Ghostty-Client and sends no credential) the body is therefore just the message; the
// directions a newer client could use are in the Link header either way.
export const COMPACT_LIMIT = 240;
const COMPACT_MESSAGE = `Sharing now needs a sign-in. Update Ghostty to ${CLIENTS.ghostty.min_version} or newer, then run /term share to link it with GitHub or FFXIV.`;

export function signInRequired(url, scope, headers = {}, { compact = false } = {}) {
  const info = signInInfo(url.origin);
  return json(compact ? { ok: false, error: 'sign_in_required', message: COMPACT_MESSAGE } : {
    ok: false,
    error: 'sign_in_required',
    message: MESSAGES[scope] || MESSAGES.default,
    sign_in: info,
    min_client: minClient(),
  }, {
    status: 401,
    headers: {
      ...PRIVATE,
      'www-authenticate': 'Bearer realm="spacegho.st mods"',
      link: `<${info.device.code_endpoint}>; rel="device_authorization", <${info.device.verification_uri}>; rel="sign-in"`,
      ...headers,
    },
  });
}

const tokenFail = (url, status, error, message, scope) => json(
  { ok: false, error, message, sign_in: signInInfo(url.origin), min_client: minClient() },
  { status, headers: { ...PRIVATE, 'www-authenticate': `Bearer realm="spacegho.st mods", error="${error}"${scope ? `, scope="${scope}"` : ''}` } },
);

export const banned = () => json(
  { ok: false, error: 'account_banned', message: 'This account can no longer submit anything here.' },
  { status: 403, headers: PRIVATE },
);

export const hasScope = (granted, scope) => typeof granted === 'string' && granted.split(' ').includes(scope);

// The bearer token of a request, or null when there is no Authorization header at all,
// or '' when there is one that is not a token of ours.
export function bearerToken(request) {
  const h = request.headers.get('authorization');
  if (h === null) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(h.trim());
  return m && TOKEN_RE.test(m[1]) ? m[1] : '';
}

// scope: what a token must carry; null means tokens are not accepted (session only).
// deferBan: the caller folds the ban check into a query it already makes (exportable as BANNED_SQL).
export async function authorize(request, env, url, scope, { deferBan = false, now = Date.now() } = {}) {
  const token = bearerToken(request);
  if (token !== null) {
    if (!scope || !token) return { ok: false, response: tokenFail(url, 401, 'invalid_token', 'That token is not valid here; link the app again.') };
    const row = await env.DB.prepare(
      `SELECT t.id, t.provider, t.account, t.client, t.scope, t.expires_at, t.revoked_at, t.last_used_at,
              EXISTS (SELECT 1 FROM account_bans b WHERE b.account = t.account) AS banned
       FROM api_tokens t WHERE t.token_hash = ?`,
    ).bind(await sha256hex(token)).first();
    if (!row || !PROVIDERS.includes(row.provider)) {
      return { ok: false, response: tokenFail(url, 401, 'invalid_token', 'That token is not valid here; link the app again.') };
    }
    if (row.revoked_at) return { ok: false, response: tokenFail(url, 401, 'token_revoked', 'This app was disconnected from your account; link it again.') };
    if (row.expires_at <= now) return { ok: false, response: tokenFail(url, 401, 'token_expired', 'This link has expired; link the app again.') };
    if (row.banned) return { ok: false, response: banned() };
    if (!hasScope(row.scope, scope)) {
      return { ok: false, response: tokenFail(url, 403, 'insufficient_scope', `This app was not given "${scope}".`, scope) };
    }
    if (now - row.last_used_at > USED_EVERY_MS) {
      await env.DB.prepare('UPDATE api_tokens SET last_used_at = ? WHERE id = ?').bind(now, row.id).run();
    }
    return { ok: true, account: { p: row.provider, k: row.account }, via: 'token', tokenId: row.id, client: row.client };
  }
  const session = await readSession(request, env);
  if (!session) return { ok: false, response: signInRequired(url, scope, {}, { compact: scope === 'gallery:upload' && request.headers.has('x-ghostty-client') }) };
  if (!deferBan && await isBanned(env, session.k)) return { ok: false, response: banned() };
  return { ok: true, account: { p: session.p, k: session.k }, via: 'session', tokenId: '', client: '' };
}

export async function isBanned(env, account) {
  return !!(await env.DB.prepare('SELECT 1 AS banned FROM account_bans WHERE account = ?').bind(account).first());
}
