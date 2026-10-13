// Generated from imba/public/mods/ffxiv/site/theme.imba; edit the Imba source.
(() => {
  // public/mods/ffxiv/site/theme.js
  var key = "ghostty-vote:theme";
  var root = globalThis.document.documentElement;
  function readTheme() {
    try {
      const value = window.localStorage.getItem(key);
      return ["dark", "light"].includes(value) ? value : "";
    } catch ($1) {
      return "";
    }
    ;
  }
  function applyTheme(value) {
    var $2;
    if (value) {
      root.dataset.theme = value;
    } else {
      $2 = root.dataset.theme, delete root.dataset.theme, $2;
    }
    ;
    const button = globalThis.document.querySelector("#theme");
    if (button) {
      button.textContent = "theme: " + (value || "auto");
      return button.setAttribute("aria-label", "Colour theme: " + (value || "automatic") + ". Change theme");
    }
    ;
  }
  applyTheme(readTheme());
  function start() {
    const button = globalThis.document.querySelector("#theme");
    if (!button || button.familyThemeOwned) {
      return;
    }
    ;
    button.familyThemeOwned = true;
    button.addEventListener("click", function() {
      const value = root.dataset.theme || "";
      const next = value == "" ? "dark" : value == "dark" ? "light" : "";
      try {
        if (next) {
          window.localStorage.setItem(key, next);
        } else {
          window.localStorage.removeItem(key);
        }
        ;
      } catch ($3) {
      }
      ;
      return applyTheme(next);
    });
    return applyTheme(readTheme());
  }
  window.addEventListener("storage", function(event) {
    if (event.key == key) {
      return applyTheme(readTheme());
    }
    ;
  });
  if (globalThis.document.readyState == "loading") {
    globalThis.document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
