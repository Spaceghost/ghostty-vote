// Cloudflare Worker entry. Only the paths in assets.run_worker_first (wrangler.toml) run
// this code; everything else is a static asset.
//
// analyticsFetch (src/analytics.js) wraps the app rather than living inside it: it
// answers its own three paths, refuses anything on the owner's deny list, and otherwise
// calls handle() unchanged and counts the answer afterwards, fire-and-forget. app.js does
// not know it exists, and a fault in it cannot change a response.
import { handle } from './app.js';
import { analyticsFetch } from './analytics.js';

export default {
  fetch(request, env, ctx) {
    return analyticsFetch(request, env, ctx, handle);
  },
};
