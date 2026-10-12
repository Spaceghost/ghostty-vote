// Generated from imba/scripts/plugins-lib.imba; edit the Imba source.
import {iterable$} from 'imba/runtime';

/*body*/
// The Dalamud plugin repository: data/mods.json in, one plugin master (a JSON array of
// manifests) out. Pure; no I/O, so the Worker and the static build share it and the
// tests can run all of it. What Dalamud's installer reads is documented at
// https://dalamud.dev/plugin-development/plugin-submission — the fields below are the
// ones it actually uses, checked against a live copy of the official repository.
export const PLUGINS_PATH = '/mods/ffxiv/plugins.json';

export const STATIC_PLUGINS = ('public' + PLUGINS_PATH);

export const PLUGINS_TTL_SECONDS = 600;

export const stableListing = function(repo) {
	return ('https://github.com/' + String(repo) + '/releases/latest/download/pluginmaster.json');
};

export const testingListing = function(repo) {
	return ('https://github.com/' + String(repo) + '/releases/download/testing/pluginmaster-testing.json');
};

export const stableZip = function(repo) {
	return ('https://github.com/' + String(repo) + '/releases/latest/download/latest.zip');
};

export const testingZip = function(repo) {
	return ('https://github.com/' + String(repo) + '/releases/download/testing/latest.zip');
};

const VERSION_RE = new RegExp('^\\d+\\.\\d+\\.\\d+\\.\\d+$','');

export function validateMods(mods){
	const errors = [];
	if ((((!mods) || (!Array.isArray(mods.mods))) || (!mods.mods.length))) {
		return ['mods must be a non-empty array'];
	};
	const seen = new Set();
	for (let mod of iterable$(mods.mods)){
		const where = (mod.internalName || '(no internalName)');
		if (((!mod.internalName) || (!(new RegExp('^[A-Za-z0-9._-]+$','').test(mod.internalName))))) {
			errors.push(('' + String(where) + ': internalName must be a plain name'));
		};
		if (seen.has(mod.internalName)) {
			errors.push(('' + String(where) + ': listed twice'));
		};
		seen.add(mod.internalName);
		const kind = (mod.kind || 'plugin');
		if ((!['plugin','companion','library'].includes(kind))) {
			errors.push(('' + String(where) + ': unknown project kind'));
		};
		for (let field of ['name','punchline','description','author']){
			if ((((typeof mod[field]) !== 'string') || (!mod[field].trim()))) {
				errors.push(('' + String(where) + ': ' + String(field) + ' is required'));
			};
		};
		if (((!Array.isArray(mod.tags)) || (!mod.tags.length))) {
			errors.push(('' + String(where) + ': tags must be a non-empty array'));
		};
		if ((kind !== 'plugin')) {
			if ((mod.listed || mod.released)) {
				errors.push(('' + String(where) + ': only plugins belong in the installer'));
			};
			if ((!(new RegExp('^[\\w.-]+\\/[\\w.-]+$','').test((mod.repo || ''))))) {
				errors.push(('' + String(where) + ': a source repository is required'));
			};
			continue;
		};
		if ((!(VERSION_RE.test((mod.assemblyVersion || ''))))) {
			errors.push(('' + String(where) + ': assemblyVersion must be four numbers'));
		};
		if ((!Number.isInteger(mod.dalamudApiLevel))) {
			errors.push(('' + String(where) + ': dalamudApiLevel must be a number'));
		};
		if ((mod.released && (!mod.listed))) {
			errors.push(('' + String(where) + ': released but not listed'));
		};
		if (mod.listed) {
			if ((!(new RegExp('^[\\w.-]+\\/[\\w.-]+$','').test((mod.repo || ''))))) {
				errors.push(('' + String(where) + ': a listed mod needs repo as owner/name'));
			};
			if ((((typeof mod.icon) !== 'string') || (!mod.icon.startsWith('https://')))) {
				errors.push(('' + String(where) + ': a listed mod needs an https IconUrl'));
			};
		} else {
			if ((mod.repo && (!(new RegExp('^[\\w.-]+\\/[\\w.-]+$','').test(mod.repo))))) {
				errors.push(('' + String(where) + ': repo must be owner/name'));
			};
		};
	};
	return errors;
	return;
};

export function fallbackEntry(mod){
	return {Author: mod.author,Name: mod.name,InternalName: mod.internalName,AssemblyVersion: mod.assemblyVersion,Punchline: mod.punchline,Description: mod.description,Tags: mod.tags,ApplicableVersion: 'any',DalamudApiLevel: mod.dalamudApiLevel,RepoUrl: ('https://github.com/' + String(mod.repo) + ''),IconUrl: mod.icon,...((mod.images && mod.images.length) ? {ImageUrls: mod.images} : {}),DownloadLinkInstall: stableZip(mod.repo),DownloadLinkUpdate: stableZip(mod.repo),IsTestingExclusive: false,LastUpdate: 0};
	return;
};

export const listedMods = function(mods) {
	return mods.mods.filter(
		function(m) {
			return (((m.kind || 'plugin') === 'plugin') && m.listed);
		}
	);
};

export const releasedMods = function(mods) {
	return listedMods(mods).filter(
		function(m) {
			return m.released;
		}
	);
};

export function buildPluginMaster(mods){
	const errors = validateMods(mods);
	if (errors.length) {
		throw new Error(('invalid mods:\n  ' + errors.join('\n  ')));
	};
	return (JSON.stringify(releasedMods(mods).map(fallbackEntry),null,2) + '\n');
	return;
};

export function usableEntry(entry){
	return (((((((!(!entry)) && ((typeof entry) === 'object')) && ((typeof entry.InternalName) === 'string')) && entry.InternalName) && VERSION_RE.test((entry.AssemblyVersion || ''))) && ((typeof entry.DownloadLinkInstall) === 'string')) && entry.DownloadLinkInstall.startsWith('https://'));
	return;
};

export function mergeChannels(stable,testing){
	var $1, $2;
	const s = (usableEntry(stable) ? stable : null);
	const t = (usableEntry(testing) ? testing : null);
	if (((!s) && (!t))) {
		return null;
	};
	if ((!s)) {
		return {...t,IsTestingExclusive: true};
	};
	const entry = {...s,IsTestingExclusive: false};
	if ((!t)) {
		((($1 = entry.DownloadLinkTesting),delete entry.DownloadLinkTesting, $1));
		((($2 = entry.TestingAssemblyVersion),delete entry.TestingAssemblyVersion, $2));
		return entry;
	};
	entry.TestingAssemblyVersion = (t.TestingAssemblyVersion || t.AssemblyVersion);
	entry.DownloadLinkTesting = (t.DownloadLinkTesting || t.DownloadLinkInstall);
	if (t.TestingDalamudApiLevel) {
		entry.TestingDalamudApiLevel = t.TestingDalamudApiLevel;
	};
	if (t.TestingChangelog) {
		entry.TestingChangelog = t.TestingChangelog;
	};
	return entry;
	return;
};

export function firstEntry(body,internalName){
	if (Array.isArray(body)) {
		return ((internalName ? body.find(
			function(entry) {
				return (entry.InternalName === internalName);
			}
		) : body[0]) || null);
	};
	return ((body && ((typeof body) === 'object')) ? body : null);
	return;
};
