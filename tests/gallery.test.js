// The screenshot gallery: metadata stripping, the upload and its limits, the moderation
// queue, and that nothing unreviewed is ever listed or served.
import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../src/app.js';
import { inspectImage } from '../src/image.js';
import { GALLERY_BASE, route } from '../src/lib.js';
import { API, ORIGIN, memoryKV, setup } from './harness.js';
import { bytes, chunk, jpeg, png } from './fixtures.js';

const G = GALLERY_BASE + '/';

const has = (hay, needle) => Buffer.from(hay).includes(Buffer.from(needle));

test('inspectImage: PNG keeps its pixels and drops text, EXIF and time chunks', () => {
  const r = inspectImage(png(1920, 1080));
  assert.equal(r.ok, true);
  assert.deepEqual([r.type, r.width, r.height], ['image/png', 1920, 1080]);
  for (const gone of ['tEXt', 'eXIf', 'tIME', 'taken at home', 'GPS']) assert.ok(!has(r.bytes, gone), gone);
  for (const kept of ['IHDR', 'IDAT', 'IEND']) assert.ok(has(r.bytes, kept), kept);
  const withSrgb = inspectImage(png(64, 64, { extra: [chunk('sRGB', bytes(0))] }));
  assert.ok(has(withSrgb.bytes, 'sRGB'), 'colour chunks stay');
});

test('inspectImage: JPEG drops EXIF, XMP and comments, keeps JFIF, ICC and the scan', () => {
  const src = jpeg(2560, 1440);
  const r = inspectImage(src);
  assert.equal(r.ok, true);
  assert.deepEqual([r.type, r.width, r.height], ['image/jpeg', 2560, 1440]);
  for (const gone of ['Exif', 'GPS', 'xmpmeta', 'private comment']) assert.ok(!has(r.bytes, gone), gone);
  for (const kept of ['JFIF', 'ICC_PROFILE']) assert.ok(has(r.bytes, kept), kept);
  assert.deepEqual([...r.bytes.slice(-8)], [...src.slice(-8)], 'the entropy-coded data is untouched');
  assert.deepEqual([...r.bytes.slice(0, 2)], [0xff, 0xd8]);
});

test('inspectImage: refuses other formats, damage and silly sizes', () => {
  assert.equal(inspectImage(bytes('GIF89a....')).error, 'bad_type');
  assert.equal(inspectImage(bytes('BM', new Array(60).fill(0))).error, 'bad_type', 'BMP (the game can save those) is refused');
  assert.equal(inspectImage(bytes('<svg></svg>')).error, 'bad_type');
  assert.equal(inspectImage(png().slice(0, 40)).ok, false, 'cut short');
  assert.equal(inspectImage(jpeg().slice(0, 30)).ok, false, 'cut short');
  assert.equal(inspectImage(png(10, 10)).ok, false, 'too small');
  assert.equal(inspectImage(png(40000, 100)).ok, false, 'too large');
  const noScanHeader = bytes(0xff, 0xd8, 0xff, 0xda, 0, 4, 0, 0, 0xff, 0xd9);
  assert.equal(inspectImage(noScanHeader).ok, false, 'a scan before any frame header');
});

test('route: the gallery paths, and nothing else under the gallery', () => {
  assert.deepEqual(route(G + 'api/upload'), { kind: 'api', name: 'gallery/upload', method: 'POST' });
  assert.deepEqual(route(G + 'api/shots'), { kind: 'api', name: 'gallery/shots', method: 'GET' });
  const id = 'A'.repeat(22);
  assert.deepEqual(route(G + 'img/' + id), { kind: 'api', name: 'gallery/img', method: 'GET', id });
  assert.deepEqual(route(G + 'thumb/' + id), { kind: 'api', name: 'gallery/thumb', method: 'GET', id });
  for (const p of [G + 'img/short', G + 'img/' + id + '/x', G + 'img/../api/upload', G + 'api/', G + 'index.html', GALLERY_BASE]) {
    assert.equal(route(p).kind, 'none', p);
  }
});

// ---- the API -------------------------------------------------------------------------------
function gallerySetup(extra = {}) {
  const t = setup({ GALLERY_KV: memoryKV(), ...extra });
  const raw = async (path, { method = 'GET', body, headers = {}, cookie } = {}) => {
    const res = await handle(new Request(ORIGIN + path, {
      method, body, headers: { ...(cookie ? { cookie } : {}), ...headers },
    }), t.env, { waitUntil() {} }, t.cache);
    return res;
  };
  // The plugin: a linked-app token. One account per address unless `as` names another,
  // so the per-address tests read as they always did.
  const upload = (img, { ip = '203.0.113.7', credit, headers = {}, as = 'ip-' + ip } = {}) => raw(G + 'api/upload' + (credit !== undefined ? '?credit=' + encodeURIComponent(credit) : ''), {
    method: 'POST', body: img, headers: { 'content-type': 'image/png', 'cf-connecting-ip': ip, 'x-ghostty-client': 'test', ...t.linked('ghostty', { provider: 'xivauth', id: as }).header, ...headers },
  });
  return { ...t, raw, upload };
}

test('upload -> queue -> approve: only approved shots are listed and served', async () => {
  const t = gallerySetup();
  const owner = await t.signedIn('github', '251370');
  const stranger = await t.signedIn('github', '42');

  let res = await t.upload(png(1280, 720), { credit: '  Wyn\u202e Ghostty @ Gilgamesh ' });
  assert.equal(res.status, 201);
  const up = await res.json();
  assert.equal(up.status, 'pending');
  assert.match(up.id, /^[A-Za-z0-9_-]{22}$/);
  assert.ok(JSON.stringify(up).length < 250, 'short enough for the plugin to relay whole');
  const stored = t.env.GALLERY_KV.store.get('shots/' + up.id);
  assert.ok(stored && !has(stored, 'eXIf'), 'stored without metadata');
  const row = t.env.DB.raw.prepare('SELECT * FROM shots').get();
  assert.equal(row.credit, 'Wyn Ghostty @ Gilgamesh', 'credit cleaned (no bidi override, trimmed)');
  assert.equal(row.source, 'plugin');
  assert.match(row.uploader, /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(t.env.DB.raw.prepare('SELECT * FROM upload_log').all()).includes('203.0.113.7'), 'no IP stored');

  // pending: invisible to the public
  assert.deepEqual((await (await t.raw(G + 'api/shots')).json()).shots, []);
  assert.equal((await t.raw(G + 'img/' + up.id)).status, 404);
  assert.equal((await t.raw(G + 'thumb/' + up.id)).status, 404);

  // the owner's queue; nobody else's
  assert.equal((await t.raw(API + 'admin/gallery')).status, 401);
  assert.equal((await t.raw(API + 'admin/gallery', { cookie: stranger })).status, 403);
  assert.equal((await t.raw(API + 'admin/gallery/image?id=' + up.id, { cookie: stranger })).status, 403);
  res = await t.raw(API + 'admin/gallery', { cookie: owner });
  assert.equal(res.headers.get('cache-control'), 'private, no-store');
  const q = await res.json();
  assert.equal(q.store, 'kv');
  assert.equal(q.pending.length, 1);
  assert.equal(q.pending[0].uploader.length, 8, 'only a prefix of the digest');
  res = await t.raw(API + 'admin/gallery/image?id=' + up.id, { cookie: owner });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.deepEqual(new Uint8Array(await res.arrayBuffer()), stored);

  // a stranger cannot review; the owner can
  const review = (cookie, body, headers = {}) => t.raw(API + 'admin/gallery/review', {
    method: 'POST', cookie, body: JSON.stringify(body), headers: { 'content-type': 'application/json', origin: ORIGIN, ...headers },
  });
  assert.equal((await review(stranger, { id: up.id, action: 'approve' })).status, 403);
  assert.equal((await review(owner, { id: up.id, action: 'approve' }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await review(owner, { id: up.id, action: 'publish' })).status, 400);

  // thumbnail (made in the owner's browser), then approve
  const thumbPost = (cookie, body, type = 'image/jpeg') => t.raw(API + 'admin/gallery/thumb?id=' + up.id, {
    method: 'POST', cookie, body, headers: { 'content-type': type, origin: ORIGIN },
  });
  assert.equal((await thumbPost(stranger, jpeg(640, 360))).status, 403);
  assert.equal((await thumbPost(owner, png(640, 360))).status, 415, 'thumbnails are JPEG');
  assert.equal((await thumbPost(owner, jpeg(640, 360))).status, 200);

  res = await review(owner, { id: up.id, action: 'approve' });
  assert.deepEqual(await res.json(), { ok: true, id: up.id, status: 'approved' });
  assert.equal(t.env.DB.raw.prepare('SELECT uploader FROM shots').get().uploader, '', 'review forgets the uploader digest');

  const list = (await (await t.raw(G + 'api/shots')).json()).shots;
  assert.equal(list.length, 1);
  assert.deepEqual(Object.keys(list[0]).sort(), ['approved_at', 'credit', 'height', 'id', 'mod', 'src', 'thumb', 'width']);
  assert.equal(list[0].src, G + 'img/' + up.id);
  assert.equal(list[0].thumb, G + 'thumb/' + up.id);
  res = await t.raw(list[0].src);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.match(res.headers.get('content-security-policy'), /sandbox/);
  res = await t.raw(list[0].thumb);
  assert.equal(res.headers.get('content-type'), 'image/jpeg');

  // remove: gone from the list, the image and the store
  res = await review(owner, { id: up.id, action: 'remove' });
  assert.equal((await res.json()).status, 'removed');
  assert.deepEqual((await (await t.raw(G + 'api/shots')).json()).shots, []);
  assert.equal((await t.raw(G + 'img/' + up.id)).status, 404);
  assert.equal(t.env.GALLERY_KV.store.size, 0, 'image and thumbnail deleted');
  assert.equal((await review(owner, { id: up.id, action: 'approve' })).status, 409, 'a removed shot cannot come back');
});

test('reject deletes the image; approve_anon drops the credit', async () => {
  const t = gallerySetup();
  const owner = await t.signedIn('github', '251370');
  const review = (body) => t.raw(API + 'admin/gallery/review', {
    method: 'POST', cookie: owner, body: JSON.stringify(body), headers: { 'content-type': 'application/json', origin: ORIGIN },
  });
  const a = await (await t.upload(png(640, 360, { seed: 1 }), { credit: 'rude name' })).json();
  const b = await (await t.upload(jpeg(640, 360, 2), { credit: 'Kind Soul', headers: { 'content-type': 'image/jpeg' } })).json();
  assert.equal((await review({ id: a.id, action: 'reject' })).status, 200);
  assert.ok(!t.env.GALLERY_KV.store.has('shots/' + a.id));
  assert.equal((await t.raw(G + 'img/' + a.id)).status, 404);
  assert.equal((await review({ id: b.id, action: 'approve_anon' })).status, 200);
  const shots = (await (await t.raw(G + 'api/shots')).json()).shots;
  assert.equal(shots.length, 1);
  assert.equal(shots[0].credit, '');
  assert.equal(shots[0].thumb, null, 'no thumbnail: the page shows the image itself');
  const res = await t.raw(shots[0].src);
  assert.equal(res.headers.get('content-type'), 'image/jpeg');
});

test('upload limits: size, type, duplicates, cross-site, per address and the whole site', async () => {
  const t = gallerySetup();
  let res = await t.upload(png(), { headers: { 'content-length': String(9 * 1024 * 1024) } });
  assert.equal(res.status, 413);
  res = await t.upload(new Uint8Array(8 * 1024 * 1024 + 1));
  assert.equal(res.status, 413, 'a body over 8 MiB without a length is cut off too');
  res = await t.upload(bytes('BM', new Array(100).fill(0)));
  assert.equal(res.status, 415);
  assert.match((await res.json()).message, /PNG and JPEG/);
  res = await t.upload(png(), { headers: { origin: 'https://evil.example' } });
  assert.equal(res.status, 403);
  assert.equal(t.env.GALLERY_KV.store.size, 0, 'nothing stored for a refused upload');

  const first = await (await t.upload(png(640, 360, { seed: 100 }))).json();
  res = await t.upload(png(640, 360, { seed: 100 }), { ip: '198.51.100.1' });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, id: first.id, status: 'pending', duplicate: true, message: 'This screenshot was already shared. Thank you!' });

  // six an hour from one address (the first is above)
  for (let i = 1; i < 6; i++) assert.equal((await t.upload(png(640, 360, { seed: 200 + i }))).status, 201);
  res = await t.upload(png(640, 360, { seed: 300 }));
  assert.equal(res.status, 429);
  assert.equal(res.headers.get('retry-after'), '3600');
  assert.equal((await t.upload(png(640, 360, { seed: 301 }), { ip: '198.51.100.2' })).status, 201, 'another address is unaffected');

  // the queue cap
  t.env.DB.raw.exec(`WITH RECURSIVE n(v) AS (SELECT 1 UNION ALL SELECT v + 1 FROM n WHERE v < 300)
    INSERT INTO shots (id, content_type, bytes, width, height, digest, created_at)
    SELECT printf('%022d', v), 'image/png', 1, 64, 64, printf('d%d', v), 1 FROM n`);
  res = await t.upload(png(640, 360, { seed: 400 }), { ip: '198.51.100.3' });
  assert.equal(res.status, 429);
  assert.equal((await res.json()).error, 'gallery_full');
});

test('upload without a store configured answers 503; the web page upload is marked web', async () => {
  const closed = gallerySetup({ GALLERY_KV: undefined });
  assert.equal((await closed.upload(png())).status, 503);
  const t = gallerySetup();
  const res = await t.raw(API + 'gallery/upload', { method: 'POST', body: png(), cookie: await t.signedIn(), headers: { 'content-type': 'image/png', origin: ORIGIN, 'sec-fetch-site': 'same-origin' } });
  assert.equal(res.status, 201);
  assert.equal(t.env.DB.raw.prepare('SELECT source FROM shots').get().source, 'web');
});

test('api/shots is cached and approving clears the cached list', async () => {
  const t = gallerySetup();
  const owner = await t.signedIn('github', '251370');
  assert.equal((await t.raw(G + 'api/shots')).headers.get('cache-control'), 'public, max-age=60');
  assert.equal(t.cache.store.size, 1);
  const up = await (await t.upload(png())).json();
  await t.raw(API + 'admin/gallery/review', {
    method: 'POST', cookie: owner, body: JSON.stringify({ id: up.id, action: 'approve' }), headers: { 'content-type': 'application/json', origin: ORIGIN },
  });
  assert.equal((await (await t.raw(G + 'api/shots')).json()).shots.length, 1);
});

test('minisite upload: refused without a session, tagged with its mod and account, moderated, and listed per mod', async () => {
  const t = gallerySetup();
  const U = API + 'shots/upload';
  const send = (query, opts = {}) => t.raw(U + query, { method: 'POST', body: png(800, 450, { seed: 7 }), headers: { 'content-type': 'image/png', 'cf-connecting-ip': '203.0.113.9', ...(opts.headers || {}) }, cookie: opts.cookie });
  // no session: nothing is read, nothing is stored
  let res = await send('?mod=xivmcp');
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error, 'sign_in_required');
  assert.equal(res.headers.get('cache-control'), 'private, no-store');
  assert.equal(t.env.GALLERY_KV.store.size, 0);
  const cookie = await t.signedIn('xivauth', '4242');
  assert.equal((await send('?mod=xivmcp', { cookie, headers: { origin: 'https://evil.example' } })).status, 403);
  for (const bad of ['', '?mod=', '?mod=nope', '?mod=XivMcp']) assert.equal((await send(bad, { cookie })).status, 400, bad);
  assert.equal(t.env.DB.raw.prepare('SELECT COUNT(*) AS n FROM shots').get().n, 0);
  assert.equal((await t.raw(U, { cookie })).status, 405);

  res = await send('?mod=xivmcp&credit=Tataru', { cookie });
  assert.equal(res.status, 201);
  const up = await res.json();
  const row = t.env.DB.raw.prepare('SELECT status, mod, provider, account, credit, source FROM shots WHERE id = ?').get(up.id);
  assert.deepEqual({ ...row }, { status: 'pending', mod: 'xivmcp', provider: 'xivauth', account: row.account, credit: 'Tataru', source: 'web' });
  assert.match(row.account, /^[0-9a-f]{64}$/);

  // pending: on no list and not served
  const list = async (q = '') => (await (await t.raw(G + 'api/shots' + q)).json()).shots;
  assert.deepEqual(await list('?mod=xivmcp'), []);
  assert.equal((await t.raw(G + 'img/' + up.id)).status, 404);
  const owner = await t.signedIn('github', '251370');
  const q = await (await t.raw(API + 'admin/gallery', { cookie: owner })).json();
  assert.equal(q.pending[0].mod, 'xivmcp');
  res = await t.raw(API + 'admin/gallery/review', { method: 'POST', cookie: owner, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: up.id, action: 'approve' }) });
  assert.equal(res.status, 200);
  // approval drops the cached per-mod list too
  assert.deepEqual((await list('?mod=xivmcp')).map((s) => [s.id, s.mod]), [[up.id, 'xivmcp']]);
  assert.deepEqual(await list('?mod=almanac'), []);
  assert.deepEqual((await list()).map((s) => s.id), [up.id], 'the whole gallery still lists it');
  assert.deepEqual((await list('?mod=nope')).map((s) => s.id), [up.id], 'an unknown mod is the whole gallery, never an SQL fragment');
  assert.equal((await t.raw(G + 'img/' + up.id)).status, 200);
});
