// Generated from imba/tests/almanac.test.imba; edit the Imba source.
import {iterable$} from 'imba/runtime';

/*body*/
// The Almanac community model leaderboard: the strict schema validator, the submission
// and its limits, suite pinning and deprecation, the aggregate (per-submitter medians,
// outlier trimming, tiers, confidence), recommendations.json against its schema, the
// cached reads and the owner's moderation.
import test from 'node:test';

import {SUITE_SHA,result} from './fixtures.js';

import assert from 'node:assert/strict';

import {compile} from '../src/jsonschema.js';

import {ALMANAC,validateResult} from '../src/almanac.js';

import {TIERS,buildBoard,buildRecommendations,gpuClassOf,outliers,summarize,tierOf} from '../src/almanac-board.js';

import {ALMANAC_BASE,route} from '../src/lib.js';

import {API,ORIGIN,read,setup} from './harness.js';

const RESULTS = (ALMANAC_BASE + '/api/results');

const post = function(t,body,ip = '198.51.100.7',headers = {}) {
	return t.call(RESULTS,{method: 'POST',body: body,headers: {'cf-connecting-ip': ip,...t.linked('almanac',{provider: 'xivauth',id: ('ip-' + ip)}).header,...headers}});
};

test(
	'jsonschema: strict objects, finite numbers, enums, patterns, unsupported keywords throw',
	function() {
		const v = compile({type: 'object',required: ['a'],properties: {a: {type: 'integer',minimum: 1},b: {enum: ['x',null]},c: {type: 'string',pattern: '^[a-z]+$',maxLength: 3}}});
		assert.equal(v({a: 1}),null);
		assert.equal(v({a: 1,b: null,c: 'ab'}),null);
		assert.match(v({}).message,new RegExp('required',''));
		assert.match(v({a: 1,z: 1}).message,new RegExp('not a known field',''));
		assert.match(v({a: 1.5}).message,new RegExp('integer',''));
		assert.match(v({a: 0}).message,new RegExp('at least 1',''));
		assert.match(v({a: 1,b: 'y'}).message,new RegExp('allowed values',''));
		assert.match(v({a: 1,c: 'abcd'}).message,new RegExp('at most 3',''));
		assert.match(v({a: 1,c: 'A'}).message,new RegExp('not allowed',''));
		assert.match(v({a: '1'}).message,new RegExp('integer',''));
		assert.equal(compile({type: 'object'},{strict: false})({anything: 1}),null);
		assert.throws(
			function() {
				return compile({type: 'object',if: {}});
			},
			new RegExp('unsupported keyword if','')
		);
		assert.throws(
			function() {
				return compile({$ref: 'https://elsewhere/x.json'});
			},
			new RegExp('\\$ref','')
		);
		return;
	}
);

test(
	'the published results schema compiles with nothing ignored',
	function() {
		const schema = JSON.parse(read('public/mods/ffxiv/almanac/schema/results.v1.json'));
		assert.doesNotThrow(
			function() {
				return compile(schema);
			}
		);
		return;
	}
);

test(
	'validateResult: a real-looking run passes; unknown fields, bad types and private-looking text do not',
	function() {
		assert.equal(validateResult(result()).ok,true);
		const tm = result({hardware: {gpu_model: 'AMD Radeon™ RX 7900 XTX'}});
		assert.equal(validateResult(tm).ok,true);
		assert.equal(tm.hardware.gpu_model,'AMD Radeon RX 7900 XTX','trademark signs are dropped');
		const cases = [[result({player: 'Wyn'}),'schema'],[result({hardware: {hostname: 'desk'}}),'schema'],[result({metrics: {score: '72'}}),'schema'],[result({metrics: {score: 101}}),'schema'],[result({schema_version: 2}),'schema'],[result({mode: 'bench'}),'schema'],[result({model: {name: '/home/wyn/models/q.gguf'}}),'looks_private'],[result({model: {name: 'hf.co/x/home/q'}}),'looks_private'],[result({model: {quant: 'C:\\models'}}),'bad_text'],[result({hardware: {gpu_model: 'GPU at 192.168.1.20'}}),'looks_private'],[result({client: {version: 'wyn@example.com'}}),'looks_private'],[result({backend: {version: 'http://localhost'}}),'looks_private'],[result({hardware: {gpu_model: 'RTX <b>4090</b>'}}),'bad_text'],[result({metrics: {tokens_per_s: 1e6}}),'implausible'],[result({tasks: [{id: 'a',success: true,score: 1},{id: 'a',success: true,score: 1}]}),'duplicate_task'],[result({tasks: [{id: 'a',success: true,score: 1,tool_calls: 1,tool_calls_valid: 2}]}),'implausible'],[result({tasks: [{id: 'a',success: true,score: 1,secret: 1}]}),'schema']];
		for (let [body,error] of iterable$(cases)){
			assert.equal(validateResult(body).error,error,JSON.stringify(body).slice(0,120));
		};
		return;
	}
);

test(
	'routes: only the three Almanac paths reach the Worker',
	function() {
		assert.deepEqual(route(RESULTS),{kind: 'api',name: 'almanac/results',method: 'POST'});
		assert.deepEqual(route((ALMANAC_BASE + '/leaderboard.json')),{kind: 'api',name: 'almanac/leaderboard',method: 'GET'});
		assert.deepEqual(route((ALMANAC_BASE + '/recommendations.json')),{kind: 'api',name: 'almanac/recommendations',method: 'GET'});
		for (let p of [(ALMANAC_BASE + '/'),(ALMANAC_BASE + '/almanac.js'),(ALMANAC_BASE + '/api/other'),(ALMANAC_BASE + '/schema/results.v1.json'),'/mods/ffxiv/ai/api/results']){
			assert.equal(route(p).kind,'none',p);
		};
		return;
	}
);

test(
	'POST results: stores the run, pins the suite hash, dedupes exact resubmissions',
	async function() {
		const t = setup();
		const res = (await post(t,result()));
		assert.equal(res.status,201);
		const body = (await res.json());
		assert.match(body.id,new RegExp('^[A-Za-z0-9_-]{22}$',''));
		const row = t.env.DB.raw.prepare('SELECT * FROM almanac_results').get();
		assert.equal(row.model,'qwen3.5:9b');
		assert.equal(row.quant,'Q4_K_M');
		assert.equal(row.vram_mb,8192);
		assert.equal(row.status,'visible');
		assert.match(row.submitter,new RegExp('^[0-9a-f]{64}$',''));
		assert.ok((!JSON.stringify(row).includes('198.51.100.7')),'the address is never stored');
		assert.deepEqual(JSON.parse(row.task_scores),{'market.price': 1,'quest.next': 0.4});
		assert.deepEqual(JSON.parse(row.payload),result());
		const again = (await post(t,result(),'203.0.113.9'));
		assert.equal(again.status,200);
		assert.equal((await again.json()).duplicate,true);
		const other = (await post(t,result({suite: {sha256: 'b'.repeat(64)},metrics: {score: 50}})));
		assert.equal(other.status,409);
		assert.equal((await other.json()).error,'suite_mismatch');
		assert.equal(t.env.DB.raw.prepare('SELECT COUNT(*) AS n FROM almanac_results').get().n,1);
		return;
	}
);

test(
	'POST results: size, JSON, origin and schema are checked before anything is stored',
	async function() {
		const t = setup();
		const big = result(
			{
				tasks: Array.from(
					{length: 200},
					function(_,i) {
						return {id: ('t' + i),success: true,score: 1,tool_calls: 1,tool_calls_valid: 1,ttft_ms: 1,tokens_per_s: 1,output_tokens: 1,duration_ms: 1,error: null};
					}
				)
			}
		);
		big.client.version = 'x'.repeat(32);
		const padded = JSON.stringify(big).replace('{',('{' + ' '.repeat(ALMANAC.maxBytes)));
		assert.equal((await post(t,padded)).status,413);
		assert.equal((await post(t,'not json')).status,400);
		assert.equal((await post(t,result(),'198.51.100.7',{'content-type': 'text/plain'})).status,415);
		assert.equal((await post(t,result(),'198.51.100.7',{origin: 'https://evil.example'})).status,403);
		assert.equal((await post(t,result({extra: true}))).status,400);
		assert.equal((await t.call(RESULTS)).status,405);
		assert.equal(t.env.DB.raw.prepare('SELECT COUNT(*) AS n FROM almanac_results').get().n,0);
		assert.equal((await post(t,result())).status,201);
		return;
	}
);

test(
	'POST results: per-address hourly limit and the site-wide daily cap',
	async function() {
		const t = setup();
		let cursor$1 = 0;
		while ((cursor$1 < ALMANAC.perAddressPerHour)){
			assert.equal((await post(t,result({metrics: {score: cursor$1}}))).status,201,('run ' + cursor$1));
			cursor$1++;
		};
		const limited = (await post(t,result({metrics: {score: 99}})));
		assert.equal(limited.status,429);
		assert.equal((await limited.json()).error,'rate_limited');
		assert.equal((await post(t,result({metrics: {score: 99}}),'203.0.113.1')).status,201,'another address is not limited');
		const now = Date.now();
		const ins = t.env.DB.raw.prepare('INSERT INTO almanac_submit_log (submitter, at) VALUES (?, ?)');
		let cursor$2 = 0;
		while ((cursor$2 < ALMANAC.perDay)){
			ins.run(('filler' + cursor$2),(now - 1000));
			cursor$2++;
		};
		const full = (await post(t,result({metrics: {score: 98}}),'203.0.113.2'));
		assert.equal(full.status,429);
		assert.equal((await full.json()).error,'leaderboard_full');
		return;
	}
);

test(
	'tiers and GPU classes',
	function() {
		assert.equal(tierOf(0),'cpu');
		assert.equal(tierOf(6144),'4-6gb');
		assert.equal(tierOf(7936),'8gb','an 8 GB card reporting a little less');
		assert.equal(tierOf(8192),'8gb');
		assert.equal(tierOf(12288),'10-12gb');
		assert.equal(tierOf(16384),'16gb');
		assert.equal(tierOf(24576),'20-24gb');
		assert.equal(tierOf(32768),'32gb-plus');
		let cursor$3 = 1;
		while ((cursor$3 < TIERS.length)){
			assert.equal(TIERS[cursor$3].min_vram_mb,TIERS[(cursor$3 - 1)].max_vram_mb,'tiers are contiguous');
			cursor$3++;
		};
		assert.equal(gpuClassOf('nvidia','NVIDIA GeForce RTX 4060 Laptop GPU'),'nvidia-rtx-40');
		assert.equal(gpuClassOf('nvidia','NVIDIA GeForce RTX 5090'),'nvidia-rtx-50');
		assert.equal(gpuClassOf('nvidia','NVIDIA GeForce GTX 1660 SUPER'),'nvidia-gtx');
		assert.equal(gpuClassOf('amd','AMD Radeon RX 7900 XTX'),'amd-rx-7000');
		assert.equal(gpuClassOf('intel','Intel(R) Arc(TM) A770 Graphics'),'intel-arc');
		assert.equal(gpuClassOf('apple','Apple M2 Max',0),'apple-m2');
		assert.equal(gpuClassOf('nvidia','unknown',0),'cpu');
		assert.equal(gpuClassOf('other','Something'),'other');
		return;
	}
);

const row = function(over) {
	return {suite_id: 'ffxiv-core',suite_version: '1.0.0',mode: 'live',model: 'm',quant: 'Q4_K_M',context: 8192,tool_calling: 'native',backend: 'ollama',gpu_vendor: 'nvidia',gpu_model: 'NVIDIA GeForce RTX 4060',vram_mb: 8192,score: 70,success_rate: 0.8,tool_call_validity: 0.9,tokens_per_s: 40,ttft_ms: 300,peak_vram_mb: 6000,task_scores: '{"a":1}',submitter: 's',...over};
};

test(
	'summarize: each submitter counts once, outliers are trimmed, confidence follows the count',
	function() {
		const spam = Array.from(
			{length: 20},
			function() {
				return row({submitter: 'spammer',score: 100});
			}
		);
		const s1 = summarize([...spam,row({submitter: 'x',score: 60})]);
		assert.equal(s1.samples,2,'twenty runs from one submitter are one sample');
		assert.equal(s1.score,80);
		assert.equal(s1.confidence,'low');
		const honest = [61,62,63,64,65,66].map(
			function(score,i) {
				return row({submitter: ('h' + i),score: score,tokens_per_s: (38 + i)});
			}
		);
		const s2 = summarize([...honest,row({submitter: 'liar',score: 100})]);
		assert.equal(s2.trimmed,1,'the outlier is dropped');
		assert.equal(s2.samples,6);
		assert.equal(s2.score,63.5);
		assert.equal(s2.confidence,'medium');
		assert.ok(((s2.score_low < 63.5) && (s2.score_high > 63.5)));
		const fast = summarize([...honest,row({submitter: 'fast',score: 63,tokens_per_s: 4000})]);
		assert.equal(fast.trimmed,1,'a speed outlier is dropped too');
		assert.deepEqual([...outliers([1,1,1])],[],'no trimming below 4 submitters');
		assert.equal(
			summarize(
				Array.from(
					{length: 10},
					function(_,i) {
						return row({submitter: ('z' + i)});
					}
				)
			).confidence,
			'high'
		);
		return;
	}
);

test(
	'buildBoard and buildRecommendations: ranking, tiers, mock fallback, and the recommendations schema',
	function() {
		const rows = [...[70,72,74].map(
			function(score,i) {
				return row({model: 'good:8b',score: score,submitter: ('a' + i)});
			}
		),row({model: 'lucky:8b',score: 95,submitter: 'b0'}),...[80,82,84].map(
			function(score,i) {
				return row({model: 'slow:14b',score: score,tokens_per_s: 4,submitter: ('c' + i)});
			}
		),row({model: 'big:32b',score: 90,vram_mb: 24576,gpu_model: 'NVIDIA GeForce RTX 4090',submitter: 'd0'}),row({model: 'mocked:4b',score: 50,vram_mb: 4096,mode: 'mock',submitter: 'e0',backend: 'lmstudio'})];
		const suites = [{suite_id: 'ffxiv-core',suite_version: '1.0.0',deprecated: 0},{suite_id: 'ffxiv-core',suite_version: '0.9.0',deprecated: 1}];
		const board = buildBoard(rows,suites,Date.UTC(2026,8,19));
		const eight = board.groups.filter(
			function(g) {
				return ((g.tier === '8gb') && (g.mode === 'live'));
			}
		).map(
			function(g) {
				return g.model;
			}
		);
		assert.deepEqual(eight,['lucky:8b','good:8b','slow:14b'],'too slow to use ranks last whatever its score');
		const lucky = board.groups.find(
			function(g) {
				return (g.model === 'lucky:8b');
			}
		);
		assert.ok((lucky.rank_score < lucky.score),'a single run is shrunk toward the tier');
		assert.equal(
			board.suites.find(
				function(s) {
					return (s.version === '0.9.0');
				}
			).deprecated,
			true
		);
		assert.ok(
			board.gpu.some(
				function(g) {
					return ((g.gpu_class === 'nvidia-rtx-40') && (g.model === 'big:32b'));
				}
			)
		);
		const recs = buildRecommendations(board);
		const schema = JSON.parse(read('public/mods/ffxiv/almanac/schema/recommendations.v1.json'));
		assert.equal(compile(schema,{strict: false})(recs),null,'recommendations.json follows its schema');
		assert.equal(recs.suite_version,'1.0.0');
		const tier = function(id) {
			return recs.tiers.find(
				function(t) {
					return (t.id === id);
				}
			);
		};
		assert.equal(tier('20-24gb').models[0].name,'big:32b');
		assert.equal(tier('8gb').models[0].ollama,tier('8gb').models[0].name);
		assert.match(tier('4-6gb').models[0].notes,new RegExp('mock',''));
		assert.equal(tier('4-6gb').models[0].lmstudio,'mocked:4b');
		assert.deepEqual(tier('16gb').models,[]);
		assert.deepEqual(
			recs.tiers.map(
				function(t) {
					return t.id;
				}
			),
			TIERS.map(
				function(t) {
					return t.id;
				}
			)
		);
		return;
	}
);

test(
	'GET leaderboard.json / recommendations.json: computed from D1, cached, hidden and deprecated excluded',
	async function() {
		const t = setup();
		let cursor$4 = 0;
		while ((cursor$4 < 3)){
			await post(t,result({metrics: {score: (60 + cursor$4)}}),('198.51.100.' + cursor$4));
			cursor$4++;
		};
		await post(t,result({model: {name: 'Tiny:1B'},metrics: {score: 30}}),'198.51.100.50');
		const lb = (await t.call((ALMANAC_BASE + '/leaderboard.json')));
		assert.equal(lb.status,200);
		assert.match(lb.headers.get('cache-control'),new RegExp('public, max-age=300',''));
		assert.equal(lb.headers.get('access-control-allow-origin'),'*');
		const board = (await lb.json());
		assert.deepEqual(
			board.groups.map(
				function(g) {
					return [g.model,g.samples];
				}
			),
			[['qwen3.5:9b',3],['tiny:1b',1]]
		);
		assert.ok((!JSON.stringify(board).includes('"submitter"')),'no submitter digests are published');
		const recs = (await (await t.call((ALMANAC_BASE + '/recommendations.json'))).json());
		assert.equal(
			recs.tiers.find(
				function(x) {
					return (x.id === '8gb');
				}
			).models[0].name,
			'qwen3.5:9b'
		);
		const calls = t.env.DB.stats.calls;
		await t.call((ALMANAC_BASE + '/leaderboard.json?bust=1'));
		await t.call((ALMANAC_BASE + '/recommendations.json'));
		assert.equal(t.env.DB.stats.calls,calls,'both answered from the cache');
		return;
	}
);

test(
	'admin: owner-only list, hide/unhide/delete, deprecate a suite; each clears the cached aggregate',
	async function() {
		const t = setup();
		await post(t,result());
		await post(t,result({model: {name: 'other:3b'}}),'198.51.100.99');
		const owner = (await t.signedIn('github','251370'));
		const stranger = (await t.signedIn());
		assert.equal((await t.call((API + 'admin/almanac'))).status,401);
		assert.equal((await t.call((API + 'admin/almanac'),{cookie: stranger})).status,403);
		const list = (await (await t.call((API + 'admin/almanac'),{cookie: owner})).json());
		assert.equal(list.totals.results,2);
		assert.equal(list.results[0].submitter.length,8,'only a digest prefix is shown');
		assert.equal(list.suites[0].results,2);
		const id = list.results.find(
			function(r) {
				return (r.model === 'other:3b');
			}
		).id;
		const models = async function() {
			return (await (await t.call((ALMANAC_BASE + '/leaderboard.json'))).json()).groups.map(
				function(g) {
					return g.model;
				}
			).sort();
		};
		assert.deepEqual((await models()),['other:3b','qwen3.5:9b']);
		const review = function(body,cookie = owner,headers = {}) {
			return t.call((API + 'admin/almanac/review'),{method: 'POST',body: body,cookie: cookie,headers: headers});
		};
		assert.equal((await review({id: id,action: 'hide'},stranger)).status,403);
		assert.equal((await review({id: id,action: 'hide'},owner,{origin: 'https://evil.example'})).status,403);
		assert.equal((await review({id: id,action: 'nuke'})).status,400);
		assert.equal((await review({id: 'x'.repeat(22),action: 'hide'})).status,404);
		assert.equal((await review({id: id,action: 'hide'})).status,200);
		assert.deepEqual((await models()),['qwen3.5:9b'],'hidden results leave the aggregate at once (cache dropped)');
		assert.equal((await review({id: id,action: 'unhide'})).status,200);
		assert.deepEqual((await models()),['other:3b','qwen3.5:9b']);
		assert.equal((await review({id: id,action: 'delete'})).status,200);
		assert.equal(t.env.DB.raw.prepare('SELECT COUNT(*) AS n FROM almanac_results WHERE id = ?').get(id).n,0);
		const suite = function(body) {
			return t.call((API + 'admin/almanac/suite'),{method: 'POST',body: body,cookie: owner});
		};
		assert.equal((await suite({suite_id: 'ffxiv-core',suite_version: '1.0.0',deprecated: 'yes'})).status,400);
		assert.equal((await suite({suite_id: 'nope',suite_version: '1.0.0',deprecated: true})).status,404);
		assert.equal((await suite({suite_id: 'ffxiv-core',suite_version: '1.0.0',deprecated: true})).status,200);
		const board = (await (await t.call((ALMANAC_BASE + '/leaderboard.json'))).json());
		assert.deepEqual(board.groups,[],'a deprecated suite leaves the leaderboard');
		assert.equal(board.suites[0].deprecated,true);
		assert.equal((await (await t.call((ALMANAC_BASE + '/recommendations.json'))).json()).suite_version,'');
		const refused = (await post(t,result({metrics: {score: 1}}),'203.0.113.77'));
		assert.equal(refused.status,410);
		assert.equal((await suite({suite_id: 'ffxiv-core',suite_version: '1.0.0',deprecated: false})).status,200);
		assert.equal((await post(t,result({metrics: {score: 1}}),'203.0.113.77')).status,201);
		return;
	}
);

test(
	'the leaderboard origin check does not stop same-site admin calls',
	async function() {
		const t = setup();
		const owner = (await t.signedIn('github','251370'));
		const res = (await t.call((API + 'admin/almanac'),{cookie: owner,headers: {origin: ORIGIN,'sec-fetch-site': 'same-origin'}}));
		assert.equal(res.status,200);
		assert.match(res.headers.get('cache-control'),new RegExp('private, no-store',''));
		return;
	}
);
