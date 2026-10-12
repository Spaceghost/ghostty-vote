// Generated from imba/src/app.imba; edit the Imba source.
import {iterable$} from 'imba/runtime';

/*body*/
// The Worker's whole job: the ballot API (vote, suggest, tallies, mine), sign-in
// (auth/*, in auth.js), the owner's voter list (admin/voters) and the screenshot
// gallery's upload, approved list, images and moderation queue (gallery.js), and the
// Almanac leaderboard's submissions, aggregates and moderation (almanac.js).
// Everything else on the route is a static asset served without invoking this code.
// D1 budget: a write costs one read query plus one batch; a tally read costs one
// query per edge location per minute (the rest are answered from the Cache API);
// api/mine costs one batch, and nothing at all for a request without a session.
// Writing needs a signed-in session (session.js); the voter is its account key.
import {getAdminVoters,getMe,finishAuth,postForgetCharacter,postLogout,startAuth} from './auth.js';

import {authorize,banned} from './account.js';

import {getAdminAccounts,getApps,postAdminBan,postAdminTokenRevoke,postAppRevoke,postDeviceApprove,postDeviceCode,postDeviceLookup,postDeviceToken,postTokenRevoke} from './device.js';

import {API_PREFIX,LIMITS,PRIVATE,isSameOrigin,json,readJsonBody,route,validateSuggestion,validateVote,voteMod} from './lib.js';

import {readSession} from './session.js';

import {getAdminAlmanac,getAggregate,postAdminAlmanacReview,postAdminAlmanacSuite,postResult} from './almanac.js';

import {getPluginMaster} from './plugins.js';

import {getAdminGallery,getAdminImage,getMyShotVotes,getPublicImage,getShots,postAdminReview,postAdminThumb,postMemberUpload,postShotVote,postUpload} from './gallery.js';

const WRITES = {vote: [validateVote,postVote],suggest: [validateSuggestion,postSuggest]};

const HANDLERS = {
	tallies: function(request,env,ctx,url,cache) {
		return getTallies(env,ctx,url,cache);
	},
	mine: function(request,env,ctx,url) {
		return getMine(request,env,url);
	},
	vote: function(request,env,ctx,url) {
		return serveWrite(request,env,url,'vote');
	},
	suggest: function(request,env,ctx,url) {
		return serveWrite(request,env,url,'suggest');
	},
	'auth/github/start': function(request,env,ctx,url) {
		return startAuth(request,env,url,'github','signin');
	},
	'auth/xivauth/start': function(request,env,ctx,url) {
		return startAuth(request,env,url,'xivauth','signin');
	},
	'auth/xivauth/link': function(request,env,ctx,url) {
		return startAuth(request,env,url,'xivauth','link');
	},
	'auth/github/callback': function(request,env,ctx,url,cache,fetcher) {
		return finishAuth(request,env,url,'github',fetcher);
	},
	'auth/xivauth/callback': function(request,env,ctx,url,cache,fetcher) {
		return finishAuth(request,env,url,'xivauth',fetcher);
	},
	'auth/me': function(request,env,ctx,url) {
		return getMe(request,env,url);
	},
	'auth/logout': function(request,env,ctx,url) {
		return postLogout(request,env,url);
	},
	'auth/character/forget': function(request,env,ctx,url) {
		return postForgetCharacter(request,env,url);
	},
	'admin/voters': function(request,env,ctx,url) {
		return getAdminVoters(request,env,url);
	},
	'admin/gallery': function(request,env,ctx,url) {
		return getAdminGallery(request,env,url);
	},
	'admin/gallery/image': function(request,env,ctx,url) {
		return getAdminImage(request,env,url);
	},
	'admin/gallery/review': function(request,env,ctx,url,cache) {
		return postAdminReview(request,env,url,cache);
	},
	'admin/gallery/thumb': function(request,env,ctx,url) {
		return postAdminThumb(request,env,url);
	},
	'shots/upload': function(request,env,ctx,url) {
		return postMemberUpload(request,env,url);
	},
	'gallery/upload': function(request,env,ctx,url) {
		return postUpload(request,env,url);
	},
	'gallery/shots': function(request,env,ctx,url,cache) {
		return getShots(env,ctx,url,cache);
	},
	'gallery/vote': function(request,env,ctx,url) {
		return postShotVote(request,env,url);
	},
	'gallery/mine': function(request,env,ctx,url) {
		return getMyShotVotes(request,env,url);
	},
	'gallery/img': function(request,env,ctx,url,cache,fetcher,r) {
		return getPublicImage(env,r.id,false);
	},
	'gallery/thumb': function(request,env,ctx,url,cache,fetcher,r) {
		return getPublicImage(env,r.id,true);
	},
	'device/code': function(request,env,ctx,url) {
		return postDeviceCode(request,env,url);
	},
	'device/token': function(request,env,ctx,url) {
		return postDeviceToken(request,env,url);
	},
	'device/lookup': function(request,env,ctx,url) {
		return postDeviceLookup(request,env,url);
	},
	'device/approve': function(request,env,ctx,url) {
		return postDeviceApprove(request,env,url);
	},
	apps: function(request,env,ctx,url) {
		return getApps(request,env,url);
	},
	'apps/revoke': function(request,env,ctx,url) {
		return postAppRevoke(request,env,url);
	},
	'token/revoke': function(request,env,ctx,url) {
		return postTokenRevoke(request,env,url);
	},
	'admin/accounts': function(request,env,ctx,url) {
		return getAdminAccounts(request,env,url);
	},
	'admin/accounts/ban': function(request,env,ctx,url) {
		return postAdminBan(request,env,url);
	},
	'admin/tokens/revoke': function(request,env,ctx,url) {
		return postAdminTokenRevoke(request,env,url);
	},
	plugins: function(request,env,ctx,url,cache,fetcher) {
		return getPluginMaster(request,env,ctx,url,cache,fetcher);
	},
	'almanac/results': function(request,env,ctx,url) {
		return postResult(request,env,url);
	},
	'almanac/leaderboard': function(request,env,ctx,url,cache) {
		return getAggregate(env,ctx,url,cache,'leaderboard');
	},
	'almanac/recommendations': function(request,env,ctx,url,cache) {
		return getAggregate(env,ctx,url,cache,'recommendations');
	},
	'admin/almanac': function(request,env,ctx,url) {
		return getAdminAlmanac(request,env,url);
	},
	'admin/almanac/review': function(request,env,ctx,url,cache) {
		return postAdminAlmanacReview(request,env,url,cache);
	},
	'admin/almanac/suite': function(request,env,ctx,url,cache) {
		return postAdminAlmanacSuite(request,env,url,cache);
	}
};

export async function handle(request,env,ctx,cache = function() {
	let cursor$1 = globalThis;
	let cursor$2 = undefined;
	cursor$2 = cursor$1;
	cursor$1 = cursor$1.caches;
	if (cursor$1 == null) {
		return undefined;
	};
	cursor$2 = cursor$1;
	cursor$1 = cursor$1.default;
	return cursor$1;
}(),fetcher = function(...args) {
	return fetch(...args);
}){
	const url = new URL(request.url);
	const r = route(url.pathname);
	if ((r.kind !== 'api')) {
		return new Response('Not found\n',{status: 404,headers: {'content-type': 'text/plain; charset=utf-8'}});
	};
	if ((request.method !== r.method)) {
		return json({error: 'method_not_allowed'},{status: 405,headers: {allow: r.method}});
	};
	try {
		return (await HANDLERS[r.name](request,env,ctx,url,cache,fetcher,r));
	} catch (err) {
		console.error('ghostty-vote:',((err && err.stack) ? err.stack : String(err)));
		return json({error: 'server_error',message: 'Something went wrong; try again shortly.'},{status: 500});
	};
	return;
};

async function getTallies(env,ctx,url,cache){
	const mod = voteMod(url.searchParams.get('mod'));
	if ((mod === null)) {
		return json({error: 'unknown_mod',message: 'No vote for that mod.'},{status: 404});
	};
	const key = new Request((((url.origin + API_PREFIX) + 'tallies?mod=') + mod));
	if (cache) {
		const hit = (await cache.match(key));
		if (hit) {
			return hit;
		};
	};
	const {results: results} = (await env.DB.prepare('SELECT id, want, maybe, skip FROM ideas WHERE retired = 0 AND mod = ?').bind(mod).all());
	const tallies = {};
	for (let {id: id,want: want,maybe: maybe,skip: skip} of iterable$(results)){
		tallies[id] = {want: want,maybe: maybe,skip: skip};
	};
	const res = json(tallies,{headers: {'cache-control': ('public, max-age=' + String(LIMITS.tallyTtlSeconds) + '')}});
	if (cache) {
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

async function getMine(request,env,url){
	if ((!isSameOrigin(request,url))) {
		return json({error: 'forbidden',message: 'Cross-site request refused.'},{status: 403,headers: PRIVATE});
	};
	const mod = voteMod(url.searchParams.get('mod'));
	if ((mod === null)) {
		return json({error: 'unknown_mod',message: 'No vote for that mod.'},{status: 404,headers: PRIVATE});
	};
	const mine = {signed_in: false,votes: {},suggestions: []};
	const session = (await readSession(request,env));
	if ((!session)) {
		return json(mine,{headers: PRIVATE});
	};
	mine.signed_in = true;
	const voter = session.k;
	const [votes,suggestions] = (await env.DB.batch([env.DB.prepare(('SELECT votes.idea_id, votes.vote, votes.note, votes.updated_at\n       FROM votes JOIN ideas ON ideas.id = votes.idea_id WHERE votes.voter = ? AND ideas.mod = ?')).bind(voter,mod),env.DB.prepare('SELECT id, title, detail, created_at FROM suggestions WHERE voter = ? AND mod = ? ORDER BY created_at DESC, id DESC LIMIT ?').bind(voter,mod,LIMITS.mySuggestions)]));
	for (let {idea_id: ideaId,vote: vote,note: note,updated_at: updatedAt} of iterable$(votes.results)){
		mine.votes[ideaId] = {vote: (vote || null),note: note,updated_at: updatedAt};
	};
	mine.suggestions = suggestions.results;
	return json(mine,{headers: PRIVATE});
	return;
};

async function serveWrite(request,env,url,name){
	if ((!isSameOrigin(request,url))) {
		return json({error: 'forbidden',message: 'Cross-site request refused.'},{status: 403});
	};
	const auth = (await authorize(request,env,url,null,{deferBan: true}));
	if ((!auth.ok)) {
		return auth.response;
	};
	const body = (await readJsonBody(request));
	if ((!body.ok)) {
		return json({error: body.error,message: body.message},{status: body.status});
	};
	const [validate,write] = WRITES[name];
	const input = validate(body.value);
	if ((!input.ok)) {
		return json({error: input.error,message: input.message},{status: input.status});
	};
	return write(env,auth.account,input.value,Date.now());
	return;
};

const WINDOW_SQL = 'COUNT(*) AS n, MIN(at) AS oldest, EXISTS (SELECT 1 FROM account_bans WHERE account = ?1) AS banned';

function rateLimited(row,now){
	if (((!row) || (row.n < LIMITS.writesPerWindow))) {
		return null;
	};
	const retry = Math.max(1,Math.ceil((((row.oldest + LIMITS.windowMs) - now) / 1000)));
	return json({error: 'rate_limited',message: 'That is a lot of changes at once; try again in a few minutes.'},{status: 429,headers: {'retry-after': String(retry)}});
	return;
};

function logWrite(env,voter,now){
	return [env.DB.prepare('INSERT INTO write_log (voter, at) VALUES (?, ?)').bind(voter,now),env.DB.prepare('DELETE FROM write_log WHERE at <= ?').bind((now - LIMITS.windowMs))];
	return;
};

const tallyOf = function(row) {
	return {
		want: ((function() {
			let cursor$3 = row;
			let cursor$4 = undefined;
			if (cursor$3 == null) {
				return undefined;
			};
			cursor$4 = cursor$3;
			cursor$3 = cursor$3.want;
			return cursor$3;
		}() ?? 0)),
		maybe: ((function() {
			let cursor$5 = row;
			let cursor$6 = undefined;
			if (cursor$5 == null) {
				return undefined;
			};
			cursor$6 = cursor$5;
			cursor$5 = cursor$5.maybe;
			return cursor$5;
		}() ?? 0)),
		skip: ((function() {
			let cursor$7 = row;
			let cursor$8 = undefined;
			if (cursor$7 == null) {
				return undefined;
			};
			cursor$8 = cursor$7;
			cursor$7 = cursor$7.skip;
			return cursor$7;
		}() ?? 0))
	};
};

async function postVote(env,{p: provider,k: voter},{idea_id: ideaId,vote: vote,note: note},now){
	const pre = (await env.DB.prepare(('SELECT ' + String(WINDOW_SQL) + ', EXISTS (SELECT 1 FROM ideas WHERE id = ?3 AND retired = 0) AS known\n     FROM write_log WHERE voter = ?1 AND at > ?2')).bind(voter,(now - LIMITS.windowMs),ideaId).first());
	if (function() {
		let cursor$9 = pre;
		let cursor$10 = undefined;
		if (cursor$9 == null) {
			return undefined;
		};
		cursor$10 = cursor$9;
		cursor$9 = cursor$9.banned;
		return cursor$9;
	}()) {
		return banned();
	};
	const limited = rateLimited(pre,now);
	if (limited) {
		return limited;
	};
	if (((!pre) || (!pre.known))) {
		return json({error: 'unknown_idea',message: 'No such idea.'},{status: 404});
	};
	const results = (await env.DB.batch([...logWrite(env,voter,now),env.DB.prepare(('INSERT INTO votes (voter, idea_id, vote, note, created_at, updated_at, provider)\n       VALUES (?1, ?2, COALESCE(?3, \'\'), COALESCE(?4, \'\'), ?5, ?5, ?6)\n       ON CONFLICT (voter, idea_id) DO UPDATE SET\n         vote = COALESCE(?3, votes.vote), note = COALESCE(?4, votes.note), updated_at = excluded.updated_at, provider = ?6\n       RETURNING vote, note, updated_at')).bind(voter,ideaId,vote,note,now,provider),env.DB.prepare('DELETE FROM votes WHERE voter = ? AND idea_id = ? AND vote = \'\' AND note = \'\'').bind(voter,ideaId),env.DB.prepare('SELECT want, maybe, skip FROM ideas WHERE id = ?').bind(ideaId)]));
	const row = results[2].results[0];
	return json({ok: true,idea_id: ideaId,vote: (row.vote || null),note: row.note,tally: tallyOf(results[4].results[0]),updated_at: row.updated_at});
	return;
};

async function postSuggest(env,{p: provider,k: voter},{title: title,detail: detail,mod: mod},now){
	const since = (now - LIMITS.dayMs);
	const pre = (await env.DB.prepare(('SELECT ' + String(WINDOW_SQL) + ',\n            (SELECT COUNT(*) FROM suggestions WHERE voter = ?1 AND created_at > ?3) AS mine,\n            (SELECT COUNT(*) FROM suggestions WHERE created_at > ?3) AS today\n     FROM write_log WHERE voter = ?1 AND at > ?2')).bind(voter,(now - LIMITS.windowMs),since).first());
	if (function() {
		let cursor$11 = pre;
		let cursor$12 = undefined;
		if (cursor$11 == null) {
			return undefined;
		};
		cursor$12 = cursor$11;
		cursor$11 = cursor$11.banned;
		return cursor$11;
	}()) {
		return banned();
	};
	const limited = rateLimited(pre,now);
	if (limited) {
		return limited;
	};
	if ((pre.mine >= LIMITS.suggestionsPerVoterPerDay)) {
		return json({error: 'suggestion_limit',message: 'That is plenty of ideas for one day; thank you! Try again tomorrow.'},{status: 429});
	};
	if ((pre.today >= LIMITS.suggestionsPerDay)) {
		return json({error: 'suggestions_full',message: 'The suggestion box is full for today; try again tomorrow.'},{status: 429});
	};
	const results = (await env.DB.batch([...logWrite(env,voter,now),env.DB.prepare('INSERT INTO suggestions (voter, title, detail, created_at, provider, mod) VALUES (?, ?, ?, ?, ?, ?) RETURNING id, title, detail, created_at').bind(voter,title,detail,now,provider,mod)]));
	return json({ok: true,suggestion: results[2].results[0]},{status: 201});
	return;
};
