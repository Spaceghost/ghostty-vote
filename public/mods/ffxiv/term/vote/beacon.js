// Generated from imba/public/mods/ffxiv/term/vote/beacon.imba; edit the Imba source.
(() => {
  // public/mods/ffxiv/term/vote/beacon.js
  function cursor$1() {
    "use strict";
    try {
      var n = window.navigator || {};
      if (n.doNotTrack === "1" || window.doNotTrack === "1" || n.msDoNotTrack === "1" || n.globalPrivacyControl === true) {
        return;
      }
      ;
      var url = "/mods/ffxiv/term/vote/api/beacon";
      var body = JSON.stringify({ p: String(window.location.pathname).slice(0, 200), r: String(globalThis.document.referrer || "").slice(0, 200) });
      var send = function() {
        try {
          if (typeof n.sendBeacon === "function" && n.sendBeacon(url, new Blob([body], { type: "text/plain" }))) {
            return;
          }
          ;
          if (typeof window.fetch === "function") {
            window.fetch(url, { method: "POST", body, keepalive: true, credentials: "omit", cache: "no-store", headers: { "content-type": "text/plain" } }).catch(
              function() {
                return;
              }
            );
          }
          ;
        } catch (e) {
        }
        ;
        return;
      };
      if (globalThis.document.readyState === "complete") {
        send();
      } else {
        window.addEventListener("load", send, { once: true });
      }
      ;
    } catch (e) {
    }
    ;
    return;
  }
  cursor$1();
})();
