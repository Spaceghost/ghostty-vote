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
import {
  PLUGINS_PATH, PLUGINS_TTL_SECONDS, firstEntry, mergeChannels, stableListing, testingListing, usableEntry,
} from '../scripts/plugins-lib.js';
import MODS from './mods-data.js';
import { json } from './lib.js';

const LISTED = MODS.mods.filter((m) => m.listed && m.repo);
const FETCH_TIMEOUT_MS = 4000;

export async function getPluginMaster(request, env, ctx, url, cache, fetcher) {
  const key = new Request(url.origin + PLUGINS_PATH);
  if (cache) {
    const hit = await cache.match(key);
    if (hit) return hit;
  }
  const entries = (await Promise.all(LISTED.map((mod) => entryFor(mod, fetcher)))).filter(Boolean);
  // Never serve an empty repository: an installer that gets one shows the player nothing
  // at all. The committed listing is stale at worst.
  const body = entries.length ? entries : await fallback(env, url);
  const res = json(body, {
    headers: {
      'cache-control': `public, max-age=${PLUGINS_TTL_SECONDS}`,
      'access-control-allow-origin': '*',
    },
  });
  if (cache && entries.length) {
    const put = cache.put(key, res.clone());
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(put);
    else await put;
  }
  return res;
}

async function entryFor(mod, fetcher) {
  const [stable, testing] = await Promise.all([
    fetchListing(stableListing(mod.repo), fetcher),
    fetchListing(testingListing(mod.repo), fetcher),
  ]);
  const entry = mergeChannels(stable, testing);
  // A repository that has never cut a release has no entry yet; it stays off the listing
  // until it does, rather than showing players a download that 404s.
  return entry && entry.InternalName === mod.internalName ? entry : null;
}

async function fetchListing(href, fetcher) {
  try {
    const res = await fetcher(href, {
      redirect: 'follow',
      headers: { accept: 'application/json', 'user-agent': 'spacegho.st-plugin-repository' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cf: { cacheTtl: PLUGINS_TTL_SECONDS, cacheEverything: true },
    });
    if (!res.ok) return null;
    const entry = firstEntry(await res.json());
    return usableEntry(entry) ? entry : null;
  } catch {
    return null;
  }
}

async function fallback(env, url) {
  try {
    const res = await env.ASSETS.fetch(new Request(url.origin + PLUGINS_PATH));
    if (res.ok) return await res.json();
  } catch {
    // fall through: an empty array still parses, and the installer says the repository
    // is empty rather than failing to load.
  }
  return [];
}
