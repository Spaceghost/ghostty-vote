# ghostty-vote

Public feature vote for the **Ghostty for FFXIV** plugin by Johnneylee Jack Rollins
([github.com/Spaceghost](https://github.com/Spaceghost)), at
`https://spacegho.st/mods/ffxiv/term/vote/`.

It is built to stay on Cloudflare's free tier with as little server-side code as possible:

- **Static files** (the page, `vote.js`, `vote.css`, `ideas.json`, `version.json`) are served by
  [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/) from `public/`.
  Requests for static assets are free and unlimited, and they do not count as Worker requests,
  because the Worker script never runs for them.
- **One small Worker** runs only for `/mods/ffxiv/term/vote/api/*` (`assets.run_worker_first`). It
  records votes and suggestions and returns tallies.
- **D1** (free tier) holds the votes, suggestions and tallies. Each write uses two D1 round trips.
  Tallies are cached for 60 seconds, so a burst of page loads costs one D1 read per Cloudflare
  location.

The Worker route is exactly `spacegho.st/mods/ffxiv/term/vote*`. No other path on the zone is
touched.

## Status

- Tested: `node --test` runs the helpers, the generated static files, the page's static checks
  (no inline code, CSP), and the full API handler against the real migrations and seed on an
  in-memory SQLite database (`node:sqlite`) through a small D1 shim, with a stand-in for the Cache
  API.
- Not yet tested: nothing in this layout has run on Cloudflare. That covers `wrangler` itself,
  Static Assets routing and `_headers`, the Cache API, real D1, the zone route, and the page in a
  real browser. `vote.js` has only been syntax-checked.

## Layout

| Path | What |
| --- | --- |
| `public/mods/ffxiv/term/vote/index.html` | The page (no inline scripts or styles) |
| `public/mods/ffxiv/term/vote/vote.js`, `vote.css` | Page script and styles |
| `public/mods/ffxiv/term/vote/ideas.json` | Generated: `{version, categories[], ideas[]}` (no tallies) |
| `public/mods/ffxiv/term/vote/version.json` | Generated: `{version, ideas, added: {version: count}, url}` |
| `public/_headers` | CSP and other security headers for the static files |
| `src/worker.js` | Worker entry |
| `src/app.js` | The three API endpoints, D1 queries, tally cache, rate limits |
| `src/lib.js` | Pure helpers: routing, cookies, voter hashing, body parsing, validation |
| `data/catalogue.json` | The ideas (the source of truth), with `version` and per-idea `added_version` |
| `scripts/build.js` | Generates `ideas.json`, `version.json` and `seed/seed.sql` from the catalogue (`--check` to verify) |
| `seed/seed.sql` | Generated, idempotent upserts of the catalogue into D1 |
| `migrations/0001_init.sql` | Schema: `catalogue`, `categories`, `ideas`, `votes`, `suggestions`, `write_log` |
| `migrations/0002_drop_site_assets.sql` | Drops the unused `site_assets`/`deploy_sources` tables (`IF EXISTS`) |
| `tests/` | `node --test` suites (no dependencies) |

`wrangler deploy` runs `node scripts/build.js` first (the `[build]` command), so the generated
files are always current when they are uploaded. They are committed too, and the tests fail if
they are stale.

## Endpoints

Static, served without the Worker (paths under `https://spacegho.st/mods/ffxiv/term/vote`):

| Path | Notes |
| --- | --- |
| `/` | The page. `/vote` redirects to `/vote/`. `?since=N` marks ideas newer than version N as new |
| `/ideas.json` | The catalogue |
| `/version.json` | A cheap poll for the plugin (see below) |

Worker:

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/vote` | `{idea_id, vote: "want"\|"maybe"\|"skip", note?}` → `{ok, idea_id, vote, note, tally}`. `vote: null` removes the vote. Leaving out `note` keeps the saved note |
| POST | `/api/suggest` | `{title (3-80 chars), detail? (up to 600)}` → `201 {ok, suggestion: {id, title, detail, created_at}}` |
| GET | `/api/tallies` | `{idea_id: {want, maybe, skip}}` for every open idea. `Cache-Control: public, max-age=60`, also stored in the Cache API under one key (query strings are ignored) |

Any other path that reaches the Worker gets a 404 without touching D1. The server rejects a POST
without `Content-Type: application/json` (415), a body over 4 KB (413), invalid input (400), a
cross-site `Origin` (403), an unknown or retired idea (404) and the wrong method (405).

**The visitor's own ballot.** The page keeps the visitor's votes, notes and suggestions in
`localStorage` (`ghostty-vote:votes`, `ghostty-vote:suggestions`), and sends each change to the
server so it counts in the tallies. There is no endpoint that reads a visitor's votes back.
Clearing site data forgets the ballot on that device. The server still has the earlier votes, and
voting again with the same cookie overwrites them instead of counting twice.

**Voter identity.** The cookie `__Secure-ghostty_voter` holds 32 random bytes and is set
`HttpOnly; Secure; SameSite=Lax; Path=/mods/ffxiv/term/vote`. It is only set together with a
stored write. D1 stores a SHA-256 hash of the token, never the token itself. The app stores no IPs,
accounts or user agents. Each voter gets one vote per idea (an upsert on `(voter, idea_id)`).

**Limits.**
- Each voter can make 60 writes per 10 minutes (counted from `write_log` timestamps).
- Each voter can send 10 suggestions per day.
- The whole site accepts 300 suggestions per day.

Anyone who clears their cookies starts over as a new voter, so the tallies are only a guide. If
abuse shows up, add a Cloudflare WAF rate-limiting rule on `/mods/ffxiv/term/vote/api/`. That rule
runs at Cloudflare's edge, so this app still stores no IPs.

**Nudging from the plugin.** Store the last catalogue version the player saw. Fetch
`https://spacegho.st/mods/ffxiv/term/vote/version.json` (a static file, so polling it is free). If
`version` is greater, count the new ideas as the sum of `added[v]` for every `v` greater than the
stored version, then show a nudge that opens `url + "?since=" + stored`. The page also remembers the
last version it showed in `localStorage` and marks newer ideas as **new**.

## Deploy

You need a Cloudflare login that can edit Workers, Workers Routes on the `spacegho.st` zone, and
D1. Either run `npx wrangler login` once (it opens a browser), or export `CLOUDFLARE_API_TOKEN`
(with those permissions) and `CLOUDFLARE_ACCOUNT_ID`. The route only fires if `spacegho.st` has a
proxied (orange-cloud) DNS record. Array values for `run_worker_first` need Wrangler 4.20 or later.

### Updating the existing deployment

The live Worker `ghostty-vote` and its D1 database (`database_id` is already in `wrangler.toml`)
already have the 0001 schema and the seed.

```sh
cd ~/ghostty-vote
node --test                                   # optional sanity check, no installs

# Drop the unused D1-hosted page. Safe to repeat.
npx wrangler d1 execute ghostty-vote --remote --file migrations/0002_drop_site_assets.sql

# Runs node scripts/build.js, then uploads public/ as static assets and src/worker.js as the script.
npx wrangler deploy

curl -sI https://spacegho.st/mods/ffxiv/term/vote/ | head -1            # expect 200, served as an asset
curl -s  https://spacegho.st/mods/ffxiv/term/vote/version.json          # expect {"version":1,"ideas":55,...}
curl -s  https://spacegho.st/mods/ffxiv/term/vote/api/tallies | head -c 200
```

0002 is applied with `d1 execute` rather than `d1 migrations apply` because the live database was
loaded from an SQL import. It may have no `d1_migrations` rows, and in that case `migrations apply`
would try to run 0001 again and fail on the existing tables. Run
`npx wrangler d1 migrations list ghostty-vote --remote` to see which migrations it records.

### A fresh database

```sh
npx wrangler d1 create ghostty-vote           # put the printed database_id into wrangler.toml
npx wrangler d1 migrations apply ghostty-vote --remote
npx wrangler d1 execute ghostty-vote --remote --file seed/seed.sql
npx wrangler deploy
```

For a local preview, apply the migrations and seed with `--local` instead of `--remote`, run
`npx wrangler dev`, and open `http://localhost:8787/mods/ffxiv/term/vote/`. The voter cookie is
`Secure`, so a browser may refuse to store it over plain `http://localhost`.

## Adding ideas later

1. Edit `data/catalogue.json`:
   - Raise the top-level `version` by one (for example `1` to `2`).
   - Add the new ideas with `"added_version": 2`.
   - Leave the existing ideas' `added_version` alone.
   - To hide an idea, delete it from the file. The seed marks it `retired`, and its votes are kept.
2. Run `node scripts/build.js`, then `node --test`.
3. Run `npx wrangler d1 execute ghostty-vote --remote --file seed/seed.sql`, so the Worker accepts
   votes on the new ideas.
4. Run `npx wrangler deploy` to publish the new `ideas.json` and `version.json`.

The seed is all upserts, so running it again only applies the changes. It never touches votes or
tallies, and it never lowers the catalogue version. Commit `data/catalogue.json` together with the
generated files.

## Reading the results

```sh
npx wrangler d1 execute ghostty-vote --remote --command \
  "SELECT id, want, maybe, skip FROM ideas WHERE retired = 0 ORDER BY want DESC, maybe DESC"
npx wrangler d1 execute ghostty-vote --remote --command \
  "SELECT idea_id, vote, note FROM votes WHERE note <> '' ORDER BY updated_at DESC"
npx wrangler d1 execute ghostty-vote --remote --command \
  "SELECT id, title, detail, datetime(created_at / 1000, 'unixepoch') FROM suggestions WHERE status = 'new'"
npx wrangler d1 execute ghostty-vote --remote --command \
  "UPDATE suggestions SET status = 'accepted' WHERE id = 1"   # or declined / duplicate
```

Suggestion status is for the maintainer only. The page does not show it to visitors.

Triggers on `votes` keep the tallies up to date. If you ever edit `votes` with the triggers
bypassed, rebuild the tallies with:

```sql
UPDATE ideas SET
  want  = (SELECT COUNT(*) FROM votes WHERE idea_id = ideas.id AND vote = 'want'),
  maybe = (SELECT COUNT(*) FROM votes WHERE idea_id = ideas.id AND vote = 'maybe'),
  skip  = (SELECT COUNT(*) FROM votes WHERE idea_id = ideas.id AND vote = 'skip');
```
