// Generated from imba/public/mods/ffxiv/almanac/almanac.imba; edit the Imba source.
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

  // public/mods/ffxiv/almanac/almanac.js
  function cursor$1() {
    "use strict";
    const BASE = "/mods/ffxiv/almanac/";
    const THEME_KEY = "ghostty-vote:theme";
    const DOT = " \xB7 ";
    const SVG = "http://www.w3.org/2000/svg";
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
    function svg(tag, attrs, ...kids) {
      const n = globalThis.document.createElementNS(SVG, tag);
      for (let [k, v] of iterable$(Object.entries(attrs || {}))) {
        if (v !== null && v !== void 0) {
          n.setAttribute(k, String(v));
        }
        ;
      }
      ;
      for (let k of iterable$(kids)) {
        if (k !== null && k !== void 0) {
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
    const num = function(v) {
      return typeof v === "number" && Number.isFinite(v) ? v : null;
    };
    const fmt = function(v, d) {
      return num(v) === null ? "\u2013" : v.toFixed(d);
    };
    const gb = function(mb) {
      return num(mb) === null ? "\u2013" : (mb / 1024).toFixed(1) + " GB";
    };
    const pct = function(v) {
      return num(v) === null ? "\u2013" : Math.round(v * 100) + "%";
    };
    const state2 = { data: null, suite: "", mode: "live", tier: "", gpu: "", sort: { tiers: ["rank", -1], gpu: ["score", -1] } };
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
      query$("#summary").replaceChildren("$ ", el("b", { text: "almanac" }), " leaderboard  " + text);
      return;
    }
    ;
    const COLUMNS = [{
      key: "model",
      label: "Model",
      value: function(g) {
        return str(g.model);
      },
      cell: function(g) {
        return el("td", { class: "model" }, el("b", { text: str(g.model) }), el("span", { class: "small", text: " " + str(g.quant) }));
      }
    }, {
      key: "score",
      label: "Score",
      value: function(g) {
        return num(g.score);
      },
      cell: function(g) {
        return el("td", { class: "num" }, fmt(g.score, 1), num(g.score_low) !== null ? el("span", { class: "small", text: " " + fmt(g.score_low, 0) + "\u2013" + fmt(g.score_high, 0) }) : null);
      }
    }, {
      key: "tokens_per_s",
      label: "tok/s",
      value: function(g) {
        return num(g.tokens_per_s);
      },
      cell: function(g) {
        return el("td", { class: "num", text: fmt(g.tokens_per_s, 1) });
      }
    }, {
      key: "ttft_ms",
      label: "first token",
      value: function(g) {
        return num(g.ttft_ms);
      },
      cell: function(g) {
        return el("td", { class: "num", text: num(g.ttft_ms) === null ? "\u2013" : Math.round(g.ttft_ms) + " ms" });
      }
    }, {
      key: "peak_vram_mb",
      label: "peak VRAM",
      value: function(g) {
        return num(g.peak_vram_mb);
      },
      cell: function(g) {
        return el("td", { class: "num", text: gb(g.peak_vram_mb) });
      }
    }, {
      key: "success_rate",
      label: "tasks ok",
      value: function(g) {
        return num(g.success_rate);
      },
      cell: function(g) {
        return el("td", { class: "num", text: pct(g.success_rate) });
      }
    }, {
      key: "tool_call_validity",
      label: "valid tools",
      value: function(g) {
        return num(g.tool_call_validity);
      },
      cell: function(g) {
        return el("td", { class: "num", text: pct(g.tool_call_validity) });
      }
    }, {
      key: "samples",
      label: "who",
      value: function(g) {
        return num(g.samples);
      },
      cell: function(g) {
        return el("td", { class: "num", title: (g.runs | 0) + " runs" + (g.trimmed ? ", " + g.trimmed + " outlier submitters trimmed" : ""), text: String(g.samples | 0) });
      }
    }, {
      key: "confidence",
      label: "confidence",
      value: function(g) {
        return { low: 0, medium: 1, high: 2 }[g.confidence] ?? -1;
      },
      cell: function(g) {
        return el("td", { class: "conf " + str(g.confidence), text: str(g.confidence) });
      }
    }];
    function table(rows, which, caption, withRank) {
      const [key, dir] = state2.sort[which];
      const sorted = rows.slice();
      if (key !== "rank") {
        const col = COLUMNS.find(
          function(c) {
            return c.key === key;
          }
        );
        sorted.sort(
          function(a, b) {
            const x = col.value(a);
            const y = col.value(b);
            if (x === null && y === null) {
              return 0;
            }
            ;
            if (x === null) {
              return 1;
            }
            ;
            if (y === null) {
              return -1;
            }
            ;
            return (typeof x === "string" ? x.localeCompare(y) : x - y) * dir;
            return;
          }
        );
      }
      ;
      const head = el("tr");
      if (withRank) {
        head.append(sortHeader({ key: "rank", label: "#" }, which));
      }
      ;
      for (let c of iterable$(COLUMNS)) {
        head.append(sortHeader(c, which));
      }
      ;
      const body = el("tbody");
      sorted.forEach(
        function(g) {
          const tr = el("tr");
          if (withRank) {
            tr.append(el("td", { class: "num", text: String(rows.indexOf(g) + 1) }));
          }
          ;
          for (let c of iterable$(COLUMNS)) {
            tr.append(c.cell(g));
          }
          ;
          body.append(tr);
          return;
        }
      );
      return el("div", { class: "scroll" }, el("table", { class: "board" }, el("caption", { text: caption }), el("thead", null, head), body));
      return;
    }
    ;
    function sortHeader(c, which) {
      const [key, dir] = state2.sort[which];
      const active = key === c.key;
      const b = el("button", { type: "button", class: "sort", text: c.label + (active ? dir > 0 ? " \u2191" : " \u2193" : "") });
      b.addEventListener(
        "click",
        function() {
          state2.sort[which] = [c.key, active ? -dir : c.key === "model" ? 1 : -1];
          render();
          return;
        }
      );
      return el("th", { scope: "col", "aria-sort": active ? dir > 0 ? "ascending" : "descending" : "none" }, b);
      return;
    }
    ;
    function scatter(groups) {
      const box = query$("#scatter");
      const pts = groups.filter(
        function(g2) {
          return num(g2.score) !== null && num(g2.tokens_per_s) !== null && g2.tokens_per_s > 0;
        }
      );
      if (!pts.length) {
        box.replaceChildren(el("p", { class: "empty", text: "Nothing to plot yet." }));
        return;
      }
      ;
      const W = 720;
      const H = 360;
      const L = 48;
      const R = 16;
      const T = 16;
      const B = 40;
      const lx = pts.map(
        function(p) {
          return Math.log10(p.tokens_per_s);
        }
      );
      let x0 = Math.floor(Math.min(...lx));
      let x1 = Math.ceil(Math.max(...lx));
      if (x1 === x0) {
        x1 = x0 + 1;
      }
      ;
      const X = function(v) {
        return L + (Math.log10(v) - x0) / (x1 - x0) * (W - L - R);
      };
      const Y = function(v) {
        return T + (1 - v / 100) * (H - T - B);
      };
      const g = svg("svg", { viewBox: "0 0 " + String(W) + " " + String(H), class: "plot", role: "img", "aria-label": "Score against tokens per second, " + pts.length + " models" });
      for (let s of [0, 25, 50, 75, 100]) {
        g.append(svg("line", { x1: L, x2: W - R, y1: Y(s), y2: Y(s), class: "grid" }));
        g.append(svg("text", { x: L - 8, y: Y(s) + 4, class: "tick", "text-anchor": "end" }, String(s)));
      }
      ;
      let cursor$2 = x0;
      while (cursor$2 <= x1) {
        for (let m of [1, 2, 5]) {
          const v = m * 10 ** cursor$2;
          if (Math.log10(v) > x1 + 1e-9) {
            continue;
          }
          ;
          g.append(svg("line", { x1: X(v), x2: X(v), y1: T, y2: H - B, class: m === 1 ? "grid" : "grid minor" }));
          if (m === 1 || x1 - x0 <= 2) {
            g.append(svg("text", { x: X(v), y: H - B + 16, class: "tick", "text-anchor": "middle" }, String(v)));
          }
          ;
        }
        ;
        cursor$2++;
      }
      ;
      g.append(svg("text", { x: (L + W - R) / 2, y: H - 6, class: "axis", "text-anchor": "middle" }, "tokens per second (log)"));
      g.append(svg("text", { x: 12, y: T + (H - T - B) / 2, class: "axis", "text-anchor": "middle", transform: "rotate(-90 12 " + String(T + (H - T - B) / 2) + ")" }, "score"));
      const tip = svg("g", { class: "tip", visibility: "hidden" });
      const tipBg = svg("rect", { rx: 6, ry: 6 });
      const tipText = svg("text", {});
      tip.append(tipBg, tipText);
      const show = function(p, cx, cy) {
        tipText.replaceChildren();
        const lines = [p.model + " " + p.quant, "score " + fmt(p.score, 1) + DOT + fmt(p.tokens_per_s, 1) + " tok/s", "peak " + gb(p.peak_vram_mb) + DOT + tierLabel(p.tier) + DOT + (p.samples | 0) + " submitter" + (p.samples === 1 ? "" : "s")];
        lines.forEach(
          function(line, i) {
            return tipText.append(svg("tspan", { x: 10, dy: i ? 16 : 0 }, line));
          }
        );
        const w = Math.max(
          ...lines.map(
            function(l) {
              return l.length;
            }
          )
        ) * 7.4 + 20;
        const h = lines.length * 16 + 12;
        const tx = Math.min(Math.max(cx + 12, L), W - R - w);
        const ty = cy - h - 12 < T ? cy + 12 : cy - h - 12;
        tipBg.setAttribute("width", String(w));
        tipBg.setAttribute("height", String(h));
        tipText.setAttribute("y", "20");
        tipText.querySelectorAll("tspan")[0].setAttribute("dy", "0");
        tip.setAttribute("transform", "translate(" + String(tx) + " " + String(ty) + ")");
        tip.setAttribute("visibility", "visible");
        return;
      };
      const hide = function() {
        return tip.setAttribute("visibility", "hidden");
      };
      for (let p of iterable$(pts)) {
        const cx = X(p.tokens_per_s);
        const cy = Y(p.score);
        const label = p.model + " " + p.quant + ": score " + fmt(p.score, 1) + ", " + fmt(p.tokens_per_s, 1) + " tokens per second";
        const hit = svg("g", { class: "pt " + str(p.confidence), tabindex: 0, role: "img", "aria-label": label }, svg("circle", { cx, cy, r: 14, class: "hit" }), svg("circle", { cx, cy, r: p.confidence === "low" ? 4 : 5.5, class: "dot" }));
        hit.addEventListener(
          "mouseenter",
          function() {
            return show(p, cx, cy);
          }
        );
        hit.addEventListener(
          "focus",
          function() {
            return show(p, cx, cy);
          }
        );
        hit.addEventListener("mouseleave", hide);
        hit.addEventListener("blur", hide);
        g.append(hit);
      }
      ;
      g.append(tip);
      box.replaceChildren(g, el("p", { class: "small legend" }, el("span", { class: "key solid" }), " medium or high confidence ", el("span", { class: "key hollow" }), " low confidence (fewer than 3 submitters)"));
      return;
    }
    ;
    const tierLabel = function(id) {
      return (state2.data.tiers.find(
        function(t) {
          return t.id === id;
        }
      ) || { label: id }).label;
    };
    const inView = function(g) {
      return g.suite_id + "@" + g.suite_version === state2.suite && g.mode === state2.mode;
    };
    function render() {
      const d = state2.data;
      const groups = (Array.isArray(d.groups) ? d.groups : []).filter(inView);
      const tiers = d.tiers.filter(
        function(t) {
          return !state2.tier || t.id === state2.tier;
        }
      );
      const out = [];
      for (let t of iterable$(tiers)) {
        const rows2 = groups.filter(
          function(g) {
            return g.tier === t.id;
          }
        );
        if (!rows2.length) {
          continue;
        }
        ;
        out.push(el("h3", { text: t.label }), table(rows2, "tiers", "Models measured on " + t.label + " cards", true));
      }
      ;
      query$("#tiers").replaceChildren(...out.length ? out : [el("p", { class: "empty", text: "No results for this suite and mode yet. Run the benchmark in Almanac and share yours!" })]);
      scatter(
        groups.filter(
          function(g) {
            return !state2.tier || g.tier === state2.tier;
          }
        )
      );
      const gpuRows = (Array.isArray(d.gpu) ? d.gpu : []).filter(inView);
      const classes = d.gpu_classes.filter(
        function(c) {
          return gpuRows.some(
            function(r) {
              return r.gpu_class === c.id;
            }
          );
        }
      );
      const sel = query$("#f-gpu");
      if (!classes.some(
        function(c) {
          return c.id === state2.gpu;
        }
      )) {
        state2.gpu = classes[0] ? classes[0].id : "";
      }
      ;
      sel.replaceChildren(
        ...classes.map(
          function(c) {
            return el("option", { value: c.id, text: c.label, selected: c.id === state2.gpu });
          }
        )
      );
      const rows = gpuRows.filter(
        function(r) {
          return r.gpu_class === state2.gpu;
        }
      );
      query$("#gpu").replaceChildren(
        rows.length ? table(
          rows,
          "gpu",
          "Models measured on " + (classes.find(
            function(c) {
              return c.id === state2.gpu;
            }
          ) || {}).label + " cards",
          false
        ) : el("p", { class: "empty", text: "No results yet." })
      );
      const suite = d.suites.find(
        function(s) {
          return s.id + "@" + s.version === state2.suite;
        }
      );
      summary(suite ? suite.results + " results" + DOT + suite.submitters + " submitters" + DOT + suite.id + " " + suite.version + DOT + "as of " + new Date(d.generated_at).toLocaleString() : "no results yet");
      return;
    }
    ;
    async function load() {
      let d = null;
      try {
        const res = await fetch(BASE + "leaderboard.json", { headers: { accept: "application/json" } });
        if (res.ok) {
          d = await res.json();
        }
        ;
      } catch (e) {
      }
      ;
      if (!d || !Array.isArray(d.tiers) || !Array.isArray(d.suites)) {
        summary("could not be loaded; try again later");
        query$("#tiers").replaceChildren(el("p", { class: "empty", text: "The leaderboard could not be loaded." }));
        return;
      }
      ;
      if (!Array.isArray(d.gpu_classes)) {
        d.gpu_classes = [];
      }
      ;
      state2.data = d;
      query$("#method").textContent = str(d.method);
      const suites = d.suites.filter(
        function(s) {
          return !s.deprecated && s.results > 0;
        }
      );
      query$("#f-suite").replaceChildren(
        ...suites.map(
          function(s) {
            return el("option", { value: s.id + "@" + s.version, text: s.id + " " + s.version + " (" + s.results + ")" });
          }
        )
      );
      const best = suites.slice().sort(
        function(a, b) {
          return (b.live_results > 0) - (a.live_results > 0) || b.submitters - a.submitters;
        }
      )[0];
      state2.suite = best ? best.id + "@" + best.version : "";
      query$("#f-suite").value = state2.suite;
      if (best && !best.live_results) {
        state2.mode = "mock";
        query$("#f-mode").value = "mock";
      }
      ;
      query$("#f-tier").append(
        ...d.tiers.map(
          function(t) {
            return el("option", { value: t.id, text: t.label });
          }
        )
      );
      render();
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
      query$("#f-suite").addEventListener(
        "change",
        function(e) {
          state2.suite = e.target.value;
          if (state2.data) {
            render();
          }
          ;
          return;
        }
      );
      query$("#f-mode").addEventListener(
        "change",
        function(e) {
          state2.mode = e.target.value;
          if (state2.data) {
            render();
          }
          ;
          return;
        }
      );
      query$("#f-tier").addEventListener(
        "change",
        function(e) {
          state2.tier = e.target.value;
          if (state2.data) {
            render();
          }
          ;
          return;
        }
      );
      query$("#f-gpu").addEventListener(
        "change",
        function(e) {
          state2.gpu = e.target.value;
          if (state2.data) {
            render();
          }
          ;
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
