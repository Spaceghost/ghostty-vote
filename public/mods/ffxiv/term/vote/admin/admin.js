// Ghostty for FFXIV vote: the owner's voter list. A static page with no data in it; the
// list comes from GET api/admin/voters, which answers only accounts in ADMIN_ACCOUNTS
// (403 for anyone else, 401 when signed out). Rendered through textContent only.
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

  function start() {
    for (const b of document.querySelectorAll('.chip[data-filter]')) {
      b.addEventListener('click', () => {
        state.filter = b.dataset.filter;
        for (const c of document.querySelectorAll('.chip[data-filter]')) c.setAttribute('aria-pressed', String(c === b));
        if (state.data) render();
      });
    }
    load();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
