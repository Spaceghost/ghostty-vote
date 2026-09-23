// Pure analytics logic: what a request is counted as, and how counts are coalesced in
// memory before they reach D1. No bindings and no I/O, so `node --test` exercises all of
// it directly. The parts that touch D1, the deny list and the admin API are in
// analytics.js; the Worker wires them in worker.js so a fault here can never change an
// answer the site gives.
//
// Nothing here ever sees, keeps or derives anything about a person. A request becomes
// five fixed-vocabulary fields — day, path bucket, client class, outcome, country — and
// is added to a counter. The address is used only to make the keyed digest that links a
// *refused* request to other refused requests inside one seven-day window (analytics.js).

// Paths analytics answers itself. All three sit under the vote's api/ prefix, which is
// already in assets.run_worker_first and already carries the owner's session cookie path,
// so adding analytics needed no routing or wrangler.toml change.
export const BEACON_PATH = '/mods/ffxiv/term/vote/api/beacon';
export const ADMIN_ANALYTICS_PATH = '/mods/ffxiv/term/vote/api/admin/analytics';
export const ADMIN_DENY_PATH = '/mods/ffxiv/term/vote/api/admin/deny';

export const ANALYTICS = Object.freeze({
  // Per isolate: the first event after a gap is written at once, everything that arrives
  // inside the next five minutes is folded into it. This is what bounds D1 writes. A
  // single edge location can write at most 288 times a day however hard it is hit, and a
  // count is only ever lost if the isolate is evicted with fewer than five minutes of
  // pending counts in it. The budget:
  //   rows written/day <= min(requests/day, live isolates * 288 * distinct keys per flush)
  // because a row in a flush needs at least one event since the last flush. Cloudflare
  // runs ~330 edge locations, of which a site this size sees a few dozen, and a flush
  // typically carries two to six distinct keys. Verified allowances (2026-09-19): D1 free
  // is 100,000 rows written a day and *errors* rather than billing past it (changelog
  // 2026-09-01); D1 on Workers Paid includes 50,000,000 rows written a month, i.e.
  // 1,600,000 a day. Both are far above what this can produce at any traffic this site
  // will see, and the failure mode at either ceiling is a swallowed error, never a bill.
  flushGapMs: 300_000,
  // Belt and braces for a spike inside one isolate: after 5,000 counted events the
  // isolate keeps one event in ten and weights it ten, so the estimate stays right while
  // the number of distinct keys (and so of rows) stops growing.
  sampleAfter: 5_000,
  sampleEvery: 10,
  maxKeys: 64,        // distinct rollup keys held per isolate; the rest fold into 'other'
  maxRefKeys: 32,
  maxAbuseKeys: 64,
  rollupDays: 400,    // daily rollups kept
  abuseDays: 30,      // refused-request log kept
  saltWindowDays: 7,  // how long one abuse digest stays comparable with another
  denyTtlMs: 60_000,  // deny list re-read from D1 at most this often per isolate
  denyMax: 500,
  adminDays: 90,      // days of rollup the admin page asks for
  beaconBytes: 512,
});

export const CLASSES = Object.freeze(['dalamud', 'bot', 'browser', 'page', 'other', 'none']);
export const OUTCOMES = Object.freeze(['ok', 'fresh', 'redirect', 'view', 'refused', 'notfound', 'limited', 'banned', 'error']);

// ---- day keys ----------------------------------------------------------------------
// UTC, so the rollup means the same thing wherever the edge location is.
export const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
export const dayShift = (ms, days) => dayKey(ms + days * 86_400_000);
// Which seven-day window an abuse digest belongs to. Digests from different windows are
// unrelatable, which is why an address ban cannot outlive its window (analytics.js).
export const saltWindow = (ms) => Math.floor(ms / 86_400_000 / ANALYTICS.saltWindowDays);
export const windowEnd = (ms) => (saltWindow(ms) + 1) * ANALYTICS.saltWindowDays * 86_400_000;

// ---- what was asked for ------------------------------------------------------------
// Prefix rules, not a list of files: anything a later release adds under one of these
// prefixes is counted the day it appears, without a change here. The value is always one
// of these fixed strings, so the number of rows a day can never be driven by the client.
const DOWNLOAD_RE = /\.(?:zip|7z|dll|exe|json\.gz)$|\/(?:download|downloads|releases?)\//i;
const BUCKETS = [
  [/^\/mods\/ffxiv\/plugins\.json$/, 'plugins-repo'],
  [/^\/mods\/ffxiv\/plugins(?:\/|$)/, 'plugins-page'],
  [/^\/mods\/ffxiv\/almanac\/recommendations\.json$/, 'almanac-recs'],
  [/^\/mods\/ffxiv\/almanac\/leaderboard\.json$/, 'almanac-board'],
  [/^\/mods\/ffxiv\/almanac\/api\//, 'almanac-api'],
  [/^\/mods\/ffxiv\/almanac\/schema\//, 'almanac-schema'],
  // every other mod's vote page (Ghostty's is under term/vote below)
  [/^\/mods\/ffxiv\/(?!term\/)[a-z]+\/vote(?:\/|$)/, 'vote-page'],
  [/^\/mods\/ffxiv\/almanac(?:\/|$)/, 'almanac-page'],
  [/^\/mods\/ffxiv\/term\/gallery\/api\/shots$/, 'gallery-shots'],
  [/^\/mods\/ffxiv\/term\/gallery\/api\/upload$/, 'gallery-upload'],
  [/^\/mods\/ffxiv\/term\/gallery\/(?:img|thumb)\//, 'gallery-image'],
  [/^\/mods\/ffxiv\/term\/gallery(?:\/|$)/, 'gallery-page'],
  [/^\/mods\/ffxiv\/term\/vote\/api\/admin\//, 'admin'],
  [/^\/mods\/ffxiv\/term\/vote\/api\/beacon$/, 'beacon'],
  [/^\/mods\/ffxiv\/term\/vote\/api\/auth\//, 'vote-auth'],
  [/^\/mods\/ffxiv\/term\/vote\/api\/(?:device\/|apps(?:\/|$)|token\/)/, 'device-link'],
  [/^\/mods\/ffxiv\/term\/vote\/api\/(?:gallery|shots)\/upload$/, 'gallery-upload'],
  [/^\/mods\/ffxiv\/term\/vote\/api\//, 'vote-api'],
  [/^\/mods\/ffxiv\/term\/vote(?:\/|$)/, 'vote-page'],
];

export function bucketOf(pathname) {
  if (typeof pathname !== 'string' || pathname[0] !== '/') return 'other';
  if (DOWNLOAD_RE.test(pathname)) return 'download';
  for (const [re, name] of BUCKETS) if (re.test(pathname)) return name;
  return 'other';
}

// ---- who asked ---------------------------------------------------------------------
// A class, never the string. Dalamud first: XIVLauncher's in-game HTTP client says so in
// its User-Agent, and so does anything built on it, which is the signal that tells a real
// plugin install apart from someone opening the repository URL in a browser.
const DALAMUD_RE = /dalamud|xivlauncher|ffxiv/i;
const BOT_RE = /bot\b|crawler|spider|slurp|curl\/|wget|python-requests|python-urllib|go-http-client|okhttp|java\/|libwww|httpie|headlesschrome|facebookexternalhit|discordbot|slackbot|telegrambot|bingpreview|semrush|ahrefs|petalbot|dataforseo|scrapy|node-fetch|axios|postman/i;
const BROWSER_RE = /^mozilla\/5\.0 .*(?:chrome|firefox|safari|edg|opr|gecko)/i;

export function classOf(userAgent) {
  if (typeof userAgent !== 'string' || userAgent.trim() === '') return 'none';
  const ua = userAgent.slice(0, 512);
  if (DALAMUD_RE.test(ua)) return 'dalamud';
  if (BOT_RE.test(ua)) return 'bot';
  if (BROWSER_RE.test(ua)) return 'browser';
  return 'other';
}

// ---- how it went -------------------------------------------------------------------
export function outcomeOf(status) {
  const s = Number(status) | 0;
  if (s === 304) return 'fresh';
  if (s >= 200 && s < 300) return 'ok';
  if (s >= 300 && s < 400) return 'redirect';
  if (s === 404) return 'notfound';
  if (s === 429) return 'limited';
  if (s === 451) return 'banned';
  if (s >= 400 && s < 500) return 'refused';
  return 'error';
}

// Outcomes worth keeping an address digest for, for as long as ANALYTICS.abuseDays. A
// server fault is ours, not the caller's, so 5xx is never logged as abuse.
const ABUSE_OUTCOMES = new Set(['refused', 'notfound', 'limited', 'banned']);
export const isAbuse = (outcome) => ABUSE_OUTCOMES.has(outcome);

// ---- where they came from ----------------------------------------------------------
// Host only, lower-cased, never the path and never the query string. Same-site referrals
// collapse to 'self' so the dashboard shows where outside traffic actually comes from.
const HOST_RE = /^[a-z0-9](?:[a-z0-9.-]{0,62}[a-z0-9])?$/;
export function refHost(referrer, selfHost) {
  if (typeof referrer !== 'string' || referrer === '') return '';
  let host;
  try {
    const u = new URL(referrer);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
    host = u.hostname.toLowerCase();
  } catch {
    return '';
  }
  if (host === String(selfHost || '').toLowerCase()) return 'self';
  if (host.startsWith('www.')) host = host.slice(4);
  return HOST_RE.test(host) ? host : '';
}

export const countryOf = (value) => (/^[A-Z]{2}$/.test(String(value || '')) ? String(value) : 'ZZ');
export const asnOf = (value) => (Number.isInteger(Number(value)) && Number(value) > 0 && Number(value) < 4_294_967_295 ? Number(value) : 0);

// ---- the in-isolate counter --------------------------------------------------------
// One of these per isolate. Every field of every key is from a fixed vocabulary or has
// been validated above, so the maps cannot be grown by anything a caller sends.
export const newState = () => ({
  hits: new Map(), refs: new Map(), abuse: new Map(), denyHits: new Map(),
  seen: 0, sampledAny: false, lastFlush: 0, prunedDay: '',
});

export const SEP = '\u0001';
export const packKey = (...parts) => parts.join(SEP);
export const unpackKey = (key) => key.split(SEP);

// The weight one event carries: 1 until this isolate has counted sampleAfter events,
// then 0 for nine events out of ten and sampleEvery for the tenth. Over any run of ten
// the total is the same, so `hits` stays an unbiased estimate while the write count stops
// following the traffic. Deterministic (no randomness), so the tests pin it exactly.
export function weigh(state) {
  state.seen += 1;
  if (state.seen <= ANALYTICS.sampleAfter) return 1;
  state.sampledAny = true;
  return state.seen % ANALYTICS.sampleEvery === 0 ? ANALYTICS.sampleEvery : 0;
}

// Adds `weight` to `key`, or to `spill` once the map is full, so one isolate can never
// hold — or write — more than `cap` rows per flush.
export function bump(map, key, weight, cap, spill) {
  const k = map.has(key) || map.size < cap ? key : spill;
  const cur = map.get(k) || { hits: 0, samples: 0 };
  cur.hits += weight;
  cur.samples += 1;
  map.set(k, cur);
  return k;
}

export function countHit(state, { day, bucket, klass, outcome, country }) {
  const weight = weigh(state);
  if (weight === 0) return null;
  return bump(state.hits, packKey(day, bucket, klass, outcome, country), weight,
    ANALYTICS.maxKeys, packKey(day, 'other', klass, outcome, 'ZZ'));
}

export function countRef(state, { day, bucket, host }, weight = 1) {
  if (!host) return null;
  return bump(state.refs, packKey(day, bucket, host), weight, ANALYTICS.maxRefKeys, packKey(day, bucket, 'other'));
}

export function countAbuse(state, { day, who, bucket, outcome, country, asn, at }) {
  const key = packKey(day, who, bucket, outcome);
  const k = state.abuse.has(key) || state.abuse.size < ANALYTICS.maxAbuseKeys ? key : packKey(day, 'overflow', bucket, outcome);
  const cur = state.abuse.get(k) || { hits: 0, country: 'ZZ', asn: 0, at: 0 };
  cur.hits += 1;
  cur.country = country;
  cur.asn = asn;
  cur.at = Math.max(cur.at, at | 0);
  state.abuse.set(k, cur);
  return k;
}

export const countDeny = (state, id) => state.denyHits.set(id, (state.denyHits.get(id) || 0) + 1);

export const pendingRows = (state) => state.hits.size + state.refs.size + state.abuse.size + state.denyHits.size;
export const shouldFlush = (state, now) => pendingRows(state) > 0 && now - state.lastFlush >= ANALYTICS.flushGapMs;

// Hands the pending counts over and starts fresh, so a slow or failing write can never
// double-count and never blocks the next request from counting.
export function drain(state) {
  const out = { hits: state.hits, refs: state.refs, abuse: state.abuse, denyHits: state.denyHits };
  state.hits = new Map();
  state.refs = new Map();
  state.abuse = new Map();
  state.denyHits = new Map();
  return out;
}

// ---- the deny list -----------------------------------------------------------------
export const DENY_KINDS = Object.freeze(['ip', 'asn', 'country', 'ua']);
const HEX64 = /^[0-9a-f]{64}$/;

// The owner never types an address: the dashboard shows a digest and bans that digest,
// so a raw address never reaches this code, this database or this repository.
export function validDenyValue(kind, value) {
  const v = typeof value === 'string' ? value.trim() : '';
  if (kind === 'ip') return HEX64.test(v) ? v : null;
  if (kind === 'asn') return /^[1-9][0-9]{0,9}$/.test(v) ? v : null;
  if (kind === 'country') return /^[A-Z]{2}$/.test(v.toUpperCase()) ? v.toUpperCase() : null;
  if (kind === 'ua') return v.length >= 3 && v.length <= 64 && /^[\x20-\x7e]+$/.test(v) ? v.toLowerCase() : null;
  return null;
}

// Which entry, if any, refuses this request. `ipDigest` is passed in already computed
// (and only when the list actually holds an ip entry), so the common case — an empty or
// address-free deny list — costs no crypto at all.
export function denyMatch(entries, { ipDigest, asn, country, userAgent }) {
  const ua = typeof userAgent === 'string' ? userAgent.toLowerCase() : '';
  for (const e of entries) {
    if (e.kind === 'ip') { if (ipDigest && e.value === ipDigest) return e; continue; }
    if (e.kind === 'asn') { if (asn && String(asn) === e.value) return e; continue; }
    if (e.kind === 'country') { if (country && country === e.value) return e; continue; }
    if (e.kind === 'ua') { if (ua && ua.includes(e.value)) return e; continue; }
  }
  return null;
}

// A ban on an address digest cannot be meaningful for longer than the window that digest
// belongs to: after it rotates the same address hashes to something else. Bans on an ASN,
// a country or a User-Agent are not personal data and keep whatever expiry was asked for.
export function banExpiry(kind, days, now) {
  const asked = Number.isFinite(days) && days > 0 ? now + Math.min(days, 3650) * 86_400_000 : 0;
  if (kind !== 'ip') return asked;
  const end = windowEnd(now);
  return asked === 0 ? end : Math.min(asked, end);
}

// ---- the page beacon ---------------------------------------------------------------
// The body a page sends: the page's own path and, if the browser offered one, the host it
// was linked from. Anything else in it is ignored.
export function parseBeacon(text, selfHost) {
  if (typeof text !== 'string' || text.length > ANALYTICS.beaconBytes) return null;
  let body;
  try { body = JSON.parse(text); } catch { return null; }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const path = typeof body.p === 'string' ? body.p : '';
  if (!path.startsWith('/mods/ffxiv/')) return null;
  return { bucket: bucketOf(path.split('?')[0].split('#')[0]), host: refHost(body.r, selfHost) };
}

// Do not count this visitor at all: Do Not Track or Global Privacy Control.
export const optedOut = (headers) => headers.get('dnt') === '1' || headers.get('sec-gpc') === '1';
