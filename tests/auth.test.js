// Sign-in end to end through the API handler with a scripted fetch standing in for
// GitHub and XIVAuth: start, callback, the anonymous-ballot claim, link, me, logout,
// forget, and the owner-only voter list. The provider response shapes used here come
// from their docs and source, not from live calls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, COOKIE_NAME, voterKey } from '../src/lib.js';
import { PROVIDER, claimStatements, pickCharacter, safeImageUrl } from '../src/auth.js';
import { SESSION_COOKIE, SESSION_RENEW_S, STATE_COOKIE, readSession, signValue } from '../src/session.js';
import { createD1 } from './d1-shim.js';
import {
  API, MIGRATIONS, ORIGIN, SECRETS, SEED, allTallies, jsonResponse, keyOfCookie, scriptedFetch, setCookies, setup, sha256hex,
  talliesMatchVotes,
} from './harness.js';

const PAGE = ORIGIN + BASE + '/';
const XIV_USER = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const PORTRAIT = 'https://img2.finalfantasyxiv.com/f/0123abcd_4567ef01fl0_640x873.jpg?1726000000';
const CHARACTER = {
  persistent_key: 'pk', lodestone_id: '12345678', name: 'Wyn Ghostty', home_world: 'Gilgamesh', data_center: 'Aether',
  avatar_url: 'https://img2.finalfantasyxiv.com/f/0123abcd_4567ef01fc0_96x96.jpg', portrait_url: PORTRAIT,
  created_at: '2026-01-01T00:00:00Z', verified_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
};

// Scripted providers: GitHub user 251370 unless told otherwise; XIVAuth user XIV_USER with CHARACTER.
function providers({ githubId = 251370, githubToken = { access_token: 'ghu_testtoken', token_type: 'bearer' }, xivUser = { id: XIV_USER, display_name: 'Wyn' }, characters = [CHARACTER], fail = {} } = {}) {
  return scriptedFetch((url) => {
    if (fail[url]) return fail[url]();
    switch (url) {
      case PROVIDER.github.token: return jsonResponse(githubToken);
      case PROVIDER.github.user: return jsonResponse({ login: 'Spaceghost', id: githubId, name: 'Jack', avatar_url: 'x' });
      case PROVIDER.xivauth.token: return jsonResponse({ access_token: 'xiv-token', token_type: 'Bearer', expires_in: 7200, scope: 'user', created_at: 1 });
      case PROVIDER.xivauth.user: return jsonResponse(xivUser);
      case PROVIDER.xivauth.characters: return jsonResponse(characters);
      default: throw new Error('unexpected fetch ' + url);
    }
  });
}

// Runs start, then the provider's redirect back to the callback. Returns every step.
async function signIn(t, provider, { cookie = '', mode = 'start', query, returnTo, callbackCookie } = {}) {
  const start = await t.call(API + `auth/${provider}/${mode}` + (returnTo ? '?return=' + encodeURIComponent(returnTo) : ''), { cookie, headers: { 'sec-fetch-site': 'same-origin' } });
  assert.equal(start.status, 303);
  const location = new URL(start.headers.get('location'));
  const stateSet = setCookies(start)[STATE_COOKIE];
  if (!stateSet) return { start, location };
  const state = location.searchParams.get('state');
  const jar = [cookie, `${STATE_COOKIE}=${stateSet.value}`].filter(Boolean).join('; ');
  const params = query ?? { code: 'the-code', state };
  const callback = await t.call(API + `auth/${provider}/callback?` + new URLSearchParams(params), { cookie: callbackCookie ?? jar, headers: { 'sec-fetch-site': 'cross-site' } });
  return { start, location, state, stateSet, callback, set: setCookies(callback) };
}

const fragment = (res) => new URL(res.headers.get('location')).hash;

test('GitHub: start redirects with state and PKCE; callback signs in and drops the token', async () => {
  const t = setup();
  const p = providers();
  t.useFetch(p.fetcher);
  const { start, location, stateSet, callback, set } = await signIn(t, 'github', { returnTo: BASE + '/?since=1' });

  assert.equal(location.origin + location.pathname, PROVIDER.github.authorize);
  const q = Object.fromEntries(location.searchParams);
  assert.deepEqual(Object.keys(q).sort(), ['client_id', 'code_challenge', 'code_challenge_method', 'redirect_uri', 'state']);
  assert.equal(q.client_id, 'Iv23liYsdX6oOuO47ulv');
  assert.equal(q.redirect_uri, ORIGIN + BASE + '/api/auth/github/callback');
  assert.equal(q.code_challenge_method, 'S256');
  assert.match(q.state, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(start.headers.get('cache-control'), 'no-store');
  assert.equal(start.headers.get('referrer-policy'), 'no-referrer');
  assert.ok(stateSet.attrs.includes('HttpOnly') && stateSet.attrs.includes('Secure') && stateSet.attrs.includes('SameSite=Lax'));

  // Token exchange: form body with the verifier whose S256 hash was the challenge.
  assert.equal(p.calls.length, 2);
  const [tokenCall, userCall] = p.calls;
  assert.equal(tokenCall.url, PROVIDER.github.token);
  assert.equal(tokenCall.method, 'POST');
  assert.equal(tokenCall.headers.get('accept'), 'application/json');
  assert.equal(tokenCall.headers.get('content-type'), 'application/x-www-form-urlencoded');
  assert.ok(tokenCall.headers.get('user-agent'));
  const form = Object.fromEntries(new URLSearchParams(tokenCall.body));
  assert.deepEqual(Object.keys(form).sort(), ['client_id', 'client_secret', 'code', 'code_verifier', 'redirect_uri']);
  assert.equal(form.client_secret, SECRETS.GITHUB_CLIENT_SECRET);
  assert.equal(form.code, 'the-code');
  assert.equal(form.redirect_uri, q.redirect_uri);
  assert.equal(sha256b64url(form.code_verifier), q.code_challenge);
  assert.equal(userCall.url, 'https://api.github.com/user');
  assert.equal(userCall.headers.get('authorization'), 'Bearer ghu_testtoken');
  assert.equal(userCall.headers.get('accept'), 'application/vnd.github+json');
  assert.match(userCall.headers.get('user-agent'), /ghostty-vote/);

  assert.equal(callback.status, 303);
  assert.equal(callback.headers.get('location'), PAGE + '?since=1#signed-in');
  assert.equal(set[STATE_COOKIE].value, '', 'state cookie cleared');
  assert.ok(set[STATE_COOKIE].attrs.includes('Max-Age=0'));
  const session = set[SESSION_COOKIE];
  assert.ok(session.attrs.includes(`Path=${BASE}`) && session.attrs.includes('HttpOnly') && session.attrs.includes('Secure') && session.attrs.includes('SameSite=Lax'));
  assert.equal(keyOfCookie(`${SESSION_COOKIE}=${session.value}`), sha256hex('github:251370'));
  assert.ok(!(COOKIE_NAME in set), 'no anonymous cookie to clear');
  assert.equal(t.env.DB.stats.calls, 0, 'a GitHub sign-in without an old ballot never touches D1');
  assert.ok(!session.value.includes('ghu_') && !Buffer.from(session.value.split('.')[1], 'base64url').toString().includes('ghu_'), 'token not in the cookie');

  // The session works for voting and me.
  const cookie = `${SESSION_COOKIE}=${session.value}`;
  assert.equal((await t.vote({ idea_id: 'ops-weather', vote: 'want' }, { cookie })).status, 200);
  const me = await (await t.call(API + 'auth/me', { cookie })).json();
  assert.deepEqual(me, { signed_in: true, provider: 'github', character: null, admin: true });
});

function sha256b64url(text) {
  return Buffer.from(sha256hex(text), 'hex').toString('base64url');
}

test('callback refuses bad state, missing or foreign state cookies, denials and bad codes without calling out', async () => {
  const t = setup();
  const p = providers();
  t.useFetch(p.fetcher);
  const expectError = async (res, code) => {
    assert.equal(res.status, 303);
    assert.equal(fragment(res), '#auth-error=' + code);
    assert.ok(new URL(res.headers.get('location')).href.startsWith(PAGE), 'always back to the vote page');
    const set = setCookies(res);
    assert.ok(!(SESSION_COOKIE in set), 'no session');
    assert.equal(set[STATE_COOKIE]?.value, '', 'state cleared');
  };

  let r = await signIn(t, 'github', { query: { code: 'c', state: 'not-the-state' } });
  await expectError(r.callback, 'state');
  r = await signIn(t, 'github', { query: { code: 'c' } });
  await expectError(r.callback, 'state');
  r = await signIn(t, 'github', { query: { error: 'access_denied', state: 'x' } });
  await expectError(r.callback, 'denied');
  r = await signIn(t, 'github', { callbackCookie: '' });
  await expectError(r.callback, 'expired');
  r = await signIn(t, 'github', { query: {} });
  const tampered = r.stateSet.value.slice(0, -3) + (r.stateSet.value.endsWith('AAA') ? 'BBB' : 'AAA');
  await expectError(await t.call(API + 'auth/github/callback?code=c&state=' + r.state, { cookie: `${STATE_COOKIE}=${tampered}` }), 'expired');
  // A GitHub state cookie is no good for the XIVAuth callback.
  const fresh = await signIn(t, 'github', { query: {} });
  await expectError(await t.call(API + 'auth/xivauth/callback?code=c&state=' + fresh.state, { cookie: `${STATE_COOKIE}=${fresh.stateSet.value}` }), 'expired');
  // An expired state cookie (signed 21 minutes ago).
  const old = await signValue(SECRETS.SESSION_SECRET, 'oauth', { p: 'github', s: 'st', cv: 'v', m: 'signin', r: BASE + '/', exp: Math.floor(Date.now() / 1000) - 60 });
  await expectError(await t.call(API + 'auth/github/callback?code=c&state=st', { cookie: `${STATE_COOKIE}=${old}` }), 'expired');
  // Over-long code.
  const long = await signIn(t, 'github', { query: {} });
  await expectError(await t.call(API + 'auth/github/callback?' + new URLSearchParams({ code: 'x'.repeat(600), state: long.state }), { cookie: `${STATE_COOKIE}=${long.stateSet.value}` }), 'bad-request');

  assert.equal(p.calls.length, 0, 'none of them reached GitHub');
});

test('callback: provider failures sign nobody in', async () => {
  const cases = [
    ['GitHub 200 with {error}', 'github', { githubToken: { error: 'bad_verification_code', error_description: 'The code passed is incorrect or expired.' } }],
    ['GitHub token 500', 'github', { fail: { [PROVIDER.github.token]: () => new Response('oops', { status: 500 }) } }],
    ['GitHub network', 'github', { fail: { [PROVIDER.github.token]: () => { throw new TypeError('network'); } } }],
    ['GitHub user 401', 'github', { fail: { [PROVIDER.github.user]: () => jsonResponse({ message: 'Bad credentials' }, 401) } }],
    ['GitHub user without id', 'github', { githubId: 'nope' }],
    ['GitHub user HTML', 'github', { fail: { [PROVIDER.github.user]: () => new Response('<html>', { status: 200 }) } }],
    ['XIVAuth token 400', 'xivauth', { fail: { [PROVIDER.xivauth.token]: () => jsonResponse({ error: 'invalid_grant' }, 400) } }],
    ['XIVAuth user without id', 'xivauth', { xivUser: { display_name: 'x' } }],
    ['XIVAuth user with odd id', 'xivauth', { xivUser: { id: '../../x' } }],
  ];
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args.join(' '));
  try {
    for (const [name, provider, opts] of cases) {
      const t = setup();
      t.useFetch(providers(opts).fetcher);
      const { callback, set } = await signIn(t, provider);
      assert.equal(fragment(callback), '#auth-error=provider', name);
      assert.ok(!(SESSION_COOKIE in set), name);
      assert.equal(t.env.DB.raw.prepare('SELECT COUNT(*) AS n FROM characters').get().n, 0);
    }
  } finally {
    console.error = original;
  }
  assert.ok(logged.length >= cases.length);
  for (const line of logged) {
    assert.ok(!/ghu_|xiv-token|the-code|secret/i.test(line), 'logs carry no codes, tokens or secrets: ' + line);
  }
});

test('XIVAuth: sign-in asks for `user` only, reads no character and signs in as xivauth:<user id>', async () => {
  const t = setup();
  // The character list would fail if it were asked for: sign-in must not depend on it.
  const p = providers({ characters: [], fail: { [PROVIDER.xivauth.characters]: () => jsonResponse({ error: 'forbidden' }, 403) } });
  t.useFetch(p.fetcher);
  const { location, callback, set } = await signIn(t, 'xivauth');
  const q = Object.fromEntries(location.searchParams);
  assert.equal(location.origin + location.pathname, 'https://xivauth.net/oauth/authorize');
  assert.equal(q.response_type, 'code');
  // With `character` in the scope, XIVAuth's preflight stops voters without a verified
  // character on its own page and never comes back here.
  assert.equal(q.scope, 'user');
  assert.equal(q.client_id, '3yHMau3T_wNUzny9QQDeiSS9wRl6BjNKIN5IpHxzQyU');
  assert.equal(q.redirect_uri, ORIGIN + BASE + '/api/auth/xivauth/callback');
  assert.equal(q.code_challenge_method, 'S256');

  assert.deepEqual(p.calls.map((c) => c.url), [PROVIDER.xivauth.token, PROVIDER.xivauth.user], 'no character lookup on sign-in');
  const [tokenCall, userCall] = p.calls;
  const form = Object.fromEntries(new URLSearchParams(tokenCall.body));
  assert.equal(form.grant_type, 'authorization_code');
  assert.equal(form.client_id, q.client_id);
  assert.equal(form.client_secret, SECRETS.XIVAUTH_CLIENT_SECRET);
  assert.equal(form.redirect_uri, q.redirect_uri);
  assert.equal(sha256b64url(form.code_verifier), q.code_challenge);
  assert.equal(userCall.headers.get('authorization'), 'Bearer xiv-token');
  assert.equal(userCall.headers.get('accept'), 'application/json');

  assert.equal(fragment(callback), '#signed-in');
  const cookie = `${SESSION_COOKIE}=${set[SESSION_COOKIE].value}`;
  assert.equal(keyOfCookie(cookie), sha256hex('xivauth:' + XIV_USER));
  assert.equal(t.env.DB.stats.calls, 0, 'an XIVAuth sign-in without an old ballot never touches D1');
  assert.equal(t.env.DB.raw.prepare('SELECT COUNT(*) AS n FROM characters').get().n, 0);
  assert.ok(!Buffer.from(set[SESSION_COOKIE].value.split('.')[1], 'base64url').toString().includes(XIV_USER), 'no user id in the cookie');

  const me = await t.call(API + 'auth/me', { cookie });
  assert.deepEqual(await me.json(), { signed_in: true, provider: 'xivauth', character: null, admin: false });
  assert.equal((await t.vote({ idea_id: 'ops-weather', vote: 'want' }, { cookie })).status, 200);
});

test('character data is reduced and checked before it is stored', () => {
  assert.equal(safeImageUrl(PORTRAIT), PORTRAIT);
  assert.equal(safeImageUrl('https://lds-img.finalfantasyxiv.com/h/x.png'), 'https://lds-img.finalfantasyxiv.com/h/x.png');
  for (const bad of ['http://img2.finalfantasyxiv.com/f/x.jpg', 'https://evil.example/x.jpg', 'https://finalfantasyxiv.com.evil.example/x.jpg',
    'https://user:pw@img2.finalfantasyxiv.com/x.jpg', 'https://img2.finalfantasyxiv.com:8443/x.jpg', 'javascript:alert(1)', 'x'.repeat(600), null]) {
    assert.equal(safeImageUrl(bad), '', String(bad));
  }
  assert.equal(pickCharacter([]), null);
  assert.equal(pickCharacter({}), null);
  assert.deepEqual(pickCharacter([null, { lodestone_id: 'abc', name: 'x' }, { lodestone_id: 42, name: '  A‮B  ', home_world: 'W'.repeat(40), portrait_url: 'https://evil.example/p.jpg' }]),
    { lodestone_id: '42', name: 'AB', world: 'W'.repeat(32), portrait_url: '' });
  assert.equal(pickCharacter([{ lodestone_id: '1', name: 'n'.repeat(65) }]), null);
});

test('link: a GitHub voter attaches a character with a character-only XIVAuth authorization', async () => {
  const t = setup();
  const p = providers();
  t.useFetch(p.fetcher);
  const github = await t.signedIn('github', '777');
  const { location, callback, set } = await signIn(t, 'xivauth', { mode: 'link', cookie: github });
  assert.equal(location.searchParams.get('scope'), 'character');
  assert.equal(location.searchParams.get('redirect_uri'), ORIGIN + BASE + '/api/auth/xivauth/callback');
  assert.equal(fragment(callback), '#character-linked');
  assert.ok(!(SESSION_COOKIE in set), 'the GitHub session is unchanged');
  assert.deepEqual(p.calls.map((c) => c.url), [PROVIDER.xivauth.token, PROVIDER.xivauth.characters], 'no user lookup for a link');
  assert.equal(p.calls[1].headers.get('authorization'), 'Bearer xiv-token');
  assert.equal(p.calls[1].headers.get('accept'), 'application/json');
  const row = { ...t.env.DB.raw.prepare('SELECT * FROM characters').get() };
  assert.ok(row.first_seen > 0 && row.first_seen === row.last_seen);
  assert.deepEqual({ ...row, first_seen: 0, last_seen: 0 }, {
    voter: sha256hex('github:777'), lodestone_id: '12345678', name: 'Wyn Ghostty', world: 'Gilgamesh', portrait_url: PORTRAIT, first_seen: 0, last_seen: 0,
  });
  const me = await (await t.call(API + 'auth/me', { cookie: github })).json();
  assert.equal(me.provider, 'github');
  assert.equal(me.character.name, 'Wyn Ghostty');

  // The state is bound to the account: another account's session cannot finish it.
  const again = await signIn(t, 'xivauth', { mode: 'link', cookie: github, query: {} });
  for (const intruder of [await t.signedIn('github', '888'), await t.signedIn('xivauth', XIV_USER)]) {
    const res = await t.call(API + 'auth/xivauth/callback?code=c&state=' + again.state, { cookie: `${intruder}; ${STATE_COOKIE}=${again.stateSet.value}` });
    assert.equal(fragment(res), '#auth-error=sign-in-first');
  }
  const res = await t.call(API + 'auth/xivauth/callback?code=c&state=' + again.state, { cookie: `${STATE_COOKIE}=${again.stateSet.value}` });
  assert.equal(fragment(res), '#auth-error=sign-in-first', 'signed out meanwhile');
  assert.equal(t.env.DB.raw.prepare('SELECT COUNT(*) AS n FROM characters').get().n, 1, 'nothing linked to the intruders');

  // Linking needs a session to start with.
  const start = await signIn(t, 'xivauth', { mode: 'link' });
  assert.equal(start.location.hash, '#auth-error=sign-in-first');
  assert.ok(!setCookies(start.start)[STATE_COOKIE]);

  // No character chosen: nothing linked.
  t.useFetch(providers({ characters: [] }).fetcher);
  const empty = await signIn(t, 'xivauth', { mode: 'link', cookie: await t.signedIn('github', '999') });
  assert.equal(fragment(empty.callback), '#auth-error=no-character');
  assert.equal(t.env.DB.raw.prepare('SELECT COUNT(*) AS n FROM characters').get().n, 1);
});

test('link: an FFXIV voter can link a character after signing in; relinking keeps or restarts first_seen', async () => {
  const t = setup();
  t.useFetch(providers().fetcher);
  const { set } = await signIn(t, 'xivauth');
  const cookie = `${SESSION_COOKIE}=${set[SESSION_COOKIE].value}`;
  const key = sha256hex('xivauth:' + XIV_USER);

  const p = providers();
  t.useFetch(p.fetcher);
  const link = await signIn(t, 'xivauth', { mode: 'link', cookie });
  assert.equal(link.location.searchParams.get('scope'), 'character');
  assert.equal(fragment(link.callback), '#character-linked');
  assert.ok(!(SESSION_COOKIE in link.set), 'the FFXIV session is unchanged');
  assert.deepEqual(p.calls.map((c) => c.url), [PROVIDER.xivauth.token, PROVIDER.xivauth.characters]);
  assert.equal(t.env.DB.raw.prepare('SELECT voter FROM characters').get().voter, key);
  const dump = JSON.stringify(t.env.DB.raw.prepare('SELECT * FROM characters').all()) + JSON.stringify(t.env.DB.raw.prepare('SELECT * FROM votes').all());
  assert.ok(!dump.includes(XIV_USER) && !dump.includes('xiv-token'), 'neither the XIVAuth user id nor the token is stored');

  // me shows the signed-in voter's own character, and it costs one query.
  const calls = t.env.DB.stats.calls;
  const me = await t.call(API + 'auth/me', { cookie });
  assert.equal(t.env.DB.stats.calls - calls, 1);
  assert.equal(me.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await me.json(), {
    signed_in: true, provider: 'xivauth', character: { name: 'Wyn Ghostty', world: 'Gilgamesh', portrait_url: PORTRAIT }, admin: false,
  });

  // Signing in again leaves the character alone; relinking the same one keeps first_seen, another starts over.
  t.env.DB.raw.exec('UPDATE characters SET first_seen = 5, last_seen = 5');
  await signIn(t, 'xivauth');
  assert.deepEqual({ ...t.env.DB.raw.prepare('SELECT first_seen, last_seen FROM characters').get() }, { first_seen: 5, last_seen: 5 });
  await signIn(t, 'xivauth', { mode: 'link', cookie });
  let again = t.env.DB.raw.prepare('SELECT first_seen, last_seen FROM characters').get();
  assert.equal(again.first_seen, 5);
  assert.ok(again.last_seen > 5);
  t.useFetch(providers({ characters: [{ ...CHARACTER, lodestone_id: '87654321', name: 'Other Alt', home_world: 'Ravana' }] }).fetcher);
  await signIn(t, 'xivauth', { mode: 'link', cookie });
  again = t.env.DB.raw.prepare('SELECT lodestone_id, name, world, first_seen FROM characters').get();
  assert.deepEqual({ ...again, first_seen: again.first_seen > 5 }, { lodestone_id: '87654321', name: 'Other Alt', world: 'Ravana', first_seen: true });
  assert.equal(t.env.DB.raw.prepare('SELECT COUNT(*) AS n FROM characters').get().n, 1, 'one character per voter');

  // A character list that fails is a provider error, and nothing changes.
  t.useFetch(providers({ fail: { [PROVIDER.xivauth.characters]: () => jsonResponse({ error: 'forbidden' }, 403) } }).fetcher);
  const original = console.error;
  console.error = () => {};
  try {
    const failed = await signIn(t, 'xivauth', { mode: 'link', cookie });
    assert.equal(fragment(failed.callback), '#auth-error=provider');
  } finally {
    console.error = original;
  }
  assert.equal(t.env.DB.raw.prepare('SELECT name FROM characters').get().name, 'Other Alt');
});

test('claim: signing in moves the anonymous ballot onto the account, account rows win, tallies stay exact', async () => {
  const t = setup();
  t.useFetch(providers().fetcher);
  const db = t.env.DB.raw;
  const token = 'T'.repeat(43);
  const anon = await voterKey(token);
  const account = sha256hex('github:251370');
  const [a, b, c, d] = db.prepare('SELECT id FROM ideas ORDER BY sort_order LIMIT 4').all().map((r) => r.id);
  const insert = db.prepare('INSERT INTO votes (voter, idea_id, vote, note, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?)');
  insert.run(anon, a, 'want', 'anon note on a', 10);
  insert.run(anon, b, 'skip', 'anon note on b', 11);
  insert.run(anon, c, '', 'note only', 12);
  insert.run(account, b, 'maybe', '', 20); // the account already voted on b
  insert.run(account, d, 'want', 'account only', 21);
  insert.run('e'.repeat(64), a, 'want', '', 30); // someone else
  db.prepare('INSERT INTO suggestions (voter, title, detail, created_at) VALUES (?, ?, ?, ?)').run(anon, 'anon idea', '', 5);
  db.prepare('INSERT INTO write_log (voter, at) VALUES (?, ?)').run(anon, Date.now());
  talliesMatchVotes(db);
  const tally = (id) => ({ ...db.prepare('SELECT want, maybe, skip FROM ideas WHERE id = ?').get(id) });
  assert.deepEqual([tally(a), tally(b)], [{ want: 2, maybe: 0, skip: 0 }, { want: 0, maybe: 1, skip: 1 }]);

  const calls = t.env.DB.stats.calls;
  const { callback, set } = await signIn(t, 'github', { cookie: `${COOKIE_NAME}=${token}` });
  assert.equal(fragment(callback), '#signed-in');
  assert.equal(t.env.DB.stats.calls - calls, 1, 'the claim is one D1 batch');
  assert.equal(set[COOKIE_NAME].value, '', 'the anonymous cookie is cleared');
  assert.ok(set[COOKIE_NAME].attrs.includes('Max-Age=0') && set[COOKIE_NAME].attrs.includes(`Path=${BASE}`));

  const rows = (voter) => db.prepare('SELECT idea_id, vote, note FROM votes WHERE voter = ? ORDER BY idea_id').all(voter).map((r) => ({ ...r }));
  assert.deepEqual(rows(anon), [], 'nothing left under the anonymous key');
  assert.deepEqual(rows(account), [
    { idea_id: a, vote: 'want', note: 'anon note on a' },
    { idea_id: b, vote: 'maybe', note: '' }, // account row won
    { idea_id: c, vote: '', note: 'note only' },
    { idea_id: d, vote: 'want', note: 'account only' },
  ].sort((x, y) => (x.idea_id < y.idea_id ? -1 : 1)));
  assert.deepEqual(tally(a), { want: 2, maybe: 0, skip: 0 }, 'a moved vote still counts once');
  assert.deepEqual(tally(b), { want: 0, maybe: 1, skip: 0 }, "the losing anonymous vote left b's tally");
  talliesMatchVotes(db);
  assert.equal(db.prepare('SELECT voter FROM suggestions').get().voter, account);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM write_log WHERE voter = ?').get(account).n, 1);

  // api/mine for the new session returns the merged ballot.
  const cookie = `${SESSION_COOKIE}=${set[SESSION_COOKIE].value}`;
  const mine = await (await t.mine({ cookie })).json();
  assert.deepEqual(Object.keys(mine.votes).sort(), [a, b, c, d].sort());
  assert.deepEqual(mine.suggestions.map((s) => s.title), ['anon idea']);

  // Signing in again with the (stale) anonymous cookie changes nothing.
  const before = allTallies(db);
  await signIn(t, 'github', { cookie: `${COOKIE_NAME}=${token}` });
  assert.deepEqual(allTallies(db), before);
  assert.equal(rows(account).length, 4);
});

test('claim statements on their own: all-or-nothing, and a no-op for the same key', () => {
  const env = { DB: createD1(...MIGRATIONS, SEED) };
  assert.deepEqual(claimStatements(env.DB, 'a'.repeat(64), 'a'.repeat(64)), []);
  assert.equal(claimStatements(env.DB, 'a'.repeat(64), 'b'.repeat(64)).length, 4);
});

test('XIVAuth sign-in with an old anonymous ballot claims it in one batch', async () => {
  const t = setup();
  t.useFetch(providers().fetcher);
  const token = 'X'.repeat(43);
  const db = t.env.DB.raw;
  db.prepare("INSERT INTO votes (voter, idea_id, vote, note, created_at, updated_at) VALUES (?, 'ops-weather', 'want', '', 1, 1)").run(await voterKey(token));
  const calls = t.env.DB.stats.calls;
  const { set } = await signIn(t, 'xivauth', { cookie: `${COOKIE_NAME}=${token}` });
  assert.equal(t.env.DB.stats.calls - calls, 1);
  const key = sha256hex('xivauth:' + XIV_USER);
  assert.equal(db.prepare('SELECT voter FROM votes').get().voter, key);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM characters').get().n, 0);
  assert.equal(set[COOKIE_NAME].value, '');
  talliesMatchVotes(db);
});

test('start: refuses cross-site starts and missing configuration; return paths stay on the vote page', async () => {
  const t = setup();
  let res = await t.call(API + 'auth/github/start', { headers: { 'sec-fetch-site': 'cross-site' } });
  assert.equal(res.headers.get('location'), PAGE + '#auth-error=refused');
  assert.ok(!res.headers.get('set-cookie'));
  res = await t.call(API + 'auth/github/start?return=' + encodeURIComponent('https://evil.example/'), { headers: { 'sec-fetch-site': 'none' } });
  assert.ok(res.headers.get('location').startsWith(PROVIDER.github.authorize));

  // An open-redirect attempt ends on the vote page after the round trip.
  t.useFetch(providers().fetcher);
  for (const evil of ['https://evil.example/', '//evil.example', '/\\evil.example', BASE + '/api/auth/logout']) {
    const { callback } = await signIn(t, 'github', { returnTo: evil });
    assert.equal(callback.headers.get('location'), PAGE + '#signed-in', evil);
  }
  const admin = await signIn(t, 'github', { returnTo: BASE + '/admin/' });
  assert.equal(admin.callback.headers.get('location'), ORIGIN + BASE + '/admin/#signed-in');

  for (const missing of ['SESSION_SECRET', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET']) {
    const bare = setup({ [missing]: undefined });
    const r = await bare.call(API + 'auth/github/start');
    assert.equal(r.headers.get('location'), PAGE + '#auth-error=not-configured', missing);
  }
  const short = setup({ SESSION_SECRET: 'too-short' });
  assert.equal((await short.call(API + 'auth/xivauth/start')).headers.get('location'), PAGE + '#auth-error=not-configured');
  assert.equal((await short.call(API + 'auth/xivauth/callback?code=c&state=s')).headers.get('location'), PAGE + '#auth-error=not-configured');
});

test('me: signed out costs no D1 and reports an old anonymous ballot; sessions near expiry are renewed', async () => {
  const t = setup();
  let res = await t.call(API + 'auth/me');
  assert.deepEqual(await res.json(), { signed_in: false, legacy_ballot: false });
  res = await t.call(API + 'auth/me', { cookie: `${COOKIE_NAME}=${'A'.repeat(43)}` });
  assert.deepEqual(await res.json(), { signed_in: false, legacy_ballot: true });
  assert.equal(res.headers.get('cache-control'), 'private, no-store');
  assert.equal(t.env.DB.stats.calls, 0);
  assert.equal((await t.call(API + 'auth/me', { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);

  const fresh = await t.signedIn();
  res = await t.call(API + 'auth/me', { cookie: fresh });
  assert.equal(res.headers.get('set-cookie'), null, 'a fresh session is not re-issued');
  const k = sha256hex('github:5');
  const nearly = await signValue(SECRETS.SESSION_SECRET, 'session', { p: 'github', k, exp: Math.floor(Date.now() / 1000) + SESSION_RENEW_S - 60 });
  res = await t.call(API + 'auth/me', { cookie: `${SESSION_COOKIE}=${nearly}` });
  const renewed = setCookies(res)[SESSION_COOKIE];
  assert.ok(renewed, 'renewed');
  const s = await readSession(new Request(ORIGIN, { headers: { cookie: `${SESSION_COOKIE}=${renewed.value}` } }), t.env);
  assert.equal(s.k, k);
  assert.ok(s.exp > Math.floor(Date.now() / 1000) + SESSION_RENEW_S);
});

test('logout clears the session cookie (same-origin POST only); forget deletes the character and keeps the votes', async () => {
  const t = setup();
  t.useFetch(providers().fetcher);
  const { set } = await signIn(t, 'xivauth');
  const cookie = `${SESSION_COOKIE}=${set[SESSION_COOKIE].value}`;
  assert.equal(fragment((await signIn(t, 'xivauth', { mode: 'link', cookie })).callback), '#character-linked');
  assert.equal((await t.vote({ idea_id: 'ops-weather', vote: 'want', note: 'keep me' }, { cookie })).status, 200);

  assert.equal((await t.call(API + 'auth/character/forget', { method: 'POST', body: {}, cookie, headers: { origin: 'https://evil.example' } })).status, 403);
  assert.equal((await t.call(API + 'auth/character/forget', { method: 'POST', body: {} })).status, 401);
  let res = await t.call(API + 'auth/character/forget', { method: 'POST', body: {}, cookie });
  assert.equal(res.status, 200);
  assert.equal(t.env.DB.raw.prepare('SELECT COUNT(*) AS n FROM characters').get().n, 0);
  assert.equal(t.env.DB.raw.prepare('SELECT note FROM votes').get().note, 'keep me');
  assert.equal((await (await t.call(API + 'auth/me', { cookie })).json()).character, null);

  res = await t.call(API + 'auth/logout', { method: 'POST', body: {}, cookie, headers: { origin: 'https://evil.example' } });
  assert.equal(res.status, 403);
  assert.equal(res.headers.get('set-cookie'), null);
  const calls = t.env.DB.stats.calls;
  res = await t.call(API + 'auth/logout', { method: 'POST', body: {}, cookie });
  assert.equal(res.status, 200);
  assert.equal(t.env.DB.stats.calls, calls, 'logout never touches D1');
  const cleared = setCookies(res)[SESSION_COOKIE];
  assert.equal(cleared.value, '');
  assert.ok(cleared.attrs.includes('Max-Age=0') && cleared.attrs.includes(`Path=${BASE}`));
});

test('admin/voters: owner only, never cached, with characters, counts, notes and suggestions', async () => {
  const t = setup();
  const db = t.env.DB.raw;
  t.useFetch(providers().fetcher);
  const { set } = await signIn(t, 'xivauth');
  const player = `${SESSION_COOKIE}=${set[SESSION_COOKIE].value}`;
  await signIn(t, 'xivauth', { mode: 'link', cookie: player });
  const owner = await t.signedIn('github', '251370');
  const quiet = await t.signedIn('github', '31337');
  const [a, b] = db.prepare('SELECT id FROM ideas ORDER BY sort_order LIMIT 2').all().map((r) => r.id);
  await t.vote({ idea_id: a, vote: 'want', note: 'take my gil' }, { cookie: player });
  await t.vote({ idea_id: b, vote: 'skip' }, { cookie: player });
  await t.call(API + 'suggest', { method: 'POST', body: { title: 'Chocobo CI', detail: 'kweh' }, cookie: player });
  await t.vote({ idea_id: a, vote: 'maybe' }, { cookie: quiet });

  for (const [cookie, status, error] of [[undefined, 401, 'sign_in_required'], [player, 403, 'forbidden'], [quiet, 403, 'forbidden']]) {
    const calls = t.env.DB.stats.calls;
    const res = await t.call(API + 'admin/voters', { cookie });
    assert.equal(res.status, status);
    assert.equal(res.headers.get('cache-control'), 'private, no-store');
    const body = await res.json();
    assert.deepEqual(Object.keys(body).sort(), ['error', 'message'], 'nothing else in a refusal');
    assert.equal(body.error, error);
    assert.equal(t.env.DB.stats.calls, calls, 'refused before D1');
  }
  assert.equal((await t.call(API + 'admin/voters', { cookie: owner, headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
  const noAdmins = setup({ ADMIN_ACCOUNTS: '' });
  assert.equal((await noAdmins.call(API + 'admin/voters', { cookie: await noAdmins.signedIn('github', '251370') })).status, 403);

  const calls = t.env.DB.stats.calls;
  const res = await t.call(API + 'admin/voters', { cookie: owner });
  assert.equal(res.status, 200);
  assert.equal(t.env.DB.stats.calls - calls, 1, 'one batch');
  assert.equal(res.headers.get('cache-control'), 'private, no-store');
  const data = await res.json();
  assert.deepEqual(data.totals, { voters: 2, with_character: 1, notes: 1, suggestions: 1 });
  const byKey = Object.fromEntries(data.voters.map((v) => [v.voter, v]));
  const p = byKey[sha256hex('xivauth:' + XIV_USER)];
  assert.deepEqual({ want: p.want, maybe: p.maybe, skip: p.skip }, { want: 1, maybe: 0, skip: 1 });
  assert.deepEqual({ ...p.character, first_seen: 0, last_seen: 0 }, { lodestone_id: '12345678', name: 'Wyn Ghostty', world: 'Gilgamesh', portrait_url: PORTRAIT, first_seen: 0, last_seen: 0 });
  assert.deepEqual(p.notes.map((n) => [n.idea_id, n.vote, n.note]), [[a, 'want', 'take my gil']]);
  assert.ok(p.notes[0].title);
  assert.deepEqual(p.suggestions.map((s) => [s.title, s.detail, s.status]), [['Chocobo CI', 'kweh', 'new']]);
  const q = byKey[sha256hex('github:31337')];
  assert.deepEqual({ character: q.character, want: q.want, maybe: q.maybe, notes: q.notes, you: q.you }, { character: null, want: 0, maybe: 1, notes: [], you: false });
  assert.ok(!JSON.stringify(data).includes(XIV_USER), 'no provider user ids');
});

test('migration 0004 is additive and safe to re-run on a database with 0001-0003 and votes', () => {
  const db = createD1(MIGRATIONS[0], MIGRATIONS[1], MIGRATIONS[2], SEED).raw;
  db.exec("INSERT INTO votes (voter, idea_id, vote, note, created_at, updated_at) VALUES ('v', 'ops-weather', 'want', 'n', 1, 1)");
  const schemaBefore = db.prepare("SELECT type, name, sql FROM sqlite_master ORDER BY name").all().map((r) => ({ ...r }));
  const tallies = allTallies(db);
  db.exec('BEGIN'); db.exec(MIGRATIONS[3]); db.exec('COMMIT');
  db.exec(MIGRATIONS[3]);
  const schemaAfter = db.prepare("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE '%characters%' ORDER BY name").all().map((r) => ({ ...r }));
  assert.deepEqual(schemaAfter, schemaBefore, 'nothing existing changed');
  assert.deepEqual(allTallies(db), tallies);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM votes').get().n, 1);
  const ins = db.prepare('INSERT INTO characters (voter, lodestone_id, name, world, portrait_url, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, 1, 1)');
  ins.run('a'.repeat(64), '1', 'Name', 'World', '');
  assert.throws(() => ins.run('b'.repeat(63), '1', 'Name', 'World', ''), /CHECK/);
  assert.throws(() => ins.run('b'.repeat(64), '1', '', 'World', ''), /CHECK/);
  assert.throws(() => ins.run('a'.repeat(64), '2', 'Name', 'World', ''), /UNIQUE|PRIMARY KEY/);
});
