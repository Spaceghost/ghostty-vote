// session.js: signed values, session and state cookies, account keys, admin parsing,
// the return-path check and PKCE. No D1 and no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { BASE } from '../src/lib.js';
import {
  AUTH_PATH, SESSION_COOKIE, SESSION_TTL_S, STATE_COOKIE, STATE_TTL_S, accountKey, adminAccounts, clearSessionCookie,
  constantTimeEqual, isAdmin, nowSeconds, pkcePair, readSession, readState, safeReturnPath, sessionCookie, sessionSecrets,
  signValue, stateCookie, stateMatches, verifyValue,
} from '../src/session.js';

const SECRET = 'a'.repeat(16) + '-session-secret-for-tests-only';
const OLD = 'b'.repeat(16) + '-previous-secret-for-tests-only';
const env = { SESSION_SECRET: SECRET };
const KEY = createHash('sha256').update('github:251370').digest('hex');
const withCookie = (setCookie) => new Request('https://spacegho.st' + BASE + '/api/auth/me', { headers: { cookie: setCookie.split(';')[0] } });

test('signed values: round trip, tampering, purpose, version and expiry', async () => {
  const now = 1_800_000_000;
  const value = await signValue(SECRET, 'session', { p: 'github', k: KEY, exp: now + 60 });
  assert.match(value, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(await verifyValue([SECRET], 'session', value, now), { p: 'github', k: KEY, exp: now + 60 });

  const [v, body, mac] = value.split('.');
  const forged = Buffer.from(JSON.stringify({ p: 'github', k: 'f'.repeat(64), exp: now + 60 })).toString('base64url');
  const flip = (s, n) => s.slice(0, n) + (s[n] === 'A' ? 'B' : 'A') + s.slice(n + 1);
  for (const bad of [
    `${v}.${forged}.${mac}`, // payload swapped
    `${v}.${body}.${flip(mac, 0)}`, // MAC changed
    `${v}.${flip(body, 3)}.${mac}`,
    `v2.${body}.${mac}`, // unknown version
    `${body}.${mac}`,
    `${v}.${body}.${mac}.x`,
    `${v}.${body}.${mac.slice(0, 20)}`, // short MAC
    `${v}.${body}.${mac}==`,
    '', 'v1..', 'v1.!!!.???', 'x'.repeat(5000), null, 42,
  ]) {
    assert.equal(await verifyValue([SECRET], 'session', bad, now), null, String(bad).slice(0, 40));
  }
  assert.equal(await verifyValue([SECRET], 'oauth', value, now), null, 'a value signed for one purpose is useless for another');
  assert.equal(await verifyValue(['c'.repeat(40)], 'session', value, now), null, 'unknown secret');
  assert.equal(await verifyValue([], 'session', value, now), null, 'no secret, nothing verifies');
  assert.equal(await verifyValue([SECRET], 'session', value, now + 60), null, 'expired at exp');
  assert.ok(await verifyValue([SECRET], 'session', value, now + 59));

  // A correct MAC over a payload without a numeric exp is still refused.
  for (const payload of [{ p: 'github' }, { exp: '9999999999' }, [1], 'str']) {
    const signed = await signValue(SECRET, 'session', payload);
    assert.equal(await verifyValue([SECRET], 'session', signed, now), null, JSON.stringify(payload));
  }
});

test('secret rotation: SESSION_SECRET signs, SESSION_SECRET_PREVIOUS still verifies, short secrets are refused', async () => {
  assert.deepEqual(sessionSecrets({}), []);
  assert.deepEqual(sessionSecrets({ SESSION_SECRET: 'short' }), []);
  assert.deepEqual(sessionSecrets({ SESSION_SECRET: 'short', SESSION_SECRET_PREVIOUS: OLD }), [], 'no signing secret, no sessions');
  assert.deepEqual(sessionSecrets({ SESSION_SECRET: SECRET, SESSION_SECRET_PREVIOUS: OLD }), [SECRET, OLD]);

  const oldCookie = await sessionCookie({ SESSION_SECRET: OLD }, { p: 'github', k: KEY });
  assert.equal(await readSession(withCookie(oldCookie), env), null, 'old secret alone: refused');
  const rotated = { SESSION_SECRET: SECRET, SESSION_SECRET_PREVIOUS: OLD };
  assert.equal((await readSession(withCookie(oldCookie), rotated)).k, KEY, 'accepted while rotating');
  const fresh = await sessionCookie(rotated, { p: 'github', k: KEY });
  assert.ok(await readSession(withCookie(fresh), env), 'new cookies use the new secret');
  await assert.rejects(sessionCookie({}, { p: 'github', k: KEY }), /SESSION_SECRET/);
});

test('session cookie: attributes, 30 days, contents checked on read', async () => {
  const set = await sessionCookie(env, { p: 'xivauth', k: KEY });
  const [pair, ...attrs] = set.split('; ');
  assert.ok(pair.startsWith(SESSION_COOKIE + '=v1.'));
  assert.deepEqual(attrs, [`Path=${BASE}`, `Max-Age=${SESSION_TTL_S}`, 'HttpOnly', 'Secure', 'SameSite=Lax']);
  assert.equal(SESSION_TTL_S, 30 * 24 * 3600);
  const s = await readSession(withCookie(set), env);
  assert.deepEqual({ p: s.p, k: s.k }, { p: 'xivauth', k: KEY });
  assert.ok(Math.abs(s.exp - (nowSeconds() + SESSION_TTL_S)) <= 2);
  assert.equal(await readSession(withCookie(set), env, s.exp), null, 'expired');
  assert.equal(clearSessionCookie(), `${SESSION_COOKIE}=; Path=${BASE}; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);

  // Validly signed but not a session this app would issue.
  for (const payload of [{ p: 'gitlab', k: KEY }, { p: 'github', k: 'nothex' }, { p: 'github' }]) {
    const value = await signValue(SECRET, 'session', { ...payload, exp: nowSeconds() + 60 });
    assert.equal(await readSession(withCookie(`${SESSION_COOKIE}=${value}`), env), null, JSON.stringify(payload));
  }
  // A state cookie's value under the session name does not sign anyone in.
  const state = await stateCookie(env, { p: 'github', s: 'x', cv: 'y', m: 'signin', r: BASE + '/' });
  assert.equal(await readSession(withCookie(SESSION_COOKIE + '=' + state.split(';')[0].split('=')[1]), env), null);
});

test('state cookie: short-lived, scoped to api/auth, and the query state must match', async () => {
  const s = { p: 'github', s: 'state-123', cv: 'verifier', m: 'signin', r: BASE + '/' };
  const set = await stateCookie(env, s);
  assert.ok(set.startsWith(STATE_COOKIE + '=v1.'));
  assert.ok(set.includes(`Path=${AUTH_PATH};`) && set.includes(`Max-Age=${STATE_TTL_S};`) && set.includes('HttpOnly') && set.includes('Secure') && set.includes('SameSite=Lax'));
  const got = await readState(withCookie(set), env);
  assert.equal(got.s, 'state-123');
  assert.ok(stateMatches(got, 'state-123'));
  for (const q of ['state-124', 'state-12', '', null, undefined]) assert.ok(!stateMatches(got, q), String(q));
  assert.ok(!stateMatches(null, 'state-123'));
  assert.equal(await readState(withCookie(set), env, nowSeconds() + STATE_TTL_S), null, 'expired after 20 minutes');
  // A link must name the account it attaches to.
  const link = await stateCookie(env, { ...s, m: 'link' });
  assert.equal(await readState(withCookie(link), env), null);
  const linkOk = await stateCookie(env, { ...s, m: 'link', k: KEY });
  assert.equal((await readState(withCookie(linkOk), env)).k, KEY);
  const odd = await stateCookie(env, { ...s, m: 'other' });
  assert.equal(await readState(withCookie(odd), env), null);
  // A session value under the state name is not a state.
  const session = await sessionCookie(env, { p: 'github', k: KEY });
  assert.equal(await readState(withCookie(STATE_COOKIE + '=' + session.split(';')[0].split('=')[1]), env), null);
});

test('constantTimeEqual', () => {
  assert.ok(constantTimeEqual('abc', 'abc'));
  assert.ok(!constantTimeEqual('abc', 'abd'));
  assert.ok(!constantTimeEqual('abc', 'abcd'));
  assert.ok(!constantTimeEqual('abc', null));
});

test("voter keys: sha256hex('provider:' + id), distinct from anonymous keys", async () => {
  assert.equal(await accountKey('github', '251370'), KEY);
  assert.equal(await accountKey('xivauth', '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'),
    createHash('sha256').update('xivauth:0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b').digest('hex'));
  assert.notEqual(await accountKey('github', '1'), await accountKey('xivauth', '1'));
});

test('admin gating: ADMIN_ACCOUNTS entries match only that account', async () => {
  assert.deepEqual(adminAccounts('github:251370'), ['github:251370']);
  assert.deepEqual(adminAccounts(' github:251370, xivauth:0190a1b2-c3d4 github:0 gitlab:5 github: :7 github:12a  '), ['github:251370', 'xivauth:0190a1b2-c3d4']);
  assert.deepEqual(adminAccounts(undefined), []);
  const admins = { ADMIN_ACCOUNTS: 'github:251370, xivauth:0190a1b2-c3d4' };
  assert.equal(await isAdmin(admins, { p: 'github', k: KEY }), true);
  assert.equal(await isAdmin(admins, { p: 'xivauth', k: await accountKey('xivauth', '0190a1b2-c3d4') }), true);
  assert.equal(await isAdmin(admins, { p: 'github', k: await accountKey('github', '251371') }), false);
  assert.equal(await isAdmin(admins, { p: 'xivauth', k: KEY }), false, 'the provider must match too');
  assert.equal(await isAdmin({}, { p: 'github', k: KEY }), false, 'no ADMIN_ACCOUNTS, no admins');
  assert.equal(await isAdmin(admins, null), false);
});

test('return paths: only the vote page (or its admin page) on this site', () => {
  const page = BASE + '/';
  const ok = {
    [page]: page,
    [BASE + '/admin/']: BASE + '/admin/',
    [page + '?since=3']: page + '?since=3',
    [page + '?since=3&x=https://evil.example']: page + '?since=3',
    [page + '?since=abc']: page,
    [page + '#frag']: page,
  };
  for (const [raw, want] of Object.entries(ok)) assert.equal(safeReturnPath(raw), want, raw);
  for (const raw of [
    'https://evil.example/', '//evil.example/', '///evil.example/', '/\\evil.example/', '\\\\evil.example',
    'javascript:alert(1)', 'data:text/html,x', ' ' + page, page + '\n', 'https://spacegho.st' + page,
    BASE, BASE + '/api/auth/me', BASE + '/index.html', BASE + '/admin', BASE + '%2Fadmin/', '/', '/mods/ffxiv/term/voter/',
    BASE + '/../../evil/', BASE + '/admin/../api/mine', '', null, undefined, 42, page + '?' + 'x'.repeat(300),
  ]) {
    assert.equal(safeReturnPath(raw), page, String(raw));
  }
});

test('PKCE: S256 challenge of a 43-character verifier', async () => {
  const { verifier, challenge } = await pkcePair();
  assert.match(verifier, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(challenge, createHash('sha256').update(verifier).digest('base64url'));
  assert.notEqual((await pkcePair()).verifier, verifier);
});
