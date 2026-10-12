// Generated from imba/scripts/seed-lib.imba; edit the Imba source.
import {iterable$} from 'imba/runtime';

/*body*/
// Turns data/catalogue.json (Ghostty's) and data/catalogues/*.json (every other mod's)
// into idempotent D1 seed SQL. Pure; no I/O.

import {VOTE_MODS} from '../src/lib.js';

export const ID_RE = new RegExp('^[a-z0-9][a-z0-9-]{0,63}$','');

export function sqlString(value){
	const s = String(value);
	if (s.includes('\x00')) {
		throw new Error('NUL byte in SQL string');
	};
	return (('\'' + s.replaceAll('\'','\'\'')) + '\'');
	return;
};

function sqlInt(n,name){
	if ((!Number.isSafeInteger(n))) {
		throw new Error(('' + String(name) + ' must be an integer'));
	};
	return String(n);
	return;
};

const str = function(v) {
	return ((typeof v) === 'string');
};

export function validateCatalogue(cat){
	const errors = [];
	if (((!cat) || ((typeof cat) !== 'object'))) {
		return ['catalogue must be an object'];
	};
	if (((cat.mod !== undefined) && (!Object.hasOwn(VOTE_MODS,cat.mod)))) {
		errors.push(('mod "' + String(cat.mod) + '" has no vote page (src/lib.js VOTE_MODS)'));
	};
	if (((!Number.isSafeInteger(cat.version)) || (cat.version < 1))) {
		errors.push('version must be an integer >= 1');
	};
	if (((!Array.isArray(cat.categories)) || (!cat.categories.length))) {
		errors.push('categories must be a non-empty array');
	};
	const ids = new Set();
	const names = new Set();
	for (let [ci,c] of iterable$((cat.categories || []).entries())){
		const where = ('categories[' + String(ci) + ']');
		if (((!str(c.name)) || (!c.name.trim()))) {
			errors.push(('' + String(where) + '.name is required'));
		} else {
			if (names.has(c.name)) {
				errors.push(('' + String(where) + '.name duplicates "' + String(c.name) + '"'));
			};
		};
		names.add(c.name);
		if (((c.tagline !== undefined) && (!str(c.tagline)))) {
			errors.push(('' + String(where) + '.tagline must be a string'));
		};
		if ((!Array.isArray(c.ideas))) {
			errors.push(('' + String(where) + '.ideas must be an array'));
			continue;
		};
		for (let [ii,i] of iterable$(c.ideas.entries())){
			const w = ('' + String(where) + '.ideas[' + String(ii) + ']');
			if (((!str(i.id)) || (!ID_RE.test(i.id)))) {
				errors.push(('' + String(w) + '.id must match ' + String(ID_RE) + ''));
			} else {
				if (ids.has(i.id)) {
					errors.push(('' + String(w) + '.id duplicates "' + String(i.id) + '"'));
				};
			};
			ids.add(i.id);
			if (((!str(i.title)) || (!i.title.trim()))) {
				errors.push(('' + String(w) + '.title is required'));
			};
			for (let k of ['pitch','experience','how','risks','audience','feasibility','effort']){
				if (((i[k] !== undefined) && (!str(i[k])))) {
					errors.push(('' + String(w) + '.' + String(k) + ' must be a string'));
				};
			};
			for (let k of ['in_world','tos_safe']){
				if (((i[k] !== undefined) && ((typeof i[k]) !== 'boolean'))) {
					errors.push(('' + String(w) + '.' + String(k) + ' must be a boolean'));
				};
			};
			if ((((!Number.isSafeInteger(i.wow)) || (i.wow < 0)) || (i.wow > 10))) {
				errors.push(('' + String(w) + '.wow must be an integer 0..10'));
			};
			if ((((!Number.isSafeInteger(i.added_version)) || (i.added_version < 1)) || (i.added_version > cat.version))) {
				errors.push(('' + String(w) + '.added_version must be an integer 1..version (' + String(cat.version) + ')'));
			};
		};
	};
	for (let id of iterable$((cat.top_picks || []))){
		if ((!ids.has(id))) {
			errors.push(('top_picks references unknown id "' + String(id) + '"'));
		};
	};
	return errors;
	return;
};

export const catalogueMod = function(cat) {
	return (cat.mod || 'ghostty');
};

export function validateCatalogues(cats){
	const errors = [];
	const mods = new Set();
	const ids = new Map();
	const names = new Map();
	for (let cat of iterable$(cats)){
		const mod = catalogueMod(cat);
		for (let e of iterable$(validateCatalogue(cat))){
			errors.push(('' + String(mod) + ': ' + String(e) + ''));
		};
		if (mods.has(mod)) {
			errors.push(('' + String(mod) + ': a second catalogue for the same mod'));
		};
		mods.add(mod);
		for (let c of iterable$((cat.categories || []))){
			if ((names.has(c.name) && (names.get(c.name) !== mod))) {
				errors.push(('' + String(mod) + ': category "' + String(c.name) + '" is also ' + String(names.get(c.name)) + '\'s'));
			};
			names.set(c.name,mod);
			for (let i of iterable$((c.ideas || []))){
				if ((ids.has(i.id) && (ids.get(i.id) !== mod))) {
					errors.push(('' + String(mod) + ': idea id "' + String(i.id) + '" is also ' + String(ids.get(i.id)) + '\'s'));
				};
				ids.set(i.id,mod);
			};
		};
	};
	return errors;
	return;
};

export function buildSeedSqlAll(cats){
	const errors = validateCatalogues(cats);
	if (errors.length) {
		throw new Error(('invalid catalogues:\n  ' + errors.join('\n  ')));
	};
	return cats.map(
		function(c) {
			return buildSeedSql(c);
		}
	).join('\n');
	return;
};

export function buildSeedSql(cat){
	const errors = validateCatalogue(cat);
	if (errors.length) {
		throw new Error(('invalid catalogue:\n  ' + errors.join('\n  ')));
	};
	const mod = catalogueMod(cat);
	const ghostty = (mod === 'ghostty');
	const top = new Set((cat.top_picks || []));
	const ideas = cat.categories.flatMap(
		function(c) {
			return c.ideas.map(
				function(i) {
					return {...i,category: c.name};
				}
			);
		}
	);
	const out = (ghostty ? ['-- Generated by scripts/build.js from data/catalogue.json. Do not edit by hand.',('-- Catalogue version ' + String(cat.version) + ': ' + String(cat.categories.length) + ' categories, ' + String(ideas.length) + ' ideas.'),'-- Idempotent: safe to re-run. Votes and tallies are never touched.','',('INSERT INTO catalogue (id, version) VALUES (1, ' + String(sqlInt(cat.version,'version')) + ')'),'  ON CONFLICT (id) DO UPDATE SET version = excluded.version','  WHERE excluded.version >= catalogue.version;',''] : [('-- ' + String(mod) + ': generated by scripts/build.js from data/catalogues/' + String(mod) + '.json. Do not edit by hand.'),('-- Catalogue version ' + String(cat.version) + ': ' + String(cat.categories.length) + ' categories, ' + String(ideas.length) + ' ideas.'),'']);
	cat.categories.forEach(
		function(c,n) {
			out.push((('INSERT INTO categories (name, tagline, sort_order, mod) VALUES (' + String(sqlString(c.name)) + ', ' + String(sqlString((c.tagline || ''))) + ', ' + String(n) + ', ' + String(sqlString(mod)) + ')') + ' ON CONFLICT (name) DO UPDATE SET tagline = excluded.tagline, sort_order = excluded.sort_order, mod = excluded.mod;'));
			return;
		}
	);
	out.push('');
	const cols = ['id','mod','category','title','pitch','experience','how','risks','audience','in_world','tos_safe','top_pick','wow','feasibility','effort','sort_order','added_version','retired'];
	const updates = cols.filter(
		function(k) {
			return (k !== 'id');
		}
	).map(
		function(k) {
			return ('' + String(k) + ' = excluded.' + String(k) + '');
		}
	).join(', ');
	ideas.forEach(
		function(i,n) {
			const vals = [sqlString(i.id),sqlString(mod),sqlString(i.category),sqlString(i.title),sqlString((i.pitch || '')),sqlString((i.experience || '')),sqlString((i.how || '')),sqlString((i.risks || '')),sqlString((i.audience || '')),(i.in_world ? 1 : 0),((i.tos_safe === false) ? 0 : 1),(top.has(i.id) ? 1 : 0),sqlInt(i.wow,'wow'),sqlString((i.feasibility || '')),sqlString((i.effort || '')),n,sqlInt(i.added_version,'added_version'),0];
			out.push(('INSERT INTO ideas (' + String(cols.join(', ')) + ') VALUES (' + String(vals.join(', ')) + ')'));
			out.push(('  ON CONFLICT (id) DO UPDATE SET ' + String(updates) + ';'));
			return;
		}
	);
	out.push('');
	out.push('-- Ideas removed from the catalogue are hidden, not deleted, so their votes survive.');
	out.push(
		('UPDATE ideas SET retired = 1 WHERE mod = ' + String(sqlString(mod)) + ' AND id NOT IN (' + String(ideas.map(
			function(i) {
				return sqlString(i.id);
			}
		).join(', ')) + ');')
	);
	out.push('');
	return out.join('\n');
	return;
};
