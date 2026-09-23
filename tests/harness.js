// Shared set-up for the API tests: the real migrations and seed on the D1 shim, a
// stand-in Cache API, sign-in settings, signed sessions and a scripted fetch.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { handle } from '../src/app.js';
import { BASE, parseCookies } from '../src/lib.js';
import { SESSION_COOKIE, sessionCookie } from '../src/session.js';
import { createD1 } from './d1-shim.js';

export const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
export const MIGRATIONS = [
  read('migrations/0001_init.sql'), read('migrations/0002_drop_site_assets.sql'),
  read('migrations/0003_note_only_votes.sql'), read('migrations/0004_sign_in.sql'),
  read('migrations/0005_gallery.sql'), read('migrations/0006_almanac.sql'),
  read('migrations/0007_analytics.sql'), read('migrations/0008_account_gate.sql'),
  read('migrations/0009_shot_votes.sql'),
];
export const SEED = read('seed/seed.sql');
export const ORIGIN = 'https://spacegho.st';
export const API = BASE + '/api/';
export const SECRETS = Object.freeze({
  SESSION_SECRET: 'test-session-secret-0123456789abcdef-0123456789',
  GITHUB_CLIENT_SECRET: 'test-github-client-secret',
  XIVAUTH_CLIENT_SECRET: 'test-xivauth-client-secret',
});
export const sha256hex = (text) => createHash('sha256').update(text).digest('hex');

// Stand-in for caches.default: honours nothing but presence, which is all the Worker relies on.
export function memoryCache() {
  const store = new Map();
  return {
    store,
    async match(req) { return store.get(req.url)?.clone(); },
    async put(req, res) { store.set(req.url, res); },
    async delete(req) { return store.delete(req.url); },
  };
}

// Stand-in for a KV namespace (GALLERY_KV): bytes in, a stream out.
export function memoryKV() {
  const store = new Map();
  return {
    store,
    async put(key, value) { store.set(key, new Uint8Array(value)); },
    async get(key, opts) {
      const v = store.get(key);
      if (!v) return null;
      if (opts?.type !== 'stream') throw new Error('only streams are used');
      return new Blob([v]).stream();
    },
    async delete(key) { store.delete(key); },
  };
}

// fetch replacement: routes(url, init) returns a Response (or throws); every call is logged.
export function scriptedFetch(routes) {
  const calls = [];
  const fetcher = async (resource, init = {}) => {
    const url = String(resource);
    calls.push({ url, method: init.method || 'GET', headers: new Headers(init.headers), body: init.body ? String(init.body) : '' });
    return routes(url, init);
  };
  return { fetcher, calls };
}
export const jsonResponse = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

export function setup(extraEnv = {}) {
  const env = {
    DB: createD1(...MIGRATIONS, SEED),
    GITHUB_CLIENT_ID: 'Iv23liYsdX6oOuO47ulv',
    XIVAUTH_CLIENT_ID: '3yHMau3T_wNUzny9QQDeiSS9wRl6BjNKIN5IpHxzQyU',
    ADMIN_ACCOUNTS: 'github:251370',
    ...SECRETS,
    ...extraEnv,
  };
  const cache = memoryCache();
  const waits = [];
  const ctx = { waitUntil: (p) => waits.push(p) };
  let fetcher = async (url) => { throw new Error('unexpected fetch ' + url); };
  let nextId = 1000;
  const call = async (path, { method = 'GET', body, cookie, headers = {} } = {}) => {
    const res = await handle(new Request(ORIGIN + path, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json', origin: ORIGIN } : {}),
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    }), env, ctx, cache, (...args) => fetcher(...args));
    await Promise.all(waits.splice(0));
    return res;
  };
  // A Cookie header for a signed-in account ('github:<id>' by default).
  const signedIn = async (provider = 'github', id = String(nextId++)) => {
    const set = await sessionCookie(env, { p: provider, k: sha256hex(provider + ':' + id) });
    return set.split(';')[0];
  };
  // A linked app's token, as the device link would have minted it: the row goes straight
  // into api_tokens (hashed) and the Bearer value comes back. `who` keys a stable account.
  const tokens = new Map();
  const linked = (client = 'ghostty', { provider = 'github', id, scope, expiresAt = Date.now() + 86400000, revokedAt = 0, fresh = false } = {}) => {
    id ??= String(nextId++);
    const memo = [client, provider, id, scope, expiresAt, revokedAt].join('|');
    if (!fresh && tokens.has(memo)) return tokens.get(memo);
    const token = 'gvt_' + randomBytes(32).toString('base64url');
    const tokenId = randomBytes(16).toString('base64url');
    env.DB.raw.prepare(
      `INSERT INTO api_tokens (id, token_hash, provider, account, client, scope, created_at, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(tokenId, sha256hex(token), provider, sha256hex(provider + ':' + id), client,
      scope ?? (client === 'almanac' ? 'almanac:submit' : 'gallery:upload'), Date.now(), expiresAt, revokedAt);
    const out = { token, tokenId, account: sha256hex(provider + ':' + id), header: { authorization: 'Bearer ' + token } };
    tokens.set(memo, out);
    return out;
  };
  // Without a cookie, each write comes from a new signed-in voter, as a stranger would.
  const vote = async (body, opts = {}) => call(API + 'vote', { method: 'POST', body, ...opts, cookie: opts.cookie ?? await signedIn() });
  const mine = (opts = {}) => call(API + 'mine', opts);
  return {
    env, cache, call, vote, mine, signedIn, linked,
    useFetch(fn) { fetcher = fn; },
  };
}

export const keyOfCookie = (cookieHeader) => {
  const value = parseCookies(cookieHeader)[SESSION_COOKIE];
  const payload = JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString('utf8'));
  return payload.k;
};

// Set-Cookie lines of a response, by cookie name.
export function setCookies(res) {
  const out = {};
  for (const line of res.headers.getSetCookie()) {
    const [pair, ...attrs] = line.split(';').map((s) => s.trim());
    const eq = pair.indexOf('=');
    out[pair.slice(0, eq)] = { value: pair.slice(eq + 1), attrs, line };
  }
  return out;
}

// Every tally recounted from the votes table, next to what the triggers maintain.
export function talliesMatchVotes(db) {
  const rows = db.prepare(
    `SELECT id, want, maybe, skip,
            (SELECT COUNT(*) FROM votes WHERE idea_id = ideas.id AND vote = 'want') AS cw,
            (SELECT COUNT(*) FROM votes WHERE idea_id = ideas.id AND vote = 'maybe') AS cm,
            (SELECT COUNT(*) FROM votes WHERE idea_id = ideas.id AND vote = 'skip') AS cs
     FROM ideas`,
  ).all();
  const off = rows.filter((r) => r.want !== r.cw || r.maybe !== r.cm || r.skip !== r.cs).map((r) => r.id);
  assert.deepEqual(off, [], 'tallies match the votes table');
}
export const allTallies = (db) => db.prepare('SELECT id, want, maybe, skip FROM ideas ORDER BY id').all().map((r) => ({ ...r }));
