// Generated from imba/src/auth.imba; edit the Imba source.
import {inited$, register$, iterable$} from 'imba/runtime';

/*body*/
// Sign-in with GitHub (a GitHub App's user-to-server OAuth) or FFXIV (XIVAuth), the
// session endpoints, the anonymous-ballot claim and the owner-only voter list.
//
// Each provider's access token is used during its callback only (to read the account
// id and, for XIVAuth, the character the voter chose) and then dropped: nothing about it
// is stored or logged. D1 cost: a sign-in touches D1 only to move an anonymous ballot
// (one batch); a link is one statement; me is one query when signed in and none
// otherwise; logout none; forget one; the admin list one batch.
import {API_PREFIX,BASE,COOKIE_NAME,LIMITS,PRIVATE,clearVoterCookie,cleanText,isSameOrigin,json,randomToken,voterKey,voterToken} from './lib.js';

import {SESSION_RENEW_S,accountKey,clearSessionCookie,clearStateCookie,isAccountId,isAdmin,nowSeconds,pkcePair,readSession,readState,safeReturnPath,sessionCookie,sessionLimit,sessionSecrets,stateCookie,stateMatches} from './session.js';

const USER_AGENT = 'ghostty-vote (+https://spacegho.st/mods/ffxiv/term/vote/)';

const FETCH_TIMEOUT_MS = 10000;

export const PROVIDER = Object.freeze({github: {authorize: 'https://github.com/login/oauth/authorize',token: 'https://github.com/login/oauth/access_token',user: 'https://api.github.com/user',id: 'GITHUB_CLIENT_ID',secret: 'GITHUB_CLIENT_SECRET'},xivauth: {authorize: 'https://xivauth.net/oauth/authorize',token: 'https://xivauth.net/oauth/token',user: 'https://xivauth.net/api/v1/user',characters: 'https://xivauth.net/api/v1/characters',id: 'XIVAUTH_CLIENT_ID',secret: 'XIVAUTH_CLIENT_SECRET',scope: {signin: 'user',link: 'character'}}});

const NAV = {'cache-control': 'no-store','referrer-policy': 'no-referrer','x-content-type-options': 'nosniff'};

function redirect(location,cookies = []){
	const res = new Response(null,{status: 303,headers: {...NAV,location: location}});
	for (let c of iterable$(cookies)){
		res.headers.append('set-cookie',c);
	};
	return res;
	return;
};

const pageUrl = function(url,path,fragment) {
	return (((url.origin + path) + '#') + fragment);
};

const configured = function(env,provider) {
	return (((sessionSecrets(env).length > 0) && (!((!(function() {
		let cursor$1 = env;
		let cursor$2 = undefined;
		if (cursor$1 == null) {
			return undefined;
		};
		cursor$2 = cursor$1;
		cursor$1 = cursor$1[PROVIDER[provider].id];
		return cursor$1;
	}()))))) && (!((!(function() {
		let cursor$3 = env;
		let cursor$4 = undefined;
		if (cursor$3 == null) {
			return undefined;
		};
		cursor$4 = cursor$3;
		cursor$3 = cursor$3[PROVIDER[provider].secret];
		return cursor$3;
	}())))));
};

const callbackUrl = function(url,provider) {
	return ((((url.origin + API_PREFIX) + 'auth/') + provider) + '/callback');
};

export async function startAuth(request,env,url,provider,mode){
	const back = safeReturnPath(url.searchParams.get('return'));
	if ((!isSameOrigin(request,url))) {
		return redirect(pageUrl(url,back,'auth-error=refused'));
	};
	if ((!configured(env,provider))) {
		return redirect(pageUrl(url,back,'auth-error=not-configured'));
	};
	const state = {p: provider,s: randomToken(32),m: mode,r: back};
	if ((mode === 'link')) {
		const session = (await readSession(request,env));
		if ((!session)) {
			return redirect(pageUrl(url,back,'auth-error=sign-in-first'));
		};
		state.k = session.k;
	};
	const {verifier: verifier,challenge: challenge} = (await pkcePair());
	state.cv = verifier;
	const P = PROVIDER[provider];
	const q = new URLSearchParams({client_id: env[P.id],redirect_uri: callbackUrl(url,provider)});
	if ((provider === 'xivauth')) {
		q.set('response_type','code');
		q.set('scope',P.scope[mode]);
	};
	q.set('state',state.s);
	q.set('code_challenge',challenge);
	q.set('code_challenge_method','S256');
	return redirect(((P.authorize + '?') + q),[(await stateCookie(env,state))]);
	return;
};

let c$0 = Symbol();
class ProviderError extends Error {
	constructor(stage,status){
		super(('' + String(stage) + ' failed (' + String(status) + ')'));
		this.stage = stage;
		this.status = status;
		inited$(this,c$0);
	}
	static { register$(this,c$0,'ProviderError',16) }
};

async function fetchJson(fetcher,stage,resource,init){
	let res;
	try {
		res = (await fetcher(resource,{...init,signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)}));
	} catch ($1) {
		throw new ProviderError(stage,'network');
	};
	if ((!res.ok)) {
		throw new ProviderError(stage,res.status);
	};
	try {
		return (await res.json());
	} catch ($2) {
		throw new ProviderError(stage,'not json');
	};
	return;
};

async function exchangeCode(fetcher,env,provider,url,code,verifier){
	const P = PROVIDER[provider];
	const body = new URLSearchParams({client_id: env[P.id],client_secret: env[P.secret],code: code,redirect_uri: callbackUrl(url,provider),code_verifier: verifier});
	if ((provider === 'xivauth')) {
		body.set('grant_type','authorization_code');
	};
	const data = (await fetchJson(fetcher,'token',P.token,{method: 'POST',headers: {accept: 'application/json','content-type': 'application/x-www-form-urlencoded','user-agent': USER_AGENT},body: body}));
	const token = (data && data.access_token);
	if (((((typeof token) !== 'string') || (!token)) || (token.length > 4096))) {
		const why = (((data && ((typeof data.error) === 'string')) && new RegExp('^[a-z_]{1,64}$','').test(data.error)) ? data.error : 'no access_token');
		throw new ProviderError('token',why);
	};
	return token;
	return;
};

const bearer = function(token,accept) {
	return {authorization: ('Bearer ' + token),accept: accept,'user-agent': USER_AGENT};
};

async function githubUserId(fetcher,token){
	const user = (await fetchJson(fetcher,'user',PROVIDER.github.user,{headers: {...bearer(token,'application/vnd.github+json'),'x-github-api-version': '2022-11-28'}}));
	const id = (user && user.id);
	if (((!Number.isSafeInteger(id)) || (id <= 0))) {
		throw new ProviderError('user','no id');
	};
	return String(id);
	return;
};

async function xivauthUserId(fetcher,token){
	const user = (await fetchJson(fetcher,'user',PROVIDER.xivauth.user,{headers: bearer(token,'application/json')}));
	const id = (user && user.id);
	if ((!isAccountId('xivauth',id))) {
		throw new ProviderError('user','no id');
	};
	return id;
	return;
};

export function safeImageUrl(raw){
	if ((((typeof raw) !== 'string') || (raw.length > 512))) {
		return '';
	};
	let u;
	try {
		u = new URL(raw);
	} catch ($3) {
		return '';
	};
	const host = u.hostname;
	if (((((u.protocol !== 'https:') || u.username) || u.password) || u.port)) {
		return '';
	};
	return (((host === 'finalfantasyxiv.com') || host.endsWith('.finalfantasyxiv.com')) ? u.href : '');
	return;
};

export function pickCharacter(list){
	if ((!Array.isArray(list))) {
		return null;
	};
	for (let c of iterable$(list)){
		if (((!c) || ((typeof c) !== 'object'))) {
			continue;
		};
		const lodestone = (((typeof c.lodestone_id) === 'number') ? String(c.lodestone_id) : c.lodestone_id);
		if ((((typeof lodestone) !== 'string') || (!(new RegExp('^\\d{1,20}$','').test(lodestone))))) {
			continue;
		};
		const name = cleanText(c.name);
		if (((!name) || (name.length > 64))) {
			continue;
		};
		const world = (cleanText(c.home_world) || '').slice(0,32);
		return {lodestone_id: lodestone,name: name,world: world,portrait_url: safeImageUrl(c.portrait_url)};
	};
	return null;
	return;
};

async function xivauthCharacter(fetcher,token){
	const list = (await fetchJson(fetcher,'characters',PROVIDER.xivauth.characters,{headers: bearer(token,'application/json')}));
	if ((!Array.isArray(list))) {
		throw new ProviderError('characters','not a list');
	};
	return pickCharacter(list);
	return;
};

export function upsertCharacter(db,voter,c,now){
	return db.prepare(('INSERT INTO characters (voter, lodestone_id, name, world, portrait_url, first_seen, last_seen)\n     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)\n     ON CONFLICT (voter) DO UPDATE SET\n       first_seen = CASE WHEN characters.lodestone_id = excluded.lodestone_id THEN characters.first_seen ELSE excluded.first_seen END,\n       lodestone_id = excluded.lodestone_id, name = excluded.name, world = excluded.world,\n       portrait_url = excluded.portrait_url, last_seen = excluded.last_seen')).bind(voter,c.lodestone_id,c.name,c.world,c.portrait_url,now);
	return;
};

export function claimStatements(db,anonKey,account){
	if ((anonKey === account)) {
		return [];
	};
	const anon = 'SELECT {col} FROM votes AS anon WHERE anon.voter = ?2 AND anon.idea_id = votes.idea_id';
	return [db.prepare(('UPDATE votes SET voter = ?1 WHERE voter = ?2\n       AND NOT EXISTS (SELECT 1 FROM votes AS mine WHERE mine.voter = ?1 AND mine.idea_id = votes.idea_id)')).bind(account,anonKey),db.prepare(('UPDATE votes SET\n         vote = CASE WHEN vote = \'\' THEN (' + String(anon.replace('{col}','anon.vote')) + ') ELSE vote END,\n         note = CASE WHEN note = \'\' THEN (' + String(anon.replace('{col}','anon.note')) + ') ELSE note END,\n         updated_at = MAX(updated_at, (' + String(anon.replace('{col}','anon.updated_at')) + '))\n       WHERE voter = ?1 AND EXISTS (' + String(anon.replace('{col}','1')) + '\n         AND ((votes.vote = \'\' AND anon.vote <> \'\') OR (votes.note = \'\' AND anon.note <> \'\')))')).bind(account,anonKey),db.prepare('DELETE FROM votes WHERE voter = ?').bind(anonKey),db.prepare('UPDATE suggestions SET voter = ?1 WHERE voter = ?2').bind(account,anonKey),db.prepare('UPDATE write_log SET voter = ?1 WHERE voter = ?2').bind(account,anonKey)];
	return;
};

export async function finishAuth(request,env,url,provider,fetcher){
	const state = (await readState(request,env));
	const back = (state ? safeReturnPath(state.r) : ((BASE + '/')));
	const fail = function(code) {
		return redirect(pageUrl(url,back,('auth-error=' + code)),[clearStateCookie()]);
	};
	const note = function(why) {
		return console.warn(('ghostty-vote: ' + String(provider) + ' sign-in refused: ' + String(why) + ''));
	};
	if ((((!state) || (state.p !== provider)) || (!configured(env,provider)))) {
		note(((!configured(env,provider)) ? 'not configured' : (((!state) ? 'no state cookie (expired, blocked, or another browser)' : 'state is for the other provider'))));
		return fail((configured(env,provider) ? 'expired' : 'not-configured'));
	};
	if (url.searchParams.has('error')) {
		const e = (url.searchParams.get('error') || '');
		note(('provider returned ' + (new RegExp('^[a-z_]{1,64}$','').test(e) ? e : 'an error')));
		return fail('denied');
	};
	if ((!stateMatches(state,url.searchParams.get('state')))) {
		note('state mismatch');
		return fail('state');
	};
	const code = url.searchParams.get('code');
	if (((!code) || (code.length > 512))) {
		note('no usable code');
		return fail('bad-request');
	};
	let session = null;
	if ((state.m === 'link')) {
		session = (await readSession(request,env));
		if (((!session) || (session.k !== state.k))) {
			return fail('sign-in-first');
		};
	};
	const now = Date.now();
	let userId = null;
	let character = null;
	try {
		const token = (await exchangeCode(fetcher,env,provider,url,code,state.cv));
		if ((state.m === 'link')) {
			character = (await xivauthCharacter(fetcher,token));
		} else {
			userId = ((provider === 'github') ? ((await githubUserId(fetcher,token))) : ((await xivauthUserId(fetcher,token))));
		};
	} catch (err) {
		logProviderError(provider,err);
		return fail('provider');
	};
	if ((state.m === 'link')) {
		if ((!character)) {
			return fail('no-character');
		};
		await upsertCharacter(env.DB,session.k,character,now).run();
		return redirect(pageUrl(url,back,'character-linked'),[clearStateCookie()]);
	};
	const key = (await accountKey(provider,userId));
	const anon = voterToken(request.headers.get('cookie'));
	if (anon) {
		try {
			const statements = claimStatements(env.DB,(await voterKey(anon)),key);
			if (statements.length) {
				await env.DB.batch(statements);
			};
		} catch (err) {
			console.error(('ghostty-vote: ' + String(provider) + ' sign-in claim failed: ' + String(String(((err && err.message) || err)).slice(0,200)) + ''));
		};
	};
	let signedIn;
	try {
		signedIn = (await sessionCookie(env,{p: provider,k: key}));
	} catch (err) {
		console.error(('ghostty-vote: ' + String(provider) + ' sign-in session failed: ' + String(String(((err && err.message) || err)).slice(0,200)) + ''));
		return fail('server');
	};
	const cookies = [clearStateCookie(),signedIn];
	if (function() {
		let cursor$5 = request;
		let cursor$6 = undefined;
		cursor$6 = cursor$5;
		cursor$5 = cursor$5.headers;
		cursor$6 = cursor$5;
		cursor$5 = cursor$5.get;
		cursor$5 = Reflect.apply(cursor$5,cursor$6,['cookie']);
		cursor$6 = undefined;
		if (cursor$5 == null) {
			return undefined;
		};
		cursor$6 = cursor$5;
		cursor$5 = cursor$5.includes;
		cursor$5 = Reflect.apply(cursor$5,cursor$6,[(COOKIE_NAME + '=')]);
		cursor$6 = undefined;
		return cursor$5;
	}()) {
		cookies.push(clearVoterCookie());
	};
	return redirect(pageUrl(url,back,'signed-in'),cookies);
	return;
};

function logProviderError(provider,err){
	const detail = ((err instanceof ProviderError) ? (('' + String(err.stage) + ': ' + String(err.status) + '')) : 'unexpected error');
	console.error(('ghostty-vote: ' + String(provider) + ' sign-in ' + String(detail) + ''));
	return;
};

const refused = function() {
	return json({error: 'forbidden',message: 'Cross-site request refused.'},{status: 403,headers: PRIVATE});
};

export const signInRequired = function(headers = {}) {
	return json({error: 'sign_in_required',message: 'Sign in with GitHub or FFXIV to vote.'},{status: 401,headers: headers});
};

export async function getMe(request,env,url){
	if ((!isSameOrigin(request,url))) {
		return refused();
	};
	const session = (await readSession(request,env));
	if ((!session)) {
		return json({signed_in: false,legacy_ballot: (!(!voterToken(request.headers.get('cookie'))))},{headers: PRIVATE});
	};
	const row = (await env.DB.prepare('SELECT name, world, portrait_url FROM characters WHERE voter = ?').bind(session.k).first());
	const admin = (await isAdmin(env,session));
	const res = json({signed_in: true,provider: session.p,character: (row ? {name: row.name,world: row.world,portrait_url: row.portrait_url} : null),admin: admin},{headers: PRIVATE});
	const now = nowSeconds();
	if ((((session.exp - now) < SESSION_RENEW_S) && (session.exp < sessionLimit(session.iat,admin)))) {
		res.headers.append('set-cookie',(await sessionCookie(env,session,now)));
	};
	return res;
	return;
};

export async function postLogout(request,env,url){
	if ((!isSameOrigin(request,url))) {
		return await refused();
	};
	const res = json({ok: true},{headers: PRIVATE});
	res.headers.append('set-cookie',clearSessionCookie());
	return await res;
	return await undefined;
};

export async function postForgetCharacter(request,env,url){
	if ((!isSameOrigin(request,url))) {
		return refused();
	};
	const session = (await readSession(request,env));
	if ((!session)) {
		return signInRequired(PRIVATE);
	};
	await env.DB.prepare('DELETE FROM characters WHERE voter = ?').bind(session.k).run();
	return json({ok: true},{headers: PRIVATE});
	return;
};

export async function getAdminVoters(request,env,url){
	if ((!isSameOrigin(request,url))) {
		return refused();
	};
	const session = (await readSession(request,env));
	if ((!session)) {
		return signInRequired(PRIVATE);
	};
	if ((!((await isAdmin(env,session))))) {
		return json({error: 'forbidden',message: 'Only the site owner can see this.'},{status: 403,headers: PRIVATE});
	};
	const [counts,notes,suggestions,characters] = (await env.DB.batch([env.DB.prepare(('SELECT voter, SUM(vote = \'want\') AS want, SUM(vote = \'maybe\') AS maybe, SUM(vote = \'skip\') AS skip,\n              MAX(updated_at) AS last_active\n       FROM votes GROUP BY voter')),env.DB.prepare(('SELECT votes.voter, votes.idea_id, ideas.title, ideas.mod, votes.vote, votes.note, votes.updated_at\n       FROM votes JOIN ideas ON ideas.id = votes.idea_id\n       WHERE votes.note <> \'\' ORDER BY votes.updated_at DESC')),env.DB.prepare('SELECT id, voter, title, detail, status, created_at, mod FROM suggestions ORDER BY created_at DESC, id DESC LIMIT ?').bind(LIMITS.adminSuggestions),env.DB.prepare('SELECT voter, lodestone_id, name, world, portrait_url, first_seen, last_seen FROM characters')]));
	const voters = new Map();
	const voter = function(key) {
		let v = voters.get(key);
		if ((!v)) {
			voters.set(key,(v = {voter: key,you: (key === session.k),character: null,want: 0,maybe: 0,skip: 0,last_active: 0,notes: [],suggestions: []}));
		};
		return v;
		return;
	};
	const seen = function(v,at) {
		v.last_active = Math.max(v.last_active,(at || 0));
		return;
	};
	for (let r of iterable$(counts.results)){
		const v = voter(r.voter);
		Object.assign(v,{want: (r.want | 0),maybe: (r.maybe | 0),skip: (r.skip | 0)});
		seen(v,r.last_active);
	};
	for (let r of iterable$(notes.results)){
		voter(r.voter).notes.push({idea_id: r.idea_id,title: r.title,mod: r.mod,vote: (r.vote || null),note: r.note,updated_at: r.updated_at});
	};
	for (let r of iterable$(suggestions.results)){
		const v = voter(r.voter);
		v.suggestions.push({id: r.id,title: r.title,detail: r.detail,status: r.status,created_at: r.created_at,mod: r.mod});
		seen(v,r.created_at);
	};
	for (let r of iterable$(characters.results)){
		const v = voter(r.voter);
		v.character = {lodestone_id: r.lodestone_id,name: r.name,world: r.world,portrait_url: r.portrait_url,first_seen: r.first_seen,last_seen: r.last_seen};
		seen(v,r.last_seen);
	};
	const list = [...voters.values()].sort(
		function(a,b) {
			return ((b.last_active - a.last_active) || ((a.voter < b.voter) ? ((- 1)) : 1));
		}
	);
	return json(
		{
			generated_at: Date.now(),
			totals: {
				voters: list.length,
				with_character: list.filter(
					function(v) {
						return v.character;
					}
				).length,
				notes: notes.results.length,
				suggestions: suggestions.results.length
			},
			voters: list
		},
		{headers: PRIVATE}
	);
	return;
};
