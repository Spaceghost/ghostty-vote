import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handle } from '../src/app.js';
import worker from '../src/worker.js';
import { BASE, LIMITS } from '../src/lib.js';
import { buildSeedSql } from '../scripts/seed-lib.js';
import { createD1 } from './d1-shim.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const MIGRATIONS = [read('migrations/0001_init.sql'), read('migrations/0002_drop_site_assets.sql')];
const SEED = read('seed/seed.sql');
const ORIGIN = 'https://spacegho.st';
const API = BASE + '/api/';

// Stand-in for caches.default: honours nothing but presence, which is all the Worker relies on.
function memoryCache() {
  const store = new Map();
  return {
    store,
    async match(req) { return store.get(req.url)?.clone(); },
    async put(req, res) { store.set(req.url, res); },
  };
}

function setup() {
  const env = { DB: createD1(...MIGRATIONS, SEED) };
  const cache = memoryCache();
  const waits = [];
  const ctx = { waitUntil: (p) => waits.push(p) };
  const call = async (path, { method = 'GET', body, cookie, headers = {} } = {}) => {
    const res = await handle(new Request(ORIGIN + path, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json', origin: ORIGIN } : {}),
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    }), env, ctx, cache);
    await Promise.all(waits.splice(0));
    return res;
  };
  const vote = (body, opts = {}) => call(API + 'vote', { method: 'POST', body, ...opts });
  return { env, cache, call, vote };
}

const cookieFrom = (res) => (res.headers.get('set-cookie') || '').split(';')[0];

test('only the API reaches the Worker; page paths and dropped endpoints are 404', async () => {
  const { call, env } = setup();
  for (const p of [BASE, BASE + '/', BASE + '/index.html', BASE + '/ideas.json', API + 'ideas', API + 'mine', API + 'version', '/mods/ffxiv/term/voter']) {
    assert.equal((await call(p)).status, 404, p);
  }
  assert.equal(env.DB.stats.calls, 0, '404s never touch D1');
  assert.equal((await call(API + 'vote')).status, 405);
  assert.equal((await call(API + 'tallies', { method: 'POST', body: {} })).headers.get('allow'), 'GET');
  const res = await worker.fetch(new Request(ORIGIN + BASE + '/'), env, { waitUntil() {} });
  assert.equal(res.status, 404, 'the default export routes the same way');
});

test('tallies: counts per open idea, one D1 read, then served from the cache', async () => {
  const { env, call, cache } = setup();
  let res = await call(API + 'tallies');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), `public, max-age=${LIMITS.tallyTtlSeconds}`);
  const tallies = await res.json();
  assert.equal(Object.keys(tallies).length, 55);
  assert.deepEqual(tallies['ops-weather'], { want: 0, maybe: 0, skip: 0 });
  assert.equal(env.DB.stats.calls, 1);

  for (let n = 0; n < 5; n++) {
    res = await call(API + 'tallies?bust=' + n);
    assert.deepEqual(await res.json(), tallies);
  }
  assert.equal(env.DB.stats.calls, 1, 'a burst costs one D1 read');
  assert.deepEqual([...cache.store.keys()], [ORIGIN + API + 'tallies']);
  assert.equal(res.headers.get('set-cookie'), null);

  // Without a cache (e.g. local tests) it still answers, just uncached.
  const bare = await handle(new Request(ORIGIN + API + 'tallies'), env, undefined, null);
  assert.equal(bare.status, 200);
});

test('voting: cookie, upsert, tallies, retract, and a two-query budget', async () => {
  const { env, vote, call, cache } = setup();
  const id = 'ops-weather';
  let calls = env.DB.stats.calls;
  let res = await vote({ idea_id: id, vote: 'want', note: 'yes please' });
  assert.equal(res.status, 200);
  assert.equal(env.DB.stats.calls - calls, 2, 'one precheck query and one batch');
  const setCookie = res.headers.get('set-cookie');
  for (const part of ['HttpOnly', 'Secure', 'SameSite=Lax', `Path=${BASE}`]) assert.ok(setCookie.includes(part));
  const alice = cookieFrom(res);
  assert.deepEqual(await res.json(), { ok: true, idea_id: id, vote: 'want', note: 'yes please', tally: { want: 1, maybe: 0, skip: 0 } });

  res = await vote({ idea_id: id, vote: 'maybe' }, { cookie: alice });
  const body = await res.json();
  assert.deepEqual(body.tally, { want: 0, maybe: 1, skip: 0 });
  assert.equal(body.note, 'yes please', 'omitted note is kept');

  res = await vote({ idea_id: id, vote: 'skip' });
  const bob = cookieFrom(res);
  assert.notEqual(bob, alice);
  assert.deepEqual((await res.json()).tally, { want: 0, maybe: 1, skip: 1 });

  res = await vote({ idea_id: id, vote: null }, { cookie: alice });
  assert.deepEqual(await res.json(), { ok: true, idea_id: id, vote: null, note: '', tally: { want: 0, maybe: 0, skip: 1 } });

  cache.store.clear();
  assert.deepEqual((await (await call(API + 'tallies')).json())[id], { want: 0, maybe: 0, skip: 1 });

  const token = alice.split('=')[1];
  const stored = env.DB.raw.prepare('SELECT voter FROM votes UNION SELECT voter FROM write_log').all();
  assert.ok(stored.length > 0);
  assert.ok(stored.every((r) => r.voter !== token && /^[0-9a-f]{64}$/.test(r.voter)), 'only hashes are stored');
});

test('vote rejects bad input without handing out a cookie', async () => {
  const { vote, env } = setup();
  const cases = [
    [{ body: '{"idea_id":"ops-weather","vote":"want"}', headers: { 'content-type': 'text/plain' } }, 415],
    [{ body: 'not json' }, 400],
    [{ body: { idea_id: 'nope', vote: 'want' } }, 404],
    [{ body: { idea_id: 'ops-weather', vote: 'pass' } }, 400],
    [{ body: { idea_id: 'ops-weather', vote: 'want', note: 'x'.repeat(281) } }, 400],
    [{ body: { idea_id: 'ops-weather', vote: 'want' }, headers: { origin: 'https://evil.example' } }, 403],
    [{ body: JSON.stringify({ idea_id: 'ops-weather', vote: 'want', note: 'x'.repeat(LIMITS.bodyBytes) }) }, 413],
  ];
  for (const [{ body, headers }, status] of cases) {
    const res = await vote(body, { headers });
    assert.equal(res.status, status, JSON.stringify(body).slice(0, 60));
    assert.equal(res.headers.get('set-cookie'), null);
  }
  env.DB.raw.exec("UPDATE ideas SET retired = 1 WHERE id = 'ops-weather'");
  assert.equal((await vote({ idea_id: 'ops-weather', vote: 'want' })).status, 404, 'retired ideas take no votes');
});

test('per-voter rate limit', async () => {
  const { vote } = setup();
  let res = await vote({ idea_id: 'ops-weather', vote: 'want' });
  const cookie = cookieFrom(res);
  for (let n = 1; n < LIMITS.writesPerWindow; n++) {
    res = await vote({ idea_id: 'ops-weather', vote: n % 2 ? 'maybe' : 'want' }, { cookie });
    assert.equal(res.status, 200);
  }
  res = await vote({ idea_id: 'ops-weather', vote: 'skip' }, { cookie });
  assert.equal(res.status, 429);
  assert.ok(Number(res.headers.get('retry-after')) > 0);
  res = await vote({ idea_id: 'ops-weather', vote: 'skip' });
  assert.equal(res.status, 200, 'other voters are unaffected');
});

test('suggestions are stored, limited per voter, and cost two queries', async () => {
  const { call, env } = setup();
  const suggest = (body, cookie) => call(API + 'suggest', { method: 'POST', body, cookie });
  const calls = env.DB.stats.calls;
  let res = await suggest({ title: 'Split-flap CI board', detail: 'At the Gold Saucer.' });
  assert.equal(res.status, 201);
  assert.equal(env.DB.stats.calls - calls, 2);
  const cookie = cookieFrom(res);
  const { suggestion } = await res.json();
  assert.equal(suggestion.title, 'Split-flap CI board');
  assert.equal(suggestion.detail, 'At the Gold Saucer.');
  assert.ok(Number.isInteger(suggestion.id) && suggestion.created_at > 0);
  assert.equal(env.DB.raw.prepare("SELECT status FROM suggestions").get().status, 'new');

  assert.equal((await suggest({ title: 't'.repeat(81) })).status, 400);
  for (let n = 1; n < LIMITS.suggestionsPerVoterPerDay; n++) {
    assert.equal((await suggest({ title: 'idea ' + n }, cookie)).status, 201);
  }
  res = await suggest({ title: 'one more' }, cookie);
  assert.equal(res.status, 429);
  assert.equal((await res.json()).error, 'suggestion_limit');
  assert.equal((await suggest({ title: 'someone else' })).status, 201, 'other voters are unaffected');
});

test('migration 0002 drops the D1-hosted page and is safe to re-run on the live schema', () => {
  const db = createD1(MIGRATIONS[0], SEED).raw;
  db.exec("CREATE TABLE site_assets (name TEXT PRIMARY KEY, body TEXT NOT NULL); INSERT INTO site_assets VALUES ('page.html', 'x')");
  db.exec("INSERT INTO votes (voter, idea_id, vote, note, created_at, updated_at) VALUES ('v', 'ops-weather', 'want', '', 1, 1)");
  db.exec(MIGRATIONS[1]);
  db.exec(MIGRATIONS[1]);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);
  assert.ok(!tables.includes('site_assets') && !tables.includes('deploy_sources'));
  for (const t of ['catalogue', 'categories', 'ideas', 'votes', 'suggestions', 'write_log']) assert.ok(tables.includes(t), t);
  assert.equal(db.prepare("SELECT want FROM ideas WHERE id = 'ops-weather'").get().want, 1, 'votes and tally triggers survive');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'trigger'").get().n, 3);
});

test('re-seeding with a bumped version keeps votes and never rolls back', async () => {
  const { env, vote, call, cache } = setup();
  await vote({ idea_id: 'ops-weather', vote: 'want' });

  const cat = JSON.parse(read('data/catalogue.json'));
  cat.version = 2;
  cat.categories[0].ideas.push({ id: 'brand-new-idea', title: 'Brand new', wow: 3, added_version: 2 });
  const retiredId = cat.categories[1].ideas.find((i) => !cat.top_picks.includes(i.id)).id;
  cat.categories[1].ideas = cat.categories[1].ideas.filter((i) => i.id !== retiredId);
  env.DB.raw.exec(buildSeedSql(cat));
  env.DB.raw.exec(buildSeedSql(cat)); // idempotent

  cache.store.clear();
  const tallies = await (await call(API + 'tallies')).json();
  assert.equal(Object.keys(tallies).length, 55);
  assert.ok(!(retiredId in tallies));
  assert.deepEqual(tallies['brand-new-idea'], { want: 0, maybe: 0, skip: 0 });
  assert.equal(tallies['ops-weather'].want, 1);
  assert.equal((await vote({ idea_id: 'brand-new-idea', vote: 'maybe' })).status, 200);

  const stale = JSON.parse(read('data/catalogue.json'));
  env.DB.raw.exec(buildSeedSql(stale).replace(/^UPDATE ideas SET retired.*$/m, ''));
  assert.equal(env.DB.raw.prepare('SELECT version FROM catalogue').get().version, 2, 'older seed does not roll version back');
});
