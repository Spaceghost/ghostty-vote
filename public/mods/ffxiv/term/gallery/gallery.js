// The FFXIV mods gallery: lists the approved screenshots from GET api/shots (every mod's;
// ?mod=<id> on the page shows one mod's, untagged shots being Ghostty's) and, for a
// signed-in visitor, sends a picked file to the vote API's gallery/upload (where the session
// cookie reaches); it waits for review before it is ever shown. Signed out, the form gives
// way to the two sign-in buttons.
// A signed-in visitor also votes keep or pass on each shot. The gallery keeps the
// full-resolution images only while it has room for them, and the lowest-voted are the
// ones it drops, so these votes decide what stays.
// Rendered through textContent and attributes only.
(function () {
  'use strict';
  const BASE = '/mods/ffxiv/term/gallery/';
  const VOTE_API = '/mods/ffxiv/term/vote/api/';
  const THEME_KEY = 'ghostty-vote:theme'; // shared with the vote page
  const MAX_BYTES = 8 * 1024 * 1024;
  const DOT = ' \u00b7 ';
  const MODS = { ghostty: 'Ghostty', xivmcp: 'XivMcp', xivdesktop: 'XivDesktop', xivarcade: 'XivArcade', xivwayfinder: 'XivWayfinder', xivlantern: 'XivLantern', xivpiano: 'XivPiano', almanac: 'Almanac' };
  const want = new URLSearchParams(location.search).get('mod');
  const MOD = want && Object.hasOwn(MODS, want) ? want : ''; // '' is every mod
  const modOf = (s) => (typeof s.mod === 'string' && Object.hasOwn(MODS, s.mod) ? s.mod : 'ghostty');

  const get = (k) => { try { return window.localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { if (v) window.localStorage.setItem(k, v); else window.localStorage.removeItem(k); } catch (e) {} };
  const saved = get(THEME_KEY);
  if (saved === 'dark' || saved === 'light') document.documentElement.dataset.theme = saved;

  // shot id -> 'keep' | 'pass', the signed-in viewer's own votes
  let myVotes = Object.create(null);
  let canVote = false;

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
    const img = el('img', { src: ownPath(s.thumb) ? s.thumb : s.src, alt: 'Screenshot of ' + MODS[modOf(s)] + ' in FFXIV' + (s.credit ? ' by ' + str(s.credit) : ''), loading: 'lazy', decoding: 'async', width: String(w), height: String(h) });
    const cap = el('figcaption');
    if (s.credit) cap.append(el('b', { text: str(s.credit) }), DOT);
    cap.append(day(s.approved_at));
    return el('figure', { class: 'shot' },
      el('a', { href: s.src, target: '_blank', rel: 'noopener' }, img), cap, voteRow(s));
  }

  // keep / pass, with the tally. Signed out it is shown but not clickable, so the counts
  // still read as part of the gallery.
  function voteRow(s) {
    const id = str(s.id);
    const row = el('div', { class: 'votes' });
    const counts = el('span', { class: 'tally' });
    const paint = (keeps, passes) => {
      counts.textContent = keeps + ' keep' + DOT + passes + ' pass';
      for (const b of row.querySelectorAll('button')) {
        b.setAttribute('aria-pressed', myVotes[id] === b.dataset.vote ? 'true' : 'false');
      }
    };
    for (const kind of ['keep', 'pass']) {
      const b = el('button', {
        type: 'button', class: 'vote', 'data-vote': kind, text: kind,
        title: canVote ? 'Vote to ' + kind + ' this screenshot' : 'Sign in to vote',
        disabled: !canVote,
      });
      b.addEventListener('click', async () => {
        // clicking the side you already picked takes the vote back
        const want = myVotes[id] === kind ? null : kind;
        for (const x of row.querySelectorAll('button')) x.disabled = true;
        const r = await castVote(id, want);
        for (const x of row.querySelectorAll('button')) x.disabled = false;
        if (!r) return;
        if (want) myVotes[id] = want; else delete myVotes[id];
        paint(r.keeps, r.passes);
      });
      row.append(b);
    }
    row.append(counts);
    paint(Number(s.keeps) || 0, Number(s.passes) || 0);
    return row;
  }

  // POST the vote; null takes it back. Returns the new tally, or null when it did not go.
  async function castVote(id, vote) {
    try {
      const res = await fetch(VOTE_API + 'gallery/vote', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: id, vote: vote }),
      });
      if (res.status === 401) { canVote = false; signedIn(null); return null; }
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.ok) return null;
      return { keeps: Number(data.keeps) || 0, passes: Number(data.passes) || 0 };
    } catch (e) { return null; }
  }

  // the viewer's own votes, so each card opens showing which way they went
  async function loadMyVotes() {
    try {
      const res = await fetch(VOTE_API + 'gallery/mine', { credentials: 'same-origin', cache: 'no-store', headers: { accept: 'application/json' } });
      if (!res.ok) return;
      const data = await res.json();
      canVote = !!(data && data.signed_in);
      myVotes = Object.create(null);
      for (const [id, v] of Object.entries((data && data.votes) || {})) {
        if (v === 'keep' || v === 'pass') myVotes[id] = v;
      }
    } catch (e) {}
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
    const shown = MOD ? shots.filter((s) => modOf(s) === MOD) : shots;
    summary(shown.length + (shown.length === 1 ? ' screenshot' : ' screenshots') + (MOD ? ' of ' + MODS[MOD] : ''));
    const grid = el('div', { class: 'shots' });
    for (const s of shown) { const c = shotCard(s); if (c) grid.append(c); }
    $('#shots').replaceChildren(shown.length ? grid : el('p', { class: 'empty', text: 'No screenshots' + (MOD ? ' of ' + MODS[MOD] : '') + ' yet. Be the first to share one!' }));
  }

  // me: the answer of api/auth/me, or null when signed out (or when it cannot be asked).
  function signedIn(me) {
    const yes = !!(me && me.signed_in);
    $('#signin').hidden = yes;
    $('#upload').hidden = !yes;
    const who = $('#whoami');
    who.hidden = !yes;
    if (yes) {
      const c = me.character;
      who.textContent = 'Signed in with ' + (me.provider === 'github' ? 'GitHub' : 'FFXIV') + (c && c.name ? ' as ' + str(c.name) + (c.world ? ' @ ' + str(c.world) : '') : '') + '.';
      if (c && c.name && !$('#u-credit').value) $('#u-credit').value = str(c.name) + (c.world ? ' @ ' + str(c.world) : '');
    }
  }

  async function whoAmI() {
    let me = null;
    try {
      const res = await fetch(VOTE_API + 'auth/me', { credentials: 'same-origin', cache: 'no-store', headers: { accept: 'application/json' } });
      if (res.ok) me = await res.json();
    } catch (e) {}
    signedIn(me);
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
      const q = new URLSearchParams();
      if (credit) q.set('credit', credit);
      if (MOD) q.set('mod', MOD); // tagged with the mod the page is showing
      res = await fetch(VOTE_API + 'gallery/upload' + (q.toString() ? '?' + q : ''), {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': file.type }, body: file,
      });
      data = await res.json().catch(() => null);
    } catch (e) {}
    send.disabled = false;
    if (!res) { state.textContent = 'Could not reach the server; try again.'; return; }
    if (res.status === 401) { signedIn(null); return; }
    state.textContent = (data && str(data.message)) || (res.ok ? 'Thanks! It shows here once it is reviewed.' : 'The upload failed (' + res.status + ').');
    if (res.ok) $('#upload').reset();
  }

  function start() {
    for (const a of document.querySelectorAll('#mod-filter a')) {
      if (a.dataset.mod === MOD) a.setAttribute('aria-current', 'page');
    }
    if (MOD) { document.title = MODS[MOD] + ' screenshots \u00b7 FFXIV Mods Gallery'; $('#u-send').textContent = 'Share a ' + MODS[MOD] + ' screenshot'; }
    $('#theme').addEventListener('click', () => {
      const cur = document.documentElement.dataset.theme || '';
      const next = cur === '' ? 'dark' : cur === 'dark' ? 'light' : '';
      set(THEME_KEY, next);
      applyTheme(next);
    });
    applyTheme(document.documentElement.dataset.theme || '');
    $('#upload').addEventListener('submit', upload);
    whoAmI();
    loadMyVotes().then(load);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
