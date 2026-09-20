// The device link (RFC 8628 in shape): how a plugin or a CLI, which cannot hold a browser
// cookie, gets to write in the name of a signed-in account.
//
//   POST api/device/code     {client_id, scope?}         -> device_code, user_code, verification_uri(_complete), expires_in, interval
//   POST api/device/token    {client_id, device_code}    -> 200 {access_token, token_type, expires_in, scope, token_id}
//                                                          or 400 {error: authorization_pending | slow_down | access_denied | expired_token}
//   POST api/device/lookup   {user_code}       (session) -> which app is asking for what
//   POST api/device/approve  {user_code, action: approve|deny}   (session)
//   GET  api/apps                              (session) -> this account's linked apps
//   POST api/apps/revoke     {id}              (session)
//   POST api/token/revoke                      (Bearer)  -> an app disconnects itself
//   GET  api/admin/accounts                    (ADMIN_ACCOUNTS) every token, every ban
//   POST api/admin/accounts/ban {account | provider+id, banned, reason?}
//   POST api/admin/tokens/revoke {id}
//
// Secrets: the device code and the access token are returned in a response body exactly
// once, travel only in request bodies and the Authorization header (never a URL), are
// never logged, and only their SHA-256 is stored. The user code is not a secret on its
// own (it is useless without a signed-in approval), so it may ride in the verification URL.
import { API_PREFIX, PRIVATE, cleanText, isSameOrigin, isShotId, json, randomToken, readJsonBody, sha256hex } from './lib.js';
import { PROVIDERS, accountKey, isAccountId, isAdmin, readSession } from './session.js';
import { APPS_PATH, TOKEN_PREFIX, bearerToken, isBanned, signInRequired } from './account.js';
import { CLIENTS, SCOPES } from './clients.js';

export const DEVICE = Object.freeze({
  codeTtlMs: 15 * 60 * 1000,
  intervalS: 5,
  tokenTtlMs: 180 * 24 * 60 * 60 * 1000,
  perAddressPerHour: 10,     // device/code requests
  pendingMax: 500,           // links in progress, everyone together
  tokensPerAccount: 10,      // live tokens; the oldest is revoked to make room
  hourMs: 60 * 60 * 1000,
  adminList: 500,
});

// No vowels (no words), no look-alikes: 20^8 codes, alive for 15 minutes.
const ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ';
const DEVICE_CODE_RE = /^[A-Za-z0-9_-]{43}$/;

export function newUserCode() {
  const bytes = new Uint8Array(8);
  let out = '';
  while (out.length < 8) {
    crypto.getRandomValues(bytes);
    for (const b of bytes) if (b < 240 && out.length < 8) out += ALPHABET[b % 20]; // 240 = 12 * 20: no modulo bias
  }
  return out.slice(0, 4) + '-' + out.slice(4);
}

// What a person typed -> 'XXXX-XXXX', or null.
export function cleanUserCode(raw) {
  if (typeof raw !== 'string' || raw.length > 32) return null;
  const s = raw.toUpperCase().replace(/[^A-Z]/g, '');
  if (s.length !== 8 || [...s].some((c) => !ALPHABET.includes(c))) return null;
  return s.slice(0, 4) + '-' + s.slice(4);
}

const fail = (status, error, message, headers = {}) => json({ ok: false, error, message }, { status, headers: { ...PRIVATE, ...headers } });
const refused = () => fail(403, 'forbidden', 'Cross-site request refused.');
const requesterKey = (env, ip) => sha256hex('device-link:' + (env.GALLERY_SECRET || env.SESSION_SECRET || '') + ':' + ip);

function clientAndScope(body) {
  const client = typeof body.client_id === 'string' && Object.hasOwn(CLIENTS, body.client_id) ? body.client_id : null;
  if (!client) return { error: fail(400, 'invalid_client', 'client_id is not an app this site knows.') };
  const allowed = CLIENTS[client].scopes;
  let scopes = allowed;
  if (body.scope !== undefined) {
    if (typeof body.scope !== 'string' || body.scope.length > 200) return { error: fail(400, 'invalid_scope', 'scope must be a space-separated string.') };
    scopes = [...new Set(body.scope.split(' ').filter(Boolean))];
    if (!scopes.length || scopes.some((s) => !allowed.includes(s))) {
      return { error: fail(400, 'invalid_scope', `${CLIENTS[client].name} may only ask for: ${allowed.join(' ')}.`) };
    }
  }
  return { client, scope: scopes.join(' ') };
}

// ---- POST api/device/code ------------------------------------------------------------------
export async function postDeviceCode(request, env, url) {
  if (!isSameOrigin(request, url)) return refused();
  const body = await readJsonBody(request);
  if (!body.ok) return fail(body.status, body.error, body.message);
  const cs = clientAndScope(body.value);
  if (cs.error) return cs.error;
  const now = Date.now();
  const requester = await requesterKey(env, request.headers.get('cf-connecting-ip') || '');
  const pre = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM device_codes WHERE requester = ?1 AND created_at > ?2) AS mine,
            (SELECT COUNT(*) FROM device_codes WHERE expires_at > ?3) AS pending`,
  ).bind(requester, now - DEVICE.hourMs, now).first();
  if (pre.mine >= DEVICE.perAddressPerHour) return fail(429, 'slow_down', 'That is a lot of link requests; try again in an hour.', { 'retry-after': '3600' });
  if (pre.pending >= DEVICE.pendingMax) return fail(429, 'busy', 'Too many links are in progress; try again in a few minutes.', { 'retry-after': '600' });

  const deviceCode = randomToken(32);
  const userCode = newUserCode();
  await env.DB.batch([
    // an hour, not the expiry: the per-address count above needs the row that long
    env.DB.prepare('DELETE FROM device_codes WHERE expires_at <= ? AND created_at <= ?').bind(now, now - DEVICE.hourMs),
    env.DB.prepare(
      `INSERT INTO device_codes (device_hash, user_code, client, scope, requester, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(await sha256hex(deviceCode), userCode, cs.client, cs.scope, requester, now, now + DEVICE.codeTtlMs),
  ]);
  const page = url.origin + APPS_PATH;
  return json({
    device_code: deviceCode,
    user_code: userCode,
    verification_uri: page,
    verification_uri_complete: page + '?code=' + userCode,
    expires_in: DEVICE.codeTtlMs / 1000,
    interval: DEVICE.intervalS,
    client_name: CLIENTS[cs.client].name,
    scope: cs.scope,
  }, { headers: PRIVATE });
}

// ---- POST api/device/token -----------------------------------------------------------------
const oauthError = (error, message, status = 400) => json({ ok: false, error, message }, { status, headers: PRIVATE });

export async function postDeviceToken(request, env, url) {
  if (!isSameOrigin(request, url)) return refused();
  const body = await readJsonBody(request);
  if (!body.ok) return fail(body.status, body.error, body.message);
  const { client_id: client, device_code: deviceCode } = body.value;
  if (typeof deviceCode !== 'string' || !DEVICE_CODE_RE.test(deviceCode)) return oauthError('invalid_grant', 'device_code is missing or malformed.');
  const hash = await sha256hex(deviceCode);
  const now = Date.now();
  const row = await env.DB.prepare(
    'SELECT client, scope, status, provider, account, expires_at, last_poll_at FROM device_codes WHERE device_hash = ?',
  ).bind(hash).first();
  if (!row || row.client !== client) return oauthError('invalid_grant', 'No such link request; start again.');
  if (row.expires_at <= now) return oauthError('expired_token', 'The code ran out before it was approved; start again.');
  // Answered rows stay until they are pruned: the per-address count needs them.
  if (row.status === 'denied') return oauthError('access_denied', 'The link was refused in the browser.');
  if (row.status === 'redeemed') return oauthError('invalid_grant', 'This link was already completed.');
  if (row.status !== 'approved') {
    const tooSoon = now - row.last_poll_at < (DEVICE.intervalS - 1) * 1000;
    await env.DB.prepare('UPDATE device_codes SET last_poll_at = ? WHERE device_hash = ?').bind(now, hash).run();
    return tooSoon
      ? oauthError('slow_down', `Poll no faster than every ${DEVICE.intervalS} seconds.`)
      : oauthError('authorization_pending', 'Waiting for the link to be approved in the browser.');
  }
  if (!PROVIDERS.includes(row.provider) || await isBanned(env, row.account)) return oauthError('access_denied', 'This account cannot link apps.');

  // Approved: mint the token, exactly once. The UPDATE ... RETURNING makes two racing
  // polls agree on a single winner.
  const claimed = await env.DB.prepare("UPDATE device_codes SET status = 'redeemed' WHERE device_hash = ? AND status = 'approved' RETURNING device_hash").bind(hash).all();
  if (!claimed.results.length) return oauthError('invalid_grant', 'This link was already completed.');
  const token = TOKEN_PREFIX + randomToken(32);
  const id = randomToken(16);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO api_tokens (id, token_hash, provider, account, client, scope, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, await sha256hex(token), row.provider, row.account, row.client, row.scope, now, now + DEVICE.tokenTtlMs),
    // keep the newest N live tokens per account
    env.DB.prepare(
      `UPDATE api_tokens SET revoked_at = ?1, revoked_by = 'limit'
       WHERE account = ?2 AND revoked_at = 0 AND id NOT IN (
         SELECT id FROM api_tokens WHERE account = ?2 AND revoked_at = 0 ORDER BY created_at DESC, id LIMIT ?3)`,
    ).bind(now, row.account, DEVICE.tokensPerAccount),
  ]);
  return json({
    access_token: token,
    token_type: 'Bearer',
    expires_in: Math.floor(DEVICE.tokenTtlMs / 1000),
    scope: row.scope,
    token_id: id,
  }, { headers: PRIVATE });
}

// ---- the approval, in the browser -----------------------------------------------------------
async function sessionGate(request, env, url) {
  if (!isSameOrigin(request, url)) return { response: refused() };
  const session = await readSession(request, env);
  if (!session) return { response: signInRequired(url, null, PRIVATE) };
  return { session };
}

const describe = (row) => ({
  client: row.client,
  client_name: CLIENTS[row.client]?.name || row.client,
  scopes: row.scope.split(' ').map((s) => ({ id: s, description: SCOPES[s] || s })),
});

async function pendingByUserCode(env, raw, now) {
  const code = cleanUserCode(raw);
  if (!code) return { response: fail(400, 'bad_code', 'That does not look like a code; it is eight letters, like BCDF-GHJK.') };
  const row = await env.DB.prepare(
    "SELECT device_hash, client, scope, expires_at FROM device_codes WHERE user_code = ? AND status = 'pending'",
  ).bind(code).first();
  if (!row || row.expires_at <= now) return { response: fail(404, 'unknown_code', 'No link is waiting under that code. It may have run out: start again in the app.') };
  return { row, code };
}

// POST api/device/lookup {user_code}
export async function postDeviceLookup(request, env, url) {
  const gate = await sessionGate(request, env, url);
  if (gate.response) return gate.response;
  const body = await readJsonBody(request);
  if (!body.ok) return fail(body.status, body.error, body.message);
  const found = await pendingByUserCode(env, body.value.user_code, Date.now());
  if (found.response) return found.response;
  return json({ ok: true, user_code: found.code, ...describe(found.row), expires_in: Math.ceil((found.row.expires_at - Date.now()) / 1000) }, { headers: PRIVATE });
}

// POST api/device/approve {user_code, action}
export async function postDeviceApprove(request, env, url) {
  const gate = await sessionGate(request, env, url);
  if (gate.response) return gate.response;
  const body = await readJsonBody(request);
  if (!body.ok) return fail(body.status, body.error, body.message);
  const action = body.value.action;
  if (action !== 'approve' && action !== 'deny') return fail(400, 'bad_action', 'action must be approve or deny.');
  const now = Date.now();
  const found = await pendingByUserCode(env, body.value.user_code, now);
  if (found.response) return found.response;
  if (action === 'approve' && await isBanned(env, gate.session.k)) return fail(403, 'account_banned', 'This account can no longer submit anything here.');
  const { results } = await env.DB.prepare(
    `UPDATE device_codes SET status = ?1, provider = ?2, account = ?3
     WHERE device_hash = ?4 AND status = 'pending' AND expires_at > ?5 RETURNING client`,
  ).bind(action === 'approve' ? 'approved' : 'denied', gate.session.p, gate.session.k, found.row.device_hash, now).all();
  if (!results.length) return fail(409, 'gone', 'That link was already answered.');
  return json({ ok: true, status: action === 'approve' ? 'approved' : 'denied', ...describe(found.row) }, { headers: PRIVATE });
}

// ---- your connected apps ----------------------------------------------------------------------
const tokenShape = (t, now) => ({
  id: t.id,
  client: t.client,
  client_name: CLIENTS[t.client]?.name || t.client,
  scopes: t.scope.split(' '),
  created_at: t.created_at,
  expires_at: t.expires_at,
  last_used_at: t.last_used_at,
  status: t.revoked_at ? 'revoked' : t.expires_at <= now ? 'expired' : 'active',
  revoked_by: t.revoked_by,
});

// GET api/apps
export async function getApps(request, env, url) {
  const gate = await sessionGate(request, env, url);
  if (gate.response) return gate.response;
  const now = Date.now();
  const { results } = await env.DB.prepare(
    `SELECT id, client, scope, created_at, expires_at, last_used_at, revoked_at, revoked_by FROM api_tokens
     WHERE account = ? ORDER BY revoked_at <> 0, created_at DESC LIMIT 50`,
  ).bind(gate.session.k).all();
  return json({ signed_in: true, provider: gate.session.p, apps: results.map((t) => tokenShape(t, now)) }, { headers: PRIVATE });
}

// POST api/apps/revoke {id}
export async function postAppRevoke(request, env, url) {
  const gate = await sessionGate(request, env, url);
  if (gate.response) return gate.response;
  const body = await readJsonBody(request);
  if (!body.ok) return fail(body.status, body.error, body.message);
  if (!isShotId(body.value.id)) return fail(400, 'bad_id', 'id is missing or malformed.');
  const { results } = await env.DB.prepare(
    "UPDATE api_tokens SET revoked_at = ?, revoked_by = 'account' WHERE id = ? AND account = ? AND revoked_at = 0 RETURNING id",
  ).bind(Date.now(), body.value.id, gate.session.k).all();
  if (!results.length) return fail(404, 'unknown_app', 'No such connected app.');
  return json({ ok: true, id: body.value.id, status: 'revoked' }, { headers: PRIVATE });
}

// POST api/token/revoke with the token itself: an app signing out.
export async function postTokenRevoke(request, env, url) {
  if (!isSameOrigin(request, url)) return refused();
  const token = bearerToken(request);
  if (!token) return fail(401, 'invalid_token', 'Send the token to revoke as a Bearer token.');
  await env.DB.prepare("UPDATE api_tokens SET revoked_at = ?, revoked_by = 'app' WHERE token_hash = ? AND revoked_at = 0")
    .bind(Date.now(), await sha256hex(token)).run();
  return json({ ok: true }, { headers: PRIVATE }); // the same answer whether or not it existed
}

// ---- the owner ----------------------------------------------------------------------------------
async function adminGate(request, env, url) {
  const gate = await sessionGate(request, env, url);
  if (gate.response) return gate;
  if (!(await isAdmin(env, gate.session))) return { response: fail(403, 'forbidden', 'Only the site owner can see this.') };
  return gate;
}

// GET api/admin/accounts -> {tokens, bans, accounts: [... per-account counts of what they wrote]}
export async function getAdminAccounts(request, env, url) {
  const gate = await adminGate(request, env, url);
  if (gate.response) return gate.response;
  const now = Date.now();
  const [tokens, bans, shots, results, characters] = await env.DB.batch([
    env.DB.prepare(
      `SELECT id, provider, account, client, scope, created_at, expires_at, last_used_at, revoked_at, revoked_by
       FROM api_tokens ORDER BY created_at DESC LIMIT ?`,
    ).bind(DEVICE.adminList),
    env.DB.prepare('SELECT account, provider, reason, created_at FROM account_bans ORDER BY created_at DESC'),
    env.DB.prepare(
      `SELECT provider, account, COUNT(*) AS shots, SUM(status = 'pending') AS pending, SUM(status = 'rejected' OR status = 'removed') AS refused,
              MAX(created_at) AS last_at FROM shots WHERE account <> '' GROUP BY account`,
    ),
    env.DB.prepare(
      `SELECT provider, account, COUNT(*) AS results, SUM(status = 'hidden') AS hidden, MAX(created_at) AS last_at
       FROM almanac_results WHERE account <> '' GROUP BY account`,
    ),
    env.DB.prepare('SELECT voter, name, world FROM characters'),
  ]);
  const names = new Map(characters.results.map((c) => [c.voter, { name: c.name, world: c.world }]));
  const accounts = new Map();
  const acct = (provider, account) => {
    let a = accounts.get(account);
    if (!a) accounts.set(account, (a = { provider, account, character: names.get(account) || null, shots: 0, shots_pending: 0, shots_refused: 0, results: 0, results_hidden: 0, tokens: 0, last_at: 0, banned: false }));
    return a;
  };
  for (const r of shots.results) Object.assign(acct(r.provider, r.account), { shots: r.shots | 0, shots_pending: r.pending | 0, shots_refused: r.refused | 0, last_at: r.last_at | 0 });
  for (const r of results.results) {
    const a = acct(r.provider, r.account);
    Object.assign(a, { results: r.results | 0, results_hidden: r.hidden | 0, last_at: Math.max(a.last_at, r.last_at || 0) });
  }
  for (const t of tokens.results) if (!t.revoked_at && t.expires_at > now) acct(t.provider, t.account).tokens++;
  for (const b of bans.results) acct(b.provider, b.account).banned = true;
  return json({
    generated_at: now,
    accounts: [...accounts.values()].sort((a, b) => b.last_at - a.last_at),
    tokens: tokens.results.map((t) => ({ ...tokenShape(t, now), provider: t.provider, account: t.account })),
    bans: bans.results,
  }, { headers: PRIVATE });
}

// POST api/admin/accounts/ban {account: <64 hex>} or {provider, id}, banned: true|false, reason?
export async function postAdminBan(request, env, url) {
  const gate = await adminGate(request, env, url);
  if (gate.response) return gate.response;
  const body = await readJsonBody(request);
  if (!body.ok) return fail(body.status, body.error, body.message);
  const v = body.value;
  let account = null;
  let provider = PROVIDERS.includes(v.provider) ? v.provider : '';
  if (typeof v.account === 'string' && /^[0-9a-f]{64}$/.test(v.account)) account = v.account;
  else if (isAccountId(v.provider, v.id)) account = await accountKey(v.provider, v.id);
  if (!account) return fail(400, 'bad_account', 'Send account (the 64-character key) or provider and id.');
  if (typeof v.banned !== 'boolean') return fail(400, 'bad_banned', 'banned must be true or false.');
  if (v.banned && account === gate.session.k) return fail(400, 'not_yourself', 'You cannot ban the account you are signed in with.');
  const now = Date.now();
  if (!v.banned) {
    await env.DB.prepare('DELETE FROM account_bans WHERE account = ?').bind(account).run();
    return json({ ok: true, account, banned: false }, { headers: PRIVATE });
  }
  const reason = (cleanText(typeof v.reason === 'string' ? v.reason : '') || '').slice(0, 200);
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO account_bans (account, provider, reason, created_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (account) DO UPDATE SET reason = ?3',
    ).bind(account, provider, reason, now),
    env.DB.prepare("UPDATE api_tokens SET revoked_at = ?, revoked_by = 'ban' WHERE account = ? AND revoked_at = 0").bind(now, account),
    env.DB.prepare("DELETE FROM device_codes WHERE account = ?").bind(account),
  ]);
  return json({ ok: true, account, banned: true }, { headers: PRIVATE });
}

// POST api/admin/tokens/revoke {id}
export async function postAdminTokenRevoke(request, env, url) {
  const gate = await adminGate(request, env, url);
  if (gate.response) return gate.response;
  const body = await readJsonBody(request);
  if (!body.ok) return fail(body.status, body.error, body.message);
  if (!isShotId(body.value.id)) return fail(400, 'bad_id', 'id is missing or malformed.');
  const { results } = await env.DB.prepare(
    "UPDATE api_tokens SET revoked_at = ?, revoked_by = 'owner' WHERE id = ? AND revoked_at = 0 RETURNING id",
  ).bind(Date.now(), body.value.id).all();
  if (!results.length) return fail(404, 'unknown_token', 'No such live token.');
  return json({ ok: true, id: body.value.id, status: 'revoked' }, { headers: PRIVATE });
}

export const DEVICE_API = API_PREFIX + 'device/';
