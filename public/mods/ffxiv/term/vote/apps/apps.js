// Generated from imba/public/mods/ffxiv/term/vote/apps/apps.imba; edit the Imba source.
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

  // public/mods/ffxiv/term/vote/apps/apps.js
  function cursor$1() {
    "use strict";
    const API = "/mods/ffxiv/term/vote/api/";
    const PAGE = "/mods/ffxiv/term/vote/apps/";
    const CODE_RE = new RegExp("^[BCDFGHJKLMNPQRSTVWXZ]{4}-[BCDFGHJKLMNPQRSTVWXZ]{4}$", "");
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
    const str = function(v) {
      return typeof v === "string" ? v : "";
    };
    const when = function(ms) {
      return Number.isFinite(ms) && ms > 0 ? new Date(ms).toLocaleDateString() : "never";
    };
    function cleanCode(raw) {
      const s = str(raw).toUpperCase().replace(new RegExp("[^A-Z]", "g"), "");
      const code = s.slice(0, 4) + "-" + s.slice(4);
      return CODE_RE.test(code) ? code : null;
      return;
    }
    ;
    async function api(name, body) {
      let res = null;
      let data = null;
      try {
        res = await fetch(API + name, { method: body ? "POST" : "GET", credentials: "same-origin", cache: "no-store", headers: body ? { "content-type": "application/json", accept: "application/json" } : { accept: "application/json" }, body: body ? JSON.stringify(body) : void 0 });
        data = await res.json().catch(
          function() {
            return null;
          }
        );
      } catch (e) {
      }
      ;
      return { ok: !!(res && res.ok), status: res ? res.status : 0, data: data || {} };
      return;
    }
    ;
    const say = function(text) {
      query$("#link-state").textContent = text;
      return;
    };
    const failure = function(r) {
      return str(r.data.message) || (r.status ? "That did not work (" + r.status + ")." : "Could not reach the server; try again.");
    };
    let current = null;
    async function lookup(code) {
      say("checking\u2026");
      query$("#ask").hidden = true;
      const r = await api("device/lookup", { user_code: code });
      if (r.status === 401) {
        signedOut(code);
        return;
      }
      ;
      if (!r.ok) {
        say(failure(r));
        return;
      }
      ;
      current = code;
      say("");
      query$("#ask-text").replaceChildren(el("strong", { text: str(r.data.client_name) }), " is asking to be linked to your account (code " + code + "). It will be able to:");
      query$("#ask-scopes").replaceChildren(
        ...(Array.isArray(r.data.scopes) ? r.data.scopes : []).map(
          function(s) {
            return el("li", { text: str(s.description) });
          }
        )
      );
      query$("#ask").hidden = false;
      return;
    }
    ;
    async function answer(action) {
      if (!current) {
        return;
      }
      ;
      query$("#approve").disabled = query$("#deny").disabled = true;
      const r = await api("device/approve", { user_code: current, action });
      query$("#approve").disabled = query$("#deny").disabled = false;
      if (r.status === 401) {
        signedOut(current);
        return;
      }
      ;
      if (!r.ok) {
        say(failure(r));
        return;
      }
      ;
      query$("#ask").hidden = true;
      query$("#code").value = "";
      current = null;
      window.history.replaceState(null, "", PAGE);
      say(action === "approve" ? str(r.data.client_name) + " is linked. Go back to it: it finishes on its own within a few seconds." : "Refused. Nothing was linked.");
      if (action === "approve") {
        window.setTimeout(listApps, 6e3);
      }
      ;
      return;
    }
    ;
    function appRow(a) {
      const tr = el("tr", { class: a.status === "active" ? null : "hidden-row" }, el("td", { text: str(a.client_name) }), el("td", { text: (Array.isArray(a.scopes) ? a.scopes : []).join(", ") }), el("td", { text: when(a.created_at) }), el("td", { text: when(a.last_used_at) }), el("td", { text: a.status === "active" ? "until " + when(a.expires_at) : str(a.status) + (a.revoked_by ? " (" + str(a.revoked_by) + ")" : "") }));
      const cell = el("td", { class: "row" });
      if (a.status === "active") {
        const b = el("button", { class: "btn ghost", type: "button", text: "Disconnect" });
        b.addEventListener(
          "click",
          async function() {
            b.disabled = true;
            const r = await api("apps/revoke", { id: str(a.id) });
            if (!r.ok) {
              b.disabled = false;
              say(failure(r));
              return;
            }
            ;
            listApps();
            return;
          }
        );
        cell.append(b);
      }
      ;
      tr.append(cell);
      return tr;
      return;
    }
    ;
    async function listApps() {
      const r = await api("apps");
      if (r.status === 401) {
        signedOut(current);
        return;
      }
      ;
      const apps = Array.isArray(r.data.apps) ? r.data.apps : [];
      query$("#whoami").textContent = "Signed in with " + (r.data.provider === "github" ? "GitHub" : "FFXIV") + ".";
      if (!apps.length) {
        query$("#apps").replaceChildren(el("p", { class: "empty", text: "No apps are linked to this account." }));
        return;
      }
      ;
      const head = el(
        "tr",
        null,
        ...["App", "May", "Linked", "Last used", "Status", ""].map(
          function(h) {
            return el("th", { text: h });
          }
        )
      );
      query$("#apps").replaceChildren(el("div", { class: "scroll" }, el("table", { class: "results" }, el("thead", null, head), el("tbody", null, ...apps.map(appRow)))));
      return;
    }
    ;
    function signedOut(code) {
      const back = PAGE + (code ? "?code=" + code : "");
      for (let id of ["#signin-github", "#signin-xivauth"]) {
        const a = query$(id);
        a.setAttribute("href", a.getAttribute("href").split("?")[0] + "?return=" + encodeURIComponent(back));
      }
      ;
      query$("#signin").hidden = false;
      query$("#link").hidden = true;
      query$("#apps-section").hidden = true;
      return;
    }
    ;
    async function start() {
      const code = cleanCode(new URLSearchParams(window.location.search).get("code"));
      const me = await api("auth/me");
      if (!me.ok || !me.data.signed_in) {
        signedOut(code);
        return;
      }
      ;
      query$("#link").hidden = false;
      query$("#apps-section").hidden = false;
      query$("#code-form").addEventListener(
        "submit",
        function(ev) {
          ev.preventDefault();
          const typed = cleanCode(query$("#code").value);
          if (!typed) {
            say("That does not look like a code; it is eight letters, like BCDF-GHJK.");
            return;
          }
          ;
          lookup(typed);
          return;
        }
      );
      query$("#approve").addEventListener(
        "click",
        function() {
          return answer("approve");
        }
      );
      query$("#deny").addEventListener(
        "click",
        function() {
          return answer("deny");
        }
      );
      if (code) {
        query$("#code").value = code;
        lookup(code);
      }
      ;
      listApps();
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
