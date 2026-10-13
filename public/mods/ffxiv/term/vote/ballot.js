// Generated from imba/public/mods/ffxiv/term/vote/ballot.imba; edit the Imba source.
(() => {
  // ../../../xivmods/ghostty-vote/node_modules/imba/src/imba/runtime.mjs
  var __imba__$ = /* @__PURE__ */ Symbol.for("imba");
  var HAS = {
    SUPERCALLS: 1 << 3,
    CONSTRUCTOR: 1 << 4
  };
  var ClassFlags = {
    IsExtension: 1 << 0,
    IsTag: 1 << 1,
    HasDescriptors: 1 << 2,
    HasSuperCalls: 1 << 3,
    HasConstructor: 1 << 4,
    HasFields: 1 << 5,
    HasMixins: 1 << 6,
    HasInitor: 1 << 7,
    HasDecorators: 1 << 8,
    IsObjectExtension: 1 << 9,
    IsMixin: 1 << 10
  };
  var mmap = /* @__PURE__ */ new Map();
  var state = globalThis[__imba__$] ||= {
    counter: 0,
    classes: mmap
  };
  function iterable$(a) {
    return a?.toIterable?.() || a;
  }
  var sup = {
    cache: {},
    self: null,
    target: null,
    proxy: new Proxy({}, {
      apply: (_, thisArg, args) => {
        return Reflect.apply(sup.target, thisArg, args);
      },
      get: (_, key) => {
        let val = Reflect.get(sup.target, key, sup.self);
        if (val instanceof Function) return val.bind(sup.self);
        return val;
      },
      set: (_, key, value, receiver) => {
        return Reflect.set(sup.target, key, value, sup.self);
      }
    })
  };

  // public/mods/ffxiv/term/vote/ballot.js
  function cursor$1(root) {
    "use strict";
    const VOTES = ["want", "maybe", "skip"];
    const ID_RE = new RegExp("^[a-z0-9][a-z0-9-]{0,63}$", "");
    const NOTE_MAX = 280;
    const TITLE_MAX = 80;
    const DETAIL_MAX = 600;
    const isObject = function(v) {
      return !!v && typeof v === "object" && !Array.isArray(v);
    };
    function normalizeBallot(raw) {
      const out = {};
      if (!isObject(raw)) {
        return out;
      }
      ;
      for (let [id, v] of iterable$(Object.entries(raw))) {
        if (!ID_RE.test(id) || !isObject(v)) {
          continue;
        }
        ;
        const vote = VOTES.includes(v.vote) ? v.vote : "";
        const note = typeof v.note === "string" ? v.note.slice(0, NOTE_MAX) : "";
        if (!vote && !note) {
          continue;
        }
        ;
        out[id] = { vote, note };
        if (Number.isFinite(v.updated_at)) {
          out[id].updated_at = v.updated_at;
        }
        ;
      }
      ;
      return out;
      return;
    }
    ;
    function normalizeSuggestions(raw, keep) {
      if (!Array.isArray(raw)) {
        return [];
      }
      ;
      return raw.filter(
        function(s) {
          return isObject(s) && typeof s.title === "string";
        }
      ).slice(0, keep).map(
        function(s) {
          const out = { title: s.title.slice(0, TITLE_MAX), detail: typeof s.detail === "string" ? s.detail.slice(0, DETAIL_MAX) : "", created_at: Number.isFinite(s.created_at) ? s.created_at : 0 };
          if (Number.isInteger(s.id)) {
            out.id = s.id;
          }
          ;
          return out;
          return;
        }
      );
      return;
    }
    ;
    function mergeBallot(local, server, isBusy) {
      const out = {};
      for (let [id, v] of iterable$(Object.entries(server))) {
        if (!isBusy(id)) {
          out[id] = v;
        }
        ;
      }
      ;
      for (let [id, v] of iterable$(Object.entries(local))) {
        if (isBusy(id)) {
          out[id] = v;
        }
        ;
      }
      ;
      return out;
      return;
    }
    ;
    function ballotLost(serverVotes, serverSuggestions, localVotes, localSuggestions, storedWrite) {
      return !!storedWrite && !Object.keys(serverVotes).length && !serverSuggestions.length && (Object.keys(localVotes).length > 0 || localSuggestions.length > 0);
      return;
    }
    ;
    function noteNeedsRewrite(current, next, focused, drafting) {
      if (drafting || current === next) {
        return false;
      }
      ;
      return !focused || current.trim() !== next.trim();
      return;
    }
    ;
    function mergeSuggestions(server, local, sentIds, keep) {
      const have = new Set(
        server.map(
          function(s) {
            return s.id;
          }
        )
      );
      const extra = local.filter(
        function(s) {
          return sentIds.has(s.id) && !have.has(s.id);
        }
      );
      return server.concat(extra).sort(
        function(a, b) {
          return b.created_at - a.created_at;
        }
      ).slice(0, keep);
      return;
    }
    ;
    function adjustTally(tally, from, to) {
      const t = { want: tally.want | 0, maybe: tally.maybe | 0, skip: tally.skip | 0 };
      if (from !== to) {
        if (VOTES.includes(from)) {
          t[from] = Math.max(0, t[from] - 1);
        }
        ;
        if (VOTES.includes(to)) {
          t[to]++;
        }
        ;
      }
      ;
      return t;
      return;
    }
    ;
    const isTransient = function(err) {
      return !err || !err.status || err.status === 408 || err.status === 429 || err.status >= 500;
    };
    const RETRY_MIN_MS = 1e3;
    const RETRY_MAX_MS = 6e4;
    function retryDelay(attempt, retryAfter) {
      if (Number.isFinite(retryAfter) && retryAfter >= 0) {
        return Math.max(RETRY_MIN_MS, retryAfter * 1e3);
      }
      ;
      return Math.min(RETRY_MAX_MS, RETRY_MIN_MS * Math.pow(2, Math.max(0, attempt - 1)));
      return;
    }
    ;
    function createDebouncer(ms, timers) {
      const waiting = /* @__PURE__ */ new Map();
      const api = {
        schedule: function(key, fn) {
          const cur = waiting.get(key);
          if (cur) {
            timers.clear(cur.handle);
          }
          ;
          waiting.set(
            key,
            {
              fn,
              handle: timers.set(
                function() {
                  waiting.delete(key);
                  fn();
                  return;
                },
                ms
              )
            }
          );
          return;
        },
        fire: function(key) {
          const cur = waiting.get(key);
          if (!cur) {
            return;
          }
          ;
          timers.clear(cur.handle);
          waiting.delete(key);
          cur.fn();
          return;
        },
        fireAll: function() {
          for (let key of [...waiting.keys()]) {
            api.fire(key);
          }
          ;
          return;
        },
        has: function(key) {
          return waiting.has(key);
        }
      };
      return api;
      return;
    }
    ;
    function createSaveQueue(o) {
      const entries = /* @__PURE__ */ new Map();
      let seq = 0;
      let holdUntil = 0;
      const entry = function(id) {
        let e = entries.get(id);
        if (!e) {
          entries.set(id, e = { pending: null, inflight: null, retry: null, attempts: 0, err: null });
        }
        ;
        return e;
        return;
      };
      const idle = function(id, e) {
        if (!e.pending && !e.inflight && !e.retry) {
          entries.delete(id);
        }
        ;
        return;
      };
      function wait(id, e, ms, err) {
        if (e.retry) {
          o.timers.clear(e.retry);
        }
        ;
        e.err = err;
        e.retry = o.timers.set(
          function() {
            e.retry = null;
            pump(id);
            return;
          },
          ms
        );
        o.onStatus(id, "retry", err);
        return;
      }
      ;
      function pump(id, force) {
        const e = entries.get(id);
        if (!e || !e.pending || e.inflight || e.retry) {
          return;
        }
        ;
        const held = holdUntil - o.now();
        if (held > 0 && !force) {
          return wait(id, e, held, { status: 429 });
        }
        ;
        const fields = e.pending;
        const mine = ++seq;
        const keepalive = !!force || !!(o.keepalive && o.keepalive());
        e.pending = null;
        e.inflight = { seq: mine, fields, keepalive };
        o.onStatus(id, "saving");
        let sent;
        try {
          sent = Promise.resolve(o.send(id, fields, { keepalive }));
        } catch (err) {
          sent = Promise.reject(err);
        }
        ;
        sent.then(
          function(data) {
            return done(id, mine, fields, null, data);
          },
          function(err) {
            return done(id, mine, fields, err || {});
          }
        );
        return;
      }
      ;
      function done(id, mine, fields, err, data) {
        const e = entries.get(id);
        if (!e || !e.inflight || e.inflight.seq !== mine) {
          return;
        }
        ;
        e.inflight = null;
        if (!err && !(data && data.ok === true)) {
          err = {};
        }
        ;
        if (!err) {
          e.attempts = 0;
          o.onSaved(id, data, fields);
          if (e.pending) {
            pump(id);
          } else {
            o.onStatus(id, "saved");
          }
          ;
        } else {
          if (isTransient(err)) {
            e.attempts++;
            e.pending = Object.assign({}, fields, e.pending);
            const ms = retryDelay(e.attempts, err.retryAfter);
            if (err.status === 429) {
              holdUntil = Math.max(holdUntil, o.now() + ms);
            }
            ;
            wait(id, e, ms, err);
          } else {
            e.attempts = 0;
            o.onFailed(id, fields, err);
            if (e.pending) {
              pump(id);
            } else {
              o.onStatus(id, "error", err);
            }
            ;
          }
          ;
        }
        ;
        idle(id, e);
        return;
      }
      ;
      return {
        change: function(id, fields) {
          const e = entry(id);
          e.pending = Object.assign(e.pending || {}, fields);
          if (e.inflight) {
            o.onStatus(id, "saving");
          } else {
            if (e.retry) {
              o.onStatus(id, "retry", e.err);
            } else {
              pump(id);
            }
            ;
          }
          ;
          return;
        },
        flush: function(force) {
          for (let [id, e] of [...entries]) {
            if (e.retry) {
              o.timers.clear(e.retry);
              e.retry = null;
            }
            ;
            if (force && e.inflight && (e.pending || !e.inflight.keepalive)) {
              e.pending = Object.assign({}, e.inflight.fields, e.pending);
              e.inflight = null;
            }
            ;
            if (e.pending && !e.inflight) {
              pump(id, force);
            }
            ;
            idle(id, e);
          }
          ;
          return;
        },
        busy: function(id) {
          const e = entries.get(id);
          return !!e && !!(e.pending || e.inflight || e.retry);
          return;
        },
        pending: function(id) {
          const e = entries.get(id);
          return e ? Object.assign({}, e.inflight && e.inflight.fields, e.pending) : null;
          return;
        }
      };
      return;
    }
    ;
    root.GhosttyBallot = Object.freeze({ VOTES, ID_RE, NOTE_MAX, normalizeBallot, normalizeSuggestions, mergeBallot, ballotLost, noteNeedsRewrite, mergeSuggestions, adjustTally, isTransient, retryDelay, createDebouncer, createSaveQueue });
    return;
  }
  cursor$1(globalThis);
})();
