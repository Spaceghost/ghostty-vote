// Generated from imba/public/mods/ffxiv/term/vote/vote.imba; edit the Imba source.
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

  // public/mods/ffxiv/term/vote/vote.js
  function cursor$1() {
    "use strict";
    const BASE = "/mods/ffxiv/term/vote/";
    const B = window.GhosttyBallot;
    const root = globalThis.document.documentElement;
    const MOD = new RegExp("^[a-z]{1,24}$", "").test(root.dataset.mod || "") ? root.dataset.mod : "ghostty";
    const PAGE = new RegExp("^\\/mods\\/ffxiv\\/[a-z/]{1,40}\\/$", "").test(root.dataset.page || "") ? root.dataset.page : BASE;
    const Q = "?mod=" + MOD;
    const NS = MOD === "ghostty" ? "ghostty-vote:" : "ghostty-vote:" + MOD + ":";
    const KEY = { theme: "ghostty-vote:theme", seen: NS + "seen-version", since: NS + "session-since", votes: NS + "votes", suggestions: NS + "suggestions" };
    function storage(kind) {
      try {
        return window[kind];
      } catch (e) {
        return null;
      }
      ;
      return;
    }
    ;
    function getItem(kind, k) {
      try {
        return (function() {
          let cursor$2 = storage;
          let cursor$3 = void 0;
          cursor$2 = Reflect.apply(cursor$2, cursor$3, [kind]);
          cursor$3 = void 0;
          if (cursor$2 == null) {
            return void 0;
          }
          ;
          cursor$3 = cursor$2;
          cursor$2 = cursor$2.getItem;
          cursor$2 = Reflect.apply(cursor$2, cursor$3, [k]);
          cursor$3 = void 0;
          return cursor$2;
        })() ?? null;
      } catch (e) {
        return null;
      }
      ;
      return;
    }
    ;
    function setItem(kind, k, v) {
      try {
        const cursor$4 = (function() {
          let cursor$5 = storage;
          let cursor$6 = void 0;
          cursor$5 = Reflect.apply(cursor$5, cursor$6, [kind]);
          cursor$6 = void 0;
          if (cursor$5 == null) {
            return void 0;
          }
          ;
          cursor$6 = cursor$5;
          cursor$5 = cursor$5.setItem;
          cursor$5 = Reflect.apply(cursor$5, cursor$6, [k, v]);
          cursor$6 = void 0;
          return cursor$5;
        })();
      } catch (e) {
      }
      ;
      return;
    }
    ;
    function removeItem(kind, k) {
      try {
        const cursor$7 = (function() {
          let cursor$8 = storage;
          let cursor$9 = void 0;
          cursor$8 = Reflect.apply(cursor$8, cursor$9, [kind]);
          cursor$9 = void 0;
          if (cursor$8 == null) {
            return void 0;
          }
          ;
          cursor$9 = cursor$8;
          cursor$8 = cursor$8.removeItem;
          cursor$8 = Reflect.apply(cursor$8, cursor$9, [k]);
          cursor$9 = void 0;
          return cursor$8;
        })();
      } catch (e) {
      }
      ;
      return;
    }
    ;
    const savedTheme = getItem("localStorage", KEY.theme);
    if (savedTheme === "dark" || savedTheme === "light") {
      globalThis.document.documentElement.dataset.theme = savedTheme;
    }
    ;
    if (!B) {
      const broken = function() {
        const m = globalThis.document.getElementById("cats");
        if (m) {
          m.textContent = "Could not load the page script; reload to try again.";
        }
        ;
        return;
      };
      if (globalThis.document.readyState === "loading") {
        globalThis.document.addEventListener("DOMContentLoaded", broken, { once: true });
      } else {
        broken();
      }
      ;
      return;
    }
    ;
    const NOTE_MAX = B.NOTE_MAX;
    const DETAIL_MAX = 600;
    const KEEP_SUGGESTIONS = 50;
    const NOTE_DEBOUNCE_MS = 700;
    const MINE_REFRESH_MS = 30 * 1e3;
    const VOTES = B.VOTES;
    const FEAS = { ready: 0, stretch: 1, research: 2 };
    const EFFORT = { hours: 0, days: 1, weeks: 2 };
    const LABELS = [["want", "Want"], ["maybe", "Maybe"], ["skip", "Skip"]];
    const ELLIPSIS = "\u2026";
    const DOT = " \xB7 ";
    const state2 = { version: 0, categories: [], ideas: [], byId: /* @__PURE__ */ new Map(), talliesOk: false, filter: "all", sort: "catalogue", since: null, open: /* @__PURE__ */ new Set(), votes: {}, saved: {}, drafts: {}, status: {}, touched: {}, writeSeq: 0, mineAt: 0, mineBusy: false, storedWrite: false, suggestions: [], sentIds: /* @__PURE__ */ new Set(), auth: "checking", me: null, legacyBallot: false };
    const canVote = function() {
      return state2.auth === "in" || state2.auth === "offline";
    };
    const query$ = function(s) {
      return globalThis.document.querySelector(s);
    };
    function el(tag, attrs, ...kids) {
      const n = globalThis.document.createElement(tag);
      for (let [k, v] of iterable$(Object.entries(attrs || {}))) {
        if (v === false || v === null || v === void 0) {
          continue;
        }
        ;
        if (k === "class") {
          n.className = v;
        } else {
          if (k === "text") {
            n.textContent = String(v);
          } else {
            n.setAttribute(k, v === true ? "" : String(v));
          }
          ;
        }
        ;
      }
      ;
      for (let k of iterable$(kids)) {
        if (k !== null && k !== void 0 && k !== false) {
          n.append(k);
        }
        ;
      }
      ;
      return n;
      return;
    }
    ;
    async function request(path, init) {
      const res = await fetch((path === "ideas.json" ? PAGE : BASE) + path, { headers: { accept: "application/json" }, ...init });
      let data = null;
      try {
        data = await res.json();
      } catch (e) {
      }
      ;
      if (!res.ok) {
        const err = new Error(data && data.message || "Request failed (" + res.status + ").");
        err.status = res.status;
        const after = (res.headers.get("retry-after") || "").trim();
        if (new RegExp("^\\d{1,6}$", "").test(after)) {
          err.retryAfter = Number(after);
        }
        ;
        throw err;
      }
      ;
      return data;
      return;
    }
    ;
    const post = function(name, body, keepalive) {
      return request("api/" + name, { method: "POST", credentials: "same-origin", keepalive: !!keepalive, headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(body) });
    };
    function errorText(e, offline) {
      if (e && e.status) {
        return e.message;
      }
      ;
      return offline || "Could not reach the server; not saved.";
      return;
    }
    ;
    function readJson(key, fallback) {
      const raw = getItem("localStorage", key);
      if (raw === null) {
        return fallback;
      }
      ;
      try {
        return JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
      ;
      return;
    }
    ;
    const loadVotes = function() {
      return B.normalizeBallot(readJson(KEY.votes, {}));
    };
    const saveVotes = function() {
      return setItem("localStorage", KEY.votes, JSON.stringify(state2.votes));
    };
    const loadSuggestions = function() {
      return B.normalizeSuggestions(readJson(KEY.suggestions, []), KEEP_SUGGESTIONS);
    };
    const saveSuggestions = function() {
      return setItem("localStorage", KEY.suggestions, JSON.stringify(state2.suggestions));
    };
    function setMine(id, vote, note) {
      var $1;
      if (vote || note) {
        state2.votes[id] = { vote, note };
      } else {
        $1 = state2.votes[id], delete state2.votes[id], $1;
      }
      ;
      return;
    }
    ;
    const touch = function(id) {
      state2.touched[id] = ++state2.writeSeq;
      return;
    };
    function applyTheme(t) {
      var $2;
      if (t === "dark" || t === "light") {
        globalThis.document.documentElement.dataset.theme = t;
      } else {
        $2 = globalThis.document.documentElement.dataset.theme, delete globalThis.document.documentElement.dataset.theme, $2;
      }
      ;
      query$("#theme").textContent = "theme: " + (t || "auto");
      return;
    }
    ;
    function computeSince(version) {
      const seenRaw = getItem("localStorage", KEY.seen);
      const seen = seenRaw !== null && new RegExp("^\\d{1,9}$", "").test(seenRaw) ? Number(seenRaw) : null;
      setItem("localStorage", KEY.seen, String(Math.max(version, seen || 0)));
      const q = new URLSearchParams(location.search).get("since");
      if (q !== null && new RegExp("^\\d{1,9}$", "").test(q)) {
        return Number(q);
      }
      ;
      const pinned = getItem("sessionStorage", KEY.since);
      if (pinned !== null && new RegExp("^\\d{1,9}$", "").test(pinned)) {
        return Number(pinned);
      }
      ;
      const since = seen === null ? version : seen;
      setItem("sessionStorage", KEY.since, String(since));
      return since;
      return;
    }
    ;
    const isNew = function(i) {
      return state2.since !== null && i.added_version > state2.since;
    };
    function myCounts() {
      const t = { want: 0, maybe: 0, skip: 0 };
      for (let i of iterable$(state2.ideas)) {
        const v = (function() {
          let cursor$10 = state2;
          let cursor$11 = void 0;
          cursor$11 = cursor$10;
          cursor$10 = cursor$10.votes;
          cursor$11 = cursor$10;
          cursor$10 = cursor$10[i.id];
          if (cursor$10 == null) {
            return void 0;
          }
          ;
          cursor$11 = cursor$10;
          cursor$10 = cursor$10.vote;
          return cursor$10;
        })();
        if (Reflect.has(t, v)) {
          t[v]++;
        }
        ;
      }
      ;
      return t;
      return;
    }
    ;
    function renderTally() {
      const t = myCounts();
      const total = state2.ideas.length;
      const done = t.want + t.maybe + t.skip;
      const open = total - done;
      query$("#tally").replaceChildren("$ ", el("b", { text: "vote" }), " --mine  ", el("span", { class: "w", text: "want " + t.want }), DOT, el("span", { class: "m", text: "maybe " + t.maybe }), DOT, el("span", { class: "s", text: "skip " + t.skip }), DOT, el("span", { class: "u", text: "open " + open }), " of " + total + " " + DOT + " catalogue v" + state2.version);
      query$("#progress").style.width = total ? (100 * done / total).toFixed(1) + "%" : "0";
      for (let chip of iterable$(globalThis.document.querySelectorAll('.chip[data-filter="unvoted"]'))) {
        chip.replaceChildren("Not voted", el("span", { class: "n", text: open }));
      }
      ;
      return;
    }
    ;
    function visible(i) {
      const v = (function() {
        let cursor$12 = state2;
        let cursor$13 = void 0;
        cursor$13 = cursor$12;
        cursor$12 = cursor$12.votes;
        cursor$13 = cursor$12;
        cursor$12 = cursor$12[i.id];
        if (cursor$12 == null) {
          return void 0;
        }
        ;
        cursor$13 = cursor$12;
        cursor$12 = cursor$12.vote;
        return cursor$12;
      })();
      switch (state2.filter) {
        case "unvoted": {
          return !v;
          break;
        }
        case "new": {
          return isNew(i);
          break;
        }
        case "top": {
          return i.top_pick;
          break;
        }
        case "world": {
          return i.in_world;
          break;
        }
        case "want": {
          return v === "want";
          break;
        }
        default:
          return true;
      }
      ;
      return;
    }
    ;
    function sorted(list) {
      const by = state2.sort;
      return [...list].sort(
        function(a, b) {
          if (by === "wow") {
            return b.wow - a.wow || a.order - b.order;
          }
          ;
          if (by === "wanted") {
            return b.tally.want - a.tally.want || b.tally.maybe - a.tally.maybe || a.order - b.order;
          }
          ;
          if (by === "feas") {
            return (FEAS[a.feasibility] ?? 9) - (FEAS[b.feasibility] ?? 9) || b.wow - a.wow;
          }
          ;
          if (by === "effort") {
            return (EFFORT[a.effort] ?? 9) - (EFFORT[b.effort] ?? 9) || b.wow - a.wow;
          }
          ;
          return a.order - b.order;
          return;
        }
      );
      return;
    }
    ;
    function tallyNode(i) {
      const { want, maybe, skip } = i.tally;
      const total = want + maybe + skip;
      const wrap = el("div", { class: "tally", id: "tally-" + i.id });
      const bar = el("div", { class: "tbar", "aria-hidden": "true" });
      for (let [cls, n] of [["w", want], ["m", maybe], ["s", skip]]) {
        const seg = el("i", { class: cls });
        seg.style.width = total ? (100 * n / total).toFixed(2) + "%" : "0";
        bar.append(seg);
      }
      ;
      let line;
      if (total) {
        line = el("span", null, "everyone: ", el("span", { class: "w", text: want + " want" }), DOT, el("span", { class: "m", text: maybe + " maybe" }), DOT, el("span", { class: "s", text: skip + " skip" }));
      } else {
        line = el("span", { text: state2.talliesOk ? "everyone: no votes yet" : "everyone: tallies unavailable right now" });
      }
      ;
      wrap.append(bar, line);
      return wrap;
      return;
    }
    ;
    const NOTE_PLACEHOLDER = "A note for the plan (optional, only the maintainer sees it)";
    const NOTE_SIGNED_OUT = "Sign in to leave a note";
    function cueOf(vote) {
      if (state2.auth === "out") {
        return ["cue open", vote ? "your vote \xB7 sign in to change it" : "sign in to vote"];
      }
      ;
      return vote ? ["cue", "your vote"] : ["cue open", "not voted yet"];
      return;
    }
    ;
    function card(i) {
      const mine = state2.votes[i.id];
      const vote = (function() {
        let cursor$14 = mine;
        let cursor$15 = void 0;
        if (cursor$14 == null) {
          return void 0;
        }
        ;
        cursor$15 = cursor$14;
        cursor$14 = cursor$14.vote;
        return cursor$14;
      })() || "";
      const a = el("article", { class: "idea", "data-vote": vote, id: "idea-" + i.id, "aria-labelledby": "h-" + i.id });
      a.append(el("h3", { id: "h-" + i.id, text: i.title }), el("p", { class: "pitch", text: i.pitch }));
      const meta = el("div", { class: "meta" });
      if (isNew(i)) {
        meta.append(el("span", { class: "tag new", text: "new" }));
      }
      ;
      if (i.top_pick) {
        meta.append(el("span", { class: "tag top", text: "top pick" }));
      }
      ;
      if (i.in_world) {
        meta.append(el("span", { class: "tag world", text: "in-world" }));
      }
      ;
      if (i.feasibility) {
        meta.append(el("span", { class: "tag feas-" + i.feasibility, text: i.feasibility }));
      }
      ;
      if (i.effort) {
        meta.append(el("span", { class: "tag", text: i.effort }));
      }
      ;
      const wow = el("span", { class: "wow", role: "img", title: "wow " + i.wow + "/10", "aria-label": "wow " + i.wow + " of 10" });
      let cursor$16 = 1;
      while (cursor$16 <= 10) {
        wow.append(el("i", { class: cursor$16 <= i.wow ? "on" : "" }));
        cursor$16++;
      }
      ;
      meta.append(wow);
      a.append(meta, tallyNode(i));
      const [cueClass, cueText] = cueOf(vote);
      a.append(el("span", { id: "cue-" + i.id, class: cueClass, text: cueText }));
      const vr = el("div", { class: "vote", role: "group", "aria-label": "Your vote on " + i.title });
      for (let [v, label] of iterable$(LABELS)) {
        const b = el("button", { type: "button", id: "v-" + v + "-" + i.id, "data-v": v, "aria-pressed": String(vote === v), text: label, "aria-disabled": canVote() ? false : "true" });
        b.addEventListener(
          "click",
          function() {
            return castVote(i.id, v);
          }
        );
        vr.append(b);
      }
      ;
      a.append(vr);
      const d = el("details", { open: state2.open.has(i.id) });
      d.addEventListener(
        "toggle",
        function() {
          if (d.open) {
            state2.open.add(i.id);
          } else {
            state2.open.delete(i.id);
          }
          ;
          return;
        }
      );
      d.append(el("summary", { text: "the moment" + DOT + "how" + DOT + "risks" }));
      for (let [k, v] of [["the moment", i.experience], ["how it would work", i.how], ["risks", i.risks], ["for", i.audience]]) {
        if (v) {
          d.append(el("span", { class: "k", text: k }), el("p", { text: v }));
        }
        ;
      }
      ;
      a.append(d);
      const draft = state2.drafts[i.id];
      const ta = el("textarea", { id: "note-" + i.id, rows: "2", maxlength: String(NOTE_MAX), placeholder: canVote() ? NOTE_PLACEHOLDER : NOTE_SIGNED_OUT, "aria-label": "Note on " + i.title, disabled: !canVote() });
      ta.value = draft !== void 0 ? draft : (function() {
        let cursor$17 = mine;
        let cursor$18 = void 0;
        if (cursor$17 == null) {
          return void 0;
        }
        ;
        cursor$18 = cursor$17;
        cursor$17 = cursor$17.note;
        return cursor$17;
      })() || "";
      const st = el("span", { id: "note-state-" + i.id, text: state2.status[i.id] || "" });
      const count = el("span", { id: "note-count-" + i.id, text: ta.value.length + " / " + NOTE_MAX });
      ta.addEventListener(
        "input",
        function() {
          state2.drafts[i.id] = ta.value;
          count.textContent = ta.value.length + " / " + NOTE_MAX;
          setStatus(i.id, ELLIPSIS);
          notes.schedule(
            i.id,
            function() {
              return commitNote(i.id);
            }
          );
          return;
        }
      );
      ta.addEventListener(
        "blur",
        function() {
          return notes.fire(i.id);
        }
      );
      a.append(ta, el("div", { class: "note-row" }, st, count));
      return a;
      return;
    }
    ;
    function syncCard(i) {
      if (!globalThis.document.getElementById("idea-" + i.id)) {
        return;
      }
      ;
      const mine = state2.votes[i.id];
      const vote = (function() {
        let cursor$19 = mine;
        let cursor$20 = void 0;
        if (cursor$19 == null) {
          return void 0;
        }
        ;
        cursor$20 = cursor$19;
        cursor$19 = cursor$19.vote;
        return cursor$19;
      })() || "";
      globalThis.document.getElementById("idea-" + i.id).setAttribute("data-vote", vote);
      const cue = globalThis.document.getElementById("cue-" + i.id);
      if (cue) {
        [cue.className, cue.textContent] = cueOf(vote);
      }
      ;
      for (let [v] of iterable$(LABELS)) {
        const cursor$21 = (function() {
          let cursor$22 = globalThis.document;
          let cursor$23 = void 0;
          cursor$23 = cursor$22;
          cursor$22 = cursor$22.getElementById;
          cursor$22 = Reflect.apply(cursor$22, cursor$23, ["v-" + v + "-" + i.id]);
          cursor$23 = void 0;
          if (cursor$22 == null) {
            return void 0;
          }
          ;
          cursor$23 = cursor$22;
          cursor$22 = cursor$22.setAttribute;
          cursor$22 = Reflect.apply(cursor$22, cursor$23, ["aria-pressed", String(vote === v)]);
          cursor$23 = void 0;
          return cursor$22;
        })();
      }
      ;
      const cursor$24 = (function() {
        let cursor$25 = globalThis.document;
        let cursor$26 = void 0;
        cursor$26 = cursor$25;
        cursor$25 = cursor$25.getElementById;
        cursor$25 = Reflect.apply(cursor$25, cursor$26, ["tally-" + i.id]);
        cursor$26 = void 0;
        if (cursor$25 == null) {
          return void 0;
        }
        ;
        cursor$26 = cursor$25;
        cursor$25 = cursor$25.replaceWith;
        cursor$25 = Reflect.apply(cursor$25, cursor$26, [tallyNode(i)]);
        cursor$26 = void 0;
        return cursor$25;
      })();
      const ta = globalThis.document.getElementById("note-" + i.id);
      const note = (function() {
        let cursor$27 = mine;
        let cursor$28 = void 0;
        if (cursor$27 == null) {
          return void 0;
        }
        ;
        cursor$28 = cursor$27;
        cursor$27 = cursor$27.note;
        return cursor$27;
      })() || "";
      if (ta && B.noteNeedsRewrite(ta.value, note, ta === globalThis.document.activeElement, state2.drafts[i.id] !== void 0)) {
        ta.value = note;
        const count = globalThis.document.getElementById("note-count-" + i.id);
        if (count) {
          count.textContent = note.length + " / " + NOTE_MAX;
        }
        ;
      }
      ;
      const st = globalThis.document.getElementById("note-state-" + i.id);
      if (st) {
        st.textContent = state2.status[i.id] || "";
      }
      ;
      return;
    }
    ;
    function withFocus(fn) {
      const active = globalThis.document.activeElement;
      const id = (function() {
        let cursor$29 = active;
        let cursor$30 = void 0;
        if (cursor$29 == null) {
          return void 0;
        }
        ;
        cursor$30 = cursor$29;
        cursor$29 = cursor$29.id;
        return cursor$29;
      })();
      const range = active instanceof HTMLTextAreaElement ? [active.selectionStart, active.selectionEnd] : null;
      fn();
      if (!id || (function() {
        let cursor$31 = globalThis.document;
        let cursor$32 = void 0;
        cursor$32 = cursor$31;
        cursor$31 = cursor$31.activeElement;
        if (cursor$31 == null) {
          return void 0;
        }
        ;
        cursor$32 = cursor$31;
        cursor$31 = cursor$31.id;
        return cursor$31;
      })() === id) {
        return;
      }
      ;
      const next = globalThis.document.getElementById(id);
      if (!next) {
        return;
      }
      ;
      next.focus({ preventScroll: true });
      if (range && next instanceof HTMLTextAreaElement) {
        try {
          next.setSelectionRange(range[0], range[1]);
        } catch (e) {
        }
        ;
      }
      ;
      return;
    }
    ;
    function render() {
      renderTally();
      const root2 = query$("#cats");
      if (!state2.ideas.length) {
        root2.replaceChildren(el("p", { class: "empty", text: "No ideas are open for voting yet." }));
        return;
      }
      ;
      withFocus(
        function() {
          root2.replaceChildren();
          const byCat = /* @__PURE__ */ new Map();
          for (let i of iterable$(state2.ideas)) {
            if (!byCat.has(i.category)) {
              byCat.set(i.category, []);
            }
            ;
            byCat.get(i.category).push(i);
          }
          ;
          for (let c of iterable$(state2.categories)) {
            const list = sorted((byCat.get(c.name) || []).filter(visible));
            if (!list.length) {
              continue;
            }
            ;
            const sec = el("section", { class: "cat", "aria-label": c.name });
            sec.append(el("div", { class: "cat-head" }, el("h2", { text: c.name }), c.tagline ? el("p", { text: c.tagline }) : null));
            const g = el("div", { class: "grid" });
            for (let i of iterable$(list)) {
              g.append(card(i));
            }
            ;
            sec.append(g);
            root2.append(sec);
          }
          ;
          if (!root2.children.length) {
            const msg = state2.filter === "unvoted" ? "You have voted on every idea. Thank you!" : "Nothing matches this filter yet.";
            root2.append(el("p", { class: "empty", text: msg }));
          }
          ;
          return;
        }
      );
      return;
    }
    ;
    function refresh(id) {
      renderTally();
      const idea = state2.byId.get(id);
      if (!idea) {
        return;
      }
      ;
      if (!!globalThis.document.getElementById("idea-" + id) !== visible(idea)) {
        return render();
      }
      ;
      syncCard(idea);
      return;
    }
    ;
    function applyBallot(next, adjustTallies) {
      const prev = state2.votes;
      state2.votes = next;
      if (!state2.ideas.length) {
        return;
      }
      ;
      let again = false;
      for (let i of iterable$(state2.ideas)) {
        const a = prev[i.id] || { vote: "", note: "" };
        const b = next[i.id] || { vote: "", note: "" };
        if (a.vote === b.vote && a.note === b.note) {
          continue;
        }
        ;
        if (adjustTallies) {
          i.tally = B.adjustTally(i.tally, a.vote, b.vote);
        }
        ;
        if (!!globalThis.document.getElementById("idea-" + i.id) !== visible(i)) {
          again = true;
        } else {
          syncCard(i);
        }
        ;
      }
      ;
      renderTally();
      if (again) {
        render();
      }
      ;
      return;
    }
    ;
    function renderNewBanner() {
      const n = state2.ideas.filter(isNew).length;
      const chip = query$('.chip[data-filter="new"]');
      chip.hidden = n === 0;
      if (n) {
        chip.replaceChildren("New", el("span", { class: "n", text: n }));
      }
      ;
      query$("#new-banner").hidden = n === 0;
      if (n) {
        query$("#new-text").textContent = (n === 1 ? "1 idea has" : n + " ideas have") + " been added since catalogue v" + state2.since + ". They are marked new.";
      }
      ;
      return;
    }
    ;
    function renderSuggestions() {
      const g = query$("#suggestions");
      g.replaceChildren();
      for (let s of iterable$(state2.suggestions)) {
        const a = el("article", { class: "idea" });
        a.append(el("h3", { text: s.title }));
        if (s.detail) {
          a.append(el("p", { class: "pitch", text: s.detail }));
        }
        ;
        const when = s.created_at ? new Date(s.created_at).toLocaleDateString() : "";
        a.append(el("div", { class: "meta" }, el("span", { class: "tag world", text: "your suggestion" }), el("span", { class: "tag", text: when ? "sent " + when : "sent" })));
        g.append(a);
      }
      ;
      return;
    }
    ;
    const timers = {
      set: function(fn, ms) {
        return setTimeout(fn, ms);
      },
      clear: function(h) {
        return clearTimeout(h);
      }
    };
    const notes = B.createDebouncer(NOTE_DEBOUNCE_MS, timers);
    const queue = B.createSaveQueue(
      {
        timers,
        now: function() {
          return Date.now();
        },
        keepalive: function() {
          return true;
        },
        send: function(id, fields, opts) {
          return post("vote", { idea_id: id, ...fields }, opts.keepalive);
        },
        onSaved,
        onFailed,
        onStatus
      }
    );
    const isBusy = function(id) {
      return state2.drafts[id] !== void 0 || notes.has(id) || queue.busy(id);
    };
    function setStatus(id, text) {
      state2.status[id] = text;
      const st = globalThis.document.getElementById("note-state-" + id);
      if (st) {
        st.textContent = text;
      }
      ;
      return;
    }
    ;
    function onStatus(id, kind, err) {
      if (kind === "saving") {
        return setStatus(id, "saving" + ELLIPSIS);
      }
      ;
      if (kind === "saved") {
        return setStatus(id, notes.has(id) ? ELLIPSIS : "saved");
      }
      ;
      if (kind === "error") {
        return setStatus(id, errorText(err));
      }
      ;
      const why = !err || !err.status ? "offline" : err.status === 429 ? "busy" : "server error";
      setStatus(id, why + "; will retry" + ELLIPSIS);
      return;
    }
    ;
    function castVote(id, v) {
      const idea = state2.byId.get(id);
      if (!idea) {
        return;
      }
      ;
      if (!canVote()) {
        if (state2.auth === "out") {
          promptSignIn();
        }
        ;
        return;
      }
      ;
      const cur = state2.votes[id] || { vote: "", note: "" };
      const next = cur.vote === v ? "" : v;
      idea.tally = B.adjustTally(idea.tally, cur.vote, next);
      setMine(id, next, cur.note);
      touch(id);
      refresh(id);
      queue.change(id, { vote: next || null });
      return;
    }
    ;
    function commitNote(id) {
      var $3;
      const text = state2.drafts[id];
      $3 = state2.drafts[id], delete state2.drafts[id], $3;
      if (text === void 0) {
        return;
      }
      ;
      const cur = state2.votes[id] || { vote: "", note: "" };
      if (text === cur.note) {
        setStatus(id, queue.busy(id) ? "saving" + ELLIPSIS : "");
        return;
      }
      ;
      setMine(id, cur.vote, text);
      touch(id);
      queue.change(id, { note: text });
      return;
    }
    ;
    function onSaved(id, data) {
      state2.storedWrite = true;
      const vote = VOTES.includes(data.vote) ? data.vote : "";
      const note = typeof data.note === "string" ? data.note : "";
      state2.saved[id] = { vote, note };
      touch(id);
      if (!isBusy(id)) {
        setMine(id, vote, note);
      }
      ;
      const idea = state2.byId.get(id);
      if (idea && data.tally) {
        idea.tally = B.adjustTally(
          data.tally,
          vote,
          (function() {
            let cursor$33 = state2;
            let cursor$34 = void 0;
            cursor$34 = cursor$33;
            cursor$33 = cursor$33.votes;
            cursor$34 = cursor$33;
            cursor$33 = cursor$33[id];
            if (cursor$33 == null) {
              return void 0;
            }
            ;
            cursor$34 = cursor$33;
            cursor$33 = cursor$33.vote;
            return cursor$33;
          })() || ""
        );
      }
      ;
      saveVotes();
      refresh(id);
      return;
    }
    ;
    function onFailed(id, fields, err) {
      if (err && err.status === 401) {
        signedOutMidway();
      }
      ;
      if (!Reflect.has(fields, "vote") || Reflect.has(queue.pending(id) || {}, "vote")) {
        return;
      }
      ;
      const cur = state2.votes[id] || { vote: "", note: "" };
      const back = (function() {
        let cursor$35 = state2;
        let cursor$36 = void 0;
        cursor$36 = cursor$35;
        cursor$35 = cursor$35.saved;
        cursor$36 = cursor$35;
        cursor$35 = cursor$35[id];
        if (cursor$35 == null) {
          return void 0;
        }
        ;
        cursor$36 = cursor$35;
        cursor$35 = cursor$35.vote;
        return cursor$35;
      })() || "";
      const idea = state2.byId.get(id);
      if (idea) {
        idea.tally = B.adjustTally(idea.tally, cur.vote, back);
      }
      ;
      setMine(id, back, cur.note);
      touch(id);
      saveVotes();
      refresh(id);
      return;
    }
    ;
    async function loadMine() {
      var $4;
      if (state2.mineBusy) {
        return;
      }
      ;
      state2.mineBusy = true;
      state2.mineAt = Date.now();
      const since = state2.writeSeq;
      let data = null;
      try {
        data = await request("api/mine" + Q, { credentials: "same-origin", cache: "no-store" });
      } catch (e) {
        data = null;
      } finally {
        state2.mineBusy = false;
      }
      ;
      if (!data || typeof data !== "object") {
        return;
      }
      ;
      if (data.signed_in === false) {
        signedOutMidway();
        return;
      }
      ;
      const votes = B.normalizeBallot(data.votes);
      const suggestions = B.normalizeSuggestions(data.suggestions, KEEP_SUGGESTIONS);
      if (B.ballotLost(votes, suggestions, state2.votes, state2.suggestions, state2.storedWrite)) {
        return;
      }
      ;
      const keepLocal = function(id) {
        return isBusy(id) || (state2.touched[id] || 0) > since;
      };
      const saved = { ...votes };
      for (let id of iterable$(Object.keys(state2.touched))) {
        if (state2.touched[id] > since) {
          if (state2.saved[id]) {
            saved[id] = state2.saved[id];
          } else {
            $4 = saved[id], delete saved[id], $4;
          }
          ;
        }
        ;
      }
      ;
      state2.saved = saved;
      applyBallot(B.mergeBallot(state2.votes, votes, keepLocal), false);
      saveVotes();
      state2.suggestions = B.mergeSuggestions(suggestions, state2.suggestions, state2.sentIds, KEEP_SUGGESTIONS);
      saveSuggestions();
      renderSuggestions();
      return;
    }
    ;
    const AUTH_ERRORS = { denied: "Sign-in was cancelled.", expired: "Sign-in took too long, or this browser blocked its cookie. Please try again.", state: "That sign-in could not be verified. Please try again.", provider: "GitHub or XIVAuth did not answer as expected. Please try again in a moment.", "not-configured": "Sign-in is not set up yet.", "sign-in-first": "Sign in first, then link a character.", "no-character": "No character was shared, so nothing was linked. Pick a verified character on XIVAuth to link it.", refused: "Start sign-in from the buttons on this page.", "bad-request": "Sign-in failed. Please try again.", server: "Sign-in worked, but the site could not start your session. Please try again in a minute." };
    function authFragmentMessage() {
      const h = location.hash;
      let msg = null;
      if (h === "#signed-in") {
        msg = "";
      } else {
        if (h === "#character-linked") {
          msg = "Character linked.";
        } else {
          const m = new RegExp("^#auth-error=([a-z-]{1,32})$", "").exec(h);
          if (m) {
            msg = Object.hasOwn(AUTH_ERRORS, m[1]) ? AUTH_ERRORS[m[1]] : AUTH_ERRORS["bad-request"];
          }
          ;
        }
        ;
      }
      ;
      if (msg !== null) {
        try {
          history.replaceState(null, "", location.pathname + location.search);
        } catch (e) {
        }
        ;
      }
      ;
      return msg;
      return;
    }
    ;
    function setNotice(text) {
      query$("#account-notice").textContent = text || "";
      return;
    }
    ;
    function renderAccount() {
      const out = state2.auth === "out";
      const me = state2.me;
      query$("#signed-out").hidden = !out;
      query$("#signed-in").hidden = !(state2.auth === "in" && me);
      const back = "?return=" + encodeURIComponent(location.pathname + location.search);
      query$("#signin-github").href = BASE + "api/auth/github/start" + back;
      query$("#signin-xivauth").href = BASE + "api/auth/xivauth/start" + back;
      query$("#link-character").href = BASE + "api/auth/xivauth/link" + back;
      query$("#signed-out-text").textContent = state2.legacyBallot ? "Sign in to keep voting. The votes you made in this browser before sign-in move to your account." : "Sign in to vote: one ballot per account. Anyone can read the tallies.";
      if (!me) {
        return;
      }
      ;
      const c = me.character;
      const via = me.provider === "github" ? "GitHub" : "FFXIV";
      query$("#who").textContent = c ? "Signed in with " + via + " as " + c.name + (c.world ? " @ " + c.world : "") : "Signed in with " + via;
      const img = query$("#who-portrait");
      img.hidden = !(c && c.portrait_url);
      if (c && c.portrait_url) {
        img.src = c.portrait_url;
      } else {
        img.removeAttribute("src");
      }
      ;
      query$("#link-character").hidden = !!c;
      query$("#link-disclosure").hidden = !!c;
      query$("#forget-character").hidden = !c;
      query$("#admin-link").hidden = !me.admin;
      return;
    }
    ;
    function renderSuggestForm() {
      const on = canVote();
      query$("#s-title").disabled = !on;
      query$("#s-detail").disabled = !on;
      query$("#s-send").setAttribute("aria-disabled", String(!on));
      return;
    }
    ;
    function applyAuth() {
      renderAccount();
      renderSuggestForm();
      if (state2.ideas.length) {
        render();
      }
      ;
      return;
    }
    ;
    function forgetLocalBallot() {
      removeItem("localStorage", KEY.votes);
      removeItem("localStorage", KEY.suggestions);
      state2.saved = {};
      state2.suggestions = [];
      renderSuggestions();
      applyBallot({}, false);
      return;
    }
    ;
    function promptSignIn() {
      setNotice("Sign in with GitHub or FFXIV to vote.");
      const target = query$("#signin-github");
      target.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: no-preference)").matches ? "smooth" : "auto" });
      target.focus({ preventScroll: true });
      return;
    }
    ;
    function signedOutMidway() {
      if (state2.auth === "out") {
        return;
      }
      ;
      state2.auth = "out";
      state2.me = null;
      applyAuth();
      setNotice("You are signed out. Sign in again to keep voting.");
      return;
    }
    ;
    async function loadAuth() {
      let me = null;
      try {
        me = await request("api/auth/me", { credentials: "same-origin", cache: "no-store" });
      } catch (e) {
        me = null;
      }
      ;
      if (!me || typeof me !== "object") {
        state2.auth = "offline";
      } else {
        if (me.signed_in === true) {
          state2.auth = "in";
          const c = me.character && typeof me.character === "object" && typeof me.character.name === "string" ? me.character : null;
          state2.me = { provider: me.provider === "xivauth" ? "xivauth" : "github", character: c && { name: c.name, world: typeof c.world === "string" ? c.world : "", portrait_url: new RegExp("^https:\\/\\/", "").test(c.portrait_url) ? c.portrait_url : "" }, admin: me.admin === true };
        } else {
          state2.auth = "out";
          state2.me = null;
          state2.legacyBallot = me.legacy_ballot === true;
          if (!state2.legacyBallot) {
            forgetLocalBallot();
          }
          ;
        }
        ;
      }
      ;
      applyAuth();
      return;
    }
    ;
    async function logout() {
      query$("#logout").disabled = true;
      try {
        await post("auth/logout", {});
        state2.auth = "out";
        state2.me = null;
        state2.legacyBallot = false;
        forgetLocalBallot();
        applyAuth();
        setNotice("Signed out.");
      } catch (err) {
        setNotice(errorText(err));
      } finally {
        query$("#logout").disabled = false;
      }
      ;
      return;
    }
    ;
    async function forgetCharacter() {
      const b = query$("#forget-character");
      b.disabled = true;
      try {
        await post("auth/character/forget", {});
        if (state2.me) {
          state2.me.character = null;
        }
        ;
        renderAccount();
        setNotice("Character forgotten. Your votes stay.");
        query$("#logout").focus();
      } catch (err) {
        if (err.status === 401) {
          signedOutMidway();
        } else {
          setNotice(errorText(err));
        }
        ;
      } finally {
        b.disabled = false;
      }
      ;
      return;
    }
    ;
    function setFilter(f) {
      state2.filter = f;
      for (let c of iterable$(globalThis.document.querySelectorAll(".chip[data-filter]"))) {
        c.setAttribute("aria-pressed", String(c.dataset.filter === f));
      }
      ;
      render();
      return;
    }
    ;
    function wireControls() {
      query$("#theme").addEventListener(
        "click",
        function() {
          const cur = globalThis.document.documentElement.dataset.theme || "";
          const next = cur === "" ? "dark" : cur === "dark" ? "light" : "";
          setItem("localStorage", KEY.theme, next);
          applyTheme(next);
          return;
        }
      );
      applyTheme(globalThis.document.documentElement.dataset.theme || "");
      for (let b of iterable$(globalThis.document.querySelectorAll(".chip[data-filter]"))) {
        b.addEventListener(
          "click",
          function() {
            return setFilter(b.dataset.filter);
          }
        );
      }
      ;
      query$("#new-show").addEventListener(
        "click",
        function() {
          setFilter("new");
          query$("#cats").scrollIntoView({ block: "start" });
          return;
        }
      );
      query$("#sort").addEventListener(
        "change",
        function(e) {
          state2.sort = e.target.value;
          render();
          return;
        }
      );
      query$("#next-open").addEventListener(
        "click",
        function() {
          const cards = [...globalThis.document.querySelectorAll('article.idea[data-vote=""]')];
          query$("#next-open").textContent = cards.length ? "Next unvoted \u2193" : "All voted \u2713";
          if (!cards.length) {
            return;
          }
          ;
          const target = cards.find(
            function(c) {
              return c.getBoundingClientRect().top > 120;
            }
          ) || cards[0];
          const smooth = window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
          target.scrollIntoView({ block: "center", behavior: smooth ? "smooth" : "auto" });
          const cursor$37 = (function() {
            let cursor$38 = target;
            let cursor$39 = void 0;
            cursor$39 = cursor$38;
            cursor$38 = cursor$38.querySelector;
            cursor$38 = Reflect.apply(cursor$38, cursor$39, [".vote button"]);
            cursor$39 = void 0;
            if (cursor$38 == null) {
              return void 0;
            }
            ;
            cursor$39 = cursor$38;
            cursor$38 = cursor$38.focus;
            cursor$38 = Reflect.apply(cursor$38, cursor$39, [{ preventScroll: true }]);
            cursor$39 = void 0;
            return cursor$38;
          })();
          return;
        }
      );
      query$("#logout").addEventListener("click", logout);
      query$("#forget-character").addEventListener("click", forgetCharacter);
      const sTitle = query$("#s-title");
      const sDetail = query$("#s-detail");
      const sState = query$("#s-state");
      const sSend = query$("#s-send");
      sDetail.addEventListener(
        "input",
        function() {
          query$("#s-count").textContent = sDetail.value.length + " / " + DETAIL_MAX;
          return;
        }
      );
      query$("#suggest").addEventListener(
        "submit",
        async function(e) {
          e.preventDefault();
          if (!canVote()) {
            sState.textContent = state2.auth === "out" ? "Sign in to send a suggestion." : "";
            if (state2.auth === "out") {
              promptSignIn();
            }
            ;
            return;
          }
          ;
          const title = sTitle.value.trim();
          const detail = sDetail.value.trim();
          if (title.length < 3) {
            sState.textContent = "Give the idea a short title (3+ characters).";
            sTitle.focus();
            return;
          }
          ;
          sSend.disabled = true;
          sState.textContent = "Sending" + ELLIPSIS;
          try {
            const r = await post("suggest", { title, detail, mod: MOD });
            const s = r.suggestion || {};
            const saved = { title: s.title || title, detail: s.detail ?? detail, created_at: s.created_at || Date.now() };
            if (Number.isInteger(s.id)) {
              saved.id = s.id;
              state2.sentIds.add(s.id);
            }
            ;
            state2.storedWrite = true;
            state2.suggestions.unshift(saved);
            state2.suggestions.length = Math.min(state2.suggestions.length, KEEP_SUGGESTIONS);
            saveSuggestions();
            renderSuggestions();
            sTitle.value = "";
            sDetail.value = "";
            query$("#s-count").textContent = "0 / " + DETAIL_MAX;
            sState.textContent = "Thanks! It is in the review pile.";
          } catch (err) {
            sState.textContent = errorText(err);
            if (err.status === 401) {
              signedOutMidway();
            }
            ;
          } finally {
            sSend.disabled = false;
          }
          ;
          return;
        }
      );
      window.addEventListener(
        "storage",
        function(e) {
          if (e.key === KEY.votes && e.newValue === null) {
            signedOutMidway();
            applyBallot({}, false);
            return;
          }
          ;
          if (e.key === KEY.votes) {
            applyBallot(B.mergeBallot(state2.votes, loadVotes(), isBusy), true);
          }
          ;
          if (e.key === KEY.suggestions) {
            state2.suggestions = loadSuggestions();
            renderSuggestions();
          }
          ;
          return;
        }
      );
      globalThis.document.addEventListener(
        "visibilitychange",
        function() {
          if (globalThis.document.visibilityState === "hidden") {
            notes.fireAll();
            queue.flush(false);
          } else {
            if (canVote() && Date.now() - state2.mineAt >= MINE_REFRESH_MS) {
              loadMine();
            }
            ;
          }
          ;
          return;
        }
      );
      window.addEventListener(
        "pagehide",
        function() {
          notes.fireAll();
          queue.flush(true);
          return;
        }
      );
      window.addEventListener(
        "online",
        function() {
          return queue.flush(false);
        }
      );
      return;
    }
    ;
    async function load() {
      state2.votes = loadVotes();
      state2.saved = { ...state2.votes };
      state2.suggestions = loadSuggestions();
      renderSuggestions();
      loadAuth().then(
        function() {
          if (canVote()) {
            loadMine();
          }
          ;
          return;
        }
      );
      try {
        const [data, tallies] = await Promise.all(
          [request("ideas.json", { credentials: "omit" }), request("api/tallies" + Q, { credentials: "omit" }).catch(
            function() {
              return null;
            }
          )]
        );
        state2.talliesOk = !!(tallies && typeof tallies === "object");
        state2.version = data.version;
        state2.categories = data.categories;
        state2.ideas = data.ideas.map(
          function(i, order) {
            const t = state2.talliesOk && tallies[i.id] || {};
            return { ...i, order, tally: { want: t.want | 0, maybe: t.maybe | 0, skip: t.skip | 0 } };
            return;
          }
        );
        state2.byId = new Map(
          state2.ideas.map(
            function(i) {
              return [i.id, i];
            }
          )
        );
        state2.since = computeSince(state2.version);
        renderNewBanner();
        render();
      } catch (e) {
        const retry = el("button", { class: "btn ghost", type: "button", text: "Try again" });
        retry.addEventListener(
          "click",
          function() {
            query$("#cats").replaceChildren(el("p", { class: "empty", text: "Loading ideas" + ELLIPSIS }));
            load();
            return;
          }
        );
        query$("#cats").replaceChildren(el("p", { class: "empty", text: "Could not load the ideas. " + errorText(e, "Could not reach the server.") }), retry);
      }
      ;
      return;
    }
    ;
    function start() {
      const msg = authFragmentMessage();
      wireControls();
      renderAccount();
      renderSuggestForm();
      if (msg) {
        setNotice(msg);
      }
      ;
      load();
      return;
    }
    ;
    if (globalThis.document.readyState === "loading") {
      globalThis.document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }
    ;
    return;
  }
  cursor$1();
})();
