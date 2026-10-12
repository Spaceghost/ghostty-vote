// Generated from imba/public/mods/ffxiv/term/vote/admin/accounts.imba; edit the Imba source.
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

  // public/mods/ffxiv/term/vote/admin/accounts.js
  function cursor$1() {
    "use strict";
    const API = "/mods/ffxiv/term/vote/api/";
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
      return Number.isFinite(ms) && ms > 0 ? new Date(ms).toLocaleString() : "";
    };
    const short = function(account) {
      return str(account).slice(0, 10);
    };
    const summary = function(text) {
      return query$("#accounts-summary").replaceChildren("$ ", el("b", { text: "accounts" }), "  " + text);
    };
    async function post(name, body) {
      try {
        const res = await fetch(API + name, { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        const data = await res.json().catch(
          function() {
            return {};
          }
        );
        return { ok: res.ok, message: str(data.message) || (res.ok ? "" : "failed (" + res.status + ")") };
      } catch (e) {
        return { ok: false, message: "could not reach the server" };
      }
      ;
      return;
    }
    ;
    function button(label, run) {
      const b = el("button", { class: "btn ghost", type: "button", text: label });
      b.addEventListener(
        "click",
        async function() {
          b.disabled = true;
          const r = await run();
          if (!r.ok) {
            b.disabled = false;
            summary(r.message);
            return;
          }
          ;
          load();
          return;
        }
      );
      return b;
      return;
    }
    ;
    function table(heads, rows) {
      return el(
        "div",
        { class: "scroll" },
        el(
          "table",
          { class: "results" },
          el(
            "thead",
            null,
            el(
              "tr",
              null,
              ...heads.map(
                function(h) {
                  return el("th", { text: h });
                }
              )
            )
          ),
          el("tbody", null, ...rows)
        )
      );
      return;
    }
    ;
    function accountRow(a) {
      const who = a.character && a.character.name ? str(a.character.name) + (a.character.world ? " @ " + str(a.character.world) : "") : "";
      const ban = a.banned ? button(
        "Unban",
        function() {
          return post("admin/accounts/ban", { account: str(a.account), banned: false });
        }
      ) : button(
        "Ban",
        function() {
          const reason = window.prompt("Ban " + str(a.provider) + " " + short(a.account) + "? It can no longer write anything and its apps are disconnected. Reason (optional):", "");
          return reason === null ? Promise.resolve({ ok: true }) : post("admin/accounts/ban", { account: str(a.account), provider: str(a.provider), banned: true, reason });
          return;
        }
      );
      return el("tr", { class: a.banned ? "hidden-row" : null }, el("td", { text: str(a.provider) }), el("td", { text: short(a.account) }), el("td", { text: who }), el("td", { text: (a.shots | 0) + " (" + (a.shots_pending | 0) + " pending, " + (a.shots_refused | 0) + " refused)" }), el("td", { text: (a.results | 0) + " (" + (a.results_hidden | 0) + " hidden)" }), el("td", { text: String(a.tokens | 0) }), el("td", { text: when(a.last_at) }), el("td", { class: "row" }, ban));
      return;
    }
    ;
    function tokenRow(t) {
      const cell = el("td", { class: "row" });
      if (t.status === "active") {
        cell.append(
          button(
            "Revoke",
            function() {
              return post("admin/tokens/revoke", { id: str(t.id) });
            }
          )
        );
      }
      ;
      return el("tr", { class: t.status === "active" ? null : "hidden-row" }, el("td", { text: str(t.client_name) }), el("td", { text: str(t.provider) + " " + short(t.account) }), el("td", { text: (Array.isArray(t.scopes) ? t.scopes : []).join(", ") }), el("td", { text: when(t.created_at) }), el("td", { text: when(t.last_used_at) }), el("td", { text: str(t.status) + (t.revoked_by ? " (" + str(t.revoked_by) + ")" : "") }), cell);
      return;
    }
    ;
    async function load() {
      let res = null;
      let data = null;
      try {
        res = await fetch(API + "admin/accounts", { credentials: "same-origin", cache: "no-store", headers: { accept: "application/json" } });
        if (res.ok) {
          data = await res.json();
        }
        ;
      } catch (e) {
      }
      ;
      if (!data) {
        summary(res && (res.status === 401 || res.status === 403) ? "owner only" : "could not be loaded");
        return;
      }
      ;
      const accounts = Array.isArray(data.accounts) ? data.accounts : [];
      const tokens = Array.isArray(data.tokens) ? data.tokens : [];
      const bans = Array.isArray(data.bans) ? data.bans : [];
      summary(
        accounts.length + " accounts, " + tokens.filter(
          function(t) {
            return t.status === "active";
          }
        ).length + " linked apps, " + bans.length + " banned"
      );
      query$("#accounts").replaceChildren(accounts.length ? table(["Sign-in", "Account", "Character", "Screenshots", "Results", "Apps", "Last", ""], accounts.map(accountRow)) : el("p", { class: "empty", text: "No account has sent anything yet." }));
      query$("#tokens").replaceChildren(tokens.length ? table(["App", "Account", "May", "Linked", "Last used", "Status", ""], tokens.map(tokenRow)) : el("p", { class: "empty", text: "No apps are linked." }));
      query$("#bans").replaceChildren(
        bans.length ? table(
          ["Sign-in", "Account", "Reason", "Since"],
          bans.map(
            function(b) {
              return el("tr", null, el("td", { text: str(b.provider) }), el("td", { text: short(b.account) }), el("td", { text: str(b.reason) }), el("td", { text: when(b.created_at) }));
            }
          )
        ) : el("p", { class: "empty", text: "Nobody is banned." })
      );
      return;
    }
    ;
    function start() {
      const form = query$("#ban-form");
      form.addEventListener(
        "submit",
        async function(ev) {
          ev.preventDefault();
          const r = await post("admin/accounts/ban", { provider: query$("#ban-provider").value, id: query$("#ban-id").value.trim(), banned: true, reason: query$("#ban-reason").value });
          if (!r.ok) {
            summary(r.message);
            return;
          }
          ;
          form.reset();
          load();
          return;
        }
      );
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
