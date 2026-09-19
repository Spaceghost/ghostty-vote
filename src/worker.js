// Cloudflare Worker entry. Only the paths in assets.run_worker_first (wrangler.toml) run
// this code; everything else is a static asset.
import { handle } from './app.js';

export default {
  fetch(request, env, ctx) {
    return handle(request, env, ctx);
  },
};
