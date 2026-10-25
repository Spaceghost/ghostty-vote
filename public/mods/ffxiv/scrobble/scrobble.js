// Generated from imba/public/mods/ffxiv/scrobble/scrobble.imba; edit the Imba source.
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

  // public/mods/ffxiv/scrobble/scrobble.js
  var API = "/mods/ffxiv/term/vote/api/scrobble/";
  var LOGOUT = "/mods/ffxiv/term/vote/api/auth/logout";
  var q = function(id) {
    return globalThis.document.getElementById(id);
  };
  var busy = false;
  var signingOut = false;
  var accountGeneration = 0;
  var refreshWhenIdle = false;
  var historyCursor = null;
  var nextHistoryCursor = null;
  var refreshGeneration = 0;
  var recordingsCursor = null;
  var activeAccount = "";
  function node(tag, text, className = "") {
    const result = globalThis.document.createElement(tag);
    result.textContent = String(text || "");
    if (className) {
      result.className = className;
    }
    ;
    return result;
  }
  function say(message, error = false) {
    q("page-status").textContent = message;
    return q("page-status").dataset.error = String(error);
  }
  function dateFor(value, milliseconds = false) {
    const date = new Date(Number(value) * (milliseconds ? 1 : 1e3));
    return Number.isFinite(date.getTime()) && Number(value) > 0 ? date : null;
  }
  function time(value, milliseconds = false) {
    const date = dateFor(value, milliseconds);
    return date ? date.toLocaleString() : "Never";
  }
  function pageCursor(value) {
    if (value === void 0 || value === null) {
      return null;
    }
    ;
    if (!Number.isSafeInteger(value.before) || value.before <= 0 || typeof value.cursor !== "string" || !new RegExp("^[0-9a-f]{64}$").test(value.cursor)) {
      throw new Error("The host returned an invalid history cursor. Refresh and try again.");
    }
    ;
    return { before: value.before, cursor: value.cursor };
  }
  function urlFor(name, cursor = null) {
    const url = new URL(API + name, window.location.origin);
    if (cursor) {
      url.searchParams.set("before", String(cursor.before));
      url.searchParams.set("cursor", String(cursor.cursor));
    }
    ;
    return url;
  }
  async function api(name, body = void 0, cursor = null) {
    const generation = accountGeneration;
    const response = await fetch(urlFor(name, cursor), {
      method: body === void 0 ? "GET" : "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: body === void 0 ? { accept: "application/json" } : { accept: "application/json", "content-type": "application/json" },
      body: body === void 0 ? void 0 : JSON.stringify(body),
      signal: AbortSignal.timeout(25e3)
    });
    const data = await response.json();
    if (generation !== accountGeneration) {
      throw new DOMException("The account changed.", "AbortError");
    }
    ;
    if (!response.ok) {
      if (response.status === 401) {
        signedOut();
        say("Sign in to see your private history and connect a player.");
      }
      ;
      throw new Error(data.message || "The request could not be completed (" + response.status + ").");
    }
    ;
    return data;
  }
  function signedOut() {
    accountGeneration++;
    refreshGeneration++;
    activeAccount = "";
    historyCursor = null;
    nextHistoryCursor = null;
    q("dashboard").hidden = true;
    q("signin").hidden = false;
    q("account-label").textContent = "";
    for (let id of ["listen-count", "pending-count", "failed-count"]) {
      q(id).textContent = "0";
    }
    ;
    q("now-playing").replaceChildren();
    q("history").replaceChildren();
    q("tokens").replaceChildren();
    q("recordings-list").replaceChildren();
    q("recordings-usage").textContent = "";
    q("recording-link").value = "";
    q("recording-link-box").hidden = true;
    q("recordings-older").hidden = true;
    recordingsCursor = null;
    q("recording-player").pause();
    q("recording-player").removeAttribute("src");
    q("recording-player").load();
    q("recording-player").hidden = true;
    q("history-latest").hidden = true;
    q("history-older").hidden = true;
    for (let id of ["listenbrainz-token", "lastfm-key", "lastfm-secret", "delete-confirm"]) {
      q(id).value = "";
    }
    ;
    q("token-label").value = "XivPiano";
    q("lastfm-setup").open = false;
    for (let name of ["listenbrainz", "lastfm"]) {
      renderProvider(name, {});
    }
    ;
    return clearToken();
  }
  function clearToken() {
    q("client-token").value = "";
    q("client-token").type = "password";
    return q("new-token").hidden = true;
  }
  async function withBusy(action) {
    if (busy || signingOut) {
      return;
    }
    ;
    const generation = accountGeneration;
    busy = true;
    const buttons = Array.from(globalThis.document.querySelectorAll("#dashboard button:not(#signout)"));
    const previous = buttons.map(function(button) {
      return button.disabled;
    });
    for (let button of iterable$(buttons)) {
      button.disabled = true;
    }
    ;
    try {
      return await action();
    } catch (error) {
      if (generation === accountGeneration) {
        return say(error.name === "TimeoutError" ? "The request timed out. Refresh to check its result before trying again." : error.message || "Could not reach the server. Try again.", true);
      }
      ;
    } finally {
      for (let [index, button] of iterable$(buttons.entries())) {
        button.disabled = previous[index];
      }
      ;
      busy = false;
      if (refreshWhenIdle) {
        refreshWhenIdle = false;
        if (!signingOut && globalThis.document.visibilityState === "visible") {
          withBusy(async function() {
            return await refresh();
          });
        }
        ;
      }
      ;
    }
    ;
  }
  function forwardingBadge(item) {
    const badge = node("span", (item.provider === "lastfm" ? "Last.fm" : "ListenBrainz") + ": " + (item.status || "pending"), "forward-status");
    badge.dataset.status = item.status || "pending";
    if (item.last_error) {
      badge.title = String(item.last_error);
    }
    ;
    return badge;
  }
  function track(metadata, listenedAt = null, forwards = [], index = null) {
    const wrapper = node("div", "", "listen-main");
    if (index !== null) {
      wrapper.append(node("span", String(index + 1).padStart(2, "0"), "listen-number"));
    }
    ;
    const content = node("div", "", "listen-content");
    content.append(node("span", metadata.track_name || "Untitled", "listen-title"));
    content.append(node("p", [metadata.artist_name, metadata.release_name].filter(Boolean).join(" \xB7 "), "listen-artist"));
    const bottom = node("div", "", "listen-bottom");
    if (listenedAt !== null) {
      const stamp = node("time", time(listenedAt));
      const date = dateFor(listenedAt);
      if (date) {
        stamp.dateTime = date.toISOString();
      }
      ;
      bottom.append(stamp);
    }
    ;
    for (let item of iterable$(forwards)) {
      bottom.append(forwardingBadge(item));
    }
    ;
    content.append(bottom);
    wrapper.append(content);
    return wrapper;
  }
  function renderTokens(tokens) {
    var $1;
    q("tokens").replaceChildren();
    q("tokens-empty").hidden = tokens.length > 0;
    $1 = [];
    for (let token of iterable$(tokens)) {
      const row = node("li", "");
      const label = node("div", "");
      label.append(node("strong", token.label || "Player"));
      label.append(node("span", (token.prefix || "") + "\u2026 \xB7 Last used: " + time(token.last_used_at, true), "small"));
      const button = node("button", token.revoked_at ? "Revoked" : "Revoke", "chip");
      button.type = "button";
      button.disabled = !!token.revoked_at;
      button.addEventListener("click", function() {
        return withBusy(async function() {
          await api("tokens/revoke", { id: token.id });
          clearToken();
          await refresh();
          return say("Player token revoked. That player can no longer submit listens.");
        });
      });
      row.append(label, button);
      $1.push(q("tokens").append(row));
    }
    ;
    return $1;
  }
  function lastfmApproval(pending, value = "") {
    let href = "";
    if (pending) {
      try {
        const url = new URL(value);
        if (url.origin === "https://www.last.fm" && url.pathname === "/api/auth/" && !url.username && !url.password && !url.hash && url.searchParams.get("api_key") && url.searchParams.get("token")) {
          href = url.href;
        }
        ;
      } catch ($2) {
        href = "";
      }
      ;
    }
    ;
    const link = q("lastfm-authorize");
    link.removeAttribute("href");
    link.hidden = !href;
    q("lastfm-approval").hidden = !href;
    if (href) {
      link.href = href;
    }
    ;
    return !!href;
  }
  function renderProvider(name, state2) {
    const connected = !!state2.connected;
    const status = q(name + "-status");
    status.textContent = connected ? "Connected" : state2.auth_pending ? "Awaiting approval" : "Not connected";
    status.dataset.connected = String(connected);
    const detail = [];
    if (state2.user_name) {
      detail.push(String(state2.user_name));
    }
    ;
    if (state2.pending) {
      detail.push(String(state2.pending) + " waiting");
    }
    ;
    if (state2.failed) {
      detail.push(String(state2.failed) + " need attention");
    }
    ;
    if (state2.last_error) {
      detail.push(String(state2.last_error));
    }
    ;
    if (name === "lastfm") {
      const approval = lastfmApproval(!!state2.auth_pending, state2.authorize_url);
      if (state2.auth_pending && !approval) {
        detail.push("Approval is unavailable or expired. Start the connection again.");
      }
      ;
    }
    ;
    q(name + "-detail").textContent = detail.join(" \xB7 ");
    const disconnect = globalThis.document.querySelector('[data-disconnect="' + name + '"]');
    disconnect.hidden = !connected && !state2.auth_pending;
    const retry = globalThis.document.querySelector('[data-retry="' + name + '"]');
    return retry.hidden = !connected || !state2.failed;
  }
  async function refresh(cursor = historyCursor) {
    const generation = ++refreshGeneration;
    const state2 = await api("state", void 0, cursor);
    if (generation !== refreshGeneration) {
      return;
    }
    ;
    if (!state2.signed_in) {
      signedOut();
      say("Sign in to see your private history and connect a player.");
      throw new DOMException("Sign-in is required.", "AbortError");
    }
    ;
    const nextAccount = String(state2.user_name || "");
    if (activeAccount && activeAccount !== nextAccount) {
      signedOut();
      return await refresh(null);
    }
    ;
    activeAccount = nextAccount;
    q("signin").hidden = true;
    q("dashboard").hidden = false;
    q("account-label").textContent = state2.user_name ? "Signed in as " + state2.user_name : "Signed in \xB7 your private history";
    const counts = state2.counts || {};
    q("listen-count").textContent = Number(counts.listens || 0).toLocaleString();
    q("pending-count").textContent = Number(counts.pending || 0).toLocaleString();
    q("failed-count").textContent = Number(counts.failed || 0).toLocaleString();
    renderTokens(Array.isArray(state2.tokens) ? state2.tokens : []);
    for (let name of ["listenbrainz", "lastfm"]) {
      renderProvider(name, state2.providers && state2.providers[name] || {});
    }
    ;
    const now = state2.now_playing;
    q("now-playing").replaceChildren();
    if (now && now.track_metadata) {
      q("now-playing").append(track(now.track_metadata));
    } else {
      q("now-playing").append(node("p", "Nothing playing right now.", "muted"));
    }
    ;
    const history = Array.isArray(state2.history) ? state2.history : [];
    q("history").replaceChildren();
    for (let [index, listen] of iterable$(history.entries())) {
      const row = node("li", "");
      row.append(track(listen.track_metadata || {}, listen.listened_at, listen.forwarding || [], index));
      q("history").append(row);
    }
    ;
    q("history-empty").hidden = history.length > 0;
    historyCursor = cursor;
    nextHistoryCursor = pageCursor(state2.next_cursor);
    q("history-latest").hidden = !cursor;
    q("history-older").hidden = !nextHistoryCursor;
    if (!busy) {
      return say("");
    }
    ;
  }
  q("token-form").addEventListener("submit", function(event) {
    event.preventDefault();
    return withBusy(async function() {
      const data = await api("tokens", { label: q("token-label").value.trim() });
      await refresh();
      q("client-token").value = data.client_token;
      q("new-token").hidden = false;
      return say("Token created. Copy it into XivPiano now; it cannot be shown again.");
    });
  });
  q("copy-token").addEventListener("click", function() {
    return withBusy(async function() {
      const generation = accountGeneration;
      try {
        await navigator.clipboard.writeText(q("client-token").value);
        if (generation === accountGeneration) {
          return say("Token copied. Paste it into Spaceghost Scrobbles in XivPiano settings.");
        }
        ;
      } catch ($3) {
        if (generation === accountGeneration) {
          q("client-token").type = "text";
          q("client-token").select();
          return say("Clipboard access is unavailable. Copy the selected token manually.");
        }
        ;
      }
      ;
    });
  });
  q("hide-token").addEventListener("click", clearToken);
  q("listenbrainz-form").addEventListener("submit", function(event) {
    event.preventDefault();
    return withBusy(async function() {
      await api("providers/listenbrainz", { token: q("listenbrainz-token").value.trim() });
      q("listenbrainz-token").value = "";
      await refresh();
      return say("ListenBrainz connected. New listens will be stored here and forwarded there.");
    });
  });
  q("lastfm-form").addEventListener("submit", function(event) {
    event.preventDefault();
    return withBusy(async function() {
      const data = await api("providers/lastfm/start", { api_key: q("lastfm-key").value.trim(), api_secret: q("lastfm-secret").value.trim() });
      q("lastfm-secret").value = "";
      if (!lastfmApproval(true, data.authorize_url)) {
        throw new Error("The host returned an invalid Last.fm approval address.");
      }
      ;
      q("lastfm-setup").open = false;
      return say("Open Last.fm approval, approve the connection, then press \u201CI approved it \u2014 finish\u201D.");
    });
  });
  q("lastfm-finish").addEventListener("click", function() {
    return withBusy(async function() {
      await api("providers/lastfm/finish", {});
      lastfmApproval(false);
      await refresh();
      return say("Last.fm connected. New listens will be stored here and forwarded there.");
    });
  });
  for (let button of iterable$(globalThis.document.querySelectorAll("[data-disconnect]"))) {
    button.addEventListener("click", function() {
      return withBusy(async function() {
        const name = button.dataset.disconnect;
        await api("providers/disconnect", { provider: name });
        if (name === "lastfm") {
          lastfmApproval(false);
        }
        ;
        await refresh();
        return say("Destination disconnected. Its credentials and waiting forwards have been removed.");
      });
    });
  }
  for (let button of iterable$(globalThis.document.querySelectorAll("[data-retry]"))) {
    button.addEventListener("click", function() {
      return withBusy(async function() {
        await api("retry", { provider: button.dataset.retry });
        await refresh();
        return say("Failed forwards queued for another attempt.");
      });
    });
  }
  q("delete-form").addEventListener("submit", function(event) {
    event.preventDefault();
    if (q("delete-confirm").value !== "DELETE") {
      say("Type DELETE exactly to confirm deletion.", true);
      return;
    }
    ;
    return withBusy(async function() {
      await api("history/delete", {});
      q("delete-confirm").value = "";
      historyCursor = null;
      await refresh();
      return say("Your history and waiting forwards here have been deleted. Already forwarded listens stay on their destination services.");
    });
  });
  q("refresh").addEventListener("click", function() {
    return withBusy(async function() {
      await refresh();
      return say("History refreshed.");
    });
  });
  q("signout").addEventListener("click", async function() {
    if (signingOut) {
      return;
    }
    ;
    signingOut = true;
    q("signout").disabled = true;
    signedOut();
    q("signin").hidden = true;
    say("Signing out. Private information has been cleared from this page\u2026");
    try {
      const response = await fetch(LOGOUT, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(25e3)
      });
      if (!response.ok) {
        throw new Error("Sign-out could not be confirmed. Refresh before using this browser on a shared device.");
      }
      ;
      return say("Signed out. Your listening history is still private to your account.");
    } catch ($4) {
      return say("Sign-out could not be confirmed. Your information is cleared from this page; refresh and try signing out again before leaving a shared browser.", true);
    } finally {
      signingOut = false;
      q("signout").disabled = false;
      q("signin").hidden = false;
    }
    ;
  });
  q("history-latest").addEventListener("click", function() {
    return withBusy(async function() {
      await refresh(null);
      return say("Showing your latest listens.");
    });
  });
  q("history-older").addEventListener("click", function() {
    return withBusy(async function() {
      await refresh(nextHistoryCursor);
      return say("Showing older listens.");
    });
  });
  q("export").addEventListener("click", function() {
    return withBusy(async function() {
      let cursor = null;
      let chunks = [];
      let count = 0;
      let bytes = 0;
      const seenCursors = /* @__PURE__ */ new Set();
      while (true) {
        const data = await api("export", void 0, cursor);
        if (!Array.isArray(data.listens)) {
          throw new Error("The host returned an invalid export page. No partial export was downloaded. Refresh and try again.");
        }
        ;
        const listens = data.listens;
        for (let listen of iterable$(listens)) {
          const line = JSON.stringify(listen);
          bytes += line.length;
          if (bytes > 5e7 || count >= 1e5) {
            throw new Error("This history is too large for a browser export (100,000 listens / 50 MB). Use the authenticated paginated export API documented in the source. No partial export was downloaded.");
          }
          ;
          chunks.push((count ? ",\n" : "") + line);
          count++;
        }
        ;
        cursor = pageCursor(data.next_cursor);
        if (cursor) {
          const key = JSON.stringify([cursor.before, cursor.cursor]);
          if (listens.length === 0 || seenCursors.has(key)) {
            throw new Error("The host returned a history page that does not advance. No partial export was downloaded. Refresh and try again.");
          }
          ;
          seenCursors.add(key);
        }
        ;
        say("Preparing export: " + count.toLocaleString() + " listens\u2026");
        if (!cursor) {
          break;
        }
        ;
      }
      ;
      const file = new Blob(["[\n", ...chunks, "\n]\n"], { type: "application/json" });
      const href = URL.createObjectURL(file);
      const link = globalThis.document.createElement("a");
      link.href = href;
      link.download = "spaceghost-scrobbles-" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) + ".json";
      globalThis.document.body.append(link);
      link.click();
      link.remove();
      const releaseDownload = function() {
        return URL.revokeObjectURL(href);
      };
      window.setTimeout(releaseDownload, 3e4);
      return say("Exported " + count.toLocaleString() + " listens. The file contains public song metadata, not credentials.");
    });
  });
  window.addEventListener("pagehide", function() {
    return signedOut();
  });
  window.addEventListener("pageshow", function() {
    if (busy) {
      return refreshWhenIdle = true;
    } else {
      return withBusy(async function() {
        return await refresh();
      });
    }
    ;
  });
  var poll = function() {
    if (globalThis.document.visibilityState === "visible" && !busy && !q("dashboard").hidden) {
      return withBusy(async function() {
        return await refresh();
      });
    }
    ;
  };
  window.setInterval(poll, 3e4);
  async function loadRecordings(cursor = null) {
    const data = await api("recordings", void 0, cursor);
    if (!Array.isArray(data.recordings)) {
      throw new Error("The host returned an invalid recording list.");
    }
    ;
    q("recordings-usage").textContent = (Number(data.bytes_used) / 1048576).toFixed(1) + " MiB used of " + (Number(data.bytes_limit) / 1073741824).toFixed(0) + " GiB.";
    const list = q("recordings-list");
    list.replaceChildren();
    q("recording-link").value = "";
    q("recording-link-box").hidden = true;
    for (let recording of iterable$(data.recordings)) {
      if (!new RegExp("^[0-9a-f]{64}$").test(recording.id)) {
        throw new Error("The host returned an invalid recording identifier.");
      }
      ;
      const meta = recording.track_metadata || {};
      const row = node("article", "", "recording-row");
      row.append(node("h3", meta.track_name || "Saved recording"), node("p", (meta.artist_name || "") + (meta.release_name ? " \xB7 " + meta.release_name : ""), "small"));
      const actions = node("div", "", "scrobble-actions");
      for (let [label, operation] of [["Play", "open"], ["Create new listening link", "share"], ["Revoke links", "revoke"], ["Delete hosted MP3", "delete"]]) {
        const button = node("button", label, "chip");
        button.type = "button";
        button.addEventListener("click", function() {
          if (operation === "delete" && !window.confirm("Delete this hosted recording and revoke its listening links? Your local MP3 is kept.")) {
            return;
          }
          ;
          return withBusy(async function() {
            const result = await api("recordings/" + recording.id + "/" + operation, {});
            if (operation === "open") {
              if (result.audio_url !== "/mods/ffxiv/scrobble/1/recordings/audio/" + recording.id) {
                throw new Error("The host returned an invalid audio address.");
              }
              ;
              q("recording-player").src = result.audio_url;
              q("recording-player").hidden = false;
              try {
                return await q("recording-player").play();
              } catch ($5) {
                return say("Ready. Press play in the audio controls.");
              }
              ;
            } else if (operation === "share") {
              const link = new URL(result.url);
              if (link.origin !== window.location.origin || link.pathname !== "/mods/ffxiv/scrobble/listen/" || !new RegExp("^#[A-Za-z0-9_-]{43}$").test(link.hash) || link.search) {
                throw new Error("The host returned an invalid listening link.");
              }
              ;
              q("recording-link").value = link.href;
              q("recording-link-box").hidden = false;
              return say("Private link created. It expires in 30 days; any previous link for this song has been revoked.");
            } else {
              q("recording-player").pause();
              q("recording-player").removeAttribute("src");
              q("recording-player").load();
              q("recording-player").hidden = true;
              await loadRecordings();
              return say(operation === "delete" ? "Hosted recording deleted. Your local copy is kept." : "Listening links revoked.");
            }
            ;
          });
        });
        actions.append(button);
      }
      ;
      row.append(actions);
      list.append(row);
    }
    ;
    if (!data.recordings.length) {
      list.append(node("p", "No recordings on this page. Upload one from XivPiano\u2019s Recordings tab.", "empty-state"));
    }
    ;
    recordingsCursor = pageCursor(data.next_cursor);
    return q("recordings-older").hidden = !recordingsCursor;
  }
  q("recordings-refresh").addEventListener("click", function() {
    return withBusy(async function() {
      return await loadRecordings();
    });
  });
  q("recordings-older").addEventListener("click", function() {
    return withBusy(async function() {
      return await loadRecordings(recordingsCursor);
    });
  });
  q("recording-copy").addEventListener("click", async function() {
    try {
      await navigator.clipboard.writeText(q("recording-link").value);
      return say("Listening link copied.");
    } catch ($6) {
      q("recording-link").select();
      return say("Select and copy the listening link above.");
    }
    ;
  });
})();
