// Generated from imba/public/mods/ffxiv/plugins/plugins.imba; edit the Imba source.
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

  // public/mods/ffxiv/plugins/plugins.js
  function cursor$1() {
    "use strict";
    const THEME_KEY = "ghostty-vote:theme";
    const LISTING = "/mods/ffxiv/plugins.json";
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
    const query$ = function(s) {
      return globalThis.document.querySelector(s);
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
    function copyUrl(button) {
      const text = query$("#repo-url").textContent.trim();
      const done = function(ok) {
        button.textContent = ok ? "copied" : "select it";
        setTimeout(
          function() {
            button.textContent = "copy";
            return;
          },
          1600
        );
        return;
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          function() {
            return done(true);
          },
          function() {
            return done(false);
          }
        );
        return;
      }
      ;
      done(false);
      return;
    }
    ;
    function showVersions(entries) {
      const byName = new Map(
        entries.map(
          function(e) {
            return [e.InternalName, e];
          }
        )
      );
      for (let article of iterable$(globalThis.document.querySelectorAll(".mod[data-plugin]"))) {
        const entry = byName.get(article.dataset.plugin);
        const slot = article.querySelector("[data-ver]");
        if (!slot) {
          continue;
        }
        ;
        const unreleased = article.querySelector("[data-unreleased]");
        if (unreleased) {
          unreleased.hidden = !!entry;
        }
        ;
        if (!entry) {
          slot.textContent = "";
          continue;
        }
        ;
        slot.textContent = (entry.IsTestingExclusive ? "test build v" : "v") + entry.AssemblyVersion.replace(new RegExp("\\.0$", ""), "");
        slot.title = entry.TestingAssemblyVersion ? "testing: v" + entry.TestingAssemblyVersion.replace(new RegExp("\\.0$", ""), "") : "";
      }
      ;
      return;
    }
    ;
    function load() {
      fetch(LISTING, { headers: { accept: "application/json" } }).then(
        function(r) {
          return r.ok ? r.json() : [];
        }
      ).then(
        function(body) {
          return showVersions(Array.isArray(body) ? body : []);
        }
      ).catch(
        function() {
          return;
        }
      );
      return;
    }
    ;
    function start() {
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
      query$("#copy").addEventListener(
        "click",
        function(e) {
          return copyUrl(e.currentTarget);
        }
      );
      load();
      return;
    }
    ;
    if (globalThis.document.readyState === "loading") {
      globalThis.document.addEventListener("DOMContentLoaded", start);
    } else {
      start();
    }
    ;
    return;
  }
  cursor$1();
})();
