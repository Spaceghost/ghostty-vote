import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BASE, COOKIE_NAME, LIMITS, cleanText, isJsonContentType, isSameOrigin, parseCookies, randomToken,
  readJsonBody, route, validateSuggestion, validateVote, voterCookie, voterKey, voterToken,
} from '../src/lib.js';
import { sqlString, validateCatalogue } from '../scripts/seed-lib.js';

const post = (body, headers = {}) => new Request('https://spacegho.st' + BASE + '/api/vote', {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body,
});

test('route matches only the vote path', () => {
  assert.deepEqual(route(BASE), { kind: 'page' });
  assert.deepEqual(route(BASE + '/'), { kind: 'redirect', location: BASE });
  assert.deepEqual(route(BASE + '/api/ideas'), { kind: 'api', name: 'ideas' });
  assert.deepEqual(route(BASE + '/api/nope'), { kind: 'api', name: null });
  assert.equal(route('/mods/ffxiv/term/voter').kind, 'none');
  assert.equal(route(BASE + '/api/ideas/').name, null);
});

test('cookies: parse, token shape, attributes', () => {
  const token = randomToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(voterToken(`a=1; ${COOKIE_NAME}=${token}; b=2`), token);
  assert.equal(voterToken(`${COOKIE_NAME}=short`), null);
  assert.equal(voterToken(undefined), null);
  assert.deepEqual({ ...parseCookies('x=1; =bad; y = 2 ; x=3') }, { x: '1', y: '2' });
  const c = voterCookie(token);
  for (const part of ['HttpOnly', 'Secure', 'SameSite=Lax', `Path=${BASE}`]) assert.ok(c.includes(part), part);
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

test('validateVote', () => {
  assert.deepEqual(validateVote({ idea_id: 'ops-weather', vote: 'want' }).value, { idea_id: 'ops-weather', vote: 'want', note: null });
  assert.equal(validateVote({ idea_id: 'ops-weather', vote: 'maybe', note: ' hi ' }).value.note, 'hi');
  assert.equal(validateVote({ idea_id: 'ops-weather', vote: null, note: 'ignored' }).value.note, null);
  assert.equal(validateVote({ idea_id: 'ops-weather', vote: 'pass' }).error, 'bad_vote');
  assert.equal(validateVote({ idea_id: 'ops-weather' }).error, 'bad_vote');
  assert.equal(validateVote({ idea_id: '../x', vote: 'want' }).error, 'bad_idea_id');
  assert.equal(validateVote({ idea_id: 'x', vote: 'want', note: 5 }).error, 'bad_note');
  assert.ok(validateVote({ idea_id: 'x', vote: 'want', note: 'n'.repeat(280) }).ok);
  assert.equal(validateVote({ idea_id: 'x', vote: 'want', note: 'n'.repeat(281) }).error, 'note_too_long');
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

test('page renders data only through textContent', () => {
  const html = readFileSync(new URL('../src/page.html', import.meta.url), 'utf8');
  for (const sink of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function']) {
    assert.ok(!html.includes(sink), `page must not use ${sink}`);
  }
  assert.equal(html.match(/<script nonce="__NONCE__">/g).length, 2);
  assert.ok(!/<script(?![^>]*nonce)/.test(html), 'every script carries the nonce');
});
