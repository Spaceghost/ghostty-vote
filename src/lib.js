// Pure request helpers: routing, cookies, voter identity, body parsing and
// validation. No bindings, so `node --test` can exercise them directly.
// The page, script, styles, ideas.json and version.json are static assets
// (public/); only the API paths below ever reach the Worker.

export const BASE = '/mods/ffxiv/term/vote';
export const API_PREFIX = BASE + '/api/';
export const COOKIE_NAME = '__Secure-ghostty_voter';
export const COOKIE_MAX_AGE = 400 * 24 * 60 * 60; // browsers cap cookies at 400 days
export const VOTES = Object.freeze(['want', 'maybe', 'skip']);
export const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export const LIMITS = Object.freeze({
  note: 280,
  title: 80,
  titleMin: 3,
  detail: 600,
  bodyBytes: 4096,
  windowMs: 10 * 60 * 1000,
  writesPerWindow: 60,
  dayMs: 24 * 60 * 60 * 1000,
  suggestionsPerVoterPerDay: 10,
  suggestionsPerDay: 300,
  tallyTtlSeconds: 60, // edge + browser cache for GET api/tallies
});

// name -> the one HTTP method it accepts.
export const API = Object.freeze({ vote: 'POST', suggest: 'POST', tallies: 'GET' });

export function route(pathname) {
  if (!pathname.startsWith(API_PREFIX)) return { kind: 'none' };
  const name = pathname.slice(API_PREFIX.length);
  return Object.hasOwn(API, name) ? { kind: 'api', name, method: API[name] } : { kind: 'none' };
}

export function parseCookies(header) {
  const out = Object.create(null);
  if (typeof header !== 'string') return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    if (name && !(name in out)) out[name] = part.slice(eq + 1).trim();
  }
  return out;
}

export function voterToken(cookieHeader) {
  const t = parseCookies(cookieHeader)[COOKIE_NAME];
  return typeof t === 'string' && TOKEN_RE.test(t) ? t : null;
}

function base64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function randomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

// What the database stores: a digest, so a leaked table cannot be replayed as cookies.
export async function voterKey(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('ghostty-vote:' + token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function voterCookie(token) {
  return `${COOKIE_NAME}=${token}; Path=${BASE}; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;
}

export function isJsonContentType(value) {
  return typeof value === 'string' && /^application\/json\s*(;|$)/i.test(value.trim());
}

// Browsers always send Origin on POST; reject any that is not this site.
export function isSameOrigin(request, url) {
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== url.origin) return false;
  const site = request.headers.get('sec-fetch-site');
  return !(site && site !== 'same-origin' && site !== 'none');
}

const fail = (status, error, message) => ({ ok: false, status, error, message });

export async function readJsonBody(request, maxBytes = LIMITS.bodyBytes) {
  if (!isJsonContentType(request.headers.get('content-type'))) {
    return fail(415, 'not_json', 'Send a JSON body with Content-Type: application/json.');
  }
  const declared = Number(request.headers.get('content-length'));
  if (declared > maxBytes) return fail(413, 'too_large', 'Request body is too large.');
  const chunks = [];
  let total = 0;
  if (request.body) {
    const reader = request.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return fail(413, 'too_large', 'Request body is too large.');
      }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { bytes.set(c, off); off += c.byteLength; }
  let value;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return fail(400, 'bad_json', 'Body is not valid JSON.');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return fail(400, 'bad_json', 'Body must be a JSON object.');
  }
  return { ok: true, value };
}

// Normalises user text: NFC, LF newlines, no control or bidi-override characters.
export function cleanText(value, { multiline = false } = {}) {
  if (typeof value !== 'string') return null;
  let s = value.normalize('NFC').replace(/\r\n?/g, '\n');
  s = s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '');
  s = multiline ? s.replace(/\t/g, ' ').replace(/\n{3,}/g, '\n\n') : s.replace(/\s+/g, ' ');
  return s.trim();
}

export function validateVote(body) {
  const { idea_id: ideaId, vote } = body;
  if (typeof ideaId !== 'string' || !ID_RE.test(ideaId)) return fail(400, 'bad_idea_id', 'idea_id is missing or malformed.');
  if (vote !== null && !VOTES.includes(vote)) {
    return fail(400, 'bad_vote', 'vote must be "want", "maybe", "skip", or null to retract.');
  }
  let note = null; // null keeps any existing note
  if (vote !== null && body.note !== undefined && body.note !== null) {
    note = cleanText(body.note, { multiline: true });
    if (note === null) return fail(400, 'bad_note', 'note must be a string.');
    if (note.length > LIMITS.note) return fail(400, 'note_too_long', `note must be at most ${LIMITS.note} characters.`);
  }
  return { ok: true, value: { idea_id: ideaId, vote, note } };
}

export function validateSuggestion(body) {
  const title = cleanText(body.title);
  if (title === null || title.length < LIMITS.titleMin) {
    return fail(400, 'bad_title', `title must be at least ${LIMITS.titleMin} characters.`);
  }
  if (title.length > LIMITS.title) return fail(400, 'title_too_long', `title must be at most ${LIMITS.title} characters.`);
  let detail = '';
  if (body.detail !== undefined && body.detail !== null) {
    detail = cleanText(body.detail, { multiline: true });
    if (detail === null) return fail(400, 'bad_detail', 'detail must be a string.');
    if (detail.length > LIMITS.detail) return fail(400, 'detail_too_long', `detail must be at most ${LIMITS.detail} characters.`);
  }
  return { ok: true, value: { title, detail } };
}

export function json(data, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...headers,
    },
  });
}
