// Generated from imba/tests/ballot.test.imba; edit the Imba source.

/*body*/
// The page's ballot logic (public/.../ballot.js): merging the server ballot with local
// edits, and the save queue's coalescing, ordering, retries and keepalive flush.
// ballot.js is a plain browser script, so it is run here as one, with fake timers.
import {test} from 'node:test';

import assert from 'node:assert/strict';

import {readFileSync} from 'node:fs';

import vm from 'node:vm';

vm.runInThisContext(readFileSync(new URL('../public/mods/ffxiv/term/vote/ballot.js',import.meta.url),'utf8'));

const B = globalThis.GhosttyBallot;

const settle = function() {
	return new Promise(
		function(resolve) {
			return setImmediate(resolve);
		}
	);
};

function fakeClock(){
	let now = 0;
	let next = 1;
	const due = new Map();
	return {
		now: function() {
			return now;
		},
		timers: {
			set: function(fn,ms) {
				const h = (next++);
				due.set(h,{fn: fn,at: (now + ms)});
				return h;
				return;
			},
			clear: function(h) {
				due.delete(h);
				return;
			}
		},
		advance: async function(ms) {
			const end = (now + ms);
			while (true){
				const [h,t] = ([...due].filter(
					function([cursor$1,x]) {
						return (x.at <= end);
					}
				).sort(
					function(x,y) {
						return (x[1].at - y[1].at);
					}
				)[0] || []);
				if ((!t)) {
					break;
				};
				due.delete(h);
				now = t.at;
				t.fn();
				await settle();
			};
			now = end;
			return;
		}
	};
	return;
};

function harness(){
	const clock = fakeClock();
	const sent = [];
	const events = [];
	let hidden = false;
	const queue = B.createSaveQueue(
		{
			timers: clock.timers,
			now: clock.now,
			keepalive: function() {
				return hidden;
			},
			send: function(id,fields,{keepalive: keepalive}) {
				return new Promise(
					function(resolve,reject) {
						sent.push(
							{
								id: id,
								fields: {...fields},
								keepalive: keepalive,
								ok: async function(extra = {}) {
									resolve({ok: true,idea_id: id,vote: ((fields.vote ?? null)),note: ((fields.note ?? '')),...extra});
									await settle();
									return;
								},
								fail: async function(err) {
									reject(err);
									await settle();
									return;
								}
							}
						);
						return;
					}
				);
				return;
			},
			onSaved: function(id,data) {
				return events.push(['ok',id,data.note]);
			},
			onFailed: function(id,fields,err) {
				return events.push(['failed',id,err.status]);
			},
			onStatus: function(id,kind) {
				return events.push([kind,id]);
			}
		}
	);
	return {
		queue: queue,
		clock: clock,
		sent: sent,
		events: events,
		hide: function(v) {
			hidden = v;
			return;
		}
	};
	return;
};

const statuses = function(events,id) {
	return events.filter(
		function(e) {
			return ((e[1] === id) && (!['ok','failed'].includes(e[0])));
		}
	).map(
		function(e) {
			return e[0];
		}
	);
};

test(
	'normalizeBallot accepts the server and localStorage shapes and drops junk',
	function() {
		const raw = {'ops-weather': {vote: 'want',note: 'yes',updated_at: 5},'note-only': {vote: null,note: 'just a note'},'old-format': {vote: 'skip'},'bad-vote': {vote: 'pass',note: ''},empty: {vote: '',note: ''},Bad_Id: {vote: 'want'},'long-note': {vote: 'maybe',note: 'x'.repeat(400)},'not-object': 'want'};
		const out = B.normalizeBallot(raw);
		assert.deepEqual(Object.keys(out).sort(),['long-note','note-only','old-format','ops-weather']);
		assert.deepEqual(out['ops-weather'],{vote: 'want',note: 'yes',updated_at: 5});
		assert.deepEqual(out['note-only'],{vote: '',note: 'just a note'});
		assert.deepEqual(out['old-format'],{vote: 'skip',note: ''});
		assert.equal(out['long-note'].note.length,B.NOTE_MAX);
		for (let junk of [null,[],'x',5]){
			assert.deepEqual(B.normalizeBallot(junk),{});
		};
		return;
	}
);

test(
	'mergeBallot: the server wins except where the visitor is editing or saving',
	function() {
		const local = {a: {vote: 'want',note: ''},b: {vote: '',note: 'typing'},c: {vote: 'skip',note: ''}};
		const server = {a: {vote: 'maybe',note: 'from another device'},b: {vote: 'want',note: 'old'},d: {vote: 'skip',note: ''},e: {vote: 'want',note: ''}};
		const busy = new Set(['b','e']);
		assert.deepEqual(
			B.mergeBallot(
				local,
				server,
				function(id) {
					return busy.has(id);
				}
			),
			{a: {vote: 'maybe',note: 'from another device'},b: {vote: '',note: 'typing'},d: {vote: 'skip',note: ''}}
		);
		assert.deepEqual(
			B.mergeBallot(
				local,
				{},
				function() {
					return false;
				}
			),
			{},
			'an empty server ballot empties the page'
		);
		return;
	}
);

test(
	'mergeSuggestions keeps ones sent from this page that the server list missed',
	function() {
		const server = [{id: 2,title: 'two',detail: '',created_at: 20}];
		const local = [{id: 3,title: 'three',detail: '',created_at: 30},{id: 1,title: 'stale',detail: '',created_at: 10},{title: 'no id',detail: '',created_at: 5}];
		assert.deepEqual(
			B.mergeSuggestions(server,local,new Set([3]),50).map(
				function(s) {
					return s.id;
				}
			),
			[3,2]
		);
		assert.deepEqual(
			B.mergeSuggestions(server,local,new Set([3]),1).map(
				function(s) {
					return s.id;
				}
			),
			[3]
		);
		const normal = B.normalizeSuggestions([{id: 7,title: 't',created_at: 1},{title: 5},null,{id: 'x',title: 'u'}],50);
		assert.deepEqual(normal,[{id: 7,title: 't',detail: '',created_at: 1},{title: 'u',detail: '',created_at: 0}]);
		return;
	}
);

test(
	'adjustTally moves one voter between choices and never goes negative',
	function() {
		const t = {want: 1,maybe: 0,skip: 2};
		assert.deepEqual(B.adjustTally(t,'','want'),{want: 2,maybe: 0,skip: 2});
		assert.deepEqual(B.adjustTally(t,'want','maybe'),{want: 0,maybe: 1,skip: 2});
		assert.deepEqual(B.adjustTally(t,'skip',''),{want: 1,maybe: 0,skip: 1});
		assert.deepEqual(B.adjustTally(t,'maybe',''),{want: 1,maybe: 0,skip: 2});
		assert.deepEqual(B.adjustTally(t,'want','want'),t);
		assert.deepEqual(t,{want: 1,maybe: 0,skip: 2},'input untouched');
		return;
	}
);

test(
	'retry policy: network, 408, 429 and 5xx retry; other 4xx do not',
	function() {
		for (let err of [{},{status: 0},{status: 408},{status: 429},{status: 500},{status: 503}]){
			assert.ok(B.isTransient(err),JSON.stringify(err));
		};
		for (let status of [400,403,404,405,413,415]){
			assert.ok((!(B.isTransient({status: status}))),String(status));
		};
		assert.deepEqual(
			[1,2,3,4,7,8,20].map(
				function(n) {
					return B.retryDelay(n);
				}
			),
			[1000,2000,4000,8000,60000,60000,60000]
		);
		assert.equal(B.retryDelay(1,42),42000);
		assert.equal(B.retryDelay(5,0),1000);
		return;
	}
);

test(
	'debouncer: typing restarts the wait, and fire/fireAll run it at once',
	async function() {
		const clock = fakeClock();
		const d = B.createDebouncer(700,clock.timers);
		const runs = [];
		for (let text of ['h','he','hel']){
			d.schedule(
				'a',
				function() {
					return runs.push(text);
				}
			);
			await clock.advance(300);
		};
		assert.deepEqual(runs,[]);
		await clock.advance(399);
		assert.deepEqual(runs,[]);
		await clock.advance(1);
		assert.deepEqual(runs,['hel'],'one save, newest text');
		assert.ok((!d.has('a')));
		d.schedule(
			'a',
			function() {
				return runs.push('blur');
			}
		);
		d.schedule(
			'b',
			function() {
				return runs.push('b');
			}
		);
		d.fire('a');
		assert.deepEqual(runs,['hel','blur']);
		d.fireAll();
		assert.deepEqual(runs,['hel','blur','b']);
		await clock.advance(5000);
		assert.equal(runs.length,3,'fired timers do not run again');
		return;
	}
);

test(
	'queue: one request in flight per idea; newer fields coalesce and win',
	async function() {
		const {queue: queue,sent: sent,events: events} = harness();
		queue.change('a',{note: 'h'});
		queue.change('b',{vote: 'want'});
		assert.deepEqual(
			sent.map(
				function(s) {
					return [s.id,s.fields];
				}
			),
			[['a',{note: 'h'}],['b',{vote: 'want'}]],
			'ideas do not wait for each other'
		);
		queue.change('a',{note: 'he'});
		queue.change('a',{vote: 'skip'});
		queue.change('a',{note: 'hello'});
		assert.equal(sent.length,2,'nothing more is sent while a is in flight');
		assert.ok(queue.busy('a'));
		assert.deepEqual(queue.pending('a'),{note: 'hello',vote: 'skip'});
		await sent[0].ok();
		assert.equal(sent.length,3);
		assert.deepEqual(sent[2].fields,{note: 'hello',vote: 'skip'},'one follow-up with the newest of each field');
		assert.deepEqual(statuses(events,'a'),['saving','saving','saving','saving','saving'],'not "saved" while more is queued');
		await sent[2].ok();
		await sent[1].ok();
		assert.deepEqual(statuses(events,'a').at((- 1)),'saved');
		assert.deepEqual(statuses(events,'b'),['saving','saved']);
		assert.ok(((!queue.busy('a')) && (!queue.busy('b'))));
		assert.deepEqual(
			events.filter(
				function(e) {
					return (e[0] === 'ok');
				}
			).map(
				function(e) {
					return e.slice(1);
				}
			),
			[['a','h'],['a','hello'],['b','']]
		);
		return;
	}
);

test(
	'queue: a failed save retries with backoff and never sends an older note after a newer one',
	async function() {
		const {queue: queue,sent: sent,events: events,clock: clock} = harness();
		queue.change('a',{note: 'draft 1'});
		queue.change('a',{note: 'draft 2'});
		await sent[0].fail(new TypeError('Failed to fetch'));
		assert.equal(statuses(events,'a').at((- 1)),'retry');
		assert.equal(sent.length,1);
		await clock.advance(999);
		assert.equal(sent.length,1,'waits a second');
		await clock.advance(1);
		assert.deepEqual(sent[1].fields,{note: 'draft 2'});
		await sent[1].fail({status: 503});
		queue.change('a',{note: 'draft 3'});
		assert.equal(sent.length,2);
		assert.equal(statuses(events,'a').at((- 1)),'retry');
		await clock.advance(1999);
		assert.equal(sent.length,2,'second wait is two seconds');
		await clock.advance(1);
		assert.deepEqual(sent[2].fields,{note: 'draft 3'});
		await sent[2].ok();
		assert.equal(statuses(events,'a').at((- 1)),'saved');
		assert.deepEqual(
			events.filter(
				function(e) {
					return (e[0] === 'ok');
				}
			).map(
				function(e) {
					return e[2];
				}
			),
			['draft 3']
		);
		assert.ok(
			sent.every(
				function(s,n) {
					return ((n === 0) || (s.fields.note !== 'draft 1'));
				}
			),
			'draft 1 is never resent'
		);
		return;
	}
);

test(
	'queue: 429 holds every idea until Retry-After, then sends them all',
	async function() {
		const {queue: queue,sent: sent,events: events,clock: clock} = harness();
		queue.change('a',{vote: 'want'});
		await sent[0].fail({status: 429,retryAfter: 5});
		queue.change('b',{note: 'while held'});
		assert.equal(sent.length,1,'b waits for the hold too');
		assert.equal(statuses(events,'b').at((- 1)),'retry');
		await clock.advance(4999);
		assert.equal(sent.length,1);
		await clock.advance(1);
		assert.deepEqual(
			sent.slice(1).map(
				function(s) {
					return [s.id,s.fields];
				}
			).sort(),
			[['a',{vote: 'want'}],['b',{note: 'while held'}]]
		);
		return;
	}
);

test(
	'queue: a refused save is reported once and not retried; a bad answer body is retried',
	async function() {
		const {queue: queue,sent: sent,events: events,clock: clock} = harness();
		queue.change('gone',{vote: 'want'});
		await sent[0].fail({status: 404});
		assert.deepEqual(
			events.filter(
				function(e) {
					return (e[0] === 'failed');
				}
			),
			[['failed','gone',404]]
		);
		assert.equal(statuses(events,'gone').at((- 1)),'error');
		assert.ok((!queue.busy('gone')));
		await clock.advance(120000);
		assert.equal(sent.length,1);
		queue.change('x',{note: 'one'});
		queue.change('x',{note: 'two'});
		await sent[1].fail({status: 400});
		assert.deepEqual(sent[2].fields,{note: 'two'});
		queue.change('y',{vote: 'maybe'});
		const y = sent.at((- 1));
		await y.ok({ok: undefined});
		assert.ok(
			(!(events.some(
				function(e) {
					return ((e[0] === 'ok') && (e[1] === 'y'));
				}
			)))
		);
		assert.equal(statuses(events,'y').at((- 1)),'retry');
		return;
	}
);

test(
	'queue: flush on hide sends waiting changes now with keepalive; pagehide also resends what is in flight',
	async function() {
		const {queue: queue,sent: sent,events: events,hide: hide} = harness();
		queue.change('offline',{note: 'typed on a train'});
		await sent[0].fail(new TypeError('offline'));
		queue.change('flying',{note: 'v1'});
		const flying = sent[1];
		assert.equal(flying.keepalive,false);
		queue.change('flying',{vote: 'want'});
		hide(true);
		queue.flush(false);
		assert.deepEqual(
			sent.slice(2).map(
				function(s) {
					return [s.id,s.fields,s.keepalive];
				}
			),
			[['offline',{note: 'typed on a train'},true]]
		);
		queue.change('late',{note: 'sent while hidden'});
		assert.equal(sent.at((- 1)).keepalive,true,'anything sent while hidden uses keepalive');
		const count = sent.length;
		queue.flush(true);
		const resent = sent.slice(count);
		assert.deepEqual(
			resent.map(
				function(s) {
					return [s.id,s.fields,s.keepalive];
				}
			),
			[['flying',{note: 'v1',vote: 'want'},true]]
		);
		queue.flush(true);
		assert.equal(sent.length,(count + 1),'keepalive requests in flight are not sent twice');
		await flying.ok({note: 'v1'});
		assert.ok(
			(!(events.some(
				function(e) {
					return ((e[0] === 'ok') && (e[1] === 'flying'));
				}
			)))
		);
		await resent[0].ok();
		assert.deepEqual(
			events.filter(
				function(e) {
					return ((e[0] === 'ok') && (e[1] === 'flying'));
				}
			).map(
				function(e) {
					return e[2];
				}
			),
			['v1']
		);
		assert.ok((!queue.busy('flying')));
		return;
	}
);

test(
	'queue: flush respects a 429 hold unless forced',
	async function() {
		const {queue: queue,sent: sent,clock: clock} = harness();
		queue.change('a',{vote: 'skip'});
		await sent[0].fail({status: 429,retryAfter: 30});
		queue.flush(false);
		assert.equal(sent.length,1,'still held');
		await clock.advance(1000);
		queue.flush(true);
		assert.equal(sent.length,2);
		assert.deepEqual([sent[1].fields,sent[1].keepalive],[{vote: 'skip'},true]);
		return;
	}
);

test(
	'ballotLost: an empty api/mine after this page saved something does not wipe the page',
	function() {
		const local = {a: {vote: 'want',note: ''}};
		const sugg = [{id: 1,title: 'x',detail: '',created_at: 1}];
		assert.equal(B.ballotLost({},[],local,[],true),true,'cookie not kept: keep the page');
		assert.equal(B.ballotLost({},[],{},sugg,true),true);
		assert.equal(B.ballotLost({},[],local,[],false),false,'no write yet (new or cleared cookie): the server wins');
		assert.equal(B.ballotLost({},[],{},[],true),false,'nothing to lose');
		assert.equal(B.ballotLost({b: {vote: 'skip',note: ''}},[],local,[],true),false,'a real ballot always wins');
		assert.equal(B.ballotLost({},sugg,local,[],true),false);
		return;
	}
);

test(
	'noteNeedsRewrite: never over unsaved text, never a caret jump for the server trimming a save',
	function() {
		assert.equal(B.noteNeedsRewrite('old','new',false,false),true);
		assert.equal(B.noteNeedsRewrite('same','same',false,false),false);
		assert.equal(B.noteNeedsRewrite('typing','server',true,true),false);
		assert.equal(B.noteNeedsRewrite('typing','server',false,true),false);
		assert.equal(B.noteNeedsRewrite('hello ','hello',true,false),false);
		assert.equal(B.noteNeedsRewrite('old note','newer note from tab 2',true,false),true);
		assert.equal(B.noteNeedsRewrite('kept','',true,false),true);
		return;
	}
);

test(
	'queue: with keepalive on every save, pagehide sends only what is newer than the request in flight',
	async function() {
		const clock = fakeClock();
		const sent = [];
		const queue = B.createSaveQueue(
			{
				timers: clock.timers,
				now: clock.now,
				keepalive: function() {
					return true;
				},
				send: function(id,fields,{keepalive: keepalive}) {
					return new Promise(
						function(resolve) {
							return sent.push(
								{
									id: id,
									fields: {...fields},
									keepalive: keepalive,
									ok: function() {
										return resolve({ok: true,idea_id: id,note: ''});
									}
								}
							);
						}
					);
					return;
				},
				onSaved: function() {
					undefined;
					return;
				},
				onFailed: function() {
					undefined;
					return;
				},
				onStatus: function() {
					undefined;
					return;
				}
			}
		);
		queue.change('a',{vote: 'want'});
		queue.change('b',{note: 'x'});
		assert.ok(
			sent.every(
				function(s) {
					return s.keepalive;
				}
			),
			'ordinary saves already use keepalive'
		);
		queue.flush(true);
		assert.equal(sent.length,2,'requests in flight with keepalive are not sent again');
		queue.change('b',{vote: 'skip'});
		queue.flush(true);
		assert.deepEqual(
			sent.slice(2).map(
				function(s) {
					return [s.id,s.fields,s.keepalive];
				}
			),
			[['b',{note: 'x',vote: 'skip'},true]]
		);
		sent[0].ok();
		await settle();
		assert.ok((!queue.busy('a')));
		return;
	}
);
