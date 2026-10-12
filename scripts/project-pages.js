// Generated from imba/scripts/project-pages.imba; edit the Imba source.
import {iterable$} from 'imba/runtime';

/*body*/
// Navigation, project cards, new project pages and gallery categories share data/mods.json.
export const escape = function(value) {
	return String(((value ?? ''))).replace(
		new RegExp('[&<>"\']','g'),
		function(c) {
			return {'&': '&amp;','<': '&lt;','>': '&gt;','"': '&quot;','\'': '&#39;'}[c];
		}
	);
};

export const galleryProjects = function(registry) {
	return registry.mods.filter(
		function(m) {
			return (m.gallery !== false);
		}
	);
};

export function projectNavigation(registry){
	return (registry.mods.filter(
		function(m) {
			return m.navigation;
		}
	).map(
		function(m) {
			return ('<a class="chip" href="' + String(escape(m.page)) + '">' + String(escape(m.name)) + '</a>');
		}
	).join('\n      ') + '\n      <a class="chip" href="/mods/ffxiv/plugins/">Install</a>\n      <button class="chip" id="theme" type="button" aria-label="Colour theme">theme: auto</button>');
	return;
};

export function projectCards(registry){
	return registry.mods.filter(
		function(m) {
			return (m.kind !== 'library');
		}
	).map(
		function(m) {
			return ('<article class="modcard glass">\n        <img src="' + String(escape(m.bannerPath)) + '" alt="' + String(escape(m.name)) + ' illustration" width="730" height="380" loading="lazy" decoding="async">\n        <div class="in"><div class="id"><img src="' + String(escape(m.iconPath)) + '" alt="" width="192" height="192"><h2><a href="' + String(escape(m.page)) + '">' + String(escape(m.name)) + '</a></h2></div>\n        <p class="tagline">' + String(escape(m.punchline)) + '</p><p>' + String(escape(m.description)) + '</p>\n        <p><span class="tag unverified">' + String(escape(m.status)) + '</span></p>\n        <p class="links"><a href="' + String(escape(m.page)) + '">About</a>' + String((m.votePage ? ((' <a href="' + String(escape(m.votePage)) + '">Vote</a>')) : '')) + '' + String((m.gallery ? ((' <a href="/mods/ffxiv/term/gallery/?mod=' + String(escape(m.id)) + '">Gallery</a>')) : '')) + ' <a href="https://github.com/' + String(escape(m.repo)) + '" rel="noopener">Source</a></p></div>\n      </article>');
		}
	).join('\n      ');
	return;
};

export function projectPage(m,registry){
	const install = ((m.kind === 'companion') ? (('<p>Download the release candidate from <a href="https://github.com/' + String(escape(m.repo)) + '/releases">GitHub releases</a>. Run <code>xivstream detect</code> and review <code>xivstream plan -v</code> before applying changes.</p>')) : (((m.kind === 'library') ? '<p>This library is bundled with Journal and Character. It has no separate Dalamud installer entry.</p>' : (((m.id === 'xivhud-character') ? (('<p>Build from the <a href="https://github.com/' + String(escape(m.repo)) + '">HUD family source</a>, or use its explicitly marked development package. Character is held out of the automatic installer pending live acceptance.</p>')) : '<p>Add <code>https://spacegho.st/mods/ffxiv/plugins.json</code> in Dalamud’s Experimental settings and enable plugin testing builds. These are experimental builds. The <a href="/mods/ffxiv/plugins/">installation page</a> explains the repository and the build-it-yourself path.</p>')))));
	return ('<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + String(escape(m.name)) + ' for FFXIV</title>\n<meta name="description" content="' + String(escape(m.description)) + '"><meta name="color-scheme" content="dark light"><meta name="referrer" content="no-referrer"><link rel="canonical" href="https://spacegho.st' + String(escape(m.page)) + '">\n<link rel="icon" href="' + String(escape(m.iconPath)) + '"><link rel="stylesheet" href="/mods/ffxiv/site/site.css"><script src="/mods/ffxiv/site/site.js"></script><script src="/mods/ffxiv/term/vote/beacon.js" defer></script></head>\n<body data-mod="' + String(escape(m.id)) + '"><a class="skip" href="#main">Skip to content</a><div class="wrap"><header class="sitebar"><a class="brand" href="/mods/ffxiv/"><b>spacegho.st</b> / ffxiv mods</a><nav aria-label="Mods">' + String(projectNavigation(registry)) + '</nav></header>\n<main id="main"><section class="hero glass"><div><p class="eyebrow">' + String(escape(m.kind)) + ' · open source · experimental</p><div class="hero-id"><img src="' + String(escape(m.iconPath)) + '" alt="" width="72" height="72"><h1>' + String(escape(m.name)) + '</h1></div><p class="tagline">' + String(escape(m.punchline)) + '</p><p class="lede">' + String(escape(m.description)) + '</p><div class="cta"><a class="btn primary" href="https://github.com/' + String(escape(m.repo)) + '">Source</a><a class="btn" href="#install">Install / build</a>' + String((m.gallery ? (('<a class="btn" href="/mods/ffxiv/term/gallery/?mod=' + String(escape(m.id)) + '">Gallery</a>')) : '')) + '</div></div><img class="hero-art" src="' + String(escape(m.bannerPath)) + '" alt="' + String(escape(m.name)) + ' illustration; not an in-game screenshot" width="730" height="380"></section>\n<div class="status" role="note"><b>Current status</b><p>' + String(escape(m.status)) + '. Verification below describes earlier recorded checks; the new publication and IPC work have offline validation.</p></div>\n' + String((m.sections || []).map(
		function(s) {
			return ('<section class="glass project-section"><h2>' + String(escape(s.title)) + '</h2>' + String(s.body) + '</section>');
		}
	).join('\n')) + '\n<section id="install" class="glass project-section"><h2>Install and build</h2>' + String(install) + '<p>' + String(escape((m.needs || ''))) + '</p><p>Build instructions and verification records are in the <a href="https://github.com/' + String(escape(m.repo)) + '">project README</a>.</p></section>\n' + String(((m.kind === 'plugin') ? '<section class="glass project-section"><h2>Screenshots and clips</h2><p>New publication screenshots have not been captured. The illustration above is artwork. The gallery accepts community screenshots with this project’s tag.</p></section>' : '')) + '\n' + String((m.id.startsWith('xivhud') ? '<p class="links"><a href="/mods/ffxiv/xivhud/">HUD family</a> · <a href="/mods/ffxiv/xivhud/journal/">Journal</a> · <a href="/mods/ffxiv/xivhud/character/">Character</a> · <a href="/mods/ffxiv/xivhud/developers/">Developer libraries and IPC</a></p>' : '')) + '\n</main><footer class="foot">Made by Johnneylee Jack Rollins · <a href="https://github.com/Spaceghost">Source on GitHub</a>. Unofficial fan projects; not endorsed by Square Enix.</footer></div></body></html>\n');
	return;
};

export function projectOutputs(registry,pages){
	const out = {};
	for (let m of iterable$(registry.mods.filter(
		function(m) {
			return m.sections;
		}
	))){
		out[(('public' + m.page) + 'index.html')] = projectPage(m,registry);
	};
	for (let [path,content] of iterable$(Object.entries(pages))){
		if (Object.hasOwn(out,path)) {
			continue;
		};
		let html = content;
		if ((path === 'public/mods/ffxiv/index.html')) {
			html = html.replace(new RegExp('(<div class="mods">)[\\s\\S]*?(<\\/div>\\s*<\\/section>)',''),('$1\n      ' + String(projectCards(registry)) + '\n      $2'));
		};
		html = html.replace(new RegExp('(<nav aria-label="Mods">)[\\s\\S]*?(<\\/nav>)',''),('$1\n      ' + String(projectNavigation(registry)) + '\n    $2'));
		if (path.endsWith('/term/gallery/index.html')) {
			html = html.replace(
				new RegExp('(<span class="row" id="mod-filter">)[\\s\\S]*?(<\\/span>)',''),
				((('$1\n        <a class="chip" href="/mods/ffxiv/term/gallery/" data-mod="">All</a>\n') + galleryProjects(registry).map(
					function(m) {
						return ('        <a class="chip" href="?mod=' + String(escape(m.id)) + '" data-mod="' + String(escape(m.id)) + '">' + String(escape(m.name)) + '</a>');
					}
				).join('\n')) + '\n      $2')
			);
		};
		if ((html !== content)) {
			out[path] = html;
		};
	};
	out['public/mods/ffxiv/projects.json'] = (JSON.stringify(
		{
			version: registry.version,
			projects: registry.mods.map(
				function({sections: sections,_comment: _comment,...m}) {
					return m;
				}
			)
		},
		null,
		2
	) + '\n');
	return out;
	return;
};

export function projectRoutes(registry){
	const prefixes = [...new Set(
		registry.mods.filter(
			function(m) {
				return m.sections;
			}
		).map(
			function(m) {
				return m.page.split('/').slice(0,4).join('/');
			}
		)
	)];
	return (prefixes.map(
		function(path) {
			return ('  { pattern = "spacegho.st' + String(path) + '*", zone_name = "spacegho.st" },');
		}
	).join('\n') + '\n  { pattern = "spacegho.st/mods/ffxiv/projects.json", zone_name = "spacegho.st" }');
	return;
};

export function projectHeaders(registry){
	const prefixes = [...new Set(
		registry.mods.filter(
			function(m) {
				return m.sections;
			}
		).map(
			function(m) {
				return m.page.split('/').slice(0,4).join('/');
			}
		)
	)];
	return prefixes.map(
		function(path) {
			return ('' + String(path) + '/*\n  Content-Security-Policy: default-src \'none\'; script-src \'self\'; style-src \'self\'; connect-src \'self\'; img-src \'self\' data:; media-src \'self\'; base-uri \'none\'; form-action \'self\'; frame-ancestors \'none\'\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Referrer-Policy: no-referrer\n  Cross-Origin-Opener-Policy: same-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()\n');
		}
	).join('\n');
	return;
};
