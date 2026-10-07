// Navigation, project cards, new project pages and gallery categories share data/mods.json.
export const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const galleryProjects = (registry) => registry.mods.filter((m) => m.gallery !== false);

export function projectNavigation(registry) {
  return registry.mods.filter((m) => m.navigation).map((m) => `<a class="chip" href="${escape(m.page)}">${escape(m.name)}</a>`).join('\n      ') +
    '\n      <a class="chip" href="/mods/ffxiv/plugins/">Install</a>\n      <button class="chip" id="theme" type="button" aria-label="Colour theme">theme: auto</button>';
}

export function projectCards(registry) {
  return registry.mods.filter((m) => m.kind !== 'library').map((m) => `<article class="modcard glass">
        <img src="${escape(m.bannerPath)}" alt="${escape(m.name)} illustration" width="730" height="380" loading="lazy" decoding="async">
        <div class="in"><div class="id"><img src="${escape(m.iconPath)}" alt="" width="192" height="192"><h2><a href="${escape(m.page)}">${escape(m.name)}</a></h2></div>
        <p class="tagline">${escape(m.punchline)}</p><p>${escape(m.description)}</p>
        <p><span class="tag unverified">${escape(m.status)}</span></p>
        <p class="links"><a href="${escape(m.page)}">About</a>${m.votePage ? ` <a href="${escape(m.votePage)}">Vote</a>` : ''}${m.gallery ? ` <a href="/mods/ffxiv/term/gallery/?mod=${escape(m.id)}">Gallery</a>` : ''} <a href="https://github.com/${escape(m.repo)}" rel="noopener">Source</a></p></div>
      </article>`).join('\n      ');
}

export function projectPage(m, registry) {
  const install = m.kind === 'companion'
    ? `<p>Download the release candidate from <a href="https://github.com/${escape(m.repo)}/releases">GitHub releases</a>. Run <code>xivstream detect</code> and review <code>xivstream plan -v</code> before applying changes.</p>`
    : m.kind === 'library' ? '<p>This library is bundled with Journal and Character. It has no separate Dalamud installer entry.</p>'
    : m.id === 'xivhud-character' ? `<p>Build from the <a href="https://github.com/${escape(m.repo)}">HUD family source</a>, or use its explicitly marked development package. Character is held out of the automatic installer pending live acceptance.</p>`
    : '<p>Add <code>https://spacegho.st/mods/ffxiv/plugins.json</code> in Dalamud’s Experimental settings and enable plugin testing builds. These are experimental builds. The <a href="/mods/ffxiv/plugins/">installation page</a> explains the repository and the build-it-yourself path.</p>';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(m.name)} for FFXIV</title>
<meta name="description" content="${escape(m.description)}"><meta name="color-scheme" content="dark light"><meta name="referrer" content="no-referrer"><link rel="canonical" href="https://spacegho.st${escape(m.page)}">
<link rel="icon" href="${escape(m.iconPath)}"><link rel="stylesheet" href="/mods/ffxiv/site/site.css"><script src="/mods/ffxiv/site/site.js"></script><script src="/mods/ffxiv/term/vote/beacon.js" defer></script></head>
<body data-mod="${escape(m.id)}"><a class="skip" href="#main">Skip to content</a><div class="wrap"><header class="sitebar"><a class="brand" href="/mods/ffxiv/"><b>spacegho.st</b> / ffxiv mods</a><nav aria-label="Mods">${projectNavigation(registry)}</nav></header>
<main id="main"><section class="hero glass"><div><p class="eyebrow">${escape(m.kind)} · open source · experimental</p><div class="hero-id"><img src="${escape(m.iconPath)}" alt="" width="72" height="72"><h1>${escape(m.name)}</h1></div><p class="tagline">${escape(m.punchline)}</p><p class="lede">${escape(m.description)}</p><div class="cta"><a class="btn primary" href="https://github.com/${escape(m.repo)}">Source</a><a class="btn" href="#install">Install / build</a>${m.gallery ? `<a class="btn" href="/mods/ffxiv/term/gallery/?mod=${escape(m.id)}">Gallery</a>` : ''}</div></div><img class="hero-art" src="${escape(m.bannerPath)}" alt="${escape(m.name)} illustration; not an in-game screenshot" width="730" height="380"></section>
<div class="status" role="note"><b>Current status</b><p>${escape(m.status)}. Verification below describes earlier recorded checks; the new publication and IPC work have offline validation.</p></div>
${(m.sections || []).map((s) => `<section class="glass project-section"><h2>${escape(s.title)}</h2>${s.body}</section>`).join('\n')}
<section id="install" class="glass project-section"><h2>Install and build</h2>${install}<p>${escape(m.needs || '')}</p><p>Build instructions and verification records are in the <a href="https://github.com/${escape(m.repo)}">project README</a>.</p></section>
${m.kind === 'plugin' ? '<section class="glass project-section"><h2>Screenshots and clips</h2><p>New publication screenshots have not been captured. The illustration above is artwork. The gallery accepts community screenshots with this project’s tag.</p></section>' : ''}
${m.id.startsWith('xivhud') ? '<p class="links"><a href="/mods/ffxiv/xivhud/">HUD family</a> · <a href="/mods/ffxiv/xivhud/journal/">Journal</a> · <a href="/mods/ffxiv/xivhud/character/">Character</a> · <a href="/mods/ffxiv/xivhud/developers/">Developer libraries and IPC</a></p>' : ''}
</main><footer class="foot">Made by Johnneylee Jack Rollins · <a href="https://github.com/Spaceghost">Source on GitHub</a>. Unofficial fan projects; not endorsed by Square Enix.</footer></div></body></html>
`;
}

export function projectOutputs(registry, pages) {
  const out = {};
  for (const m of registry.mods.filter((m) => m.sections)) out['public' + m.page + 'index.html'] = projectPage(m, registry);
  for (const [path, content] of Object.entries(pages)) {
    if (Object.hasOwn(out, path)) continue;
    let html = content;
    if (path === 'public/mods/ffxiv/index.html') {
      html = html.replace(/(<div class="mods">)[\s\S]*?(<\/div>\s*<\/section>)/, `$1\n      ${projectCards(registry)}\n      $2`);
    }
    html = html.replace(/(<nav aria-label="Mods">)[\s\S]*?(<\/nav>)/, `$1\n      ${projectNavigation(registry)}\n    $2`);
    if (path.endsWith('/term/gallery/index.html')) html = html.replace(/(<span class="row" id="mod-filter">)[\s\S]*?(<\/span>)/, `$1\n        <a class="chip" href="/mods/ffxiv/term/gallery/" data-mod="">All</a>\n` + galleryProjects(registry).map((m) => `        <a class="chip" href="?mod=${escape(m.id)}" data-mod="${escape(m.id)}">${escape(m.name)}</a>`).join('\n') + '\n      $2');
    if (html !== content) out[path] = html;
  }
  out['public/mods/ffxiv/projects.json'] = JSON.stringify({ version: registry.version, projects: registry.mods.map(({ sections, _comment, ...m }) => m) }, null, 2) + '\n';
  return out;
}

export function projectRoutes(registry) {
  const prefixes = [...new Set(registry.mods.filter((m) => m.sections).map((m) => m.page.split('/').slice(0, 4).join('/')))];
  return prefixes.map((path) => `  { pattern = "spacegho.st${path}*", zone_name = "spacegho.st" },`).join('\n') + '\n  { pattern = "spacegho.st/mods/ffxiv/projects.json", zone_name = "spacegho.st" }';
}

export function projectHeaders(registry) {
  const prefixes = [...new Set(registry.mods.filter((m) => m.sections).map((m) => m.page.split('/').slice(0, 4).join('/')))];
  return prefixes.map((path) => `${path}/*
  Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; media-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: no-referrer
  Cross-Origin-Opener-Policy: same-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
`).join('\n');
}
