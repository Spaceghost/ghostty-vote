// The plugin repository page: the theme toggle, the copy button, and the live version
// of each plugin read from plugins.json (the same file the in-game installer reads).
// The page is complete without any of this; nothing below is required to install a
// plugin, and every value is written through textContent, never into markup.
(function () {
  'use strict';
  const THEME_KEY = 'ghostty-vote:theme'; // shared with the vote, gallery and leaderboard pages
  const LISTING = '/mods/ffxiv/plugins.json';

  const get = (k) => { try { return window.localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { if (v) window.localStorage.setItem(k, v); else window.localStorage.removeItem(k); } catch (e) {} };
  const saved = get(THEME_KEY);
  if (saved === 'dark' || saved === 'light') document.documentElement.dataset.theme = saved;

  const $ = (s) => document.querySelector(s);

  function applyTheme(t) {
    if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
    $('#theme').textContent = 'theme: ' + (t || 'auto');
  }

  function copyUrl(button) {
    const text = $('#repo-url').textContent.trim();
    const done = (ok) => { button.textContent = ok ? 'copied' : 'select it'; setTimeout(() => { button.textContent = 'copy'; }, 1600); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => done(true), () => done(false));
      return;
    }
    done(false);
  }

  // A plugin's entry is in the listing only once its repository has published a release,
  // which is exactly what the page should say.
  function showVersions(entries) {
    const byName = new Map(entries.map((e) => [e.InternalName, e]));
    for (const article of document.querySelectorAll('.mod[data-plugin]')) {
      const entry = byName.get(article.dataset.plugin);
      const slot = article.querySelector('[data-ver]');
      if (!slot) continue;
      if (!entry) { slot.textContent = ''; continue; }
      slot.textContent = 'v' + entry.AssemblyVersion.replace(/\.0$/, '');
      slot.title = entry.TestingAssemblyVersion ? 'testing: v' + entry.TestingAssemblyVersion.replace(/\.0$/, '') : '';
    }
  }

  function load() {
    fetch(LISTING, { headers: { accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : []))
      .then((body) => showVersions(Array.isArray(body) ? body : []))
      .catch(() => {});
  }

  function start() {
    $('#theme').addEventListener('click', () => {
      const cur = document.documentElement.dataset.theme || '';
      const next = cur === '' ? 'dark' : cur === 'dark' ? 'light' : '';
      set(THEME_KEY, next);
      applyTheme(next);
    });
    applyTheme(document.documentElement.dataset.theme || '');
    $('#copy').addEventListener('click', (e) => copyUrl(e.currentTarget));
    load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
