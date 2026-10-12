// Generated from imba/scripts/static-lib.imba; edit the Imba source.
import {iterable$} from 'imba/runtime';

/*body*/
// Turns each mod's catalogue into the static files its vote page and plugin read:
// ideas.json (the catalogue, no tallies) and version.json (a cheap poll). Pure; no I/O.
import {catalogueMod,validateCatalogue} from './seed-lib.js';

import {VOTE_MODS} from '../src/lib.js';

export const BASE = '/mods/ffxiv/term/vote/';

export const PUBLIC_URL = ('https://spacegho.st' + BASE);

export const STATIC_DIR = ('public' + BASE);

const pageOf = function(cat) {
	return VOTE_MODS[catalogueMod(cat)];
};

function checked(cat){
	const errors = validateCatalogue(cat);
	if (errors.length) {
		throw new Error(('invalid catalogue:\n  ' + errors.join('\n  ')));
	};
	return cat;
	return;
};

export function buildIdeas(cat){
	checked(cat);
	const top = new Set((cat.top_picks || []));
	return {
		version: cat.version,
		categories: cat.categories.map(
			function(c) {
				return {name: c.name,tagline: (c.tagline || '')};
			}
		),
		ideas: cat.categories.flatMap(
			function(c) {
				return c.ideas.map(
					function(i) {
						return {id: i.id,category: c.name,title: i.title,pitch: (i.pitch || ''),experience: (i.experience || ''),how: (i.how || ''),risks: (i.risks || ''),audience: (i.audience || ''),in_world: (i.in_world === true),tos_safe: (i.tos_safe !== false),top_pick: top.has(i.id),wow: i.wow,feasibility: (i.feasibility || ''),effort: (i.effort || ''),added_version: i.added_version};
					}
				);
			}
		)
	};
	return;
};

export function buildVersion(cat){
	checked(cat);
	const added = {};
	let ideas = 0;
	for (let c of iterable$(cat.categories)){
		for (let i of iterable$(c.ideas)){
			added[i.added_version] = ((added[i.added_version] || 0) + 1);
			ideas++;
		};
	};
	return {version: cat.version,ideas: ideas,added: added,url: ('https://spacegho.st' + pageOf(cat))};
	return;
};

export const serialize = function(value) {
	return (JSON.stringify(value) + '\n');
};

export function buildOutputs(cats,buildSeedSqlAll){
	const list = (Array.isArray(cats) ? cats : [cats]);
	const out = {};
	for (let cat of iterable$(list)){
		const dir = ('public' + pageOf(cat));
		out[(dir + 'ideas.json')] = serialize(buildIdeas(cat));
		out[(dir + 'version.json')] = serialize(buildVersion(cat));
	};
	out['seed/seed.sql'] = buildSeedSqlAll(list);
	return out;
	return;
};
