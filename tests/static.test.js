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

// A captured screenshot or clip: anything in a mod's media/ folder except its manifest.
const MEDIA_DIRS = { ghostty: 'mods/ffxiv/term/media/', xivmcp: 'mods/ffxiv/xivmcp/media/', xivdesktop: 'mods/ffxiv/xivdesktop/media/', xivarcade: 'mods/ffxiv/xivarcade/media/', xivwayfinder: 'mods/ffxiv/xivwayfinder/media/', xivlantern: 'mods/ffxiv/xivlantern/media/', almanac: 'mods/ffxiv/almanac/media/' };
const isMediaFile = (f) => Object.values(MEDIA_DIRS).some((d) => f.startsWith(d) && f !== d + 'manifest.json');

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
  // Screenshots and clips dropped into a mod's media/ folder are not listed here: the
  // minisite test below holds them to their manifest instead (docs/MEDIA.md).
  assert.deepEqual(walk('public/').filter((f) => !isMediaFile(f)).sort(), [
    '_headers',
    'mods/ffxiv/almanac/about/index.html',
    'mods/ffxiv/almanac/almanac.css',
    'mods/ffxiv/almanac/almanac.js',
    'mods/ffxiv/almanac/index.html',
    'mods/ffxiv/almanac/media/manifest.json',
    'mods/ffxiv/almanac/schema/recommendations.v1.json',
    'mods/ffxiv/almanac/schema/results.v1.json',
    'mods/ffxiv/index.html',
    'mods/ffxiv/plugins.json',
    'mods/ffxiv/plugins/icons/ghostty-banner.png',
    'mods/ffxiv/plugins/icons/ghostty.png',
    'mods/ffxiv/plugins/icons/xivarcade-banner.png',
    'mods/ffxiv/plugins/icons/xivarcade.png',
    'mods/ffxiv/plugins/icons/xivdesktop-banner.png',
    'mods/ffxiv/plugins/icons/xivdesktop.png',
    'mods/ffxiv/plugins/icons/xivlantern-banner.png',
    'mods/ffxiv/plugins/icons/xivlantern.png',
    'mods/ffxiv/plugins/icons/xivmcp-banner.png',
    'mods/ffxiv/plugins/icons/xivmcp.png',
    'mods/ffxiv/plugins/icons/xivwayfinder-banner.png',
    'mods/ffxiv/plugins/icons/xivwayfinder.png',
    'mods/ffxiv/plugins/index.html',
    'mods/ffxiv/plugins/plugins.css',
    'mods/ffxiv/plugins/plugins.js',
    'mods/ffxiv/site/art/almanac-banner.webp',
    'mods/ffxiv/site/art/almanac-icon.webp',
    'mods/ffxiv/site/art/ghostty-banner.webp',
    'mods/ffxiv/site/art/ghostty-icon.webp',
    'mods/ffxiv/site/art/xivarcade-banner.webp',
    'mods/ffxiv/site/art/xivarcade-icon.webp',
    'mods/ffxiv/site/art/xivdesktop-banner.webp',
    'mods/ffxiv/site/art/xivdesktop-icon.webp',
    'mods/ffxiv/site/art/xivlantern-banner.webp',
    'mods/ffxiv/site/art/xivlantern-icon.webp',
    'mods/ffxiv/site/art/xivmcp-banner.webp',
    'mods/ffxiv/site/art/xivmcp-icon.webp',
    'mods/ffxiv/site/art/xivwayfinder-banner.webp',
    'mods/ffxiv/site/art/xivwayfinder-icon.webp',
    'mods/ffxiv/site/site.css',
    'mods/ffxiv/site/site.js',
    'mods/ffxiv/term/gallery/gallery.css',
    'mods/ffxiv/term/gallery/gallery.js',
    'mods/ffxiv/term/gallery/index.html',
    'mods/ffxiv/term/index.html',
    'mods/ffxiv/term/media/manifest.json',
    'mods/ffxiv/term/vote/admin/accounts.js',
    'mods/ffxiv/term/vote/admin/admin.js',
    'mods/ffxiv/term/vote/admin/analytics.css',
    'mods/ffxiv/term/vote/admin/analytics.js',
    'mods/ffxiv/term/vote/admin/index.html',
    'mods/ffxiv/term/vote/apps/apps.js',
    'mods/ffxiv/term/vote/apps/index.html',
    'mods/ffxiv/term/vote/ballot.js',
    'mods/ffxiv/term/vote/beacon.js',
    'mods/ffxiv/term/vote/ideas.json',
    'mods/ffxiv/term/vote/index.html',
    'mods/ffxiv/term/vote/privacy/index.html',
    'mods/ffxiv/term/vote/version.json',
    'mods/ffxiv/term/vote/vote.css',
    'mods/ffxiv/term/vote/vote.js',
    'mods/ffxiv/xivarcade/index.html',
    'mods/ffxiv/xivarcade/media/manifest.json',
    'mods/ffxiv/xivdesktop/index.html',
    'mods/ffxiv/xivdesktop/media/manifest.json',
    'mods/ffxiv/xivlantern/index.html',
    'mods/ffxiv/xivlantern/media/manifest.json',
    'mods/ffxiv/xivmcp/index.html',
    'mods/ffxiv/xivmcp/media/manifest.json',
    'mods/ffxiv/xivwayfinder/index.html',
    'mods/ffxiv/xivwayfinder/media/manifest.json',
  ]);
});

test('page has no inline script, style or handlers, and renders data only through textContent', () => {
  const html = read(STATIC_DIR + 'index.html');
  const js = read(STATIC_DIR + 'vote.js');
  const ballot = read(STATIC_DIR + 'ballot.js');
  assert.ok(!/<script(?![^>]*\ssrc=)/i.test(html), 'every script is external');
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(scripts, ['/mods/ffxiv/term/vote/ballot.js', '/mods/ffxiv/term/vote/vote.js', '/mods/ffxiv/term/vote/beacon.js'],
    'ballot.js loads before vote.js, and the page-view beacon last');
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
  for (const f of ['index.html', 'vote.js', 'ballot.js', 'vote.css', 'admin/admin.js', 'beacon.js', 'admin/analytics.js', 'admin/analytics.css']) {
    if (f !== 'index.html') assert.ok(!/[^\t\n\x20-\x7e]/.test(read(STATIC_DIR + f)), `${f} is plain ASCII`);
  }
});

test('admin page: a static shell with no inline code and no data; the list comes only from the gated API', () => {
  const html = read(STATIC_DIR + 'admin/index.html');
  const js = read(STATIC_DIR + 'admin/admin.js');
  assert.ok(!/<script(?![^>]*\ssrc=)/i.test(html) && !/<style|\sstyle=|\son[a-z]+=|nonce/i.test(html));
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]),
    ['/mods/ffxiv/term/vote/admin/admin.js', '/mods/ffxiv/term/vote/admin/analytics.js', '/mods/ffxiv/term/vote/admin/accounts.js']);
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
  const files = walk('public/');
  for (const ref of html.matchAll(/(?:src|href)="(\/mods\/[^"]+)"/g)) {
    assert.ok(files.includes(ref[1].slice(1) + (ref[1].endsWith('/') ? 'index.html' : '')), ref[1]);
  }
  const accounts = read(STATIC_DIR + 'admin/accounts.js');
  for (const sink of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function']) assert.ok(!js.includes(sink) && !accounts.includes(sink), sink);
  assert.ok(accounts.includes("'admin/accounts'") && accounts.includes("'admin/accounts/ban'") && accounts.includes("'admin/tokens/revoke'") && !/[^\t\n\x20-\x7e]/.test(accounts));
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
    '["/mods/ffxiv/term/vote/api/*", "/mods/ffxiv/term/gallery/api/*", "/mods/ffxiv/term/gallery/img/*", "/mods/ffxiv/term/gallery/thumb/*", "/mods/ffxiv/almanac/api/*", "/mods/ffxiv/almanac/leaderboard.json", "/mods/ffxiv/almanac/recommendations.json", "/mods/ffxiv/plugins.json"]',
    'the Worker runs for the APIs, the (approved-only) gallery images, the two Almanac aggregates and the plugin repository listing, nothing else');
  assert.match(toml, /\{ pattern = "spacegho\.st\/mods\/ffxiv\/plugins\*", zone_name = "spacegho\.st" \}/);
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
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]),
    ['/mods/ffxiv/term/gallery/gallery.js', '/mods/ffxiv/term/vote/beacon.js']);
  const files = walk('public/');
  for (const ref of html.matchAll(/(?:src|href)="(\/mods\/[^"]+)"/g)) {
    if (ref[1].startsWith('/mods/ffxiv/term/vote/api/auth/')) continue; // the sign-in buttons: Worker routes
    assert.ok(files.includes(ref[1].slice(1) + (ref[1].endsWith('/') ? 'index.html' : '')), ref[1]);
  }
  for (const sink of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function']) assert.ok(!js.includes(sink), sink);
  assert.ok(!/[^\t\n\x20-\x7e]/.test(js), 'gallery.js is plain ASCII');
  assert.ok(html.includes('It is shown publicly here, with the credit you gave, once the site owner has reviewed it.'), 'consent line');
  assert.ok(html.includes('/term share'));
  // Signed out, the form gives way to the two sign-in buttons, which come back to this page.
  for (const p of ['github', 'xivauth']) assert.ok(html.includes(`id="signin-${p}" href="/mods/ffxiv/term/vote/api/auth/${p}/start?return=/mods/ffxiv/term/gallery/"`), p);
  assert.ok(/<form id="upload" novalidate hidden>/.test(html) && /<div id="signin" class="signin" hidden>/.test(html), 'nothing is offered before the page knows who is asking');
  assert.ok(js.includes("VOTE_API + 'gallery/upload'") && js.includes("credentials: 'same-origin'") && js.includes("VOTE_API + 'auth/me'"));
  assert.ok(!/needs no account/i.test(html) && html.includes('which sign-in you used, a key derived from that account'), 'the privacy note says what is kept with a shot');
  const headers = read('public/_headers');
  const block = headers.split(/\n(?=\/)/).find((b) => b.startsWith('/mods/ffxiv/term/gallery/*\n'));
  assert.ok(block && /img-src 'self' data:;/.test(block) && /frame-ancestors 'none'/.test(block) && !/unsafe-inline/.test(block));
});

test('connected apps page: static, no inline code, no data, codes and tokens never rendered as HTML', () => {
  const html = read(STATIC_DIR + 'apps/index.html');
  const js = read(STATIC_DIR + 'apps/apps.js');
  assert.ok(!/<script(?![^>]*\ssrc=)/i.test(html) && !/<style|\sstyle=|\son[a-z]+=|nonce/i.test(html));
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]), ['/mods/ffxiv/term/vote/apps/apps.js']);
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
  const files = walk('public/');
  for (const ref of html.matchAll(/(?:src|href)="(\/mods\/[^"?]+)/g)) {
    if (ref[1].startsWith('/mods/ffxiv/term/vote/api/')) continue;
    assert.ok(files.includes(ref[1].slice(1) + (ref[1].endsWith('/') ? 'index.html' : '')), ref[1]);
  }
  for (const sink of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function', 'localStorage.setItem', 'console.']) assert.ok(!js.includes(sink), sink);
  assert.ok(!/[^\t\n\x20-\x7e]/.test(js), 'apps.js is plain ASCII');
  for (const endpoint of ["'device/lookup'", "'device/approve'", "'apps/revoke'", "'apps'", "'auth/me'"]) assert.ok(js.includes(endpoint), endpoint);
  assert.ok(html.includes('Only approve a code you asked an app for yourself'), 'the phishing warning sits beside the Approve button');
  assert.ok(!/gvt_|access_token|device_code/.test(js + html), 'the page never handles a token or a device code');
  for (const page of ['public/mods/ffxiv/term/vote/index.html', 'public/mods/ffxiv/term/gallery/index.html', 'public/mods/ffxiv/almanac/index.html', 'public/mods/ffxiv/term/vote/privacy/index.html']) {
    assert.ok(read(page).includes('href="/mods/ffxiv/term/vote/apps/"'), page + ' links the connected apps page');
  }
  assert.ok(!/needs no account/i.test(read('public/mods/ffxiv/almanac/index.html')));
  assert.match(read('public/_headers'), /\/mods\/ffxiv\/term\/vote\/apps\/\*\n  X-Robots-Tag: noindex/);
});

test('almanac page: static, no inline code, data only from leaderboard.json, linked from the other pages', () => {
  const html = read('public/mods/ffxiv/almanac/index.html');
  const js = read('public/mods/ffxiv/almanac/almanac.js');
  assert.ok(!/<script(?![^>]*\ssrc=)/i.test(html) && !/<style|\sstyle=|\son[a-z]+=|nonce/i.test(html));
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]),
    ['/mods/ffxiv/almanac/almanac.js', '/mods/ffxiv/term/vote/beacon.js']);
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

// ---- the mods hub and the seven minisites -------------------------------------------------
const MINISITES = {
  ghostty: 'mods/ffxiv/term/index.html', xivmcp: 'mods/ffxiv/xivmcp/index.html',
  xivdesktop: 'mods/ffxiv/xivdesktop/index.html', xivarcade: 'mods/ffxiv/xivarcade/index.html', xivwayfinder: 'mods/ffxiv/xivwayfinder/index.html', xivlantern: 'mods/ffxiv/xivlantern/index.html', almanac: 'mods/ffxiv/almanac/about/index.html',
};

test('hub and minisites: static, shared stylesheet and script, no third-party requests, honest and credited', () => {
  const files = walk('public/');
  const js = read('public/mods/ffxiv/site/site.js');
  const css = read('public/mods/ffxiv/site/site.css');
  for (const sink of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function']) assert.ok(!js.includes(sink), sink);
  assert.ok(!/[^\t\n\x20-\x7e]/.test(js), 'site.js is plain ASCII');
  assert.ok(!/https?:\/\//.test(css) && !/@import/.test(css), 'site.css fetches nothing from elsewhere');
  assert.ok(/prefers-color-scheme: light/.test(css) && /data-theme="light"/.test(css) && /prefers-reduced-motion/.test(css) && /:focus-visible/.test(css));
  // Uploads go only to the signed-in endpoint, with the session cookie; never to the anonymous one.
  assert.ok(js.includes("'shots/upload?mod='") && !js.includes("api/upload"));
  const pages = { hub: 'mods/ffxiv/index.html', ...MINISITES };
  for (const [id, path] of Object.entries(pages)) {
    const html = read('public/' + path);
    assert.ok(!/<script(?![^>]*\ssrc=)/i.test(html) && !/<style|\sstyle=|\son[a-z]+=|nonce/i.test(html), path + ' has no inline code');
    assert.deepEqual([...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]), ['/mods/ffxiv/site/site.js', '/mods/ffxiv/term/vote/beacon.js'], path);
    assert.deepEqual([...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]), ['/mods/ffxiv/site/site.css'], path + ' uses the one shared stylesheet');
    assert.ok(!/fonts\.googleapis|fonts\.gstatic/.test(html), path + ' uses system fonts');
    for (const ref of html.matchAll(/\s(?:src|href)="(\/mods\/[^"]+)"/g)) {
      if (ref[1].startsWith('/mods/ffxiv/term/vote/api/auth/')) continue; // Worker routes, not files
      const p = ref[1].slice(1).split('#')[0];
      assert.ok(files.includes(p + (p.endsWith('/') ? 'index.html' : '')), path + ': ' + ref[1] + ' exists in public/');
    }
    for (const img of html.matchAll(/<img [^>]*>/g)) assert.ok(/ alt="/.test(img[0]) && / width="\d+"/.test(img[0]) && / height="\d+"/.test(img[0]), path + ': ' + img[0]);
    assert.ok(html.includes('Johnneylee Jack Rollins') && html.includes('https://github.com/Spaceghost'), path + ' credits the author');
    assert.ok(html.includes('https://spacegho.st/mods/ffxiv/plugins.json') && html.includes('href="/mods/ffxiv/plugins/"'), path + ' names the repository');
    assert.ok(/name="viewport"/.test(html) && html.includes('id="main"') && html.includes('class="skip"'));
    assert.ok(html.includes('href="/mods/ffxiv/term/vote/privacy/"'), path + ' links what the site counts');
    assert.ok(/not yet been (?:verified|observed)|Nothing has been observed|need validation in game/.test(html), path + ' says what is unverified');
    if (id === 'hub') {
      for (const href of ['/mods/ffxiv/term/', '/mods/ffxiv/xivmcp/', '/mods/ffxiv/xivdesktop/', '/mods/ffxiv/xivarcade/', '/mods/ffxiv/xivwayfinder/', '/mods/ffxiv/xivlantern/', '/mods/ffxiv/almanac/about/', '/mods/ffxiv/almanac/', '/mods/ffxiv/term/vote/', '/mods/ffxiv/term/gallery/']) {
        assert.ok(html.includes(`href="${href}"`), 'hub links ' + href);
      }
      continue;
    }
    assert.ok(html.includes(`<body data-mod="${id}"`) && html.includes(`data-media="/${MEDIA_DIRS[id]}manifest.json"`), path);
    for (const needle of ['Dev Plugin Locations', 'Custom Plugin Repositories', 'id="install"', 'id="requirements"', 'id="screens"', 'id="community"', 'id="media"', 'id="shots"']) assert.ok(html.includes(needle), path + ': ' + needle);
    // The upload control is hidden until site.js has seen a session; signed-out visitors get the two sign-in links.
    assert.match(html, /<div id="signed-in" hidden>\s*<form id="upload">/);
    const back = '/' + path.replace(/index\.html$/, '');
    assert.ok(html.includes(`href="/mods/ffxiv/term/vote/api/auth/github/start?return=${back}"`) && html.includes(`href="/mods/ffxiv/term/vote/api/auth/xivauth/start?return=${back}"`), path + ' sign-in links');
    assert.ok(html.includes('Your upload is linked to your GitHub or XIVAuth account id, which the site owner can see'), path);
    assert.ok(!/anonym/i.test(html), path + ' makes no anonymity claim');
  }
  assert.ok(read('public/mods/ffxiv/almanac/index.html').includes('href="/mods/ffxiv/almanac/about/"'), 'the leaderboard links its minisite');
});

test('media manifests: every slot is named, every listed file exists beside the manifest, and nothing unlisted is published', () => {
  const files = walk('public/');
  const NAME = /^[a-z0-9][a-z0-9._-]{0,80}\.(webp|avif|jpg|jpeg|png|mp4|webm)$/;
  for (const [id, dir] of Object.entries(MEDIA_DIRS)) {
    const m = JSON.parse(read('public/' + dir + 'manifest.json'));
    assert.equal(m.version, 1);
    assert.equal(m.mod, id);
    assert.ok(Array.isArray(m.slots) && m.slots.length >= 5, dir);
    const listed = new Set();
    const check = (f, where) => {
      for (const name of [f.src, f.poster, ...(f.sizes || []).map((s) => s.src)].filter((n) => n !== undefined && n !== null)) {
        assert.match(name, NAME, where + ': ' + name);
        assert.ok(files.includes(dir + name), where + ': ' + name + ' is not in public/' + dir);
        listed.add(dir + name);
      }
      assert.ok(f.type === 'image' || f.type === 'video', where + ': type');
      assert.ok(Number.isInteger(f.width) && Number.isInteger(f.height) && f.width > 0 && f.height > 0, where + ': width and height keep the layout from jumping');
      if (f.type === 'image') assert.ok(typeof f.alt === 'string' && f.alt.length > 0, where + ': alt');
    };
    const ids = m.slots.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length, dir + ' slot ids are unique');
    for (const s of m.slots) {
      assert.match(s.id, /^[a-z0-9-]+$/);
      assert.ok(s.title && s.kind && s.caption && Array.isArray(s.files), dir + s.id);
      s.files.forEach((f) => check(f, dir + s.id));
    }
    if (m.video && m.video.file) check(m.video.file, dir + 'video');
    for (const f of files.filter((x) => x.startsWith(dir) && x !== dir + 'manifest.json')) {
      assert.ok(listed.has(f), f + ' is not listed in its manifest');
      assert.ok(statSync(new URL('public/' + f, root)).size <= 25 * 1024 * 1024, f + ' is over the 25 MiB static asset limit');
    }
  }
  // Ghostty's slots are the planned shot list, in order.
  const ghostty = JSON.parse(read('public/mods/ffxiv/term/media/manifest.json'));
  assert.equal(ghostty.slots[0].id, 'hero-costa-night');
  assert.ok(ghostty.slots.length === 16 && ghostty.video.cuts.length === 8);
});

test('_headers and routes cover the hub and minisites without stacking a second CSP on the older pages', () => {
  const blocks = read('public/_headers').split(/\n(?=\/)/);
  for (const path of ['/mods/ffxiv/', '/mods/ffxiv/site/*', '/mods/ffxiv/term/', '/mods/ffxiv/term/media/*', '/mods/ffxiv/xivmcp/*', '/mods/ffxiv/xivdesktop/*']) {
    const block = blocks.find((b) => b.startsWith(path + '\n'));
    assert.ok(block, path);
    const csp = block.match(/^\s+Content-Security-Policy: (.+)$/m)[1].split(';').map((d) => d.trim());
    for (const d of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'self'", "img-src 'self' data:", "media-src 'self'", "frame-ancestors 'none'", "base-uri 'none'"]) assert.ok(csp.includes(d), path + ' ' + d);
    assert.ok(!/unsafe-inline|nonce-|https:/.test(csp.join(';')), path);
  }
  assert.ok(!blocks.some((b) => /^\/mods\/ffxiv\/\*\n|^\/mods\/ffxiv\/term\/\*\n|^\/\*\n/.test(b)), 'no rule broad enough to reach the vote, gallery or plugins pages');
  assert.match(blocks.find((b) => b.startsWith('/mods/ffxiv/almanac/*\n')), /media-src 'self'/);
  const toml = read('wrangler.toml');
  for (const pattern of ['spacegho.st/mods/ffxiv', 'spacegho.st/mods/ffxiv/', 'spacegho.st/mods/ffxiv/site/*', 'spacegho.st/mods/ffxiv/term', 'spacegho.st/mods/ffxiv/term/', 'spacegho.st/mods/ffxiv/term/media/*', 'spacegho.st/mods/ffxiv/xivmcp*', 'spacegho.st/mods/ffxiv/xivdesktop*']) {
    assert.ok(toml.includes(`{ pattern = "${pattern}", zone_name = "spacegho.st" }`), pattern);
  }
});
