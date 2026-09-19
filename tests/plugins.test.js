// The Dalamud plugin repository: the committed listing matches data/mods.json, the
// Worker assembles the served listing from each plugin repository's release assets, and
// it never hands the installer something it cannot act on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handle } from '../src/app.js';
import {
  PLUGINS_PATH, STATIC_PLUGINS, buildPluginMaster, fallbackEntry, listedMods, mergeChannels,
  releasedMods, stableListing, stableZip, testingListing, testingZip, usableEntry, validateMods,
} from '../scripts/plugins-lib.js';
import { memoryCache } from './harness.js';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const mods = () => JSON.parse(read('data/mods.json'));
const ORIGIN = 'https://spacegho.st';

const entry = (over = {}) => ({
  Author: 'Johnneylee Jack Rollins',
  Name: 'Ghostty',
  InternalName: 'GhosttyDalamud',
  AssemblyVersion: '0.3.0.0',
  Description: 'A terminal in the game.',
  DalamudApiLevel: 15,
  DownloadLinkInstall: stableZip('Spaceghost/ghostty-dalamud'),
  DownloadLinkUpdate: stableZip('Spaceghost/ghostty-dalamud'),
  ...over,
});

// A fetch that answers only the URLs it was given, like GitHub with some releases cut.
function scriptedFetch(byUrl) {
  return async (url) => {
    const body = byUrl[String(url)];
    if (body === undefined) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  };
}

const getListing = (fetcher, cache = memoryCache()) =>
  handle(new Request(ORIGIN + PLUGINS_PATH), { ASSETS: assets() }, null, cache, fetcher);

// Stand-in for the Static Assets binding: serves the committed fallback listing.
const assets = () => ({
  async fetch(request) {
    return new URL(request.url).pathname === PLUGINS_PATH
      ? new Response(read(STATIC_PLUGINS), { headers: { 'content-type': 'application/json' } })
      : new Response('not found', { status: 404 });
  },
});

test('committed plugins.json matches data/mods.json', () => {
  assert.equal(read(STATIC_PLUGINS), buildPluginMaster(mods()));
  const listing = JSON.parse(read(STATIC_PLUGINS));
  assert.deepEqual(listing.map((e) => e.InternalName), releasedMods(mods()).map((m) => m.internalName));
  for (const e of listing) {
    assert.ok(usableEntry(e), `${e.InternalName} is not installable`);
    assert.equal(e.DalamudApiLevel, 15);
    assert.match(e.DownloadLinkInstall, /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/releases\/latest\/download\/latest\.zip$/);
    assert.equal(e.DownloadLinkTesting, undefined, 'the fallback names no testing download either');
    assert.match(e.IconUrl, /^https:\/\//);
  }
});

test('the fallback names only downloads that exist', () => {
  // A mod that is listed but has cut no release yet stays out of the committed listing:
  // the Worker still serves it the moment GitHub has a release for it.
  const data = mods();
  const unreleased = listedMods(data).filter((m) => !m.released).map((m) => m.internalName);
  const listing = JSON.parse(read(STATIC_PLUGINS));
  for (const name of unreleased) assert.ok(!listing.some((e) => e.InternalName === name), name);
  const released = structuredClone(data);
  released.mods[0].released = true;
  assert.equal(JSON.parse(buildPluginMaster(released))[0].InternalName, released.mods[0].internalName);
  const wrong = structuredClone(data);
  wrong.mods[2].released = true;
  assert.ok(validateMods(wrong).some((e) => /released but not listed/.test(e)));
});

test('mods.json is checked, and an unpublished mod may not be listed', () => {
  assert.deepEqual(validateMods(mods()), []);
  const bad = mods();
  bad.mods[0].assemblyVersion = '1.2.3';
  assert.ok(validateMods(bad).some((e) => /assemblyVersion/.test(e)));
  const unpublished = mods();
  const pending = unpublished.mods.find((m) => !m.listed);
  pending.listed = true;
  assert.ok(validateMods(unpublished).some((e) => /needs repo/.test(e)));
});

test('a plugin with no release at all stays off the listing', async () => {
  const res = await getListing(scriptedFetch({}));
  assert.equal(res.status, 200);
  // Nothing fetchable: the committed listing is served rather than an empty repository.
  assert.deepEqual(await res.json(), JSON.parse(read(STATIC_PLUGINS)));
});

test('the served listing is what the repositories published', async () => {
  const ghostty = 'Spaceghost/ghostty-dalamud';
  const res = await getListing(scriptedFetch({ [stableListing(ghostty)]: [entry()] }));
  const listing = await res.json();
  assert.deepEqual(listing.map((e) => e.InternalName), ['GhosttyDalamud']);
  assert.equal(listing[0].AssemblyVersion, '0.3.0.0');
  assert.equal(listing[0].IsTestingExclusive, false);
  assert.equal(listing[0].DownloadLinkTesting, undefined, 'no testing download until a test build exists');
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  assert.match(res.headers.get('cache-control'), /max-age=\d+/);
});

test('an entry naming a different plugin is dropped', async () => {
  const ghostty = 'Spaceghost/ghostty-dalamud';
  const res = await getListing(scriptedFetch({ [stableListing(ghostty)]: [entry({ InternalName: 'SomethingElse' })] }));
  assert.deepEqual((await res.json()).map((e) => e.InternalName), JSON.parse(read(STATIC_PLUGINS)).map((e) => e.InternalName));
});

test('the assembled listing is cached, so a second read makes no GitHub request', async () => {
  const ghostty = 'Spaceghost/ghostty-dalamud';
  let calls = 0;
  const inner = scriptedFetch({ [stableListing(ghostty)]: [entry()] });
  const counting = (...args) => { calls++; return inner(...args); };
  const cache = memoryCache();
  await getListing(counting, cache);
  const first = calls;
  assert.ok(first > 0);
  const again = await getListing(counting, cache);
  assert.equal(calls, first);
  assert.equal((await again.json())[0].AssemblyVersion, '0.3.0.0');
});

test('the testing channel is folded into the stable entry', () => {
  const repo = 'Spaceghost/almanac-dalamud';
  const stable = entry({ InternalName: 'Almanac', Name: 'Almanac', AssemblyVersion: '0.1.0.0' });
  const testing = entry({
    InternalName: 'Almanac',
    Name: 'Almanac',
    AssemblyVersion: '0.2.0.0',
    TestingAssemblyVersion: '0.2.0.0',
    DownloadLinkInstall: testingZip(repo),
    DownloadLinkTesting: testingZip(repo),
    IsTestingExclusive: true,
  });
  const merged = mergeChannels(stable, testing);
  assert.equal(merged.AssemblyVersion, '0.1.0.0');
  assert.equal(merged.TestingAssemblyVersion, '0.2.0.0');
  assert.equal(merged.DownloadLinkInstall, stable.DownloadLinkInstall, 'stable installs keep the stable zip');
  assert.equal(merged.DownloadLinkTesting, testingZip(repo));
  assert.equal(merged.IsTestingExclusive, false);

  // Testing only: the plugin has no release yet, and the listing says so.
  const only = mergeChannels(null, testing);
  assert.equal(only.IsTestingExclusive, true);
  assert.equal(only.DownloadLinkInstall, testingZip(repo));
  assert.equal(mergeChannels(null, null), null);
  // A half-written entry is not worth serving.
  assert.equal(mergeChannels({ InternalName: 'X' }, null), null);
  assert.equal(usableEntry(entry({ AssemblyVersion: '1.0' })), false);
  assert.equal(usableEntry(entry({ DownloadLinkInstall: 'http://insecure/latest.zip' })), false);
});

test('a testing-only plugin is reachable through the listing the site serves', async () => {
  const repo = 'Spaceghost/almanac-dalamud';
  const res = await getListing(scriptedFetch({
    [testingListing(repo)]: [entry({
      InternalName: 'Almanac', Name: 'Almanac', AssemblyVersion: '0.1.0.0',
      TestingAssemblyVersion: '0.1.0.0', DownloadLinkInstall: testingZip(repo), DownloadLinkTesting: testingZip(repo),
    })],
  }));
  const almanac = (await res.json()).find((e) => e.InternalName === 'Almanac');
  assert.equal(almanac.IsTestingExclusive, true);
});

test('the fallback entry alone is enough to install a plugin', () => {
  for (const mod of listedMods(mods())) {
    const e = fallbackEntry(mod);
    assert.ok(usableEntry(e));
    assert.equal(e.DownloadLinkInstall, stableZip(mod.repo));
    assert.equal(e.DownloadLinkTesting, undefined);
  }
});

test('nothing but /mods/ffxiv/plugins.json reaches the plugin handler', async () => {
  for (const path of ['/mods/ffxiv/plugins', '/mods/ffxiv/plugins/', '/mods/ffxiv/plugins.json/x']) {
    const res = await handle(new Request(ORIGIN + path), {}, null, memoryCache(), scriptedFetch({}));
    assert.equal(res.status, 404, path);
  }
  const wrongMethod = await handle(new Request(ORIGIN + PLUGINS_PATH, { method: 'POST' }), {}, null, memoryCache(), scriptedFetch({}));
  assert.equal(wrongMethod.status, 405);
});
