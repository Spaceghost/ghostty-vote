// Generated from imba/src/plugins.imba; edit the Imba source.

/*body*/
// GET /mods/ffxiv/plugins.json — the Dalamud plugin repository players paste into
// /xlsettings -> Experimental -> Custom Plugin Repositories.
//
// Each plugin's own GitHub repository publishes its entry as a release asset
// (pluginmaster.json on the stable release, pluginmaster-testing.json on the floating
// `testing` prerelease). This assembles them into one listing, so cutting a release
// updates what players see without a deploy here and without a token anywhere.
//
// It is a Worker rather than a static file for exactly that reason, and it behaves like
// a static file otherwise: no D1, no KV, no session, one cached response per edge for
// PLUGINS_TTL_SECONDS, and the committed public/mods/ffxiv/plugins.json as the answer
// when GitHub cannot be reached.
import {PLUGINS_PATH,PLUGINS_TTL_SECONDS,firstEntry,mergeChannels,stableListing,testingListing,usableEntry} from '../scripts/plugins-lib.js';

import MODS from './mods-data.js';

import {json} from './lib.js';

const LISTED = MODS.mods.filter(
	function(m) {
		return ((((m.kind || 'plugin') === 'plugin') && m.listed) && m.repo);
	}
);

const FETCH_TIMEOUT_MS = 4000;

export async function getPluginMaster(request,env,ctx,url,cache,fetcher){
	const key = new Request((url.origin + PLUGINS_PATH));
	if (cache) {
		const hit = (await cache.match(key));
		if (hit) {
			return hit;
		};
	};
	const entries = (await Promise.all(
		LISTED.map(
			function(mod) {
				return entryFor(mod,fetcher);
			}
		)
	)).filter(Boolean);
	const body = (entries.length ? entries : ((await fallback(env,url))));
	const res = json(body,{headers: {'cache-control': ('public, max-age=' + String(PLUGINS_TTL_SECONDS) + ''),'access-control-allow-origin': '*'}});
	if ((cache && entries.length)) {
		const put = cache.put(key,res.clone());
		if ((ctx && ((typeof ctx.waitUntil) === 'function'))) {
			ctx.waitUntil(put);
		} else {
			await put;
		};
	};
	return res;
	return;
};

async function entryFor(mod,fetcher){
	const [stable,testing] = (await Promise.all([fetchListing(stableListing(mod.repo),fetcher,mod.internalName),fetchListing(testingListing(mod.repo),fetcher,mod.internalName)]));
	const entry = mergeChannels(stable,testing);
	return ((entry && (entry.InternalName === mod.internalName)) ? entry : null);
	return;
};

async function fetchListing(href,fetcher,internalName){
	try {
		const res = (await fetcher(href,{redirect: 'follow',headers: {accept: 'application/json','user-agent': 'spacegho.st-plugin-repository'},signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),cf: {cacheTtl: PLUGINS_TTL_SECONDS,cacheEverything: true}}));
		if ((!res.ok)) {
			return null;
		};
		const entry = firstEntry((await res.json()),internalName);
		return (usableEntry(entry) ? entry : null);
	} catch ($1) {
		return null;
	};
	return;
};

async function fallback(env,url){
	try {
		const res = (await env.ASSETS.fetch(new Request((url.origin + PLUGINS_PATH))));
		if (res.ok) {
			return (await res.json());
		};
	} catch ($2) {
		undefined;
	};
	return [];
	return;
};
