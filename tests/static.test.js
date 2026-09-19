// The static site: generated JSON matches data/catalogue.json, the page needs no
// inline code, headers and wrangler config keep the Worker off static paths.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { buildSeedSql } from '../scripts/seed-lib.js';
import { BASE, PUBLIC_URL, STATIC_DIR, buildIdeas, buildOutputs, buildVersion } from '../scripts/static-lib.js';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const catalogue = () => JSON.parse(read('data/catalogue.json'));

function walk(dir, prefix = '') {
  return readdirSync(new URL(dir, root)).flatMap((name) => {
    const rel = prefix + name;
    return statSync(new URL(dir + name, root)).isDirectory() ? walk(dir + name + '/', rel + '/') : [rel];
  });
}

test('committed ideas.json, version.json and seed.sql match data/catalogue.json', () => {
  for (const [path, body] of Object.entries(buildOutputs(catalogue(), buildSeedSql))) {
    assert.equal(read(path), body, `${path} is stale; run node scripts/build.js`);
  }
});

test('ideas.json carries the catalogue and no tallies', () => {
  const cat = catalogue();
  const data = JSON.parse(read(STATIC_DIR + 'ideas.json'));
  assert.deepEqual(data, buildIdeas(cat));
  assert.equal(data.version, cat.version);
  assert.deepEqual(data.categories.map((c) => c.name), cat.categories.map((c) => c.name));
  const ids = cat.categories.flatMap((c) => c.ideas.map((i) => i.id));
  assert.deepEqual(data.ideas.map((i) => i.id), ids);
  assert.deepEqual(data.ideas.filter((i) => i.top_pick).map((i) => i.id).sort(), [...cat.top_picks].sort());
  for (const i of data.ideas) {
    assert.equal(i.tally, undefined);
    assert.equal(typeof i.in_world, 'boolean');
    assert.ok(i.added_version >= 1 && i.added_version <= cat.version);
  }
});

test('version.json lets a client count new ideas statically', () => {
  const cat = catalogue();
  const v = JSON.parse(read(STATIC_DIR + 'version.json'));
  const total = cat.categories.reduce((n, c) => n + c.ideas.length, 0);
  assert.deepEqual(v, buildVersion(cat));
  assert.equal(v.version, cat.version);
  assert.equal(v.ideas, total);
  assert.equal(Object.values(v.added).reduce((a, b) => a + b, 0), total);
  assert.equal(v.url, 'https://spacegho.st/mods/ffxiv/term/vote/');

  const next = structuredClone(cat);
  next.version = 3;
  next.categories[0].ideas.push({ id: 'later-idea', title: 'Later', wow: 1, added_version: 3 });
  const bumped = buildVersion(next);
  const newSince = (since) => Object.entries(bumped.added).reduce((n, [ver, c]) => n + (Number(ver) > since ? c : 0), 0);
  assert.equal(newSince(cat.version), 1);
  assert.equal(newSince(3), 0);
  assert.throws(() => buildVersion({ version: 1, categories: [] }), /invalid catalogue/);
});

test('public/ holds only the site, at its real URL paths', () => {
  assert.equal(BASE, '/mods/ffxiv/term/vote/');
  assert.equal(PUBLIC_URL, 'https://spacegho.st/mods/ffxiv/term/vote/');
  assert.deepEqual(walk('public/').sort(), [
    '_headers',
    'mods/ffxiv/almanac/almanac.css',
    'mods/ffxiv/almanac/almanac.js',
    'mods/ffxiv/almanac/index.html',
    'mods/ffxiv/almanac/schema/recommendations.v1.json',
    'mods/ffxiv/almanac/schema/results.v1.json',
    'mods/ffxiv/term/gallery/gallery.css',
    'mods/ffxiv/term/gallery/gallery.js',
    'mods/ffxiv/term/gallery/index.html',
    'mods/ffxiv/term/vote/admin/admin.js',
    'mods/ffxiv/term/vote/admin/index.html',
    'mods/ffxiv/term/vote/ballot.js',
    'mods/ffxiv/term/vote/ideas.json',
    'mods/ffxiv/term/vote/index.html',
    'mods/ffxiv/term/vote/version.json',
    'mods/ffxiv/term/vote/vote.css',
    'mods/ffxiv/term/vote/vote.js',
  ]);
});

test('page has no inline script, style or handlers, and renders data only through textContent', () => {
  const html = read(STATIC_DIR + 'index.html');
  const js = read(STATIC_DIR + 'vote.js');
  const ballot = read(STATIC_DIR + 'ballot.js');
  assert.ok(!/<script(?![^>]*\ssrc=)/i.test(html), 'every script is external');
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(scripts, ['/mods/ffxiv/term/vote/ballot.js', '/mods/ffxiv/term/vote/vote.js'], 'ballot.js loads before vote.js');
  assert.ok(!/<style/i.test(html), 'no style elements');
  assert.ok(!/\sstyle=/i.test(html), 'no style attributes');
  assert.ok(!/\son[a-z]+=/i.test(html), 'no inline event handlers');
  assert.ok(!/nonce/i.test(html));
  const files = walk('public/');
  for (const ref of html.matchAll(/(?:src|href)="(\/mods\/[^"]+)"/g)) {
    if (ref[1].startsWith('/mods/ffxiv/term/vote/api/')) continue; // Worker routes, not files
    const path = ref[1].slice(1) + (ref[1].endsWith('/') ? 'index.html' : '');
    assert.ok(files.includes(path), `${ref[1]} exists in public/`);
  }
  for (const sink of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function']) {
    assert.ok(!js.includes(sink), `vote.js must not use ${sink}`);
    assert.ok(!ballot.includes(sink), `ballot.js must not use ${sink}`);
  }
  assert.ok(!/document|window|fetch\(/.test(ballot.replace(/^\s*\/\/.*$/gm, '')), 'ballot.js stays free of the DOM and network');
  for (const endpoint of ['api/ideas', 'api/version']) assert.ok(!js.includes(endpoint), endpoint);
  assert.ok(js.includes("'ideas.json'") && js.includes("'api/tallies'") && js.includes("'api/mine'"));
  assert.ok(!/disabled: !vote/.test(js), 'the note box is never disabled');
  assert.ok(html.includes('Johnneylee Jack Rollins') && html.includes('https://github.com/Spaceghost'));
  // Sign-in: both buttons, the disclosure next to them, and the character controls.
  for (const id of ['signin-github', 'signin-xivauth', 'logout', 'link-character', 'forget-character']) assert.ok(html.includes(`id="${id}"`), id);
  assert.ok(html.includes('Signing in with FFXIV needs an XIVAuth account and shares no character. After signing in you can link one, which needs a character verified on XIVAuth.'));
  assert.ok(html.includes('Linking needs a character verified on XIVAuth, and shares the character you choose (name and world) with the site owner.'));
  // The link button is offered to any signed-in voter without a character, not only GitHub ones.
  assert.ok(js.includes("$('#link-character').hidden = !!c;") && !/me\.provider !== 'github'/.test(js));
  assert.ok(html.includes('href="/mods/ffxiv/term/vote/api/auth/github/start"') && html.includes('href="/mods/ffxiv/term/vote/api/auth/xivauth/start"'));
  assert.ok(!/No accounts/.test(html), 'the privacy note no longer says there are no accounts');
  // Voter keys are sha256('provider:id') of public ids: the page must not promise anonymity.
  assert.ok(html.includes('Your votes, notes and suggestions are linked to your GitHub or XIVAuth account id and are visible to the site owner.'));
  assert.ok(!/anonym|pseudonym|one-way/i.test(html), 'no anonymity claims on the page');
  for (const endpoint of ["'api/auth/me'", "'auth/logout'", "'auth/character/forget'"]) assert.ok(js.includes(endpoint), endpoint);
  assert.ok(!/createGate|gate\./.test(js + ballot), 'no first-write gate: a session exists before any write');
  assert.ok(/name="viewport"/.test(html) && /prefers-color-scheme: light/.test(read(STATIC_DIR + 'vote.css')));
  for (const f of ['index.html', 'vote.js', 'ballot.js', 'vote.css', 'admin/admin.js']) {
    if (f !== 'index.html') assert.ok(!/[^\t\n\x20-\x7e]/.test(read(STATIC_DIR + f)), `${f} is plain ASCII`);
  }
});

test('admin page: a static shell with no inline code and no data; the list comes only from the gated API', () => {
  const html = read(STATIC_DIR + 'admin/index.html');
  const js = read(STATIC_DIR + 'admin/admin.js');
  assert.ok(!/<script(?![^>]*\ssrc=)/i.test(html) && !/<style|\sstyle=|\son[a-z]+=|nonce/i.test(html));
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]), ['/mods/ffxiv/term/vote/admin/admin.js']);
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
  const files = walk('public/');
  for (const ref of html.matchAll(/(?:src|href)="(\/mods\/[^"]+)"/g)) {
    assert.ok(files.includes(ref[1].slice(1) + (ref[1].endsWith('/') ? 'index.html' : '')), ref[1]);
  }
  for (const sink of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function']) assert.ok(!js.includes(sink), sink);
  assert.ok(js.includes("'api/admin/voters'") && js.includes("'api/admin/gallery'") && js.includes("'api/admin/almanac'") && js.includes("cache: 'no-store'"));
  assert.ok(!/[0-9a-f]{64}|lodestone_id":|"voters":/.test(html), 'no voter data in the HTML');
});

test('_headers sets a strict CSP for the static files', () => {
  const headers = read('public/_headers');
  const block = headers.split(/\n(?=\/)/).find((b) => b.startsWith('/mods/ffxiv/term/vote/*\n'));
  assert.ok(block, 'rule for /mods/ffxiv/term/vote/*');
  const csp = block.match(/^\s+Content-Security-Policy: (.+)$/m)[1].split(';').map((d) => d.trim());
  for (const d of [
    "default-src 'none'", "script-src 'self'", "style-src 'self' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com', "connect-src 'self'", "frame-ancestors 'none'", "base-uri 'none'",
    "img-src 'self' data: https://*.finalfantasyxiv.com",
  ]) assert.ok(csp.includes(d), d);
  const admin = headers.split(/\n(?=\/)/).find((b) => b.startsWith('/mods/ffxiv/term/vote/admin/*\n'));
  assert.match(admin, /X-Robots-Tag: noindex/);
  assert.ok(!/unsafe-inline|nonce-/.test(block));
  assert.match(block, /X-Content-Type-Options: nosniff/);
  assert.match(block, /Referrer-Policy: no-referrer/);
});

test('wrangler.toml serves assets first and runs the Worker only for the API', () => {
  const toml = read('wrangler.toml');
  const assets = toml.slice(toml.indexOf('[assets]'), toml.indexOf('[[d1_databases]]'));
  assert.match(assets, /^directory = "public"$/m);
  assert.equal(assets.match(/^run_worker_first = (.+)$/m)[1],
    '["/mods/ffxiv/term/vote/api/*", "/mods/ffxiv/term/gallery/api/*", "/mods/ffxiv/term/gallery/img/*", "/mods/ffxiv/term/gallery/thumb/*", "/mods/ffxiv/almanac/api/*", "/mods/ffxiv/almanac/leaderboard.json", "/mods/ffxiv/almanac/recommendations.json"]',
    'the Worker runs for the APIs, the (approved-only) gallery images and the two Almanac aggregates, nothing else');
  assert.match(toml, /\{ pattern = "spacegho\.st\/mods\/ffxiv\/almanac\*", zone_name = "spacegho\.st" \}/);
  assert.ok(!/mods\/ffxiv\/ai\b/.test(toml), 'no /mods/ffxiv/ai route');
  assert.match(assets, /^html_handling = "auto-trailing-slash"/m);
  assert.match(toml, /^main = "src\/worker\.js"$/m);
  assert.match(toml, /^command = "node scripts\/build\.js"$/m);
  assert.match(toml, /^database_id = "ccbfb295-deb8-49ec-82c2-04a0b82ed4f3"$/m);
  assert.ok(!toml.includes('[[rules]]'), 'no bundled text modules');
  const vars = toml.slice(toml.indexOf('[vars]'));
  assert.match(vars, /^GITHUB_CLIENT_ID = "Iv23liYsdX6oOuO47ulv"/m);
  assert.match(vars, /^XIVAUTH_CLIENT_ID = "3yHMau3T_wNUzny9QQDeiSS9wRl6BjNKIN5IpHxzQyU"/m);
  assert.match(vars, /^ADMIN_ACCOUNTS = "github:251370"/m);
  assert.ok(!/^\s*(GITHUB_CLIENT_SECRET|XIVAUTH_CLIENT_SECRET|SESSION_SECRET\w*)\s*=/m.test(toml), 'secrets never go in wrangler.toml');
});

test('gallery page: static, no inline code, images only from its own approved paths', () => {
  const html = read('public/mods/ffxiv/term/gallery/index.html');
  const js = read('public/mods/ffxiv/term/gallery/gallery.js');
  assert.ok(!/<script(?![^>]*\ssrc=)/i.test(html) && !/<style|\sstyle=|\son[a-z]+=|nonce/i.test(html));
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]), ['/mods/ffxiv/term/gallery/gallery.js']);
  const files = walk('public/');
  for (const ref of html.matchAll(/(?:src|href)="(\/mods\/[^"]+)"/g)) {
    assert.ok(files.includes(ref[1].slice(1) + (ref[1].endsWith('/') ? 'index.html' : '')), ref[1]);
  }
  for (const sink of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function']) assert.ok(!js.includes(sink), sink);
  assert.ok(!/[^\t\n\x20-\x7e]/.test(js), 'gallery.js is plain ASCII');
  assert.ok(html.includes('It is shown publicly here, with the credit you gave, once the site owner has reviewed it.'), 'consent line');
  assert.ok(html.includes('/term share'));
  const headers = read('public/_headers');
  const block = headers.split(/\n(?=\/)/).find((b) => b.startsWith('/mods/ffxiv/term/gallery/*\n'));
  assert.ok(block && /img-src 'self' data:;/.test(block) && /frame-ancestors 'none'/.test(block) && !/unsafe-inline/.test(block));
});

test('almanac page: static, no inline code, data only from leaderboard.json, linked from the other pages', () => {
  const html = read('public/mods/ffxiv/almanac/index.html');
  const js = read('public/mods/ffxiv/almanac/almanac.js');
  assert.ok(!/<script(?![^>]*\ssrc=)/i.test(html) && !/<style|\sstyle=|\son[a-z]+=|nonce/i.test(html));
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]), ['/mods/ffxiv/almanac/almanac.js']);
  const files = walk('public/');
  for (const ref of html.matchAll(/(?:src|href)="(\/mods\/[^"]+)"/g)) {
    if (ref[1] === '/mods/ffxiv/almanac/recommendations.json') continue; // computed by the Worker
    assert.ok(files.includes(ref[1].slice(1) + (ref[1].endsWith('/') ? 'index.html' : '')), ref[1]);
  }
  for (const sink of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function']) assert.ok(!js.includes(sink), sink);
  assert.ok(!/[^\t\n\x20-\x7e]/.test(js), 'almanac.js is plain ASCII');
  assert.ok(js.includes("'leaderboard.json'"));
  assert.ok(html.includes('https://github.com/Spaceghost/almanac-dalamud') && /Almanac/.test(html));
  for (const page of ['public/mods/ffxiv/term/vote/index.html', 'public/mods/ffxiv/term/gallery/index.html', 'public/mods/ffxiv/term/vote/admin/index.html']) {
    assert.ok(read(page).includes('href="/mods/ffxiv/almanac/"'), page + ' links the leaderboard');
  }
  const headers = read('public/_headers');
  const block = headers.split(/\n(?=\/)/).find((b) => b.startsWith('/mods/ffxiv/almanac/*\n'));
  assert.ok(block && /script-src 'self'/.test(block) && /frame-ancestors 'none'/.test(block) && !/unsafe-inline/.test(block));
});

test('the published results schema matches the shared copy and the generated Worker module', async () => {
  const published = JSON.parse(read('public/mods/ffxiv/almanac/schema/results.v1.json'));
  const { default: generated } = await import('../src/almanac-schema.js');
  assert.deepEqual(generated, published, 'run: node scripts/build.js');
  const { existsSync, readFileSync } = await import('node:fs');
  // ALMANAC_SHARED_SCHEMA: the benchmark suite's copy of the schema, when it is checked out beside this one
  const shared = process.env.ALMANAC_SHARED_SCHEMA;
  if (shared && existsSync(shared)) assert.deepEqual(JSON.parse(readFileSync(shared, 'utf8')), published, 'shared schema changed: copy it into public/mods/ffxiv/almanac/schema/');
});
