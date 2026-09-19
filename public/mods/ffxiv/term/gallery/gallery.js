// Ghostty for FFXIV gallery: lists the approved screenshots from GET api/shots and sends
// a picked file to POST api/upload (it waits for review before it is ever shown).
// Rendered through textContent and attributes only.
(function () {
  'use strict';
  const BASE = '/mods/ffxiv/term/gallery/';
  const THEME_KEY = 'ghostty-vote:theme'; // shared with the vote page
  const MAX_BYTES = 8 * 1024 * 1024;
  const DOT = ' \u00b7 ';

  const get = (k) => { try { return window.localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { if (v) window.localStorage.setItem(k, v); else window.localStorage.removeItem(k); } catch (e) {} };
  const saved = get(THEME_KEY);
  if (saved === 'dark' || saved === 'light') document.documentElement.dataset.theme = saved;

  const $ = (s) => document.querySelector(s);
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v === null || v === undefined) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = String(v);
      else n.setAttribute(k, v === true ? '' : String(v));
    }
    for (const k of kids) if (k !== null && k !== undefined && k !== false) n.append(k);
    return n;
  }
  const str = (v) => (typeof v === 'string' ? v : '');
  const day = (ms) => (Number.isFinite(ms) && ms > 0 ? new Date(ms).toLocaleDateString() : '');
  // only this gallery's own image paths are ever put in src/href
  const ownPath = (p) => typeof p === 'string' && /^\/mods\/ffxiv\/term\/gallery\/(img|thumb)\/[A-Za-z0-9_-]{22}$/.test(p);

  function applyTheme(t) {
    if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
    $('#theme').textContent = 'theme: ' + (t || 'auto');
  }

  function summary(text) {
    $('#summary').replaceChildren('$ ', el('b', { text: 'ls' }), ' gallery/  ' + text);
  }

  function shotCard(s) {
    if (!ownPath(s.src)) return null;
    const w = Number(s.width) || 16;
    const h = Number(s.height) || 9;
    const img = el('img', { src: ownPath(s.thumb) ? s.thumb : s.src, alt: 'Screenshot of Ghostty in FFXIV' + (s.credit ? ' by ' + str(s.credit) : ''), loading: 'lazy', decoding: 'async', width: String(w), height: String(h) });
    const cap = el('figcaption');
    if (s.credit) cap.append(el('b', { text: str(s.credit) }), DOT);
    cap.append(day(s.approved_at));
    return el('figure', { class: 'shot' }, el('a', { href: s.src, target: '_blank', rel: 'noopener' }, img), cap);
  }

  async function load() {
    let data = null;
    try {
      const res = await fetch(BASE + 'api/shots', { headers: { accept: 'application/json' } });
      if (res.ok) data = await res.json();
    } catch (e) {}
    const shots = data && Array.isArray(data.shots) ? data.shots : null;
    if (!shots) {
      summary('could not be loaded; try again later');
      $('#shots').replaceChildren(el('p', { class: 'empty', text: 'The gallery could not be loaded.' }));
      return;
    }
    summary(shots.length + (shots.length === 1 ? ' screenshot' : ' screenshots'));
    const grid = el('div', { class: 'shots' });
    for (const s of shots) { const c = shotCard(s); if (c) grid.append(c); }
    $('#shots').replaceChildren(shots.length ? grid : el('p', { class: 'empty', text: 'No screenshots yet. Be the first to share one!' }));
  }

  async function upload(ev) {
    ev.preventDefault();
    const state = $('#u-state');
    const file = $('#u-file').files && $('#u-file').files[0];
    if (!file) { state.textContent = 'Pick a screenshot first.'; return; }
    if (file.type !== 'image/png' && file.type !== 'image/jpeg') { state.textContent = 'Only PNG and JPEG screenshots can be shared.'; return; }
    if (file.size > MAX_BYTES) { state.textContent = 'Screenshots can be at most 8 MB.'; return; }
    const credit = $('#u-credit').value.trim();
    const send = $('#u-send');
    send.disabled = true;
    state.textContent = 'uploading\u2026';
    let res = null;
    let data = null;
    try {
      res = await fetch(BASE + 'api/upload' + (credit ? '?credit=' + encodeURIComponent(credit) : ''), {
        method: 'POST', credentials: 'omit', headers: { 'content-type': file.type }, body: file,
      });
      data = await res.json().catch(() => null);
    } catch (e) {}
    send.disabled = false;
    if (!res) { state.textContent = 'Could not reach the server; try again.'; return; }
    state.textContent = (data && str(data.message)) || (res.ok ? 'Thanks! It shows here once it is reviewed.' : 'The upload failed (' + res.status + ').');
    if (res.ok) $('#upload').reset();
  }

  function start() {
    $('#theme').addEventListener('click', () => {
      const cur = document.documentElement.dataset.theme || '';
      const next = cur === '' ? 'dark' : cur === 'dark' ? 'light' : '';
      set(THEME_KEY, next);
      applyTheme(next);
    });
    applyTheme(document.documentElement.dataset.theme || '');
    $('#upload').addEventListener('submit', upload);
    load();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
