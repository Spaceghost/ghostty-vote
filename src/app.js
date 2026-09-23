// The Worker's whole job: the ballot API (vote, suggest, tallies, mine), sign-in
// (auth/*, in auth.js), the owner's voter list (admin/voters) and the screenshot
// gallery's upload, approved list, images and moderation queue (gallery.js), and the
// Almanac leaderboard's submissions, aggregates and moderation (almanac.js).
// Everything else on the route is a static asset served without invoking this code.
// D1 budget: a write costs one read query plus one batch; a tally read costs one
// query per edge location per minute (the rest are answered from the Cache API);
// api/mine costs one batch, and nothing at all for a request without a session.
// Writing needs a signed-in session (session.js); the voter is its account key.
import { getAdminVoters, getMe, finishAuth, postForgetCharacter, postLogout, startAuth } from './auth.js';
import { authorize, banned } from './account.js';
import {
  getAdminAccounts, getApps, postAdminBan, postAdminTokenRevoke, postAppRevoke, postDeviceApprove, postDeviceCode,
  postDeviceLookup, postDeviceToken, postTokenRevoke,
} from './device.js';
import {
  API_PREFIX, LIMITS, PRIVATE, isSameOrigin, json, readJsonBody, route, validateSuggestion, validateVote,
} from './lib.js';
import { readSession } from './session.js';
import {
  getAdminAlmanac, getAggregate, postAdminAlmanacReview, postAdminAlmanacSuite, postResult,
} from './almanac.js';
import { getPluginMaster } from './plugins.js';
import { getAdminGallery, getAdminImage, getMyShotVotes, getPublicImage, getShots, postAdminReview, postAdminThumb, postMemberUpload, postShotVote, postUpload } from './gallery.js';

const WRITES = { vote: [validateVote, postVote], suggest: [validateSuggestion, postSuggest] };

// name -> (request, env, ctx, url, cache, fetcher) => Response
const HANDLERS = {
  tallies: (request, env, ctx, url, cache) => getTallies(env, ctx, url, cache),
  mine: (request, env, ctx, url) => getMine(request, env, url),
  vote: (request, env, ctx, url) => serveWrite(request, env, url, 'vote'),
  suggest: (request, env, ctx, url) => serveWrite(request, env, url, 'suggest'),
  'auth/github/start': (request, env, ctx, url) => startAuth(request, env, url, 'github', 'signin'),
  'auth/xivauth/start': (request, env, ctx, url) => startAuth(request, env, url, 'xivauth', 'signin'),
  'auth/xivauth/link': (request, env, ctx, url) => startAuth(request, env, url, 'xivauth', 'link'),
  'auth/github/callback': (request, env, ctx, url, cache, fetcher) => finishAuth(request, env, url, 'github', fetcher),
  'auth/xivauth/callback': (request, env, ctx, url, cache, fetcher) => finishAuth(request, env, url, 'xivauth', fetcher),
  'auth/me': (request, env, ctx, url) => getMe(request, env, url),
  'auth/logout': (request, env, ctx, url) => postLogout(request, env, url),
  'auth/character/forget': (request, env, ctx, url) => postForgetCharacter(request, env, url),
  'admin/voters': (request, env, ctx, url) => getAdminVoters(request, env, url),
  'admin/gallery': (request, env, ctx, url) => getAdminGallery(request, env, url),
  'admin/gallery/image': (request, env, ctx, url) => getAdminImage(request, env, url),
  'admin/gallery/review': (request, env, ctx, url, cache) => postAdminReview(request, env, url, cache),
  'admin/gallery/thumb': (request, env, ctx, url) => postAdminThumb(request, env, url),
  // the screenshot gallery (src/gallery.js), under /mods/ffxiv/term/gallery
  'shots/upload': (request, env, ctx, url) => postMemberUpload(request, env, url),
  'gallery/upload': (request, env, ctx, url) => postUpload(request, env, url),
  'gallery/shots': (request, env, ctx, url, cache) => getShots(env, ctx, url, cache),
  // one keep-or-pass vote per account per shot; the lowest-voted are what the gallery
  // drops when it runs out of room (src/gallery.js, evictOverBudget)
  'gallery/vote': (request, env, ctx, url) => postShotVote(request, env, url),
  'gallery/mine': (request, env, ctx, url) => getMyShotVotes(request, env, url),
  'gallery/img': (request, env, ctx, url, cache, fetcher, r) => getPublicImage(env, r.id, false),
  'gallery/thumb': (request, env, ctx, url, cache, fetcher, r) => getPublicImage(env, r.id, true),
  // the device link, connected apps and account moderation (src/device.js)
  'device/code': (request, env, ctx, url) => postDeviceCode(request, env, url),
  'device/token': (request, env, ctx, url) => postDeviceToken(request, env, url),
  'device/lookup': (request, env, ctx, url) => postDeviceLookup(request, env, url),
  'device/approve': (request, env, ctx, url) => postDeviceApprove(request, env, url),
  apps: (request, env, ctx, url) => getApps(request, env, url),
  'apps/revoke': (request, env, ctx, url) => postAppRevoke(request, env, url),
  'token/revoke': (request, env, ctx, url) => postTokenRevoke(request, env, url),
  'admin/accounts': (request, env, ctx, url) => getAdminAccounts(request, env, url),
  'admin/accounts/ban': (request, env, ctx, url) => postAdminBan(request, env, url),
  'admin/tokens/revoke': (request, env, ctx, url) => postAdminTokenRevoke(request, env, url),
  // the Dalamud plugin repository (src/plugins.js), at /mods/ffxiv/plugins.json
  plugins: (request, env, ctx, url, cache, fetcher) => getPluginMaster(request, env, ctx, url, cache, fetcher),
  // the Almanac community model leaderboard (src/almanac.js), under /mods/ffxiv/almanac
  'almanac/results': (request, env, ctx, url) => postResult(request, env, url),
  'almanac/leaderboard': (request, env, ctx, url, cache) => getAggregate(env, ctx, url, cache, 'leaderboard'),
  'almanac/recommendations': (request, env, ctx, url, cache) => getAggregate(env, ctx, url, cache, 'recommendations'),
  'admin/almanac': (request, env, ctx, url) => getAdminAlmanac(request, env, url),
  'admin/almanac/review': (request, env, ctx, url, cache) => postAdminAlmanacReview(request, env, url, cache),
  'admin/almanac/suite': (request, env, ctx, url, cache) => postAdminAlmanacSuite(request, env, url, cache),
};

// `cache` is the Cache API store (caches.default on Cloudflare) and `fetcher` the fetch
// used to reach GitHub and XIVAuth; tests pass their own.
export async function handle(request, env, ctx, cache = globalThis.caches?.default, fetcher = (...args) => fetch(...args)) {
  const url = new URL(request.url);
  const r = route(url.pathname);
  if (r.kind !== 'api') {
    return new Response('Not found\n', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
  if (request.method !== r.method) {
    return json({ error: 'method_not_allowed' }, { status: 405, headers: { allow: r.method } });
  }
  try {
    return await HANDLERS[r.name](request, env, ctx, url, cache, fetcher, r);
  } catch (err) {
    console.error('ghostty-vote:', err && err.stack ? err.stack : String(err));
    return json({ error: 'server_error', message: 'Something went wrong; try again shortly.' }, { status: 500 });
  }
}

// GET api/tallies -> {idea_id: {want, maybe, skip}} for every open idea.
async function getTallies(env, ctx, url, cache) {
  // One cache key regardless of query string, so cache-busting parameters cannot force D1 reads.
  const key = new Request(url.origin + API_PREFIX + 'tallies');
  if (cache) {
    const hit = await cache.match(key);
    if (hit) return hit;
  }
  const { results } = await env.DB.prepare('SELECT id, want, maybe, skip FROM ideas WHERE retired = 0').all();
  const tallies = {};
  for (const { id, want, maybe, skip } of results) tallies[id] = { want, maybe, skip };
  const res = json(tallies, { headers: { 'cache-control': `public, max-age=${LIMITS.tallyTtlSeconds}` } });
  if (cache) {
    const put = cache.put(key, res.clone());
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(put);
    else await put;
  }
  return res;
}

// GET api/mine -> the signed-in voter's own ballot and newest suggestions, so the page
// can show them again on any load. Private to the session: never cached (not even by
// the browser) and never read from or written to the tallies cache.
async function getMine(request, env, url) {
  if (!isSameOrigin(request, url)) {
    return json({ error: 'forbidden', message: 'Cross-site request refused.' }, { status: 403, headers: PRIVATE });
  }
  const mine = { signed_in: false, votes: {}, suggestions: [] };
  const session = await readSession(request, env);
  if (!session) return json(mine, { headers: PRIVATE }); // no session, no ballot: D1 is not asked
  mine.signed_in = true;
  const voter = session.k;
  const [votes, suggestions] = await env.DB.batch([
    env.DB.prepare('SELECT idea_id, vote, note, updated_at FROM votes WHERE voter = ?').bind(voter),
    env.DB.prepare(
      'SELECT id, title, detail, created_at FROM suggestions WHERE voter = ? ORDER BY created_at DESC, id DESC LIMIT ?',
    ).bind(voter, LIMITS.mySuggestions),
  ]);
  for (const { idea_id: ideaId, vote, note, updated_at: updatedAt } of votes.results) {
    mine.votes[ideaId] = { vote: vote || null, note, updated_at: updatedAt };
  }
  mine.suggestions = suggestions.results;
  return json(mine, { headers: PRIVATE });
}

async function serveWrite(request, env, url, name) {
  if (!isSameOrigin(request, url)) return json({ error: 'forbidden', message: 'Cross-site request refused.' }, { status: 403 });
  // A ballot is a person's: the session only, no linked-app token carries a scope for it.
  const auth = await authorize(request, env, url, null, { deferBan: true }); // the precheck query looks the ban up
  if (!auth.ok) return auth.response;
  const body = await readJsonBody(request);
  if (!body.ok) return json({ error: body.error, message: body.message }, { status: body.status });
  const [validate, write] = WRITES[name];
  const input = validate(body.value);
  if (!input.ok) return json({ error: input.error, message: input.message }, { status: input.status });
  return write(env, auth.account, input.value, Date.now());
}

// Every precheck query starts with the voter's writes in the rate-limit window.
// ?1 is the voter in both: the ban rides along, so the gate costs no extra query.
const WINDOW_SQL = 'COUNT(*) AS n, MIN(at) AS oldest, EXISTS (SELECT 1 FROM account_bans WHERE account = ?1) AS banned';

function rateLimited(row, now) {
  if (!row || row.n < LIMITS.writesPerWindow) return null;
  const retry = Math.max(1, Math.ceil((row.oldest + LIMITS.windowMs - now) / 1000));
  return json(
    { error: 'rate_limited', message: 'That is a lot of changes at once; try again in a few minutes.' },
    { status: 429, headers: { 'retry-after': String(retry) } },
  );
}

// Every accepted write is logged for the rate limit, and the log is pruned in the same batch.
function logWrite(env, voter, now) {
  return [
    env.DB.prepare('INSERT INTO write_log (voter, at) VALUES (?, ?)').bind(voter, now),
    env.DB.prepare('DELETE FROM write_log WHERE at <= ?').bind(now - LIMITS.windowMs),
  ];
}

const tallyOf = (row) => ({ want: row?.want ?? 0, maybe: row?.maybe ?? 0, skip: row?.skip ?? 0 });

async function postVote(env, { p: provider, k: voter }, { idea_id: ideaId, vote, note }, now) {
  const pre = await env.DB.prepare(
    `SELECT ${WINDOW_SQL}, EXISTS (SELECT 1 FROM ideas WHERE id = ?3 AND retired = 0) AS known
     FROM write_log WHERE voter = ?1 AND at > ?2`,
  ).bind(voter, now - LIMITS.windowMs, ideaId).first();
  if (pre?.banned) return banned();
  const limited = rateLimited(pre, now);
  if (limited) return limited;
  if (!pre || !pre.known) return json({ error: 'unknown_idea', message: 'No such idea.' }, { status: 404 });

  // null keeps the stored vote or note, '' clears it. The row goes once both are empty;
  // the triggers keep the tallies right through every step ('' counts toward nothing).
  const results = await env.DB.batch([
    ...logWrite(env, voter, now),
    env.DB.prepare(
      `INSERT INTO votes (voter, idea_id, vote, note, created_at, updated_at, provider)
       VALUES (?1, ?2, COALESCE(?3, ''), COALESCE(?4, ''), ?5, ?5, ?6)
       ON CONFLICT (voter, idea_id) DO UPDATE SET
         vote = COALESCE(?3, votes.vote), note = COALESCE(?4, votes.note), updated_at = excluded.updated_at, provider = ?6
       RETURNING vote, note, updated_at`,
    ).bind(voter, ideaId, vote, note, now, provider),
    env.DB.prepare("DELETE FROM votes WHERE voter = ? AND idea_id = ? AND vote = '' AND note = ''").bind(voter, ideaId),
    env.DB.prepare('SELECT want, maybe, skip FROM ideas WHERE id = ?').bind(ideaId),
  ]);
  const row = results[2].results[0];
  return json({
    ok: true,
    idea_id: ideaId,
    vote: row.vote || null,
    note: row.note,
    tally: tallyOf(results[4].results[0]),
    updated_at: row.updated_at,
  });
}

async function postSuggest(env, { p: provider, k: voter }, { title, detail }, now) {
  const since = now - LIMITS.dayMs;
  const pre = await env.DB.prepare(
    `SELECT ${WINDOW_SQL},
            (SELECT COUNT(*) FROM suggestions WHERE voter = ?1 AND created_at > ?3) AS mine,
            (SELECT COUNT(*) FROM suggestions WHERE created_at > ?3) AS today
     FROM write_log WHERE voter = ?1 AND at > ?2`,
  ).bind(voter, now - LIMITS.windowMs, since).first();
  if (pre?.banned) return banned();
  const limited = rateLimited(pre, now);
  if (limited) return limited;
  if (pre.mine >= LIMITS.suggestionsPerVoterPerDay) {
    return json({ error: 'suggestion_limit', message: 'That is plenty of ideas for one day; thank you! Try again tomorrow.' }, { status: 429 });
  }
  if (pre.today >= LIMITS.suggestionsPerDay) {
    return json({ error: 'suggestions_full', message: 'The suggestion box is full for today; try again tomorrow.' }, { status: 429 });
  }
  const results = await env.DB.batch([
    ...logWrite(env, voter, now),
    env.DB.prepare(
      'INSERT INTO suggestions (voter, title, detail, created_at, provider) VALUES (?, ?, ?, ?, ?) RETURNING id, title, detail, created_at',
    ).bind(voter, title, detail, now, provider),
  ]);
  return json({ ok: true, suggestion: results[2].results[0] }, { status: 201 });
}
