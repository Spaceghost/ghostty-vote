// Generated from imba/tests/plugins.test.imba; edit the Imba source.
import {iterable$} from 'imba/runtime';

/*body*/
// The Dalamud plugin repository: the committed listing matches data/mods.json, the
// Worker assembles the served listing from each plugin repository's release assets, and
// it never hands the installer something it cannot act on.
import {test} from 'node:test';

import assert from 'node:assert/strict';

import {readFileSync} from 'node:fs';

import {handle} from '../src/app.js';

import {PLUGINS_PATH,STATIC_PLUGINS,buildPluginMaster,fallbackEntry,listedMods,mergeChannels,releasedMods,stableListing,stableZip,testingListing,testingZip,usableEntry,validateMods} from '../scripts/plugins-lib.js';

import {memoryCache} from './harness.js';

const root = new URL('../',import.meta.url);

const read = function(p) {
	return readFileSync(new URL(p,root),'utf8');
};

const mods = function() {
	return JSON.parse(read('data/mods.json'));
};

const ORIGIN = 'https://spacegho.st';

const entry = function(over = {}) {
	return {Author: 'Johnneylee Jack Rollins',Name: 'Ghostty',InternalName: 'GhosttyDalamud',AssemblyVersion: '0.3.0.0',Description: 'A terminal in the game.',DalamudApiLevel: 15,DownloadLinkInstall: stableZip('Spaceghost/ghostty-dalamud'),DownloadLinkUpdate: stableZip('Spaceghost/ghostty-dalamud'),...over};
};

function scriptedFetch(byUrl){
	return async function(url) {
		const body = byUrl[String(url)];
		if ((body === undefined)) {
			return await new Response('not found',{status: 404});
		};
		return await new Response(JSON.stringify(body),{status: 200,headers: {'content-type': 'application/json'}});
		return await undefined;
	};
	return;
};

const getListing = function(fetcher,cache = memoryCache()) {
	return handle(new Request((ORIGIN + PLUGINS_PATH)),{ASSETS: assets()},null,cache,fetcher);
};

const assets = function() {
	return {
		fetch: async function(request) {
			return await ((new URL(request.url).pathname === PLUGINS_PATH) ? (new Response(read(STATIC_PLUGINS),{headers: {'content-type': 'application/json'}})) : (new Response('not found',{status: 404})));
			return await undefined;
		}
	};
};

test(
	'committed plugins.json matches data/mods.json',
	function() {
		assert.equal(read(STATIC_PLUGINS),buildPluginMaster(mods()));
		const listing = JSON.parse(read(STATIC_PLUGINS));
		assert.deepEqual(
			listing.map(
				function(e) {
					return e.InternalName;
				}
			),
			releasedMods(mods()).map(
				function(m) {
					return m.internalName;
				}
			)
		);
		for (let e of iterable$(listing)){
			assert.ok(usableEntry(e),('' + String(e.InternalName) + ' is not installable'));
			assert.equal(e.DalamudApiLevel,15);
			assert.match(e.DownloadLinkInstall,new RegExp('^https:\\/\\/github\\.com\\/[\\w.-]+\\/[\\w.-]+\\/releases\\/latest\\/download\\/latest\\.zip$',''));
			assert.equal(e.DownloadLinkTesting,undefined,'the fallback names no testing download either');
			assert.match(e.IconUrl,new RegExp('^https:\\/\\/',''));
		};
		return;
	}
);

test(
	'the fallback names only downloads that exist',
	function() {
		var $1;
		const data = mods();
		const unreleased = listedMods(data).filter(
			function(m) {
				return (!m.released);
			}
		).map(
			function(m) {
				return m.internalName;
			}
		);
		const listing = JSON.parse(read(STATIC_PLUGINS));
		for (let name of iterable$(unreleased)){
			assert.ok(
				(!(listing.some(
					function(e) {
						return (e.InternalName === name);
					}
				))),
				name
			);
		};
		const released = structuredClone(data);
		released.mods[0].released = true;
		assert.equal(JSON.parse(buildPluginMaster(released))[0].InternalName,released.mods[0].internalName);
		const wrong = structuredClone(data);
		wrong.mods[2].listed = false;
		((($1 = wrong.mods[2].repo),delete wrong.mods[2].repo, $1));
		wrong.mods[2].released = true;
		assert.ok(
			validateMods(wrong).some(
				function(e) {
					return new RegExp('released but not listed','').test(e);
				}
			)
		);
		return;
	}
);

test(
	'mods.json is checked, and an unpublished mod may not be listed',
	function() {
		var $2;
		assert.deepEqual(validateMods(mods()),[]);
		const bad = mods();
		bad.mods[0].assemblyVersion = '1.2.3';
		assert.ok(
			validateMods(bad).some(
				function(e) {
					return new RegExp('assemblyVersion','').test(e);
				}
			)
		);
		const unpublished = mods();
		const pending = (unpublished.mods.find(
			function(m) {
				return (((m.kind || 'plugin') === 'plugin') && (!m.listed));
			}
		) || unpublished.mods.find(
			function(m) {
				return ((m.kind || 'plugin') === 'plugin');
			}
		));
		pending.listed = true;
		((($2 = pending.repo),delete pending.repo, $2));
		assert.ok(
			validateMods(unpublished).some(
				function(e) {
					return new RegExp('needs repo','').test(e);
				}
			)
		);
		return;
	}
);

test(
	'a plugin with no release at all stays off the listing',
	async function() {
		const res = (await getListing(scriptedFetch({})));
		assert.equal(res.status,200);
		assert.deepEqual((await res.json()),JSON.parse(read(STATIC_PLUGINS)));
		return;
	}
);

test(
	'the served listing is what the repositories published',
	async function() {
		const ghostty = 'Spaceghost/ghostty-dalamud';
		const res = (await getListing(scriptedFetch({[stableListing(ghostty)]: [entry()]})));
		const listing = (await res.json());
		assert.deepEqual(
			listing.map(
				function(e) {
					return e.InternalName;
				}
			),
			['GhosttyDalamud']
		);
		assert.equal(listing[0].AssemblyVersion,'0.3.0.0');
		assert.equal(listing[0].IsTestingExclusive,false);
		assert.equal(listing[0].DownloadLinkTesting,undefined,'no testing download until a test build exists');
		assert.equal(res.headers.get('access-control-allow-origin'),'*');
		assert.match(res.headers.get('cache-control'),new RegExp('max-age=\\d+',''));
		return;
	}
);

test(
	'an entry naming a different plugin is dropped',
	async function() {
		const ghostty = 'Spaceghost/ghostty-dalamud';
		const res = (await getListing(scriptedFetch({[stableListing(ghostty)]: [entry({InternalName: 'SomethingElse'})]})));
		assert.deepEqual(
			(await res.json()).map(
				function(e) {
					return e.InternalName;
				}
			),
			JSON.parse(read(STATIC_PLUGINS)).map(
				function(e) {
					return e.InternalName;
				}
			)
		);
		return;
	}
);

test(
	'the assembled listing is cached, so a second read makes no GitHub request',
	async function() {
		const ghostty = 'Spaceghost/ghostty-dalamud';
		let calls = 0;
		const inner = scriptedFetch({[stableListing(ghostty)]: [entry()]});
		const counting = function(...args) {
			calls++;
			return inner(...args);
			return;
		};
		const cache = memoryCache();
		await getListing(counting,cache);
		const first = calls;
		assert.ok((first > 0));
		const again = (await getListing(counting,cache));
		assert.equal(calls,first);
		assert.equal((await again.json())[0].AssemblyVersion,'0.3.0.0');
		return;
	}
);

test(
	'the testing channel is folded into the stable entry',
	function() {
		const repo = 'Spaceghost/almanac-dalamud';
		const stable = entry({InternalName: 'Almanac',Name: 'Almanac',AssemblyVersion: '0.1.0.0'});
		const testing = entry({InternalName: 'Almanac',Name: 'Almanac',AssemblyVersion: '0.2.0.0',TestingAssemblyVersion: '0.2.0.0',DownloadLinkInstall: testingZip(repo),DownloadLinkTesting: testingZip(repo),IsTestingExclusive: true});
		const merged = mergeChannels(stable,testing);
		assert.equal(merged.AssemblyVersion,'0.1.0.0');
		assert.equal(merged.TestingAssemblyVersion,'0.2.0.0');
		assert.equal(merged.DownloadLinkInstall,stable.DownloadLinkInstall,'stable installs keep the stable zip');
		assert.equal(merged.DownloadLinkTesting,testingZip(repo));
		assert.equal(merged.IsTestingExclusive,false);
		const only = mergeChannels(null,testing);
		assert.equal(only.IsTestingExclusive,true);
		assert.equal(only.DownloadLinkInstall,testingZip(repo));
		assert.equal(mergeChannels(null,null),null);
		assert.equal(mergeChannels({InternalName: 'X'},null),null);
		assert.equal(usableEntry(entry({AssemblyVersion: '1.0'})),false);
		assert.equal(usableEntry(entry({DownloadLinkInstall: 'http://insecure/latest.zip'})),false);
		return;
	}
);

test(
	'a testing-only plugin is reachable through the listing the site serves',
	async function() {
		const repo = 'Spaceghost/almanac-dalamud';
		const res = (await getListing(scriptedFetch({[testingListing(repo)]: [entry({InternalName: 'Almanac',Name: 'Almanac',AssemblyVersion: '0.1.0.0',TestingAssemblyVersion: '0.1.0.0',DownloadLinkInstall: testingZip(repo),DownloadLinkTesting: testingZip(repo)})]})));
		const almanac = (await res.json()).find(
			function(e) {
				return (e.InternalName === 'Almanac');
			}
		);
		assert.equal(almanac.IsTestingExclusive,true);
		return;
	}
);

test(
	'the fallback entry alone is enough to install a plugin',
	function() {
		for (let mod of iterable$(listedMods(mods()))){
			const e = fallbackEntry(mod);
			assert.ok(usableEntry(e));
			assert.equal(e.DownloadLinkInstall,stableZip(mod.repo));
			assert.equal(e.DownloadLinkTesting,undefined);
		};
		return;
	}
);

test(
	'nothing but /mods/ffxiv/plugins.json reaches the plugin handler',
	async function() {
		for (let path of ['/mods/ffxiv/plugins','/mods/ffxiv/plugins/','/mods/ffxiv/plugins.json/x']){
			const res = (await handle(new Request((ORIGIN + path)),{},null,memoryCache(),scriptedFetch({})));
			assert.equal(res.status,404,path);
		};
		const wrongMethod = (await handle(new Request((ORIGIN + PLUGINS_PATH),{method: 'POST'}),{},null,memoryCache(),scriptedFetch({})));
		assert.equal(wrongMethod.status,405);
		return;
	}
);
