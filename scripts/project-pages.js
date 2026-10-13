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


export function enhancePage(html){
	if (!html.includes('/mods/ffxiv/site/enhancements.js')) {
		html = html.replace('</head>','<link rel="stylesheet" href="/mods/ffxiv/site/enhancements.imba.css"><link rel="stylesheet" href="/mods/ffxiv/site/enhancements.css"><script src="/mods/ffxiv/site/enhancements.js" defer></script></head>');
	};
	if (!html.includes('data-project-finder')) {
		html = html.replace('</header>','<div data-project-finder><a class="chip" data-finder-fallback href="/mods/ffxiv/">Find a project</a></div></header>');
	};
	return html;
};

export function familyPage(html,registry,path){
	const route = path.replace(new RegExp('^public'),'').replace(new RegExp('index\\.html$'),'');
	const project = registry.mods.find(function(m) { return m.page == route || m.votePage == route || m.previewPage == route || (m.id == 'almanac' && route == '/mods/ffxiv/almanac/'); });
	const kind = route.endsWith('/vote/') ? 'Feature vote' : (route.endsWith('/preview/') ? 'Design preview' : ((route == '/mods/ffxiv/almanac/') ? 'Model leaderboard' : (project ? 'About' : (route.includes('/gallery/') ? 'Gallery' : (route.includes('/plugins/') ? 'Installation' : (route.includes('/roadmap/') ? 'Feature queue' : (route.includes('/apps/') ? 'Connected apps' : (route.includes('/admin/') ? 'Site administration' : (route.includes('/privacy/') ? 'Site privacy' : 'All projects')))))))));
	const current = function(url) { return (url == route) ? ' aria-current="page"' : ''; };
	const projects = registry.mods.filter(function(m) { return m.navigation; }).map(function(m) { return '<a class="chip" href="' + escape(m.page) + '"' + ((project && (project.id == m.id || (project.id.startsWith('xivhud') && m.id == 'xivhud'))) ? (' aria-current="' + ((m.page == route) ? 'page' : 'true') + '"') : '') + '>' + escape(m.name) + '</a>'; }).join('');
	const nav = '<a class="chip" href="/mods/ffxiv/"' + current('/mods/ffxiv/') + '>All projects</a>' + projects + '<a class="chip" href="/mods/ffxiv/roadmap/"' + current('/mods/ffxiv/roadmap/') + '>Feature queue</a><a class="chip" href="/mods/ffxiv/plugins/"' + current('/mods/ffxiv/plugins/') + '>Install</a><a class="chip" href="/mods/ffxiv/term/gallery/"' + current('/mods/ffxiv/term/gallery/') + '>Gallery</a><a class="chip" href="/mods/ffxiv/almanac/"' + current('/mods/ffxiv/almanac/') + '>Model leaderboard</a>';
	let tabs = '';
	if (project) {
		const links = [['About',project.page],...(project.votePage ? [['Vote',project.votePage]] : []),...(project.previewPage ? [['Preview',project.previewPage]] : []),['Source','https://github.com/' + project.repo],['Releases','https://github.com/' + project.repo + '/releases']];
		tabs = '<nav class="family-tabs" aria-label="Project">' + links.map(function([label,url]) { return '<a href="' + escape(url) + '"' + current(url) + '>' + escape(label) + '</a>'; }).join('') + '</nav>';
	};
	const voteSwitch = (kind == 'Feature vote') ? ('<details class="family-votes"><summary>Vote on another project</summary><nav aria-label="Every mod’s vote">' + registry.mods.filter(function(m) { return m.votePage; }).map(function(m) { return '<a class="chip" href="' + escape(m.votePage) + '"' + current(m.votePage) + '>' + escape(m.name) + '</a>'; }).join('') + '</nav></details>') : '';
	const context = (route == '/mods/ffxiv/') ? '' : ('<div class="family-context"><nav aria-label="Breadcrumb"><a href="/mods/ffxiv/">FFXIV mods</a>' + (project ? ('<span aria-hidden="true">/</span><a href="' + escape(project.page) + '">' + escape(project.name) + '</a>') : '') + '<span aria-hidden="true">/</span><span>' + escape(kind) + '</span></nav>' + tabs + voteSwitch + '</div>');
	const shell = '<!-- BEGIN FAMILY SHELL --><header class="sitebar family-header" data-family-shell><div class="family-masthead"><a class="brand" href="/mods/ffxiv/" aria-label="FFXIV mods home"><b>spacegho.st</b> / ffxiv mods</a><div class="family-tools"><div data-project-finder><a class="chip" data-finder-fallback href="/mods/ffxiv/">Find a project</a></div><button class="chip" id="theme" type="button" aria-label="Colour theme">theme: auto</button></div></div><nav aria-label="Mods">' + nav + '</nav></header>' + context + '<!-- END FAMILY SHELL -->';
	// Rebuild the shell idempotently while keeping page-specific controls and IDs.
	html = html.replace(new RegExp('<!-- BEGIN FAMILY SHELL -->[\\s\\S]*?<!-- END FAMILY SHELL -->\\s*'),'');
	html = html.replace(new RegExp('<header\\b([^>]*)>([\\s\\S]*?)</header>\\s*'),function(all,attrs,body) {
		if (attrs.includes('sitebar')) {
			return '';
		};
		body = body.replace(new RegExp('<div class="topline">[\\s\\S]*?</div>'),'');
		body = body.replace(new RegExp('<nav class="mods" aria-label="Every mod\'s vote">[\\s\\S]*?</nav>'),'');
		body = body.replace(new RegExp('<div data-project-finder>[\\s\\S]*?</div>'),'');
		return '<section class="family-intro glass">' + body + '</section>';
	});
	// Existing small main landmarks become sections of the page's complete main.
	if (!(html.includes('<main id="main"'))) {
		html = html.replace(new RegExp('<main\\b([^>]*)>','g'),'<div$1>').replace(new RegExp('</main>','g'),'</div>');
		html = html.replace('<div class="wrap">','<div class="wrap"><main id="main">');
		html = html.replace(new RegExp('</div>\\s*</body>'),'</main></div></body>');
	};
	if (!(html.includes('<div class="wrap">'))) {
		html = html.replace(new RegExp('(<body[^>]*>)'),'$1<div class="wrap">').replace('</body>','</div></body>');
	};
	html = html.replace('<div class="wrap">','<div class="wrap">' + shell);
	if (!html.includes('class="skip"')) {
		html = html.replace(new RegExp('(<body[^>]*>)'),'$1<a class="skip" href="#main">Skip to content</a>');
	};
	html = html.replace('href="#cats"','href="#main"');
	// Keep substantive privacy/account notes, and use one family attribution.
	html = html.replace(new RegExp('<!-- BEGIN FAMILY FOOTER -->[\\s\\S]*?<!-- END FAMILY FOOTER -->\\s*'),'');
	html = html.replace(new RegExp('<footer\\b[^>]*>([\\s\\S]*?)</footer>\\s*','g'),function(all,body) { return body.includes('<p') ? ('<section class="page-notes">' + body + '</section>') : ''; });
	const footer = '<!-- BEGIN FAMILY FOOTER --><footer class="foot family-footer"><p>Open-source FFXIV projects by <a href="https://github.com/Spaceghost">Johnneylee Jack Rollins</a>.</p><nav aria-label="Footer"><a href="/mods/ffxiv/">All projects</a><a href="/mods/ffxiv/plugins/">Install</a><a href="/mods/ffxiv/roadmap/">Feature queue</a><a href="/mods/ffxiv/term/vote/privacy/">Site privacy</a></nav><p class="small">Unofficial fan projects; not endorsed by Square Enix.</p></footer><!-- END FAMILY FOOTER -->';
	html = html.replace('</main>','</main>' + footer);
	// Functional sheets load first; the family owns the final palette and type.
	html = html.replace(new RegExp('<link[^>]+href="https://fonts\\.(?:googleapis|gstatic)[^>]*>\\s*','g'),'');
	if (!html.includes('/mods/ffxiv/site/theme.js')) {
		html = html.replace('<script ','<script src="/mods/ffxiv/site/theme.js"></script><script ');
		if (!html.includes('/mods/ffxiv/site/theme.js')) {
			html = html.replace('</head>','<script src="/mods/ffxiv/site/theme.js"></script></head>');
		};
	};
	if (!html.includes('rel="canonical"')) {
		html = html.replace('</head>','<link rel="canonical" href="https://spacegho.st' + escape(route) + '"></head>');
	};
	html = html.replace(new RegExp('<link rel="stylesheet" href="/mods/ffxiv/site/site.css">\\s*','g'),'');
	html = html.replace('</head>','<link rel="stylesheet" href="/mods/ffxiv/site/site.css"></head>');
	return html.replace(new RegExp('[ \t]+$','gm'),'');
};

export function projectReview(m){
	const releases = (m.releaseChannels || []).map(function(release) { return '<li><a href="' + escape(release.url) + '">' + escape(release.channel) + ': ' + escape(release.tag) + '</a>' + (release.version ? (' · package ' + escape(release.version)) : '') + '</li>'; }).join('');
	const availability = releases ? ('<ul>' + releases + '</ul>') : '<p>Source and development packages only; no separate automatic installer release.</p>';
	const queue = m.votePage ? ('<a href="/mods/ffxiv/roadmap/?project=' + escape(m.id) + '">Voted feature queue</a> · <a href="' + escape(m.votePage) + '">Vote on features</a>') : '<a href="/mods/ffxiv/roadmap/">Family feature queue</a>';
	return '<!-- BEGIN PROJECT REVIEW --><section class="glass project-section" id="release-status"><h2>Releases and next checks</h2><p>Reviewed <time datetime="' + escape(m.reviewedAt) + '">' + escape(m.reviewedAt) + ' UTC</time>. Release availability and live verification are tracked separately.</p>' + availability + '<p>' + escape(m.verification) + '</p><p>' + queue + ' · <a href="https://github.com/' + escape(m.repo) + '">Source and build instructions</a></p></section><!-- END PROJECT REVIEW -->';
};

export function installationProjects(registry){
	const plugins = registry.mods.filter(function(m) { return m.listed && m.kind == 'plugin'; });
	const cards = plugins.map(function(m) {
		const channel = m.released ? 'Stable release available. Testing builds, when newer, require opt-in.' : 'Testing builds only. Enable plugin testing builds in Dalamud.';
		return '<article class="mod" id="' + escape(m.id) + '" data-plugin="' + escape(m.internalName) + '"><h3>' + escape(m.name) + ' <span class="ver" data-ver>—</span></h3><p class="punch">' + escape(m.punchline) + '</p><p>' + escape(m.description) + '</p><p class="needs"><b>Needs:</b> ' + escape(m.needs || 'See the project build instructions.') + '</p><p class="note">' + escape(channel) + '</p><p class="links"><a href="' + escape(m.page) + '">About and verification</a> · <a href="https://github.com/' + escape(m.repo) + '/releases">Releases</a></p></article>';
	}).join('\n');
	const others = registry.mods.filter(function(m) { return !m.listed && m.kind != 'library'; }).map(function(m) { return '<li><a href="' + escape(m.page) + '">' + escape(m.name) + '</a>: ' + escape(m.status) + '</li>'; }).join('');
	return '<section aria-labelledby="mods-h"><h2 id="mods-h">Published installer entries</h2>' + cards + '<h3>Separate downloads and development projects</h3><ul>' + others + '</ul><p>Companion tools, browser previews and modules awaiting acceptance use their project pages. They have no automatic Dalamud installer entry.</p></section>';
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
	).join('\n      ') + '\n      <a class="chip" href="/mods/ffxiv/roadmap/">Feature queue</a>\n      <a class="chip" href="/mods/ffxiv/plugins/">Install</a>\n      <button class="chip" id="theme" type="button" aria-label="Colour theme">theme: auto</button>');
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
	const verification = m.verification || 'Verification below describes earlier recorded checks; the new publication and IPC work have offline validation.';
	const extra = (m.votePage ? ('<a class="btn" href="' + escape(m.votePage) + '">Vote on features</a>') : '') + (m.previewPage ? ('<a class="btn primary" href="' + escape(m.previewPage) + '">Try the preview</a>') : '') + (m.previewDownload ? ('<a class="btn" href="' + escape(m.previewDownload) + '">Download preview</a>') : '');
	const social = '<meta property="og:title" content="' + escape(m.name) + '"><meta property="og:description" content="' + escape(m.description) + '"><meta property="og:url" content="https://spacegho.st' + escape(m.page) + '"><meta property="og:image" content="https://spacegho.st' + escape(m.bannerPath) + '"><meta name="twitter:card" content="summary_large_image">';
	const art = '<img class="hero-art" src="' + escape(m.bannerPath) + '" alt="' + escape(m.name) + ' concept illustration; not an in-game screenshot" width="' + (m.artWidth || 730) + '" height="' + (m.artHeight || 380) + '">';
	const figure = m.artCaption ? ('<figure class="hero-figure">' + art + '<figcaption>' + escape(m.artCaption) + '</figcaption></figure>') : art;
	const media = (m.media || []).map(function(item) { return '<figure><img class="preview-media" src="' + escape(item.src) + '" alt="' + escape(item.alt) + '" width="' + item.width + '" height="' + item.height + '" loading="lazy"><figcaption>' + escape(item.caption) + '</figcaption></figure>'; }).join('');
	const install = (m.publicationStage == 'preview') ? '<p>The interactive browser preview and its native Imba source are available now. No installable Dalamud plugin or native companion app is released yet.</p>' : (((m.kind === 'companion') ? (('<p>Download the release candidate from <a href="https://github.com/' + String(escape(m.repo)) + '/releases">GitHub releases</a>. Run <code>xivstream detect</code> and review <code>xivstream plan -v</code> before applying changes.</p>')) : (((m.kind === 'library') ? '<p>This library is bundled with Journal and Character. It has no separate Dalamud installer entry.</p>' : (((m.id === 'xivhud-character') ? (('<p>Build from the <a href="https://github.com/' + String(escape(m.repo)) + '">HUD family source</a>, or use its explicitly marked development package. Character is held out of the automatic installer pending live acceptance.</p>')) : '<p>Add <code>https://spacegho.st/mods/ffxiv/plugins.json</code> in Dalamud’s Experimental settings and enable plugin testing builds. These are experimental builds. The <a href="/mods/ffxiv/plugins/">installation page</a> explains the repository and the build-it-yourself path.</p>'))))));
	return ('<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + String(escape(m.name)) + ' for FFXIV</title>\n<meta name="description" content="' + String(escape(m.description)) + '">' + String(social) + '<meta name="color-scheme" content="dark light"><meta name="referrer" content="no-referrer"><link rel="canonical" href="https://spacegho.st' + String(escape(m.page)) + '">\n<link rel="icon" href="' + String(escape(m.iconPath)) + '"><link rel="stylesheet" href="/mods/ffxiv/site/site.css"><script src="/mods/ffxiv/site/site.js"></script><script src="/mods/ffxiv/term/vote/beacon.js" defer></script></head>\n<body data-mod="' + String(escape(m.id)) + '"><a class="skip" href="#main">Skip to content</a><div class="wrap"><header class="sitebar"><a class="brand" href="/mods/ffxiv/"><b>spacegho.st</b> / ffxiv mods</a><nav aria-label="Mods">' + String(projectNavigation(registry)) + '</nav></header>\n<main id="main"><section class="hero glass"><div><p class="eyebrow">' + String(escape(m.kind)) + ' · open source · experimental</p><div class="hero-id"><img src="' + String(escape(m.iconPath)) + '" alt="" width="72" height="72"><h1>' + String(escape(m.name)) + '</h1></div><p class="tagline">' + String(escape(m.punchline)) + '</p><p class="lede">' + String(escape(m.description)) + '</p><div class="cta"><a class="btn" href="https://github.com/' + String(escape(m.repo)) + '">Source</a><a class="btn" href="#install">Source / build</a>' + String(extra) + '' + String((m.gallery ? (('<a class="btn" href="/mods/ffxiv/term/gallery/?mod=' + String(escape(m.id)) + '">Gallery</a>')) : '')) + '</div></div>' + String(figure) + '</section>\n<div class="status" role="note"><b>Current status</b><p>' + String(escape(m.status)) + '. ' + String(escape(verification)) + '</p></div>\n' + String((m.sections || []).map(
		function(s) {
			return ('<section class="glass project-section"><h2>' + String(escape(s.title)) + '</h2>' + String(s.body) + '</section>');
		}
	).join('\n')) + '\n<section id="install" class="glass project-section"><h2>' + String((m.publicationStage == 'preview') ? 'Preview and source' : 'Install and build') + '</h2>' + String(install) + '<p>' + String(escape((m.needs || ''))) + '</p><p>Build instructions and verification records are in the <a href="https://github.com/' + String(escape(m.repo)) + '">project README</a>.</p></section>\n' + String(((m.kind === 'plugin') ? ('<section class="glass project-section"><h2>Images and preview captures</h2><div class="preview-gallery">' + String(media) + '</div><p>Live game screenshots have not been captured for this publication. The illustration above is artwork. The gallery accepts community screenshots with this project’s tag.</p></section>') : '')) + '\n' + String((m.id.startsWith('xivhud') ? '<p class="links"><a href="/mods/ffxiv/xivhud/">HUD family</a> · <a href="/mods/ffxiv/xivhud/journal/">Journal</a> · <a href="/mods/ffxiv/xivhud/character/">Character</a> · <a href="/mods/ffxiv/xivhud/developers/">Developer libraries and IPC</a></p>' : '')) + '\n</main><footer class="foot">Made by Johnneylee Jack Rollins · <a href="https://github.com/Spaceghost">Source on GitHub</a>. Unofficial fan projects; not endorsed by Square Enix.</footer></div></body></html>\n');
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
		let html = out[path] || content;
		if ((path === 'public/mods/ffxiv/index.html')) {
			html = html.replace(new RegExp('(<div class="mods">)[\\s\\S]*?(<\\/div>\\s*<\\/section>)',''),('$1\n      ' + String(projectCards(registry)) + '\n      $2'));
		};
		if (path == 'public/mods/ffxiv/plugins/index.html') {
			html = html.replace(new RegExp('<section aria-labelledby="mods-h">[\\s\\S]*?</section>'),installationProjects(registry));
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
		if (!path.includes('/admin/') && !path.includes('/apps/') && !path.includes('/privacy/')) {
			html = enhancePage(html);
		};
		out[path] = html;
	};
	// All project pages use the same reviewed status and release evidence, even
	// where their longer feature descriptions remain hand-authored HTML.
	for (let m of iterable$(registry.mods)){
		const path = 'public' + m.page + 'index.html';
		const current = out[path] || pages[path];
		if (!current) {
			continue;
		};
		const status = '<div class="status" role="note"><b>Current status</b><p>' + escape(m.status) + '. ' + escape(m.verification) + '</p></div>';
		let html = current.replace(new RegExp('<div class="status"[^>]*>[\\s\\S]*?</div>'),status);
		html = html.replace(new RegExp('<!-- BEGIN PROJECT REVIEW -->[\\s\\S]*?<!-- END PROJECT REVIEW -->\\s*'),'');
		html = html.replace('</main>',projectReview(m) + '\n</main>');
		out[path] = html;
	};
	for (let [path,html] of iterable$(Object.entries(out))){
		if (path.endsWith('.html')) {
			out[path] = familyPage(html,registry,path);
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
	).join('\n') + '\n  { pattern = "spacegho.st/mods/ffxiv/roadmap*", zone_name = "spacegho.st" },\n  { pattern = "spacegho.st/mods/ffxiv/projects.json", zone_name = "spacegho.st" }');
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
	prefixes.push('/mods/ffxiv/roadmap');
	return prefixes.map(
		function(path) {
			return ('' + String(path) + '/*\n  Content-Security-Policy: default-src \'none\'; script-src \'self\'; style-src \'self\'; connect-src \'self\'; img-src \'self\' data:; media-src \'self\'; base-uri \'none\'; form-action \'self\'; frame-ancestors \'none\'\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Referrer-Policy: no-referrer\n  Cross-Origin-Opener-Policy: same-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()\n');
		}
	).join('\n');
	return;
};
