// The Almanac community model leaderboard: opt-in benchmark results from the almanac-dalamud
// plugin and CLI (github.com/Spaceghost/almanac-dalamud), aggregated on read. A result needs
// an account: a linked app's Bearer token carrying almanac:submit, or a session
// (src/account.js). Results from before that rule keep account = '' (legacy).
//
//   POST almanac/api/results           one run, JSON per schema/results.v1.json (<= 64 KiB)
//   GET  almanac/leaderboard.json      every bucket the leaderboard page shows  (cached 5 min)
//   GET  almanac/recommendations.json  best models per VRAM tier, for the plugin (cached 5 min)
//   GET  vote/api/admin/almanac        recent results and the suites           (ADMIN_ACCOUNTS)
//   POST vote/api/admin/almanac/review {id, action: hide|unhide|delete}
//   POST vote/api/admin/almanac/suite  {suite_id, suite_version, deprecated: true|false}
//
// Everything lives in D1. The aggregate is computed from D1 on a cache miss and kept in
// the Cache API (per edge location) and browsers for 5 minutes, so reads cost D1 at most
// one query per location every 5 minutes. The submitter's IP address is never stored: a
// keyed digest of it counts submissions for the limits and makes each submitter count
// once per model in the aggregate.
import schema from './almanac-schema.js';
import { compile } from './jsonschema.js';
import { buildBoard, buildRecommendations } from './almanac-board.js';
import { isAdmin, readSession } from './session.js';
import { signInRequired } from './auth.js';
import { authorize } from './account.js';
import { ALMANAC_BASE, PRIVATE, isSameOrigin, isShotId, json, randomToken, readJsonBody, sha256hex } from './lib.js';

export const ALMANAC = Object.freeze({
  maxBytes: 64 * 1024,
  perAddressPerHour: 12,
  perAddressPerDay: 40,
  perAccountPerHour: 12,
  perAccountPerDay: 40,
  perDay: 500,             // every submitter together (D1 free tier: 100,000 rows written a day)
  maxTokensPerS: 5000,     // plausibility caps the schema leaves open
  maxTtftMs: 3_600_000,
  boardRows: 20000,        // newest visible results read per aggregate
  ttlSeconds: 300,
  adminList: 300,
  hourMs: 60 * 60 * 1000,
  dayMs: 24 * 60 * 60 * 1000,
});

const validate = compile(schema);
const fail = (status, error, message, headers = {}) => json({ ok: false, error, message }, { status, headers });

// Strings the player's machine fills in: a small character set, and nothing shaped like a
// file path, an address or an e-mail.
const SAFE_TEXT = /^[A-Za-z0-9 ._:/@+(),#-]*$/;
const PRIVATE_SHAPES = [
  /(^|[\s(])[~/\\]/,                         // absolute or home-relative path
  /\\/,                                      // any backslash (Windows paths)
  /^[A-Za-z]:/,                              // drive letter
  /\b(?:home|Users|AppData|Documents)\b/i,   // path segments that name a person's folders
  /\b\d{1,3}(?:\.\d{1,3}){3}\b/,             // IPv4
  /[0-9a-f]{1,4}(?::[0-9a-f]{0,4}){3,}/i,    // IPv6-ish
  /[^\s@]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/,     // e-mail
  /https?:/i,
];
const looksPrivate = (s) => PRIVATE_SHAPES.some((re) => re.test(s));

// Every free-form string in a submission (the schema bounds the rest with enums and patterns).
function* freeStrings(v) {
  yield ['hardware.gpu_model', v.hardware.gpu_model];
  yield ['client.version', v.client.version];
  if (v.backend.version !== undefined) yield ['backend.version', v.backend.version];
  yield ['model.name', v.model.name];
  if (v.model.family !== undefined) yield ['model.family', v.model.family];
  yield ['model.quant', v.model.quant];
}

// body (parsed JSON) -> {ok, value} with the gpu name tidied, or {ok: false, status, error, message}.
export function validateResult(body) {
  const bad = (error, message) => ({ ok: false, status: 400, error, message });
  if (body && typeof body === 'object' && body.hardware && typeof body.hardware.gpu_model === 'string') {
    // adapters report trademark signs; they carry nothing and would fail the character check
    body.hardware.gpu_model = body.hardware.gpu_model.replace(/[\u2122\u00ae\u00a9]/g, '').replace(/\s+/g, ' ').trim();
  }
  const err = validate(body);
  if (err) return bad('schema', `${err.path} ${err.message}.`);
  for (const [where, s] of freeStrings(body)) {
    if (!SAFE_TEXT.test(s)) return bad('bad_text', `${where} has characters that are not allowed.`);
    if (looksPrivate(s)) return bad('looks_private', `${where} looks like a path, address or e-mail; results must not contain any.`);
  }
  const m = body.metrics;
  if (m.tokens_per_s > ALMANAC.maxTokensPerS || m.ttft_ms > ALMANAC.maxTtftMs) return bad('implausible', 'metrics are out of any plausible range.');
  const ids = new Set();
  for (const t of body.tasks) {
    if (ids.has(t.id)) return bad('duplicate_task', `task ${t.id} appears twice.`);
    ids.add(t.id);
    if (t.tool_calls_valid !== undefined && t.tool_calls !== undefined && t.tool_calls_valid > t.tool_calls) {
      return bad('implausible', `task ${t.id} has more valid tool calls than tool calls.`);
    }
  }
  return { ok: true, value: body };
}

const submitterKey = (env, ip) => sha256hex('almanac-results:' + (env.GALLERY_SECRET || env.SESSION_SECRET || '') + ':' + ip);

// ---- POST almanac/api/results ------------------------------------------------------------
export async function postResult(request, env, url) {
  if (!isSameOrigin(request, url)) return fail(403, 'forbidden', 'Cross-site request refused.');
  const auth = await authorize(request, env, url, 'almanac:submit');
  if (!auth.ok) return auth.response;
  const { p: provider, k: account } = auth.account;
  const body = await readJsonBody(request, ALMANAC.maxBytes);
  if (!body.ok) return fail(body.status, body.error, body.message);
  const input = validateResult(body.value);
  if (!input.ok) return fail(input.status, input.error, input.message);
  const v = input.value;
  const payload = JSON.stringify(v);
  const digest = await sha256hex(payload);
  const now = Date.now();
  const submitter = await submitterKey(env, request.headers.get('cf-connecting-ip') || '');

  const pre = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM almanac_submit_log WHERE submitter = ?1 AND at > ?2) AS hour,
       (SELECT COUNT(*) FROM almanac_submit_log WHERE submitter = ?1 AND at > ?3) AS day,
       (SELECT COUNT(*) FROM almanac_submit_log WHERE account = ?7 AND at > ?2) AS acct_hour,
       (SELECT COUNT(*) FROM almanac_submit_log WHERE account = ?7 AND at > ?3) AS acct_day,
       (SELECT COUNT(*) FROM almanac_submit_log WHERE at > ?3) AS site,
       (SELECT id FROM almanac_results WHERE digest = ?4) AS dup,
       (SELECT sha256 FROM almanac_suites WHERE suite_id = ?5 AND suite_version = ?6) AS suite_sha,
       (SELECT deprecated FROM almanac_suites WHERE suite_id = ?5 AND suite_version = ?6) AS deprecated`,
  ).bind(submitter, now - ALMANAC.hourMs, now - ALMANAC.dayMs, digest, v.suite.id, v.suite.version, account).first();
  if (pre.dup) return json({ ok: true, id: pre.dup, duplicate: true, message: 'This run was already submitted. Thank you!' });
  if (pre.hour >= ALMANAC.perAddressPerHour || pre.day >= ALMANAC.perAddressPerDay
    || pre.acct_hour >= ALMANAC.perAccountPerHour || pre.acct_day >= ALMANAC.perAccountPerDay) {
    return fail(429, 'rate_limited', 'That is a lot of results at once; try again later.', { 'retry-after': '3600' });
  }
  if (pre.site >= ALMANAC.perDay) return fail(429, 'leaderboard_full', 'The leaderboard is full for today; try again tomorrow.', { 'retry-after': '3600' });
  if (pre.deprecated) return fail(410, 'suite_deprecated', `Suite ${v.suite.id} ${v.suite.version} is retired; update the plugin to the current suite.`);
  if (pre.suite_sha && pre.suite_sha !== v.suite.sha256) {
    return fail(409, 'suite_mismatch', `This copy of suite ${v.suite.id} ${v.suite.version} differs from the published one; update the plugin.`);
  }

  const id = randomToken(16);
  const m = v.metrics;
  const tasks = Object.fromEntries(v.tasks.map((t) => [t.id, t.score]));
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO almanac_suites (suite_id, suite_version, sha256, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)
       ON CONFLICT (suite_id, suite_version) DO NOTHING`,
    ).bind(v.suite.id, v.suite.version, v.suite.sha256, now),
    env.DB.prepare(
      `INSERT INTO almanac_results (id, suite_id, suite_version, mode, model, quant, context, tool_calling, backend,
         gpu_vendor, gpu_model, vram_mb, os, score, success_rate, tool_call_validity, tokens_per_s, ttft_ms,
         peak_vram_mb, task_scores, payload, digest, submitter, created_at, provider, account, token_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, v.suite.id, v.suite.version, v.mode, v.model.name.toLowerCase(), v.model.quant.toUpperCase() || 'UNKNOWN',
      v.model.context, v.model.tool_calling, v.backend.kind, v.hardware.gpu_vendor, v.hardware.gpu_model || 'unknown',
      v.hardware.vram_mb, v.hardware.os, m.score, m.success_rate, m.tool_call_validity, m.tokens_per_s, m.ttft_ms,
      m.peak_vram_mb ?? null, JSON.stringify(tasks), payload, digest, submitter, now, provider, account, auth.tokenId),
    env.DB.prepare('INSERT INTO almanac_submit_log (submitter, at, account) VALUES (?, ?, ?)').bind(submitter, now, account),
    env.DB.prepare('DELETE FROM almanac_submit_log WHERE at <= ?').bind(now - ALMANAC.dayMs),
  ]);
  return json({ ok: true, id, message: 'Thanks! Your run counts toward the leaderboard within a few minutes.' }, { status: 201 });
}

// ---- GET almanac/leaderboard.json and almanac/recommendations.json --------------------------
const boardKey = (url) => new Request(url.origin + ALMANAC_BASE + '/leaderboard.json');
const recsKey = (url) => new Request(url.origin + ALMANAC_BASE + '/recommendations.json');

export async function loadBoard(env, now = Date.now()) {
  const [rows, suites] = await env.DB.batch([
    env.DB.prepare(
      `SELECT r.suite_id, r.suite_version, r.mode, r.model, r.quant, r.context, r.tool_calling, r.backend, r.gpu_vendor,
              r.gpu_model, r.vram_mb, r.score, r.success_rate, r.tool_call_validity, r.tokens_per_s, r.ttft_ms,
              r.peak_vram_mb, r.task_scores, CASE WHEN r.account <> '' THEN r.account ELSE r.submitter END AS submitter
       FROM almanac_results r JOIN almanac_suites s ON s.suite_id = r.suite_id AND s.suite_version = r.suite_version
       WHERE r.status = 'visible' AND s.deprecated = 0
       ORDER BY r.created_at DESC LIMIT ?`,
    ).bind(ALMANAC.boardRows),
    env.DB.prepare('SELECT suite_id, suite_version, deprecated FROM almanac_suites'),
  ]);
  return buildBoard(rows.results, suites.results, now);
}

const PUBLIC_JSON = (ttl) => ({ 'cache-control': `public, max-age=${ttl}`, 'access-control-allow-origin': '*' });

// which: 'leaderboard' | 'recommendations'. A miss computes both and caches both.
export async function getAggregate(env, ctx, url, cache, which) {
  const key = which === 'leaderboard' ? boardKey(url) : recsKey(url);
  if (cache) {
    const hit = await cache.match(key);
    if (hit) return hit;
  }
  const board = await loadBoard(env);
  const out = {
    leaderboard: json(board, { headers: PUBLIC_JSON(ALMANAC.ttlSeconds) }),
    recommendations: json(buildRecommendations(board), { headers: PUBLIC_JSON(ALMANAC.ttlSeconds) }),
  };
  if (cache) {
    const puts = Promise.all([cache.put(boardKey(url), out.leaderboard.clone()), cache.put(recsKey(url), out.recommendations.clone())]);
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(puts);
    else await puts;
  }
  return out[which];
}

async function dropCache(url, cache) {
  if (cache?.delete) await Promise.all([cache.delete(boardKey(url)), cache.delete(recsKey(url))]);
}

// ---- admin -------------------------------------------------------------------------------
async function adminGate(request, env, url) {
  if (!isSameOrigin(request, url)) return fail(403, 'forbidden', 'Cross-site request refused.', PRIVATE);
  const session = await readSession(request, env);
  if (!session) return signInRequired(PRIVATE);
  if (!(await isAdmin(env, session))) return fail(403, 'forbidden', 'Only the site owner can see this.', PRIVATE);
  return null;
}

// GET api/admin/almanac -> {results: [... newest 300], suites: [...], totals}
export async function getAdminAlmanac(request, env, url) {
  const gate = await adminGate(request, env, url);
  if (gate) return gate;
  const [results, suites, totals] = await env.DB.batch([
    env.DB.prepare(
      `SELECT id, status, suite_id, suite_version, mode, model, quant, backend, gpu_vendor, gpu_model, vram_mb, os,
              score, tokens_per_s, ttft_ms, peak_vram_mb, submitter, created_at, reviewed_at, provider, account
       FROM almanac_results ORDER BY created_at DESC, id LIMIT ?`,
    ).bind(ALMANAC.adminList),
    env.DB.prepare(
      `SELECT s.suite_id, s.suite_version, s.sha256, s.deprecated, s.created_at, s.updated_at,
              (SELECT COUNT(*) FROM almanac_results r WHERE r.suite_id = s.suite_id AND r.suite_version = s.suite_version) AS results
       FROM almanac_suites s ORDER BY s.suite_id, s.created_at DESC`,
    ),
    env.DB.prepare(`SELECT COUNT(*) AS results, SUM(status = 'hidden') AS hidden, COUNT(DISTINCT submitter) AS submitters FROM almanac_results`),
  ]);
  return json({
    generated_at: Date.now(),
    totals: { results: totals.results[0]?.results | 0, hidden: totals.results[0]?.hidden | 0, submitters: totals.results[0]?.submitters | 0 },
    suites: suites.results.map((s) => ({ ...s, deprecated: !!s.deprecated })),
    results: results.results.map((r) => ({ ...r, submitter: r.submitter.slice(0, 8), legacy: !r.account })),
  }, { headers: PRIVATE });
}

const REVIEW = Object.freeze(['hide', 'unhide', 'delete']);

// POST api/admin/almanac/review {id, action}
export async function postAdminAlmanacReview(request, env, url, cache) {
  const gate = await adminGate(request, env, url);
  if (gate) return gate;
  const body = await readJsonBody(request);
  if (!body.ok) return fail(body.status, body.error, body.message, PRIVATE);
  const { id, action } = body.value;
  if (!isShotId(id)) return fail(400, 'bad_id', 'id is missing or malformed.', PRIVATE);
  if (!REVIEW.includes(action)) return fail(400, 'bad_action', 'action must be hide, unhide or delete.', PRIVATE);
  const now = Date.now();
  const stmt = action === 'delete'
    ? env.DB.prepare('DELETE FROM almanac_results WHERE id = ? RETURNING id').bind(id)
    : env.DB.prepare('UPDATE almanac_results SET status = ?, reviewed_at = ? WHERE id = ? RETURNING id')
      .bind(action === 'hide' ? 'hidden' : 'visible', now, id);
  const { results } = await stmt.all();
  if (!results.length) return fail(404, 'unknown_result', 'No such result.', PRIVATE);
  await dropCache(url, cache);
  return json({ ok: true, id, status: action === 'delete' ? 'deleted' : action === 'hide' ? 'hidden' : 'visible' }, { headers: PRIVATE });
}

// POST api/admin/almanac/suite {suite_id, suite_version, deprecated}
export async function postAdminAlmanacSuite(request, env, url, cache) {
  const gate = await adminGate(request, env, url);
  if (gate) return gate;
  const body = await readJsonBody(request);
  if (!body.ok) return fail(body.status, body.error, body.message, PRIVATE);
  const { suite_id: suiteId, suite_version: version, deprecated } = body.value;
  if (typeof suiteId !== 'string' || !/^[a-z0-9-]{1,40}$/.test(suiteId) || typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) {
    return fail(400, 'bad_suite', 'suite_id and suite_version are missing or malformed.', PRIVATE);
  }
  if (typeof deprecated !== 'boolean') return fail(400, 'bad_deprecated', 'deprecated must be true or false.', PRIVATE);
  const { results } = await env.DB.prepare(
    'UPDATE almanac_suites SET deprecated = ?, updated_at = ? WHERE suite_id = ? AND suite_version = ? RETURNING suite_id',
  ).bind(deprecated ? 1 : 0, Date.now(), suiteId, version).all();
  if (!results.length) return fail(404, 'unknown_suite', 'No results were ever submitted for that suite.', PRIVATE);
  await dropCache(url, cache);
  return json({ ok: true, suite_id: suiteId, suite_version: version, deprecated }, { headers: PRIVATE });
}
