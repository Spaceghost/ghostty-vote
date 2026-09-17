// Cloudflare Worker entry. Route: spacegho.st/mods/ffxiv/term/vote* (see wrangler.toml).
import page from './page.html';
import { handle } from './app.js';

export default {
  fetch(request, env) {
    return handle(request, env, page);
  },
};
