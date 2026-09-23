// The account gate: nothing is written without a GitHub or XIVAuth account. Every write
// endpoint answers 401 (machine readable) to a stranger, takes a session, takes a linked
// app's token only with the right scope, refuses revoked and expired tokens and banned
// accounts, and counts per account as well as per address. Then the device link end to end.
import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../src/app.js';
import { ALMANAC_BASE, GALLERY_BASE } from '../src/lib.js';
import { GALLERY } from '../src/gallery.js';
import { ALMANAC } from '../src/almanac.js';
import { DEVICE, cleanUserCode, newUserCode } from '../src/device.js';
import { CLIENTS, MOD_IDS } from '../src/clients.js';
import { COMPACT_LIMIT } from '../src/account.js';
import { API, ORIGIN, memoryKV, setup, sha256hex } from './harness.js';
import { png, result } from './fixtures.js';

const UPLOAD = GALLERY_BASE + '/api/upload';
const WEB_UPLOAD = API + 'gallery/upload';
const RESULTS = ALMANAC_BASE + '/api/results';

function gateSetup() {
  const t = setup({ GALLERY_KV: memoryKV() });
  // raw bodies (images) and any header, which harness.call does not do
  const raw = (path, { method = 'POST', body, headers = {}, cookie, ip = '203.0.113.50' } = {}) => handle(new Request(ORIGIN + path, {
    method, body, headers: { 'cf-connecting-ip': ip, ...(cookie ? { cookie } : {}), ...headers },
  }), t.env, { waitUntil() {} }, t.cache);
  const upload = (opts = {}, seed = 1, path = UPLOAD) => raw(path, { body: png(640, 360, { seed }), ...opts, headers: { 'content-type': 'image/png', ...opts.headers } });
  const submit = (opts = {}, score = 50) => raw(RESULTS, { body: JSON.stringify(result({ metrics: { score } })), ...opts, headers: { 'content-type': 'application/json', ...opts.headers } });
  const count = (table) => t.env.DB.raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
  return { ...t, raw, upload, submit, count };
}

// Every endpoint that stores something a visitor sent, and a request that would be accepted.
const WRITES = [
  ['vote', (t, o) => t.raw(API + 'vote', { body: JSON.stringify({ idea_id: 'placeholder', vote: 'want' }), ...o, headers: { 'content-type': 'application/json', origin: ORIGIN, ...o?.headers } }), null],
  ['suggest', (t, o) => t.raw(API + 'suggest', { body: JSON.stringify({ title: 'A fine idea' }), ...o, headers: { 'content-type': 'application/json', origin: ORIGIN, ...o?.headers } }), null],
  ['gallery upload', (t, o) => t.upload(o), 'gallery:upload'],
  ['gallery upload (web path)', (t, o) => t.upload(o, 2, WEB_UPLOAD), 'gallery:upload'],
  ['minisite upload', (t, o) => t.upload(o, 3, API + 'shots/upload?mod=xivmcp'), 'gallery:upload'],
  ['almanac results', (t, o) => t.submit(o), 'almanac:submit'],
];
const ideaId = (t) => t.env.DB.raw.prepare('SELECT id FROM ideas WHERE retired = 0 LIMIT 1').get().id;
const withIdea = (t, send) => (o) => send({ ...t, raw: (p, init) => t.raw(p, { ...init, body: init.body.replace('placeholder', ideaId(t)) }) }, o);

test('every write endpoint: 401 with sign-in directions for a stranger, and nothing is stored', async () => {
  for (const [name, send] of WRITES) {
    const t = gateSetup();
    const res = await withIdea(t, send)({});
    assert.equal(res.status, 401, name);
    assert.match(res.headers.get('www-authenticate'), /^Bearer /, name);
    const body = await res.json();
    assert.equal(body.error, 'sign_in_required', name);
    assert.deepEqual(body.sign_in, {
      providers: ['github', 'xivauth'],
      github: ORIGIN + API + 'auth/github/start',
      xivauth: ORIGIN + API + 'auth/xivauth/start',
      device: { code_endpoint: ORIGIN + API + 'device/code', token_endpoint: ORIGIN + API + 'device/token', verification_uri: ORIGIN + '/mods/ffxiv/term/vote/apps/' },
    }, name);
    assert.deepEqual(body.min_client, { ghostty: CLIENTS.ghostty.min_version, almanac: CLIENTS.almanac.min_version }, name);
    assert.equal(typeof body.message, 'string');
    for (const table of ['votes', 'suggestions', 'shots', 'upload_log', 'almanac_results', 'almanac_submit_log']) assert.equal(t.count(table), 0, name + ' ' + table);
    assert.equal(t.env.GALLERY_KV.store.size, 0, name);
  }
  // an old plugin is told which version it needs
  const t = gateSetup();
  assert.match((await (await t.upload()).json()).message, /update Ghostty to 0\.3\.0 or newer/);
  // Ghostty before 0.3.0 keeps 240 characters of the answer: the whole body must fit, and still parse
  const old = await t.upload({ headers: { 'x-ghostty-client': '0.2.0' } });
  const text = await old.text();
  assert.ok(text.length <= COMPACT_LIMIT, String(text.length));
  assert.match(JSON.parse(text).message, /Update Ghostty to 0\.3\.0 or newer, then run \/term share/);
  assert.match(old.headers.get('link'), /device\/code>; rel="device_authorization"/);
  // what a new shim keeps (1000 characters) holds every other answer of the gate whole
  for (const res of [await t.upload(), await t.upload({ headers: { authorization: 'Bearer nope' } }), await t.raw(API + 'device/code', { body: '{"client_id":"ghostty"}', headers: { 'content-type': 'application/json' } })]) {
    assert.ok((await res.text()).length <= 1000);
  }
  assert.match((await (await t.submit()).json()).message, /Update Almanac to 0\.2\.0 or newer/);
});

test('every write endpoint: a session is enough, and the row carries provider and account', async () => {
  for (const [name, send] of WRITES) {
    for (const provider of ['github', 'xivauth']) {
      const t = gateSetup();
      const res = await withIdea(t, send)({ cookie: await t.signedIn(provider, '4242') });
      assert.ok(res.status === 200 || res.status === 201, `${name} ${provider}: ${res.status}`);
      const account = sha256hex(provider + ':4242');
      const table = { vote: 'votes', suggest: 'suggestions', 'almanac results': 'almanac_results' }[name] || 'shots';
      const row = t.env.DB.raw.prepare(`SELECT * FROM ${table}`).get();
      assert.equal(row.provider, provider, name);
      assert.equal(row.account ?? row.voter, account, name);
      if ('token_id' in row) assert.equal(row.token_id, '', name);
      if (table === 'shots') assert.equal(row.source, 'web');
    }
  }
});

test('linked-app tokens: right scope writes, wrong scope 403, revoked / expired / unknown 401, never on the ballot', async () => {
  const t = gateSetup();
  const ghostty = t.linked('ghostty', { id: '77' });
  const almanac = t.linked('almanac', { id: '77' });

  let res = await t.upload({ headers: ghostty.header });
  assert.equal(res.status, 201);
  let row = t.env.DB.raw.prepare('SELECT provider, account, token_id, source FROM shots').get();
  assert.deepEqual({ ...row }, { provider: 'github', account: ghostty.account, token_id: ghostty.tokenId, source: 'plugin' });
  res = await t.submit({ headers: almanac.header });
  assert.equal(res.status, 201);
  row = t.env.DB.raw.prepare('SELECT provider, account, token_id FROM almanac_results').get();
  assert.deepEqual({ ...row }, { provider: 'github', account: almanac.account, token_id: almanac.tokenId });
  assert.ok(t.env.DB.raw.prepare('SELECT last_used_at FROM api_tokens WHERE id = ?').get(ghostty.tokenId).last_used_at > 0);

  // the wrong scope
  res = await t.upload({ headers: almanac.header }, 3);
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, 'insufficient_scope');
  assert.match(res.headers.get('www-authenticate'), /scope="gallery:upload"/);
  res = await t.submit({ headers: ghostty.header }, 51);
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, 'insufficient_scope');

  // revoked, expired, unknown, malformed
  const cases = [
    [t.linked('ghostty', { id: '78', revokedAt: Date.now() }).header, 'token_revoked'],
    [t.linked('ghostty', { id: '79', expiresAt: Date.now() - 1 }).header, 'token_expired'],
    [{ authorization: 'Bearer gvt_' + 'A'.repeat(43) }, 'invalid_token'],
    [{ authorization: 'Bearer nonsense' }, 'invalid_token'],
    [{ authorization: 'Basic abc' }, 'invalid_token'],
  ];
  for (const [header, error] of cases) {
    res = await t.upload({ headers: header }, 4);
    assert.equal(res.status, 401, error);
    const body = await res.json();
    assert.equal(body.error, error);
    assert.ok(body.sign_in.device.code_endpoint, 'a refused token says where to link again');
  }
  // a bad token is not rescued by a good cookie: the app must learn its token is dead
  res = await t.upload({ headers: cases[0][0], cookie: await t.signedIn() }, 4);
  assert.equal(res.status, 401);

  // no scope exists for the ballot
  for (const [name, send] of WRITES.slice(0, 2)) {
    res = await withIdea(t, send)({ headers: ghostty.header });
    assert.equal(res.status, 401, name);
    assert.equal((await res.json()).error, 'invalid_token');
  }
  assert.equal(t.count('shots'), 1);
  assert.equal(t.count('almanac_results'), 1);
  assert.equal(t.count('votes') + t.count('suggestions'), 0);
  // the token itself is nowhere in the database
  const dump = JSON.stringify(t.env.DB.raw.prepare('SELECT * FROM api_tokens').all());
  assert.ok(!dump.includes(ghostty.token) && !dump.includes(ghostty.token.slice(4)));
});

test('per-account limits hold across addresses, beside the per-address ones', async () => {
  const t = gateSetup();
  const one = t.linked('ghostty', { id: '900' });
  for (let i = 0; i < GALLERY.perAccountPerHour; i++) {
    assert.equal((await t.upload({ headers: one.header, ip: '198.51.100.' + i }, 100 + i)).status, 201, 'shot ' + i);
  }
  let res = await t.upload({ headers: one.header, ip: '198.51.100.99' }, 199);
  assert.equal(res.status, 429);
  assert.equal((await res.json()).error, 'rate_limited');
  // the same account through the web page is the same account
  res = await t.upload({ cookie: await t.signedIn('github', '900'), ip: '198.51.100.98' }, 198, WEB_UPLOAD);
  assert.equal(res.status, 429);
  assert.equal((await t.upload({ headers: t.linked('ghostty', { id: '901' }).header, ip: '198.51.100.99' }, 199)).status, 201, 'another account is unaffected');
  // and one address is still limited whatever accounts it uses
  for (let i = 0; i < GALLERY.perAddressPerHour; i++) {
    assert.equal((await t.upload({ headers: t.linked('ghostty', { id: String(1000 + i) }).header, ip: '192.0.2.1' }, 300 + i)).status, 201);
  }
  assert.equal((await t.upload({ headers: t.linked('ghostty', { id: '1999' }).header, ip: '192.0.2.1' }, 399)).status, 429);

  const a = t.linked('almanac', { id: '900' });
  for (let i = 0; i < ALMANAC.perAccountPerHour; i++) {
    assert.equal((await t.submit({ headers: a.header, ip: '198.51.100.' + i }, i)).status, 201, 'run ' + i);
  }
  res = await t.submit({ headers: a.header, ip: '198.51.100.97' }, 99);
  assert.equal(res.status, 429);
  assert.equal((await t.submit({ headers: t.linked('almanac', { id: '901' }).header, ip: '198.51.100.97' }, 99)).status, 201);
});

test('gallery mod tag: only a published mod id, stored and listed', async () => {
  const t = gateSetup();
  assert.deepEqual(MOD_IDS, ['ghostty', 'almanac', 'xivmcp', 'xivdesktop', 'xivarcade', 'xivwayfinder', 'xivlantern']);
  const cookie = await t.signedIn();
  let res = await t.raw(WEB_UPLOAD + '?mod=evil', { body: png(), cookie, headers: { 'content-type': 'image/png' } });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'bad_mod');
  res = await t.raw(WEB_UPLOAD + '?mod=xivmcp', { body: png(), cookie, headers: { 'content-type': 'image/png' } });
  assert.equal(res.status, 201);
  assert.equal(t.env.DB.raw.prepare('SELECT mod, status FROM shots').get().mod, 'xivmcp');
  assert.equal(t.env.DB.raw.prepare('SELECT status FROM shots').get().status, 'pending', 'always through the queue');
  await t.upload({ cookie }, 9, WEB_UPLOAD);
  assert.deepEqual(t.env.DB.raw.prepare('SELECT mod FROM shots ORDER BY mod').all().map((r) => r.mod), [null, 'xivmcp']);
});

test('legacy rows stay, marked by their empty account', async () => {
  const t = gateSetup();
  t.env.DB.raw.exec(`INSERT INTO shots (id, content_type, bytes, width, height, digest, uploader, created_at)
    VALUES ('${'a'.repeat(22)}', 'image/png', 1, 64, 64, 'd', '${'f'.repeat(64)}', 1)`);
  await t.upload({ headers: t.linked('ghostty').header });
  const owner = await t.signedIn('github', '251370');
  const q = await (await t.call(API + 'admin/gallery', { cookie: owner })).json();
  assert.deepEqual(q.pending.map((s) => [s.legacy, s.provider]), [[true, ''], [false, 'github']]);
});

// ---- the device link -----------------------------------------------------------------------
const postJson = (t, path, body, opts = {}) => t.raw(path, { body: JSON.stringify(body), ...opts, headers: { 'content-type': 'application/json', ...opts.headers } });
const browser = (cookie) => ({ cookie, headers: { origin: ORIGIN, 'sec-fetch-site': 'same-origin' } });

test('user codes: eight unambiguous letters, forgiving to type', () => {
  for (let i = 0; i < 50; i++) assert.match(newUserCode(), /^[BCDFGHJKLMNPQRSTVWXZ]{4}-[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
  assert.equal(cleanUserCode(' bcdf ghjk '), 'BCDF-GHJK');
  assert.equal(cleanUserCode('bcdfghjk'), 'BCDF-GHJK');
  for (const bad of ['', 'BCDF', 'ABCD-EFGH', 'BCDF-GHJK-L', null, 42, 'B'.repeat(40)]) assert.equal(cleanUserCode(bad), null, String(bad));
});

test('device link end to end: code, pending, approve in a browser, token once, upload, list, revoke', async () => {
  const t = gateSetup();
  let res = await postJson(t, API + 'device/code', { client_id: 'ghostty' });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'private, no-store');
  const grant = await res.json();
  assert.match(grant.device_code, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(grant.verification_uri, ORIGIN + '/mods/ffxiv/term/vote/apps/');
  assert.equal(grant.verification_uri_complete, grant.verification_uri + '?code=' + grant.user_code);
  assert.deepEqual([grant.expires_in, grant.interval, grant.client_name, grant.scope], [900, 5, 'Ghostty in FFXIV', 'gallery:upload']);
  assert.ok(!JSON.stringify(t.env.DB.raw.prepare('SELECT * FROM device_codes').all()).includes(grant.device_code), 'device code is hashed at rest');

  const poll = () => postJson(t, API + 'device/token', { client_id: 'ghostty', device_code: grant.device_code });
  res = await poll();
  assert.deepEqual([res.status, (await res.json()).error], [400, 'authorization_pending']);
  res = await poll();
  assert.deepEqual([res.status, (await res.json()).error], [400, 'slow_down'], 'polling faster than the interval');
  res = await postJson(t, API + 'device/token', { client_id: 'almanac', device_code: grant.device_code });
  assert.equal((await res.json()).error, 'invalid_grant', 'another client cannot redeem it');

  // the browser: signed out -> 401; signed in -> sees who is asking, approves
  res = await postJson(t, API + 'device/lookup', { user_code: grant.user_code }, browser());
  assert.equal(res.status, 401);
  const cookie = await t.signedIn('xivauth', 'a1b2c3');
  res = await postJson(t, API + 'device/lookup', { user_code: grant.user_code.toLowerCase().replace('-', ' ') }, browser(cookie));
  assert.equal(res.status, 200);
  const asked = await res.json();
  assert.deepEqual([asked.client_name, asked.scopes.map((s) => s.id)], ['Ghostty in FFXIV', ['gallery:upload']]);
  res = await postJson(t, API + 'device/approve', { user_code: grant.user_code, action: 'approve' }, { cookie, headers: { origin: 'https://evil.example' } });
  assert.equal(res.status, 403, 'a cross-site page cannot approve');
  res = await postJson(t, API + 'device/lookup', { user_code: 'BCDF-GHJK' }, browser(cookie));
  assert.equal(res.status, 404);
  res = await postJson(t, API + 'device/approve', { user_code: grant.user_code, action: 'approve' }, browser(cookie));
  assert.equal(res.status, 200);
  res = await postJson(t, API + 'device/approve', { user_code: grant.user_code, action: 'approve' }, browser(await t.signedIn()));
  assert.equal(res.status, 404, 'a code is answered once');

  res = await poll();
  assert.equal(res.status, 200);
  const tok = await res.json();
  assert.match(tok.access_token, /^gvt_[A-Za-z0-9_-]{43}$/);
  assert.deepEqual([tok.token_type, tok.scope, tok.expires_in], ['Bearer', 'gallery:upload', DEVICE.tokenTtlMs / 1000]);
  res = await poll();
  assert.equal((await res.json()).error, 'invalid_grant', 'the token is handed out exactly once');
  const stored = t.env.DB.raw.prepare('SELECT * FROM api_tokens').get();
  assert.equal(stored.token_hash, sha256hex(tok.access_token));
  assert.ok(!JSON.stringify(stored).includes(tok.access_token));
  assert.deepEqual([stored.provider, stored.account, stored.client], ['xivauth', sha256hex('xivauth:a1b2c3'), 'ghostty']);

  const auth = { authorization: 'Bearer ' + tok.access_token };
  assert.equal((await t.upload({ headers: auth })).status, 201);
  assert.equal((await t.submit({ headers: auth })).status, 403, 'only the scope it was given');

  // your connected apps
  res = await t.raw(API + 'apps', { method: 'GET', ...browser(cookie) });
  const apps = (await res.json()).apps;
  assert.deepEqual(apps.map((a) => [a.id, a.client_name, a.status, a.scopes]), [[tok.token_id, 'Ghostty in FFXIV', 'active', ['gallery:upload']]]);
  assert.ok(!JSON.stringify(apps).includes(tok.access_token.slice(4)));
  assert.equal((await t.raw(API + 'apps', { method: 'GET' })).status, 401);
  res = await postJson(t, API + 'apps/revoke', { id: tok.token_id }, browser(await t.signedIn()));
  assert.equal(res.status, 404, "another account cannot revoke it");
  res = await postJson(t, API + 'apps/revoke', { id: tok.token_id }, browser(cookie));
  assert.equal(res.status, 200);
  res = await t.upload({ headers: auth }, 2);
  assert.deepEqual([res.status, (await res.json()).error], [401, 'token_revoked']);
});

test('device link: deny, expiry, unknown clients and scopes, request limits, an app signing itself out', async () => {
  const t = gateSetup();
  for (const [body, error] of [[{ client_id: 'nope' }, 'invalid_client'], [{}, 'invalid_client'], [{ client_id: 'ghostty', scope: 'almanac:submit' }, 'invalid_scope'], [{ client_id: 'almanac', scope: '' }, 'invalid_scope']]) {
    const res = await postJson(t, API + 'device/code', body);
    assert.deepEqual([res.status, (await res.json()).error], [400, error]);
  }
  const cookie = await t.signedIn();
  let grant = await (await postJson(t, API + 'device/code', { client_id: 'almanac', scope: 'almanac:submit' })).json();
  await postJson(t, API + 'device/approve', { user_code: grant.user_code, action: 'deny' }, browser(cookie));
  let res = await postJson(t, API + 'device/token', { client_id: 'almanac', device_code: grant.device_code });
  assert.deepEqual([res.status, (await res.json()).error], [400, 'access_denied']);
  assert.equal(t.count('api_tokens'), 0);

  grant = await (await postJson(t, API + 'device/code', { client_id: 'almanac' })).json();
  t.env.DB.raw.exec('UPDATE device_codes SET expires_at = 1');
  res = await postJson(t, API + 'device/token', { client_id: 'almanac', device_code: grant.device_code });
  assert.equal((await res.json()).error, 'expired_token');
  res = await postJson(t, API + 'device/approve', { user_code: grant.user_code, action: 'approve' }, browser(cookie));
  assert.equal(res.status, 404, 'an expired code cannot be approved');

  for (let i = 2; i < DEVICE.perAddressPerHour; i++) assert.equal((await postJson(t, API + 'device/code', { client_id: 'almanac' })).status, 200);
  res = await postJson(t, API + 'device/code', { client_id: 'almanac' });
  assert.equal(res.status, 429);
  assert.equal((await postJson(t, API + 'device/code', { client_id: 'almanac' }, { ip: '198.51.100.200' })).status, 200);

  const mine = t.linked('almanac', { id: '5' });
  assert.equal((await t.raw(API + 'token/revoke', { headers: mine.header })).status, 200);
  assert.equal((await t.submit({ headers: mine.header })).status, 401);
  assert.equal((await t.raw(API + 'token/revoke', {})).status, 401);
});

test('the owner: sees every linked app and account, revokes any token, bans and unbans accounts', async () => {
  const t = gateSetup();
  const owner = await t.signedIn('github', '251370');
  const rude = t.linked('ghostty', { provider: 'xivauth', id: 'rude' });
  const rudeToo = t.linked('almanac', { provider: 'xivauth', id: 'rude' });
  const kind = t.linked('ghostty', { id: '31337' });
  await t.upload({ headers: rude.header });
  await t.upload({ headers: kind.header, ip: '198.51.100.4' }, 2);

  assert.equal((await t.raw(API + 'admin/accounts', { method: 'GET', ...browser(await t.signedIn()) })).status, 403);
  assert.equal((await t.raw(API + 'admin/accounts', { method: 'GET' })).status, 401);
  let list = await (await t.raw(API + 'admin/accounts', { method: 'GET', ...browser(owner) })).json();
  assert.equal(list.tokens.length, 3);
  assert.deepEqual(list.accounts.map((a) => [a.account, a.shots, a.tokens, a.banned]).sort(), [[kind.account, 1, 1, false], [rude.account, 1, 2, false]].sort());

  let res = await postJson(t, API + 'admin/tokens/revoke', { id: kind.tokenId }, browser(owner));
  assert.equal(res.status, 200);
  assert.equal((await t.upload({ headers: kind.header, ip: '198.51.100.4' }, 3)).status, 401);

  for (const who of [await t.signedIn(), undefined]) {
    res = await postJson(t, API + 'admin/accounts/ban', { account: rude.account, banned: true }, browser(who));
    assert.equal(res.status, who ? 403 : 401);
  }
  res = await postJson(t, API + 'admin/accounts/ban', { provider: 'xivauth', id: 'rude', banned: true, reason: 'spam' }, browser(owner));
  assert.deepEqual(await res.json(), { ok: true, account: rude.account, banned: true });
  // tokens die with the ban, the session is refused everywhere, and no new link can be approved
  assert.equal((await t.upload({ headers: rude.header }, 5)).status, 401);
  assert.equal((await t.submit({ headers: rudeToo.header })).status, 401);
  const rudeCookie = await t.signedIn('xivauth', 'rude');
  for (const [name, send] of WRITES) {
    res = await withIdea(t, send)({ cookie: rudeCookie });
    assert.deepEqual([res.status, (await res.json()).error], [403, 'account_banned'], name);
  }
  const grant = await (await postJson(t, API + 'device/code', { client_id: 'ghostty' })).json();
  res = await postJson(t, API + 'device/approve', { user_code: grant.user_code, action: 'approve' }, browser(rudeCookie));
  assert.equal(res.status, 403);
  res = await postJson(t, API + 'admin/accounts/ban', { account: sha256hex('github:251370'), banned: true }, browser(owner));
  assert.equal(res.status, 400, 'the owner cannot lock themselves out');

  list = await (await t.raw(API + 'admin/accounts', { method: 'GET', ...browser(owner) })).json();
  assert.deepEqual(list.bans.map((b) => [b.account, b.provider, b.reason]), [[rude.account, 'xivauth', 'spam']]);
  assert.equal(t.count('shots'), 2, 'a ban deletes nothing');
  res = await postJson(t, API + 'admin/accounts/ban', { account: rude.account, banned: false }, browser(owner));
  assert.equal(res.status, 200);
  assert.equal((await t.upload({ cookie: rudeCookie }, 6, WEB_UPLOAD)).status, 201);
});
