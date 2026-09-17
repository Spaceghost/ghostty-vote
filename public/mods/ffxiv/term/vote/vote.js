// Ghostty for FFXIV vote page. A static asset: the catalogue comes from ideas.json,
// the visitor's own ballot lives in localStorage, and the Worker is only called for
// POST api/vote, POST api/suggest and GET api/tallies (edge-cached for a minute).
// All data is rendered through textContent; no HTML strings are built from data.
(function () {
  'use strict';
  const BASE = '/mods/ffxiv/term/vote/';
  const KEY = {
    theme: 'ghostty-vote:theme',
    seen: 'ghostty-vote:seen-version',
    since: 'ghostty-vote:session-since',
    votes: 'ghostty-vote:votes',
    suggestions: 'ghostty-vote:suggestions',
  };

  function storage(kind) { try { return window[kind]; } catch (e) { return null; } }
  function getItem(kind, k) { try { return storage(kind)?.getItem(k) ?? null; } catch (e) { return null; } }
  function setItem(kind, k, v) { try { storage(kind)?.setItem(k, v); } catch (e) {} }

  // Runs before first paint, so a saved theme never flashes the other one.
  const savedTheme = getItem('localStorage', KEY.theme);
  if (savedTheme === 'dark' || savedTheme === 'light') document.documentElement.dataset.theme = savedTheme;

  const NOTE_MAX = 280, DETAIL_MAX = 600, KEEP_SUGGESTIONS = 50;
  const VOTES = ['want', 'maybe', 'skip'];
  const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
  const FEAS = { ready: 0, stretch: 1, research: 2 };
  const EFFORT = { hours: 0, days: 1, weeks: 2 };
  const LABELS = [['want', 'Want'], ['maybe', 'Maybe'], ['skip', 'Skip']];
  const ELLIPSIS = '\u2026', DOT = ' \u00b7 ';
  const state = {
    version: 0, categories: [], ideas: [], byId: new Map(), votes: {}, suggestions: [], talliesOk: false,
    filter: 'all', sort: 'catalogue', since: null, drafts: {}, open: new Set(), seq: {},
  };
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

  async function request(path, init) {
    const res = await fetch(BASE + path, { headers: { accept: 'application/json' }, ...init });
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) {
      const err = new Error((data && data.message) || 'Request failed (' + res.status + ').');
      err.status = res.status;
      throw err;
    }
    return data;
  }
  const post = (name, body) => request('api/' + name, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  function errorText(e, offline) {
    if (e && e.status) return e.message;
    return offline || 'Could not reach the server; not saved.';
  }

  // ---- the visitor's own ballot (localStorage) --------------------------------
  function readJson(key, fallback) {
    const raw = getItem('localStorage', key);
    if (raw === null) return fallback;
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  }

  function loadVotes() {
    const raw = readJson(KEY.votes, {});
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const [id, v] of Object.entries(raw)) {
      if (!ID_RE.test(id) || !v || !VOTES.includes(v.vote)) continue;
      out[id] = { vote: v.vote, note: typeof v.note === 'string' ? v.note.slice(0, NOTE_MAX) : '' };
    }
    return out;
  }
  const saveVotes = () => setItem('localStorage', KEY.votes, JSON.stringify(state.votes));

  function loadSuggestions() {
    const raw = readJson(KEY.suggestions, []);
    if (!Array.isArray(raw)) return [];
    return raw.filter((s) => s && typeof s.title === 'string').slice(0, KEEP_SUGGESTIONS).map((s) => ({
      title: s.title.slice(0, 80),
      detail: typeof s.detail === 'string' ? s.detail.slice(0, DETAIL_MAX) : '',
      created_at: Number.isFinite(s.created_at) ? s.created_at : 0,
    }));
  }
  const saveSuggestions = () => setItem('localStorage', KEY.suggestions, JSON.stringify(state.suggestions));

  // ---- theme ------------------------------------------------------------------
  function applyTheme(t) {
    if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
    $('#theme').textContent = 'theme: ' + (t || 'auto');
  }

  // ---- "new since your last visit" --------------------------------------------
  // ?since=N (e.g. from the plugin) wins; otherwise the version seen on the
  // previous visit, pinned for this browser session so reloads keep the badges.
  function computeSince(version) {
    const seenRaw = getItem('localStorage', KEY.seen);
    const seen = seenRaw !== null && /^\d{1,9}$/.test(seenRaw) ? Number(seenRaw) : null;
    setItem('localStorage', KEY.seen, String(Math.max(version, seen || 0)));
    const q = new URLSearchParams(location.search).get('since');
    if (q !== null && /^\d{1,9}$/.test(q)) return Number(q);
    const pinned = getItem('sessionStorage', KEY.since);
    if (pinned !== null && /^\d{1,9}$/.test(pinned)) return Number(pinned);
    const since = seen === null ? version : seen; // first visit: nothing is "new"
    setItem('sessionStorage', KEY.since, String(since));
    return since;
  }
  const isNew = (i) => state.since !== null && i.added_version > state.since;

  // ---- rendering --------------------------------------------------------------
  function myCounts() {
    const t = { want: 0, maybe: 0, skip: 0 };
    for (const i of state.ideas) { const v = state.votes[i.id]?.vote; if (v in t) t[v]++; }
    return t;
  }

  function renderTally() {
    const t = myCounts(), total = state.ideas.length;
    const done = t.want + t.maybe + t.skip, open = total - done;
    $('#tally').replaceChildren(
      '$ ', el('b', { text: 'vote' }), ' --mine  ',
      el('span', { class: 'w', text: 'want ' + t.want }), DOT,
      el('span', { class: 'm', text: 'maybe ' + t.maybe }), DOT,
      el('span', { class: 's', text: 'skip ' + t.skip }), DOT,
      el('span', { class: 'u', text: 'open ' + open }), ' of ' + total + ' ' + DOT + ' catalogue v' + state.version,
    );
    $('#progress').style.width = total ? (100 * done / total).toFixed(1) + '%' : '0';
    for (const chip of document.querySelectorAll('.chip[data-filter="unvoted"]')) {
      chip.replaceChildren('Not voted', el('span', { class: 'n', text: open }));
    }
  }

  function visible(i) {
    const v = state.votes[i.id]?.vote;
    switch (state.filter) {
      case 'unvoted': return !v;
      case 'new': return isNew(i);
      case 'top': return i.top_pick;
      case 'world': return i.in_world;
      case 'want': return v === 'want';
      default: return true;
    }
  }

  function sorted(list) {
    const by = state.sort;
    return [...list].sort((a, b) => {
      if (by === 'wow') return b.wow - a.wow || a.order - b.order;
      if (by === 'wanted') return (b.tally.want - a.tally.want) || (b.tally.maybe - a.tally.maybe) || a.order - b.order;
      if (by === 'feas') return (FEAS[a.feasibility] ?? 9) - (FEAS[b.feasibility] ?? 9) || b.wow - a.wow;
      if (by === 'effort') return (EFFORT[a.effort] ?? 9) - (EFFORT[b.effort] ?? 9) || b.wow - a.wow;
      return a.order - b.order;
    });
  }

  function tallyNode(i) {
    const { want, maybe, skip } = i.tally;
    const total = want + maybe + skip;
    const wrap = el('div', { class: 'tally', id: 'tally-' + i.id });
    const bar = el('div', { class: 'tbar', 'aria-hidden': 'true' });
    for (const [cls, n] of [['w', want], ['m', maybe], ['s', skip]]) {
      const seg = el('i', { class: cls });
      seg.style.width = total ? (100 * n / total).toFixed(2) + '%' : '0';
      bar.append(seg);
    }
    let line;
    if (total) {
      line = el('span', null, 'everyone: ', el('span', { class: 'w', text: want + ' want' }), DOT,
        el('span', { class: 'm', text: maybe + ' maybe' }), DOT, el('span', { class: 's', text: skip + ' skip' }));
    } else {
      line = el('span', { text: state.talliesOk ? 'everyone: no votes yet' : 'everyone: tallies unavailable right now' });
    }
    wrap.append(bar, line);
    return wrap;
  }

  function card(i) {
    const mine = state.votes[i.id];
    const vote = mine?.vote || '';
    const a = el('article', { class: 'idea', 'data-vote': vote, id: 'idea-' + i.id, 'aria-labelledby': 'h-' + i.id });
    a.append(el('h3', { id: 'h-' + i.id, text: i.title }), el('p', { class: 'pitch', text: i.pitch }));

    const meta = el('div', { class: 'meta' });
    if (isNew(i)) meta.append(el('span', { class: 'tag new', text: 'new' }));
    if (i.top_pick) meta.append(el('span', { class: 'tag top', text: 'top pick' }));
    if (i.in_world) meta.append(el('span', { class: 'tag world', text: 'in-world' }));
    if (i.feasibility) meta.append(el('span', { class: 'tag feas-' + i.feasibility, text: i.feasibility }));
    if (i.effort) meta.append(el('span', { class: 'tag', text: i.effort }));
    const wow = el('span', { class: 'wow', role: 'img', title: 'wow ' + i.wow + '/10', 'aria-label': 'wow ' + i.wow + ' of 10' });
    for (let k = 1; k <= 10; k++) wow.append(el('i', { class: k <= i.wow ? 'on' : '' }));
    meta.append(wow);
    a.append(meta, tallyNode(i));

    a.append(el('span', { class: vote ? 'cue' : 'cue open', text: vote ? 'your vote' : 'not voted yet' }));
    const vr = el('div', { class: 'vote', role: 'group', 'aria-label': 'Your vote on ' + i.title });
    for (const [v, label] of LABELS) {
      const b = el('button', { type: 'button', id: 'v-' + v + '-' + i.id, 'data-v': v, 'aria-pressed': String(vote === v), text: label });
      b.addEventListener('click', () => castVote(i.id, vote === v ? null : v));
      vr.append(b);
    }
    a.append(vr);

    const d = el('details', { open: state.open.has(i.id) });
    d.addEventListener('toggle', () => { if (d.open) state.open.add(i.id); else state.open.delete(i.id); });
    d.append(el('summary', { text: 'the moment' + DOT + 'how' + DOT + 'risks' }));
    for (const [k, v] of [['the moment', i.experience], ['how it would work', i.how], ['risks', i.risks], ['for', i.audience]]) {
      if (v) d.append(el('span', { class: 'k', text: k }), el('p', { text: v }));
    }
    a.append(d);

    const draft = state.drafts[i.id];
    const ta = el('textarea', {
      id: 'note-' + i.id, rows: '2', maxlength: String(NOTE_MAX), disabled: !vote,
      placeholder: vote ? 'A note for the plan (optional, only the maintainer sees it)' : 'Vote first, then add a note',
      'aria-label': 'Note on ' + i.title,
    });
    ta.value = draft !== undefined ? draft : (mine?.note || '');
    const st = el('span', { id: 'note-state-' + i.id });
    const count = el('span', { text: ta.value.length + ' / ' + NOTE_MAX });
    let timer = null;
    ta.addEventListener('input', () => {
      state.drafts[i.id] = ta.value;
      count.textContent = ta.value.length + ' / ' + NOTE_MAX;
      st.textContent = ELLIPSIS;
      clearTimeout(timer);
      timer = setTimeout(() => { timer = null; saveNote(i.id, ta.value); }, 1200);
    });
    ta.addEventListener('blur', () => { if (timer) { clearTimeout(timer); timer = null; saveNote(i.id, ta.value); } });
    a.append(ta, el('div', { class: 'note-row' }, st, count));
    return a;
  }

  function withFocus(fn) {
    const id = document.activeElement?.id;
    fn();
    if (id && document.activeElement?.id !== id) document.getElementById(id)?.focus({ preventScroll: true });
  }

  function render() {
    renderTally();
    const root = $('#cats');
    if (!state.ideas.length) {
      root.replaceChildren(el('p', { class: 'empty', text: 'No ideas are open for voting yet.' }));
      return;
    }
    withFocus(() => {
      root.replaceChildren();
      const byCat = new Map();
      for (const i of state.ideas) { if (!byCat.has(i.category)) byCat.set(i.category, []); byCat.get(i.category).push(i); }
      for (const c of state.categories) {
        const list = sorted((byCat.get(c.name) || []).filter(visible));
        if (!list.length) continue;
        const sec = el('section', { class: 'cat', 'aria-label': c.name });
        sec.append(el('div', { class: 'cat-head' }, el('h2', { text: c.name }), c.tagline ? el('p', { text: c.tagline }) : null));
        const g = el('div', { class: 'grid' });
        for (const i of list) g.append(card(i));
        sec.append(g);
        root.append(sec);
      }
      if (!root.children.length) {
        const msg = state.filter === 'unvoted' ? 'You have voted on every idea. Thank you!' : 'Nothing matches this filter yet.';
        root.append(el('p', { class: 'empty', text: msg }));
      }
    });
  }

  // Re-render one card in place, unless the active filter depends on votes.
  function refresh(id) {
    renderTally();
    if (state.filter === 'unvoted' || state.filter === 'want') return render();
    const old = document.getElementById('idea-' + id);
    const idea = state.byId.get(id);
    if (!old || !idea) return render();
    withFocus(() => old.replaceWith(card(idea)));
  }

  function renderNewBanner() {
    const n = state.ideas.filter(isNew).length;
    const chip = $('.chip[data-filter="new"]');
    chip.hidden = n === 0;
    if (n) chip.replaceChildren('New', el('span', { class: 'n', text: n }));
    $('#new-banner').hidden = n === 0;
    if (n) {
      $('#new-text').textContent = (n === 1 ? '1 idea has' : n + ' ideas have') +
        ' been added since catalogue v' + state.since + '. They are marked new.';
    }
  }

  function renderSuggestions() {
    const g = $('#suggestions');
    g.replaceChildren();
    for (const s of state.suggestions) {
      const a = el('article', { class: 'idea' });
      a.append(el('h3', { text: s.title }));
      if (s.detail) a.append(el('p', { class: 'pitch', text: s.detail }));
      const when = s.created_at ? new Date(s.created_at).toLocaleDateString() : '';
      a.append(el('div', { class: 'meta' },
        el('span', { class: 'tag world', text: 'your suggestion' }),
        el('span', { class: 'tag', text: when ? 'sent ' + when : 'sent' })));
      g.append(a);
    }
  }

  // ---- writes -----------------------------------------------------------------
  async function castVote(id, vote) {
    const idea = state.byId.get(id);
    if (!idea) return;
    const prev = state.votes[id] ? { ...state.votes[id] } : null;
    const prevTally = { ...idea.tally };
    const seq = (state.seq[id] = (state.seq[id] || 0) + 1);
    if (prev) idea.tally[prev.vote] = Math.max(0, idea.tally[prev.vote] - 1);
    if (vote) { idea.tally[vote]++; state.votes[id] = { vote, note: prev?.note || '' }; }
    else { delete state.votes[id]; delete state.drafts[id]; }
    refresh(id);
    try {
      const r = await post('vote', { idea_id: id, vote });
      if (seq !== state.seq[id]) return;
      idea.tally = r.tally;
      if (r.vote) state.votes[id] = { vote: r.vote, note: r.note || '' }; else delete state.votes[id];
      saveVotes();
      refresh(id);
    } catch (e) {
      if (seq !== state.seq[id]) return;
      idea.tally = prevTally;
      if (prev) state.votes[id] = prev; else delete state.votes[id];
      refresh(id);
      const st = document.getElementById('note-state-' + id);
      if (st) st.textContent = errorText(e);
    }
  }

  async function saveNote(id, value) {
    const cur = state.votes[id];
    const st = () => document.getElementById('note-state-' + id) || { set textContent(v) {} };
    if (!cur) return;
    if ((cur.note || '') === value) { delete state.drafts[id]; st().textContent = ''; return; }
    if (value.length > NOTE_MAX) { st().textContent = 'too long'; return; }
    st().textContent = 'saving' + ELLIPSIS;
    try {
      const r = await post('vote', { idea_id: id, vote: cur.vote, note: value });
      const idea = state.byId.get(id);
      if (idea) idea.tally = r.tally;
      if (r.vote) state.votes[id] = { vote: r.vote, note: r.note || '' };
      saveVotes();
      if (state.drafts[id] === value) delete state.drafts[id];
      st().textContent = 'saved';
      const t = document.getElementById('tally-' + id);
      if (t && idea) t.replaceWith(tallyNode(idea));
    } catch (e) {
      st().textContent = errorText(e);
    }
  }

  // ---- controls and load ------------------------------------------------------
  function setFilter(f) {
    state.filter = f;
    for (const c of document.querySelectorAll('.chip[data-filter]')) c.setAttribute('aria-pressed', String(c.dataset.filter === f));
    render();
  }

  function wireControls() {
    $('#theme').addEventListener('click', () => {
      const cur = document.documentElement.dataset.theme || '';
      const next = cur === '' ? 'dark' : cur === 'dark' ? 'light' : '';
      setItem('localStorage', KEY.theme, next);
      applyTheme(next);
    });
    applyTheme(document.documentElement.dataset.theme || '');

    for (const b of document.querySelectorAll('.chip[data-filter]')) b.addEventListener('click', () => setFilter(b.dataset.filter));
    $('#new-show').addEventListener('click', () => { setFilter('new'); $('#cats').scrollIntoView({ block: 'start' }); });
    $('#sort').addEventListener('change', (e) => { state.sort = e.target.value; render(); });

    $('#next-open').addEventListener('click', () => {
      const cards = [...document.querySelectorAll('article.idea[data-vote=""]')];
      $('#next-open').textContent = cards.length ? 'Next unvoted \u2193' : 'All voted \u2713';
      if (!cards.length) return;
      const target = cards.find((c) => c.getBoundingClientRect().top > 120) || cards[0];
      const smooth = window.matchMedia('(prefers-reduced-motion: no-preference)').matches;
      target.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' });
      target.querySelector('.vote button')?.focus({ preventScroll: true });
    });

    const sTitle = $('#s-title'), sDetail = $('#s-detail'), sState = $('#s-state'), sSend = $('#s-send');
    sDetail.addEventListener('input', () => { $('#s-count').textContent = sDetail.value.length + ' / ' + DETAIL_MAX; });
    $('#suggest').addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = sTitle.value.trim(), detail = sDetail.value.trim();
      if (title.length < 3) { sState.textContent = 'Give the idea a short title (3+ characters).'; sTitle.focus(); return; }
      sSend.disabled = true;
      sState.textContent = 'Sending' + ELLIPSIS;
      try {
        const r = await post('suggest', { title, detail });
        const s = r.suggestion || {};
        state.suggestions.unshift({ title: s.title || title, detail: s.detail ?? detail, created_at: s.created_at || Date.now() });
        state.suggestions.length = Math.min(state.suggestions.length, KEEP_SUGGESTIONS);
        saveSuggestions();
        renderSuggestions();
        sTitle.value = ''; sDetail.value = ''; $('#s-count').textContent = '0 / ' + DETAIL_MAX;
        sState.textContent = 'Thanks! It is in the review pile.';
      } catch (err) {
        sState.textContent = errorText(err);
      } finally {
        sSend.disabled = false;
      }
    });

    // Another tab changed the ballot: pick it up.
    window.addEventListener('storage', (e) => {
      if (e.key === KEY.votes && state.ideas.length) { state.votes = loadVotes(); render(); }
      if (e.key === KEY.suggestions) { state.suggestions = loadSuggestions(); renderSuggestions(); }
    });
  }

  async function load() {
    state.votes = loadVotes();
    state.suggestions = loadSuggestions();
    renderSuggestions();
    try {
      // The catalogue is a static file; tallies are the only server read, and the page works without them.
      const [data, tallies] = await Promise.all([
        request('ideas.json', { credentials: 'omit' }),
        request('api/tallies', { credentials: 'omit' }).catch(() => null),
      ]);
      state.talliesOk = !!(tallies && typeof tallies === 'object');
      state.version = data.version;
      state.categories = data.categories;
      state.ideas = data.ideas.map((i, order) => {
        const t = (state.talliesOk && tallies[i.id]) || {};
        return { ...i, order, tally: { want: t.want | 0, maybe: t.maybe | 0, skip: t.skip | 0 } };
      });
      state.byId = new Map(state.ideas.map((i) => [i.id, i]));
      state.since = computeSince(state.version);
      renderNewBanner();
      render();
    } catch (e) {
      const retry = el('button', { class: 'btn ghost', type: 'button', text: 'Try again' });
      retry.addEventListener('click', () => {
        $('#cats').replaceChildren(el('p', { class: 'empty', text: 'Loading ideas' + ELLIPSIS }));
        load();
      });
      $('#cats').replaceChildren(el('p', { class: 'empty', text: 'Could not load the ideas. ' + errorText(e, 'Could not reach the server.') }), retry);
    }
  }

  function start() {
    wireControls();
    load();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
