// Generated from imba/src/scrobble.imba; edit the Imba source.
import {iterable$} from 'imba/runtime';

/*body*/
// Private ListenBrainz-compatible ingestion and signed-session dashboard controls.
// A D1 batch commits history + per-destination outbox before any external request.
import {PRIVATE,isSameOrigin,json,randomToken,readJsonBody,sha256hex} from './lib.js';
import {readSession} from './session.js';
import {isBanned} from './account.js';
import {SCROBBLE_BASE,SCROBBLE_BROWSER,SCROBBLE_BODY_BYTES,SCROBBLE_RETENTION_MS,ScrobbleError,cursor,problem,submission,text} from './scrobble-data.js';
import {DeliveryError,beginLastfm,decryptCredentials,encryptCredentials,encryptionReady,finishLastfm,validateListenBrainz} from './scrobble-providers.js';
import {drainScrobbles} from './scrobble-queue.js';

const BROWSER_METHODS = Object.freeze({state: 'GET',export: 'GET',tokens: 'POST','tokens/revoke': 'POST','providers/listenbrainz': 'POST','providers/lastfm/start': 'POST','providers/lastfm/finish': 'POST','providers/disconnect': 'POST','history/delete': 'POST',retry: 'POST'});
const CLIENT_TOKEN = new RegExp('^Token (sgs_[A-Za-z0-9_-]{43})$','i');
const NO_CACHE = {...PRIVATE,'referrer-policy': 'no-referrer','x-content-type-options': 'nosniff'};

function response(value,status = 200,headers = {}){
	return json(value,{status: status,headers: {...NO_CACHE,...headers}});
};

function userName(account){
	return account.provider + '-' + account.account.slice(0,12);
};

function providerName(value){
	if (!['listenbrainz','lastfm'].includes(value)) {
		problem(400,'invalid_provider','Choose ListenBrainz or Last.fm.');
	};
	return value;
};

function validAccountSQL(){
	return 'EXISTS (SELECT 1 FROM scrobble_accounts a JOIN scrobble_tokens t ON t.account=a.account WHERE a.account=?1 AND a.epoch=?2 AND t.id=?3 AND t.revoked_at=0 AND NOT EXISTS (SELECT 1 FROM account_bans b WHERE b.account=a.account))';
};

async function clientAccount(request,env){
	const match = CLIENT_TOKEN.exec(request.headers.get('authorization') || '');
	if (!match) {
		problem(401,'invalid_token','Use Authorization: Token followed by your Spaceghost client token.');
	};
	const row = await env.DB.prepare('SELECT a.account,a.provider,a.epoch,t.id AS token_id,t.last_used_at FROM scrobble_tokens t JOIN scrobble_accounts a ON a.account=t.account WHERE t.token_hash=? AND t.revoked_at=0 AND NOT EXISTS (SELECT 1 FROM account_bans b WHERE b.account=a.account)').bind(await sha256hex(match[1])).first();
	if (!row) {
		problem(401,'invalid_token','This client token is invalid or revoked.');
	};
	return row;
};

async function accountRecord(env,session){
	await env.DB.prepare('INSERT OR IGNORE INTO scrobble_accounts(account,provider,epoch,created_at) VALUES(?,?,?,?)').bind(session.k,session.p,randomToken(16),Date.now()).run();
	return await env.DB.prepare('SELECT account,provider,epoch FROM scrobble_accounts WHERE account=?').bind(session.k).first();
};

async function bodyValue(request,max = 16384){
	const parsed = await readJsonBody(request,max);
	if (!parsed.ok) {
		problem(parsed.status,parsed.error,parsed.message);
	};
	return parsed.value;
};

async function scheduleDrain(env,ctx,fetcher){
	// Two provider timeouts leave room for D1 work within HTTP waitUntil's 30s.
	const task = drainScrobbles(env,fetcher,2).catch(function() {
		return console.warn('scrobble_queue: deferred_delivery_failed');
	});
	if (ctx && typeof ctx.waitUntil === 'function') {
		return ctx.waitUntil(task);
	} else {
		return await task;
	};
};

async function ingest(request,env,ctx,fetcher,account){
	const now = Date.now();
	const input = submission(await bodyValue(request,SCROBBLE_BODY_BYTES),now);
	const rate = await env.DB.prepare('INSERT INTO scrobble_rate(account,bucket,count) VALUES(?,?,1) ON CONFLICT(account,bucket) DO UPDATE SET count=count+1 WHERE count<120 RETURNING count').bind(account.account,Math.floor(now / 60000)).first();
	if (!rate) {
		return response({error: 'rate_limited',message: 'Try again in one minute.'},429,{'retry-after': '60'});
	};
	const db = env.DB;
	const statements = [];
	const condition = validAccountSQL();
	const kind = (input.listen_type === 'playing_now') ? 'playing_now' : 'single';
	const ingestion = randomToken(16);
	const rows = [];
	for (let entry of iterable$(input.payload)){
		const timestamp = entry.listened_at || Math.floor(now / 1000);
		// Optional client annotations are excluded from the deduplication identity.
		const identity = [account.account,kind,(kind === 'playing_now') ? Math.floor(now / 30000) : timestamp,entry.track_metadata.artist_name,entry.track_metadata.track_name,entry.track_metadata.release_name || ''];
		rows.push({id: await sha256hex(JSON.stringify(identity)),timestamp: timestamp,metadata: JSON.stringify(entry.track_metadata)});
	};
	if (kind === 'playing_now') {
		const row = rows[0];
		statements.push(db.prepare("UPDATE scrobble_outbox SET status='cancelled',last_error='superseded',lease='',lease_until=0,updated_at=?4 WHERE account=?1 AND kind='playing_now' AND listen_id<>?5 AND status IN ('pending','retry','sending') AND " + condition).bind(account.account,account.epoch,account.token_id,now,row.id));
		statements.push(db.prepare('INSERT INTO scrobble_nowplaying(account,id,metadata,updated_at,expires_at) SELECT ?1,?4,?5,?6,?7 WHERE ' + condition + ' ON CONFLICT(account) DO UPDATE SET id=excluded.id,metadata=excluded.metadata,updated_at=excluded.updated_at,expires_at=excluded.expires_at').bind(account.account,account.epoch,account.token_id,row.id,row.metadata,now,now + 300000));
		statements.push(db.prepare("INSERT OR IGNORE INTO scrobble_outbox(id,account,provider,generation,listen_id,kind,listened_at,metadata,next_attempt_at,created_at,updated_at) SELECT ?4||':'||p.provider||':'||p.generation,?1,p.provider,p.generation,?4,'playing_now',?5,?6,?7,?7,?7 FROM scrobble_providers p WHERE p.account=?1 AND p.status='connected' AND " + condition).bind(account.account,account.epoch,account.token_id,row.id,row.timestamp,row.metadata,now));
	} else {
		// JSON1 keeps an import to two statements, independent of its listen count.
		const encoded = JSON.stringify(rows);
		const idSQL = "json_extract(j.value,'$.id')";
		const quota = '(SELECT COUNT(*) FROM scrobble_listens WHERE account=?1)+(SELECT COUNT(DISTINCT ' + idSQL + ') FROM json_each(?4) j WHERE NOT EXISTS(SELECT 1 FROM scrobble_listens l WHERE l.account=?1 AND l.id=' + idSQL + '))<=100000';
		statements.push(db.prepare("WITH permitted AS MATERIALIZED(SELECT (" + condition + ") AND (" + quota + ") AS allowed) INSERT OR IGNORE INTO scrobble_listens(account,id,listened_at,metadata,ingestion_id,created_at) SELECT ?1,json_extract(j.value,'$.id'),json_extract(j.value,'$.timestamp'),json_extract(j.value,'$.metadata'),?5,?6 FROM json_each(?4) j,permitted WHERE permitted.allowed").bind(account.account,account.epoch,account.token_id,encoded,ingestion,now));
		// Only newly stored listens enqueue deliveries. Reconnection never replays
		// old history, and a retried submission cannot duplicate a delivery.
		statements.push(db.prepare("INSERT OR IGNORE INTO scrobble_outbox(id,account,provider,generation,listen_id,kind,listened_at,metadata,next_attempt_at,created_at,updated_at) SELECT l.id||':'||p.provider||':'||p.generation,?1,p.provider,p.generation,l.id,'single',l.listened_at,l.metadata,?5,?5,?5 FROM scrobble_providers p JOIN scrobble_listens l ON l.account=p.account WHERE p.account=?1 AND p.status='connected' AND l.ingestion_id=?4 AND " + condition).bind(account.account,account.epoch,account.token_id,ingestion,now));
		statements.push(db.prepare("SELECT COUNT(*) AS missing FROM json_each(?1) j WHERE NOT EXISTS(SELECT 1 FROM scrobble_listens l WHERE l.account=?2 AND l.id=json_extract(j.value,'$.id'))").bind(encoded,account.account));
	};
	statements.push(db.prepare('UPDATE scrobble_tokens SET last_used_at=?4 WHERE id=?3 AND last_used_at<?4-3600000 AND ' + condition).bind(account.account,account.epoch,account.token_id,now));
	statements.push(db.prepare('SELECT ' + condition + ' AS valid').bind(account.account,account.epoch,account.token_id));
	const result = await db.batch(statements);
	if (result[result.length - 1].results[0].valid !== 1) {
		problem(409,'session_changed','Your token or history changed during this submission; retry with a valid token.');
	};
	if (kind === 'single' && result[result.length - 3].results[0].missing > 0) {
		problem(409,'history_full','Export or delete history before submitting more listens.');
	};
	await scheduleDrain(env,ctx,fetcher);
	return response({status: 'ok'});
};

async function historyPage(env,account,url,limit){
	const page = cursor(url);
	const result = await env.DB.prepare('SELECT id,listened_at,metadata FROM scrobble_listens WHERE account=?1 AND created_at>?5 AND (listened_at<?2 OR (listened_at=?2 AND id<?3)) ORDER BY listened_at DESC,id DESC LIMIT ?4').bind(account,page.before,page.id,limit + 1,Date.now() - SCROBBLE_RETENTION_MS).all();
	const rows = result.results.slice(0,limit);
	const last = rows[rows.length - 1];
	return {rows: rows,next_cursor: (result.results.length > limit && last) ? {before: last.listened_at,cursor: last.id} : null};
};

async function state(env,session,url){
	if (!session) {
		return response({signed_in: false});
	};
	const key = session.k;
	const [tokens,providers,counts,playing,forwarding] = await env.DB.batch([
		env.DB.prepare('SELECT id,label,prefix,created_at,last_used_at,revoked_at FROM scrobble_tokens WHERE account=? ORDER BY (revoked_at=0) DESC,created_at DESC LIMIT 50').bind(key),
		env.DB.prepare('SELECT * FROM scrobble_providers WHERE account=?').bind(key),
		env.DB.prepare('SELECT (SELECT COUNT(*) FROM scrobble_listens WHERE account=?1) AS listens,(SELECT COUNT(*) FROM scrobble_outbox WHERE account=?1 AND status IN (\'pending\',\'retry\',\'sending\')) AS pending,(SELECT COUNT(*) FROM scrobble_outbox WHERE account=?1 AND status=\'failed\') AS failed').bind(key),
		env.DB.prepare('SELECT metadata,updated_at,expires_at FROM scrobble_nowplaying WHERE account=? AND expires_at>?').bind(key,Date.now()),
		env.DB.prepare('SELECT provider,status,COUNT(*) AS n FROM scrobble_outbox WHERE account=? GROUP BY provider,status').bind(key)
	]);
	const providerState = {};
	for (let name of ['listenbrainz','lastfm']){
		const row = providers.results.find(function(value) { return value.provider === name; });
		const value = {connected: !!row && row.status === 'connected',auth_pending: !!row && row.status === 'pending_auth',user_name: (row && row.user_name) || '',status: (row && row.status) || 'disconnected',updated_at: (row && row.updated_at) || 0,pending: 0,failed: 0,last_error: ''};
		for (let count of iterable$(forwarding.results.filter(function(item) { return item.provider === name; }))){
			if (['pending','retry','sending'].includes(count.status)) {
				value.pending += count.n;
			};
			if (count.status === 'failed') {
				value.failed += count.n;
			};
		};
		if (row) {
			const error = await env.DB.prepare('SELECT last_error FROM scrobble_outbox WHERE account=? AND provider=? AND last_error<>\'\' AND status IN (\'failed\',\'retry\') ORDER BY updated_at DESC LIMIT 1').bind(key,name).first();
			value.last_error = (error && error.last_error) || '';
			if (value.auth_pending && name === 'lastfm') {
				try {
					const creds = await decryptCredentials(env,row);
					if (creds.token && Date.now() - creds.started_at <= 3600000) {
						value.authorize_url = 'https://www.last.fm/api/auth/?' + new URLSearchParams({api_key: creds.api_key,token: creds.token}).toString();
					};
				} catch ($1) {
					value.last_error = 'credentials_unavailable';
				};
			};
		};
		providerState[name] = value;
	};
	const page = await historyPage(env,key,url,50);
	const deliveries = await env.DB.prepare('SELECT listen_id,provider,status,attempts,last_error FROM scrobble_outbox WHERE account=?1 AND kind=\'single\' AND listen_id IN(SELECT value FROM json_each(?2)) ORDER BY updated_at DESC LIMIT 400').bind(key,JSON.stringify(page.rows.map(function(row) { return row.id; }))).all();
	const history = page.rows.map(function(row) {
		return {id: row.id,listened_at: row.listened_at,track_metadata: JSON.parse(row.metadata),forwarding: deliveries.results.filter(function(value) { return value.listen_id === row.id; }).slice(0,8)};
	});

	const now = playing.results[0];
	return response({signed_in: true,user_name: userName({provider: session.p,account: key}),tokens: tokens.results,providers: providerState,history: history,next_cursor: page.next_cursor,now_playing: now ? {track_metadata: JSON.parse(now.metadata),updated_at: now.updated_at,expires_at: now.expires_at} : null,counts: counts.results[0],forwarding_available: encryptionReady(env),retention_days: 365});
};

async function saveProvider(env,account,name,credentials,status,user = ''){
	const generation = randomToken(16);
	const encrypted = await encryptCredentials(env,account.account,name,generation,credentials);
	const now = Date.now();
	await env.DB.batch([
		env.DB.prepare('UPDATE scrobble_outbox SET status=\'cancelled\',last_error=\'destination_replaced\',lease=\'\',lease_until=0,updated_at=? WHERE account=? AND provider=? AND status IN (\'pending\',\'retry\',\'sending\',\'failed\')').bind(now,account.account,name),
		env.DB.prepare('INSERT INTO scrobble_providers(account,provider,generation,status,user_name,credentials,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(account,provider) DO UPDATE SET generation=excluded.generation,status=excluded.status,user_name=excluded.user_name,credentials=excluded.credentials,updated_at=excluded.updated_at').bind(account.account,name,generation,status,user,encrypted,now)
	]);
	return generation;
};

async function completeProvider(env,account,provider,generation,credentials,status,user = ''){
	const encrypted = await encryptCredentials(env,account,provider,generation,credentials);
	const row = await env.DB.prepare("UPDATE scrobble_providers SET credentials=?,status=?,user_name=?,updated_at=? WHERE account=? AND provider=? AND generation=? AND status='connecting' RETURNING account").bind(encrypted,status,user,Date.now(),account,provider,generation).first();
	if (!row) {
		return problem(409,'destination_changed','The connection changed. Reload before connecting again.');
	};
};

async function abandonProvider(env,account,provider,generation){
	return await env.DB.prepare("UPDATE scrobble_providers SET credentials='',status='disconnected',updated_at=? WHERE account=? AND provider=? AND generation=? AND status='connecting'").bind(Date.now(),account,provider,generation).run();
};

async function browserWrite(name,request,env,ctx,fetcher,session){
	const input = await bodyValue(request);
	const account = await accountRecord(env,session);
	const key = account.account;
	const now = Date.now();
	const allowed = await env.DB.prepare('INSERT INTO scrobble_rate(account,bucket,count) VALUES(?,?,1) ON CONFLICT(account,bucket) DO UPDATE SET count=count+1 WHERE count<120 RETURNING count').bind(key,Math.floor(now / 60000)).first();
	if (!allowed) {
		return response({error: 'rate_limited',message: 'Try again in one minute.'},429,{'retry-after': '60'});
	};
	if (name === 'tokens') {
		const label = text(input.label || 'XivPiano',80,true);
		const token = 'sgs_' + randomToken(32);
		const id = randomToken(16);
		const prefix = token.slice(0,12);
		const row = await env.DB.prepare('INSERT INTO scrobble_tokens(id,account,token_hash,label,prefix,created_at) SELECT ?1,?2,?3,?4,?5,?6 WHERE (SELECT COUNT(*) FROM scrobble_tokens WHERE account=?2 AND revoked_at=0)<8 RETURNING id').bind(id,key,await sha256hex(token),label,prefix,now).first();
		if (!row) {
			problem(409,'token_limit','Revoke an existing token before creating another. Eight active tokens are allowed.');
		};
		return response({token: {id: id,label: label,prefix: prefix,created_at: now,last_used_at: 0,revoked_at: 0},client_token: token},201);
	};
	if (name === 'tokens/revoke') {
		if (typeof input.id !== 'string' || input.id.length > 64) {
			problem(400,'invalid_token_id','Choose an existing client token.');
		};
		await env.DB.prepare('UPDATE scrobble_tokens SET revoked_at=? WHERE account=? AND id=? AND revoked_at=0').bind(now,key,input.id).run();
		return response({ok: true});
	};
	if (name === 'providers/listenbrainz') {
		if (typeof input.token !== 'string' || !(new RegExp('^[A-Za-z0-9_-]{16,128}$').test(input.token))) {
			problem(400,'invalid_provider_token','Enter your ListenBrainz user token.');
		};
		const generation = await saveProvider(env,account,'listenbrainz',{token: input.token},'connecting');
		try {
			const user = await validateListenBrainz(fetcher,input.token);
			await completeProvider(env,key,'listenbrainz',generation,{token: input.token},'connected',user);
			return response({ok: true,user_name: user});
		} catch (error) {
			await abandonProvider(env,key,'listenbrainz',generation);
			throw error;
		};
	};
	if (name === 'providers/lastfm/start') {
		if (typeof input.api_key !== 'string' || typeof input.api_secret !== 'string' || !(new RegExp('^[a-f0-9]{32}$','i').test(input.api_key)) || !(new RegExp('^[a-f0-9]{32}$','i').test(input.api_secret))) {
			problem(400,'invalid_lastfm_credentials','Enter your Last.fm application API key and shared secret, each 32 hexadecimal characters.');
		};
		const generation = await saveProvider(env,account,'lastfm',{api_key: input.api_key,api_secret: input.api_secret},'connecting');
		try {
			const creds = await beginLastfm(fetcher,input.api_key,input.api_secret);
			await completeProvider(env,key,'lastfm',generation,creds,'pending_auth');
			return response({ok: true,authorize_url: 'https://www.last.fm/api/auth/?' + new URLSearchParams({api_key: creds.api_key,token: creds.token}).toString()});
		} catch (error) {
			await abandonProvider(env,key,'lastfm',generation);
			throw error;
		};
	};
	if (name === 'providers/lastfm/finish') {
		const row = await env.DB.prepare('SELECT * FROM scrobble_providers WHERE account=? AND provider=\'lastfm\' AND status=\'pending_auth\'').bind(key).first();
		if (!row) {
			problem(409,'lastfm_not_pending','Start a Last.fm connection first.');
		};
		const creds = await finishLastfm(fetcher,await decryptCredentials(env,row));
		const encrypted = await encryptCredentials(env,key,'lastfm',row.generation,creds);
		const changed = await env.DB.prepare('UPDATE scrobble_providers SET status=\'connected\',credentials=?,user_name=?,updated_at=? WHERE account=? AND provider=\'lastfm\' AND generation=? AND status=\'pending_auth\' RETURNING account').bind(encrypted,creds.user_name,now,key,row.generation).first();
		if (!changed) {
			problem(409,'destination_changed','The connection changed. Reload before authorizing again.');
		};
		return response({ok: true,user_name: creds.user_name});
	};
	if (name === 'providers/disconnect') {
		const provider = providerName(input.provider);
		await env.DB.batch([
			env.DB.prepare('UPDATE scrobble_providers SET generation=?,status=\'disconnected\',credentials=\'\',user_name=\'\',updated_at=? WHERE account=? AND provider=?').bind(randomToken(16),now,key,provider),
			env.DB.prepare('UPDATE scrobble_outbox SET status=\'cancelled\',last_error=\'destination_disconnected\',lease=\'\',lease_until=0,updated_at=? WHERE account=? AND provider=? AND status IN (\'pending\',\'retry\',\'sending\',\'failed\')').bind(now,key,provider)
		]);
		return response({ok: true});
	};
	if (name === 'history/delete') {
		await env.DB.batch([
			env.DB.prepare('UPDATE scrobble_accounts SET epoch=? WHERE account=?').bind(randomToken(16),key),
			env.DB.prepare('DELETE FROM scrobble_outbox WHERE account=?').bind(key),
			env.DB.prepare('DELETE FROM scrobble_nowplaying WHERE account=?').bind(key),
			env.DB.prepare('DELETE FROM scrobble_listens WHERE account=?').bind(key)
		]);
		return response({ok: true});
	};
	if (name === 'retry') {
		const provider = providerName(input.provider);
		await env.DB.prepare('UPDATE scrobble_outbox SET status=\'retry\',attempts=0,last_error=\'\',next_attempt_at=?1,updated_at=?1 WHERE account=?2 AND provider=?3 AND status=\'failed\' AND kind=\'single\' AND generation=(SELECT generation FROM scrobble_providers WHERE account=?2 AND provider=?3 AND status=\'connected\')').bind(now,key,provider).run();
		await scheduleDrain(env,ctx,fetcher);
		return response({ok: true});
	};
	return problem(404,'not_found','Unknown scrobble action.');
};

export async function handleScrobble(request,env,ctx,url,fetcher){
	const clientPrefix = SCROBBLE_BASE + '/1/';
	if (!url.pathname.startsWith(clientPrefix) && !url.pathname.startsWith(SCROBBLE_BROWSER)) {
		return null;
	};
	try {
		if (url.pathname.startsWith(clientPrefix)) {
			const name = url.pathname.slice(clientPrefix.length).replace(new RegExp('/$'),'');
			const method = (name === 'validate-token') ? 'GET' : ((name === 'submit-listens') ? 'POST' : null);
			if (!method) {
				return response({error: 'not_found'},404);
			};
			if (request.method !== method) {
				return response({error: 'method_not_allowed'},405,{allow: method});
			};
			const account = await clientAccount(request,env);
			if (name === 'validate-token') {
				return response({code: 200,message: 'Token valid.',valid: true,user_name: userName(account)});
			};
			return await ingest(request,env,ctx,fetcher,account);
		};
		const name = url.pathname.slice(SCROBBLE_BROWSER.length);
		const method = BROWSER_METHODS[name];
		if (!method) {
			return response({error: 'not_found'},404);
		};
		if (request.method !== method) {
			return response({error: 'method_not_allowed'},405,{allow: method});
		};
		if (!isSameOrigin(request,url) || (method === 'POST' && request.headers.get('origin') !== url.origin)) {
			problem(403,'forbidden','Same-origin browser requests are required.');
		};
		// Browser controls never accept a client token as an account session.
		const session = await readSession(request,env);
		if (name === 'state') {
			return await state(env,session,url);
		};
		if (!session) {
			problem(401,'sign_in_required','Sign in with GitHub or FFXIV to manage scrobbles.');
		};
		if (await isBanned(env,session.k)) {
			problem(403,'account_banned','This account cannot submit or configure scrobbles.');
		};
		if (name === 'export') {
			const page = await historyPage(env,session.k,url,500);
			return response({listens: page.rows.map(function(row) { return {listened_at: row.listened_at,track_metadata: JSON.parse(row.metadata)}; }),next_cursor: page.next_cursor});
		};
		return await browserWrite(name,request,env,ctx,fetcher,session);
	} catch (error) {
		if (error instanceof ScrobbleError) {
			return response({valid: false,error: error.code,message: error.message},error.status);
		};
		if (error instanceof DeliveryError) {
			const pending = error.code === 'lastfm_14';
			return response({error: pending ? 'lastfm_approval_pending' : error.code,message: pending ? 'Approve the Last.fm request, then choose Finish connecting.' : 'The provider did not accept the connection. Check the credentials or try again.'},pending ? 409 : 502);
		};
		// Never log an exception object: it may contain request/provider credentials.
		console.error('scrobble_api: internal_error');
		return response({error: 'server_error',message: 'Scrobbles are temporarily unavailable. Try again shortly.'},500);
	};
};
