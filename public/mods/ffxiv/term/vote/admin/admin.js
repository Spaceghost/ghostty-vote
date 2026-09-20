// Ghostty for FFXIV vote: the owner's voter list and the gallery's moderation queue. A
// static page with no data in it; both come from GET api/admin/voters and
// api/admin/gallery, which answer only accounts in ADMIN_ACCOUNTS (403 for anyone else,
// 401 when signed out). Rendered through textContent only. Approving a screenshot first
// makes its thumbnail here, in the owner's browser (a canvas), so the Worker never has to
// decode an image. The Almanac leaderboard's results and suites (api/admin/almanac) can be
// hidden, deleted or deprecated here too.
(function () {
  'use strict';
  const BASE = '/mods/ffxiv/term/vote/';
  const DOT = ' \u00b7 ';
  const LODESTONE_ID = /^\d{1,20}$/;
  const state = { data: null, filter: 'all' };

  try {
    const t = window.localStorage.getItem('ghostty-vote:theme');
    if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
  } catch (e) {}

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
  const when = (ms) => (Number.isFinite(ms) && ms > 0 ? new Date(ms).toLocaleString() : '');
  const str = (v) => (typeof v === 'string' ? v : '');

  function message(text, link) {
    const p = el('p', { class: 'empty', text });
    if (link) p.append(' ', el('a', { href: link.href, text: link.text }));
    $('#voters').replaceChildren(p);
    $('#summary').replaceChildren('$ ', el('b', { text: 'voters' }), '  ' + text);
  }

  function portrait(c) {
    if (!c || !/^https:\/\//.test(str(c.portrait_url))) return el('span', { class: 'portrait blank', 'aria-hidden': 'true' });
    return el('img', { class: 'portrait', src: c.portrait_url, alt: '', width: '56', height: '56', loading: 'lazy', referrerpolicy: 'no-referrer' });
  }

  function voterCard(v) {
    const c = v.character && typeof v.character === 'object' ? v.character : null;
    const a = el('article', { class: 'idea voter' });
    const head = el('div', { class: 'who' }, portrait(c));
    const title = el('h3');
    if (c) {
      const label = str(c.name) + (c.world ? ' @ ' + str(c.world) : '');
      if (LODESTONE_ID.test(str(c.lodestone_id))) {
        title.append(el('a', { href: 'https://na.finalfantasyxiv.com/lodestone/character/' + c.lodestone_id + '/', rel: 'noopener noreferrer', target: '_blank', text: label }));
      } else {
        title.textContent = label;
      }
    } else {
      title.textContent = 'voter ' + str(v.voter).slice(0, 10);
    }
    const sub = el('p', { class: 'small', text: [v.you ? 'you' : '', c ? 'character first seen ' + when(c.first_seen) + ', last ' + when(c.last_seen) : 'no character', v.last_active ? 'last active ' + when(v.last_active) : ''].filter(Boolean).join(DOT) });
    head.append(el('div', null, title, sub));
    a.append(head);

    a.append(el('div', { class: 'tally' }, el('span', null,
      el('span', { class: 'w', text: (v.want | 0) + ' want' }), DOT,
      el('span', { class: 'm', text: (v.maybe | 0) + ' maybe' }), DOT,
      el('span', { class: 's', text: (v.skip | 0) + ' skip' }))));

    const notes = Array.isArray(v.notes) ? v.notes : [];
    if (notes.length) {
      const d = el('details', { open: notes.length <= 3 });
      d.append(el('summary', { text: notes.length + (notes.length === 1 ? ' note' : ' notes') }));
      for (const n of notes) {
        d.append(el('span', { class: 'k', text: str(n.title) + (n.vote ? DOT + n.vote : '') }), el('p', { text: str(n.note) }));
      }
      a.append(d);
    }
    const sugg = Array.isArray(v.suggestions) ? v.suggestions : [];
    if (sugg.length) {
      const d = el('details', { open: sugg.length <= 2 });
      d.append(el('summary', { text: sugg.length + (sugg.length === 1 ? ' suggestion' : ' suggestions') }));
      for (const s of sugg) {
        d.append(el('span', { class: 'k', text: str(s.title) + DOT + str(s.status) + DOT + when(s.created_at) }));
        if (s.detail) d.append(el('p', { text: str(s.detail) }));
      }
      a.append(d);
    }
    return a;
  }

  function visible(v) {
    if (state.filter === 'character') return !!v.character;
    if (state.filter === 'words') return (v.notes || []).length > 0 || (v.suggestions || []).length > 0;
    return true;
  }

  function render() {
    const d = state.data;
    const t = d.totals || {};
    $('#summary').replaceChildren('$ ', el('b', { text: 'voters' }), '  ',
      (t.voters | 0) + ' voters' + DOT + (t.with_character | 0) + ' with a character' + DOT +
      (t.notes | 0) + ' notes' + DOT + (t.suggestions | 0) + ' suggestions' + DOT + 'as of ' + when(d.generated_at));
    const list = (Array.isArray(d.voters) ? d.voters : []).filter(visible);
    const grid = el('div', { class: 'grid' });
    for (const v of list) grid.append(voterCard(v));
    $('#voters').replaceChildren(list.length ? grid : el('p', { class: 'empty', text: 'Nobody matches this filter yet.' }));
  }

  async function load() {
    let res;
    try {
      res = await fetch(BASE + 'api/admin/voters', { credentials: 'same-origin', cache: 'no-store', headers: { accept: 'application/json' } });
    } catch (e) {
      return message('Could not reach the server.');
    }
    if (res.status === 401) {
      return message('Sign in first.', { href: BASE + 'api/auth/github/start?return=' + encodeURIComponent(BASE + 'admin/'), text: 'Sign in with GitHub' });
    }
    if (res.status === 403) return message('This page is only for the site owner.', { href: BASE, text: 'Back to the vote' });
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok || !data || typeof data !== 'object') return message('The voter list could not be loaded (' + res.status + ').');
    state.data = data;
    $('#filters').hidden = false;
    render();
  }

  // ---- gallery queue ------------------------------------------------------------------
  const SHOT_ID = /^[A-Za-z0-9_-]{22}$/;
  const THUMB_WIDTH = 960;
  const adminImage = (id, thumb) => BASE + 'api/admin/gallery/image?id=' + encodeURIComponent(id) + (thumb ? '&thumb=1' : '');
  const kb = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB');

  function queueMessage(text) {
    $('#queue-summary').replaceChildren('$ ', el('b', { text: 'gallery' }), '  ' + text);
  }

  // A JPEG at most THUMB_WIDTH wide, drawn from the stored image.
  async function makeThumb(id) {
    const res = await fetch(adminImage(id), { credentials: 'same-origin', cache: 'no-store' });
    if (!res.ok) throw new Error('image ' + res.status);
    const bmp = await createImageBitmap(await res.blob());
    const scale = Math.min(1, THUMB_WIDTH / bmp.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    if (!blob) throw new Error('no thumbnail');
    const put = await fetch(BASE + 'api/admin/gallery/thumb?id=' + encodeURIComponent(id), {
      method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'image/jpeg' }, body: blob,
    });
    if (!put.ok) throw new Error('thumbnail ' + put.status);
  }

  async function review(id, action, card) {
    for (const b of card.querySelectorAll('button')) b.disabled = true;
    const note = card.querySelector('.notice');
    try {
      if (action === 'approve' || action === 'approve_anon') {
        note.textContent = 'making the thumbnail\u2026';
        try { await makeThumb(id); } catch (e) { note.textContent = 'no thumbnail (' + e.message + '); approving anyway\u2026'; }
      }
      const res = await fetch(BASE + 'api/admin/gallery/review', {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, action }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && str(data.message)) || String(res.status));
      loadQueue();
    } catch (e) {
      note.textContent = 'failed: ' + e.message;
      for (const b of card.querySelectorAll('button')) b.disabled = false;
    }
  }

  function shotCard(s, pending) {
    if (!SHOT_ID.test(str(s.id))) return null;
    const card = el('figure', { class: 'shot' });
    const thumb = !pending && s.has_thumb;
    if (s.status === 'pending' || s.status === 'approved') {
      card.append(el('a', { href: adminImage(s.id), target: '_blank', rel: 'noopener' },
        el('img', { src: adminImage(s.id, thumb), alt: 'shot ' + s.id, loading: 'lazy', width: String(s.width | 0 || 16), height: String(s.height | 0 || 9) })));
    }
    const cap = el('figcaption', { text: [
      s.status, (s.width | 0) + '\u00d7' + (s.height | 0), kb(s.bytes | 0), str(s.source),
      s.credit ? 'credit: ' + str(s.credit) : 'no credit', s.account ? str(s.provider) + ' ' + str(s.account).slice(0, 10) : 'legacy (no account)', s.mod ? 'mod: ' + str(s.mod) : '', s.uploader ? 'from ' + str(s.uploader) : '',
      'sent ' + when(s.created_at), s.reviewed_at ? 'reviewed ' + when(s.reviewed_at) : '',
    ].filter(Boolean).join(DOT) });
    card.append(cap);
    const row = el('div', { class: 'row' });
    const button = (label, action, cls) => {
      const b = el('button', { class: 'btn' + (cls ? ' ' + cls : ''), type: 'button', text: label });
      b.addEventListener('click', () => review(s.id, action, card));
      row.append(b);
    };
    if (pending) {
      button('Approve', 'approve');
      if (s.credit) button('Approve without credit', 'approve_anon', 'ghost');
      button('Reject', 'reject', 'ghost');
    } else if (s.status === 'approved') {
      button('Remove', 'remove', 'ghost');
    }
    row.append(el('span', { class: 'notice' }));
    card.append(row);
    return card;
  }

  async function loadQueue() {
    let res;
    try {
      res = await fetch(BASE + 'api/admin/gallery', { credentials: 'same-origin', cache: 'no-store', headers: { accept: 'application/json' } });
    } catch (e) {
      return queueMessage('could not reach the server');
    }
    if (res.status === 401 || res.status === 403) { $('#queue').replaceChildren(); return queueMessage('owner only'); }
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok || !data || typeof data !== 'object') return queueMessage('the queue could not be loaded (' + res.status + ')');
    const pending = Array.isArray(data.pending) ? data.pending : [];
    const reviewed = Array.isArray(data.reviewed) ? data.reviewed : [];
    queueMessage(pending.length + ' waiting for review' + DOT + reviewed.length + ' recent decisions' + DOT + 'store: ' + str(data.store));
    const grid = el('div', { class: 'shots' });
    for (const s of pending) { const c = shotCard(s, true); if (c) grid.append(c); }
    const out = [pending.length ? grid : el('p', { class: 'empty', text: 'Nothing waiting. Screenshots players share appear here first.' })];
    if (reviewed.length) {
      const d = el('details');
      d.append(el('summary', { text: 'Recent decisions (' + reviewed.length + ')' }));
      const g = el('div', { class: 'shots' });
      for (const s of reviewed) { const c = shotCard(s, false); if (c) g.append(c); }
      d.append(g);
      out.push(d);
    }
    $('#queue').replaceChildren(...out);
  }

  // ---- Almanac leaderboard moderation ---------------------------------------------------
  const RESULT_ID = /^[A-Za-z0-9_-]{22}$/;

  function almanacMessage(text) {
    $('#almanac-summary').replaceChildren('$ ', el('b', { text: 'almanac' }), '  ' + text);
  }

  async function almanacPost(path, body, row) {
    for (const b of row.querySelectorAll('button')) b.disabled = true;
    const note = row.querySelector('.notice');
    try {
      const res = await fetch(BASE + 'api/admin/almanac/' + path, {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && str(data.message)) || String(res.status));
      loadAlmanac();
    } catch (e) {
      if (note) note.textContent = 'failed: ' + e.message;
      for (const b of row.querySelectorAll('button')) b.disabled = false;
    }
  }

  function suiteRow(s) {
    const row = el('p', { class: 'row' });
    row.append(el('span', { class: 'k', text: str(s.suite_id) + ' ' + str(s.suite_version) + DOT + (s.results | 0) + ' results' + DOT + (s.deprecated ? 'deprecated' : 'current') + DOT + 'sha ' + str(s.sha256).slice(0, 12) + DOT + 'first seen ' + when(s.created_at) }));
    const b = el('button', { class: 'btn ghost', type: 'button', text: s.deprecated ? 'Restore suite' : 'Deprecate suite' });
    b.addEventListener('click', () => {
      if (!s.deprecated && !window.confirm('Deprecate ' + s.suite_id + ' ' + s.suite_version + '? Its results leave the leaderboard and new ones are refused.')) return;
      almanacPost('suite', { suite_id: s.suite_id, suite_version: s.suite_version, deprecated: !s.deprecated }, row);
    });
    row.append(b, el('span', { class: 'notice' }));
    return row;
  }

  function resultRow(r) {
    if (!RESULT_ID.test(str(r.id))) return null;
    const tr = el('tr', { class: r.status === 'hidden' ? 'hidden-row' : '' });
    const cells = [
      when(r.created_at), r.status, str(r.suite_id) + ' ' + str(r.suite_version), r.mode, str(r.model) + ' ' + str(r.quant), r.backend,
      str(r.gpu_model) + ' (' + ((r.vram_mb | 0) / 1024).toFixed(1) + ' GB)', r.os, (+r.score).toFixed(1), (+r.tokens_per_s).toFixed(1) + ' tok/s', r.account ? str(r.provider) + ' ' + str(r.account).slice(0, 10) : 'legacy ' + str(r.submitter),
    ];
    for (const c of cells) tr.append(el('td', { text: str(String(c)) }));
    const td = el('td', { class: 'row' });
    const button = (label, action, cls) => {
      const b = el('button', { class: 'btn' + (cls ? ' ' + cls : ''), type: 'button', text: label });
      b.addEventListener('click', () => {
        if (action === 'delete' && !window.confirm('Delete this result for good?')) return;
        almanacPost('review', { id: r.id, action }, td);
      });
      td.append(b);
    };
    if (r.status === 'hidden') button('Unhide', 'unhide', 'ghost'); else button('Hide', 'hide', 'ghost');
    button('Delete', 'delete', 'ghost');
    td.append(el('span', { class: 'notice' }));
    tr.append(td);
    return tr;
  }

  async function loadAlmanac() {
    let res;
    try {
      res = await fetch(BASE + 'api/admin/almanac', { credentials: 'same-origin', cache: 'no-store', headers: { accept: 'application/json' } });
    } catch (e) {
      return almanacMessage('could not reach the server');
    }
    if (res.status === 401 || res.status === 403) { $('#almanac').replaceChildren(); return almanacMessage('owner only'); }
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok || !data || typeof data !== 'object') return almanacMessage('results could not be loaded (' + res.status + ')');
    const t = data.totals || {};
    const results = Array.isArray(data.results) ? data.results : [];
    const suites = Array.isArray(data.suites) ? data.suites : [];
    almanacMessage((t.results | 0) + ' results' + DOT + (t.hidden | 0) + ' hidden' + DOT + (t.submitters | 0) + ' submitters' + DOT + suites.length + ' suites');
    $('#almanac-suites').replaceChildren(...suites.map(suiteRow));
    if (!results.length) { $('#almanac').replaceChildren(el('p', { class: 'empty', text: 'No results yet.' })); return; }
    const head = el('tr');
    for (const h of ['sent', 'status', 'suite', 'mode', 'model', 'backend', 'gpu', 'os', 'score', 'speed', 'from', '']) head.append(el('th', { scope: 'col', text: h }));
    const body = el('tbody');
    for (const r of results) { const row = resultRow(r); if (row) body.append(row); }
    $('#almanac').replaceChildren(el('div', { class: 'scroll' }, el('table', { class: 'results' }, el('thead', null, head), body)));
  }

  function start() {
    for (const b of document.querySelectorAll('.chip[data-filter]')) {
      b.addEventListener('click', () => {
        state.filter = b.dataset.filter;
        for (const c of document.querySelectorAll('.chip[data-filter]')) c.setAttribute('aria-pressed', String(c === b));
        if (state.data) render();
      });
    }
    load();
    loadQueue();
    loadAlmanac();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
