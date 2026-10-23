// Generated from imba/tests/static.test.imba; edit the Imba source.
import {iterable$} from 'imba/runtime';

/*body*/
// The static site: generated JSON matches data/catalogue.json, the page needs no
// inline code, headers and wrangler config keep the Worker off static paths.
import {test} from 'node:test';

import assert from 'node:assert/strict';
import {tokenizer} from 'acorn';

import {readdirSync,readFileSync,statSync} from 'node:fs';

import {buildSeedSqlAll,validateCatalogues} from '../scripts/seed-lib.js';

import {BASE,PUBLIC_URL,STATIC_DIR,buildIdeas,buildOutputs,buildVersion} from '../scripts/static-lib.js';

import {buildVotePages} from '../scripts/vote-page-lib.js';
import {familyPage} from '../scripts/project-pages.js';

import {VOTE_MODS} from '../src/lib.js';

const root = new URL('../',import.meta.url);

const read = function(p) {
	const content = readFileSync(new URL(p,root),'utf8');
	return (p.startsWith('public/') && p.endsWith('.js')) ? normalizeScript(content) : content;
};

// Inspect decoded JavaScript literals without depending on the bundler's choice
// of quotes. Keep the full code so DOM sinks, inline code and ASCII checks apply.
function normalizeScript(code){
	const stream = tokenizer(code,{ecmaVersion: 'latest',sourceType: 'module'});
	let out = '';
	let end = 0;
	while (true){
		const token = stream.getToken();
		if (token.type.label === 'eof') {
			break;
		};
		if (token.type.label === 'string') {
			const value = token.value.replaceAll('\\','\\\\').replaceAll("'","\\'").replaceAll('\n','\\n').replaceAll('\r','\\r').replace(new RegExp('[\\u007f-\\uffff]','g'),function(c) { return '\\u' + c.charCodeAt(0).toString(16).padStart(4,'0'); });
			out += code.slice(end,token.start) + "'" + value + "'";
			end = token.end;
		};
	};
	return out + code.slice(end);
};

const catalogue = function() {
	return JSON.parse(read('data/catalogue.json'));
};

const catalogues = function() {
	return [catalogue(),...readdirSync(new URL('data/catalogues/',root)).filter(
		function(f) {
			return f.endsWith('.json');
		}
	).sort().map(
		function(f) {
			return JSON.parse(read(('data/catalogues/' + f)));
		}
	)];
};

function walk(dir,prefix = ''){
	return readdirSync(new URL(dir,root)).flatMap(
		function(name) {
			const rel = (prefix + name);
			return (statSync(new URL((dir + name),root)).isDirectory() ? walk(((dir + name) + '/'),(rel + '/')) : [rel]);
			return;
		}
	);
	return;
};

const MEDIA_DIRS = {ghostty: 'mods/ffxiv/term/media/',xivmcp: 'mods/ffxiv/xivmcp/media/',xivdesktop: 'mods/ffxiv/xivdesktop/media/',xivarcade: 'mods/ffxiv/xivarcade/media/',xivwayfinder: 'mods/ffxiv/xivwayfinder/media/',xivlantern: 'mods/ffxiv/xivlantern/media/',xivpiano: 'mods/ffxiv/xivpiano/media/',almanac: 'mods/ffxiv/almanac/media/'};

const isMediaFile = function(f) {
	return Object.values(MEDIA_DIRS).some(
		function(d) {
			return (f.startsWith(d) && (f !== (d + 'manifest.json')));
		}
	);
};

test(
	'committed ideas.json, version.json, vote pages and seed.sql match the catalogues',
	function() {
		const outputs = {...buildOutputs(catalogues(),buildSeedSqlAll),...buildVotePages(JSON.parse(read('data/vote-pages.json')))};
		for (let [path,body] of iterable$(Object.entries(outputs))){
			assert.equal(read(path),path.endsWith('.html') ? familyPage(body,JSON.parse(read('data/mods.json')),path) : body,('' + String(path) + ' is stale; run node scripts/build.js'));
		};
		return;
	}
);

test(
	'every mod has a vote: one catalogue each, ids and category names apart, each page wired to its mod',
	function() {
		const cats = catalogues();
		assert.deepEqual(validateCatalogues(cats),[]);
		assert.deepEqual(
			cats.map(
				function(c) {
					return (c.mod || 'ghostty');
				}
			).sort(),
			Object.keys(VOTE_MODS).sort(),
			'a catalogue for every vote page'
		);
		for (let [mod,page] of iterable$(Object.entries(VOTE_MODS))){
			const html = read((('public' + page) + 'index.html'));
			assert.ok(html.includes(('<html lang="en" data-mod="' + String(mod) + '" data-page="' + String(page) + '">')),mod);
			assert.ok(html.includes('href="/mods/ffxiv/term/vote/api/auth/github/start"'),mod);
			for (let m of iterable$(Object.values(VOTE_MODS))){
				assert.ok(html.includes(('href="' + String(m) + '"')),('' + String(mod) + ' links every vote'));
			};
			const version = JSON.parse(read((('public' + page) + 'version.json')));
			assert.equal(version.url,('https://spacegho.st' + page));
		};
		const clash = structuredClone(cats[1]);
		clash.categories[0].ideas[0].id = cats[0].categories[0].ideas[0].id;
		assert.match(validateCatalogues([cats[0],clash]).join('\n'),new RegExp('is also ghostty\'s',''));
		return;
	}
);

test(
	'ideas.json carries the catalogue and no tallies',
	function() {
		const cat = catalogue();
		const data = JSON.parse(read((STATIC_DIR + 'ideas.json')));
		assert.deepEqual(data,buildIdeas(cat));
		assert.equal(data.version,cat.version);
		assert.deepEqual(
			data.categories.map(
				function(c) {
					return c.name;
				}
			),
			cat.categories.map(
				function(c) {
					return c.name;
				}
			)
		);
		const ids = cat.categories.flatMap(
			function(c) {
				return c.ideas.map(
					function(i) {
						return i.id;
					}
				);
			}
		);
		assert.deepEqual(
			data.ideas.map(
				function(i) {
					return i.id;
				}
			),
			ids
		);
		assert.deepEqual(
			data.ideas.filter(
				function(i) {
					return i.top_pick;
				}
			).map(
				function(i) {
					return i.id;
				}
			).sort(),
			[...cat.top_picks].sort()
		);
		for (let i of iterable$(data.ideas)){
			assert.equal(i.tally,undefined);
			assert.equal((typeof i.in_world),'boolean');
			assert.ok(((i.added_version >= 1) && (i.added_version <= cat.version)));
		};
		return;
	}
);

test(
	'version.json lets a client count new ideas statically',
	function() {
		const cat = catalogue();
		const v = JSON.parse(read((STATIC_DIR + 'version.json')));
		const total = cat.categories.reduce(
			function(n,c) {
				return (n + c.ideas.length);
			},
			0
		);
		assert.deepEqual(v,buildVersion(cat));
		assert.equal(v.version,cat.version);
		assert.equal(v.ideas,total);
		assert.equal(
			Object.values(v.added).reduce(
				function(a,b) {
					return (a + b);
				},
				0
			),
			total
		);
		assert.equal(v.url,'https://spacegho.st/mods/ffxiv/term/vote/');
		const next = structuredClone(cat);
		next.version = 3;
		next.categories[0].ideas.push({id: 'later-idea',title: 'Later',wow: 1,added_version: 3});
		const bumped = buildVersion(next);
		const newSince = function(since) {
			return Object.entries(bumped.added).reduce(
				function(n,[ver,c]) {
					return (n + ((Number(ver) > since) ? c : 0));
				},
				0
			);
		};
		assert.equal(newSince(cat.version),1);
		assert.equal(newSince(3),0);
		assert.throws(
			function() {
				return buildVersion({version: 1,categories: []});
			},
			new RegExp('invalid catalogue','')
		);
		return;
	}
);

test(
	'public/ holds only the site, at its real URL paths',
	function() {
		assert.equal(BASE,'/mods/ffxiv/term/vote/');
		assert.equal(PUBLIC_URL,'https://spacegho.st/mods/ffxiv/term/vote/');
		assert.deepEqual(
			walk('public/').filter(
				function(f) {
					return (!isMediaFile(f));
				}
			).sort(),
			["mods/ffxiv/scrobble/index.html","mods/ffxiv/scrobble/scrobble.js","mods/ffxiv/scrobble/styles.css","mods/ffxiv/roadmap/index.html","mods/ffxiv/roadmap/queue.json","mods/ffxiv/site/enhancements.imba.css","mods/ffxiv/site/theme.js","mods/ffxiv/site/enhancements.js","mods/ffxiv/site/enhancements.css","_headers","mods/ffxiv/almanac/about/index.html","mods/ffxiv/almanac/almanac.css","mods/ffxiv/almanac/almanac.js","mods/ffxiv/almanac/index.html","mods/ffxiv/almanac/media/manifest.json","mods/ffxiv/almanac/schema/recommendations.v1.json","mods/ffxiv/almanac/schema/results.v1.json","mods/ffxiv/almanac/vote/ideas.json","mods/ffxiv/almanac/vote/index.html","mods/ffxiv/almanac/vote/version.json","mods/ffxiv/index.html","mods/ffxiv/plugins.json","mods/ffxiv/plugins/icons/almanac-banner.png","mods/ffxiv/plugins/icons/almanac.png","mods/ffxiv/plugins/icons/ghostty-banner.png","mods/ffxiv/plugins/icons/ghostty.png","mods/ffxiv/plugins/icons/xivarcade-banner.png","mods/ffxiv/plugins/icons/xivarcade.png","mods/ffxiv/plugins/icons/xivcamp.png","mods/ffxiv/plugins/icons/xivdesktop-banner.png","mods/ffxiv/plugins/icons/xivdesktop.png","mods/ffxiv/plugins/icons/xivdispatch.png","mods/ffxiv/plugins/icons/xivhud-character.png","mods/ffxiv/plugins/icons/xivhud-journal.png","mods/ffxiv/plugins/icons/xivhud.png","mods/ffxiv/plugins/icons/xivlantern-banner.png","mods/ffxiv/plugins/icons/xivlantern.png","mods/ffxiv/plugins/icons/xivmcp-banner.png","mods/ffxiv/plugins/icons/xivmcp.png","mods/ffxiv/plugins/icons/xivpiano-banner.png","mods/ffxiv/plugins/icons/xivpiano.png","mods/ffxiv/plugins/icons/xivprism.png","mods/ffxiv/plugins/icons/xivrug.png","mods/ffxiv/plugins/icons/xivwayfinder-banner.png","mods/ffxiv/plugins/icons/xivwayfinder.png","mods/ffxiv/plugins/index.html","mods/ffxiv/plugins/plugins.css","mods/ffxiv/plugins/plugins.js","mods/ffxiv/projects.json","mods/ffxiv/site/art/almanac-banner-2.webp","mods/ffxiv/site/art/almanac-icon-2.webp","mods/ffxiv/site/art/ghostty-banner.webp","mods/ffxiv/site/art/ghostty-icon.webp","mods/ffxiv/site/art/xivarcade-banner-2.webp","mods/ffxiv/site/art/xivarcade-icon-2.webp","mods/ffxiv/site/art/xivcamp-hero.webp","mods/ffxiv/site/art/xivcamp-icon.svg","mods/ffxiv/site/art/xivcamp-preview.png","mods/ffxiv/site/art/xivdesktop-banner-2.webp","mods/ffxiv/site/art/xivdesktop-icon-2.webp","mods/ffxiv/site/art/xivdispatch-hero.webp","mods/ffxiv/site/art/xivdispatch-icon.svg","mods/ffxiv/site/art/xivdispatch-preview.png","mods/ffxiv/site/art/xivhud-banner.svg","mods/ffxiv/site/art/xivhud-character-banner.svg","mods/ffxiv/site/art/xivhud-character-icon.svg","mods/ffxiv/site/art/xivhud-icon.svg","mods/ffxiv/site/art/xivhud-journal-banner.svg","mods/ffxiv/site/art/xivhud-journal-icon.svg","mods/ffxiv/site/art/xivlantern-banner-2.webp","mods/ffxiv/site/art/xivlantern-icon-2.webp","mods/ffxiv/site/art/xivmcp-banner.webp","mods/ffxiv/site/art/xivmcp-icon.webp","mods/ffxiv/site/art/xivpiano-banner-2.webp","mods/ffxiv/site/art/xivpiano-icon-2.webp","mods/ffxiv/site/art/xivprism-hero.webp","mods/ffxiv/site/art/xivprism-icon.svg","mods/ffxiv/site/art/xivprism-preview.png","mods/ffxiv/site/art/xivrug-banner.svg","mods/ffxiv/site/art/xivrug-icon.svg","mods/ffxiv/site/art/xivstream-banner.svg","mods/ffxiv/site/art/xivstream-icon.svg","mods/ffxiv/site/art/xivwayfinder-banner-2.webp","mods/ffxiv/site/art/xivwayfinder-icon-2.webp","mods/ffxiv/site/project-preview.css","mods/ffxiv/site/project-preview.js","mods/ffxiv/site/site.css","mods/ffxiv/site/site.js","mods/ffxiv/term/gallery/gallery.css","mods/ffxiv/term/gallery/gallery.js","mods/ffxiv/term/gallery/index.html","mods/ffxiv/term/index.html","mods/ffxiv/term/media/manifest.json","mods/ffxiv/term/vote/admin/accounts.js","mods/ffxiv/term/vote/admin/admin.js","mods/ffxiv/term/vote/admin/analytics.css","mods/ffxiv/term/vote/admin/analytics.js","mods/ffxiv/term/vote/admin/index.html","mods/ffxiv/term/vote/apps/apps.js","mods/ffxiv/term/vote/apps/index.html","mods/ffxiv/term/vote/ballot.js","mods/ffxiv/term/vote/beacon.js","mods/ffxiv/term/vote/ideas.json","mods/ffxiv/term/vote/index.html","mods/ffxiv/term/vote/privacy/index.html","mods/ffxiv/term/vote/version.json","mods/ffxiv/term/vote/vote.css","mods/ffxiv/term/vote/vote.js","mods/ffxiv/xivarcade/index.html","mods/ffxiv/xivarcade/media/manifest.json","mods/ffxiv/xivarcade/vote/ideas.json","mods/ffxiv/xivarcade/vote/index.html","mods/ffxiv/xivarcade/vote/version.json","mods/ffxiv/xivcamp/index.html","mods/ffxiv/xivcamp/preview/index.html","mods/ffxiv/xivcamp/vote/ideas.json","mods/ffxiv/xivcamp/vote/index.html","mods/ffxiv/xivcamp/vote/version.json","mods/ffxiv/xivdesktop/index.html","mods/ffxiv/xivdesktop/media/manifest.json","mods/ffxiv/xivdesktop/vote/ideas.json","mods/ffxiv/xivdesktop/vote/index.html","mods/ffxiv/xivdesktop/vote/version.json","mods/ffxiv/xivdispatch/index.html","mods/ffxiv/xivdispatch/preview/index.html","mods/ffxiv/xivdispatch/vote/ideas.json","mods/ffxiv/xivdispatch/vote/index.html","mods/ffxiv/xivdispatch/vote/version.json","mods/ffxiv/xivhud/character/index.html","mods/ffxiv/xivhud/developers/index.html","mods/ffxiv/xivhud/index.html","mods/ffxiv/xivhud/journal/index.html","mods/ffxiv/xivlantern/index.html","mods/ffxiv/xivlantern/media/manifest.json","mods/ffxiv/xivlantern/vote/ideas.json","mods/ffxiv/xivlantern/vote/index.html","mods/ffxiv/xivlantern/vote/version.json","mods/ffxiv/xivmcp/index.html","mods/ffxiv/xivmcp/media/manifest.json","mods/ffxiv/xivmcp/vote/ideas.json","mods/ffxiv/xivmcp/vote/index.html","mods/ffxiv/xivmcp/vote/version.json","mods/ffxiv/xivpiano/index.html","mods/ffxiv/xivpiano/media/manifest.json","mods/ffxiv/xivpiano/vote/ideas.json","mods/ffxiv/xivpiano/vote/index.html","mods/ffxiv/xivpiano/vote/version.json","mods/ffxiv/xivprism/index.html","mods/ffxiv/xivprism/preview/index.html","mods/ffxiv/xivprism/vote/ideas.json","mods/ffxiv/xivprism/vote/index.html","mods/ffxiv/xivprism/vote/version.json","mods/ffxiv/xivrug/index.html","mods/ffxiv/xivstream/index.html","mods/ffxiv/xivwayfinder/index.html","mods/ffxiv/xivwayfinder/media/manifest.json","mods/ffxiv/xivwayfinder/vote/ideas.json","mods/ffxiv/xivwayfinder/vote/index.html","mods/ffxiv/xivwayfinder/vote/version.json"].sort()
		);
		return;
	}
);

test(
	'page has no inline script, style or handlers, and renders data only through textContent',
	function() {
		const html = read((STATIC_DIR + 'index.html'));
		const js = read((STATIC_DIR + 'vote.js'));
		const ballot = read((STATIC_DIR + 'ballot.js'));
		assert.ok((!(new RegExp('<script(?![^>]*\\ssrc=)','i').test(html))),'every script is external');
		const scripts = [...html.matchAll(new RegExp('<script src="([^"]+)"','g'))].map(
			function(m) {
				return m[1];
			}
		);
		assert.deepEqual(scripts,['/mods/ffxiv/site/theme.js','/mods/ffxiv/term/vote/ballot.js','/mods/ffxiv/term/vote/vote.js','/mods/ffxiv/term/vote/beacon.js','/mods/ffxiv/site/enhancements.js'],'ballot.js loads before vote.js, with a deferred progressive enhancement');
		assert.ok((!(new RegExp('<style','i').test(html))),'no style elements');
		assert.ok((!(new RegExp('\\sstyle=','i').test(html))),'no style attributes');
		assert.ok((!(new RegExp('\\son[a-z]+=','i').test(html))),'no inline event handlers');
		assert.ok((!(new RegExp('nonce','i').test(html))));
		const files = walk('public/');
		for (let ref of iterable$(html.matchAll(new RegExp('(?:src|href)="(\\/mods\\/[^"]+)"','g')))){
			if (ref[1].startsWith('/mods/ffxiv/term/vote/api/')) {
				continue;
			};
			const route = new URL(ref[1],'https://spacegho.st').pathname;
			const path = (route.slice(1) + (route.endsWith('/') ? 'index.html' : ''));
			assert.ok(files.includes(path),('' + String(ref[1]) + ' exists in public/'));
		};
		for (let sink of ['innerHTML','outerHTML','insertAdjacentHTML','document.write','eval(','new Function']){
			assert.ok((!js.includes(sink)),('vote.js must not use ' + String(sink) + ''));
			assert.ok((!ballot.includes(sink)),('ballot.js must not use ' + String(sink) + ''));
		};
		assert.ok((!(new RegExp('document|window|fetch\\(','').test(ballot.replace(new RegExp('^\\s*\\/\\/.*$','gm'),'')))),'ballot.js stays free of the DOM and network');
		for (let endpoint of ['api/ideas','api/version']){
			assert.ok((!js.includes(endpoint)),endpoint);
		};
		assert.ok(((js.includes('\'ideas.json\'') && js.includes('\'api/tallies\'')) && js.includes('\'api/mine\'')));
		assert.ok((!(new RegExp('disabled: !vote','').test(js))),'the note box is never disabled');
		assert.ok((html.includes('Johnneylee Jack Rollins') && html.includes('https://github.com/Spaceghost')));
		for (let id of ['signin-github','signin-xivauth','logout','link-character','forget-character']){
			assert.ok(html.includes(('id="' + String(id) + '"')),id);
		};
		assert.ok(html.includes('Signing in with FFXIV needs an XIVAuth account and shares no character. After signing in you can link one, which needs a character verified on XIVAuth.'));
		assert.ok(html.includes('Linking needs a character verified on XIVAuth, and shares the character you choose (name and world) with the site owner.'));
		assert.ok((js.includes('$(\'#link-character\').hidden = !!c;') && (!(new RegExp('me\\.provider !== \'github\'','').test(js)))));
		assert.ok((html.includes('href="/mods/ffxiv/term/vote/api/auth/github/start"') && html.includes('href="/mods/ffxiv/term/vote/api/auth/xivauth/start"')));
		assert.ok((!(new RegExp('No accounts','').test(html))),'the privacy note no longer says there are no accounts');
		assert.ok(html.includes('Your votes, notes and suggestions are linked to your GitHub or XIVAuth account id and are visible to the site owner.'));
		assert.ok((!(new RegExp('anonym|pseudonym|one-way','i').test(html))),'no anonymity claims on the page');
		for (let endpoint of ['\'api/auth/me\'','\'auth/logout\'','\'auth/character/forget\'']){
			assert.ok(js.includes(endpoint),endpoint);
		};
		assert.ok((!(new RegExp('createGate|gate\\.','').test((js + ballot)))),'no first-write gate: a session exists before any write');
		assert.ok((new RegExp('name="viewport"','').test(html) && new RegExp('prefers-color-scheme: light','').test(read((STATIC_DIR + 'vote.css')))));
		for (let f of ['index.html','vote.js','ballot.js','vote.css','admin/admin.js','beacon.js','admin/analytics.js','admin/analytics.css']){
			if ((f !== 'index.html')) {
				assert.ok((!(new RegExp('[^\\t\\n\\x20-\\x7e]','').test(read((STATIC_DIR + f))))),('' + String(f) + ' is plain ASCII'));
			};
		};
		return;
	}
);

test(
	'admin page: a static shell with no inline code and no data; the list comes only from the gated API',
	function() {
		const html = read((STATIC_DIR + 'admin/index.html'));
		const js = read((STATIC_DIR + 'admin/admin.js'));
		assert.ok(((!(new RegExp('<script(?![^>]*\\ssrc=)','i').test(html))) && (!(new RegExp('<style|\\sstyle=|\\son[a-z]+=|nonce','i').test(html)))));
		assert.deepEqual(
			[...html.matchAll(new RegExp('<script src="([^"]+)"','g'))].map(
				function(m) {
					return m[1];
				}
			),
			['/mods/ffxiv/site/theme.js','/mods/ffxiv/term/vote/admin/admin.js','/mods/ffxiv/term/vote/admin/analytics.js','/mods/ffxiv/term/vote/admin/accounts.js']
		);
		assert.match(html,new RegExp('<meta name="robots" content="noindex, nofollow">',''));
		const files = walk('public/');
		for (let ref of iterable$(html.matchAll(new RegExp('(?:src|href)="(\\/mods\\/[^"]+)"','g')))){
			assert.ok(files.includes((ref[1].slice(1) + (ref[1].endsWith('/') ? 'index.html' : ''))),ref[1]);
		};
		const accounts = read((STATIC_DIR + 'admin/accounts.js'));
		for (let sink of ['innerHTML','outerHTML','insertAdjacentHTML','document.write','eval(','new Function']){
			assert.ok(((!js.includes(sink)) && (!accounts.includes(sink))),sink);
		};
		assert.ok((((accounts.includes('\'admin/accounts\'') && accounts.includes('\'admin/accounts/ban\'')) && accounts.includes('\'admin/tokens/revoke\'')) && (!(new RegExp('[^\\t\\n\\x20-\\x7e]','').test(accounts)))));
		assert.ok((((js.includes('\'api/admin/voters\'') && js.includes('\'api/admin/gallery\'')) && js.includes('\'api/admin/almanac\'')) && js.includes('cache: \'no-store\'')));
		assert.ok((!(new RegExp('[0-9a-f]{64}|lodestone_id":|"voters":','').test(html))),'no voter data in the HTML');
		return;
	}
);

test(
	'_headers sets a strict CSP for the static files',
	function() {
		const headers = read('public/_headers');
		const block = headers.split(new RegExp('\\n(?=\\/)','')).find(
			function(b) {
				return b.startsWith('/mods/ffxiv/term/vote/*\n');
			}
		);
		assert.ok(block,'rule for /mods/ffxiv/term/vote/*');
		const csp = block.match(new RegExp('^\\s+Content-Security-Policy: (.+)$','m'))[1].split(';').map(
			function(d) {
				return d.trim();
			}
		);
		for (let d of ['default-src \'none\'','script-src \'self\'','style-src \'self\' https://fonts.googleapis.com','font-src https://fonts.gstatic.com','connect-src \'self\'','frame-ancestors \'none\'','base-uri \'none\'','img-src \'self\' data: https://*.finalfantasyxiv.com']){
			assert.ok(csp.includes(d),d);
		};
		const admin = headers.split(new RegExp('\\n(?=\\/)','')).find(
			function(b) {
				return b.startsWith('/mods/ffxiv/term/vote/admin/*\n');
			}
		);
		assert.match(admin,new RegExp('X-Robots-Tag: noindex',''));
		assert.ok((!(new RegExp('unsafe-inline|nonce-','').test(block))));
		assert.match(block,new RegExp('X-Content-Type-Options: nosniff',''));
		assert.match(block,new RegExp('Referrer-Policy: no-referrer',''));
		return;
	}
);

test(
	'wrangler.toml serves assets first and runs the Worker only for the API',
	function() {
		const toml = read('wrangler.toml');
		const assets = toml.slice(toml.indexOf('[assets]'),toml.indexOf('[[d1_databases]]'));
		assert.match(assets,new RegExp('^directory = "public"$','m'));
		assert.equal(assets.match(new RegExp('^run_worker_first = (.+)$','m'))[1],'["/mods/ffxiv/scrobble/1/*", "/mods/ffxiv/term/vote/api/*", "/mods/ffxiv/term/gallery/api/*", "/mods/ffxiv/term/gallery/img/*", "/mods/ffxiv/term/gallery/thumb/*", "/mods/ffxiv/almanac/api/*", "/mods/ffxiv/almanac/leaderboard.json", "/mods/ffxiv/almanac/recommendations.json", "/mods/ffxiv/plugins.json"]','the Worker runs for the APIs, the (approved-only) gallery images, the two Almanac aggregates and the plugin repository listing, nothing else');
		assert.match(toml,new RegExp('\\{ pattern = "spacegho\\.st\\/mods\\/ffxiv\\/plugins\\*", zone_name = "spacegho\\.st" \\}',''));
		assert.match(toml,new RegExp('\\{ pattern = "spacegho\\.st\\/mods\\/ffxiv\\/almanac\\*", zone_name = "spacegho\\.st" \\}',''));
		assert.ok((!(new RegExp('mods\\/ffxiv\\/ai\\b','').test(toml))),'no /mods/ffxiv/ai route');
		assert.match(assets,new RegExp('^html_handling = "auto-trailing-slash"','m'));
		assert.match(toml,new RegExp('^main = "src\\/worker\\.js"$','m'));
		assert.match(toml,new RegExp('^command = "npm run build"$','m'));
		assert.match(toml,new RegExp('^database_id = "ccbfb295-deb8-49ec-82c2-04a0b82ed4f3"$','m'));
		assert.ok((!toml.includes('[[rules]]')),'no bundled text modules');
		const vars = toml.slice(toml.indexOf('[vars]'));
		assert.match(vars,new RegExp('^GITHUB_CLIENT_ID = "Iv23liYsdX6oOuO47ulv"','m'));
		assert.match(vars,new RegExp('^XIVAUTH_CLIENT_ID = "3yHMau3T_wNUzny9QQDeiSS9wRl6BjNKIN5IpHxzQyU"','m'));
		assert.match(vars,new RegExp('^ADMIN_ACCOUNTS = "github:251370"','m'));
		assert.ok((!(new RegExp('^\\s*(GITHUB_CLIENT_SECRET|XIVAUTH_CLIENT_SECRET|SESSION_SECRET\\w*)\\s*=','m').test(toml))),'secrets never go in wrangler.toml');
		return;
	}
);

test(
	'gallery page: static, no inline code, images only from its own approved paths',
	function() {
		const html = read('public/mods/ffxiv/term/gallery/index.html');
		const js = read('public/mods/ffxiv/term/gallery/gallery.js');
		assert.ok(((!(new RegExp('<script(?![^>]*\\ssrc=)','i').test(html))) && (!(new RegExp('<style|\\sstyle=|\\son[a-z]+=|nonce','i').test(html)))));
		for (let mod of iterable$(Object.keys(VOTE_MODS))){
			assert.ok(html.includes(('data-mod="' + String(mod) + '"')),('the gallery filters to ' + String(mod) + ''));
			assert.match(js,new RegExp("(?:['\"]" + mod + "['\"]|\\b" + mod + ')\\s*:'),'gallery.js names ' + mod);
		};
		assert.deepEqual(
			[...html.matchAll(new RegExp('<script src="([^"]+)"','g'))].map(
				function(m) {
					return m[1];
				}
			),
			['/mods/ffxiv/site/theme.js','/mods/ffxiv/term/gallery/gallery.js','/mods/ffxiv/term/vote/beacon.js','/mods/ffxiv/site/enhancements.js']
		);
		const files = walk('public/');
		for (let ref of iterable$(html.matchAll(new RegExp('(?:src|href)="(\\/mods\\/[^"]+)"','g')))){
			if (ref[1].startsWith('/mods/ffxiv/term/vote/api/auth/')) {
				continue;
			};
			assert.ok(files.includes((ref[1].slice(1) + (ref[1].endsWith('/') ? 'index.html' : ''))),ref[1]);
		};
		for (let sink of ['innerHTML','outerHTML','insertAdjacentHTML','document.write','eval(','new Function']){
			assert.ok((!js.includes(sink)),sink);
		};
		assert.ok((!(new RegExp('[^\\t\\n\\x20-\\x7e]','').test(js))),'gallery.js is plain ASCII');
		assert.ok(html.includes('It is shown publicly here, with the credit you gave, once the site owner has reviewed it.'),'consent line');
		assert.ok(html.includes('/term share'));
		for (let p of ['github','xivauth']){
			assert.ok(html.includes(('id="signin-' + String(p) + '" href="/mods/ffxiv/term/vote/api/auth/' + String(p) + '/start?return=/mods/ffxiv/term/gallery/"')),p);
		};
		assert.ok((new RegExp('<form id="upload" novalidate hidden>','').test(html) && new RegExp('<div id="signin" class="signin" hidden>','').test(html)),'nothing is offered before the page knows who is asking');
		assert.ok(((js.includes('VOTE_API + \'gallery/upload\'') && js.includes('credentials: \'same-origin\'')) && js.includes('VOTE_API + \'auth/me\'')));
		assert.ok(((!(new RegExp('needs no account','i').test(html))) && html.includes('which sign-in you used, a key derived from that account')),'the privacy note says what is kept with a shot');
		const headers = read('public/_headers');
		const block = headers.split(new RegExp('\\n(?=\\/)','')).find(
			function(b) {
				return b.startsWith('/mods/ffxiv/term/gallery/*\n');
			}
		);
		assert.ok((((block && new RegExp('img-src \'self\' data:;','').test(block)) && new RegExp('frame-ancestors \'none\'','').test(block)) && (!(new RegExp('unsafe-inline','').test(block)))));
		return;
	}
);

test(
	'connected apps page: static, no inline code, no data, codes and tokens never rendered as HTML',
	function() {
		const html = read((STATIC_DIR + 'apps/index.html'));
		const js = read((STATIC_DIR + 'apps/apps.js'));
		assert.ok(((!(new RegExp('<script(?![^>]*\\ssrc=)','i').test(html))) && (!(new RegExp('<style|\\sstyle=|\\son[a-z]+=|nonce','i').test(html)))));
		assert.deepEqual(
			[...html.matchAll(new RegExp('<script src="([^"]+)"','g'))].map(
				function(m) {
					return m[1];
				}
			),
			['/mods/ffxiv/site/theme.js','/mods/ffxiv/term/vote/apps/apps.js']
		);
		assert.match(html,new RegExp('<meta name="robots" content="noindex, nofollow">',''));
		const files = walk('public/');
		for (let ref of iterable$(html.matchAll(new RegExp('(?:src|href)="(\\/mods\\/[^"?]+)','g')))){
			if (ref[1].startsWith('/mods/ffxiv/term/vote/api/')) {
				continue;
			};
			assert.ok(files.includes((ref[1].slice(1) + (ref[1].endsWith('/') ? 'index.html' : ''))),ref[1]);
		};
		for (let sink of ['innerHTML','outerHTML','insertAdjacentHTML','document.write','eval(','new Function','localStorage.setItem','console.']){
			assert.ok((!js.includes(sink)),sink);
		};
		assert.ok((!(new RegExp('[^\\t\\n\\x20-\\x7e]','').test(js))),'apps.js is plain ASCII');
		for (let endpoint of ['\'device/lookup\'','\'device/approve\'','\'apps/revoke\'','\'apps\'','\'auth/me\'']){
			assert.ok(js.includes(endpoint),endpoint);
		};
		assert.ok(html.includes('Only approve a code you asked an app for yourself'),'the phishing warning sits beside the Approve button');
		assert.ok((!(new RegExp('gvt_|access_token|device_code','').test((js + html)))),'the page never handles a token or a device code');
		for (let page of ['public/mods/ffxiv/term/vote/index.html','public/mods/ffxiv/term/gallery/index.html','public/mods/ffxiv/almanac/index.html','public/mods/ffxiv/term/vote/privacy/index.html']){
			assert.ok(read(page).includes('href="/mods/ffxiv/term/vote/apps/"'),(page + ' links the connected apps page'));
		};
		assert.ok((!(new RegExp('needs no account','i').test(read('public/mods/ffxiv/almanac/index.html')))));
		assert.match(read('public/_headers'),new RegExp('\\/mods\\/ffxiv\\/term\\/vote\\/apps\\/\\*\\n  X-Robots-Tag: noindex',''));
		return;
	}
);

test(
	'almanac page: static, no inline code, data only from leaderboard.json, linked from the other pages',
	function() {
		const html = read('public/mods/ffxiv/almanac/index.html');
		const js = read('public/mods/ffxiv/almanac/almanac.js');
		assert.ok(((!(new RegExp('<script(?![^>]*\\ssrc=)','i').test(html))) && (!(new RegExp('<style|\\sstyle=|\\son[a-z]+=|nonce','i').test(html)))));
		assert.deepEqual(
			[...html.matchAll(new RegExp('<script src="([^"]+)"','g'))].map(
				function(m) {
					return m[1];
				}
			),
			['/mods/ffxiv/site/theme.js','/mods/ffxiv/almanac/almanac.js','/mods/ffxiv/term/vote/beacon.js','/mods/ffxiv/site/enhancements.js']
		);
		const files = walk('public/');
		for (let ref of iterable$(html.matchAll(new RegExp('(?:src|href)="(\\/mods\\/[^"]+)"','g')))){
			if ((ref[1] === '/mods/ffxiv/almanac/recommendations.json')) {
				continue;
			};
			assert.ok(files.includes((ref[1].slice(1) + (ref[1].endsWith('/') ? 'index.html' : ''))),ref[1]);
		};
		for (let sink of ['innerHTML','outerHTML','insertAdjacentHTML','document.write','eval(','new Function']){
			assert.ok((!js.includes(sink)),sink);
		};
		assert.ok((!(new RegExp('[^\\t\\n\\x20-\\x7e]','').test(js))),'almanac.js is plain ASCII');
		assert.ok(js.includes('\'leaderboard.json\''));
		assert.ok((html.includes('https://github.com/Spaceghost/almanac-dalamud') && new RegExp('Almanac','').test(html)));
		for (let page of ['public/mods/ffxiv/term/vote/index.html','public/mods/ffxiv/term/gallery/index.html','public/mods/ffxiv/term/vote/admin/index.html']){
			assert.ok(read(page).includes('href="/mods/ffxiv/almanac/"'),(page + ' links the leaderboard'));
		};
		const headers = read('public/_headers');
		const block = headers.split(new RegExp('\\n(?=\\/)','')).find(
			function(b) {
				return b.startsWith('/mods/ffxiv/almanac/*\n');
			}
		);
		assert.ok((((block && new RegExp('script-src \'self\'','').test(block)) && new RegExp('frame-ancestors \'none\'','').test(block)) && (!(new RegExp('unsafe-inline','').test(block)))));
		return;
	}
);

test(
	'the published results schema matches the shared copy and the generated Worker module',
	async function() {
		const published = JSON.parse(read('public/mods/ffxiv/almanac/schema/results.v1.json'));
		const {'default': generated} = (await import('../src/almanac-schema.js'));
		assert.deepEqual(generated,published,'run: node scripts/build.js');
		const {existsSync: existsSync,readFileSync: readFileSync} = (await import('node:fs'));
		const shared = process.env.ALMANAC_SHARED_SCHEMA;
		if ((shared && existsSync(shared))) {
			assert.deepEqual(JSON.parse(readFileSync(shared,'utf8')),published,'shared schema changed: copy it into public/mods/ffxiv/almanac/schema/');
		};
		return;
	}
);

const MINISITES = {ghostty: 'mods/ffxiv/term/index.html',xivmcp: 'mods/ffxiv/xivmcp/index.html',xivdesktop: 'mods/ffxiv/xivdesktop/index.html',xivarcade: 'mods/ffxiv/xivarcade/index.html',xivwayfinder: 'mods/ffxiv/xivwayfinder/index.html',xivlantern: 'mods/ffxiv/xivlantern/index.html',xivpiano: 'mods/ffxiv/xivpiano/index.html',almanac: 'mods/ffxiv/almanac/about/index.html'};

test(
	'hub and minisites: static, shared stylesheet and script, no third-party requests, honest and credited',
	function() {
		const files = walk('public/');
		const js = read('public/mods/ffxiv/site/site.js');
		const css$ = read('public/mods/ffxiv/site/site.css');
		for (let sink of ['innerHTML','outerHTML','insertAdjacentHTML','document.write','eval(','new Function']){
			assert.ok((!js.includes(sink)),sink);
		};
		assert.ok((!(new RegExp('[^\\t\\n\\x20-\\x7e]','').test(js))),'site.js is plain ASCII');
		assert.ok(((!(new RegExp('https?:\\/\\/','').test(css$))) && (!(new RegExp('@import','').test(css$)))),'site.css fetches nothing from elsewhere');
		assert.ok((((new RegExp('prefers-color-scheme: light','').test(css$) && new RegExp('data-theme="light"','').test(css$)) && new RegExp('prefers-reduced-motion','').test(css$)) && new RegExp(':focus-visible','').test(css$)));
		assert.ok((js.includes('\'shots/upload?mod=\'') && (!js.includes('api/upload'))));
		const pages = {hub: 'mods/ffxiv/index.html',...MINISITES};
		for (let [id,path] of iterable$(Object.entries(pages))){
			const html = read(('public/' + path));
			assert.ok(((!(new RegExp('<script(?![^>]*\\ssrc=)','i').test(html))) && (!(new RegExp('<style|\\sstyle=|\\son[a-z]+=|nonce','i').test(html)))),(path + ' has no inline code'));
			assert.deepEqual(
				[...html.matchAll(new RegExp('<script src="([^"]+)"','g'))].map(
					function(m) {
						return m[1];
					}
				),
				['/mods/ffxiv/site/theme.js','/mods/ffxiv/site/site.js','/mods/ffxiv/term/vote/beacon.js','/mods/ffxiv/site/enhancements.js'],
				path
			);
			assert.deepEqual(
				[...html.matchAll(new RegExp('<link rel="stylesheet" href="([^"]+)"','g'))].map(
					function(m) {
						return m[1];
					}
				),
				['/mods/ffxiv/site/enhancements.imba.css','/mods/ffxiv/site/enhancements.css','/mods/ffxiv/site/site.css'],
				(path + ' uses shared stylesheets')
			);
			assert.ok((!(new RegExp('fonts\\.googleapis|fonts\\.gstatic','').test(html))),(path + ' uses system fonts'));
			for (let ref of iterable$(html.matchAll(new RegExp('\\s(?:src|href)="(\\/mods\\/[^"]+)"','g')))){
				if (ref[1].startsWith('/mods/ffxiv/term/vote/api/auth/')) {
					continue;
				};
				const p = ref[1].slice(1).split('#')[0].split('?')[0];
				assert.ok(files.includes((p + (p.endsWith('/') ? 'index.html' : ''))),(((path + ': ') + ref[1]) + ' exists in public/'));
			};
			for (let img of iterable$(html.matchAll(new RegExp('<img [^>]*>','g')))){
				assert.ok(((new RegExp(' alt="','').test(img[0]) && new RegExp(' width="\\d+"','').test(img[0])) && new RegExp(' height="\\d+"','').test(img[0])),((path + ': ') + img[0]));
			};
			assert.ok((html.includes('Johnneylee Jack Rollins') && html.includes('https://github.com/Spaceghost')),(path + ' credits the author'));
			assert.ok((html.includes('https://spacegho.st/mods/ffxiv/plugins.json') && html.includes('href="/mods/ffxiv/plugins/"')),(path + ' names the repository'));
			assert.ok(((new RegExp('name="viewport"','').test(html) && html.includes('id="main"')) && html.includes('class="skip"')));
			assert.ok(html.includes('href="/mods/ffxiv/term/vote/privacy/"'),(path + ' links what the site counts'));
			assert.ok(new RegExp('not yet been (?:verified|observed)|Nothing has been observed|need validation in game|require.*acceptance|acceptance pending|checks pending','').test(html),(path + ' says what is unverified'));
			if ((id === 'hub')) {
				for (let href of ['/mods/ffxiv/term/','/mods/ffxiv/xivmcp/','/mods/ffxiv/xivdesktop/','/mods/ffxiv/xivarcade/','/mods/ffxiv/xivwayfinder/','/mods/ffxiv/xivlantern/','/mods/ffxiv/xivpiano/','/mods/ffxiv/almanac/about/','/mods/ffxiv/almanac/','/mods/ffxiv/term/vote/','/mods/ffxiv/term/gallery/']){
					assert.ok(html.includes(('href="' + String(href) + '"')),('hub links ' + href));
				};
				continue;
			};
			assert.ok((html.includes(('<body data-mod="' + String(id) + '"')) && html.includes(('data-media="/' + String(MEDIA_DIRS[id]) + 'manifest.json"'))),path);
			for (let needle of ['Dev Plugin Locations','Custom Plugin Repositories','id="install"','id="requirements"','id="screens"','id="community"','id="media"','id="shots"']){
				assert.ok(html.includes(needle),((path + ': ') + needle));
			};
			assert.match(html,new RegExp('<div id="signed-in" hidden>\\s*<form id="upload">',''));
			const back = ('/' + path.replace(new RegExp('index\\.html$',''),''));
			assert.ok((html.includes(('href="/mods/ffxiv/term/vote/api/auth/github/start?return=' + String(back) + '"')) && html.includes(('href="/mods/ffxiv/term/vote/api/auth/xivauth/start?return=' + String(back) + '"'))),(path + ' sign-in links'));
			assert.ok(html.includes('Your upload is linked to your GitHub or XIVAuth account id, which the site owner can see'),path);
			assert.ok((!(new RegExp('anonym','i').test(html))),(path + ' makes no anonymity claim'));
		};
		assert.ok(read('public/mods/ffxiv/almanac/index.html').includes('href="/mods/ffxiv/almanac/about/"'),'the leaderboard links its minisite');
		return;
	}
);

test(
	'media manifests: every slot is named, every listed file exists beside the manifest, and nothing unlisted is published',
	function() {
		const files = walk('public/');
		const NAME = new RegExp('^[a-z0-9][a-z0-9._-]{0,80}\\.(webp|avif|jpg|jpeg|png|mp4|webm)$','');
		for (let [id,dir] of iterable$(Object.entries(MEDIA_DIRS))){
			const m = JSON.parse(read((('public/' + dir) + 'manifest.json')));
			assert.equal(m.version,1);
			assert.equal(m.mod,id);
			assert.ok((Array.isArray(m.slots) && (m.slots.length >= 5)),dir);
			const listed = new Set();
			const check = function(f,where) {
				for (let name of iterable$([f.src,f.poster,...(f.sizes || []).map(
					function(s) {
						return s.src;
					}
				)].filter(
					function(n) {
						return ((n !== undefined) && (n !== null));
					}
				))){
					assert.match(name,NAME,((where + ': ') + name));
					assert.ok(files.includes((dir + name)),((((where + ': ') + name) + ' is not in public/') + dir));
					listed.add((dir + name));
				};
				assert.ok(((f.type === 'image') || (f.type === 'video')),(where + ': type'));
				assert.ok((((Number.isInteger(f.width) && Number.isInteger(f.height)) && (f.width > 0)) && (f.height > 0)),(where + ': width and height keep the layout from jumping'));
				if ((f.type === 'image')) {
					assert.ok((((typeof f.alt) === 'string') && (f.alt.length > 0)),(where + ': alt'));
				};
				return;
			};
			const ids = m.slots.map(
				function(s) {
					return s.id;
				}
			);
			assert.equal(new Set(ids).size,ids.length,(dir + ' slot ids are unique'));
			for (let s of iterable$(m.slots)){
				assert.match(s.id,new RegExp('^[a-z0-9-]+$',''));
				assert.ok((((s.title && s.kind) && s.caption) && Array.isArray(s.files)),(dir + s.id));
				s.files.forEach(
					function(f) {
						return check(f,(dir + s.id));
					}
				);
			};
			if ((m.video && m.video.file)) {
				check(m.video.file,(dir + 'video'));
			};
			for (let f of iterable$(files.filter(
				function(x) {
					return (x.startsWith(dir) && (x !== (dir + 'manifest.json')));
				}
			))){
				assert.ok(listed.has(f),(f + ' is not listed in its manifest'));
				assert.ok((statSync(new URL(('public/' + f),root)).size <= ((25 * 1024) * 1024)),(f + ' is over the 25 MiB static asset limit'));
			};
		};
		const ghostty = JSON.parse(read('public/mods/ffxiv/term/media/manifest.json'));
		assert.equal(ghostty.slots[0].id,'hero-costa-night');
		assert.ok(((ghostty.slots.length === 16) && (ghostty.video.cuts.length === 8)));
		return;
	}
);

test(
	'_headers and routes cover the hub and minisites without stacking a second CSP on the older pages',
	function() {
		const blocks = read('public/_headers').split(new RegExp('\\n(?=\\/)',''));
		for (let path of ['/mods/ffxiv/','/mods/ffxiv/site/*','/mods/ffxiv/term/','/mods/ffxiv/term/media/*','/mods/ffxiv/xivmcp/*','/mods/ffxiv/xivdesktop/*']){
			const block = blocks.find(
				function(b) {
					return b.startsWith((path + '\n'));
				}
			);
			assert.ok(block,path);
			const csp = block.match(new RegExp('^\\s+Content-Security-Policy: (.+)$','m'))[1].split(';').map(
				function(d) {
					return d.trim();
				}
			);
			for (let d of ['default-src \'none\'','script-src \'self\'','style-src \'self\'','connect-src \'self\'','img-src \'self\' data:','media-src \'self\'','frame-ancestors \'none\'','base-uri \'none\'']){
				assert.ok(csp.includes(d),((path + ' ') + d));
			};
			assert.ok((!(new RegExp('unsafe-inline|nonce-|https:','').test(csp.join(';')))),path);
		};
		assert.ok(
			(!(blocks.some(
				function(b) {
					return new RegExp('^\\/mods\\/ffxiv\\/\\*\\n|^\\/mods\\/ffxiv\\/term\\/\\*\\n|^\\/\\*\\n','').test(b);
				}
			))),
			'no rule broad enough to reach the vote, gallery or plugins pages'
		);
		assert.match(
			blocks.find(
				function(b) {
					return b.startsWith('/mods/ffxiv/almanac/*\n');
				}
			),
			new RegExp('media-src \'self\'','')
		);
		const toml = read('wrangler.toml');
		for (let pattern of ['spacegho.st/mods/ffxiv','spacegho.st/mods/ffxiv/','spacegho.st/mods/ffxiv/site/*','spacegho.st/mods/ffxiv/term','spacegho.st/mods/ffxiv/term/','spacegho.st/mods/ffxiv/term/media/*','spacegho.st/mods/ffxiv/xivmcp*','spacegho.st/mods/ffxiv/xivdesktop*']){
			assert.ok(toml.includes(('{ pattern = "' + String(pattern) + '", zone_name = "spacegho.st" }')),pattern);
		};
		return;
	}
);
