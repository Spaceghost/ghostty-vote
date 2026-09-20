// Connected apps: approve (or refuse) a device link by its code, and list or disconnect
// the apps already linked to the signed-in account. Everything comes from the gated API
// (api/auth/me, api/device/lookup, api/device/approve, api/apps, api/apps/revoke) and is
// rendered through textContent only. The code may arrive as ?code= from the app's link; it
// survives the sign-in round trip because the sign-in return path keeps it.
(function () {
  'use strict';
  const API = '/mods/ffxiv/term/vote/api/';
  const PAGE = '/mods/ffxiv/term/vote/apps/';
  const CODE_RE = /^[BCDFGHJKLMNPQRSTVWXZ]{4}-[BCDFGHJKLMNPQRSTVWXZ]{4}$/;

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
  const str = (v) => (typeof v === 'string' ? v : '');
  const when = (ms) => (Number.isFinite(ms) && ms > 0 ? new Date(ms).toLocaleDateString() : 'never');

  function cleanCode(raw) {
    const s = str(raw).toUpperCase().replace(/[^A-Z]/g, '');
    const code = s.slice(0, 4) + '-' + s.slice(4);
    return CODE_RE.test(code) ? code : null;
  }

  async function api(name, body) {
    let res = null;
    let data = null;
    try {
      res = await fetch(API + name, {
        method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
        headers: body ? { 'content-type': 'application/json', accept: 'application/json' } : { accept: 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      data = await res.json().catch(() => null);
    } catch (e) {}
    return { ok: !!(res && res.ok), status: res ? res.status : 0, data: data || {} };
  }
  const say = (text) => { $('#link-state').textContent = text; };
  const failure = (r) => str(r.data.message) || (r.status ? 'That did not work (' + r.status + ').' : 'Could not reach the server; try again.');

  let current = null; // the code being asked about

  async function lookup(code) {
    say('checking\u2026');
    $('#ask').hidden = true;
    const r = await api('device/lookup', { user_code: code });
    if (r.status === 401) { signedOut(code); return; }
    if (!r.ok) { say(failure(r)); return; }
    current = code;
    say('');
    $('#ask-text').replaceChildren(el('strong', { text: str(r.data.client_name) }), ' is asking to be linked to your account (code ' + code + '). It will be able to:');
    $('#ask-scopes').replaceChildren(...(Array.isArray(r.data.scopes) ? r.data.scopes : []).map((s) => el('li', { text: str(s.description) })));
    $('#ask').hidden = false;
  }

  async function answer(action) {
    if (!current) return;
    $('#approve').disabled = $('#deny').disabled = true;
    const r = await api('device/approve', { user_code: current, action });
    $('#approve').disabled = $('#deny').disabled = false;
    if (r.status === 401) { signedOut(current); return; }
    if (!r.ok) { say(failure(r)); return; }
    $('#ask').hidden = true;
    $('#code').value = '';
    current = null;
    window.history.replaceState(null, '', PAGE);
    say(action === 'approve'
      ? str(r.data.client_name) + ' is linked. Go back to it: it finishes on its own within a few seconds.'
      : 'Refused. Nothing was linked.');
    if (action === 'approve') window.setTimeout(listApps, 6000); // the app redeems the link on its next poll
  }

  function appRow(a) {
    const tr = el('tr', { class: a.status === 'active' ? null : 'hidden-row' },
      el('td', { text: str(a.client_name) }),
      el('td', { text: (Array.isArray(a.scopes) ? a.scopes : []).join(', ') }),
      el('td', { text: when(a.created_at) }),
      el('td', { text: when(a.last_used_at) }),
      el('td', { text: a.status === 'active' ? 'until ' + when(a.expires_at) : str(a.status) + (a.revoked_by ? ' (' + str(a.revoked_by) + ')' : '') }));
    const cell = el('td', { class: 'row' });
    if (a.status === 'active') {
      const b = el('button', { class: 'btn ghost', type: 'button', text: 'Disconnect' });
      b.addEventListener('click', async () => {
        b.disabled = true;
        const r = await api('apps/revoke', { id: str(a.id) });
        if (!r.ok) { b.disabled = false; say(failure(r)); return; }
        listApps();
      });
      cell.append(b);
    }
    tr.append(cell);
    return tr;
  }

  async function listApps() {
    const r = await api('apps');
    if (r.status === 401) { signedOut(current); return; }
    const apps = Array.isArray(r.data.apps) ? r.data.apps : [];
    $('#whoami').textContent = 'Signed in with ' + (r.data.provider === 'github' ? 'GitHub' : 'FFXIV') + '.';
    if (!apps.length) {
      $('#apps').replaceChildren(el('p', { class: 'empty', text: 'No apps are linked to this account.' }));
      return;
    }
    const head = el('tr', null, ...['App', 'May', 'Linked', 'Last used', 'Status', ''].map((h) => el('th', { text: h })));
    $('#apps').replaceChildren(el('div', { class: 'scroll' }, el('table', { class: 'results' }, el('thead', null, head), el('tbody', null, ...apps.map(appRow)))));
  }

  function signedOut(code) {
    const back = PAGE + (code ? '?code=' + code : '');
    for (const id of ['#signin-github', '#signin-xivauth']) {
      const a = $(id);
      a.setAttribute('href', a.getAttribute('href').split('?')[0] + '?return=' + encodeURIComponent(back));
    }
    $('#signin').hidden = false;
    $('#link').hidden = true;
    $('#apps-section').hidden = true;
  }

  async function start() {
    const code = cleanCode(new URLSearchParams(window.location.search).get('code'));
    const me = await api('auth/me');
    if (!me.ok || !me.data.signed_in) { signedOut(code); return; }
    $('#link').hidden = false;
    $('#apps-section').hidden = false;
    $('#code-form').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const typed = cleanCode($('#code').value);
      if (!typed) { say('That does not look like a code; it is eight letters, like BCDF-GHJK.'); return; }
      lookup(typed);
    });
    $('#approve').addEventListener('click', () => answer('approve'));
    $('#deny').addEventListener('click', () => answer('deny'));
    if (code) { $('#code').value = code; lookup(code); }
    listApps();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
