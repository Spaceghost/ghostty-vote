// Generated from imba/tests/harness.imba; edit the Imba source.
import {iterable$} from 'imba/runtime';

/*body*/
// Shared set-up for the API tests: the real migrations and seed on the D1 shim, a
// stand-in Cache API, sign-in settings, signed sessions and a scripted fetch.
import assert from 'node:assert/strict';

import {createHash,randomBytes} from 'node:crypto';

import {readFileSync} from 'node:fs';

import {handle} from '../src/app.js';

import {BASE,parseCookies} from '../src/lib.js';

import {SESSION_COOKIE,sessionCookie} from '../src/session.js';

import {createD1} from './d1-shim.js';

export const read = function(p) {
	return readFileSync(new URL(('../' + p),import.meta.url),'utf8');
};

export const MIGRATIONS = [read('migrations/0001_init.sql'),read('migrations/0002_drop_site_assets.sql'),read('migrations/0003_note_only_votes.sql'),read('migrations/0004_sign_in.sql'),read('migrations/0005_gallery.sql'),read('migrations/0006_almanac.sql'),read('migrations/0007_analytics.sql'),read('migrations/0008_account_gate.sql'),read('migrations/0009_shot_votes.sql'),read('migrations/0010_mod_votes.sql')];

export const SEED = read('seed/seed.sql');

export const LEGACY_SEED = (function() {
	const cat = JSON.parse(read('data/catalogue.json'));
	const q = function(v) {
		return (('\'' + String(v).replaceAll('\'','\'\'')) + '\'');
	};
	const out = [('INSERT INTO catalogue (id, version) VALUES (1, ' + String(cat.version) + ');')];
	let n = 0;
	cat.categories.forEach(
		function(c,ci) {
			out.push(('INSERT INTO categories (name, tagline, sort_order) VALUES (' + String(q(c.name)) + ', ' + String(q((c.tagline || ''))) + ', ' + String(ci) + ');'));
			for (let i of iterable$(c.ideas)){
				out.push(('INSERT INTO ideas (id, category, title, wow, sort_order, added_version) VALUES (' + String(q(i.id)) + ', ' + String(q(c.name)) + ', ' + String(q(i.title)) + ', ' + String(i.wow) + ', ' + String((n++)) + ', ' + String(i.added_version) + ');'));
			};
			return;
		}
	);
	return out.join('\n');
	return;
})();

export const ORIGIN = 'https://spacegho.st';

export const API = (BASE + '/api/');

export const SECRETS = Object.freeze({SESSION_SECRET: 'test-session-secret-0123456789abcdef-0123456789',GITHUB_CLIENT_SECRET: 'test-github-client-secret',XIVAUTH_CLIENT_SECRET: 'test-xivauth-client-secret'});

export const sha256hex = function(text) {
	return createHash('sha256').update(text).digest('hex');
};

export function memoryCache(){
	const store = new Map();
	return {
		store: store,
		match: async function(req) {
			return await function() {
				let cursor$1 = store;
				let cursor$2 = undefined;
				cursor$2 = cursor$1;
				cursor$1 = cursor$1.get;
				cursor$1 = Reflect.apply(cursor$1,cursor$2,[req.url]);
				cursor$2 = undefined;
				if (cursor$1 == null) {
					return undefined;
				};
				cursor$2 = cursor$1;
				cursor$1 = cursor$1.clone;
				cursor$1 = Reflect.apply(cursor$1,cursor$2,[]);
				cursor$2 = undefined;
				return cursor$1;
			}();
			return await undefined;
		},
		put: async function(req,res) {
			store.set(req.url,res);
			return await undefined;
		},
		delete: async function(req) {
			return await store.delete(req.url);
			return await undefined;
		}
	};
	return;
};

export function memoryKV(){
	const store = new Map();
	return {
		store: store,
		put: async function(key,value) {
			store.set(key,new Uint8Array(value));
			return await undefined;
		},
		get: async function(key,opts) {
			const v = store.get(key);
			if ((!v)) {
				return await null;
			};
			if ((function() {
				let cursor$3 = opts;
				let cursor$4 = undefined;
				if (cursor$3 == null) {
					return undefined;
				};
				cursor$4 = cursor$3;
				cursor$3 = cursor$3.type;
				return cursor$3;
			}() !== 'stream')) {
				throw new Error('only streams are used');
			};
			return await new Blob([v]).stream();
			return await undefined;
		},
		delete: async function(key) {
			store.delete(key);
			return await undefined;
		}
	};
	return;
};

export function scriptedFetch(routes){
	const calls = [];
	const fetcher = async function(resource,init = {}) {
		const url = String(resource);
		calls.push({url: url,method: (init.method || 'GET'),headers: new Headers(init.headers),body: (init.body ? String(init.body) : '')});
		return await routes(url,init);
		return await undefined;
	};
	return {fetcher: fetcher,calls: calls};
	return;
};

export const jsonResponse = function(data,status = 200) {
	return new Response(JSON.stringify(data),{status: status,headers: {'content-type': 'application/json'}});
};

export function setup(extraEnv = {}){
	const env = {DB: createD1(...MIGRATIONS,SEED),GITHUB_CLIENT_ID: 'Iv23liYsdX6oOuO47ulv',XIVAUTH_CLIENT_ID: '3yHMau3T_wNUzny9QQDeiSS9wRl6BjNKIN5IpHxzQyU',ADMIN_ACCOUNTS: 'github:251370',...SECRETS,...extraEnv};
	const cache = memoryCache();
	const waits = [];
	const ctx = {
		waitUntil: function(p) {
			return waits.push(p);
		}
	};
	let fetcher = async function(url) {
		throw new Error(('unexpected fetch ' + url));
		return await undefined;
	};
	let nextId = 1000;
	const call = async function(path,{method: method = 'GET',body: body,cookie: cookie,headers: headers = {}} = {}) {
		const res = (await handle(
			new Request((ORIGIN + path),{method: method,headers: {...((body !== undefined) ? {'content-type': 'application/json',origin: ORIGIN} : {}),...(cookie ? {cookie: cookie} : {}),...headers},body: ((body === undefined) ? undefined : ((((typeof body) === 'string') ? body : JSON.stringify(body))))}),
			env,
			ctx,
			cache,
			function(...args) {
				return fetcher(...args);
			}
		));
		await Promise.all(waits.splice(0));
		return res;
		return;
	};
	const signedIn = async function(provider = 'github',id = String((nextId++))) {
		const set = (await sessionCookie(env,{p: provider,k: sha256hex(((provider + ':') + id))}));
		return set.split(';')[0];
		return;
	};
	const tokens = new Map();
	const linked = function(client = 'ghostty',{provider: provider = 'github',id: id,scope: scope,expiresAt: expiresAt = (Date.now() + 86400000),revokedAt: revokedAt = 0,fresh: fresh = false} = {}) {
		id ??= String((nextId++));
		const memo = [client,provider,id,scope,expiresAt,revokedAt].join('|');
		if (((!fresh) && tokens.has(memo))) {
			return tokens.get(memo);
		};
		const token = ('gvt_' + randomBytes(32).toString('base64url'));
		const tokenId = randomBytes(16).toString('base64url');
		env.DB.raw.prepare(('INSERT INTO api_tokens (id, token_hash, provider, account, client, scope, created_at, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')).run(tokenId,sha256hex(token),provider,sha256hex(((provider + ':') + id)),client,((scope ?? ((client === 'almanac') ? 'almanac:submit' : 'gallery:upload'))),Date.now(),expiresAt,revokedAt);
		const out = {token: token,tokenId: tokenId,account: sha256hex(((provider + ':') + id)),header: {authorization: ('Bearer ' + token)}};
		tokens.set(memo,out);
		return out;
		return;
	};
	const vote = async function(body,opts = {}) {
		return call((API + 'vote'),{method: 'POST',body: body,...opts,cookie: ((opts.cookie ?? (await signedIn())))});
	};
	const mine = function(opts = {}) {
		return call((API + 'mine'),opts);
	};
	return {
		env: env,
		cache: cache,
		call: call,
		vote: vote,
		mine: mine,
		signedIn: signedIn,
		linked: linked,
		useFetch: function(fn) {
			fetcher = fn;
			return;
		}
	};
	return;
};

export const keyOfCookie = function(cookieHeader) {
	const value = parseCookies(cookieHeader)[SESSION_COOKIE];
	const payload = JSON.parse(Buffer.from(value.split('.')[1],'base64url').toString('utf8'));
	return payload.k;
	return;
};

export function setCookies(res){
	const out = {};
	for (let line of iterable$(res.headers.getSetCookie())){
		const [pair,...attrs] = line.split(';').map(
			function(s) {
				return s.trim();
			}
		);
		const eq = pair.indexOf('=');
		out[pair.slice(0,eq)] = {value: pair.slice((eq + 1)),attrs: attrs,line: line};
	};
	return out;
	return;
};

export function talliesMatchVotes(db){
	const rows = db.prepare(('SELECT id, want, maybe, skip,\n            (SELECT COUNT(*) FROM votes WHERE idea_id = ideas.id AND vote = \'want\') AS cw,\n            (SELECT COUNT(*) FROM votes WHERE idea_id = ideas.id AND vote = \'maybe\') AS cm,\n            (SELECT COUNT(*) FROM votes WHERE idea_id = ideas.id AND vote = \'skip\') AS cs\n     FROM ideas')).all();
	const off = rows.filter(
		function(r) {
			return (((r.want !== r.cw) || (r.maybe !== r.cm)) || (r.skip !== r.cs));
		}
	).map(
		function(r) {
			return r.id;
		}
	);
	assert.deepEqual(off,[],'tallies match the votes table');
	return;
};

export const allTallies = function(db) {
	return db.prepare('SELECT id, want, maybe, skip FROM ideas ORDER BY id').all().map(
		function(r) {
			return {...r};
		}
	);
};
