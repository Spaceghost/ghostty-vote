// Ghostty for FFXIV vote page: the ballot logic that has no DOM, loaded before vote.js
// as a plain script (window.GhosttyBallot) and run by tests/ballot.test.js.
// - normalizeBallot / normalizeSuggestions clean data from localStorage or api/mine.
// - mergeBallot lets the server ballot win except where the visitor is still editing.
// - createSaveQueue sends ballot changes: one request in flight per idea, newer fields
//   coalesce into the next request, transient failures retry, and flush() sends
//   what is left with fetch keepalive when the page is hidden or closed.
(function (root) {
  'use strict';
  const VOTES = ['want', 'maybe', 'skip'];
  const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
  const NOTE_MAX = 280, TITLE_MAX = 80, DETAIL_MAX = 600;

  const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

  // {idea_id: {vote: 'want'|'maybe'|'skip'|'', note, updated_at?}}; vote may arrive as
  // null (api/mine) and entries with neither a vote nor a note are dropped.
  function normalizeBallot(raw) {
    const out = {};
    if (!isObject(raw)) return out;
    for (const [id, v] of Object.entries(raw)) {
      if (!ID_RE.test(id) || !isObject(v)) continue;
      const vote = VOTES.includes(v.vote) ? v.vote : '';
      const note = typeof v.note === 'string' ? v.note.slice(0, NOTE_MAX) : '';
      if (!vote && !note) continue;
      out[id] = { vote, note };
      if (Number.isFinite(v.updated_at)) out[id].updated_at = v.updated_at;
    }
    return out;
  }

  function normalizeSuggestions(raw, keep) {
    if (!Array.isArray(raw)) return [];
    return raw.filter((s) => isObject(s) && typeof s.title === 'string').slice(0, keep).map((s) => {
      const out = {
        title: s.title.slice(0, TITLE_MAX),
        detail: typeof s.detail === 'string' ? s.detail.slice(0, DETAIL_MAX) : '',
        created_at: Number.isFinite(s.created_at) ? s.created_at : 0,
      };
      if (Number.isInteger(s.id)) out.id = s.id;
      return out;
    });
  }

  // The server ballot replaces the local one, except for ideas where isBusy(id) says
  // the visitor has an unsaved draft or a save pending: those keep the local entry
  // (or its absence), so nothing being typed or sent is overwritten.
  function mergeBallot(local, server, isBusy) {
    const out = {};
    for (const [id, v] of Object.entries(server)) if (!isBusy(id)) out[id] = v;
    for (const [id, v] of Object.entries(local)) if (isBusy(id)) out[id] = v;
    return out;
  }

  // api/mine came back empty although this page has stored writes and still shows a
  // ballot: the voter cookie did not stick (cookies blocked, or cleared meanwhile), so
  // that empty copy is not this visitor's ballot and must not wipe the page.
  function ballotLost(serverVotes, serverSuggestions, localVotes, localSuggestions, storedWrite) {
    return !!storedWrite && !Object.keys(serverVotes).length && !serverSuggestions.length &&
      (Object.keys(localVotes).length > 0 || localSuggestions.length > 0);
  }

  // Whether a note box showing `current` should be rewritten to `next`. Never while the
  // visitor has unsaved text in it. A focused box is left alone when the two differ only
  // by the whitespace the server trims (the echo of its own save, so the caret does not
  // jump mid-sentence); any other change, from another tab or device, is shown.
  function noteNeedsRewrite(current, next, focused, drafting) {
    if (drafting || current === next) return false;
    return !focused || current.trim() !== next.trim();
  }

  // Server suggestions win; ones sent from this page that the server list does not
  // show yet (sent while api/mine was on its way) are kept. Newest first.
  function mergeSuggestions(server, local, sentIds, keep) {
    const have = new Set(server.map((s) => s.id));
    const extra = local.filter((s) => sentIds.has(s.id) && !have.has(s.id));
    return server.concat(extra).sort((a, b) => b.created_at - a.created_at).slice(0, keep);
  }

  // A tally with one voter's choice moved from `from` to `to` ('' is no vote).
  function adjustTally(tally, from, to) {
    const t = { want: tally.want | 0, maybe: tally.maybe | 0, skip: tally.skip | 0 };
    if (from !== to) {
      if (VOTES.includes(from)) t[from] = Math.max(0, t[from] - 1);
      if (VOTES.includes(to)) t[to]++;
    }
    return t;
  }

  // Network failures (no status), 408, 429 and 5xx are worth retrying; other 4xx are not.
  const isTransient = (err) => !err || !err.status || err.status === 408 || err.status === 429 || err.status >= 500;

  const RETRY_MIN_MS = 1000, RETRY_MAX_MS = 60000;
  // Retry-After (seconds) when the server sent one, else 1s, 2s, 4s ... up to a minute.
  function retryDelay(attempt, retryAfter) {
    if (Number.isFinite(retryAfter) && retryAfter >= 0) return Math.max(RETRY_MIN_MS, retryAfter * 1000);
    return Math.min(RETRY_MAX_MS, RETRY_MIN_MS * Math.pow(2, Math.max(0, attempt - 1)));
  }

  // One timer per key; scheduling again restarts it. fire() runs it now.
  function createDebouncer(ms, timers) {
    const waiting = new Map();
    const api = {
      schedule(key, fn) {
        const cur = waiting.get(key);
        if (cur) timers.clear(cur.handle);
        waiting.set(key, { fn, handle: timers.set(() => { waiting.delete(key); fn(); }, ms) });
      },
      fire(key) {
        const cur = waiting.get(key);
        if (!cur) return;
        timers.clear(cur.handle);
        waiting.delete(key);
        cur.fn();
      },
      fireAll() { for (const key of [...waiting.keys()]) api.fire(key); },
      has: (key) => waiting.has(key),
    };
    return api;
  }

  // Runs tasks one at a time until unlock(), then side by side. A first-time visitor
  // has no voter cookie yet, and two first writes sent together would each be given
  // a different one; after one write has succeeded the cookie is set.
  function createGate() {
    let open = false, tail = Promise.resolve();
    return {
      get open() { return open; },
      unlock() { open = true; },
      run(task) {
        if (open) return task();
        const p = tail.then(task);
        tail = p.catch(() => {});
        return p;
      },
    };
  }

  // o.send(id, fields, {keepalive}) -> Promise of the api/vote response; it rejects
  //   with {status?, retryAfter?} (no status: the network failed).
  // o.onSaved(id, data, fields)   a request succeeded and nothing newer superseded it
  // o.onFailed(id, fields, err)   a request failed for good (not retried)
  // o.onStatus(id, kind, err)     'saving' | 'saved' | 'retry' | 'error'
  // o.keepalive()                 true to send with fetch keepalive, so a request outlives the page
  // o.timers {set, clear}, o.now()
  function createSaveQueue(o) {
    const entries = new Map(); // id -> {pending, inflight: {seq, fields, keepalive}, retry, attempts, err}
    let seq = 0, holdUntil = 0;

    const entry = (id) => {
      let e = entries.get(id);
      if (!e) entries.set(id, (e = { pending: null, inflight: null, retry: null, attempts: 0, err: null }));
      return e;
    };
    const idle = (id, e) => { if (!e.pending && !e.inflight && !e.retry) entries.delete(id); };

    function wait(id, e, ms, err) {
      if (e.retry) o.timers.clear(e.retry);
      e.err = err;
      e.retry = o.timers.set(() => { e.retry = null; pump(id); }, ms);
      o.onStatus(id, 'retry', err);
    }

    function pump(id, force) {
      const e = entries.get(id);
      if (!e || !e.pending || e.inflight || e.retry) return;
      const held = holdUntil - o.now();
      if (held > 0 && !force) return wait(id, e, held, { status: 429 });
      const fields = e.pending, mine = ++seq;
      const keepalive = !!force || !!(o.keepalive && o.keepalive());
      e.pending = null;
      e.inflight = { seq: mine, fields, keepalive };
      o.onStatus(id, 'saving');
      let sent;
      try {
        sent = Promise.resolve(o.send(id, fields, { keepalive }));
      } catch (err) {
        sent = Promise.reject(err);
      }
      sent.then((data) => done(id, mine, fields, null, data), (err) => done(id, mine, fields, err || {}));
    }

    function done(id, mine, fields, err, data) {
      const e = entries.get(id);
      if (!e || !e.inflight || e.inflight.seq !== mine) return; // superseded by a flush
      e.inflight = null;
      if (!err && !(data && data.ok === true)) err = {}; // e.g. a captive portal's HTML
      if (!err) {
        e.attempts = 0;
        o.onSaved(id, data, fields);
        if (e.pending) pump(id); else o.onStatus(id, 'saved');
      } else if (isTransient(err)) {
        e.attempts++;
        e.pending = Object.assign({}, fields, e.pending); // newer fields win
        const ms = retryDelay(e.attempts, err.retryAfter);
        if (err.status === 429) holdUntil = Math.max(holdUntil, o.now() + ms);
        wait(id, e, ms, err);
      } else {
        e.attempts = 0;
        o.onFailed(id, fields, err);
        if (e.pending) pump(id); else o.onStatus(id, 'error', err);
      }
      idle(id, e);
    }

    return {
      // Queue fields ({vote} and/or {note}) for an idea; they merge over anything not yet sent.
      change(id, fields) {
        const e = entry(id);
        e.pending = Object.assign(e.pending || {}, fields);
        if (e.inflight) o.onStatus(id, 'saving');
        else if (e.retry) o.onStatus(id, 'retry', e.err);
        else pump(id);
      },
      // Send everything that is waiting now instead of after its retry delay (still
      // honouring a 429 hold). force (pagehide): the page may be gone before a request
      // in flight answers, so also ignore the hold and send anything newer right away,
      // merged over the request in flight; a request in flight without keepalive is
      // sent again the same way. Sending the same fields twice is harmless.
      flush(force) {
        for (const [id, e] of [...entries]) {
          if (e.retry) { o.timers.clear(e.retry); e.retry = null; }
          if (force && e.inflight && (e.pending || !e.inflight.keepalive)) {
            e.pending = Object.assign({}, e.inflight.fields, e.pending);
            e.inflight = null;
          }
          if (e.pending && !e.inflight) pump(id, force);
          idle(id, e);
        }
      },
      busy(id) {
        const e = entries.get(id);
        return !!e && !!(e.pending || e.inflight || e.retry);
      },
      pending(id) {
        const e = entries.get(id);
        return e ? Object.assign({}, e.inflight && e.inflight.fields, e.pending) : null;
      },
    };
  }

  root.GhosttyBallot = Object.freeze({
    VOTES, ID_RE, NOTE_MAX,
    normalizeBallot, normalizeSuggestions, mergeBallot, ballotLost, noteNeedsRewrite, mergeSuggestions, adjustTally,
    isTransient, retryDelay, createDebouncer, createGate, createSaveQueue,
  });
})(globalThis);
