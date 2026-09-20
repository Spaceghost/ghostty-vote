import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  API, BASE, COOKIE_NAME, LIMITS, cleanText, isJsonContentType, isSameOrigin, parseCookies, randomToken,
  readJsonBody, route, validateSuggestion, validateVote, clearVoterCookie, fromBase64url, base64url, voterKey, voterToken,
} from '../src/lib.js';
import { sqlString, validateCatalogue } from '../scripts/seed-lib.js';

const post = (body, headers = {}) => new Request('https://spacegho.st' + BASE + '/api/vote', {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body,
});

test('route matches only the API paths', () => {
  assert.deepEqual(route(BASE + '/api/vote'), { kind: 'api', name: 'vote', method: 'POST' });
  assert.deepEqual(route(BASE + '/api/suggest'), { kind: 'api', name: 'suggest', method: 'POST' });
  assert.deepEqual(route(BASE + '/api/tallies'), { kind: 'api', name: 'tallies', method: 'GET' });
  assert.deepEqual(route(BASE + '/api/mine'), { kind: 'api', name: 'mine', method: 'GET' });
  assert.deepEqual(route(BASE + '/api/auth/github/start'), { kind: 'api', name: 'auth/github/start', method: 'GET' });
  assert.deepEqual(route(BASE + '/api/auth/logout'), { kind: 'api', name: 'auth/logout', method: 'POST' });
  assert.deepEqual(route(BASE + '/api/admin/voters'), { kind: 'api', name: 'admin/voters', method: 'GET' });
  assert.deepEqual(Object.keys(API).sort(), [
    'admin/almanac', 'admin/almanac/review', 'admin/almanac/suite',
    'admin/gallery', 'admin/gallery/image', 'admin/gallery/review', 'admin/gallery/thumb',
    'admin/voters', 'auth/character/forget', 'auth/github/callback', 'auth/github/start', 'auth/logout', 'auth/me',
    'auth/xivauth/callback', 'auth/xivauth/link', 'auth/xivauth/start', 'mine', 'shots/upload', 'suggest', 'tallies', 'vote',
  ]);
  // The page and the static files are assets, never Worker routes.
  for (const p of [BASE, BASE + '/', BASE + '/index.html', BASE + '/vote.js', BASE + '/ideas.json', BASE + '/version.json']) {
    assert.equal(route(p).kind, 'none', p);
  }
  // Dropped endpoints and near misses.
  for (const p of ['ideas', 'version', 'nope', 'vote/', 'mine/', 'mine.json', 'tallies.json', 'constructor', '__proto__', 'toString',
    'auth', 'auth/', 'auth/github', 'auth/github/start/', 'auth/gitlab/start', 'auth/me/', 'admin', 'admin/', 'admin/voters/', 'auth/github/../me']) {
    assert.equal(route(BASE + '/api/' + p).kind, 'none', p);
  }
  assert.equal(route('/mods/ffxiv/term/voter/api/vote').kind, 'none');
  assert.equal(route('/api/vote').kind, 'none');
});

test('cookies: parse, token shape, clearing the anonymous cookie', () => {
  const token = randomToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(voterToken(`a=1; ${COOKIE_NAME}=${token}; b=2`), token);
  assert.equal(voterToken(`${COOKIE_NAME}=short`), null);
  assert.equal(voterToken(undefined), null);
  assert.deepEqual({ ...parseCookies('x=1; =bad; y = 2 ; x=3') }, { x: '1', y: '2' });
  assert.equal(clearVoterCookie(), `${COOKIE_NAME}=; Path=${BASE}; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
  const bytes = new Uint8Array([0, 1, 250, 251, 252, 253, 254, 255]);
  assert.deepEqual(fromBase64url(base64url(bytes)), bytes);
  for (const bad of ['a', 'ab+c', 'ab/c', 'abc=', null]) assert.equal(fromBase64url(bad), null, String(bad));
});

test('voterKey is a stable sha-256 hex digest, not the token', async () => {
  const k = await voterKey('abc');
  assert.match(k, /^[0-9a-f]{64}$/);
  assert.equal(k, await voterKey('abc'));
  assert.notEqual(k, await voterKey('abd'));
});

test('content type must be JSON', () => {
  assert.ok(isJsonContentType('application/json'));
  assert.ok(isJsonContentType('Application/JSON; charset=utf-8'));
  assert.ok(!isJsonContentType('text/plain'));
  assert.ok(!isJsonContentType('application/jsonp'));
  assert.ok(!isJsonContentType(null));
});

test('readJsonBody rejects non-JSON, oversize and non-objects', async () => {
  assert.equal((await readJsonBody(post('{}', { 'content-type': 'text/plain' }))).status, 415);
  assert.equal((await readJsonBody(post('{nope'))).status, 400);
  assert.equal((await readJsonBody(post('[1]'))).status, 400);
  assert.equal((await readJsonBody(post('null'))).status, 400);
  assert.equal((await readJsonBody(post(JSON.stringify({ x: 'y'.repeat(LIMITS.bodyBytes) })))).status, 413);
  assert.deepEqual(await readJsonBody(post('{"a":1}')), { ok: true, value: { a: 1 } });
});

test('same-origin check', () => {
  const url = new URL('https://spacegho.st' + BASE + '/api/vote');
  assert.ok(isSameOrigin(post('{}', { origin: 'https://spacegho.st' }), url));
  assert.ok(isSameOrigin(post('{}'), url));
  assert.ok(!isSameOrigin(post('{}', { origin: 'https://evil.example' }), url));
  assert.ok(!isSameOrigin(post('{}', { 'sec-fetch-site': 'cross-site' }), url));
});

test('cleanText strips control and bidi characters', () => {
  const nul = String.fromCharCode(0), rlo = String.fromCharCode(0x202e);
  assert.equal(cleanText(`  a${nul}b${rlo}c\r\nd  `), 'abc d');
  assert.equal(cleanText('line1\r\n\r\n\r\n\r\nline2\tx', { multiline: true }), 'line1\n\nline2 x');
  assert.equal(cleanText(42), null);
});

test('validateVote: vote and note each keep (null), clear or set', () => {
  const id = 'ops-weather';
  const value = (body) => {
    const r = validateVote(body);
    assert.ok(r.ok, JSON.stringify(body));
    return r.value;
  };
  // vote: omitted keeps (null), null or "" clears (''), a choice sets it.
  assert.deepEqual(value({ idea_id: id, vote: 'want' }), { idea_id: id, vote: 'want', note: null });
  assert.deepEqual(value({ idea_id: id, vote: null }), { idea_id: id, vote: '', note: null });
  assert.deepEqual(value({ idea_id: id, vote: '' }), { idea_id: id, vote: '', note: null });
  assert.deepEqual(value({ idea_id: id, note: 'n' }), { idea_id: id, vote: null, note: 'n' });
  // note: omitted or null keeps (null), any string sets it (cleaned; "" clears).
  assert.equal(value({ idea_id: id, vote: 'maybe', note: ' hi ' }).note, 'hi');
  assert.equal(value({ idea_id: id, vote: 'maybe', note: null }).note, null);
  assert.equal(value({ idea_id: id, note: '' }).note, '');
  assert.equal(value({ idea_id: id, note: '   ' }).note, '');
  assert.deepEqual(value({ idea_id: id, vote: null, note: 'kept' }), { idea_id: id, vote: '', note: 'kept' });
  assert.deepEqual(value({ idea_id: id, vote: '', note: '' }), { idea_id: id, vote: '', note: '' });

  assert.equal(validateVote({ idea_id: id }).error, 'nothing_to_save');
  assert.equal(validateVote({ idea_id: id, note: null }).error, 'nothing_to_save');
  for (const vote of ['pass', 'WANT', 0, false, [], {}, ['want']]) {
    assert.equal(validateVote({ idea_id: id, vote }).error, 'bad_vote', JSON.stringify(vote));
  }
  assert.equal(validateVote({ idea_id: '../x', vote: 'want' }).error, 'bad_idea_id');
  assert.equal(validateVote({ vote: 'want' }).error, 'bad_idea_id');
  assert.equal(validateVote({ idea_id: 'x', vote: 'want', note: 5 }).error, 'bad_note');
  assert.equal(validateVote({ idea_id: 'x', note: [] }).error, 'bad_note');
  assert.ok(validateVote({ idea_id: 'x', vote: 'want', note: 'n'.repeat(280) }).ok);
  assert.equal(validateVote({ idea_id: 'x', vote: 'want', note: 'n'.repeat(281) }).error, 'note_too_long');
  assert.equal(validateVote({ idea_id: 'x', note: 'n'.repeat(281) }).error, 'note_too_long');
});

test('limits: a busy ballot session fits the write window', () => {
  assert.equal(LIMITS.writesPerWindow, 300);
  assert.equal(LIMITS.windowMs, 10 * 60 * 1000);
  assert.equal(LIMITS.mySuggestions, 50);
});

test('validateSuggestion', () => {
  assert.deepEqual(validateSuggestion({ title: ' Split\nflap ', detail: 'd' }).value, { title: 'Split flap', detail: 'd' });
  assert.equal(validateSuggestion({ title: 'ab' }).error, 'bad_title');
  assert.equal(validateSuggestion({}).error, 'bad_title');
  assert.ok(validateSuggestion({ title: 't'.repeat(80) }).ok);
  assert.equal(validateSuggestion({ title: 't'.repeat(81) }).error, 'title_too_long');
  assert.equal(validateSuggestion({ title: 'fine', detail: 'd'.repeat(601) }).error, 'detail_too_long');
  assert.equal(validateSuggestion({ title: 'fine', detail: [] }).error, 'bad_detail');
});

test('sqlString escapes quotes and refuses NUL', () => {
  assert.equal(sqlString("it's"), "'it''s'");
  assert.equal(sqlString("'); DROP TABLE votes; --"), "'''); DROP TABLE votes; --'");
  assert.throws(() => sqlString('a' + String.fromCharCode(0) + 'b'));
});

test('validateCatalogue catches bad data', () => {
  const idea = { id: 'a', title: 'A', wow: 5, added_version: 1 };
  assert.deepEqual(validateCatalogue({ version: 1, categories: [{ name: 'C', ideas: [idea] }] }), []);
  const errs = validateCatalogue({ version: 1, top_picks: ['zz'], categories: [{ name: 'C', ideas: [idea, { ...idea, added_version: 2 }] }] });
  assert.equal(errs.length, 3);
});
