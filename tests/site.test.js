// site.js against a small fake DOM: media slots render from the manifest (placeholder when
// a slot has no files, lazy images with srcset when it has), and only bare file names
// beside the manifest are ever used; the upload form shows only with a session.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/mods/ffxiv/site/site.js', import.meta.url), 'utf8');

function node(tag) {
  return {
    tag, attrs: {}, kids: [], hidden: false, textContent: '', className: '', listeners: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    append(...k) { this.kids.push(...k); },
    replaceChildren(...k) { this.kids = k; },
    addEventListener(t, f) { this.listeners[t] = f; },
    find(pred, out = []) { for (const k of this.kids) if (k && typeof k === 'object') { if (pred(k)) out.push(k); k.find(pred, out); } return out; },
    text() { return this.textContent + this.kids.map((k) => (typeof k === 'string' ? k : k.text())).join(''); },
  };
}

async function run({ mod, media, manifest, me, shots }) {
  const ids = {};
  for (const id of ['theme', 'copy', 'repo-url', 'media', 'video', 'shots', 'upload', 'signed-out', 'signed-in', 'signout', 'account-note', 'community']) ids[id] = node('div');
  ids['signed-in'].hidden = true;
  const calls = [];
  const fetch = async (url, init) => {
    calls.push([url, init]);
    const body = url === media ? manifest : url.includes('auth/me') ? me : url.includes('api/shots') ? shots : null;
    return { ok: body !== null, status: body === null ? 404 : 200, json: async () => body };
  };
  const document = {
    readyState: 'complete', documentElement: { dataset: {} }, body: { dataset: { mod, media, name: 'Ghostty' } },
    createElement: node, querySelector: (s) => ids[s.slice(1)] || null, addEventListener() {},
  };
  const window = { localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, location: { hash: '', pathname: '/' }, navigator: {}, history: {}, setTimeout };
  vm.runInNewContext(source, { window, document, fetch, URL, Number, Object, Array, Date, String, Math, Error, encodeURIComponent });
  await new Promise((r) => setTimeout(r, 20));
  return { ids, calls };
}

const MEDIA = '/mods/ffxiv/term/media/manifest.json';

test('slots: a placeholder without files; lazy, sized images with srcset and a preload=none video with them', async () => {
  const manifest = { version: 1, mod: 'ghostty', slots: [
    { id: 'a', title: 'Empty', kind: 'gif', caption: 'c', files: [] },
    { id: 'b', title: 'Full', kind: 'screenshot', caption: 'c', files: [
      { type: 'image', src: 'b.webp', width: 1920, height: 1080, alt: 'Alt text', sizes: [{ src: 'b-640.webp', w: 640 }] },
      { type: 'video', src: 'b.mp4', poster: 'b-poster.webp', width: 960, height: 540, loop: true },
      { type: 'image', src: 'https://evil.example/x.png', width: 1, height: 1, alt: 'x' },
      { type: 'image', src: '../vote/x.png', width: 1, height: 1, alt: 'x' },
    ] },
  ], video: { title: 'Tour', length: '75 s', cuts: [{ t: '0-8 s', note: 'Open' }], file: null } };
  const { ids } = await run({ mod: 'ghostty', media: MEDIA, manifest, me: { signed_in: false }, shots: { shots: [] } });
  const figs = ids.media.find((n) => n.tag === 'figure');
  assert.equal(figs.length, 2);
  assert.match(figs[0].text(), /Not captured yet/);
  assert.equal(figs[0].find((n) => n.tag === 'img').length, 0);
  const imgs = figs[1].find((n) => n.tag === 'img');
  assert.equal(imgs.length, 1, 'the off-site and path-bearing names are dropped');
  assert.deepEqual(imgs[0].attrs, {
    src: '/mods/ffxiv/term/media/b.webp', alt: 'Alt text', width: '1920', height: '1080',
    srcset: '/mods/ffxiv/term/media/b-640.webp 640w, /mods/ffxiv/term/media/b.webp 1920w',
    sizes: '(min-width: 1100px) 520px, (min-width: 720px) 50vw, 100vw', loading: 'lazy', decoding: 'async',
  });
  const vids = figs[1].find((n) => n.tag === 'video');
  assert.equal(vids[0].attrs.preload, 'none');
  assert.equal(vids[0].attrs.poster, '/mods/ffxiv/term/media/b-poster.webp');
  assert.equal(vids[0].find((n) => n.tag === 'source')[0].attrs.src, '/mods/ffxiv/term/media/b.mp4');
  assert.match(ids.video.text(), /Not recorded yet/);
  assert.match(ids.video.text(), /0-8 sOpen/);
});

test('community: only this mod\'s approved shots; the upload form appears only with a session', async () => {
  const id = 'A'.repeat(22);
  const shots = { shots: [
    { id, mod: 'ghostty', src: '/mods/ffxiv/term/gallery/img/' + id, thumb: null, width: 1920, height: 1080, credit: 'Someone', approved_at: 1 },
    { id, mod: 'xivmcp', src: '/mods/ffxiv/term/gallery/img/' + id, width: 1, height: 1 },
    { id, mod: 'ghostty', src: 'https://evil.example/img', width: 1, height: 1 },
  ] };
  const out = await run({ mod: 'ghostty', media: MEDIA, manifest: { slots: [] }, me: { signed_in: false }, shots });
  assert.equal(out.ids.shots.find((n) => n.tag === 'img').length, 1);
  assert.ok(out.calls.some(([u]) => u === '/mods/ffxiv/term/gallery/api/shots?mod=ghostty'));
  assert.equal(out.ids['signed-in'].hidden, true);
  assert.equal(out.ids['signed-out'].hidden, false);
  const signedIn = await run({ mod: 'ghostty', media: MEDIA, manifest: { slots: [] }, me: { signed_in: true }, shots });
  assert.equal(signedIn.ids['signed-in'].hidden, false);
  assert.equal(signedIn.ids['signed-out'].hidden, true);
});
