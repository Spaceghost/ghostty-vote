// One line to the site's own Worker saying which of these pages was opened, so the owner
// can see whether anybody is reading them. It is the whole of the page-side analytics.
//
// It sets and reads no cookie and no storage of any kind, sends nothing that identifies
// you, runs on this site only, and never loads anything from anywhere else. The body is
// two fields: this page's path, and the host of the page that linked here if your browser
// offered one (the host alone, never the address, never a query string). The Worker adds
// them to a daily counter shared by everyone who opened the same page.
//
// If your browser says Do Not Track or Global Privacy Control, nothing is sent at all.
// What is kept, and for how long, is at /mods/ffxiv/term/vote/privacy/.
(function () {
  'use strict';
  try {
    var n = window.navigator || {};
    if (n.doNotTrack === '1' || window.doNotTrack === '1' || n.msDoNotTrack === '1' || n.globalPrivacyControl === true) return;
    var url = '/mods/ffxiv/term/vote/api/beacon';
    var body = JSON.stringify({ p: String(window.location.pathname).slice(0, 200), r: String(document.referrer || '').slice(0, 200) });
    var send = function () {
      try {
        // text/plain so the browser sends it without a preflight; the Worker parses it
        // as JSON itself. Failure is ignored: this must never be visible on the page.
        if (typeof n.sendBeacon === 'function' && n.sendBeacon(url, new Blob([body], { type: 'text/plain' }))) return;
        if (typeof window.fetch === 'function') {
          window.fetch(url, {
            method: 'POST', body: body, keepalive: true, credentials: 'omit', cache: 'no-store',
            headers: { 'content-type': 'text/plain' },
          }).catch(function () {});
        }
      } catch (e) { /* silence is the point */ }
    };
    if (document.readyState === 'complete') send();
    else window.addEventListener('load', send, { once: true });
  } catch (e) { /* silence is the point */ }
})();
