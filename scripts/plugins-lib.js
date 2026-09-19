// The Dalamud plugin repository: data/mods.json in, one plugin master (a JSON array of
// manifests) out. Pure; no I/O, so the Worker and the static build share it and the
// tests can run all of it. What Dalamud's installer reads is documented at
// https://dalamud.dev/plugin-development/plugin-submission — the fields below are the
// ones it actually uses, checked against a live copy of the official repository.
export const PLUGINS_PATH = '/mods/ffxiv/plugins.json';
export const STATIC_PLUGINS = 'public' + PLUGINS_PATH;
// How long an assembled listing stays in the edge cache. Dalamud refreshes the
// repository when the installer opens, so this is only about how quickly a new release
// shows up, and every minute of it is a GitHub request not made.
export const PLUGINS_TTL_SECONDS = 600;

// Where a repository publishes its own one-entry listing. Both names are fixed on
// purpose: the release workflow always writes latest.zip and pluginmaster.json, and the
// testing channel is one floating prerelease tagged `testing`, so these URLs never change.
export const stableListing = (repo) => `https://github.com/${repo}/releases/latest/download/pluginmaster.json`;
export const testingListing = (repo) => `https://github.com/${repo}/releases/download/testing/pluginmaster-testing.json`;
export const stableZip = (repo) => `https://github.com/${repo}/releases/latest/download/latest.zip`;
export const testingZip = (repo) => `https://github.com/${repo}/releases/download/testing/latest.zip`;

const VERSION_RE = /^\d+\.\d+\.\d+\.\d+$/;

export function validateMods(mods) {
  const errors = [];
  if (!mods || !Array.isArray(mods.mods) || !mods.mods.length) return ['mods must be a non-empty array'];
  const seen = new Set();
  for (const mod of mods.mods) {
    const where = mod.internalName || '(no internalName)';
    if (!mod.internalName || !/^[A-Za-z0-9._-]+$/.test(mod.internalName)) errors.push(`${where}: internalName must be a plain name`);
    if (seen.has(mod.internalName)) errors.push(`${where}: listed twice`);
    seen.add(mod.internalName);
    for (const field of ['name', 'punchline', 'description', 'author']) {
      if (typeof mod[field] !== 'string' || !mod[field].trim()) errors.push(`${where}: ${field} is required`);
    }
    if (!Array.isArray(mod.tags) || !mod.tags.length) errors.push(`${where}: tags must be a non-empty array`);
    if (!VERSION_RE.test(mod.assemblyVersion || '')) errors.push(`${where}: assemblyVersion must be four numbers`);
    if (!Number.isInteger(mod.dalamudApiLevel)) errors.push(`${where}: dalamudApiLevel must be a number`);
    if (mod.released && !mod.listed) errors.push(`${where}: released but not listed`);
    if (mod.listed) {
      if (!/^[\w.-]+\/[\w.-]+$/.test(mod.repo || '')) errors.push(`${where}: a listed mod needs repo as owner/name`);
      if (typeof mod.icon !== 'string' || !mod.icon.startsWith('https://')) errors.push(`${where}: a listed mod needs an https IconUrl`);
    } else if (mod.repo) {
      errors.push(`${where}: not listed, so it should have no repo yet`);
    }
  }
  return errors;
}

// The entry the site falls back to when a repository's own listing cannot be fetched:
// everything Dalamud needs, from what this repository knows. Only AssemblyVersion can go
// stale here, and only until GitHub answers again.
export function fallbackEntry(mod) {
  return {
    Author: mod.author,
    Name: mod.name,
    InternalName: mod.internalName,
    AssemblyVersion: mod.assemblyVersion,
    Punchline: mod.punchline,
    Description: mod.description,
    Tags: mod.tags,
    ApplicableVersion: 'any',
    DalamudApiLevel: mod.dalamudApiLevel,
    RepoUrl: `https://github.com/${mod.repo}`,
    IconUrl: mod.icon,
    ...(mod.images && mod.images.length ? { ImageUrls: mod.images } : {}),
    DownloadLinkInstall: stableZip(mod.repo),
    DownloadLinkUpdate: stableZip(mod.repo),
    IsTestingExclusive: false,
    LastUpdate: 0,
  };
}

export const listedMods = (mods) => mods.mods.filter((m) => m.listed);
// The fallback listing can only name downloads that exist, so it holds the mods that have
// actually cut a release. The Worker does not need this: it asks GitHub, and a plugin
// whose repository has published nothing simply has no entry to serve.
export const releasedMods = (mods) => mods.mods.filter((m) => m.listed && m.released);

// The committed fallback listing, pretty-printed the way the build writes every file.
export function buildPluginMaster(mods) {
  const errors = validateMods(mods);
  if (errors.length) throw new Error('invalid mods:\n  ' + errors.join('\n  '));
  return JSON.stringify(releasedMods(mods).map(fallbackEntry), null, 2) + '\n';
}

// An entry is only worth serving if the installer can act on it.
export function usableEntry(entry) {
  return !!entry && typeof entry === 'object' &&
    typeof entry.InternalName === 'string' && entry.InternalName &&
    VERSION_RE.test(entry.AssemblyVersion || '') &&
    typeof entry.DownloadLinkInstall === 'string' && entry.DownloadLinkInstall.startsWith('https://');
}

// One plugin's entry from what its repository published: the stable release's listing,
// with the testing channel's fields folded in. Either side may be missing.
export function mergeChannels(stable, testing) {
  const s = usableEntry(stable) ? stable : null;
  const t = usableEntry(testing) ? testing : null;
  if (!s && !t) return null;
  if (!s) return { ...t, IsTestingExclusive: true };
  const entry = { ...s, IsTestingExclusive: false };
  if (!t) {
    // No test build published: do not advertise a testing download that 404s.
    delete entry.DownloadLinkTesting;
    delete entry.TestingAssemblyVersion;
    return entry;
  }
  entry.TestingAssemblyVersion = t.TestingAssemblyVersion || t.AssemblyVersion;
  entry.DownloadLinkTesting = t.DownloadLinkTesting || t.DownloadLinkInstall;
  if (t.TestingDalamudApiLevel) entry.TestingDalamudApiLevel = t.TestingDalamudApiLevel;
  if (t.TestingChangelog) entry.TestingChangelog = t.TestingChangelog;
  return entry;
}

// The first entry of a plugin master, whatever shape the fetched JSON came in.
export function firstEntry(body) {
  if (Array.isArray(body)) return body[0] || null;
  return body && typeof body === 'object' ? body : null;
}
