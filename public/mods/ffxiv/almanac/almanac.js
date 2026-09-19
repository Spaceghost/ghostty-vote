// Almanac community model leaderboard: renders leaderboard.json (computed from D1 and
// cached at the edge) into sortable tables and a quality-vs-speed scatter. Rendered through
// textContent and attributes only; no data is ever written into markup.
(function () {
  'use strict';
  const BASE = '/mods/ffxiv/almanac/';
  const THEME_KEY = 'ghostty-vote:theme'; // shared with the vote and gallery pages
  const DOT = ' \u00b7 ';
  const SVG = 'http://www.w3.org/2000/svg';

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
  function svg(tag, attrs, ...kids) {
    const n = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v !== null && v !== undefined) n.setAttribute(k, String(v));
    for (const k of kids) if (k !== null && k !== undefined) n.append(k);
    return n;
  }
  const str = (v) => (typeof v === 'string' ? v : '');
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const fmt = (v, d) => (num(v) === null ? '\u2013' : v.toFixed(d));
  const gb = (mb) => (num(mb) === null ? '\u2013' : (mb / 1024).toFixed(1) + ' GB');
  const pct = (v) => (num(v) === null ? '\u2013' : Math.round(v * 100) + '%');

  const state = { data: null, suite: '', mode: 'live', tier: '', gpu: '', sort: { tiers: ['rank', -1], gpu: ['score', -1] } };

  function applyTheme(t) {
    if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
    $('#theme').textContent = 'theme: ' + (t || 'auto');
  }
  function summary(text) { $('#summary').replaceChildren('$ ', el('b', { text: 'almanac' }), ' leaderboard  ' + text); }

  // ---- tables ------------------------------------------------------------------------------
  const COLUMNS = [
    { key: 'model', label: 'Model', value: (g) => str(g.model), cell: (g) => el('td', { class: 'model' }, el('b', { text: str(g.model) }), el('span', { class: 'small', text: ' ' + str(g.quant) })) },
    { key: 'score', label: 'Score', value: (g) => num(g.score), cell: (g) => el('td', { class: 'num' }, fmt(g.score, 1), num(g.score_low) !== null ? el('span', { class: 'small', text: ' ' + fmt(g.score_low, 0) + '\u2013' + fmt(g.score_high, 0) }) : null) },
    { key: 'tokens_per_s', label: 'tok/s', value: (g) => num(g.tokens_per_s), cell: (g) => el('td', { class: 'num', text: fmt(g.tokens_per_s, 1) }) },
    { key: 'ttft_ms', label: 'first token', value: (g) => num(g.ttft_ms), cell: (g) => el('td', { class: 'num', text: num(g.ttft_ms) === null ? '\u2013' : Math.round(g.ttft_ms) + ' ms' }) },
    { key: 'peak_vram_mb', label: 'peak VRAM', value: (g) => num(g.peak_vram_mb), cell: (g) => el('td', { class: 'num', text: gb(g.peak_vram_mb) }) },
    { key: 'success_rate', label: 'tasks ok', value: (g) => num(g.success_rate), cell: (g) => el('td', { class: 'num', text: pct(g.success_rate) }) },
    { key: 'tool_call_validity', label: 'valid tools', value: (g) => num(g.tool_call_validity), cell: (g) => el('td', { class: 'num', text: pct(g.tool_call_validity) }) },
    { key: 'samples', label: 'who', value: (g) => num(g.samples), cell: (g) => el('td', { class: 'num', title: (g.runs | 0) + ' runs' + (g.trimmed ? ', ' + g.trimmed + ' outlier submitters trimmed' : ''), text: String(g.samples | 0) }) },
    { key: 'confidence', label: 'confidence', value: (g) => ({ low: 0, medium: 1, high: 2 })[g.confidence] ?? -1, cell: (g) => el('td', { class: 'conf ' + str(g.confidence), text: str(g.confidence) }) },
  ];

  function table(rows, which, caption, withRank) {
    const [key, dir] = state.sort[which];
    const sorted = rows.slice();
    if (key !== 'rank') {
      const col = COLUMNS.find((c) => c.key === key);
      sorted.sort((a, b) => {
        const x = col.value(a); const y = col.value(b);
        if (x === null && y === null) return 0;
        if (x === null) return 1;
        if (y === null) return -1;
        return (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir;
      });
    }
    const head = el('tr');
    if (withRank) head.append(sortHeader({ key: 'rank', label: '#' }, which));
    for (const c of COLUMNS) head.append(sortHeader(c, which));
    const body = el('tbody');
    sorted.forEach((g) => {
      const tr = el('tr');
      if (withRank) tr.append(el('td', { class: 'num', text: String(rows.indexOf(g) + 1) }));
      for (const c of COLUMNS) tr.append(c.cell(g));
      body.append(tr);
    });
    return el('div', { class: 'scroll' }, el('table', { class: 'board' }, el('caption', { text: caption }), el('thead', null, head), body));
  }

  function sortHeader(c, which) {
    const [key, dir] = state.sort[which];
    const active = key === c.key;
    const b = el('button', { type: 'button', class: 'sort', text: c.label + (active ? (dir > 0 ? ' \u2191' : ' \u2193') : '') });
    b.addEventListener('click', () => {
      state.sort[which] = [c.key, active ? -dir : c.key === 'model' ? 1 : -1];
      render();
    });
    return el('th', { scope: 'col', 'aria-sort': active ? (dir > 0 ? 'ascending' : 'descending') : 'none' }, b);
  }

  // ---- scatter -------------------------------------------------------------------------------
  function scatter(groups) {
    const box = $('#scatter');
    const pts = groups.filter((g) => num(g.score) !== null && num(g.tokens_per_s) !== null && g.tokens_per_s > 0);
    if (!pts.length) { box.replaceChildren(el('p', { class: 'empty', text: 'Nothing to plot yet.' })); return; }
    const W = 720; const H = 360; const L = 48; const R = 16; const T = 16; const B = 40;
    const lx = pts.map((p) => Math.log10(p.tokens_per_s));
    let x0 = Math.floor(Math.min(...lx)); let x1 = Math.ceil(Math.max(...lx));
    if (x1 === x0) x1 = x0 + 1;
    const X = (v) => L + (Math.log10(v) - x0) / (x1 - x0) * (W - L - R);
    const Y = (v) => T + (1 - v / 100) * (H - T - B);
    const g = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'plot', role: 'img', 'aria-label': 'Score against tokens per second, ' + pts.length + ' models' });
    for (const s of [0, 25, 50, 75, 100]) {
      g.append(svg('line', { x1: L, x2: W - R, y1: Y(s), y2: Y(s), class: 'grid' }));
      g.append(svg('text', { x: L - 8, y: Y(s) + 4, class: 'tick', 'text-anchor': 'end' }, String(s)));
    }
    for (let e = x0; e <= x1; e++) {
      for (const m of [1, 2, 5]) {
        const v = m * 10 ** e;
        if (Math.log10(v) > x1 + 1e-9) continue;
        g.append(svg('line', { x1: X(v), x2: X(v), y1: T, y2: H - B, class: m === 1 ? 'grid' : 'grid minor' }));
        if (m === 1 || x1 - x0 <= 2) g.append(svg('text', { x: X(v), y: H - B + 16, class: 'tick', 'text-anchor': 'middle' }, String(v)));
      }
    }
    g.append(svg('text', { x: (L + W - R) / 2, y: H - 6, class: 'axis', 'text-anchor': 'middle' }, 'tokens per second (log)'));
    g.append(svg('text', { x: 12, y: T + (H - T - B) / 2, class: 'axis', 'text-anchor': 'middle', transform: `rotate(-90 12 ${T + (H - T - B) / 2})` }, 'score'));
    const tip = svg('g', { class: 'tip', visibility: 'hidden' });
    const tipBg = svg('rect', { rx: 6, ry: 6 });
    const tipText = svg('text', {});
    tip.append(tipBg, tipText);
    const show = (p, cx, cy) => {
      tipText.replaceChildren();
      const lines = [p.model + ' ' + p.quant, 'score ' + fmt(p.score, 1) + DOT + fmt(p.tokens_per_s, 1) + ' tok/s', 'peak ' + gb(p.peak_vram_mb) + DOT + tierLabel(p.tier) + DOT + (p.samples | 0) + ' submitter' + (p.samples === 1 ? '' : 's')];
      lines.forEach((line, i) => tipText.append(svg('tspan', { x: 10, dy: i ? 16 : 0 }, line)));
      const w = Math.max(...lines.map((l) => l.length)) * 7.4 + 20;
      const h = lines.length * 16 + 12;
      const tx = Math.min(Math.max(cx + 12, L), W - R - w);
      const ty = cy - h - 12 < T ? cy + 12 : cy - h - 12;
      tipBg.setAttribute('width', String(w)); tipBg.setAttribute('height', String(h));
      tipText.setAttribute('y', '20');
      tipText.querySelectorAll('tspan')[0].setAttribute('dy', '0');
      tip.setAttribute('transform', `translate(${tx} ${ty})`);
      tip.setAttribute('visibility', 'visible');
    };
    const hide = () => tip.setAttribute('visibility', 'hidden');
    for (const p of pts) {
      const cx = X(p.tokens_per_s); const cy = Y(p.score);
      const label = p.model + ' ' + p.quant + ': score ' + fmt(p.score, 1) + ', ' + fmt(p.tokens_per_s, 1) + ' tokens per second';
      const hit = svg('g', { class: 'pt ' + str(p.confidence), tabindex: 0, role: 'img', 'aria-label': label },
        svg('circle', { cx, cy, r: 14, class: 'hit' }),
        svg('circle', { cx, cy, r: p.confidence === 'low' ? 4 : 5.5, class: 'dot' }));
      hit.addEventListener('mouseenter', () => show(p, cx, cy));
      hit.addEventListener('focus', () => show(p, cx, cy));
      hit.addEventListener('mouseleave', hide);
      hit.addEventListener('blur', hide);
      g.append(hit);
    }
    g.append(tip);
    box.replaceChildren(g, el('p', { class: 'small legend' }, el('span', { class: 'key solid' }), ' medium or high confidence ', el('span', { class: 'key hollow' }), ' low confidence (fewer than 3 submitters)'));
  }

  // ---- render --------------------------------------------------------------------------------
  const tierLabel = (id) => (state.data.tiers.find((t) => t.id === id) || { label: id }).label;
  const inView = (g) => g.suite_id + '@' + g.suite_version === state.suite && g.mode === state.mode;

  function render() {
    const d = state.data;
    const groups = (Array.isArray(d.groups) ? d.groups : []).filter(inView);
    const tiers = d.tiers.filter((t) => !state.tier || t.id === state.tier);
    const out = [];
    for (const t of tiers) {
      const rows = groups.filter((g) => g.tier === t.id);
      if (!rows.length) continue;
      out.push(el('h3', { text: t.label }), table(rows, 'tiers', 'Models measured on ' + t.label + ' cards', true));
    }
    $('#tiers').replaceChildren(...(out.length ? out : [el('p', { class: 'empty', text: 'No results for this suite and mode yet. Run the benchmark in Almanac and share yours!' })]));
    scatter(groups.filter((g) => !state.tier || g.tier === state.tier));

    const gpuRows = (Array.isArray(d.gpu) ? d.gpu : []).filter(inView);
    const classes = d.gpu_classes.filter((c) => gpuRows.some((r) => r.gpu_class === c.id));
    const sel = $('#f-gpu');
    if (!classes.some((c) => c.id === state.gpu)) state.gpu = classes[0] ? classes[0].id : '';
    sel.replaceChildren(...classes.map((c) => el('option', { value: c.id, text: c.label, selected: c.id === state.gpu })));
    const rows = gpuRows.filter((r) => r.gpu_class === state.gpu);
    $('#gpu').replaceChildren(rows.length ? table(rows, 'gpu', 'Models measured on ' + (classes.find((c) => c.id === state.gpu) || {}).label + ' cards', false) : el('p', { class: 'empty', text: 'No results yet.' }));

    const suite = d.suites.find((s) => s.id + '@' + s.version === state.suite);
    summary(suite ? suite.results + ' results' + DOT + suite.submitters + ' submitters' + DOT + suite.id + ' ' + suite.version + DOT + 'as of ' + new Date(d.generated_at).toLocaleString() : 'no results yet');
  }

  async function load() {
    let d = null;
    try {
      const res = await fetch(BASE + 'leaderboard.json', { headers: { accept: 'application/json' } });
      if (res.ok) d = await res.json();
    } catch (e) {}
    if (!d || !Array.isArray(d.tiers) || !Array.isArray(d.suites)) {
      summary('could not be loaded; try again later');
      $('#tiers').replaceChildren(el('p', { class: 'empty', text: 'The leaderboard could not be loaded.' }));
      return;
    }
    if (!Array.isArray(d.gpu_classes)) d.gpu_classes = [];
    state.data = d;
    $('#method').textContent = str(d.method);
    const suites = d.suites.filter((s) => !s.deprecated && s.results > 0);
    $('#f-suite').replaceChildren(...suites.map((s) => el('option', { value: s.id + '@' + s.version, text: s.id + ' ' + s.version + ' (' + s.results + ')' })));
    const best = suites.slice().sort((a, b) => (b.live_results > 0) - (a.live_results > 0) || b.submitters - a.submitters)[0];
    state.suite = best ? best.id + '@' + best.version : '';
    $('#f-suite').value = state.suite;
    if (best && !best.live_results) { state.mode = 'mock'; $('#f-mode').value = 'mock'; }
    $('#f-tier').append(...d.tiers.map((t) => el('option', { value: t.id, text: t.label })));
    render();
  }

  function start() {
    $('#theme').addEventListener('click', () => {
      const cur = document.documentElement.dataset.theme || '';
      const next = cur === '' ? 'dark' : cur === 'dark' ? 'light' : '';
      set(THEME_KEY, next);
      applyTheme(next);
    });
    applyTheme(document.documentElement.dataset.theme || '');
    $('#f-suite').addEventListener('change', (e) => { state.suite = e.target.value; if (state.data) render(); });
    $('#f-mode').addEventListener('change', (e) => { state.mode = e.target.value; if (state.data) render(); });
    $('#f-tier').addEventListener('change', (e) => { state.tier = e.target.value; if (state.data) render(); });
    $('#f-gpu').addEventListener('change', (e) => { state.gpu = e.target.value; if (state.data) render(); });
    load();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
