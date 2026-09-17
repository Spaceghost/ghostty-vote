// Request handling. `page` is the HTML template; `env.DB` is the D1 binding.
import {
  BASE, LIMITS, isSameOrigin, json, pageSecurityHeaders, randomToken, readJsonBody,
  route, validateSuggestion, validateVote, voterCookie, voterKey, voterToken,
} from './lib.js';

const PUBLIC_URL = 'https://spacegho.st' + BASE;

export async function handle(request, env, page) {
  const url = new URL(request.url);
  if (url.protocol === 'http:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    url.protocol = 'https:';
    return Response.redirect(url.toString(), 301);
  }
  const r = route(url.pathname);
  try {
    if (r.kind === 'page') return servePage(request, page);
    if (r.kind === 'redirect') return Response.redirect(new URL(r.location + url.search, url).toString(), 301);
    if (r.kind === 'api') return await serveApi(request, env, url, r.name);
    return new Response('Not found\n', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  } catch (err) {
    console.error('ghostty-vote:', err && err.stack ? err.stack : String(err));
    return json({ error: 'server_error', message: 'Something went wrong; try again shortly.' }, { status: 500 });
  }
}

function servePage(request, page) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed\n', { status: 405, headers: { allow: 'GET, HEAD' } });
  }
  const nonce = randomToken(16);
  return new Response(page.replaceAll('__NONCE__', nonce), { headers: pageSecurityHeaders(nonce) });
}

const READS = { ideas: getIdeas, mine: getMine, version: getVersion };
const WRITES = { vote: [validateVote, postVote], suggest: [validateSuggestion, postSuggest] };

async function serveApi(request, env, url, name) {
  if (name === null) return json({ error: 'not_found', message: 'Unknown endpoint.' }, { status: 404 });
  if (READS[name]) {
    if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, { status: 405, headers: { allow: 'GET' } });
    return READS[name](request, env, url);
  }
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, { status: 405, headers: { allow: 'POST' } });
  if (!isSameOrigin(request, url)) return json({ error: 'forbidden', message: 'Cross-site request refused.' }, { status: 403 });

  const body = await readJsonBody(request);
  if (!body.ok) return json({ error: body.error, message: body.message }, { status: body.status });
  const [validate, write] = WRITES[name];
  const input = validate(body.value);
  if (!input.ok) return json({ error: input.error, message: input.message }, { status: input.status });

  const token = voterToken(request.headers.get('cookie')) || randomToken();
  const voter = await voterKey(token);
  const now = Date.now();

  const recent = await env.DB.prepare('SELECT COUNT(*) AS n, MIN(at) AS oldest FROM write_log WHERE voter = ? AND at > ?')
    .bind(voter, now - LIMITS.windowMs).first();
  if (recent && recent.n >= LIMITS.writesPerWindow) {
    const retry = Math.max(1, Math.ceil((recent.oldest + LIMITS.windowMs - now) / 1000));
    return json(
      { error: 'rate_limited', message: 'That is a lot of changes at once; try again in a few minutes.' },
      { status: 429, headers: { 'retry-after': String(retry) } },
    );
  }

  const res = await write(env, voter, input.value, now);
  res.headers.append('set-cookie', voterCookie(token));
  return res;
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
  const idea = await env.DB.prepare('SELECT id FROM ideas WHERE id = ? AND retired = 0').bind(ideaId).first();
  if (!idea) return json({ error: 'unknown_idea', message: 'No such idea.' }, { status: 404 });

  const change = vote === null
    ? env.DB.prepare('DELETE FROM votes WHERE voter = ? AND idea_id = ?').bind(voter, ideaId)
    : env.DB.prepare(
      `INSERT INTO votes (voter, idea_id, vote, note, created_at, updated_at)
       VALUES (?1, ?2, ?3, COALESCE(?4, ''), ?5, ?5)
       ON CONFLICT (voter, idea_id) DO UPDATE SET
         vote = excluded.vote, note = COALESCE(?4, votes.note), updated_at = excluded.updated_at`,
    ).bind(voter, ideaId, vote, note, now);

  const results = await env.DB.batch([
    ...logWrite(env, voter, now),
    change,
    env.DB.prepare('SELECT want, maybe, skip FROM ideas WHERE id = ?').bind(ideaId),
    env.DB.prepare('SELECT vote, note FROM votes WHERE voter = ? AND idea_id = ?').bind(voter, ideaId),
  ]);
  const mine = results[4].results[0] || null;
  return json({
    ok: true,
    idea_id: ideaId,
    vote: mine ? mine.vote : null,
    note: mine ? mine.note : '',
    tally: tallyOf(results[3].results[0]),
  });
}

async function postSuggest(env, voter, { title, detail }, now) {
  const since = now - LIMITS.dayMs;
  const [mine, all] = await env.DB.batch([
    env.DB.prepare('SELECT COUNT(*) AS n FROM suggestions WHERE voter = ? AND created_at > ?').bind(voter, since),
    env.DB.prepare('SELECT COUNT(*) AS n FROM suggestions WHERE created_at > ?').bind(since),
  ]);
  if (mine.results[0].n >= LIMITS.suggestionsPerVoterPerDay) {
    return json({ error: 'suggestion_limit', message: 'That is plenty of ideas for one day; thank you! Try again tomorrow.' }, { status: 429 });
  }
  if (all.results[0].n >= LIMITS.suggestionsPerDay) {
    return json({ error: 'suggestions_full', message: 'The suggestion box is full for today; try again tomorrow.' }, { status: 429 });
  }
  const results = await env.DB.batch([
    ...logWrite(env, voter, now),
    env.DB.prepare(
      'INSERT INTO suggestions (voter, title, detail, created_at) VALUES (?, ?, ?, ?) RETURNING id, title, detail, status, created_at',
    ).bind(voter, title, detail, now),
  ]);
  return json({ ok: true, suggestion: results[2].results[0] }, { status: 201 });
}

async function getIdeas(request, env) {
  const [cat, cats, ideas] = await env.DB.batch([
    env.DB.prepare('SELECT version FROM catalogue WHERE id = 1'),
    env.DB.prepare('SELECT name, tagline FROM categories ORDER BY sort_order'),
    env.DB.prepare(
      `SELECT id, category, title, pitch, experience, how, risks, audience, in_world, tos_safe, top_pick,
              wow, feasibility, effort, added_version, want, maybe, skip
       FROM ideas WHERE retired = 0 ORDER BY sort_order`,
    ),
  ]);
  return json({
    version: cat.results[0]?.version ?? 0,
    categories: cats.results,
    ideas: ideas.results.map(({ want, maybe, skip, in_world: w, tos_safe: t, top_pick: p, ...rest }) => ({
      ...rest,
      in_world: w === 1,
      tos_safe: t === 1,
      top_pick: p === 1,
      tally: { want, maybe, skip },
    })),
  });
}

async function getMine(request, env) {
  const headers = { 'cache-control': 'private, no-store', vary: 'Cookie' };
  const token = voterToken(request.headers.get('cookie'));
  if (!token) return json({ votes: {}, suggestions: [] }, { headers });
  const voter = await voterKey(token);
  const [votes, suggestions] = await env.DB.batch([
    env.DB.prepare('SELECT idea_id, vote, note, updated_at FROM votes WHERE voter = ?').bind(voter),
    env.DB.prepare(
      'SELECT id, title, detail, status, created_at FROM suggestions WHERE voter = ? ORDER BY created_at DESC LIMIT 50',
    ).bind(voter),
  ]);
  const byIdea = {};
  for (const { idea_id: id, ...v } of votes.results) byIdea[id] = v;
  return json({ votes: byIdea, suggestions: suggestions.results }, { headers });
}

// Cheap poll for the plugin: GET api/version?since=<last version the player saw>.
async function getVersion(request, env, url) {
  const raw = url.searchParams.get('since');
  const since = raw !== null && /^\d{1,9}$/.test(raw) ? Number(raw) : null;
  const row = await env.DB.prepare(
    `SELECT (SELECT version FROM catalogue WHERE id = 1) AS version,
            (SELECT COUNT(*) FROM ideas WHERE retired = 0) AS ideas,
            (SELECT COUNT(*) FROM ideas WHERE retired = 0 AND added_version > ?) AS new_ideas`,
  ).bind(since ?? 0).first();
  const body = { version: row?.version ?? 0, ideas: row?.ideas ?? 0, url: PUBLIC_URL };
  if (since !== null) {
    body.new_since = row?.new_ideas ?? 0;
    body.url = `${PUBLIC_URL}?since=${since}`;
  }
  return json(body, {
    headers: { 'cache-control': 'public, max-age=300', 'access-control-allow-origin': '*' },
  });
}
