// Generated from imba/public/mods/ffxiv/term/gallery/gallery.imba; edit the Imba source.
(() => {
  // node_modules/imba/src/imba/runtime.mjs
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

  // public/mods/ffxiv/term/gallery/gallery.js
  function cursor$1() {
    "use strict";
    const BASE = "/mods/ffxiv/term/gallery/";
    const VOTE_API = "/mods/ffxiv/term/vote/api/";
    const THEME_KEY = "ghostty-vote:theme";
    const MAX_BYTES = 8 * 1024 * 1024;
    const DOT = " \xB7 ";
    const MODS = { ghostty: "Ghostty", almanac: "Almanac", xivmcp: "XivMcp", xivdesktop: "XivDesktop", xivarcade: "XivArcade", xivwayfinder: "XivWayfinder", xivlantern: "XivLantern", xivpiano: "XivPiano", xivhud: "XivHud", "xivhud-journal": "XivHud \xB7 Journal", "xivhud-character": "XivHud \xB7 Character", xivrug: "XivRug", xivstream: "XivStream" };
    const want = new URLSearchParams(location.search).get("mod");
    const MOD = want && Object.hasOwn(MODS, want) ? want : "";
    const modOf = function(s) {
      return typeof s.mod === "string" && Object.hasOwn(MODS, s.mod) ? s.mod : "ghostty";
    };
    const get = function(k) {
      try {
        return window.localStorage.getItem(k);
      } catch (e) {
        return null;
      }
      ;
      return;
    };
    const set = function(k, v) {
      try {
        if (v) {
          window.localStorage.setItem(k, v);
        } else {
          window.localStorage.removeItem(k);
        }
        ;
      } catch (e) {
      }
      ;
      return;
    };
    const saved = get(THEME_KEY);
    if (saved === "dark" || saved === "light") {
      globalThis.document.documentElement.dataset.theme = saved;
    }
    ;
    let myVotes = /* @__PURE__ */ Object.create(null);
    let canVote = false;
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
    const str = function(v) {
      return typeof v === "string" ? v : "";
    };
    const day = function(ms) {
      return Number.isFinite(ms) && ms > 0 ? new Date(ms).toLocaleDateString() : "";
    };
    const ownPath = function(p) {
      return typeof p === "string" && new RegExp("^\\/mods\\/ffxiv\\/term\\/gallery\\/(img|thumb)\\/[A-Za-z0-9_-]{22}$", "").test(p);
    };
    function applyTheme(t) {
      var $1;
      if (t === "dark" || t === "light") {
        globalThis.document.documentElement.dataset.theme = t;
      } else {
        $1 = globalThis.document.documentElement.dataset.theme, delete globalThis.document.documentElement.dataset.theme, $1;
      }
      ;
      query$("#theme").textContent = "theme: " + (t || "auto");
      return;
    }
    ;
    function summary(text) {
      query$("#summary").replaceChildren("$ ", el("b", { text: "ls" }), " gallery/  " + text);
      return;
    }
    ;
    function shotCard(s) {
      if (!ownPath(s.src)) {
        return null;
      }
      ;
      const w = Number(s.width) || 16;
      const h = Number(s.height) || 9;
      const img = el("img", { src: ownPath(s.thumb) ? s.thumb : s.src, alt: "Screenshot of " + MODS[modOf(s)] + " in FFXIV" + (s.credit ? " by " + str(s.credit) : ""), loading: "lazy", decoding: "async", width: String(w), height: String(h) });
      const cap = el("figcaption");
      if (s.credit) {
        cap.append(el("b", { text: str(s.credit) }), DOT);
      }
      ;
      cap.append(day(s.approved_at));
      return el("figure", { class: "shot" }, el("a", { href: s.src, target: "_blank", rel: "noopener" }, img), cap, voteRow(s));
      return;
    }
    ;
    function voteRow(s) {
      const id = str(s.id);
      const row = el("div", { class: "votes" });
      const counts = el("span", { class: "tally" });
      const paint = function(keeps, passes) {
        counts.textContent = keeps + " keep" + DOT + passes + " pass";
        for (let b of iterable$(row.querySelectorAll("button"))) {
          b.setAttribute("aria-pressed", myVotes[id] === b.dataset.vote ? "true" : "false");
        }
        ;
        return;
      };
      for (let kind of ["keep", "pass"]) {
        const b = el("button", { type: "button", class: "vote", "data-vote": kind, text: kind, title: canVote ? "Vote to " + kind + " this screenshot" : "Sign in to vote", disabled: !canVote });
        b.addEventListener(
          "click",
          async function() {
            var $2;
            const want2 = myVotes[id] === kind ? null : kind;
            for (let x of iterable$(row.querySelectorAll("button"))) {
              x.disabled = true;
            }
            ;
            const r = await castVote(id, want2);
            for (let x of iterable$(row.querySelectorAll("button"))) {
              x.disabled = false;
            }
            ;
            if (!r) {
              return;
            }
            ;
            if (want2) {
              myVotes[id] = want2;
            } else {
              $2 = myVotes[id], delete myVotes[id], $2;
            }
            ;
            paint(r.keeps, r.passes);
            return;
          }
        );
        row.append(b);
      }
      ;
      row.append(counts);
      paint(Number(s.keeps) || 0, Number(s.passes) || 0);
      return row;
      return;
    }
    ;
    async function castVote(id, vote) {
      try {
        const res = await fetch(VOTE_API + "gallery/vote", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, vote }) });
        if (res.status === 401) {
          canVote = false;
          signedIn(null);
          return null;
        }
        ;
        const data = await res.json().catch(
          function() {
            return null;
          }
        );
        if (!res.ok || !data || !data.ok) {
          return null;
        }
        ;
        return { keeps: Number(data.keeps) || 0, passes: Number(data.passes) || 0 };
      } catch (e) {
        return null;
      }
      ;
      return;
    }
    ;
    async function loadMyVotes() {
      try {
        const res = await fetch(VOTE_API + "gallery/mine", { credentials: "same-origin", cache: "no-store", headers: { accept: "application/json" } });
        if (!res.ok) {
          return;
        }
        ;
        const data = await res.json();
        canVote = !!(data && data.signed_in);
        myVotes = /* @__PURE__ */ Object.create(null);
        for (let [id, v] of iterable$(Object.entries(data && data.votes || {}))) {
          if (v === "keep" || v === "pass") {
            myVotes[id] = v;
          }
          ;
        }
        ;
      } catch (e) {
      }
      ;
      return;
    }
    ;
    async function load() {
      let data = null;
      try {
        const res = await fetch(BASE + "api/shots", { headers: { accept: "application/json" } });
        if (res.ok) {
          data = await res.json();
        }
        ;
      } catch (e) {
      }
      ;
      const shots = data && Array.isArray(data.shots) ? data.shots : null;
      if (!shots) {
        summary("could not be loaded; try again later");
        query$("#shots").replaceChildren(el("p", { class: "empty", text: "The gallery could not be loaded." }));
        return;
      }
      ;
      const shown = MOD ? shots.filter(
        function(s) {
          return modOf(s) === MOD;
        }
      ) : shots;
      summary(shown.length + (shown.length === 1 ? " screenshot" : " screenshots") + (MOD ? " of " + MODS[MOD] : ""));
      const grid = el("div", { class: "shots" });
      for (let s of iterable$(shown)) {
        const c = shotCard(s);
        if (c) {
          grid.append(c);
        }
        ;
      }
      ;
      query$("#shots").replaceChildren(shown.length ? grid : el("p", { class: "empty", text: "No screenshots" + (MOD ? " of " + MODS[MOD] : "") + " yet. Be the first to share one!" }));
      return;
    }
    ;
    function signedIn(me) {
      const yes$ = !!(me && me.signed_in);
      query$("#signin").hidden = yes$;
      query$("#upload").hidden = !yes$;
      const who = query$("#whoami");
      who.hidden = !yes$;
      if (yes$) {
        const c = me.character;
        who.textContent = "Signed in with " + (me.provider === "github" ? "GitHub" : "FFXIV") + (c && c.name ? " as " + str(c.name) + (c.world ? " @ " + str(c.world) : "") : "") + ".";
        if (c && c.name && !query$("#u-credit").value) {
          query$("#u-credit").value = str(c.name) + (c.world ? " @ " + str(c.world) : "");
        }
        ;
      }
      ;
      return;
    }
    ;
    async function whoAmI() {
      let me = null;
      try {
        const res = await fetch(VOTE_API + "auth/me", { credentials: "same-origin", cache: "no-store", headers: { accept: "application/json" } });
        if (res.ok) {
          me = await res.json();
        }
        ;
      } catch (e) {
      }
      ;
      signedIn(me);
      return;
    }
    ;
    async function upload(ev) {
      ev.preventDefault();
      const state2 = query$("#u-state");
      const file = query$("#u-file").files && query$("#u-file").files[0];
      if (!file) {
        state2.textContent = "Pick a screenshot first.";
        return;
      }
      ;
      if (file.type !== "image/png" && file.type !== "image/jpeg") {
        state2.textContent = "Only PNG and JPEG screenshots can be shared.";
        return;
      }
      ;
      if (file.size > MAX_BYTES) {
        state2.textContent = "Screenshots can be at most 8 MB.";
        return;
      }
      ;
      const credit = query$("#u-credit").value.trim();
      const send = query$("#u-send");
      send.disabled = true;
      state2.textContent = "uploading\u2026";
      let res = null;
      let data = null;
      try {
        const q = new URLSearchParams();
        if (credit) {
          q.set("credit", credit);
        }
        ;
        if (MOD) {
          q.set("mod", MOD);
        }
        ;
        res = await fetch(VOTE_API + "gallery/upload" + (q.toString() ? "?" + q : ""), { method: "POST", credentials: "same-origin", headers: { "content-type": file.type }, body: file });
        data = await res.json().catch(
          function() {
            return null;
          }
        );
      } catch (e) {
      }
      ;
      send.disabled = false;
      if (!res) {
        state2.textContent = "Could not reach the server; try again.";
        return;
      }
      ;
      if (res.status === 401) {
        signedIn(null);
        return;
      }
      ;
      state2.textContent = data && str(data.message) || (res.ok ? "Thanks! It shows here once it is reviewed." : "The upload failed (" + res.status + ").");
      if (res.ok) {
        query$("#upload").reset();
      }
      ;
      return;
    }
    ;
    function start() {
      for (let a of iterable$(globalThis.document.querySelectorAll("#mod-filter a"))) {
        if (a.dataset.mod === MOD) {
          a.setAttribute("aria-current", "page");
        }
        ;
      }
      ;
      if (MOD) {
        globalThis.document.title = MODS[MOD] + " screenshots \xB7 FFXIV Mods Gallery";
        query$("#u-send").textContent = "Share a " + MODS[MOD] + " screenshot";
      }
      ;
      query$("#theme").addEventListener(
        "click",
        function() {
          const cur = globalThis.document.documentElement.dataset.theme || "";
          const next = cur === "" ? "dark" : cur === "dark" ? "light" : "";
          set(THEME_KEY, next);
          applyTheme(next);
          return;
        }
      );
      applyTheme(globalThis.document.documentElement.dataset.theme || "");
      query$("#upload").addEventListener("submit", upload);
      whoAmI();
      loadMyVotes().then(load);
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
