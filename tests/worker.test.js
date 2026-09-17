import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../src/app.js';
import worker from '../src/worker.js';
import { BASE, LIMITS } from '../src/lib.js';
import { buildSeedSql } from '../scripts/seed-lib.js';
import { createD1 } from './d1-shim.js';
import { API, MIGRATIONS, ORIGIN, SEED, allTallies, keyOfCookie, read, setup, sha256hex, talliesMatchVotes } from './harness.js';

const OPEN_IDEAS = JSON.parse(read('data/catalogue.json')).categories.reduce((n, c) => n + c.ideas.length, 0);

test('only the API reaches the Worker; page paths and dropped endpoints are 404', async () => {
  const { call, env } = setup();
  for (const p of [BASE, BASE + '/', BASE + '/index.html', BASE + '/admin/', BASE + '/ideas.json', API + 'ideas', API + 'mine/', API + 'version', API + 'auth', API + 'auth/', API + 'auth/github', API + 'admin/', '/mods/ffxiv/term/voter']) {
    assert.equal((await call(p)).status, 404, p);
  }
  assert.equal(env.DB.stats.calls, 0, '404s never touch D1');
  assert.equal((await call(API + 'vote')).status, 405);
  assert.equal((await call(API + 'tallies', { method: 'POST', body: {} })).headers.get('allow'), 'GET');
  assert.equal((await call(API + 'mine', { method: 'POST', body: {} })).headers.get('allow'), 'GET');
  assert.equal((await call(API + 'auth/logout')).headers.get('allow'), 'POST');
  assert.equal((await call(API + 'auth/github/callback', { method: 'POST', body: {} })).headers.get('allow'), 'GET');
  assert.equal((await call(API + 'admin/voters', { method: 'POST', body: {} })).status, 405);
  assert.equal(env.DB.stats.calls, 0, 'wrong methods never touch D1');
  const res = await worker.fetch(new Request(ORIGIN + BASE + '/'), env, { waitUntil() {} });
  assert.equal(res.status, 404, 'the default export routes the same way');
});

test('tallies: counts per open idea, one D1 read, then served from the cache', async () => {
  const { env, call, cache } = setup();
  let res = await call(API + 'tallies');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), `public, max-age=${LIMITS.tallyTtlSeconds}`);
  const tallies = await res.json();
  assert.equal(Object.keys(tallies).length, OPEN_IDEAS);
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

test('voting: signed-in only, upsert, tallies, clearing keeps the note, and a two-query budget', async () => {
  const { env, vote, call, cache, signedIn } = setup();
  const id = 'ops-weather';
  const alice = await signedIn('github', '42');
  let calls = env.DB.stats.calls;
  let res = await vote({ idea_id: id, vote: 'want', note: 'yes please' }, { cookie: alice });
  assert.equal(res.status, 200);
  assert.equal(env.DB.stats.calls - calls, 2, 'one precheck query and one batch');
  assert.equal(res.headers.get('set-cookie'), null, 'writes never set cookies');
  let body = await res.json();
  assert.ok(Number.isInteger(body.updated_at) && body.updated_at > 0);
  assert.deepEqual(body, { ok: true, idea_id: id, vote: 'want', note: 'yes please', tally: { want: 1, maybe: 0, skip: 0 }, updated_at: body.updated_at });

  res = await vote({ idea_id: id, vote: 'maybe' }, { cookie: alice });
  body = await res.json();
  assert.deepEqual(body.tally, { want: 0, maybe: 1, skip: 0 });
  assert.equal(body.note, 'yes please', 'omitted note is kept');

  res = await vote({ idea_id: id, vote: 'skip' }); // another account
  assert.deepEqual((await res.json()).tally, { want: 0, maybe: 1, skip: 1 });

  calls = env.DB.stats.calls;
  res = await vote({ idea_id: id, vote: null }, { cookie: alice });
  assert.equal(env.DB.stats.calls - calls, 2);
  body = await res.json();
  assert.deepEqual({ ...body, updated_at: 0 }, { ok: true, idea_id: id, vote: null, note: 'yes please', tally: { want: 0, maybe: 0, skip: 1 }, updated_at: 0 });

  cache.store.clear();
  assert.deepEqual((await (await call(API + 'tallies')).json())[id], { want: 0, maybe: 0, skip: 1 });

  const aliceKey = keyOfCookie(alice);
  assert.equal(aliceKey, sha256hex('github:42'), "voter key is sha256hex('github:42')");
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM votes WHERE voter = ?').get(aliceKey).n, 1);
  const stored = env.DB.raw.prepare('SELECT voter FROM votes UNION SELECT voter FROM write_log').all();
  assert.ok(stored.length > 0 && stored.every((r) => /^[0-9a-f]{64}$/.test(r.voter)), 'only hashes are stored');
  talliesMatchVotes(env.DB.raw);
});

test('writes without a valid session get 401 before D1, and never a cookie', async () => {
  const { env, call, signedIn } = setup();
  const good = await signedIn();
  const tampered = good.slice(0, -2) + (good.endsWith('AA') ? 'BB' : 'AA');
  const other = setup({ SESSION_SECRET: 'another-secret-that-is-long-enough-to-use-0000' });
  const foreign = await other.signedIn();
  for (const cookie of [undefined, '__Secure-ghostty_voter=' + 'A'.repeat(43), tampered, foreign, 'x=1']) {
    for (const [name, body] of [['vote', { idea_id: 'ops-weather', vote: 'want' }], ['suggest', { title: 'Split-flap CI board' }]]) {
      const res = await call(API + name, { method: 'POST', body, cookie });
      assert.equal(res.status, 401, name + ' ' + cookie);
      assert.equal((await res.json()).error, 'sign_in_required');
      assert.equal(res.headers.get('set-cookie'), null);
    }
  }
  assert.equal(env.DB.stats.calls, 0, 'no D1 without a session');
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM votes').get().n, 0);
});

test('vote and note combinations: note-only rows, every transition, and deletion when both are empty', async () => {
  const { env, vote, signedIn } = setup();
  const db = env.DB.raw;
  const id = 'ops-weather';
  const cookie = await signedIn();
  const me = keyOfCookie(cookie);
  const rows = () => db.prepare('SELECT vote, note FROM votes WHERE voter = ? AND idea_id = ?').all(me, id).map((r) => ({ ...r }));
  async function step(body, expect, row) {
    const calls = env.DB.stats.calls;
    const res = await vote({ idea_id: id, ...body }, { cookie });
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.ok(env.DB.stats.calls - calls <= 2, 'at most two D1 round trips per write');
    const got = await res.json();
    assert.deepEqual({ vote: got.vote, note: got.note, tally: got.tally }, expect, JSON.stringify(body));
    assert.deepEqual(rows(), row ? [row] : [], 'stored row after ' + JSON.stringify(body));
    talliesMatchVotes(db);
  }
  const t = (want, maybe, skip) => ({ want, maybe, skip });

  await step({ note: 'first thoughts' }, { vote: null, note: 'first thoughts', tally: t(0, 0, 0) }, { vote: '', note: 'first thoughts' });
  await step({ vote: 'want' }, { vote: 'want', note: 'first thoughts', tally: t(1, 0, 0) }, { vote: 'want', note: 'first thoughts' });
  await step({ vote: 'skip' }, { vote: 'skip', note: 'first thoughts', tally: t(0, 0, 1) }, { vote: 'skip', note: 'first thoughts' });
  await step({ note: 'changed my mind' }, { vote: 'skip', note: 'changed my mind', tally: t(0, 0, 1) }, { vote: 'skip', note: 'changed my mind' });
  await step({ vote: '' }, { vote: null, note: 'changed my mind', tally: t(0, 0, 0) }, { vote: '', note: 'changed my mind' });
  await step({ vote: null }, { vote: null, note: 'changed my mind', tally: t(0, 0, 0) }, { vote: '', note: 'changed my mind' });
  await step({ vote: 'maybe', note: '' }, { vote: 'maybe', note: '', tally: t(0, 1, 0) }, { vote: 'maybe', note: '' });
  await step({ vote: null }, { vote: null, note: '', tally: t(0, 0, 0) }, null);
  await step({ note: 'back again' }, { vote: null, note: 'back again', tally: t(0, 0, 0) }, { vote: '', note: 'back again' });
  await step({ note: '' }, { vote: null, note: '', tally: t(0, 0, 0) }, null);
  await step({ vote: 'want', note: 'both at once' }, { vote: 'want', note: 'both at once', tally: t(1, 0, 0) }, { vote: 'want', note: 'both at once' });
  await step({ vote: null, note: '' }, { vote: null, note: '', tally: t(0, 0, 0) }, null);
  // Clearing what is not there stores nothing.
  await step({ vote: null }, { vote: null, note: '', tally: t(0, 0, 0) }, null);

  // Other voters' counts ride along untouched.
  await vote({ idea_id: id, vote: 'want' });
  await step({ vote: 'want' }, { vote: 'want', note: '', tally: t(2, 0, 0) }, { vote: 'want', note: '' });
  await step({ vote: 'skip' }, { vote: 'skip', note: '', tally: t(1, 0, 1) }, { vote: 'skip', note: '' });
});

test('vote rejects bad input without handing out a cookie', async () => {
  const { vote, env, signedIn } = setup();
  const cookie = await signedIn();
  const cases = [
    [{ body: '{"idea_id":"ops-weather","vote":"want"}', headers: { 'content-type': 'text/plain' } }, 415],
    [{ body: 'not json' }, 400],
    [{ body: { idea_id: 'nope', vote: 'want' } }, 404],
    [{ body: { idea_id: 'ops-weather', vote: 'pass' } }, 400],
    [{ body: { idea_id: 'ops-weather' } }, 400],
    [{ body: { idea_id: 'ops-weather', note: null } }, 400],
    [{ body: { idea_id: 'ops-weather', note: 7 } }, 400],
    [{ body: { idea_id: 'nope', note: 'hello' } }, 404],
    [{ body: { idea_id: 'ops-weather', vote: 'want', note: 'x'.repeat(281) } }, 400],
    [{ body: { idea_id: 'ops-weather', vote: 'want' }, headers: { origin: 'https://evil.example' } }, 403],
    [{ body: JSON.stringify({ idea_id: 'ops-weather', vote: 'want', note: 'x'.repeat(LIMITS.bodyBytes) }) }, 413],
  ];
  for (const [{ body, headers }, status] of cases) {
    const res = await vote(body, { headers, cookie });
    assert.equal(res.status, status, JSON.stringify(body).slice(0, 60));
    assert.equal(res.headers.get('set-cookie'), null);
  }
  env.DB.raw.exec("UPDATE ideas SET retired = 1 WHERE id = 'ops-weather'");
  assert.equal((await vote({ idea_id: 'ops-weather', vote: 'want' })).status, 404, 'retired ideas take no votes');
  assert.equal((await vote({ idea_id: 'ops-weather', note: 'hi' })).status, 404, 'or notes');
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM votes').get().n, 0);
});

test('per-voter rate limit: 300 writes per window, votes and notes alike, with Retry-After', async () => {
  const { vote, env, signedIn } = setup();
  assert.equal(LIMITS.writesPerWindow, 300);
  const cookie = await signedIn();
  let res = await vote({ idea_id: 'ops-weather', vote: 'want' }, { cookie });
  for (let n = 1; n < LIMITS.writesPerWindow; n++) {
    const body = n % 3 === 0 ? { idea_id: 'ops-weather', note: 'draft ' + n } : { idea_id: 'ops-weather', vote: n % 2 ? 'maybe' : 'want' };
    res = await vote(body, { cookie });
    assert.equal(res.status, 200, 'write ' + (n + 1));
  }
  res = await vote({ idea_id: 'ops-weather', note: 'one too many' }, { cookie });
  assert.equal(res.status, 429);
  assert.equal((await res.json()).error, 'rate_limited');
  const retry = Number(res.headers.get('retry-after'));
  assert.ok(retry > 0 && retry <= LIMITS.windowMs / 1000);
  assert.equal(res.headers.get('set-cookie'), null);
  res = await vote({ idea_id: 'ops-weather', vote: 'skip' });
  assert.equal(res.status, 200, 'other voters are unaffected');

  // Once the oldest writes leave the window, the voter can write again.
  env.DB.raw.prepare('UPDATE write_log SET at = at - ?').run(LIMITS.windowMs);
  assert.equal((await vote({ idea_id: 'ops-weather', note: 'later' }, { cookie })).status, 200);
});

test('mine: without a session, the empty ballot and no D1 access', async () => {
  const { env, mine, vote, signedIn } = setup();
  await vote({ idea_id: 'ops-weather', vote: 'want', note: 'someone else' });
  const good = await signedIn();
  const calls = env.DB.stats.calls;
  for (const cookie of [undefined, 'other=1', '__Secure-ghostty_voter=' + 'A'.repeat(43), '__Secure-ghostty_session=v1.e30.AAAA', good.replace('v1.', 'v2.')]) {
    const res = await mine({ cookie });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'private, no-store');
    assert.equal(res.headers.get('vary'), 'Cookie');
    assert.equal(res.headers.get('set-cookie'), null);
    assert.deepEqual(await res.json(), { signed_in: false, votes: {}, suggestions: [] });
  }
  assert.equal(env.DB.stats.calls, calls, 'no session, no D1');

  const res = await mine({ headers: { 'sec-fetch-site': 'cross-site' } });
  assert.equal(res.status, 403);
  assert.equal(res.headers.get('cache-control'), 'private, no-store');
  assert.equal(env.DB.stats.calls, calls, 'cross-site reads are refused before D1');
});

test('mine: the voter\'s own ballot and newest suggestions, in one D1 batch, never cached', async () => {
  const { env, mine, vote, call, cache, signedIn } = setup();
  const db = env.DB.raw;
  const cookie = await signedIn();
  let res = await vote({ idea_id: 'ops-weather', vote: 'want', note: 'yes' }, { cookie });
  await vote({ idea_id: 'ops-weather', vote: 'skip' }); // another voter
  const ids = db.prepare("SELECT id FROM ideas WHERE id <> 'ops-weather' ORDER BY sort_order LIMIT 3").all().map((r) => r.id);
  assert.equal((await vote({ idea_id: ids[1], note: 'another voter\'s note' })).status, 200);
  await vote({ idea_id: ids[1], note: 'just a note' }, { cookie });
  await vote({ idea_id: ids[2], vote: 'maybe' }, { cookie });
  await vote({ idea_id: ids[2], vote: null }, { cookie }); // cleared with no note: gone

  // 55 suggestions for this voter (more than the per-day limit, so inserted directly), some sharing a timestamp.
  const me = keyOfCookie(cookie);
  const insert = db.prepare('INSERT INTO suggestions (voter, title, detail, created_at) VALUES (?, ?, ?, ?)');
  for (let n = 0; n < 55; n++) insert.run(me, 'idea ' + n, n % 2 ? 'detail ' + n : '', 1000 + Math.floor(n / 2));
  insert.run('f'.repeat(64), 'not mine', '', 99999);

  // Warm the tallies cache first: mine must not come from it.
  await call(API + 'tallies');
  const calls = env.DB.stats.calls;
  res = await mine({ cookie });
  assert.equal(env.DB.stats.calls - calls, 1, 'one batch');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'private, no-store');
  assert.equal(res.headers.get('vary'), 'Cookie');
  assert.equal(res.headers.get('set-cookie'), null);
  assert.deepEqual([...cache.store.keys()], [ORIGIN + API + 'tallies'], 'mine is never put in the cache');
  const body = await res.json();

  assert.deepEqual(Object.keys(body).sort(), ['signed_in', 'suggestions', 'votes']);
  assert.equal(body.signed_in, true);
  assert.deepEqual(Object.keys(body.votes).sort(), [ids[1], 'ops-weather'].sort());
  const { updated_at: u1, ...weather } = body.votes['ops-weather'];
  assert.deepEqual(weather, { vote: 'want', note: 'yes' });
  assert.ok(u1 > 0);
  const { updated_at: u2, ...noteOnly } = body.votes[ids[1]];
  assert.deepEqual(noteOnly, { vote: null, note: 'just a note' });
  assert.ok(u2 > 0);

  assert.equal(body.suggestions.length, LIMITS.mySuggestions);
  assert.deepEqual(Object.keys(body.suggestions[0]).sort(), ['created_at', 'detail', 'id', 'title']);
  assert.deepEqual(body.suggestions.slice(0, 3).map((x) => x.title), ['idea 54', 'idea 53', 'idea 52']);
  assert.equal(body.suggestions.at(-1).title, 'idea 5');
  for (let n = 1; n < body.suggestions.length; n++) {
    const [a, b] = [body.suggestions[n - 1], body.suggestions[n]];
    assert.ok(a.created_at > b.created_at || (a.created_at === b.created_at && a.id > b.id), 'newest first');
  }
  assert.ok(!body.suggestions.some((x) => x.title === 'not mine'));

  // A change shows up on the very next read.
  await vote({ idea_id: 'ops-weather', vote: null }, { cookie });
  const again = await (await mine({ cookie })).json();
  assert.equal(again.votes['ops-weather'].vote, null);
  assert.equal(again.votes['ops-weather'].note, 'yes');

  // Another voter sees only their own ballot.
  const other = await (await mine({ cookie: await signedIn('xivauth', '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b') })).json();
  assert.deepEqual(other, { signed_in: true, votes: {}, suggestions: [] });
});

test('mine: a suggestion sent through the API is listed', async () => {
  const { call, mine, signedIn } = setup();
  const cookie = await signedIn();
  const res = await call(API + 'suggest', { method: 'POST', body: { title: 'Split-flap CI board', detail: 'At the Gold Saucer.' }, cookie });
  const { suggestion } = await res.json();
  assert.deepEqual((await (await mine({ cookie })).json()).suggestions, [suggestion]);
});

test('suggestions are stored, limited per voter, and cost two queries', async () => {
  const { call, env, signedIn } = setup();
  const suggest = async (body, cookie) => call(API + 'suggest', { method: 'POST', body, cookie: cookie ?? await signedIn() });
  const cookie = await signedIn();
  const calls = env.DB.stats.calls;
  let res = await suggest({ title: 'Split-flap CI board', detail: 'At the Gold Saucer.' }, cookie);
  assert.equal(res.status, 201);
  assert.equal(env.DB.stats.calls - calls, 2);
  assert.equal(res.headers.get('set-cookie'), null);
  const { suggestion } = await res.json();
  assert.equal(suggestion.title, 'Split-flap CI board');
  assert.equal(suggestion.detail, 'At the Gold Saucer.');
  assert.ok(Number.isInteger(suggestion.id) && suggestion.created_at > 0);
  assert.equal(env.DB.raw.prepare("SELECT status FROM suggestions").get().status, 'new');

  assert.equal((await suggest({ title: 't'.repeat(81) }, cookie)).status, 400);
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

test('migration 0003 on a database with votes: tallies exact, note-only rows allowed, bad votes refused', () => {
  const db = createD1(MIGRATIONS[0], MIGRATIONS[1], SEED).raw;
  const [a, b, c] = db.prepare('SELECT id FROM ideas ORDER BY sort_order LIMIT 3').all().map((r) => r.id);
  const insert = db.prepare('INSERT INTO votes (voter, idea_id, vote, note, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 2)');
  assert.throws(() => insert.run('v1', a, '', 'note only'), /CHECK/, 'before 0003 a vote is required');
  const ballot = [
    ['v1', a, 'want', 'first'], ['v2', a, 'want', ''], ['v3', a, 'skip', 'nah'],
    ['v1', b, 'maybe', ''], ['v2', b, 'skip', ''], ['v3', c, 'want', 'x'.repeat(280)],
  ];
  for (const row of ballot) insert.run(...row);
  const before = allTallies(db);
  const votesBefore = db.prepare('SELECT * FROM votes ORDER BY voter, idea_id').all().map((r) => ({ ...r }));
  talliesMatchVotes(db);
  db.exec(`UPDATE ideas SET want = 42 WHERE id = '${c}'`); // drift, which the recount at the end repairs

  // D1 runs a migration file as one unit; foreign keys are enforced throughout (node:sqlite default).
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  db.exec('BEGIN');
  db.exec(MIGRATIONS[2]);
  db.exec('COMMIT');

  assert.deepEqual(allTallies(db), before, 'tallies are exactly what the votes say');
  assert.deepEqual(db.prepare('SELECT * FROM votes ORDER BY voter, idea_id').all().map((r) => ({ ...r })), votesBefore, 'every row copied');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  const schema = (type) => db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND tbl_name = ? ORDER BY name').all(type, 'votes').map((r) => r.name);
  assert.deepEqual(schema('trigger'), ['votes_tally_delete', 'votes_tally_insert', 'votes_tally_update']);
  assert.ok(schema('index').includes('votes_idea'));
  assert.ok(!db.prepare("SELECT name FROM sqlite_master WHERE name = 'votes_new'").get());
  assert.match(db.prepare("SELECT sql FROM sqlite_master WHERE name = 'votes'").get().sql, /WITHOUT ROWID/);

  // Note-only rows now fit, count toward nothing, and move tallies correctly as votes come and go.
  const tally = (id) => ({ ...db.prepare('SELECT want, maybe, skip FROM ideas WHERE id = ?').get(id) });
  insert.run('v4', a, '', 'note only');
  assert.deepEqual(tally(a), { want: 2, maybe: 0, skip: 1 });
  db.exec(`UPDATE votes SET vote = 'maybe' WHERE voter = 'v4' AND idea_id = '${a}'`);
  assert.deepEqual(tally(a), { want: 2, maybe: 1, skip: 1 });
  db.exec(`UPDATE votes SET vote = '' WHERE voter = 'v1' AND idea_id = '${a}'`);
  assert.deepEqual(tally(a), { want: 1, maybe: 1, skip: 1 });
  db.exec(`DELETE FROM votes WHERE voter = 'v1' AND idea_id = '${a}'`);
  assert.deepEqual(tally(a), { want: 1, maybe: 1, skip: 1 });
  talliesMatchVotes(db);

  // The constraints survive the rebuild.
  assert.throws(() => insert.run('v5', a, 'pass', ''), /CHECK/);
  assert.throws(() => insert.run('v5', a, null, ''), /NOT NULL/);
  assert.throws(() => insert.run('v5', a, 'want', 'x'.repeat(281)), /CHECK/);
  assert.throws(() => insert.run('v5', 'no-such-idea', 'want', ''), /FOREIGN KEY/);
  assert.throws(() => insert.run('v4', a, 'want', ''), /UNIQUE|PRIMARY KEY/);
  db.exec(`INSERT INTO votes (voter, idea_id, created_at, updated_at) VALUES ('v6', '${b}', 1, 1)`);
  assert.equal(db.prepare("SELECT vote FROM votes WHERE voter = 'v6'").get().vote, '', "vote defaults to ''");

  // Running it again changes nothing.
  const settled = allTallies(db);
  db.exec(MIGRATIONS[2]);
  assert.deepEqual(allTallies(db), settled);
  talliesMatchVotes(db);
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
  assert.equal(Object.keys(tallies).length, OPEN_IDEAS);
  assert.ok(!(retiredId in tallies));
  assert.deepEqual(tallies['brand-new-idea'], { want: 0, maybe: 0, skip: 0 });
  assert.equal(tallies['ops-weather'].want, 1);
  assert.equal((await vote({ idea_id: 'brand-new-idea', vote: 'maybe' })).status, 200);

  const stale = JSON.parse(read('data/catalogue.json'));
  env.DB.raw.exec(buildSeedSql(stale).replace(/^UPDATE ideas SET retired.*$/m, ''));
  assert.equal(env.DB.raw.prepare('SELECT version FROM catalogue').get().version, 2, 'older seed does not roll version back');
});
