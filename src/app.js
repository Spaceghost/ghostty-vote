// The Worker's whole job: the ballot API (vote, suggest, tallies, mine), sign-in
// (auth/*, in auth.js) and the owner's voter list (admin/voters).
// Everything else on the route is a static asset served without invoking this code.
// D1 budget: a write costs one read query plus one batch; a tally read costs one
// query per edge location per minute (the rest are answered from the Cache API);
// api/mine costs one batch, and nothing at all for a request without a session.
// Writing needs a signed-in session (session.js); the voter is its account key.
import { getAdminVoters, getMe, finishAuth, postForgetCharacter, postLogout, signInRequired, startAuth } from './auth.js';
import {
  API_PREFIX, LIMITS, PRIVATE, isSameOrigin, json, readJsonBody, route, validateSuggestion, validateVote,
} from './lib.js';
import { readSession } from './session.js';

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
    return await HANDLERS[r.name](request, env, ctx, url, cache, fetcher);
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
  const session = await readSession(request, env);
  if (!session) return signInRequired();
  const body = await readJsonBody(request);
  if (!body.ok) return json({ error: body.error, message: body.message }, { status: body.status });
  const [validate, write] = WRITES[name];
  const input = validate(body.value);
  if (!input.ok) return json({ error: input.error, message: input.message }, { status: input.status });
  return write(env, session.k, input.value, Date.now());
}

// Every precheck query starts with the voter's writes in the rate-limit window.
const WINDOW_SQL = 'COUNT(*) AS n, MIN(at) AS oldest';

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

async function postVote(env, voter, { idea_id: ideaId, vote, note }, now) {
  const pre = await env.DB.prepare(
    `SELECT ${WINDOW_SQL}, EXISTS (SELECT 1 FROM ideas WHERE id = ?3 AND retired = 0) AS known
     FROM write_log WHERE voter = ?1 AND at > ?2`,
  ).bind(voter, now - LIMITS.windowMs, ideaId).first();
  const limited = rateLimited(pre, now);
  if (limited) return limited;
  if (!pre || !pre.known) return json({ error: 'unknown_idea', message: 'No such idea.' }, { status: 404 });

  // null keeps the stored vote or note, '' clears it. The row goes once both are empty;
  // the triggers keep the tallies right through every step ('' counts toward nothing).
  const results = await env.DB.batch([
    ...logWrite(env, voter, now),
    env.DB.prepare(
      `INSERT INTO votes (voter, idea_id, vote, note, created_at, updated_at)
       VALUES (?1, ?2, COALESCE(?3, ''), COALESCE(?4, ''), ?5, ?5)
       ON CONFLICT (voter, idea_id) DO UPDATE SET
         vote = COALESCE(?3, votes.vote), note = COALESCE(?4, votes.note), updated_at = excluded.updated_at
       RETURNING vote, note, updated_at`,
    ).bind(voter, ideaId, vote, note, now),
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

async function postSuggest(env, voter, { title, detail }, now) {
  const since = now - LIMITS.dayMs;
  const pre = await env.DB.prepare(
    `SELECT ${WINDOW_SQL},
            (SELECT COUNT(*) FROM suggestions WHERE voter = ?1 AND created_at > ?3) AS mine,
            (SELECT COUNT(*) FROM suggestions WHERE created_at > ?3) AS today
     FROM write_log WHERE voter = ?1 AND at > ?2`,
  ).bind(voter, now - LIMITS.windowMs, since).first();
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
      'INSERT INTO suggestions (voter, title, detail, created_at) VALUES (?, ?, ?, ?) RETURNING id, title, detail, created_at',
    ).bind(voter, title, detail, now),
  ]);
  return json({ ok: true, suggestion: results[2].results[0] }, { status: 201 });
}
