// Generated from imba/src/analytics-lib.imba; edit the Imba source.
import {iterable$} from 'imba/runtime';

/*body*/
// Pure analytics logic: what a request is counted as, and how counts are coalesced in
// memory before they reach D1. No bindings and no I/O, so `node --test` exercises all of
// it directly. The parts that touch D1, the deny list and the admin API are in
// analytics.js; the Worker wires them in worker.js so a fault here can never change an
// answer the site gives.
//
// Nothing here ever sees, keeps or derives anything about a person. A request becomes
// five fixed-vocabulary fields — day, path bucket, client class, outcome, country — and
// is added to a counter. The address is used only to make the keyed digest that links a
// *refused* request to other refused requests inside one seven-day window (analytics.js).

// Paths analytics answers itself. All three sit under the vote's api/ prefix, which is
// already in assets.run_worker_first and already carries the owner's session cookie path,
// so adding analytics needed no routing or wrangler.toml change.
export const BEACON_PATH = '/mods/ffxiv/term/vote/api/beacon';

export const ADMIN_ANALYTICS_PATH = '/mods/ffxiv/term/vote/api/admin/analytics';

export const ADMIN_DENY_PATH = '/mods/ffxiv/term/vote/api/admin/deny';

export const ANALYTICS = Object.freeze({flushGapMs: 300000,sampleAfter: 5000,sampleEvery: 10,maxKeys: 64,maxRefKeys: 32,maxAbuseKeys: 64,rollupDays: 400,abuseDays: 30,saltWindowDays: 7,denyTtlMs: 60000,denyMax: 500,adminDays: 90,beaconBytes: 512});

export const CLASSES = Object.freeze(['dalamud','bot','browser','page','other','none']);

export const OUTCOMES = Object.freeze(['ok','fresh','redirect','view','refused','notfound','limited','banned','error']);

export const dayKey = function(ms) {
	return new Date(ms).toISOString().slice(0,10);
};

export const dayShift = function(ms,days) {
	return dayKey((ms + (days * 86400000)));
};

export const saltWindow = function(ms) {
	return Math.floor(((ms / 86400000) / ANALYTICS.saltWindowDays));
};

export const windowEnd = function(ms) {
	return (((saltWindow(ms) + 1) * ANALYTICS.saltWindowDays) * 86400000);
};

const DOWNLOAD_RE = new RegExp('\\.(?:zip|7z|dll|exe|json\\.gz)$|\\/(?:download|downloads|releases?)\\/','i');

const BUCKETS = [[new RegExp('^\\/mods\\/ffxiv\\/plugins\\.json$',''),'plugins-repo'],[new RegExp('^\\/mods\\/ffxiv\\/plugins(?:\\/|$)',''),'plugins-page'],[new RegExp('^\\/mods\\/ffxiv\\/almanac\\/recommendations\\.json$',''),'almanac-recs'],[new RegExp('^\\/mods\\/ffxiv\\/almanac\\/leaderboard\\.json$',''),'almanac-board'],[new RegExp('^\\/mods\\/ffxiv\\/almanac\\/api\\/',''),'almanac-api'],[new RegExp('^\\/mods\\/ffxiv\\/almanac\\/schema\\/',''),'almanac-schema'],[new RegExp('^\\/mods\\/ffxiv\\/(?!term\\/)[a-z]+\\/vote(?:\\/|$)',''),'vote-page'],[new RegExp('^\\/mods\\/ffxiv\\/almanac(?:\\/|$)',''),'almanac-page'],[new RegExp('^\\/mods\\/ffxiv\\/term\\/gallery\\/api\\/shots$',''),'gallery-shots'],[new RegExp('^\\/mods\\/ffxiv\\/term\\/gallery\\/api\\/upload$',''),'gallery-upload'],[new RegExp('^\\/mods\\/ffxiv\\/term\\/gallery\\/(?:img|thumb)\\/',''),'gallery-image'],[new RegExp('^\\/mods\\/ffxiv\\/term\\/gallery(?:\\/|$)',''),'gallery-page'],[new RegExp('^\\/mods\\/ffxiv\\/term\\/vote\\/api\\/admin\\/',''),'admin'],[new RegExp('^\\/mods\\/ffxiv\\/term\\/vote\\/api\\/beacon$',''),'beacon'],[new RegExp('^\\/mods\\/ffxiv\\/term\\/vote\\/api\\/auth\\/',''),'vote-auth'],[new RegExp('^\\/mods\\/ffxiv\\/term\\/vote\\/api\\/(?:device\\/|apps(?:\\/|$)|token\\/)',''),'device-link'],[new RegExp('^\\/mods\\/ffxiv\\/term\\/vote\\/api\\/(?:gallery|shots)\\/upload$',''),'gallery-upload'],[new RegExp('^\\/mods\\/ffxiv\\/term\\/vote\\/api\\/',''),'vote-api'],[new RegExp('^\\/mods\\/ffxiv\\/term\\/vote(?:\\/|$)',''),'vote-page']];

export function bucketOf(pathname){
	if ((((typeof pathname) !== 'string') || (pathname[0] !== '/'))) {
		return 'other';
	};
	if (DOWNLOAD_RE.test(pathname)) {
		return 'download';
	};
	for (let [re,name] of iterable$(BUCKETS)){
		if (re.test(pathname)) {
			return name;
		};
	};
	return 'other';
	return;
};

const DALAMUD_RE = new RegExp('dalamud|xivlauncher|ffxiv','i');

const BOT_RE = new RegExp('bot\\b|crawler|spider|slurp|curl\\/|wget|python-requests|python-urllib|go-http-client|okhttp|java\\/|libwww|httpie|headlesschrome|facebookexternalhit|discordbot|slackbot|telegrambot|bingpreview|semrush|ahrefs|petalbot|dataforseo|scrapy|node-fetch|axios|postman','i');

const BROWSER_RE = new RegExp('^mozilla\\/5\\.0 .*(?:chrome|firefox|safari|edg|opr|gecko)','i');

export function classOf(userAgent){
	if ((((typeof userAgent) !== 'string') || (userAgent.trim() === ''))) {
		return 'none';
	};
	const ua = userAgent.slice(0,512);
	if (DALAMUD_RE.test(ua)) {
		return 'dalamud';
	};
	if (BOT_RE.test(ua)) {
		return 'bot';
	};
	if (BROWSER_RE.test(ua)) {
		return 'browser';
	};
	return 'other';
	return;
};

export function outcomeOf(status){
	const s = (Number(status) | 0);
	if ((s === 304)) {
		return 'fresh';
	};
	if (((s >= 200) && (s < 300))) {
		return 'ok';
	};
	if (((s >= 300) && (s < 400))) {
		return 'redirect';
	};
	if ((s === 404)) {
		return 'notfound';
	};
	if ((s === 429)) {
		return 'limited';
	};
	if ((s === 451)) {
		return 'banned';
	};
	if (((s >= 400) && (s < 500))) {
		return 'refused';
	};
	return 'error';
	return;
};

const ABUSE_OUTCOMES = new Set(['refused','notfound','limited','banned']);

export const isAbuse = function(outcome) {
	return ABUSE_OUTCOMES.has(outcome);
};

const HOST_RE = new RegExp('^[a-z0-9](?:[a-z0-9.-]{0,62}[a-z0-9])?$','');

export function refHost(referrer,selfHost){
	if ((((typeof referrer) !== 'string') || (referrer === ''))) {
		return '';
	};
	let host;
	try {
		const u = new URL(referrer);
		if (((u.protocol !== 'https:') && (u.protocol !== 'http:'))) {
			return '';
		};
		host = u.hostname.toLowerCase();
	} catch ($1) {
		return '';
	};
	if ((host === String((selfHost || '')).toLowerCase())) {
		return 'self';
	};
	if (host.startsWith('www.')) {
		host = host.slice(4);
	};
	return (HOST_RE.test(host) ? host : '');
	return;
};

export const countryOf = function(value) {
	return (new RegExp('^[A-Z]{2}$','').test(String((value || ''))) ? String(value) : 'ZZ');
};

export const asnOf = function(value) {
	return (((Number.isInteger(Number(value)) && (Number(value) > 0)) && (Number(value) < 4294967295)) ? Number(value) : 0);
};

export const newState = function() {
	return {hits: new Map(),refs: new Map(),abuse: new Map(),denyHits: new Map(),seen: 0,sampledAny: false,lastFlush: 0,prunedDay: ''};
};

export const SEP = '';

export const packKey = function(...parts) {
	return parts.join(SEP);
};

export const unpackKey = function(key) {
	return key.split(SEP);
};

export function weigh(state){
	state.seen += 1;
	if ((state.seen <= ANALYTICS.sampleAfter)) {
		return 1;
	};
	state.sampledAny = true;
	return (((state.seen % ANALYTICS.sampleEvery) === 0) ? ANALYTICS.sampleEvery : 0);
	return;
};

export function bump(map,key,weight,cap,spill){
	const k = ((map.has(key) || (map.size < cap)) ? key : spill);
	const cur = (map.get(k) || {hits: 0,samples: 0});
	cur.hits += weight;
	cur.samples += 1;
	map.set(k,cur);
	return k;
	return;
};

export function countHit(state,{day: day,bucket: bucket,klass: klass,outcome: outcome,country: country}){
	const weight = weigh(state);
	if ((weight === 0)) {
		return null;
	};
	return bump(state.hits,packKey(day,bucket,klass,outcome,country),weight,ANALYTICS.maxKeys,packKey(day,'other',klass,outcome,'ZZ'));
	return;
};

export function countRef(state,{day: day,bucket: bucket,host: host},weight = 1){
	if ((!host)) {
		return null;
	};
	return bump(state.refs,packKey(day,bucket,host),weight,ANALYTICS.maxRefKeys,packKey(day,bucket,'other'));
	return;
};

export function countAbuse(state,{day: day,who: who,bucket: bucket,outcome: outcome,country: country,asn: asn,at: at}){
	const key = packKey(day,who,bucket,outcome);
	const k = ((state.abuse.has(key) || (state.abuse.size < ANALYTICS.maxAbuseKeys)) ? key : packKey(day,'overflow',bucket,outcome));
	const cur = (state.abuse.get(k) || {hits: 0,country: 'ZZ',asn: 0,at: 0});
	cur.hits += 1;
	cur.country = country;
	cur.asn = asn;
	cur.at = Math.max(cur.at,(at | 0));
	state.abuse.set(k,cur);
	return k;
	return;
};

export const countDeny = function(state,id) {
	return state.denyHits.set(id,((state.denyHits.get(id) || 0) + 1));
};

export const pendingRows = function(state) {
	return (((state.hits.size + state.refs.size) + state.abuse.size) + state.denyHits.size);
};

export const shouldFlush = function(state,now) {
	return ((pendingRows(state) > 0) && ((now - state.lastFlush) >= ANALYTICS.flushGapMs));
};

export function drain(state){
	const out = {hits: state.hits,refs: state.refs,abuse: state.abuse,denyHits: state.denyHits};
	state.hits = new Map();
	state.refs = new Map();
	state.abuse = new Map();
	state.denyHits = new Map();
	return out;
	return;
};

export const DENY_KINDS = Object.freeze(['ip','asn','country','ua']);

const HEX64 = new RegExp('^[0-9a-f]{64}$','');

export function validDenyValue(kind,value){
	const v = (((typeof value) === 'string') ? value.trim() : '');
	if ((kind === 'ip')) {
		return (HEX64.test(v) ? v : null);
	};
	if ((kind === 'asn')) {
		return (new RegExp('^[1-9][0-9]{0,9}$','').test(v) ? v : null);
	};
	if ((kind === 'country')) {
		return (new RegExp('^[A-Z]{2}$','').test(v.toUpperCase()) ? v.toUpperCase() : null);
	};
	if ((kind === 'ua')) {
		return ((((v.length >= 3) && (v.length <= 64)) && new RegExp('^[\\x20-\\x7e]+$','').test(v)) ? v.toLowerCase() : null);
	};
	return null;
	return;
};

export function denyMatch(entries,{ipDigest: ipDigest,asn: asn,country: country,userAgent: userAgent}){
	const ua = (((typeof userAgent) === 'string') ? userAgent.toLowerCase() : '');
	for (let e of iterable$(entries)){
		if ((e.kind === 'ip')) {
			if ((ipDigest && (e.value === ipDigest))) {
				return e;
			};
			continue;
		};
		if ((e.kind === 'asn')) {
			if ((asn && (String(asn) === e.value))) {
				return e;
			};
			continue;
		};
		if ((e.kind === 'country')) {
			if ((country && (country === e.value))) {
				return e;
			};
			continue;
		};
		if ((e.kind === 'ua')) {
			if ((ua && ua.includes(e.value))) {
				return e;
			};
			continue;
		};
	};
	return null;
	return;
};

export function banExpiry(kind,days,now){
	const asked = ((Number.isFinite(days) && (days > 0)) ? ((now + (Math.min(days,3650) * 86400000))) : 0);
	if ((kind !== 'ip')) {
		return asked;
	};
	const end = windowEnd(now);
	return ((asked === 0) ? end : Math.min(asked,end));
	return;
};

export function parseBeacon(text,selfHost){
	if ((((typeof text) !== 'string') || (text.length > ANALYTICS.beaconBytes))) {
		return null;
	};
	let body;
	try {
		body = JSON.parse(text);
	} catch ($2) {
		return null;
	};
	if ((((!body) || ((typeof body) !== 'object')) || Array.isArray(body))) {
		return null;
	};
	const path = (((typeof body.p) === 'string') ? body.p : '');
	if ((!path.startsWith('/mods/ffxiv/'))) {
		return null;
	};
	return {bucket: bucketOf(path.split('?')[0].split('#')[0]),host: refHost(body.r,selfHost)};
	return;
};

export const optedOut = function(headers) {
	return ((headers.get('dnt') === '1') || (headers.get('sec-gpc') === '1'));
};
