// Generated from imba/tests/worker.test.imba; edit the Imba source.
import {iterable$} from 'imba/runtime';

/*body*/

import {test} from 'node:test';

import assert from 'node:assert/strict';

import {handle} from '../src/app.js';

import worker from '../src/worker.js';

import {BASE,LIMITS} from '../src/lib.js';

import {buildSeedSql} from '../scripts/seed-lib.js';

import {createD1} from './d1-shim.js';

import {API,LEGACY_SEED,MIGRATIONS,ORIGIN,SEED,allTallies,keyOfCookie,read,setup,sha256hex,talliesMatchVotes} from './harness.js';

const OPEN_IDEAS = JSON.parse(read('data/catalogue.json')).categories.reduce(
	function(n,c) {
		return (n + c.ideas.length);
	},
	0
);

test(
	'only the API reaches the Worker; page paths and dropped endpoints are 404',
	async function() {
		const {call: call,env: env} = setup();
		for (let p of [BASE,(BASE + '/'),(BASE + '/index.html'),(BASE + '/admin/'),(BASE + '/ideas.json'),(API + 'ideas'),(API + 'mine/'),(API + 'version'),(API + 'auth'),(API + 'auth/'),(API + 'auth/github'),(API + 'admin/'),'/mods/ffxiv/term/voter']){
			assert.equal((await call(p)).status,404,p);
		};
		assert.equal(env.DB.stats.calls,0,'404s never touch D1');
		assert.equal((await call((API + 'vote'))).status,405);
		assert.equal((await call((API + 'tallies'),{method: 'POST',body: {}})).headers.get('allow'),'GET');
		assert.equal((await call((API + 'mine'),{method: 'POST',body: {}})).headers.get('allow'),'GET');
		assert.equal((await call((API + 'auth/logout'))).headers.get('allow'),'POST');
		assert.equal((await call((API + 'auth/github/callback'),{method: 'POST',body: {}})).headers.get('allow'),'GET');
		assert.equal((await call((API + 'admin/voters'),{method: 'POST',body: {}})).status,405);
		assert.equal((await call((API + 'auth/github/start'),{method: 'HEAD'})).status,405);
		assert.equal(env.DB.stats.calls,0,'wrong methods never touch D1');
		const res = (await worker.fetch(
			new Request(((ORIGIN + BASE) + '/')),
			env,
			{
				waitUntil: function() {
					undefined;
					return;
				}
			}
		));
		assert.equal(res.status,404,'the default export routes the same way');
		return;
	}
);

test(
	'tallies: counts per open idea, one D1 read, then served from the cache',
	async function() {
		const {env: env,call: call,cache: cache} = setup();
		let res = (await call((API + 'tallies')));
		assert.equal(res.status,200);
		assert.equal(res.headers.get('cache-control'),('public, max-age=' + String(LIMITS.tallyTtlSeconds) + ''));
		const tallies = (await res.json());
		assert.equal(Object.keys(tallies).length,OPEN_IDEAS);
		assert.deepEqual(tallies['ops-weather'],{want: 0,maybe: 0,skip: 0});
		assert.equal(env.DB.stats.calls,1);
		let cursor$1 = 0;
		while ((cursor$1 < 5)){
			res = (await call(((API + 'tallies?bust=') + cursor$1)));
			assert.deepEqual((await res.json()),tallies);
			cursor$1++;
		};
		assert.equal(env.DB.stats.calls,1,'a burst costs one D1 read');
		assert.deepEqual([...cache.store.keys()],[((ORIGIN + API) + 'tallies?mod=ghostty')]);
		assert.equal(res.headers.get('set-cookie'),null);
		const bare = (await handle(new Request(((ORIGIN + API) + 'tallies')),env,undefined,null));
		assert.equal(bare.status,200);
		return;
	}
);

test(
	'voting: signed-in only, upsert, tallies, clearing keeps the note, and a two-query budget',
	async function() {
		const {env: env,vote: vote,call: call,cache: cache,signedIn: signedIn} = setup();
		const id = 'ops-weather';
		const alice = (await signedIn('github','42'));
		let calls = env.DB.stats.calls;
		let res = (await vote({idea_id: id,vote: 'want',note: 'yes please'},{cookie: alice}));
		assert.equal(res.status,200);
		assert.equal((env.DB.stats.calls - calls),2,'one precheck query and one batch');
		assert.equal(res.headers.get('set-cookie'),null,'writes never set cookies');
		let body = (await res.json());
		assert.ok((Number.isInteger(body.updated_at) && (body.updated_at > 0)));
		assert.deepEqual(body,{ok: true,idea_id: id,vote: 'want',note: 'yes please',tally: {want: 1,maybe: 0,skip: 0},updated_at: body.updated_at});
		res = (await vote({idea_id: id,vote: 'maybe'},{cookie: alice}));
		body = (await res.json());
		assert.deepEqual(body.tally,{want: 0,maybe: 1,skip: 0});
		assert.equal(body.note,'yes please','omitted note is kept');
		res = (await vote({idea_id: id,vote: 'skip'}));
		assert.deepEqual((await res.json()).tally,{want: 0,maybe: 1,skip: 1});
		calls = env.DB.stats.calls;
		res = (await vote({idea_id: id,vote: null},{cookie: alice}));
		assert.equal((env.DB.stats.calls - calls),2);
		body = (await res.json());
		assert.deepEqual({...body,updated_at: 0},{ok: true,idea_id: id,vote: null,note: 'yes please',tally: {want: 0,maybe: 0,skip: 1},updated_at: 0});
		cache.store.clear();
		assert.deepEqual((await (await call((API + 'tallies'))).json())[id],{want: 0,maybe: 0,skip: 1});
		const aliceKey = keyOfCookie(alice);
		assert.equal(aliceKey,sha256hex('github:42'),'voter key is sha256hex(\'github:42\')');
		assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM votes WHERE voter = ?').get(aliceKey).n,1);
		const stored = env.DB.raw.prepare('SELECT voter FROM votes UNION SELECT voter FROM write_log').all();
		assert.ok(
			((stored.length > 0) && stored.every(
				function(r) {
					return new RegExp('^[0-9a-f]{64}$','').test(r.voter);
				}
			)),
			'only hashes are stored'
		);
		talliesMatchVotes(env.DB.raw);
		return;
	}
);

test(
	'writes without a valid session get 401 before D1, and never a cookie',
	async function() {
		const {env: env,call: call,signedIn: signedIn} = setup();
		const good = (await signedIn());
		const tampered = (good.slice(0,(- 2)) + (good.endsWith('AA') ? 'BB' : 'AA'));
		const other = setup({SESSION_SECRET: 'another-secret-that-is-long-enough-to-use-0000'});
		const foreign = (await other.signedIn());
		for (let cookie of [undefined,('__Secure-ghostty_voter=' + 'A'.repeat(43)),tampered,foreign,'x=1']){
			for (let [name,body] of [['vote',{idea_id: 'ops-weather',vote: 'want'}],['suggest',{title: 'Split-flap CI board'}]]){
				const res = (await call((API + name),{method: 'POST',body: body,cookie: cookie}));
				assert.equal(res.status,401,((name + ' ') + cookie));
				assert.equal((await res.json()).error,'sign_in_required');
				assert.equal(res.headers.get('set-cookie'),null);
			};
		};
		assert.equal(env.DB.stats.calls,0,'no D1 without a session');
		assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM votes').get().n,0);
		return;
	}
);

test(
	'vote and note combinations: note-only rows, every transition, and deletion when both are empty',
	async function() {
		const {env: env,vote: vote,signedIn: signedIn} = setup();
		const db = env.DB.raw;
		const id = 'ops-weather';
		const cookie = (await signedIn());
		const me = keyOfCookie(cookie);
		const rows = function() {
			return db.prepare('SELECT vote, note FROM votes WHERE voter = ? AND idea_id = ?').all(me,id).map(
				function(r) {
					return {...r};
				}
			);
		};
		async function step(body,expect,row){
			const calls = env.DB.stats.calls;
			const res = (await vote({idea_id: id,...body},{cookie: cookie}));
			assert.equal(res.status,200,JSON.stringify(body));
			assert.ok(((env.DB.stats.calls - calls) <= 2),'at most two D1 round trips per write');
			const got = (await res.json());
			assert.deepEqual({vote: got.vote,note: got.note,tally: got.tally},expect,JSON.stringify(body));
			assert.deepEqual(rows(),(row ? [row] : []),('stored row after ' + JSON.stringify(body)));
			talliesMatchVotes(db);
			return;
		};
		const t = function(want,maybe,skip) {
			return {want: want,maybe: maybe,skip: skip};
		};
		await step({note: 'first thoughts'},{vote: null,note: 'first thoughts',tally: t(0,0,0)},{vote: '',note: 'first thoughts'});
		await step({vote: 'want'},{vote: 'want',note: 'first thoughts',tally: t(1,0,0)},{vote: 'want',note: 'first thoughts'});
		await step({vote: 'skip'},{vote: 'skip',note: 'first thoughts',tally: t(0,0,1)},{vote: 'skip',note: 'first thoughts'});
		await step({note: 'changed my mind'},{vote: 'skip',note: 'changed my mind',tally: t(0,0,1)},{vote: 'skip',note: 'changed my mind'});
		await step({vote: ''},{vote: null,note: 'changed my mind',tally: t(0,0,0)},{vote: '',note: 'changed my mind'});
		await step({vote: null},{vote: null,note: 'changed my mind',tally: t(0,0,0)},{vote: '',note: 'changed my mind'});
		await step({vote: 'maybe',note: ''},{vote: 'maybe',note: '',tally: t(0,1,0)},{vote: 'maybe',note: ''});
		await step({vote: null},{vote: null,note: '',tally: t(0,0,0)},null);
		await step({note: 'back again'},{vote: null,note: 'back again',tally: t(0,0,0)},{vote: '',note: 'back again'});
		await step({note: ''},{vote: null,note: '',tally: t(0,0,0)},null);
		await step({vote: 'want',note: 'both at once'},{vote: 'want',note: 'both at once',tally: t(1,0,0)},{vote: 'want',note: 'both at once'});
		await step({vote: null,note: ''},{vote: null,note: '',tally: t(0,0,0)},null);
		await step({vote: null},{vote: null,note: '',tally: t(0,0,0)},null);
		await vote({idea_id: id,vote: 'want'});
		await step({vote: 'want'},{vote: 'want',note: '',tally: t(2,0,0)},{vote: 'want',note: ''});
		await step({vote: 'skip'},{vote: 'skip',note: '',tally: t(1,0,1)},{vote: 'skip',note: ''});
		return;
	}
);

test(
	'vote rejects bad input without handing out a cookie',
	async function() {
		const {vote: vote,env: env,signedIn: signedIn} = setup();
		const cookie = (await signedIn());
		const cases = [[{body: '{"idea_id":"ops-weather","vote":"want"}',headers: {'content-type': 'text/plain'}},415],[{body: 'not json'},400],[{body: {idea_id: 'nope',vote: 'want'}},404],[{body: {idea_id: 'ops-weather',vote: 'pass'}},400],[{body: {idea_id: 'ops-weather'}},400],[{body: {idea_id: 'ops-weather',note: null}},400],[{body: {idea_id: 'ops-weather',note: 7}},400],[{body: {idea_id: 'nope',note: 'hello'}},404],[{body: {idea_id: 'ops-weather',vote: 'want',note: 'x'.repeat(281)}},400],[{body: {idea_id: 'ops-weather',vote: 'want'},headers: {origin: 'https://evil.example'}},403],[{body: JSON.stringify({idea_id: 'ops-weather',vote: 'want',note: 'x'.repeat(LIMITS.bodyBytes)})},413]];
		for (let [{body: body,headers: headers},status] of iterable$(cases)){
			const res = (await vote(body,{headers: headers,cookie: cookie}));
			assert.equal(res.status,status,JSON.stringify(body).slice(0,60));
			assert.equal(res.headers.get('set-cookie'),null);
		};
		env.DB.raw.exec('UPDATE ideas SET retired = 1 WHERE id = \'ops-weather\'');
		assert.equal((await vote({idea_id: 'ops-weather',vote: 'want'})).status,404,'retired ideas take no votes');
		assert.equal((await vote({idea_id: 'ops-weather',note: 'hi'})).status,404,'or notes');
		assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM votes').get().n,0);
		return;
	}
);

test(
	'per-voter rate limit: 300 writes per window, votes and notes alike, with Retry-After',
	async function() {
		const {vote: vote,env: env,signedIn: signedIn} = setup();
		assert.equal(LIMITS.writesPerWindow,300);
		const cookie = (await signedIn());
		let res = (await vote({idea_id: 'ops-weather',vote: 'want'},{cookie: cookie}));
		let cursor$2 = 1;
		while ((cursor$2 < LIMITS.writesPerWindow)){
			const body = (((cursor$2 % 3) === 0) ? {idea_id: 'ops-weather',note: ('draft ' + cursor$2)} : {idea_id: 'ops-weather',vote: ((cursor$2 % 2) ? 'maybe' : 'want')});
			res = (await vote(body,{cookie: cookie}));
			assert.equal(res.status,200,('write ' + (cursor$2 + 1)));
			cursor$2++;
		};
		res = (await vote({idea_id: 'ops-weather',note: 'one too many'},{cookie: cookie}));
		assert.equal(res.status,429);
		assert.equal((await res.json()).error,'rate_limited');
		const retry = Number(res.headers.get('retry-after'));
		assert.ok(((retry > 0) && (retry <= (LIMITS.windowMs / 1000))));
		assert.equal(res.headers.get('set-cookie'),null);
		res = (await vote({idea_id: 'ops-weather',vote: 'skip'}));
		assert.equal(res.status,200,'other voters are unaffected');
		env.DB.raw.prepare('UPDATE write_log SET at = at - ?').run(LIMITS.windowMs);
		assert.equal((await vote({idea_id: 'ops-weather',note: 'later'},{cookie: cookie})).status,200);
		return;
	}
);

test(
	'mine: without a session, the empty ballot and no D1 access',
	async function() {
		const {env: env,mine: mine,vote: vote,signedIn: signedIn} = setup();
		await vote({idea_id: 'ops-weather',vote: 'want',note: 'someone else'});
		const good = (await signedIn());
		const calls = env.DB.stats.calls;
		for (let cookie of [undefined,'other=1',('__Secure-ghostty_voter=' + 'A'.repeat(43)),'__Secure-ghostty_session=v1.e30.AAAA',good.replace('v1.','v2.')]){
			const res = (await mine({cookie: cookie}));
			assert.equal(res.status,200);
			assert.equal(res.headers.get('cache-control'),'private, no-store');
			assert.equal(res.headers.get('vary'),'Cookie');
			assert.equal(res.headers.get('set-cookie'),null);
			assert.deepEqual((await res.json()),{signed_in: false,votes: {},suggestions: []});
		};
		assert.equal(env.DB.stats.calls,calls,'no session, no D1');
		const res = (await mine({headers: {'sec-fetch-site': 'cross-site'}}));
		assert.equal(res.status,403);
		assert.equal(res.headers.get('cache-control'),'private, no-store');
		assert.equal(env.DB.stats.calls,calls,'cross-site reads are refused before D1');
		return;
	}
);

test(
	'every mod has its own vote: tallies, ballot and suggestions are kept apart by ?mod=',
	async function() {
		const {env: env,vote: vote,call: call,cache: cache,signedIn: signedIn} = setup();
		const db = env.DB.raw;
		const cookie = (await signedIn());
		const [mcp] = db.prepare('SELECT id FROM ideas WHERE mod = \'xivmcp\' ORDER BY sort_order LIMIT 1').all().map(
			function(r) {
				return r.id;
			}
		);
		assert.ok(mcp,'the seed carries the other mods\' ideas');
		assert.equal((await vote({idea_id: mcp,vote: 'want',note: 'please'},{cookie: cookie})).status,200);
		assert.equal((await vote({idea_id: 'ops-weather',vote: 'maybe'},{cookie: cookie})).status,200);
		const ghostty = (await (await call((API + 'tallies'))).json());
		const xivmcp = (await (await call((API + 'tallies?mod=xivmcp'))).json());
		assert.equal(ghostty[mcp],undefined,'Ghostty\'s tallies are Ghostty\'s alone');
		assert.deepEqual(xivmcp[mcp],{want: 1,maybe: 0,skip: 0});
		assert.equal(xivmcp['ops-weather'],undefined);
		assert.equal(Object.keys(xivmcp).length,db.prepare('SELECT COUNT(*) AS n FROM ideas WHERE mod = \'xivmcp\' AND retired = 0').get().n);
		assert.deepEqual([...cache.store.keys()].sort(),[((ORIGIN + API) + 'tallies?mod=ghostty'),((ORIGIN + API) + 'tallies?mod=xivmcp')]);
		assert.equal((await call((API + 'tallies?mod=nope'))).status,404);
		assert.equal((await call((API + 'tallies?mod=__proto__'))).status,404);
		const suggest = function(body) {
			return call((API + 'suggest'),{method: 'POST',body: body,cookie: cookie});
		};
		assert.equal((await suggest({title: 'an mcp idea',mod: 'xivmcp'})).status,201);
		assert.equal((await suggest({title: 'a terminal idea'})).status,201);
		assert.equal((await suggest({title: 'nowhere',mod: 'nope'})).status,400);
		const mine = async function(q) {
			return (await call(((API + 'mine') + q),{cookie: cookie})).json();
		};
		const m1 = (await mine('?mod=xivmcp'));
		assert.deepEqual(Object.keys(m1.votes),[mcp]);
		assert.deepEqual(
			m1.suggestions.map(
				function(x) {
					return x.title;
				}
			),
			['an mcp idea']
		);
		const m2 = (await mine(''));
		assert.deepEqual(Object.keys(m2.votes),['ops-weather']);
		assert.deepEqual(
			m2.suggestions.map(
				function(x) {
					return x.title;
				}
			),
			['a terminal idea']
		);
		assert.equal((await call((API + 'mine?mod=nope'),{cookie: cookie})).status,404);
		return;
	}
);

test(
	'mine: the voter\'s own ballot and newest suggestions, in one D1 batch, never cached',
	async function() {
		const {env: env,mine: mine,vote: vote,call: call,cache: cache,signedIn: signedIn} = setup();
		const db = env.DB.raw;
		const cookie = (await signedIn());
		let res = (await vote({idea_id: 'ops-weather',vote: 'want',note: 'yes'},{cookie: cookie}));
		await vote({idea_id: 'ops-weather',vote: 'skip'});
		const ids = db.prepare('SELECT id FROM ideas WHERE id <> \'ops-weather\' AND mod = \'ghostty\' ORDER BY sort_order LIMIT 3').all().map(
			function(r) {
				return r.id;
			}
		);
		assert.equal((await vote({idea_id: ids[1],note: 'another voter\'s note'})).status,200);
		await vote({idea_id: ids[1],note: 'just a note'},{cookie: cookie});
		await vote({idea_id: ids[2],vote: 'maybe'},{cookie: cookie});
		await vote({idea_id: ids[2],vote: null},{cookie: cookie});
		const me = keyOfCookie(cookie);
		const insert = db.prepare('INSERT INTO suggestions (voter, title, detail, created_at) VALUES (?, ?, ?, ?)');
		let cursor$3 = 0;
		while ((cursor$3 < 55)){
			insert.run(me,('idea ' + cursor$3),((cursor$3 % 2) ? (('detail ' + cursor$3)) : ''),(1000 + Math.floor((cursor$3 / 2))));
			cursor$3++;
		};
		insert.run('f'.repeat(64),'not mine','',99999);
		await call((API + 'tallies'));
		const calls = env.DB.stats.calls;
		res = (await mine({cookie: cookie}));
		assert.equal((env.DB.stats.calls - calls),1,'one batch');
		assert.equal(res.status,200);
		assert.equal(res.headers.get('cache-control'),'private, no-store');
		assert.equal(res.headers.get('vary'),'Cookie');
		assert.equal(res.headers.get('set-cookie'),null);
		assert.deepEqual([...cache.store.keys()],[((ORIGIN + API) + 'tallies?mod=ghostty')],'mine is never put in the cache');
		const body = (await res.json());
		assert.deepEqual(Object.keys(body).sort(),['signed_in','suggestions','votes']);
		assert.equal(body.signed_in,true);
		assert.deepEqual(Object.keys(body.votes).sort(),[ids[1],'ops-weather'].sort());
		const {updated_at: u1,...weather} = body.votes['ops-weather'];
		assert.deepEqual(weather,{vote: 'want',note: 'yes'});
		assert.ok((u1 > 0));
		const {updated_at: u2,...noteOnly} = body.votes[ids[1]];
		assert.deepEqual(noteOnly,{vote: null,note: 'just a note'});
		assert.ok((u2 > 0));
		assert.equal(body.suggestions.length,LIMITS.mySuggestions);
		assert.deepEqual(Object.keys(body.suggestions[0]).sort(),['created_at','detail','id','title']);
		assert.deepEqual(
			body.suggestions.slice(0,3).map(
				function(x) {
					return x.title;
				}
			),
			['idea 54','idea 53','idea 52']
		);
		assert.equal(body.suggestions.at((- 1)).title,'idea 5');
		let cursor$4 = 1;
		while ((cursor$4 < body.suggestions.length)){
			const [a,b] = [body.suggestions[(cursor$4 - 1)],body.suggestions[cursor$4]];
			assert.ok(((a.created_at > b.created_at) || ((a.created_at === b.created_at) && (a.id > b.id))),'newest first');
			cursor$4++;
		};
		assert.ok(
			(!(body.suggestions.some(
				function(x) {
					return (x.title === 'not mine');
				}
			)))
		);
		await vote({idea_id: 'ops-weather',vote: null},{cookie: cookie});
		const again = (await (await mine({cookie: cookie})).json());
		assert.equal(again.votes['ops-weather'].vote,null);
		assert.equal(again.votes['ops-weather'].note,'yes');
		const other = (await (await mine({cookie: (await signedIn('xivauth','0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'))})).json());
		assert.deepEqual(other,{signed_in: true,votes: {},suggestions: []});
		return;
	}
);

test(
	'mine: a suggestion sent through the API is listed',
	async function() {
		const {call: call,mine: mine,signedIn: signedIn} = setup();
		const cookie = (await signedIn());
		const res = (await call((API + 'suggest'),{method: 'POST',body: {title: 'Split-flap CI board',detail: 'At the Gold Saucer.'},cookie: cookie}));
		const {suggestion: suggestion} = (await res.json());
		assert.deepEqual((await (await mine({cookie: cookie})).json()).suggestions,[suggestion]);
		return;
	}
);

test(
	'suggestions are stored, limited per voter, and cost two queries',
	async function() {
		const {call: call,env: env,signedIn: signedIn} = setup();
		const suggest = async function(body,cookie) {
			return call((API + 'suggest'),{method: 'POST',body: body,cookie: ((cookie ?? (await signedIn())))});
		};
		const cookie = (await signedIn());
		const calls = env.DB.stats.calls;
		let res = (await suggest({title: 'Split-flap CI board',detail: 'At the Gold Saucer.'},cookie));
		assert.equal(res.status,201);
		assert.equal((env.DB.stats.calls - calls),2);
		assert.equal(res.headers.get('set-cookie'),null);
		const {suggestion: suggestion} = (await res.json());
		assert.equal(suggestion.title,'Split-flap CI board');
		assert.equal(suggestion.detail,'At the Gold Saucer.');
		assert.ok((Number.isInteger(suggestion.id) && (suggestion.created_at > 0)));
		assert.equal(env.DB.raw.prepare('SELECT status FROM suggestions').get().status,'new');
		assert.equal((await suggest({title: 't'.repeat(81)},cookie)).status,400);
		let cursor$5 = 1;
		while ((cursor$5 < LIMITS.suggestionsPerVoterPerDay)){
			assert.equal((await suggest({title: ('idea ' + cursor$5)},cookie)).status,201);
			cursor$5++;
		};
		res = (await suggest({title: 'one more'},cookie));
		assert.equal(res.status,429);
		assert.equal((await res.json()).error,'suggestion_limit');
		assert.equal((await suggest({title: 'someone else'})).status,201,'other voters are unaffected');
		return;
	}
);

test(
	'migration 0002 drops the D1-hosted page and is safe to re-run on the live schema',
	function() {
		const db = createD1(MIGRATIONS[0],LEGACY_SEED).raw;
		db.exec('CREATE TABLE site_assets (name TEXT PRIMARY KEY, body TEXT NOT NULL); INSERT INTO site_assets VALUES (\'page.html\', \'x\')');
		db.exec('INSERT INTO votes (voter, idea_id, vote, note, created_at, updated_at) VALUES (\'v\', \'ops-weather\', \'want\', \'\', 1, 1)');
		db.exec(MIGRATIONS[1]);
		db.exec(MIGRATIONS[1]);
		const tables = db.prepare('SELECT name FROM sqlite_master WHERE type = \'table\'').all().map(
			function(r) {
				return r.name;
			}
		);
		assert.ok(((!tables.includes('site_assets')) && (!tables.includes('deploy_sources'))));
		for (let t of ['catalogue','categories','ideas','votes','suggestions','write_log']){
			assert.ok(tables.includes(t),t);
		};
		assert.equal(db.prepare('SELECT want FROM ideas WHERE id = \'ops-weather\'').get().want,1,'votes and tally triggers survive');
		assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sqlite_master WHERE type = \'trigger\'').get().n,3);
		return;
	}
);

test(
	'migration 0003 on a database with votes: tallies exact, note-only rows allowed, bad votes refused',
	function() {
		const db = createD1(MIGRATIONS[0],MIGRATIONS[1],LEGACY_SEED).raw;
		const [a,b,c] = db.prepare('SELECT id FROM ideas ORDER BY sort_order LIMIT 3').all().map(
			function(r) {
				return r.id;
			}
		);
		const insert = db.prepare('INSERT INTO votes (voter, idea_id, vote, note, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 2)');
		assert.throws(
			function() {
				return insert.run('v1',a,'','note only');
			},
			new RegExp('CHECK',''),
			'before 0003 a vote is required'
		);
		const ballot = [['v1',a,'want','first'],['v2',a,'want',''],['v3',a,'skip','nah'],['v1',b,'maybe',''],['v2',b,'skip',''],['v3',c,'want','x'.repeat(280)]];
		for (let row of iterable$(ballot)){
			insert.run(...row);
		};
		const before = allTallies(db);
		const votesBefore = db.prepare('SELECT * FROM votes ORDER BY voter, idea_id').all().map(
			function(r) {
				return {...r};
			}
		);
		talliesMatchVotes(db);
		db.exec(('UPDATE ideas SET want = 42 WHERE id = \'' + String(c) + '\''));
		assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys,1);
		db.exec('BEGIN');
		db.exec(MIGRATIONS[2]);
		db.exec('COMMIT');
		assert.deepEqual(allTallies(db),before,'tallies are exactly what the votes say');
		assert.deepEqual(
			db.prepare('SELECT * FROM votes ORDER BY voter, idea_id').all().map(
				function(r) {
					return {...r};
				}
			),
			votesBefore,
			'every row copied'
		);
		assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
		assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
		const schema = function(type) {
			return db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND tbl_name = ? ORDER BY name').all(type,'votes').map(
				function(r) {
					return r.name;
				}
			);
		};
		assert.deepEqual(schema('trigger'),['votes_tally_delete','votes_tally_insert','votes_tally_update']);
		assert.ok(schema('index').includes('votes_idea'));
		assert.ok((!(db.prepare('SELECT name FROM sqlite_master WHERE name = \'votes_new\'').get())));
		assert.match(db.prepare('SELECT sql FROM sqlite_master WHERE name = \'votes\'').get().sql,new RegExp('WITHOUT ROWID',''));
		const tally = function(id) {
			return {...db.prepare('SELECT want, maybe, skip FROM ideas WHERE id = ?').get(id)};
		};
		insert.run('v4',a,'','note only');
		assert.deepEqual(tally(a),{want: 2,maybe: 0,skip: 1});
		db.exec(('UPDATE votes SET vote = \'maybe\' WHERE voter = \'v4\' AND idea_id = \'' + String(a) + '\''));
		assert.deepEqual(tally(a),{want: 2,maybe: 1,skip: 1});
		db.exec(('UPDATE votes SET vote = \'\' WHERE voter = \'v1\' AND idea_id = \'' + String(a) + '\''));
		assert.deepEqual(tally(a),{want: 1,maybe: 1,skip: 1});
		db.exec(('DELETE FROM votes WHERE voter = \'v1\' AND idea_id = \'' + String(a) + '\''));
		assert.deepEqual(tally(a),{want: 1,maybe: 1,skip: 1});
		talliesMatchVotes(db);
		assert.throws(
			function() {
				return insert.run('v5',a,'pass','');
			},
			new RegExp('CHECK','')
		);
		assert.throws(
			function() {
				return insert.run('v5',a,null,'');
			},
			new RegExp('NOT NULL','')
		);
		assert.throws(
			function() {
				return insert.run('v5',a,'want','x'.repeat(281));
			},
			new RegExp('CHECK','')
		);
		assert.throws(
			function() {
				return insert.run('v5','no-such-idea','want','');
			},
			new RegExp('FOREIGN KEY','')
		);
		assert.throws(
			function() {
				return insert.run('v4',a,'want','');
			},
			new RegExp('UNIQUE|PRIMARY KEY','')
		);
		db.exec(('INSERT INTO votes (voter, idea_id, created_at, updated_at) VALUES (\'v6\', \'' + String(b) + '\', 1, 1)'));
		assert.equal(db.prepare('SELECT vote FROM votes WHERE voter = \'v6\'').get().vote,'','vote defaults to \'\'');
		const settled = allTallies(db);
		db.exec(MIGRATIONS[2]);
		assert.deepEqual(allTallies(db),settled);
		talliesMatchVotes(db);
		return;
	}
);

test(
	're-seeding with a bumped version keeps votes and never rolls back',
	async function() {
		const {env: env,vote: vote,call: call,cache: cache} = setup();
		await vote({idea_id: 'ops-weather',vote: 'want'});
		const cat = JSON.parse(read('data/catalogue.json'));
		cat.version = 2;
		cat.categories[0].ideas.push({id: 'brand-new-idea',title: 'Brand new',wow: 3,added_version: 2});
		const retiredId = cat.categories[1].ideas.find(
			function(i) {
				return (!cat.top_picks.includes(i.id));
			}
		).id;
		cat.categories[1].ideas = cat.categories[1].ideas.filter(
			function(i) {
				return (i.id !== retiredId);
			}
		);
		env.DB.raw.exec(buildSeedSql(cat));
		env.DB.raw.exec(buildSeedSql(cat));
		cache.store.clear();
		const tallies = (await (await call((API + 'tallies'))).json());
		assert.equal(Object.keys(tallies).length,OPEN_IDEAS);
		assert.ok((!Reflect.has(tallies,retiredId)));
		assert.deepEqual(tallies['brand-new-idea'],{want: 0,maybe: 0,skip: 0});
		assert.equal(tallies['ops-weather'].want,1);
		assert.equal((await vote({idea_id: 'brand-new-idea',vote: 'maybe'})).status,200);
		const stale = JSON.parse(read('data/catalogue.json'));
		env.DB.raw.exec(buildSeedSql(stale).replace(new RegExp('^UPDATE ideas SET retired.*$','m'),''));
		assert.equal(env.DB.raw.prepare('SELECT version FROM catalogue').get().version,2,'older seed does not roll version back');
		return;
	}
);
