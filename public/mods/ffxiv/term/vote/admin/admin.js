// Generated from imba/public/mods/ffxiv/term/vote/admin/admin.imba; edit the Imba source.
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

  // public/mods/ffxiv/term/vote/admin/admin.js
  function cursor$1() {
    "use strict";
    const BASE = "/mods/ffxiv/term/vote/";
    const DOT = " \xB7 ";
    const modTag = function(m) {
      return m && m !== "ghostty" ? "[" + str(m) + "] " : "";
    };
    const LODESTONE_ID = new RegExp("^\\d{1,20}$", "");
    const state2 = { data: null, filter: "all" };
    try {
      const t = window.localStorage.getItem("ghostty-vote:theme");
      if (t === "dark" || t === "light") {
        globalThis.document.documentElement.dataset.theme = t;
      }
      ;
    } catch (e) {
    }
    ;
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
    const when = function(ms) {
      return Number.isFinite(ms) && ms > 0 ? new Date(ms).toLocaleString() : "";
    };
    const str = function(v) {
      return typeof v === "string" ? v : "";
    };
    function message(text, link) {
      const p = el("p", { class: "empty", text });
      if (link) {
        p.append(" ", el("a", { href: link.href, text: link.text }));
      }
      ;
      query$("#voters").replaceChildren(p);
      query$("#summary").replaceChildren("$ ", el("b", { text: "voters" }), "  " + text);
      return;
    }
    ;
    function portrait(c) {
      if (!c || !new RegExp("^https:\\/\\/", "").test(str(c.portrait_url))) {
        return el("span", { class: "portrait blank", "aria-hidden": "true" });
      }
      ;
      return el("img", { class: "portrait", src: c.portrait_url, alt: "", width: "56", height: "56", loading: "lazy", referrerpolicy: "no-referrer" });
      return;
    }
    ;
    function voterCard(v) {
      const c = v.character && typeof v.character === "object" ? v.character : null;
      const a = el("article", { class: "idea voter" });
      const head = el("div", { class: "who" }, portrait(c));
      const title = el("h3");
      if (c) {
        const label = str(c.name) + (c.world ? " @ " + str(c.world) : "");
        if (LODESTONE_ID.test(str(c.lodestone_id))) {
          title.append(el("a", { href: "https://na.finalfantasyxiv.com/lodestone/character/" + c.lodestone_id + "/", rel: "noopener noreferrer", target: "_blank", text: label }));
        } else {
          title.textContent = label;
        }
        ;
      } else {
        title.textContent = "voter " + str(v.voter).slice(0, 10);
      }
      ;
      const sub = el("p", { class: "small", text: [v.you ? "you" : "", c ? "character first seen " + when(c.first_seen) + ", last " + when(c.last_seen) : "no character", v.last_active ? "last active " + when(v.last_active) : ""].filter(Boolean).join(DOT) });
      head.append(el("div", null, title, sub));
      a.append(head);
      a.append(el("div", { class: "tally" }, el("span", null, el("span", { class: "w", text: (v.want | 0) + " want" }), DOT, el("span", { class: "m", text: (v.maybe | 0) + " maybe" }), DOT, el("span", { class: "s", text: (v.skip | 0) + " skip" }))));
      const notes = Array.isArray(v.notes) ? v.notes : [];
      if (notes.length) {
        const d = el("details", { open: notes.length <= 3 });
        d.append(el("summary", { text: notes.length + (notes.length === 1 ? " note" : " notes") }));
        for (let n of iterable$(notes)) {
          d.append(el("span", { class: "k", text: modTag(n.mod) + str(n.title) + (n.vote ? DOT + n.vote : "") }), el("p", { text: str(n.note) }));
        }
        ;
        a.append(d);
      }
      ;
      const sugg = Array.isArray(v.suggestions) ? v.suggestions : [];
      if (sugg.length) {
        const d = el("details", { open: sugg.length <= 2 });
        d.append(el("summary", { text: sugg.length + (sugg.length === 1 ? " suggestion" : " suggestions") }));
        for (let s of iterable$(sugg)) {
          d.append(el("span", { class: "k", text: modTag(s.mod) + str(s.title) + DOT + str(s.status) + DOT + when(s.created_at) }));
          if (s.detail) {
            d.append(el("p", { text: str(s.detail) }));
          }
          ;
        }
        ;
        a.append(d);
      }
      ;
      return a;
      return;
    }
    ;
    function visible(v) {
      if (state2.filter === "character") {
        return !!v.character;
      }
      ;
      if (state2.filter === "words") {
        return (v.notes || []).length > 0 || (v.suggestions || []).length > 0;
      }
      ;
      return true;
      return;
    }
    ;
    function render() {
      const d = state2.data;
      const t = d.totals || {};
      query$("#summary").replaceChildren("$ ", el("b", { text: "voters" }), "  ", (t.voters | 0) + " voters" + DOT + (t.with_character | 0) + " with a character" + DOT + (t.notes | 0) + " notes" + DOT + (t.suggestions | 0) + " suggestions" + DOT + "as of " + when(d.generated_at));
      const list = (Array.isArray(d.voters) ? d.voters : []).filter(visible);
      const grid = el("div", { class: "grid" });
      for (let v of iterable$(list)) {
        grid.append(voterCard(v));
      }
      ;
      query$("#voters").replaceChildren(list.length ? grid : el("p", { class: "empty", text: "Nobody matches this filter yet." }));
      return;
    }
    ;
    async function load() {
      let res;
      try {
        res = await fetch(BASE + "api/admin/voters", { credentials: "same-origin", cache: "no-store", headers: { accept: "application/json" } });
      } catch (e) {
        return message("Could not reach the server.");
      }
      ;
      if (res.status === 401) {
        return message("Sign in first.", { href: BASE + "api/auth/github/start?return=" + encodeURIComponent(BASE + "admin/"), text: "Sign in with GitHub" });
      }
      ;
      if (res.status === 403) {
        return message("This page is only for the site owner.", { href: BASE, text: "Back to the vote" });
      }
      ;
      let data = null;
      try {
        data = await res.json();
      } catch (e) {
      }
      ;
      if (!res.ok || !data || typeof data !== "object") {
        return message("The voter list could not be loaded (" + res.status + ").");
      }
      ;
      state2.data = data;
      query$("#filters").hidden = false;
      render();
      return;
    }
    ;
    const SHOT_ID = new RegExp("^[A-Za-z0-9_-]{22}$", "");
    const THUMB_WIDTH = 960;
    const adminImage = function(id, thumb) {
      return BASE + "api/admin/gallery/image?id=" + encodeURIComponent(id) + (thumb ? "&thumb=1" : "");
    };
    const kb = function(n) {
      return n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.round(n / 1024) + " KB";
    };
    function queueMessage(text) {
      query$("#queue-summary").replaceChildren("$ ", el("b", { text: "gallery" }), "  " + text);
      return;
    }
    ;
    async function makeThumb(id) {
      const res = await fetch(adminImage(id), { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) {
        throw new Error("image " + res.status);
      }
      ;
      const bmp = await createImageBitmap(await res.blob());
      const scale = Math.min(1, THUMB_WIDTH / bmp.width);
      const canvas = globalThis.document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bmp.width * scale));
      canvas.height = Math.max(1, Math.round(bmp.height * scale));
      canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
      bmp.close();
      const blob = await new Promise(
        function(resolve) {
          return canvas.toBlob(resolve, "image/jpeg", 0.82);
        }
      );
      if (!blob) {
        throw new Error("no thumbnail");
      }
      ;
      const put = await fetch(BASE + "api/admin/gallery/thumb?id=" + encodeURIComponent(id), { method: "POST", credentials: "same-origin", headers: { "content-type": "image/jpeg" }, body: blob });
      if (!put.ok) {
        throw new Error("thumbnail " + put.status);
      }
      ;
      return;
    }
    ;
    async function review(id, action, card) {
      for (let b of iterable$(card.querySelectorAll("button"))) {
        b.disabled = true;
      }
      ;
      const note = card.querySelector(".notice");
      try {
        if (action === "approve" || action === "approve_anon") {
          note.textContent = "making the thumbnail\u2026";
          try {
            await makeThumb(id);
          } catch (e) {
            note.textContent = "no thumbnail (" + e.message + "); approving anyway\u2026";
          }
          ;
        }
        ;
        const res = await fetch(BASE + "api/admin/gallery/review", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, action }) });
        const data = await res.json().catch(
          function() {
            return null;
          }
        );
        if (!res.ok) {
          throw new Error(data && str(data.message) || String(res.status));
        }
        ;
        loadQueue();
      } catch (e) {
        note.textContent = "failed: " + e.message;
        for (let b of iterable$(card.querySelectorAll("button"))) {
          b.disabled = false;
        }
        ;
      }
      ;
      return;
    }
    ;
    function shotCard(s, pending) {
      if (!SHOT_ID.test(str(s.id))) {
        return null;
      }
      ;
      const card = el("figure", { class: "shot" });
      const thumb = !pending && s.has_thumb;
      if (s.status === "pending" || s.status === "approved") {
        card.append(el("a", { href: adminImage(s.id), target: "_blank", rel: "noopener" }, el("img", { src: adminImage(s.id, thumb), alt: "shot " + s.id, loading: "lazy", width: String(s.width | 0 || 16), height: String(s.height | 0 || 9) })));
      }
      ;
      const cap = el("figcaption", { text: [s.status, (s.width | 0) + "\xD7" + (s.height | 0), kb(s.bytes | 0), str(s.source), s.credit ? "credit: " + str(s.credit) : "no credit", s.account ? str(s.provider) + " " + str(s.account).slice(0, 10) : "legacy (no account)", s.mod ? "mod: " + str(s.mod) : "", s.uploader ? "from " + str(s.uploader) : "", "sent " + when(s.created_at), s.reviewed_at ? "reviewed " + when(s.reviewed_at) : ""].filter(Boolean).join(DOT) });
      card.append(cap);
      const row = el("div", { class: "row" });
      const button = function(label, action, cls) {
        const b = el("button", { class: "btn" + (cls ? " " + cls : ""), type: "button", text: label });
        b.addEventListener(
          "click",
          function() {
            return review(s.id, action, card);
          }
        );
        row.append(b);
        return;
      };
      if (pending) {
        button("Approve", "approve");
        if (s.credit) {
          button("Approve without credit", "approve_anon", "ghost");
        }
        ;
        button("Reject", "reject", "ghost");
      } else {
        if (s.status === "approved") {
          button("Remove", "remove", "ghost");
        }
        ;
      }
      ;
      row.append(el("span", { class: "notice" }));
      card.append(row);
      return card;
      return;
    }
    ;
    async function loadQueue() {
      let res;
      try {
        res = await fetch(BASE + "api/admin/gallery", { credentials: "same-origin", cache: "no-store", headers: { accept: "application/json" } });
      } catch (e) {
        return queueMessage("could not reach the server");
      }
      ;
      if (res.status === 401 || res.status === 403) {
        query$("#queue").replaceChildren();
        return queueMessage("owner only");
      }
      ;
      let data = null;
      try {
        data = await res.json();
      } catch (e) {
      }
      ;
      if (!res.ok || !data || typeof data !== "object") {
        return queueMessage("the queue could not be loaded (" + res.status + ")");
      }
      ;
      const pending = Array.isArray(data.pending) ? data.pending : [];
      const reviewed = Array.isArray(data.reviewed) ? data.reviewed : [];
      queueMessage(pending.length + " waiting for review" + DOT + reviewed.length + " recent decisions" + DOT + "store: " + str(data.store));
      const grid = el("div", { class: "shots" });
      for (let s of iterable$(pending)) {
        const c = shotCard(s, true);
        if (c) {
          grid.append(c);
        }
        ;
      }
      ;
      const out = [pending.length ? grid : el("p", { class: "empty", text: "Nothing waiting. Screenshots players share appear here first." })];
      if (reviewed.length) {
        const d = el("details");
        d.append(el("summary", { text: "Recent decisions (" + reviewed.length + ")" }));
        const g = el("div", { class: "shots" });
        for (let s of iterable$(reviewed)) {
          const c = shotCard(s, false);
          if (c) {
            g.append(c);
          }
          ;
        }
        ;
        d.append(g);
        out.push(d);
      }
      ;
      query$("#queue").replaceChildren(...out);
      return;
    }
    ;
    const RESULT_ID = new RegExp("^[A-Za-z0-9_-]{22}$", "");
    function almanacMessage(text) {
      query$("#almanac-summary").replaceChildren("$ ", el("b", { text: "almanac" }), "  " + text);
      return;
    }
    ;
    async function almanacPost(path, body, row) {
      for (let b of iterable$(row.querySelectorAll("button"))) {
        b.disabled = true;
      }
      ;
      const note = row.querySelector(".notice");
      try {
        const res = await fetch(BASE + "api/admin/almanac/" + path, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        const data = await res.json().catch(
          function() {
            return null;
          }
        );
        if (!res.ok) {
          throw new Error(data && str(data.message) || String(res.status));
        }
        ;
        loadAlmanac();
      } catch (e) {
        if (note) {
          note.textContent = "failed: " + e.message;
        }
        ;
        for (let b of iterable$(row.querySelectorAll("button"))) {
          b.disabled = false;
        }
        ;
      }
      ;
      return;
    }
    ;
    function suiteRow(s) {
      const row = el("p", { class: "row" });
      row.append(el("span", { class: "k", text: str(s.suite_id) + " " + str(s.suite_version) + DOT + (s.results | 0) + " results" + DOT + (s.deprecated ? "deprecated" : "current") + DOT + "sha " + str(s.sha256).slice(0, 12) + DOT + "first seen " + when(s.created_at) }));
      const b = el("button", { class: "btn ghost", type: "button", text: s.deprecated ? "Restore suite" : "Deprecate suite" });
      b.addEventListener(
        "click",
        function() {
          if (!s.deprecated && !window.confirm("Deprecate " + s.suite_id + " " + s.suite_version + "? Its results leave the leaderboard and new ones are refused.")) {
            return;
          }
          ;
          almanacPost("suite", { suite_id: s.suite_id, suite_version: s.suite_version, deprecated: !s.deprecated }, row);
          return;
        }
      );
      row.append(b, el("span", { class: "notice" }));
      return row;
      return;
    }
    ;
    function resultRow(r) {
      if (!RESULT_ID.test(str(r.id))) {
        return null;
      }
      ;
      const tr = el("tr", { class: r.status === "hidden" ? "hidden-row" : "" });
      const cells = [when(r.created_at), r.status, str(r.suite_id) + " " + str(r.suite_version), r.mode, str(r.model) + " " + str(r.quant), r.backend, str(r.gpu_model) + " (" + ((r.vram_mb | 0) / 1024).toFixed(1) + " GB)", r.os, (+r.score).toFixed(1), (+r.tokens_per_s).toFixed(1) + " tok/s", r.account ? str(r.provider) + " " + str(r.account).slice(0, 10) : "legacy " + str(r.submitter)];
      for (let c of iterable$(cells)) {
        tr.append(el("td", { text: str(String(c)) }));
      }
      ;
      const td = el("td", { class: "row" });
      const button = function(label, action, cls) {
        const b = el("button", { class: "btn" + (cls ? " " + cls : ""), type: "button", text: label });
        b.addEventListener(
          "click",
          function() {
            if (action === "delete" && !window.confirm("Delete this result for good?")) {
              return;
            }
            ;
            almanacPost("review", { id: r.id, action }, td);
            return;
          }
        );
        td.append(b);
        return;
      };
      if (r.status === "hidden") {
        button("Unhide", "unhide", "ghost");
      } else {
        button("Hide", "hide", "ghost");
      }
      ;
      button("Delete", "delete", "ghost");
      td.append(el("span", { class: "notice" }));
      tr.append(td);
      return tr;
      return;
    }
    ;
    async function loadAlmanac() {
      let res;
      try {
        res = await fetch(BASE + "api/admin/almanac", { credentials: "same-origin", cache: "no-store", headers: { accept: "application/json" } });
      } catch (e) {
        return almanacMessage("could not reach the server");
      }
      ;
      if (res.status === 401 || res.status === 403) {
        query$("#almanac").replaceChildren();
        return almanacMessage("owner only");
      }
      ;
      let data = null;
      try {
        data = await res.json();
      } catch (e) {
      }
      ;
      if (!res.ok || !data || typeof data !== "object") {
        return almanacMessage("results could not be loaded (" + res.status + ")");
      }
      ;
      const t = data.totals || {};
      const results = Array.isArray(data.results) ? data.results : [];
      const suites = Array.isArray(data.suites) ? data.suites : [];
      almanacMessage((t.results | 0) + " results" + DOT + (t.hidden | 0) + " hidden" + DOT + (t.submitters | 0) + " submitters" + DOT + suites.length + " suites");
      query$("#almanac-suites").replaceChildren(...suites.map(suiteRow));
      if (!results.length) {
        query$("#almanac").replaceChildren(el("p", { class: "empty", text: "No results yet." }));
        return;
      }
      ;
      const head = el("tr");
      for (let h of ["sent", "status", "suite", "mode", "model", "backend", "gpu", "os", "score", "speed", "from", ""]) {
        head.append(el("th", { scope: "col", text: h }));
      }
      ;
      const body = el("tbody");
      for (let r of iterable$(results)) {
        const row = resultRow(r);
        if (row) {
          body.append(row);
        }
        ;
      }
      ;
      query$("#almanac").replaceChildren(el("div", { class: "scroll" }, el("table", { class: "results" }, el("thead", null, head), body)));
      return;
    }
    ;
    function start() {
      for (let b of iterable$(globalThis.document.querySelectorAll(".chip[data-filter]"))) {
        b.addEventListener(
          "click",
          function() {
            state2.filter = b.dataset.filter;
            for (let c of iterable$(globalThis.document.querySelectorAll(".chip[data-filter]"))) {
              c.setAttribute("aria-pressed", String(c === b));
            }
            ;
            if (state2.data) {
              render();
            }
            ;
            return;
          }
        );
      }
      ;
      load();
      loadQueue();
      loadAlmanac();
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
