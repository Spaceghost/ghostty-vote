// The owner's accounts panel: every account that shared a screenshot, submitted a result
// or linked an app, with a ban switch; every linked app's token (never the token itself,
// which the server does not have), with a revoke button; and the bans. Data comes only
// from GET api/admin/accounts (ADMIN_ACCOUNTS); rendered through textContent only.
(function () {
  'use strict';
  const API = '/mods/ffxiv/term/vote/api/';
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
  const when = (ms) => (Number.isFinite(ms) && ms > 0 ? new Date(ms).toLocaleString() : '');
  const short = (account) => str(account).slice(0, 10);
  const summary = (text) => $('#accounts-summary').replaceChildren('$ ', el('b', { text: 'accounts' }), '  ' + text);

  async function post(name, body) {
    try {
      const res = await fetch(API + name, {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, message: str(data.message) || (res.ok ? '' : 'failed (' + res.status + ')') };
    } catch (e) {
      return { ok: false, message: 'could not reach the server' };
    }
  }

  function button(label, run) {
    const b = el('button', { class: 'btn ghost', type: 'button', text: label });
    b.addEventListener('click', async () => {
      b.disabled = true;
      const r = await run();
      if (!r.ok) { b.disabled = false; summary(r.message); return; }
      load();
    });
    return b;
  }

  function table(heads, rows) {
    return el('div', { class: 'scroll' }, el('table', { class: 'results' },
      el('thead', null, el('tr', null, ...heads.map((h) => el('th', { text: h })))), el('tbody', null, ...rows)));
  }

  function accountRow(a) {
    const who = a.character && a.character.name ? str(a.character.name) + (a.character.world ? ' @ ' + str(a.character.world) : '') : '';
    const ban = a.banned
      ? button('Unban', () => post('admin/accounts/ban', { account: str(a.account), banned: false }))
      : button('Ban', () => {
        const reason = window.prompt('Ban ' + str(a.provider) + ' ' + short(a.account) + '? It can no longer write anything and its apps are disconnected. Reason (optional):', '');
        return reason === null ? Promise.resolve({ ok: true }) : post('admin/accounts/ban', { account: str(a.account), provider: str(a.provider), banned: true, reason });
      });
    return el('tr', { class: a.banned ? 'hidden-row' : null },
      el('td', { text: str(a.provider) }), el('td', { text: short(a.account) }), el('td', { text: who }),
      el('td', { text: (a.shots | 0) + ' (' + (a.shots_pending | 0) + ' pending, ' + (a.shots_refused | 0) + ' refused)' }),
      el('td', { text: (a.results | 0) + ' (' + (a.results_hidden | 0) + ' hidden)' }),
      el('td', { text: String(a.tokens | 0) }), el('td', { text: when(a.last_at) }), el('td', { class: 'row' }, ban));
  }

  function tokenRow(t) {
    const cell = el('td', { class: 'row' });
    if (t.status === 'active') cell.append(button('Revoke', () => post('admin/tokens/revoke', { id: str(t.id) })));
    return el('tr', { class: t.status === 'active' ? null : 'hidden-row' },
      el('td', { text: str(t.client_name) }), el('td', { text: str(t.provider) + ' ' + short(t.account) }),
      el('td', { text: (Array.isArray(t.scopes) ? t.scopes : []).join(', ') }), el('td', { text: when(t.created_at) }),
      el('td', { text: when(t.last_used_at) }), el('td', { text: str(t.status) + (t.revoked_by ? ' (' + str(t.revoked_by) + ')' : '') }), cell);
  }

  async function load() {
    let res = null;
    let data = null;
    try {
      res = await fetch(API + 'admin/accounts', { credentials: 'same-origin', cache: 'no-store', headers: { accept: 'application/json' } });
      if (res.ok) data = await res.json();
    } catch (e) {}
    if (!data) { summary(res && (res.status === 401 || res.status === 403) ? 'owner only' : 'could not be loaded'); return; }
    const accounts = Array.isArray(data.accounts) ? data.accounts : [];
    const tokens = Array.isArray(data.tokens) ? data.tokens : [];
    const bans = Array.isArray(data.bans) ? data.bans : [];
    summary(accounts.length + ' accounts, ' + tokens.filter((t) => t.status === 'active').length + ' linked apps, ' + bans.length + ' banned');
    $('#accounts').replaceChildren(
      accounts.length ? table(['Sign-in', 'Account', 'Character', 'Screenshots', 'Results', 'Apps', 'Last', ''], accounts.map(accountRow)) : el('p', { class: 'empty', text: 'No account has sent anything yet.' }));
    $('#tokens').replaceChildren(tokens.length ? table(['App', 'Account', 'May', 'Linked', 'Last used', 'Status', ''], tokens.map(tokenRow)) : el('p', { class: 'empty', text: 'No apps are linked.' }));
    $('#bans').replaceChildren(bans.length
      ? table(['Sign-in', 'Account', 'Reason', 'Since'], bans.map((b) => el('tr', null, el('td', { text: str(b.provider) }), el('td', { text: short(b.account) }), el('td', { text: str(b.reason) }), el('td', { text: when(b.created_at) }))))
      : el('p', { class: 'empty', text: 'Nobody is banned.' }));
  }

  function start() {
    const form = $('#ban-form');
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const r = await post('admin/accounts/ban', { provider: $('#ban-provider').value, id: $('#ban-id').value.trim(), banned: true, reason: $('#ban-reason').value });
      if (!r.ok) { summary(r.message); return; }
      form.reset();
      load();
    });
    load();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
