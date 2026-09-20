// The screenshot gallery: uploads from a signed-in account (the gallery page and the mod
// pages, with the session cookie) or from a linked app (the plugin, with a Bearer token
// carrying gallery:upload; src/account.js) go into a moderation queue; only shots the
// owner approved are ever listed or served. Nothing is accepted without an account.
//
//   POST gallery/api/upload        raw PNG or JPEG body (<= 8 MiB), ?credit= and ?mod= optional
//   POST vote/api/gallery/upload   the same handler, where the session cookie reaches (the gallery page)
//   POST vote/api/shots/upload?mod= the same, from a minisite: the mod is required
//   GET  gallery/api/shots[?mod=]  the approved shots, newest first (cached 60 s)
//   GET  gallery/img/<id>          an approved image;  gallery/thumb/<id> its thumbnail
//   GET  vote/api/admin/gallery    the queue and recent decisions      (ADMIN_ACCOUNTS)
//   GET  vote/api/admin/gallery/image?id=[&thumb=1]  any shot, for review
//   POST vote/api/admin/gallery/review  {id, action: approve|approve_anon|reject|remove}
//   POST vote/api/admin/gallery/thumb?id=  a JPEG thumbnail made in the owner's browser
//
// Images live in a key-value store: an R2 bucket bound as GALLERY_R2 when there is one,
// else a KV namespace bound as GALLERY_KV (both free-tier). Metadata is stripped before
// anything is stored (image.js). The uploader's IP address is never stored: a keyed
// digest of it counts uploads for the limits, and review clears it from the shot.
import { isAdmin, readSession } from './session.js';
import { signInRequired } from './auth.js';
import { authorize } from './account.js';
import { GALLERY_BASE, PRIVATE, cleanText, isSameOrigin, isShotId, json, randomToken, readJsonBody, sha256hex } from './lib.js';
import { inspectImage } from './image.js';
import { MOD_IDS, isModId } from './clients.js';

export const GALLERY = Object.freeze({
  maxBytes: 8 * 1024 * 1024,
  thumbMaxBytes: 600 * 1024,
  thumbMaxSide: 1280,
  credit: 60,
  perAddressPerHour: 6,
  perAddressPerDay: 20,
  perAccountPerHour: 6,
  perAccountPerDay: 20,
  perDay: 200,          // every uploader together; KV's free tier allows 1,000 writes a day
  pendingMax: 300,      // the queue refuses more until the owner catches up
  listMax: 500,
  listTtlSeconds: 60,
  hourMs: 60 * 60 * 1000,
  dayMs: 24 * 60 * 60 * 1000,
});

const ACTIONS = Object.freeze(['approve', 'approve_anon', 'reject', 'remove']);

// ---- storage ---------------------------------------------------------------------------
export function galleryStore(env) {
  if (env.GALLERY_R2) {
    const b = env.GALLERY_R2;
    return {
      put: (key, bytes, type) => b.put(key, bytes, { httpMetadata: { contentType: type } }),
      get: async (key) => { const o = await b.get(key); return o ? o.body : null; },
      delete: (key) => b.delete(key),
    };
  }
  if (env.GALLERY_KV) {
    const kv = env.GALLERY_KV;
    return {
      put: (key, bytes) => kv.put(key, bytes),
      get: (key) => kv.get(key, { type: 'stream' }),
      delete: (key) => kv.delete(key),
    };
  }
  return null;
}

const shotKey = (id) => 'shots/' + id;
const thumbKey = (id) => 'thumbs/' + id;

// ---- helpers ---------------------------------------------------------------------------
const fail = (status, error, message, headers = {}) => json({ ok: false, error, message }, { status, headers });

async function readBytes(request, max) {
  const declared = Number(request.headers.get('content-length'));
  if (declared > max) return null;
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) { await reader.cancel().catch(() => {}); return null; }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.byteLength; }
  return out;
}

async function digestHex(bytes) {
  const d = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// A digest of the address keyed with a server secret: counts uploads without keeping the IP.
const uploaderKey = (env, ip) => sha256hex('ghostty-gallery:' + (env.GALLERY_SECRET || env.SESSION_SECRET || '') + ':' + ip);

export function cleanCredit(raw) {
  if (raw === null || raw === undefined) return '';
  const c = cleanText(String(raw));
  return c ? c.slice(0, GALLERY.credit) : '';
}

const listKey = (url, mod) => new Request(url.origin + GALLERY_BASE + '/api/shots' + (mod ? '?mod=' + mod : ''));

// ---- POST gallery/api/upload -------------------------------------------------------------
// POST vote/api/shots/upload?mod=<id>[&credit=]: the minisites' "Add yours". The same gate
// and the same moderation queue as every other upload; only here the mod is required.
export async function postMemberUpload(request, env, url) {
  if (!isModId(url.searchParams.get('mod'))) return fail(400, 'bad_mod', 'mod must be one of: ' + MOD_IDS.join(', ') + '.', PRIVATE);
  return postUpload(request, env, url);
}

export async function postUpload(request, env, url) {
  if (!isSameOrigin(request, url)) return fail(403, 'forbidden', 'Cross-site request refused.');
  const auth = await authorize(request, env, url, 'gallery:upload');
  if (!auth.ok) return auth.response;
  const { p: provider, k: account } = auth.account;
  const rawMod = url.searchParams.get('mod');
  if (rawMod !== null && !isModId(rawMod)) return fail(400, 'bad_mod', 'mod is not one of the mods published here.');
  const store = galleryStore(env);
  if (!store) return fail(503, 'gallery_closed', 'The gallery is not taking uploads right now.');
  const now = Date.now();
  const uploader = await uploaderKey(env, request.headers.get('cf-connecting-ip') || '');
  // one read before the body: a refused upload costs no storage and no write
  const pre = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM upload_log WHERE uploader = ?1 AND at > ?2) AS hour,
       (SELECT COUNT(*) FROM upload_log WHERE uploader = ?1 AND at > ?3) AS day,
       (SELECT COUNT(*) FROM upload_log WHERE account = ?4 AND at > ?2) AS acct_hour,
       (SELECT COUNT(*) FROM upload_log WHERE account = ?4 AND at > ?3) AS acct_day,
       (SELECT COUNT(*) FROM upload_log WHERE at > ?3) AS site,
       (SELECT COUNT(*) FROM shots WHERE status = 'pending') AS pending`,
  ).bind(uploader, now - GALLERY.hourMs, now - GALLERY.dayMs, account).first();
  if (pre.hour >= GALLERY.perAddressPerHour || pre.day >= GALLERY.perAddressPerDay
    || pre.acct_hour >= GALLERY.perAccountPerHour || pre.acct_day >= GALLERY.perAccountPerDay) {
    return fail(429, 'rate_limited', 'That is a lot of screenshots at once; try again later.', { 'retry-after': '3600' });
  }
  if (pre.site >= GALLERY.perDay || pre.pending >= GALLERY.pendingMax) {
    return fail(429, 'gallery_full', 'The gallery is full for today; try again tomorrow.', { 'retry-after': '3600' });
  }
  const body = await readBytes(request, GALLERY.maxBytes);
  if (!body) return fail(413, 'too_large', 'Screenshots can be at most 8 MB.');
  if (body.length === 0) return fail(400, 'empty', 'Send the image as the request body.');
  const img = inspectImage(body);
  if (!img.ok) return fail(415, img.error, img.message);

  const digest = await digestHex(img.bytes);
  const dup = await env.DB.prepare("SELECT id, status FROM shots WHERE digest = ? AND status <> 'removed'").bind(digest).first();
  if (dup) {
    return json({ ok: true, id: dup.id, status: dup.status, duplicate: true, message: 'This screenshot was already shared. Thank you!' });
  }

  const id = randomToken(16);
  const credit = cleanCredit(url.searchParams.get('credit'));
  const source = auth.via === 'token' ? 'plugin' : 'web';
  await store.put(shotKey(id), img.bytes, img.type);
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO shots (id, status, content_type, bytes, width, height, digest, credit, source, uploader, created_at,
           provider, account, token_id, mod)
         VALUES (?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(id, img.type, img.bytes.length, img.width, img.height, digest, credit, source, uploader, now,
        provider, account, auth.tokenId, rawMod),
      env.DB.prepare('INSERT INTO upload_log (uploader, at, account) VALUES (?, ?, ?)').bind(uploader, now, account),
      env.DB.prepare('DELETE FROM upload_log WHERE at <= ?').bind(now - GALLERY.dayMs),
    ]);
  } catch (err) {
    await store.delete(shotKey(id)).catch(() => {});
    throw err;
  }
  return json({ ok: true, id, status: 'pending', message: 'Thanks! It shows in the gallery once it is reviewed.' }, { status: 201 });
}

// ---- GET gallery/api/shots ---------------------------------------------------------------
export async function getShots(env, ctx, url, cache) {
  // ?mod=<id>: one minisite's shots. Anything else is the whole gallery.
  const asked = url.searchParams.get('mod');
  const mod = isModId(asked) ? asked : null;
  const key = listKey(url, mod);
  if (cache) {
    const hit = await cache.match(key);
    if (hit) return hit;
  }
  const { results } = await env.DB.prepare(
    `SELECT id, width, height, credit, has_thumb, reviewed_at, mod FROM shots
     WHERE status = 'approved' AND (?1 IS NULL OR mod = ?1) ORDER BY reviewed_at DESC, id LIMIT ?2`,
  ).bind(mod, GALLERY.listMax).all();
  const shots = results.map((r) => ({
    id: r.id,
    src: GALLERY_BASE + '/img/' + r.id,
    thumb: r.has_thumb ? GALLERY_BASE + '/thumb/' + r.id : null,
    width: r.width,
    height: r.height,
    credit: r.credit,
    mod: r.mod || null,
    approved_at: r.reviewed_at,
  }));
  const res = json({ shots }, {
    headers: { 'cache-control': `public, max-age=${GALLERY.listTtlSeconds}`, 'access-control-allow-origin': '*' },
  });
  if (cache) {
    const put = cache.put(key, res.clone());
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(put);
    else await put;
  }
  return res;
}

// ---- images ------------------------------------------------------------------------------
const IMAGE_HEADERS = Object.freeze({
  'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'none'; sandbox",
  'cross-origin-resource-policy': 'same-origin',
});

// Any shot, whatever its status (the admin review); the caller decides who may see it.
async function storedImage(env, id, thumb) {
  const row = await env.DB.prepare('SELECT status, content_type, has_thumb FROM shots WHERE id = ?').bind(id).first();
  const store = galleryStore(env);
  const body = row && store && (!thumb || row.has_thumb) ? await store.get(thumb ? thumbKey(id) : shotKey(id)) : null;
  return { row, body };
}

function imageResponse(body, type, cacheControl, extra = {}) {
  return new Response(body, { headers: { 'content-type': type, 'cache-control': cacheControl, ...IMAGE_HEADERS, ...extra } });
}

const notFound = () => new Response('Not found\n', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });

// GET gallery/img/<id> and gallery/thumb/<id>: approved shots only.
export async function getPublicImage(env, id, thumb) {
  if (!galleryStore(env)) return notFound();
  const row = await env.DB.prepare("SELECT content_type, has_thumb FROM shots WHERE id = ? AND status = 'approved'").bind(id).first();
  if (!row || (thumb && !row.has_thumb)) return notFound();
  const body = await galleryStore(env).get(thumb ? thumbKey(id) : shotKey(id));
  if (!body) return notFound();
  return imageResponse(body, thumb ? 'image/jpeg' : row.content_type, 'public, max-age=86400');
}

// ---- admin -------------------------------------------------------------------------------
const refused = () => json({ error: 'forbidden', message: 'Cross-site request refused.' }, { status: 403, headers: PRIVATE });

async function adminGate(request, env, url) {
  if (!isSameOrigin(request, url)) return refused();
  const session = await readSession(request, env);
  if (!session) return signInRequired(PRIVATE);
  if (!(await isAdmin(env, session))) {
    return json({ error: 'forbidden', message: 'Only the site owner can see this.' }, { status: 403, headers: PRIVATE });
  }
  return null;
}

// GET api/admin/gallery -> {pending: [...], reviewed: [... newest 100], store}
export async function getAdminGallery(request, env, url) {
  const gate = await adminGate(request, env, url);
  if (gate) return gate;
  const cols = 'id, status, content_type, bytes, width, height, credit, source, uploader, has_thumb, created_at, reviewed_at, provider, account, mod';
  const [pending, reviewed] = await env.DB.batch([
    env.DB.prepare(`SELECT ${cols} FROM shots WHERE status = 'pending' ORDER BY created_at, id`),
    env.DB.prepare(`SELECT ${cols} FROM shots WHERE status <> 'pending' ORDER BY reviewed_at DESC, id LIMIT 100`),
  ]);
  // provider '' and account '': a shot from before uploads needed an account (legacy).
  const shape = (r) => ({ ...r, uploader: r.uploader ? r.uploader.slice(0, 8) : '', legacy: !r.account });
  return json({
    generated_at: Date.now(),
    store: env.GALLERY_R2 ? 'r2' : env.GALLERY_KV ? 'kv' : 'none',
    pending: pending.results.map(shape),
    reviewed: reviewed.results.map(shape),
  }, { headers: PRIVATE });
}

// GET api/admin/gallery/image?id=...[&thumb=1] -> the stored image, whatever its status.
export async function getAdminImage(request, env, url) {
  const gate = await adminGate(request, env, url);
  if (gate) return gate;
  const id = url.searchParams.get('id');
  const thumb = url.searchParams.get('thumb') === '1';
  if (!isShotId(id)) return fail(400, 'bad_id', 'id is missing or malformed.', PRIVATE);
  const { row, body } = await storedImage(env, id, thumb);
  if (!row) return fail(404, 'unknown_shot', 'No such shot.', PRIVATE);
  // KV is eventually consistent: a fresh upload can take up to a minute to reach every location
  if (!body) return fail(404, 'not_stored', 'The image is not in the store (yet); try again in a minute.', PRIVATE);
  return imageResponse(body, thumb ? 'image/jpeg' : row.content_type, 'private, no-store', { vary: 'Cookie' });
}

// POST api/admin/gallery/review {id, action}
export async function postAdminReview(request, env, url, cache) {
  const gate = await adminGate(request, env, url);
  if (gate) return gate;
  const body = await readJsonBody(request);
  if (!body.ok) return fail(body.status, body.error, body.message, PRIVATE);
  const { id, action } = body.value;
  if (!isShotId(id)) return fail(400, 'bad_id', 'id is missing or malformed.', PRIVATE);
  if (!ACTIONS.includes(action)) return fail(400, 'bad_action', 'action must be approve, approve_anon, reject or remove.', PRIVATE);
  const row = await env.DB.prepare('SELECT status FROM shots WHERE id = ?').bind(id).first();
  if (!row) return fail(404, 'unknown_shot', 'No such shot.', PRIVATE);
  const now = Date.now();
  let status;
  if (action === 'approve' || action === 'approve_anon') {
    if (row.status !== 'pending' && row.status !== 'approved') return fail(409, 'gone', 'This shot was rejected or removed; its image is gone.', PRIVATE);
    status = 'approved';
    await env.DB.prepare(
      `UPDATE shots SET status = 'approved', uploader = '', reviewed_at = ?, credit = CASE WHEN ? THEN '' ELSE credit END WHERE id = ?`,
    ).bind(now, action === 'approve_anon' ? 1 : 0, id).run();
  } else {
    status = action === 'reject' ? 'rejected' : 'removed';
    const store = galleryStore(env);
    if (store) await Promise.all([store.delete(shotKey(id)), store.delete(thumbKey(id))]);
    await env.DB.prepare("UPDATE shots SET status = ?, uploader = '', has_thumb = 0, reviewed_at = ? WHERE id = ?").bind(status, now, id).run();
  }
  if (cache && cache.delete) await Promise.all([null, ...MOD_IDS].map((m) => cache.delete(listKey(url, m))));
  return json({ ok: true, id, status }, { headers: PRIVATE });
}

// POST api/admin/gallery/thumb?id=... with a JPEG body: the list's small copy.
export async function postAdminThumb(request, env, url) {
  const gate = await adminGate(request, env, url);
  if (gate) return gate;
  const id = url.searchParams.get('id');
  if (!isShotId(id)) return fail(400, 'bad_id', 'id is missing or malformed.', PRIVATE);
  const bytes = await readBytes(request, GALLERY.thumbMaxBytes);
  if (!bytes) return fail(413, 'too_large', 'The thumbnail is too large.', PRIVATE);
  const img = inspectImage(bytes, { minSide: 16, maxSide: GALLERY.thumbMaxSide });
  if (!img.ok || img.type !== 'image/jpeg') return fail(415, 'bad_image', 'The thumbnail must be a JPEG.', PRIVATE);
  const row = await env.DB.prepare('SELECT status FROM shots WHERE id = ?').bind(id).first();
  if (!row || (row.status !== 'pending' && row.status !== 'approved')) return fail(404, 'unknown_shot', 'No such shot.', PRIVATE);
  await galleryStore(env).put(thumbKey(id), img.bytes, 'image/jpeg');
  await env.DB.prepare('UPDATE shots SET has_thumb = 1 WHERE id = ?').bind(id).run();
  return json({ ok: true, id }, { headers: PRIVATE });
}
