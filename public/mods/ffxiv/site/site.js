// Generated from imba/public/mods/ffxiv/site/site.imba; edit the Imba source.
(() => {
  // public/mods/ffxiv/site/site.js
  function cursor$1() {
    "use strict";
    var VOTE_API = "/mods/ffxiv/term/vote/api/";
    var GALLERY = "/mods/ffxiv/term/gallery/";
    var THEME_KEY = "ghostty-vote:theme";
    var MAX_BYTES = 8 * 1024 * 1024;
    var MODS = ["ghostty", "almanac", "xivmcp", "xivdesktop", "xivarcade", "xivwayfinder", "xivlantern", "xivpiano", "xivhud", "xivhud-journal", "xivhud-character", "xivrug", "xivstream", "xivprism", "xivdispatch", "xivcamp", "xivhud-vitals", "xivhud-combat", "xivhud-chat"];
    var DOT = " \xB7 ";
    function get(k) {
      try {
        return window.localStorage.getItem(k);
      } catch (e) {
        return null;
      }
      ;
      return;
    }
    ;
    function set(k, v) {
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
    }
    ;
    var saved = get(THEME_KEY);
    if (saved === "dark" || saved === "light") {
      globalThis.document.documentElement.dataset.theme = saved;
    }
    ;
    function query$(s) {
      return globalThis.document.querySelector(s);
      return;
    }
    ;
    function el(tag, attrs) {
      var n = globalThis.document.createElement(tag);
      var a = attrs || {};
      Object.keys(a).forEach(
        function(k) {
          var v = a[k];
          if (v === false || v === null || v === void 0) {
            return;
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
          return;
        }
      );
      var i = 2;
      while (i < arguments.length) {
        var kid = arguments[i];
        if (kid !== null && kid !== void 0 && kid !== false) {
          n.append(kid);
        }
        ;
        i++;
      }
      ;
      return n;
      return;
    }
    ;
    function str(v) {
      return typeof v === "string" ? v : "";
      return;
    }
    ;
    function int(v) {
      var n = Number(v);
      return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
      return;
    }
    ;
    function applyTheme(t) {
      var $1;
      if (t === "dark" || t === "light") {
        globalThis.document.documentElement.dataset.theme = t;
      } else {
        $1 = globalThis.document.documentElement.dataset.theme, delete globalThis.document.documentElement.dataset.theme, $1;
      }
      ;
      var b = query$("#theme");
      if (b) {
        b.textContent = "theme: " + (t || "auto");
      }
      ;
      return;
    }
    ;
    function wireTheme() {
      var b = query$("#theme");
      if (!b || b.familyThemeOwned) {
        return;
      }
      ;
      b.addEventListener(
        "click",
        function() {
          var cur = globalThis.document.documentElement.dataset.theme || "";
          var next = cur === "" ? "dark" : cur === "dark" ? "light" : "";
          set(THEME_KEY, next);
          applyTheme(next);
          return;
        }
      );
      applyTheme(globalThis.document.documentElement.dataset.theme || "");
      return;
    }
    ;
    function wireCopy() {
      var b = query$("#copy");
      var src = query$("#repo-url");
      if (!b || !src) {
        return;
      }
      ;
      b.addEventListener(
        "click",
        function() {
          var done = function(ok) {
            b.textContent = ok ? "copied" : "select and copy";
            window.setTimeout(
              function() {
                b.textContent = "copy";
                return;
              },
              1800
            );
            return;
          };
          try {
            window.navigator.clipboard.writeText(src.textContent.trim()).then(
              function() {
                done(true);
                return;
              },
              function() {
                done(false);
                return;
              }
            );
          } catch (e) {
            done(false);
          }
          ;
          return;
        }
      );
      return;
    }
    ;
    var FILE_RE = new RegExp("^[a-z0-9][a-z0-9._-]{0,80}\\.(webp|avif|jpg|jpeg|png|mp4|webm)$", "");
    function fileUrl(dir, name) {
      return FILE_RE.test(str(name)) ? dir + name : null;
      return;
    }
    ;
    function picture(dir, f, alt, eager) {
      var src = fileUrl(dir, f.src);
      if (!src) {
        return null;
      }
      ;
      var set2 = [];
      (Array.isArray(f.sizes) ? f.sizes : []).forEach(
        function(s) {
          var u = s && fileUrl(dir, s.src);
          if (u && int(s.w)) {
            set2.push(u + " " + int(s.w) + "w");
          }
          ;
          return;
        }
      );
      if (set2.length && int(f.width)) {
        set2.push(src + " " + int(f.width) + "w");
      }
      ;
      var img = el("img", { src, alt, width: int(f.width) || null, height: int(f.height) || null, srcset: set2.length ? set2.join(", ") : null, sizes: set2.length ? "(min-width: 1100px) 520px, (min-width: 720px) 50vw, 100vw" : null, loading: eager ? null : "lazy", decoding: "async" });
      return el("a", { href: src, target: "_blank", rel: "noopener" }, img);
      return;
    }
    ;
    function clip(dir, f, label) {
      var src = fileUrl(dir, f.src);
      if (!src) {
        return null;
      }
      ;
      var v = el("video", { controls: true, preload: "none", playsinline: true, muted: f.loop === true, loop: f.loop === true, poster: fileUrl(dir, f.poster), width: int(f.width) || null, height: int(f.height) || null, "aria-label": label });
      v.append(el("source", { src, type: new RegExp("\\.webm$", "").test(src) ? "video/webm" : "video/mp4" }));
      return v;
      return;
    }
    ;
    function slotFigure(dir, slot, first) {
      var title = str(slot.title) || str(slot.id);
      var fig = el("figure", { class: "slot" + (slot.wide === true ? " wide" : ""), id: "shot-" + str(slot.id).replace(new RegExp("[^a-z0-9-]", "g"), "") });
      var files = Array.isArray(slot.files) ? slot.files : [];
      var shown = 0;
      files.forEach(
        function(f) {
          if (!f || typeof f !== "object") {
            return;
          }
          ;
          var alt = str(f.alt) || title;
          var node = f.type === "video" ? clip(dir, f, alt) : picture(dir, f, alt, first && shown === 0);
          if (!node) {
            return;
          }
          ;
          fig.append(el("div", { class: "frame" }, node));
          shown++;
          return;
        }
      );
      if (!shown) {
        fig.append(el("div", { class: "frame pending" }, el("span", {}, el("b", { text: "Not captured yet" }), str(slot.kind) || "screenshot")));
      }
      ;
      var cap = el("figcaption", {}, el("b", { text: title }));
      if (str(slot.caption)) {
        cap.append(str(slot.caption));
      }
      ;
      if (str(slot.where)) {
        cap.append(el("span", { class: "small", text: " " + str(slot.where) }));
      }
      ;
      fig.append(cap);
      return fig;
      return;
    }
    ;
    function renderVideo(dir, video) {
      var box = query$("#video");
      if (!box || !video || typeof video !== "object") {
        return;
      }
      ;
      var fig = el("figure", { class: "slot wide" });
      var node = video.file && typeof video.file === "object" ? clip(dir, video.file, str(video.title)) : null;
      fig.append(node ? el("div", { class: "frame" }, node) : el("div", { class: "frame pending" }, el("span", {}, el("b", { text: "Not recorded yet" }), str(video.length) || "video")));
      var cap = el("figcaption", {}, el("b", { text: str(video.title) || "Video" }));
      if (str(video.caption)) {
        cap.append(str(video.caption));
      }
      ;
      fig.append(cap);
      if (Array.isArray(video.cuts) && video.cuts.length) {
        var ol = el("ol", { class: "cuts", "aria-label": "Planned cuts" });
        video.cuts.forEach(
          function(c) {
            ol.append(el("li", {}, el("span", { text: str(c.t) }), el("span", { text: str(c.note) })));
            return;
          }
        );
        fig.append(ol);
      }
      ;
      box.replaceChildren(fig);
      return;
    }
    ;
    function loadMedia() {
      var box = query$("#media");
      var url = globalThis.document.body.dataset.media;
      if (!box || !url || !new RegExp("^\\/mods\\/ffxiv\\/[a-z/]+\\/media\\/manifest\\.json$", "").test(url)) {
        return;
      }
      ;
      var dir = url.slice(0, url.lastIndexOf("/") + 1);
      fetch(url, { headers: { accept: "application/json" } }).then(
        function(r) {
          return r.ok ? r.json() : null;
          return;
        }
      ).then(
        function(m) {
          if (!m || !Array.isArray(m.slots)) {
            throw new Error("manifest");
          }
          ;
          var grid = el("div", { class: "media" });
          m.slots.forEach(
            function(s, i) {
              if (s && typeof s === "object") {
                grid.append(slotFigure(dir, s, i === 0));
              }
              ;
              return;
            }
          );
          box.replaceChildren(grid);
          renderVideo(dir, m.video);
          return;
        }
      ).catch(
        function() {
          box.replaceChildren(el("p", { class: "empty", text: "The shot list could not be loaded." }));
          return;
        }
      );
      return;
    }
    ;
    function ownShot(p) {
      return typeof p === "string" && new RegExp("^\\/mods\\/ffxiv\\/term\\/gallery\\/(img|thumb)\\/[A-Za-z0-9_-]{22}$", "").test(p);
      return;
    }
    ;
    function day(ms) {
      return Number.isFinite(ms) && ms > 0 ? new Date(ms).toLocaleDateString() : "";
      return;
    }
    ;
    function shotCard(s, name) {
      if (!ownShot(s.src)) {
        return null;
      }
      ;
      var img = el("img", { src: ownShot(s.thumb) ? s.thumb : s.src, alt: "Screenshot of " + name + " in FFXIV" + (s.credit ? " by " + str(s.credit) : ""), loading: "lazy", decoding: "async", width: int(s.width) || 16, height: int(s.height) || 9 });
      var cap = el("figcaption");
      if (s.credit) {
        cap.append(el("b", { text: str(s.credit) }), DOT);
      }
      ;
      cap.append(day(s.approved_at));
      return el("figure", { class: "shot" }, el("div", { class: "frame" }, el("a", { href: s.src, target: "_blank", rel: "noopener" }, img)), cap);
      return;
    }
    ;
    function loadShots(mod, name) {
      var box = query$("#shots");
      if (!box) {
        return;
      }
      ;
      fetch(GALLERY + "api/shots?mod=" + mod, { headers: { accept: "application/json" } }).then(
        function(r) {
          return r.ok ? r.json() : null;
          return;
        }
      ).then(
        function(d) {
          if (!d || !Array.isArray(d.shots)) {
            throw new Error("shots");
          }
          ;
          var mine = d.shots.filter(
            function(s) {
              return s && s.mod === mod;
              return;
            }
          ).slice(0, 24);
          var grid = el("div", { class: "shots" });
          mine.forEach(
            function(s) {
              var c = shotCard(s, name);
              if (c) {
                grid.append(c);
              }
              ;
              return;
            }
          );
          box.replaceChildren(mine.length ? grid : el("p", { class: "empty", text: "No community screenshots of " + name + " yet. Yours could be the first." }));
          return;
        }
      ).catch(
        function() {
          box.replaceChildren(el("p", { class: "empty", text: "The community screenshots could not be loaded." }));
          return;
        }
      );
      return;
    }
    ;
    function wireUpload(mod) {
      var form = query$("#upload");
      if (!form) {
        return;
      }
      ;
      form.addEventListener(
        "submit",
        function(ev) {
          ev.preventDefault();
          var state = query$("#u-state");
          var input = query$("#u-file");
          var file = input.files && input.files[0];
          if (!file) {
            state.textContent = "Pick a screenshot first.";
            return;
          }
          ;
          if (file.type !== "image/png" && file.type !== "image/jpeg") {
            state.textContent = "Only PNG and JPEG screenshots can be shared.";
            return;
          }
          ;
          if (file.size > MAX_BYTES) {
            state.textContent = "Screenshots can be at most 8 MB.";
            return;
          }
          ;
          var credit = query$("#u-credit").value.trim();
          var send = query$("#u-send");
          send.disabled = true;
          state.textContent = "uploading\u2026";
          fetch(VOTE_API + "shots/upload?mod=" + mod + (credit ? "&credit=" + encodeURIComponent(credit) : ""), { method: "POST", credentials: "same-origin", headers: { "content-type": file.type }, body: file }).then(
            function(res) {
              return res.json().catch(
                function() {
                  return null;
                  return;
                }
              ).then(
                function(data) {
                  send.disabled = false;
                  if (res.status === 401) {
                    showAccount(false);
                    state.textContent = "";
                    return;
                  }
                  ;
                  state.textContent = data && str(data.message) || (res.ok ? "Thanks! It shows here once it is reviewed." : "The upload failed (" + res.status + ").");
                  if (res.ok) {
                    form.reset();
                  }
                  ;
                  return;
                }
              );
              return;
            }
          ).catch(
            function() {
              send.disabled = false;
              state.textContent = "Could not reach the server; try again.";
              return;
            }
          );
          return;
        }
      );
      var out = query$("#signout");
      if (out) {
        out.addEventListener(
          "click",
          function() {
            fetch(VOTE_API + "auth/logout", { method: "POST", credentials: "same-origin" }).then(
              function() {
                showAccount(false);
                return;
              },
              function() {
                return;
              }
            );
            return;
          }
        );
      }
      ;
      return;
    }
    ;
    function showAccount(signedIn) {
      var a = query$("#signed-out");
      var b = query$("#signed-in");
      if (a) {
        a.hidden = signedIn;
      }
      ;
      if (b) {
        b.hidden = !signedIn;
      }
      ;
      return;
    }
    ;
    function loadAccount() {
      if (!query$("#signed-out")) {
        return;
      }
      ;
      fetch(VOTE_API + "auth/me", { credentials: "same-origin", cache: "no-store", headers: { accept: "application/json" } }).then(
        function(r) {
          return r.ok ? r.json() : null;
          return;
        }
      ).then(
        function(me) {
          showAccount(!!(me && me.signed_in === true));
          return;
        }
      ).catch(
        function() {
          showAccount(false);
          return;
        }
      );
      return;
    }
    ;
    function readReturn() {
      var h = window.location.hash;
      if (h !== "#signed-in" && h.indexOf("#auth-error=") !== 0) {
        return;
      }
      ;
      var note = query$("#account-note");
      if (note) {
        note.textContent = h === "#signed-in" ? "Signed in." : "Sign-in did not finish; try again.";
      }
      ;
      try {
        window.history.replaceState(null, "", window.location.pathname + "#community");
      } catch (e) {
      }
      ;
      var c = query$("#community");
      if (c && typeof c.scrollIntoView === "function") {
        c.scrollIntoView();
      }
      ;
      return;
    }
    ;
    function start() {
      wireTheme();
      wireCopy();
      loadMedia();
      var mod = globalThis.document.body.dataset.mod;
      if (MODS.indexOf(mod) >= 0) {
        loadShots(mod, globalThis.document.body.dataset.name || mod);
        wireUpload(mod);
        loadAccount();
        readReturn();
      }
      ;
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
