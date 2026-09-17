// Ghostty for FFXIV vote page. A static asset: the catalogue comes from ideas.json,
// tallies from GET api/tallies (edge-cached for a minute), and the visitor's own ballot
// from GET api/mine (keyed by the voter cookie), painted first from localStorage.
// Changes go to POST api/vote and api/suggest through the save queue in ballot.js.
// All data is rendered through textContent; no HTML strings are built from data.
(function () {
  'use strict';
  const BASE = '/mods/ffxiv/term/vote/';
  const B = window.GhosttyBallot;
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

  if (!B) {
    const broken = () => { const m = document.getElementById('cats'); if (m) m.textContent = 'Could not load the page script; reload to try again.'; };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', broken, { once: true });
    else broken();
    return;
  }

  const NOTE_MAX = B.NOTE_MAX, DETAIL_MAX = 600, KEEP_SUGGESTIONS = 50;
  const NOTE_DEBOUNCE_MS = 700, MINE_REFRESH_MS = 30 * 1000;
  const VOTES = B.VOTES;
  const FEAS = { ready: 0, stretch: 1, research: 2 };
  const EFFORT = { hours: 0, days: 1, weeks: 2 };
  const LABELS = [['want', 'Want'], ['maybe', 'Maybe'], ['skip', 'Skip']];
  const ELLIPSIS = '\u2026', DOT = ' \u00b7 ';
  const state = {
    version: 0, categories: [], ideas: [], byId: new Map(), talliesOk: false,
    filter: 'all', sort: 'catalogue', since: null, open: new Set(),
    votes: {},      // the ballot as shown: {id: {vote: 'want'|'maybe'|'skip'|'', note}}
    saved: {},      // the ballot as the server last reported it (to undo a refused vote)
    drafts: {},     // note text typed but not yet queued (inside the debounce)
    status: {},     // per-card save status text
    touched: {},    // id -> writeSeq of its last local change or save
    writeSeq: 0, mineAt: 0, mineBusy: false,
    storedWrite: false, // a write succeeded on this page, so the voter cookie should be set
    suggestions: [], sentIds: new Set(),
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
      const after = (res.headers.get('retry-after') || '').trim();
      if (/^\d{1,6}$/.test(after)) err.retryAfter = Number(after);
      throw err;
    }
    return data;
  }
  // Until one write has succeeded (and so set the voter cookie), writes go one at a time.
  const gate = B.createGate();
  const post = (name, body, keepalive) => gate.run(() => request('api/' + name, {
    method: 'POST',
    credentials: 'same-origin',
    keepalive: !!keepalive,
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })).then((data) => { gate.unlock(); return data; });

  function errorText(e, offline) {
    if (e && e.status) return e.message;
    return offline || 'Could not reach the server; not saved.';
  }

  // ---- the visitor's own ballot ------------------------------------------------
  // localStorage paints it at once; api/mine then replaces it with what the server has.
  function readJson(key, fallback) {
    const raw = getItem('localStorage', key);
    if (raw === null) return fallback;
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  }

  const loadVotes = () => B.normalizeBallot(readJson(KEY.votes, {}));
  const saveVotes = () => setItem('localStorage', KEY.votes, JSON.stringify(state.votes));
  const loadSuggestions = () => B.normalizeSuggestions(readJson(KEY.suggestions, []), KEEP_SUGGESTIONS);
  const saveSuggestions = () => setItem('localStorage', KEY.suggestions, JSON.stringify(state.suggestions));

  function setMine(id, vote, note) {
    if (vote || note) state.votes[id] = { vote, note }; else delete state.votes[id];
  }
  const touch = (id) => { state.touched[id] = ++state.writeSeq; };

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

  const NOTE_PLACEHOLDER = 'A note for the plan (optional, only the maintainer sees it)';

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

    a.append(el('span', { id: 'cue-' + i.id, class: vote ? 'cue' : 'cue open', text: vote ? 'your vote' : 'not voted yet' }));
    const vr = el('div', { class: 'vote', role: 'group', 'aria-label': 'Your vote on ' + i.title });
    for (const [v, label] of LABELS) {
      const b = el('button', { type: 'button', id: 'v-' + v + '-' + i.id, 'data-v': v, 'aria-pressed': String(vote === v), text: label });
      b.addEventListener('click', () => castVote(i.id, v));
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

    // Always enabled: a note can be left with or without a vote, and survives clearing the vote.
    const draft = state.drafts[i.id];
    const ta = el('textarea', {
      id: 'note-' + i.id, rows: '2', maxlength: String(NOTE_MAX), placeholder: NOTE_PLACEHOLDER,
      'aria-label': 'Note on ' + i.title,
    });
    ta.value = draft !== undefined ? draft : (mine?.note || '');
    const st = el('span', { id: 'note-state-' + i.id, text: state.status[i.id] || '' });
    const count = el('span', { id: 'note-count-' + i.id, text: ta.value.length + ' / ' + NOTE_MAX });
    ta.addEventListener('input', () => {
      state.drafts[i.id] = ta.value;
      count.textContent = ta.value.length + ' / ' + NOTE_MAX;
      setStatus(i.id, ELLIPSIS);
      notes.schedule(i.id, () => commitNote(i.id));
    });
    ta.addEventListener('blur', () => notes.fire(i.id));
    a.append(ta, el('div', { class: 'note-row' }, st, count));
    return a;
  }

  // Update a rendered card from state without rebuilding it, so a note being typed
  // keeps its caret. The textarea is never rewritten while it holds unsaved text.
  function syncCard(i) {
    if (!document.getElementById('idea-' + i.id)) return;
    const mine = state.votes[i.id];
    const vote = mine?.vote || '';
    document.getElementById('idea-' + i.id).setAttribute('data-vote', vote);
    const cue = document.getElementById('cue-' + i.id);
    if (cue) { cue.className = vote ? 'cue' : 'cue open'; cue.textContent = vote ? 'your vote' : 'not voted yet'; }
    for (const [v] of LABELS) document.getElementById('v-' + v + '-' + i.id)?.setAttribute('aria-pressed', String(vote === v));
    document.getElementById('tally-' + i.id)?.replaceWith(tallyNode(i));
    const ta = document.getElementById('note-' + i.id);
    const note = mine?.note || '';
    if (ta && B.noteNeedsRewrite(ta.value, note, ta === document.activeElement, state.drafts[i.id] !== undefined)) {
      ta.value = note;
      const count = document.getElementById('note-count-' + i.id);
      if (count) count.textContent = note.length + ' / ' + NOTE_MAX;
    }
    const st = document.getElementById('note-state-' + i.id);
    if (st) st.textContent = state.status[i.id] || '';
  }

  function withFocus(fn) {
    const active = document.activeElement;
    const id = active?.id;
    const range = active instanceof HTMLTextAreaElement ? [active.selectionStart, active.selectionEnd] : null;
    fn();
    if (!id || document.activeElement?.id === id) return;
    const next = document.getElementById(id);
    if (!next) return;
    next.focus({ preventScroll: true });
    if (range && next instanceof HTMLTextAreaElement) { try { next.setSelectionRange(range[0], range[1]); } catch (e) {} }
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

  // Update one card in place; re-render everything only if the filter now hides or shows it.
  function refresh(id) {
    renderTally();
    const idea = state.byId.get(id);
    if (!idea) return;
    if (!!document.getElementById('idea-' + id) !== visible(idea)) return render();
    syncCard(idea);
  }

  // Swap in a ballot from the server or another tab and update the cards that changed.
  // adjustTallies: move this voter's share of the tallies too (another tab's saves).
  function applyBallot(next, adjustTallies) {
    const prev = state.votes;
    state.votes = next;
    if (!state.ideas.length) return;
    let again = false;
    for (const i of state.ideas) {
      const a = prev[i.id] || { vote: '', note: '' }, b = next[i.id] || { vote: '', note: '' };
      if (a.vote === b.vote && a.note === b.note) continue;
      if (adjustTallies) i.tally = B.adjustTally(i.tally, a.vote, b.vote);
      if (!!document.getElementById('idea-' + i.id) !== visible(i)) again = true;
      else syncCard(i);
    }
    renderTally();
    if (again) render();
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
  // Every vote click and every pause in note typing is a change for the save queue,
  // which keeps one request in flight per idea and retries what fails for a while.
  const timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h) };
  const notes = B.createDebouncer(NOTE_DEBOUNCE_MS, timers);
  const queue = B.createSaveQueue({
    timers,
    now: () => Date.now(),
    // Every save uses keepalive, so one in flight still arrives if the tab closes first.
    keepalive: () => true,
    send: (id, fields, opts) => post('vote', { idea_id: id, ...fields }, opts.keepalive),
    onSaved,
    onFailed,
    onStatus,
  });
  const isBusy = (id) => state.drafts[id] !== undefined || notes.has(id) || queue.busy(id);

  function setStatus(id, text) {
    state.status[id] = text;
    const st = document.getElementById('note-state-' + id);
    if (st) st.textContent = text;
  }

  function onStatus(id, kind, err) {
    if (kind === 'saving') return setStatus(id, 'saving' + ELLIPSIS);
    if (kind === 'saved') return setStatus(id, notes.has(id) ? ELLIPSIS : 'saved');
    if (kind === 'error') return setStatus(id, errorText(err));
    const why = !err || !err.status ? 'offline' : err.status === 429 ? 'busy' : 'server error';
    setStatus(id, why + '; will retry' + ELLIPSIS);
  }

  function castVote(id, v) {
    const idea = state.byId.get(id);
    if (!idea) return;
    const cur = state.votes[id] || { vote: '', note: '' };
    const next = cur.vote === v ? '' : v; // clicking the active choice clears it
    idea.tally = B.adjustTally(idea.tally, cur.vote, next);
    setMine(id, next, cur.note);
    touch(id);
    refresh(id);
    queue.change(id, { vote: next || null }); // no note: the saved note stays
  }

  function commitNote(id) {
    const text = state.drafts[id];
    delete state.drafts[id];
    if (text === undefined) return;
    const cur = state.votes[id] || { vote: '', note: '' };
    if (text === cur.note) { setStatus(id, queue.busy(id) ? 'saving' + ELLIPSIS : ''); return; }
    setMine(id, cur.vote, text);
    touch(id);
    queue.change(id, { note: text }); // no vote: the saved vote stays
  }

  function onSaved(id, data) {
    gate.unlock();
    state.storedWrite = true;
    const vote = VOTES.includes(data.vote) ? data.vote : '';
    const note = typeof data.note === 'string' ? data.note : '';
    state.saved[id] = { vote, note };
    touch(id);
    // Newer changes still queued or typed win over this answer.
    if (!isBusy(id)) setMine(id, vote, note);
    const idea = state.byId.get(id);
    if (idea && data.tally) idea.tally = B.adjustTally(data.tally, vote, state.votes[id]?.vote || '');
    saveVotes();
    refresh(id);
  }

  // The server refused a change for good (e.g. the idea was retired): put the vote
  // back to what the server has unless a newer one is queued. Note text stays as typed.
  function onFailed(id, fields) {
    if (!('vote' in fields) || 'vote' in (queue.pending(id) || {})) return;
    const cur = state.votes[id] || { vote: '', note: '' };
    const back = state.saved[id]?.vote || '';
    const idea = state.byId.get(id);
    if (idea) idea.tally = B.adjustTally(idea.tally, cur.vote, back);
    setMine(id, back, cur.note);
    touch(id);
    saveVotes();
    refresh(id);
  }

  // GET api/mine: the server's copy of this voter's ballot and suggestions. It wins
  // over localStorage, except for ideas being edited or saved, or changed since the
  // request went out. Failures (offline) keep the local ballot quietly, and so does an
  // empty answer after this page has saved something (a cookie that was not kept).
  async function loadMine() {
    if (state.mineBusy) return;
    state.mineBusy = true;
    state.mineAt = Date.now();
    const since = state.writeSeq;
    let data = null;
    try {
      data = await request('api/mine', { credentials: 'same-origin', cache: 'no-store' });
    } catch (e) {
      data = null;
    } finally {
      state.mineBusy = false;
    }
    if (!data || typeof data !== 'object') return;
    const votes = B.normalizeBallot(data.votes);
    const suggestions = B.normalizeSuggestions(data.suggestions, KEEP_SUGGESTIONS);
    // Empty after this page stored writes: the cookie did not stick, so keep what is shown.
    if (B.ballotLost(votes, suggestions, state.votes, state.suggestions, state.storedWrite)) return;
    if (Object.keys(votes).length || suggestions.length) gate.unlock(); // the cookie is already set
    const keepLocal = (id) => isBusy(id) || (state.touched[id] || 0) > since;
    const saved = { ...votes };
    for (const id of Object.keys(state.touched)) {
      if (state.touched[id] > since) { if (state.saved[id]) saved[id] = state.saved[id]; else delete saved[id]; }
    }
    state.saved = saved;
    applyBallot(B.mergeBallot(state.votes, votes, keepLocal), false);
    saveVotes();
    state.suggestions = B.mergeSuggestions(suggestions, state.suggestions, state.sentIds, KEEP_SUGGESTIONS);
    saveSuggestions();
    renderSuggestions();
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
        const saved = { title: s.title || title, detail: s.detail ?? detail, created_at: s.created_at || Date.now() };
        if (Number.isInteger(s.id)) { saved.id = s.id; state.sentIds.add(s.id); }
        state.storedWrite = true;
        state.suggestions.unshift(saved);
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

    // Another tab saved a change: pick it up, leaving alone whatever is being edited here.
    window.addEventListener('storage', (e) => {
      if (e.key === KEY.votes) applyBallot(B.mergeBallot(state.votes, loadVotes(), isBusy), true);
      if (e.key === KEY.suggestions) { state.suggestions = loadSuggestions(); renderSuggestions(); }
    });

    // Leaving: send typed notes and queued changes now (keepalive, so they outlive the
    // page). Coming back: re-read the server ballot, at most every MINE_REFRESH_MS.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') { notes.fireAll(); queue.flush(false); }
      else if (Date.now() - state.mineAt >= MINE_REFRESH_MS) loadMine();
    });
    window.addEventListener('pagehide', () => { notes.fireAll(); queue.flush(true); });
    window.addEventListener('online', () => queue.flush(false));
  }

  async function load() {
    state.votes = loadVotes();
    state.saved = { ...state.votes };
    state.suggestions = loadSuggestions();
    renderSuggestions();
    loadMine(); // in parallel; it applies itself whenever it lands
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
