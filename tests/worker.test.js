import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handle } from '../src/app.js';
import { BASE, LIMITS } from '../src/lib.js';
import { buildSeedSql } from '../scripts/seed-lib.js';
import { createD1 } from './d1-shim.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const MIGRATION = read('migrations/0001_init.sql');
const SEED = read('seed/seed.sql');
const PAGE = read('src/page.html');
const ORIGIN = 'https://spacegho.st';

function setup() {
  const env = { DB: createD1(MIGRATION, SEED) };
  const call = (path, { method = 'GET', body, cookie, headers = {} } = {}) => handle(new Request(ORIGIN + path, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json', origin: ORIGIN } : {}),
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  }), env, PAGE);
  return { env, call };
}

const cookieFrom = (res) => (res.headers.get('set-cookie') || '').split(';')[0];

test('seed/seed.sql is generated from data/catalogue.json', () => {
  assert.equal(SEED, buildSeedSql(JSON.parse(read('data/catalogue.json'))));
});

test('page is served with a fresh CSP nonce', async () => {
  const { call } = setup();
  const res = await call(BASE);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(!html.includes('__NONCE__'));
  const nonce = res.headers.get('content-security-policy').match(/'nonce-([^']+)'/)[1];
  assert.ok(html.includes(`nonce="${nonce}"`));
  assert.equal((await call(BASE + '/?since=1')).headers.get('location'), ORIGIN + BASE + '?since=1');
  assert.equal((await call('/mods/ffxiv/term/voter')).status, 404);
  assert.equal((await handle(new Request('http://spacegho.st' + BASE), {}, PAGE)).status, 301);
});

test('ideas carry version, categories and zero tallies', async () => {
  const { call } = setup();
  const data = await (await call(BASE + '/api/ideas')).json();
  assert.equal(data.version, 1);
  assert.equal(data.categories.length, 9);
  assert.equal(data.ideas.length, 55);
  assert.deepEqual(data.ideas[0].tally, { want: 0, maybe: 0, skip: 0 });
  assert.equal(data.ideas.filter((i) => i.top_pick).length, 8);
  assert.ok(data.ideas.every((i) => i.added_version === 1 && typeof i.in_world === 'boolean'));
});

test('voting: cookie, upsert, tallies, retract, mine', async () => {
  const { env, call } = setup();
  const id = 'ops-weather';
  let res = await call(BASE + '/api/vote', { method: 'POST', body: { idea_id: id, vote: 'want', note: 'yes please' } });
  assert.equal(res.status, 200);
  const setCookie = res.headers.get('set-cookie');
  for (const part of ['HttpOnly', 'Secure', 'SameSite=Lax', `Path=${BASE}`]) assert.ok(setCookie.includes(part));
  const alice = cookieFrom(res);
  assert.deepEqual((await res.json()).tally, { want: 1, maybe: 0, skip: 0 });

  res = await call(BASE + '/api/vote', { method: 'POST', cookie: alice, body: { idea_id: id, vote: 'maybe' } });
  const body = await res.json();
  assert.deepEqual(body.tally, { want: 0, maybe: 1, skip: 0 });
  assert.equal(body.note, 'yes please', 'omitted note is kept');

  res = await call(BASE + '/api/vote', { method: 'POST', body: { idea_id: id, vote: 'skip' } });
  const bob = cookieFrom(res);
  assert.notEqual(bob, alice);
  assert.deepEqual((await res.json()).tally, { want: 0, maybe: 1, skip: 1 });

  const mine = await (await call(BASE + '/api/mine', { cookie: alice })).json();
  assert.deepEqual(Object.keys(mine.votes), [id]);
  assert.equal(mine.votes[id].vote, 'maybe');
  assert.deepEqual(await (await call(BASE + '/api/mine')).json(), { votes: {}, suggestions: [] });

  res = await call(BASE + '/api/vote', { method: 'POST', cookie: alice, body: { idea_id: id, vote: null } });
  assert.deepEqual((await res.json()).tally, { want: 0, maybe: 0, skip: 1 });

  const token = alice.split('=')[1];
  const stored = env.DB.raw.prepare('SELECT voter FROM votes UNION SELECT voter FROM write_log').all();
  assert.ok(stored.length > 0);
  assert.ok(stored.every((r) => r.voter !== token && /^[0-9a-f]{64}$/.test(r.voter)), 'only hashes are stored');
});

test('vote rejects bad input', async () => {
  const { call } = setup();
  const v = (opts) => call(BASE + '/api/vote', { method: 'POST', ...opts });
  assert.equal((await v({ body: '{"idea_id":"ops-weather","vote":"want"}', headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await v({ body: 'not json' })).status, 400);
  assert.equal((await v({ body: { idea_id: 'nope', vote: 'want' } })).status, 404);
  assert.equal((await v({ body: { idea_id: 'ops-weather', vote: 'pass' } })).status, 400);
  assert.equal((await v({ body: { idea_id: 'ops-weather', vote: 'want', note: 'x'.repeat(281) } })).status, 400);
  assert.equal((await v({ body: { idea_id: 'ops-weather', vote: 'want' }, headers: { origin: 'https://evil.example' } })).status, 403);
  assert.equal((await call(BASE + '/api/vote')).status, 405);
  assert.equal((await call(BASE + '/api/ideas', { method: 'POST', body: {} })).status, 405);
});

test('per-voter rate limit', async () => {
  const { call } = setup();
  let res = await call(BASE + '/api/vote', { method: 'POST', body: { idea_id: 'ops-weather', vote: 'want' } });
  const cookie = cookieFrom(res);
  for (let n = 1; n < LIMITS.writesPerWindow; n++) {
    res = await call(BASE + '/api/vote', { method: 'POST', cookie, body: { idea_id: 'ops-weather', vote: n % 2 ? 'maybe' : 'want' } });
    assert.equal(res.status, 200);
  }
  res = await call(BASE + '/api/vote', { method: 'POST', cookie, body: { idea_id: 'ops-weather', vote: 'skip' } });
  assert.equal(res.status, 429);
  assert.ok(Number(res.headers.get('retry-after')) > 0);
  res = await call(BASE + '/api/vote', { method: 'POST', body: { idea_id: 'ops-weather', vote: 'skip' } });
  assert.equal(res.status, 200, 'other voters are unaffected');
});

test('suggestions are stored and returned only to their author', async () => {
  const { call } = setup();
  let res = await call(BASE + '/api/suggest', { method: 'POST', body: { title: 'Split-flap CI board', detail: 'At the Gold Saucer.' } });
  assert.equal(res.status, 201);
  const cookie = cookieFrom(res);
  assert.equal((await res.json()).suggestion.status, 'new');
  const mine = await (await call(BASE + '/api/mine', { cookie })).json();
  assert.equal(mine.suggestions[0].title, 'Split-flap CI board');
  const other = await (await call(BASE + '/api/mine')).json();
  assert.equal(other.suggestions.length, 0);
  assert.equal((await call(BASE + '/api/suggest', { method: 'POST', body: { title: 't'.repeat(81) } })).status, 400);
  for (let n = 1; n < LIMITS.suggestionsPerVoterPerDay; n++) {
    assert.equal((await call(BASE + '/api/suggest', { method: 'POST', cookie, body: { title: 'idea ' + n } })).status, 201);
  }
  assert.equal((await call(BASE + '/api/suggest', { method: 'POST', cookie, body: { title: 'one more' } })).status, 429);
});

test('re-seeding with a bumped version keeps votes, flags new ideas, never rolls back', async () => {
  const { env, call } = setup();
  await call(BASE + '/api/vote', { method: 'POST', body: { idea_id: 'ops-weather', vote: 'want' } });

  const cat = JSON.parse(read('data/catalogue.json'));
  cat.version = 2;
  cat.categories[0].ideas.push({ id: 'brand-new-idea', title: 'Brand new', wow: 3, added_version: 2 });
  const retiredId = cat.categories[1].ideas.find((i) => !cat.top_picks.includes(i.id)).id;
  cat.categories[1].ideas = cat.categories[1].ideas.filter((i) => i.id !== retiredId);
  env.DB.raw.exec(buildSeedSql(cat));
  env.DB.raw.exec(buildSeedSql(cat)); // idempotent

  const v = await (await call(BASE + '/api/version?since=1')).json();
  assert.equal(v.version, 2);
  assert.equal(v.new_since, 1);
  assert.equal(v.url, ORIGIN + BASE + '?since=1');
  const data = await (await call(BASE + '/api/ideas')).json();
  assert.equal(data.ideas.length, 55);
  assert.ok(!data.ideas.some((i) => i.id === retiredId));
  assert.equal(data.ideas.find((i) => i.id === 'brand-new-idea').added_version, 2);
  assert.equal(data.ideas.find((i) => i.id === 'ops-weather').tally.want, 1);

  const stale = JSON.parse(read('data/catalogue.json'));
  env.DB.raw.exec(buildSeedSql(stale).replace(/^UPDATE ideas SET retired.*$/m, ''));
  assert.equal((await (await call(BASE + '/api/version')).json()).version, 2, 'older seed does not roll version back');
});
