// Generated from imba/tests/site.test.imba; edit the Imba source.
import {iterable$} from 'imba/runtime';

/*body*/
// site.js against a small fake DOM: media slots render from the manifest (placeholder when
// a slot has no files, lazy images with srcset when it has), and only bare file names
// beside the manifest are ever used; the upload form shows only with a session.
import {test} from 'node:test';

import assert from 'node:assert/strict';

import {readFileSync} from 'node:fs';

import vm from 'node:vm';

const source = readFileSync(new URL('../public/mods/ffxiv/site/site.js',import.meta.url),'utf8');

function node(tag){
	return {
		tag: tag,
		attrs: {},
		kids: [],
		hidden: false,
		textContent: '',
		className: '',
		listeners: {},
		setAttribute: function(k,v) {
			this.attrs[k] = v;
			return;
		},
		append: function(...k) {
			this.kids.push(...k);
			return;
		},
		replaceChildren: function(...k) {
			this.kids = k;
			return;
		},
		addEventListener: function(t,f) {
			this.listeners[t] = f;
			return;
		},
		find: function(pred,out = []) {
			for (let k of iterable$(this.kids)){
				if ((k && ((typeof k) === 'object'))) {
					if (pred(k)) {
						out.push(k);
					};
					k.find(pred,out);
				};
			};
			return out;
			return;
		},
		text: function() {
			return (this.textContent + this.kids.map(
				function(k) {
					return (((typeof k) === 'string') ? k : k.text());
				}
			).join(''));
			return;
		}
	};
	return;
};

async function run({mod: mod,media: media,manifest: manifest,me: me,shots: shots}){
	const ids = {};
	for (let id of ['theme','copy','repo-url','media','video','shots','upload','signed-out','signed-in','signout','account-note','community']){
		ids[id] = node('div');
	};
	ids['signed-in'].hidden = true;
	const calls = [];
	const fetch = async function(url,init) {
		calls.push([url,init]);
		const body = ((url === media) ? manifest : ((url.includes('auth/me') ? me : ((url.includes('api/shots') ? shots : null)))));
		return await {
			ok: (body !== null),
			status: ((body === null) ? 404 : 200),
			json: async function() {
				return await body;
			}
		};
		return await undefined;
	};
	const document = {
		readyState: 'complete',
		documentElement: {dataset: {}},
		body: {dataset: {mod: mod,media: media,name: 'Ghostty'}},
		createElement: node,
		querySelector: function(s) {
			return (ids[s.slice(1)] || null);
		},
		addEventListener: function() {
			undefined;
			return;
		}
	};
	const window = {
		localStorage: {
			getItem: function() {
				return null;
			},
			setItem: function() {
				undefined;
				return;
			},
			removeItem: function() {
				undefined;
				return;
			}
		},
		location: {hash: '',pathname: '/'},
		navigator: {},
		history: {},
		setTimeout: setTimeout
	};
	vm.runInNewContext(source,{window: window,document: document,fetch: fetch,URL: URL,Number: Number,Object: Object,Array: Array,Date: Date,String: String,Math: Math,Error: Error,encodeURIComponent: encodeURIComponent});
	await new Promise(
		function(r) {
			return setTimeout(r,20);
		}
	);
	return {ids: ids,calls: calls};
	return;
};

const MEDIA = '/mods/ffxiv/term/media/manifest.json';

test(
	'slots: a placeholder without files; lazy, sized images with srcset and a preload=none video with them',
	async function() {
		const manifest = {version: 1,mod: 'ghostty',slots: [{id: 'a',title: 'Empty',kind: 'gif',caption: 'c',files: []},{id: 'b',title: 'Full',kind: 'screenshot',caption: 'c',files: [{type: 'image',src: 'b.webp',width: 1920,height: 1080,alt: 'Alt text',sizes: [{src: 'b-640.webp',w: 640}]},{type: 'video',src: 'b.mp4',poster: 'b-poster.webp',width: 960,height: 540,loop: true},{type: 'image',src: 'https://evil.example/x.png',width: 1,height: 1,alt: 'x'},{type: 'image',src: '../vote/x.png',width: 1,height: 1,alt: 'x'}]}],video: {title: 'Tour',length: '75 s',cuts: [{t: '0-8 s',note: 'Open'}],file: null}};
		const {ids: ids} = (await run({mod: 'ghostty',media: MEDIA,manifest: manifest,me: {signed_in: false},shots: {shots: []}}));
		const figs = ids.media.find(
			function(n) {
				return (n.tag === 'figure');
			}
		);
		assert.equal(figs.length,2);
		assert.match(figs[0].text(),new RegExp('Not captured yet',''));
		assert.equal(
			figs[0].find(
				function(n) {
					return (n.tag === 'img');
				}
			).length,
			0
		);
		const imgs = figs[1].find(
			function(n) {
				return (n.tag === 'img');
			}
		);
		assert.equal(imgs.length,1,'the off-site and path-bearing names are dropped');
		assert.deepEqual(imgs[0].attrs,{src: '/mods/ffxiv/term/media/b.webp',alt: 'Alt text',width: '1920',height: '1080',srcset: '/mods/ffxiv/term/media/b-640.webp 640w, /mods/ffxiv/term/media/b.webp 1920w',sizes: '(min-width: 1100px) 520px, (min-width: 720px) 50vw, 100vw',loading: 'lazy',decoding: 'async'});
		const vids = figs[1].find(
			function(n) {
				return (n.tag === 'video');
			}
		);
		assert.equal(vids[0].attrs.preload,'none');
		assert.equal(vids[0].attrs.poster,'/mods/ffxiv/term/media/b-poster.webp');
		assert.equal(
			vids[0].find(
				function(n) {
					return (n.tag === 'source');
				}
			)[0].attrs.src,
			'/mods/ffxiv/term/media/b.mp4'
		);
		assert.match(ids.video.text(),new RegExp('Not recorded yet',''));
		assert.match(ids.video.text(),new RegExp('0-8 sOpen',''));
		return;
	}
);

test(
	'community: only this mod\'s approved shots; the upload form appears only with a session',
	async function() {
		const id = 'A'.repeat(22);
		const shots = {shots: [{id: id,mod: 'ghostty',src: ('/mods/ffxiv/term/gallery/img/' + id),thumb: null,width: 1920,height: 1080,credit: 'Someone',approved_at: 1},{id: id,mod: 'xivmcp',src: ('/mods/ffxiv/term/gallery/img/' + id),width: 1,height: 1},{id: id,mod: 'ghostty',src: 'https://evil.example/img',width: 1,height: 1}]};
		const out = (await run({mod: 'ghostty',media: MEDIA,manifest: {slots: []},me: {signed_in: false},shots: shots}));
		assert.equal(
			out.ids.shots.find(
				function(n) {
					return (n.tag === 'img');
				}
			).length,
			1
		);
		assert.ok(
			out.calls.some(
				function([u]) {
					return (u === '/mods/ffxiv/term/gallery/api/shots?mod=ghostty');
				}
			)
		);
		assert.equal(out.ids['signed-in'].hidden,true);
		assert.equal(out.ids['signed-out'].hidden,false);
		const signedIn = (await run({mod: 'ghostty',media: MEDIA,manifest: {slots: []},me: {signed_in: true},shots: shots}));
		assert.equal(signedIn.ids['signed-in'].hidden,false);
		assert.equal(signedIn.ids['signed-out'].hidden,true);
		return;
	}
);
