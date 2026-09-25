// The FFXIV mods hub and minisites: the theme toggle, the copy button, the media slots
// (from each mod's media/manifest.json) and the community screenshots of one mod.
// Everything is rendered through textContent and attributes only. The pages are complete
// without this script except for the media slots and the community shots.
//
// A page says which mod it is on <body data-mod="..."> and where its manifest is with
// data-media="...". docs/MEDIA.md describes the manifest.
(function () {
  'use strict';
  var VOTE_API = '/mods/ffxiv/term/vote/api/';
  var GALLERY = '/mods/ffxiv/term/gallery/';
  var THEME_KEY = 'ghostty-vote:theme'; // shared with the vote, gallery, leaderboard and plugins pages
  var MAX_BYTES = 8 * 1024 * 1024;
  var MODS = ['ghostty', 'xivmcp', 'xivdesktop', 'xivarcade', 'xivwayfinder', 'xivlantern', 'xivpiano', 'almanac'];
  var DOT = ' \u00b7 ';

  function get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { if (v) window.localStorage.setItem(k, v); else window.localStorage.removeItem(k); } catch (e) {} }
  var saved = get(THEME_KEY);
  if (saved === 'dark' || saved === 'light') document.documentElement.dataset.theme = saved;

  function $(s) { return document.querySelector(s); }
  function el(tag, attrs) {
    var n = document.createElement(tag);
    var a = attrs || {};
    Object.keys(a).forEach(function (k) {
      var v = a[k];
      if (v === false || v === null || v === undefined) return;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = String(v);
      else n.setAttribute(k, v === true ? '' : String(v));
    });
    for (var i = 2; i < arguments.length; i++) {
      var kid = arguments[i];
      if (kid !== null && kid !== undefined && kid !== false) n.append(kid);
    }
    return n;
  }
  function str(v) { return typeof v === 'string' ? v : ''; }
  function int(v) { var n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n) : 0; }

  // ---- theme and copy ------------------------------------------------------------------
  function applyTheme(t) {
    if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
    var b = $('#theme');
    if (b) b.textContent = 'theme: ' + (t || 'auto');
  }
  function wireTheme() {
    var b = $('#theme');
    if (!b) return;
    b.addEventListener('click', function () {
      var cur = document.documentElement.dataset.theme || '';
      var next = cur === '' ? 'dark' : cur === 'dark' ? 'light' : '';
      set(THEME_KEY, next);
      applyTheme(next);
    });
    applyTheme(document.documentElement.dataset.theme || '');
  }
  function wireCopy() {
    var b = $('#copy');
    var src = $('#repo-url');
    if (!b || !src) return;
    b.addEventListener('click', function () {
      var done = function (ok) {
        b.textContent = ok ? 'copied' : 'select and copy';
        window.setTimeout(function () { b.textContent = 'copy'; }, 1800);
      };
      try { window.navigator.clipboard.writeText(src.textContent.trim()).then(function () { done(true); }, function () { done(false); }); }
      catch (e) { done(false); }
    });
  }

  // ---- media slots ---------------------------------------------------------------------
  // Only files beside the manifest are ever put in src: a bare file name, no path, no scheme.
  var FILE_RE = /^[a-z0-9][a-z0-9._-]{0,80}\.(webp|avif|jpg|jpeg|png|mp4|webm)$/;
  function fileUrl(dir, name) { return FILE_RE.test(str(name)) ? dir + name : null; }

  function picture(dir, f, alt, eager) {
    var src = fileUrl(dir, f.src);
    if (!src) return null;
    var set = [];
    (Array.isArray(f.sizes) ? f.sizes : []).forEach(function (s) {
      var u = s && fileUrl(dir, s.src);
      if (u && int(s.w)) set.push(u + ' ' + int(s.w) + 'w');
    });
    if (set.length && int(f.width)) set.push(src + ' ' + int(f.width) + 'w');
    var img = el('img', {
      src: src, alt: alt, width: int(f.width) || null, height: int(f.height) || null,
      srcset: set.length ? set.join(', ') : null,
      sizes: set.length ? '(min-width: 1100px) 520px, (min-width: 720px) 50vw, 100vw' : null,
      loading: eager ? null : 'lazy', decoding: 'async',
    });
    return el('a', { href: src, target: '_blank', rel: 'noopener' }, img);
  }

  function clip(dir, f, label) {
    var src = fileUrl(dir, f.src);
    if (!src) return null;
    // preload=none: nothing is downloaded until the visitor presses play
    var v = el('video', {
      controls: true, preload: 'none', playsinline: true, muted: f.loop === true, loop: f.loop === true,
      poster: fileUrl(dir, f.poster), width: int(f.width) || null, height: int(f.height) || null, 'aria-label': label,
    });
    v.append(el('source', { src: src, type: /\.webm$/.test(src) ? 'video/webm' : 'video/mp4' }));
    return v;
  }

  function slotFigure(dir, slot, first) {
    var title = str(slot.title) || str(slot.id);
    var fig = el('figure', { class: 'slot' + (slot.wide === true ? ' wide' : ''), id: 'shot-' + str(slot.id).replace(/[^a-z0-9-]/g, '') });
    var files = Array.isArray(slot.files) ? slot.files : [];
    var shown = 0;
    files.forEach(function (f) {
      if (!f || typeof f !== 'object') return;
      var alt = str(f.alt) || title;
      var node = f.type === 'video' ? clip(dir, f, alt) : picture(dir, f, alt, first && shown === 0);
      if (!node) return;
      fig.append(el('div', { class: 'frame' }, node));
      shown++;
    });
    if (!shown) {
      fig.append(el('div', { class: 'frame pending' },
        el('span', {}, el('b', { text: 'Not captured yet' }), str(slot.kind) || 'screenshot')));
    }
    var cap = el('figcaption', {}, el('b', { text: title }));
    if (str(slot.caption)) cap.append(str(slot.caption));
    if (str(slot.where)) cap.append(el('span', { class: 'small', text: ' ' + str(slot.where) }));
    fig.append(cap);
    return fig;
  }

  function renderVideo(dir, video) {
    var box = $('#video');
    if (!box || !video || typeof video !== 'object') return;
    var fig = el('figure', { class: 'slot wide' });
    var node = video.file && typeof video.file === 'object' ? clip(dir, video.file, str(video.title)) : null;
    fig.append(node ? el('div', { class: 'frame' }, node)
      : el('div', { class: 'frame pending' }, el('span', {}, el('b', { text: 'Not recorded yet' }), str(video.length) || 'video')));
    var cap = el('figcaption', {}, el('b', { text: str(video.title) || 'Video' }));
    if (str(video.caption)) cap.append(str(video.caption));
    fig.append(cap);
    if (Array.isArray(video.cuts) && video.cuts.length) {
      var ol = el('ol', { class: 'cuts', 'aria-label': 'Planned cuts' });
      video.cuts.forEach(function (c) { ol.append(el('li', {}, el('span', { text: str(c.t) }), el('span', { text: str(c.note) }))); });
      fig.append(ol);
    }
    box.replaceChildren(fig);
  }

  function loadMedia() {
    var box = $('#media');
    var url = document.body.dataset.media;
    if (!box || !url || !/^\/mods\/ffxiv\/[a-z/]+\/media\/manifest\.json$/.test(url)) return;
    var dir = url.slice(0, url.lastIndexOf('/') + 1);
    fetch(url, { headers: { accept: 'application/json' } }).then(function (r) { return r.ok ? r.json() : null; }).then(function (m) {
      if (!m || !Array.isArray(m.slots)) throw new Error('manifest');
      var grid = el('div', { class: 'media' });
      m.slots.forEach(function (s, i) { if (s && typeof s === 'object') grid.append(slotFigure(dir, s, i === 0)); });
      box.replaceChildren(grid);
      renderVideo(dir, m.video);
    }).catch(function () {
      box.replaceChildren(el('p', { class: 'empty', text: 'The shot list could not be loaded.' }));
    });
  }

  // ---- community screenshots -------------------------------------------------------------
  function ownShot(p) { return typeof p === 'string' && /^\/mods\/ffxiv\/term\/gallery\/(img|thumb)\/[A-Za-z0-9_-]{22}$/.test(p); }
  function day(ms) { return Number.isFinite(ms) && ms > 0 ? new Date(ms).toLocaleDateString() : ''; }

  function shotCard(s, name) {
    if (!ownShot(s.src)) return null;
    var img = el('img', {
      src: ownShot(s.thumb) ? s.thumb : s.src, alt: 'Screenshot of ' + name + ' in FFXIV' + (s.credit ? ' by ' + str(s.credit) : ''),
      loading: 'lazy', decoding: 'async', width: int(s.width) || 16, height: int(s.height) || 9,
    });
    var cap = el('figcaption');
    if (s.credit) cap.append(el('b', { text: str(s.credit) }), DOT);
    cap.append(day(s.approved_at));
    return el('figure', { class: 'shot' }, el('div', { class: 'frame' }, el('a', { href: s.src, target: '_blank', rel: 'noopener' }, img)), cap);
  }

  function loadShots(mod, name) {
    var box = $('#shots');
    if (!box) return;
    fetch(GALLERY + 'api/shots?mod=' + mod, { headers: { accept: 'application/json' } }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d || !Array.isArray(d.shots)) throw new Error('shots');
      // an older server ignores ?mod= and answers with every shot: keep this mod's only
      var mine = d.shots.filter(function (s) { return s && s.mod === mod; }).slice(0, 24);
      var grid = el('div', { class: 'shots' });
      mine.forEach(function (s) { var c = shotCard(s, name); if (c) grid.append(c); });
      box.replaceChildren(mine.length ? grid : el('p', { class: 'empty', text: 'No community screenshots of ' + name + ' yet. Yours could be the first.' }));
    }).catch(function () {
      box.replaceChildren(el('p', { class: 'empty', text: 'The community screenshots could not be loaded.' }));
    });
  }

  function wireUpload(mod) {
    var form = $('#upload');
    if (!form) return;
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var state = $('#u-state');
      var input = $('#u-file');
      var file = input.files && input.files[0];
      if (!file) { state.textContent = 'Pick a screenshot first.'; return; }
      if (file.type !== 'image/png' && file.type !== 'image/jpeg') { state.textContent = 'Only PNG and JPEG screenshots can be shared.'; return; }
      if (file.size > MAX_BYTES) { state.textContent = 'Screenshots can be at most 8 MB.'; return; }
      var credit = $('#u-credit').value.trim();
      var send = $('#u-send');
      send.disabled = true;
      state.textContent = 'uploading\u2026';
      // The signed-in upload lives under the vote API, where the session cookie is sent.
      fetch(VOTE_API + 'shots/upload?mod=' + mod + (credit ? '&credit=' + encodeURIComponent(credit) : ''), {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': file.type }, body: file,
      }).then(function (res) {
        return res.json().catch(function () { return null; }).then(function (data) {
          send.disabled = false;
          if (res.status === 401) { showAccount(false); state.textContent = ''; return; }
          state.textContent = (data && str(data.message)) || (res.ok ? 'Thanks! It shows here once it is reviewed.' : 'The upload failed (' + res.status + ').');
          if (res.ok) form.reset();
        });
      }).catch(function () {
        send.disabled = false;
        state.textContent = 'Could not reach the server; try again.';
      });
    });
    var out = $('#signout');
    if (out) out.addEventListener('click', function () {
      fetch(VOTE_API + 'auth/logout', { method: 'POST', credentials: 'same-origin' }).then(function () { showAccount(false); }, function () {});
    });
  }

  function showAccount(signedIn) {
    var a = $('#signed-out');
    var b = $('#signed-in');
    if (a) a.hidden = signedIn;
    if (b) b.hidden = !signedIn;
  }

  function loadAccount() {
    if (!$('#signed-out')) return;
    fetch(VOTE_API + 'auth/me', { credentials: 'same-origin', cache: 'no-store', headers: { accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (me) { showAccount(!!(me && me.signed_in === true)); })
      .catch(function () { showAccount(false); });
  }

  // Sign-in comes back with a fragment (#signed-in, #auth-error=...): say so, then drop it.
  function readReturn() {
    var h = window.location.hash;
    if (h !== '#signed-in' && h.indexOf('#auth-error=') !== 0) return;
    var note = $('#account-note');
    if (note) note.textContent = h === '#signed-in' ? 'Signed in.' : 'Sign-in did not finish; try again.';
    try { window.history.replaceState(null, '', window.location.pathname + '#community'); } catch (e) {}
    var c = $('#community');
    if (c && typeof c.scrollIntoView === 'function') c.scrollIntoView();
  }

  function start() {
    wireTheme();
    wireCopy();
    loadMedia();
    var mod = document.body.dataset.mod;
    if (MODS.indexOf(mod) >= 0) {
      loadShots(mod, document.body.dataset.name || mod);
      wireUpload(mod);
      loadAccount();
      readReturn();
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
