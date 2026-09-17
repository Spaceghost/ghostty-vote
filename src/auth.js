// Sign-in with GitHub (a GitHub App's user-to-server OAuth) or FFXIV (XIVAuth), the
// session endpoints, the anonymous-ballot claim and the owner-only voter list.
//
// Each provider's access token is used during its callback only (to read the account
// id and, for XIVAuth, the character the voter chose) and then dropped: nothing about it
// is stored or logged. D1 cost: a sign-in touches D1 only to move an anonymous ballot
// (one batch); a link is one statement; me is one query when signed in and none
// otherwise; logout none; forget one; the admin list one batch.
import {
  API_PREFIX, BASE, COOKIE_NAME, LIMITS, PRIVATE, clearVoterCookie, cleanText, isSameOrigin, json, randomToken,
  voterKey, voterToken,
} from './lib.js';
import {
  SESSION_RENEW_S, accountKey, clearSessionCookie, clearStateCookie, isAccountId, isAdmin, nowSeconds, pkcePair,
  readSession, readState, safeReturnPath, sessionCookie, sessionSecrets, stateCookie, stateMatches,
} from './session.js';

const USER_AGENT = 'ghostty-vote (+https://spacegho.st/mods/ffxiv/term/vote/)';
const FETCH_TIMEOUT_MS = 10000;

export const PROVIDER = Object.freeze({
  github: {
    authorize: 'https://github.com/login/oauth/authorize',
    token: 'https://github.com/login/oauth/access_token',
    user: 'https://api.github.com/user',
    id: 'GITHUB_CLIENT_ID',
    secret: 'GITHUB_CLIENT_SECRET',
  },
  xivauth: {
    authorize: 'https://xivauth.net/oauth/authorize',
    token: 'https://xivauth.net/oauth/token',
    user: 'https://xivauth.net/api/v1/user',
    characters: 'https://xivauth.net/api/v1/characters',
    id: 'XIVAUTH_CLIENT_ID',
    secret: 'XIVAUTH_CLIENT_SECRET',
    // Sign-in asks for `user` only. With `character` in the scope, XIVAuth's preflight
    // (OAuth::PreflightCheck) refuses anyone without a verified character on its own error
    // page, which never comes back to the callback. The character is a separate, optional
    // link from a signed-in session, where that refusal is expected.
    scope: { signin: 'user', link: 'character' },
  },
});

// Where a navigation ends up: the page, with a fragment the page turns into a message.
// Codes: signed-in, character-linked, auth-error=<denied|expired|state|provider|
// not-configured|sign-in-first|no-character|refused|bad-request>.
const NAV = { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' };
function redirect(location, cookies = []) {
  const res = new Response(null, { status: 303, headers: { ...NAV, location } });
  for (const c of cookies) res.headers.append('set-cookie', c);
  return res;
}
const pageUrl = (url, path, fragment) => url.origin + path + '#' + fragment;
const configured = (env, provider) =>
  sessionSecrets(env).length > 0 && !!env?.[PROVIDER[provider].id] && !!env?.[PROVIDER[provider].secret];
const callbackUrl = (url, provider) => url.origin + API_PREFIX + 'auth/' + provider + '/callback';

// ---- start: api/auth/{github,xivauth}/start and api/auth/xivauth/link ----------------
export async function startAuth(request, env, url, provider, mode) {
  const back = safeReturnPath(url.searchParams.get('return'));
  // A cross-site page must not be able to start (or link) on the visitor's behalf.
  if (!isSameOrigin(request, url)) return redirect(pageUrl(url, back, 'auth-error=refused'));
  if (!configured(env, provider)) return redirect(pageUrl(url, back, 'auth-error=not-configured'));
  const state = { p: provider, s: randomToken(32), m: mode, r: back };
  if (mode === 'link') {
    const session = await readSession(request, env);
    if (!session) return redirect(pageUrl(url, back, 'auth-error=sign-in-first'));
    state.k = session.k;
  }
  const { verifier, challenge } = await pkcePair();
  state.cv = verifier;
  const P = PROVIDER[provider];
  const q = new URLSearchParams({ client_id: env[P.id], redirect_uri: callbackUrl(url, provider) });
  if (provider === 'xivauth') {
    q.set('response_type', 'code');
    q.set('scope', P.scope[mode]);
  }
  q.set('state', state.s);
  q.set('code_challenge', challenge);
  q.set('code_challenge_method', 'S256');
  return redirect(P.authorize + '?' + q, [await stateCookie(env, state)]);
}

// ---- callback: api/auth/{github,xivauth}/callback -----------------------------------
class ProviderError extends Error {
  constructor(stage, status) { super(`${stage} failed (${status})`); this.stage = stage; this.status = status; }
}

async function fetchJson(fetcher, stage, resource, init) {
  let res;
  try {
    res = await fetcher(resource, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch {
    throw new ProviderError(stage, 'network');
  }
  if (!res.ok) throw new ProviderError(stage, res.status);
  try {
    return await res.json();
  } catch {
    throw new ProviderError(stage, 'not json');
  }
}

async function exchangeCode(fetcher, env, provider, url, code, verifier) {
  const P = PROVIDER[provider];
  const body = new URLSearchParams({
    client_id: env[P.id],
    client_secret: env[P.secret],
    code,
    redirect_uri: callbackUrl(url, provider),
    code_verifier: verifier,
  });
  if (provider === 'xivauth') body.set('grant_type', 'authorization_code');
  const data = await fetchJson(fetcher, 'token', P.token, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded', 'user-agent': USER_AGENT },
    body,
  });
  // GitHub answers a bad code with 200 and {error}; only a token counts.
  const token = data && data.access_token;
  if (typeof token !== 'string' || !token || token.length > 4096) throw new ProviderError('token', 'no access_token');
  return token;
}

const bearer = (token, accept) => ({ authorization: 'Bearer ' + token, accept, 'user-agent': USER_AGENT });

async function githubUserId(fetcher, token) {
  const user = await fetchJson(fetcher, 'user', PROVIDER.github.user, {
    headers: { ...bearer(token, 'application/vnd.github+json'), 'x-github-api-version': '2022-11-28' },
  });
  const id = user && user.id;
  if (!Number.isSafeInteger(id) || id <= 0) throw new ProviderError('user', 'no id');
  return String(id);
}

async function xivauthUserId(fetcher, token) {
  const user = await fetchJson(fetcher, 'user', PROVIDER.xivauth.user, { headers: bearer(token, 'application/json') });
  const id = user && user.id;
  if (!isAccountId('xivauth', id)) throw new ProviderError('user', 'no id');
  return id;
}

// Only Lodestone's own image host is kept; anything else is stored as ''.
export function safeImageUrl(raw) {
  if (typeof raw !== 'string' || raw.length > 512) return '';
  let u;
  try { u = new URL(raw); } catch { return ''; }
  const host = u.hostname;
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return '';
  return host === 'finalfantasyxiv.com' || host.endsWith('.finalfantasyxiv.com') ? u.href : '';
}

// The first usable character in GET api/v1/characters (with the plain `character` scope
// XIVAuth returns at most the one the voter picked), reduced to what is stored.
export function pickCharacter(list) {
  if (!Array.isArray(list)) return null;
  for (const c of list) {
    if (!c || typeof c !== 'object') continue;
    const lodestone = typeof c.lodestone_id === 'number' ? String(c.lodestone_id) : c.lodestone_id;
    if (typeof lodestone !== 'string' || !/^\d{1,20}$/.test(lodestone)) continue;
    const name = cleanText(c.name);
    if (!name || name.length > 64) continue;
    const world = (cleanText(c.home_world) || '').slice(0, 32);
    return { lodestone_id: lodestone, name, world, portrait_url: safeImageUrl(c.portrait_url) };
  }
  return null;
}

async function xivauthCharacter(fetcher, token) {
  const list = await fetchJson(fetcher, 'characters', PROVIDER.xivauth.characters, { headers: bearer(token, 'application/json') });
  if (!Array.isArray(list)) throw new ProviderError('characters', 'not a list');
  return pickCharacter(list);
}

export function upsertCharacter(db, voter, c, now) {
  // A different character than before starts a new first_seen.
  return db.prepare(
    `INSERT INTO characters (voter, lodestone_id, name, world, portrait_url, first_seen, last_seen)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
     ON CONFLICT (voter) DO UPDATE SET
       first_seen = CASE WHEN characters.lodestone_id = excluded.lodestone_id THEN characters.first_seen ELSE excluded.first_seen END,
       lodestone_id = excluded.lodestone_id, name = excluded.name, world = excluded.world,
       portrait_url = excluded.portrait_url, last_seen = excluded.last_seen`,
  ).bind(voter, c.lodestone_id, c.name, c.world, c.portrait_url, now);
}

// Moves an anonymous ballot onto an account in one batch. Rows the account does not have
// change owner (the vote is unchanged, so the tally triggers, which fire only on an
// UPDATE OF vote, rightly leave the tallies alone). Rows for ideas the account already
// has are deleted, and the DELETE trigger takes their votes out of the tallies: the
// account's row wins. Suggestions and the rate-limit log follow the ballot.
export function claimStatements(db, anonKey, account) {
  if (anonKey === account) return [];
  return [
    db.prepare(
      `UPDATE votes SET voter = ?1 WHERE voter = ?2
       AND NOT EXISTS (SELECT 1 FROM votes AS mine WHERE mine.voter = ?1 AND mine.idea_id = votes.idea_id)`,
    ).bind(account, anonKey),
    db.prepare('DELETE FROM votes WHERE voter = ?').bind(anonKey),
    db.prepare('UPDATE suggestions SET voter = ?1 WHERE voter = ?2').bind(account, anonKey),
    db.prepare('UPDATE write_log SET voter = ?1 WHERE voter = ?2').bind(account, anonKey),
  ];
}

export async function finishAuth(request, env, url, provider, fetcher) {
  const state = await readState(request, env);
  const back = state ? safeReturnPath(state.r) : BASE + '/';
  const fail = (code) => redirect(pageUrl(url, back, 'auth-error=' + code), [clearStateCookie()]);
  if (!state || state.p !== provider || !configured(env, provider)) {
    return fail(configured(env, provider) ? 'expired' : 'not-configured');
  }
  if (url.searchParams.has('error')) return fail('denied'); // e.g. access_denied: the visitor said no
  if (!stateMatches(state, url.searchParams.get('state'))) return fail('state');
  const code = url.searchParams.get('code');
  if (!code || code.length > 512) return fail('bad-request');

  let session = null;
  if (state.m === 'link') {
    // The account that started the link must still be the one signed in.
    session = await readSession(request, env);
    if (!session || session.k !== state.k) return fail('sign-in-first');
  }

  const now = Date.now();
  let userId = null, character = null;
  try {
    const token = await exchangeCode(fetcher, env, provider, url, code, state.cv);
    if (state.m === 'link') character = await xivauthCharacter(fetcher, token);
    else userId = provider === 'github' ? await githubUserId(fetcher, token) : await xivauthUserId(fetcher, token);
  } catch (err) {
    logProviderError(provider, err);
    return fail('provider');
  }

  if (state.m === 'link') {
    if (!character) return fail('no-character');
    await upsertCharacter(env.DB, session.k, character, now).run();
    return redirect(pageUrl(url, back, 'character-linked'), [clearStateCookie()]);
  }

  const key = await accountKey(provider, userId);
  const statements = [];
  const anon = voterToken(request.headers.get('cookie'));
  if (anon) statements.push(...claimStatements(env.DB, await voterKey(anon), key));
  if (statements.length) await env.DB.batch(statements);

  const cookies = [clearStateCookie(), await sessionCookie(env, { p: provider, k: key })];
  if (request.headers.get('cookie')?.includes(COOKIE_NAME + '=')) cookies.push(clearVoterCookie());
  return redirect(pageUrl(url, back, 'signed-in'), cookies);
}

function logProviderError(provider, err) {
  // Stage and HTTP status only: never a code, token or response body.
  const detail = err instanceof ProviderError ? `${err.stage}: ${err.status}` : 'unexpected error';
  console.error(`ghostty-vote: ${provider} sign-in ${detail}`);
}

// ---- session endpoints --------------------------------------------------------------
const refused = () => json({ error: 'forbidden', message: 'Cross-site request refused.' }, { status: 403, headers: PRIVATE });
export const signInRequired = (headers = {}) =>
  json({ error: 'sign_in_required', message: 'Sign in with GitHub or FFXIV to vote.' }, { status: 401, headers });

// GET api/auth/me -> who is signed in, for the page. Signed out: no D1 at all.
export async function getMe(request, env, url) {
  if (!isSameOrigin(request, url)) return refused();
  const session = await readSession(request, env);
  if (!session) {
    // legacy_ballot: this browser still holds the anonymous cookie, so signing in moves that ballot.
    return json({ signed_in: false, legacy_ballot: !!voterToken(request.headers.get('cookie')) }, { headers: PRIVATE });
  }
  const row = await env.DB.prepare('SELECT name, world, portrait_url FROM characters WHERE voter = ?').bind(session.k).first();
  const res = json({
    signed_in: true,
    provider: session.p,
    character: row ? { name: row.name, world: row.world, portrait_url: row.portrait_url } : null,
    admin: await isAdmin(env, session),
  }, { headers: PRIVATE });
  if (session.exp - nowSeconds() < SESSION_RENEW_S) res.headers.append('set-cookie', await sessionCookie(env, session));
  return res;
}

// POST api/auth/logout: the session is only a cookie, so dropping it is all there is.
export async function postLogout(request, env, url) {
  if (!isSameOrigin(request, url)) return refused();
  const res = json({ ok: true }, { headers: PRIVATE });
  res.headers.append('set-cookie', clearSessionCookie());
  return res;
}

// POST api/auth/character/forget: deletes the linked character; the ballot stays.
export async function postForgetCharacter(request, env, url) {
  if (!isSameOrigin(request, url)) return refused();
  const session = await readSession(request, env);
  if (!session) return signInRequired(PRIVATE);
  await env.DB.prepare('DELETE FROM characters WHERE voter = ?').bind(session.k).run();
  return json({ ok: true }, { headers: PRIVATE });
}

// ---- GET api/admin/voters (ADMIN_ACCOUNTS only) --------------------------------------
export async function getAdminVoters(request, env, url) {
  if (!isSameOrigin(request, url)) return refused();
  const session = await readSession(request, env);
  if (!session) return signInRequired(PRIVATE);
  if (!(await isAdmin(env, session))) {
    return json({ error: 'forbidden', message: 'Only the site owner can see this.' }, { status: 403, headers: PRIVATE });
  }
  const [counts, notes, suggestions, characters] = await env.DB.batch([
    env.DB.prepare(
      `SELECT voter, SUM(vote = 'want') AS want, SUM(vote = 'maybe') AS maybe, SUM(vote = 'skip') AS skip,
              MAX(updated_at) AS last_active
       FROM votes GROUP BY voter`,
    ),
    env.DB.prepare(
      `SELECT votes.voter, votes.idea_id, ideas.title, votes.vote, votes.note, votes.updated_at
       FROM votes JOIN ideas ON ideas.id = votes.idea_id
       WHERE votes.note <> '' ORDER BY votes.updated_at DESC`,
    ),
    env.DB.prepare(
      'SELECT id, voter, title, detail, status, created_at FROM suggestions ORDER BY created_at DESC, id DESC LIMIT ?',
    ).bind(LIMITS.adminSuggestions),
    env.DB.prepare('SELECT voter, lodestone_id, name, world, portrait_url, first_seen, last_seen FROM characters'),
  ]);

  const voters = new Map();
  const voter = (key) => {
    let v = voters.get(key);
    if (!v) {
      voters.set(key, (v = { voter: key, you: key === session.k, character: null, want: 0, maybe: 0, skip: 0, last_active: 0, notes: [], suggestions: [] }));
    }
    return v;
  };
  const seen = (v, at) => { v.last_active = Math.max(v.last_active, at || 0); };
  for (const r of counts.results) {
    const v = voter(r.voter);
    Object.assign(v, { want: r.want | 0, maybe: r.maybe | 0, skip: r.skip | 0 });
    seen(v, r.last_active);
  }
  for (const r of notes.results) {
    voter(r.voter).notes.push({ idea_id: r.idea_id, title: r.title, vote: r.vote || null, note: r.note, updated_at: r.updated_at });
  }
  for (const r of suggestions.results) {
    const v = voter(r.voter);
    v.suggestions.push({ id: r.id, title: r.title, detail: r.detail, status: r.status, created_at: r.created_at });
    seen(v, r.created_at);
  }
  for (const r of characters.results) {
    const v = voter(r.voter);
    v.character = {
      lodestone_id: r.lodestone_id, name: r.name, world: r.world, portrait_url: r.portrait_url,
      first_seen: r.first_seen, last_seen: r.last_seen,
    };
    seen(v, r.last_seen);
  }
  const list = [...voters.values()].sort((a, b) => b.last_active - a.last_active || (a.voter < b.voter ? -1 : 1));
  return json({
    generated_at: Date.now(),
    totals: {
      voters: list.length,
      with_character: list.filter((v) => v.character).length,
      notes: notes.results.length,
      suggestions: suggestions.results.length,
    },
    voters: list,
  }, { headers: PRIVATE });
}
