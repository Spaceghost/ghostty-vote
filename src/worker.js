// Cloudflare Worker entry. Only /mods/ffxiv/term/vote/api/* runs this code
// (assets.run_worker_first in wrangler.toml); everything else is a static asset.
import { handle } from './app.js';

export default {
  fetch(request, env, ctx) {
    return handle(request, env, ctx);
  },
};
