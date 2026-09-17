# ghostty-vote

Public feature vote for the **Ghostty for FFXIV** plugin by Johnneylee Jack Rollins
([github.com/Spaceghost](https://github.com/Spaceghost)), at
`https://spacegho.st/mods/ffxiv/term/vote/`.

It is built to stay on Cloudflare's free tier with as little server-side code as possible:

- **Static files** (the page, `ballot.js`, `vote.js`, `vote.css`, `ideas.json`, `version.json`) are served by
  [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/) from `public/`.
  Requests for static assets are free and unlimited, and they do not count as Worker requests,
  because the Worker script never runs for them.
- **One small Worker** runs only for `/mods/ffxiv/term/vote/api/*` (`assets.run_worker_first`). It
  records votes, notes and suggestions, returns tallies, and hands each visitor back their own
  ballot.
- **D1** (free tier) holds the votes, notes, suggestions and tallies. Each write uses two D1 round
  trips, and reading a visitor's own ballot uses one. Tallies are cached for 60 seconds, so a burst
  of page loads costs one D1 read per Cloudflare location.

The Worker route is exactly `spacegho.st/mods/ffxiv/term/vote*`. No other path on the zone is
touched.

## Status

- Tested: `node --test` runs the helpers, the generated static files, the page's static checks
  (no inline code, CSP), and the full API handler against the real migrations and seed on an
  in-memory SQLite database (`node:sqlite`) through a small D1 shim, with a stand-in for the Cache
  API. That includes migration 0003 on a database that already has votes, every vote/note
  transition with the tallies recounted after each step, `api/mine` (and that it never touches D1
  without a cookie), and the rate limit. The page's ballot logic in `ballot.js` (merging the
  server ballot with local edits, the save queue's coalescing, retries, 429 hold and keepalive
  flush) runs under fake timers in `tests/ballot.test.js`.
- Checked once by hand, not in the repo: the page was driven in headless Firefox 156 (WebDriver
  BiDi) against a local Node stand-in that served `public/` with the `_headers` CSP and passed
  `api/*` to the same handler and D1 shim over plain HTTP, with the voter cookie renamed and
  without `Secure` for that. Observed there: votes and note-only notes saving, clearing a vote
  keeping the note, one request for quick typing, `will retry…` on an injected 503 and on a 429
  with `Retry-After`, the ballot coming back after `localStorage.clear()` and in a second tab, the
  `storage` sync between tabs, a note typed and the tab closed inside the debounce still arriving,
  55 quick votes and 30 notes all stored, five simultaneous first clicks sharing one voter, and no
  console errors. A later review pass re-ran that driver in the same way and added: a note typed
  while a slow vote request was in flight (and a vote clicked while a slow note was in flight)
  neither reverted; a vote cleared during a retry wait stayed cleared; a focused but untouched note
  box picked up another tab's newer note; a trimmed save echo did not rewrite the box being typed
  in; the ballot stayed on the page when the server dropped the cookie; a first click followed by
  an immediate tab close was stored. In that re-run the driver's own "note saved after closing the
  tab" step failed for the page both before and after the review changes, because the driver types
  into a tab that is already in the background; a separate check that types in the visible tab and
  then closes it (or navigates away) passed.
- Not yet tested: nothing in this layout has run on Cloudflare. That covers `wrangler` itself,
  Static Assets routing and `_headers`, the Cache API, real D1 (including migration 0003 on the
  live database), the zone route, the real `__Secure-` cookie, and any browser other than that
  one headless Firefox (Chrome, Safari, mobile, and a real tab close or app switch).

## Layout

| Path | What |
| --- | --- |
| `public/mods/ffxiv/term/vote/index.html` | The page (no inline scripts or styles) |
| `public/mods/ffxiv/term/vote/vote.js`, `vote.css` | Page script and styles |
| `public/mods/ffxiv/term/vote/ballot.js` | The page's DOM-free ballot logic (merge, save queue), loaded before `vote.js` and unit-tested |
| `public/mods/ffxiv/term/vote/ideas.json` | Generated: `{version, categories[], ideas[]}` (no tallies) |
| `public/mods/ffxiv/term/vote/version.json` | Generated: `{version, ideas, added: {version: count}, url}` |
| `public/_headers` | CSP and other security headers for the static files |
| `src/worker.js` | Worker entry |
| `src/app.js` | The four API endpoints, D1 queries, tally cache, rate limits |
| `src/lib.js` | Pure helpers: routing, cookies, voter hashing, body parsing, validation |
| `data/catalogue.json` | The ideas (the source of truth), with `version` and per-idea `added_version` |
| `scripts/build.js` | Generates `ideas.json`, `version.json` and `seed/seed.sql` from the catalogue (`--check` to verify) |
| `seed/seed.sql` | Generated, idempotent upserts of the catalogue into D1 |
| `migrations/0001_init.sql` | Schema: `catalogue`, `categories`, `ideas`, `votes`, `suggestions`, `write_log` |
| `migrations/0002_drop_site_assets.sql` | Drops the unused `site_assets`/`deploy_sources` tables (`IF EXISTS`) |
| `migrations/0003_note_only_votes.sql` | Rebuilds `votes` so a row can hold a note without a vote (`vote = ''`), then recounts the tallies |
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
| POST | `/api/vote` | `{idea_id, vote?, note?}` → `{ok, idea_id, vote: string\|null, note, tally, updated_at}`. `vote`: `"want"\|"maybe"\|"skip"` sets it, `null` or `""` clears it, leaving it out keeps it. `note` (up to 280): a string sets it (`""` clears it), leaving it out or `null` keeps it. At least one of the two is required. Clearing a vote keeps the note; a row left with neither is deleted |
| POST | `/api/suggest` | `{title (3-80 chars), detail? (up to 600)}` → `201 {ok, suggestion: {id, title, detail, created_at}}` |
| GET | `/api/tallies` | `{idea_id: {want, maybe, skip}}` for every open idea. `Cache-Control: public, max-age=60`, also stored in the Cache API under one key (query strings are ignored). Sent without credentials |
| GET | `/api/mine` | The caller's own ballot: `{votes: {idea_id: {vote: string\|null, note, updated_at}}, suggestions: [{id, title, detail, created_at}]}` (the newest 50 suggestions). `Cache-Control: private, no-store`, `Vary: Cookie`, never put in the Cache API. Without a valid voter cookie it returns `{votes: {}, suggestions: []}` without querying D1; with one, it is one D1 batch. A cross-site request gets a 403 |

Any other path that reaches the Worker gets a 404 without touching D1. The server rejects a POST
without `Content-Type: application/json` (415), a body over 4 KB (413), invalid input (400), a
cross-site `Origin` (403), an unknown or retired idea (404) and the wrong method (405). Tallies
count only rows with a vote; a note-only row counts toward nothing.

**The visitor's own ballot.** Votes, notes and suggestions are kept on the server, keyed by the
voter cookie, and the page loads them back from `GET api/mine` every time it opens, so a reload, a
second tab or a browser with cleared `localStorage` shows the same ballot. The page also keeps a
copy in `localStorage` (`ghostty-vote:votes`, `ghostty-vote:suggestions`) to paint straight away
and to show when the server cannot be reached; when `api/mine` answers, the server copy replaces
it, except for ideas where a note is being typed or a change is still being saved. Open tabs pick
up each other's saved changes through the `storage` event, and a tab re-reads `api/mine` when it
becomes visible again (at most every 30 seconds).

How the page saves: a click on Want, Maybe or Skip saves at once, and clicking the active choice
clears the vote (sent as `vote: null`, which keeps the note). The note box is always enabled; a
note saves about 700 ms after typing pauses (or when the box loses focus), sent without `vote`, so
it never changes the vote. Each card shows `saving…`, `saved`, `offline; will retry…` (or `busy`
or `server error`), or the server's error. The page keeps at most one request in flight per idea;
changes made meanwhile are merged and sent next, newest text winning, so an older note is never
sent after a newer one. Network failures and 5xx responses are retried after 1, 2, 4 … up to 60
seconds; a 429 holds every save until its `Retry-After`. Every save is sent with `fetch`
`keepalive`, so a request already on its way still arrives if the tab closes; when the page is
hidden or closed (`visibilitychange`, `pagehide`), typed notes and waiting changes are sent right
away the same way. Other 4xx answers (a retired idea, say) are
not retried; a refused vote goes back to what the server has, and typed note text stays in the box.

**Clearing cookies.** The ballot is found only through the cookie. A browser that loses it (cleared
cookies, a different browser or device, or 400 days without saving anything) gets an empty ballot back from
`api/mine`, and the page shows that. Its next vote starts a new voter. The old ballot stays on the
server and in the tallies, and nothing can link the two, so tallies can count that person twice.
A browser that does not keep the cookie at all (cookies blocked for the site) still saves each
change, but under a new voter every time; the page then keeps showing what it saved during that
visit instead of letting an empty `api/mine` answer wipe it, and a reload shows an empty ballot.

**Voter identity.** The cookie `__Secure-ghostty_voter` holds 32 random bytes and is set
`HttpOnly; Secure; SameSite=Lax; Path=/mods/ffxiv/term/vote`. It is only set (and its 400 days
renewed) together with a stored write; `api/mine` reads it but never sets it. D1 stores a SHA-256
hash of the token, never the token itself. The app stores no IPs, accounts or user agents. Each
voter gets one row per idea (an upsert on `(voter, idea_id)`) holding their vote, note, or both.
Until a first-time visitor's first write has come back, the page sends writes one at a time, so
two early clicks cannot be given two different cookies.

**Limits.**
- Each voter can make 300 writes per 10 minutes (votes, note saves and suggestions together,
  counted from `write_log` timestamps). It was 60, and a real session went past that: 55 votes in
  five minutes, after which note saves failed with 429. The page now also retries a 429 instead of
  dropping the note.
- Each voter can send 10 suggestions per day.
- The whole site accepts 300 suggestions per day.

Why 300 fits the D1 free tier (100,000 rows written and 5 million rows read per day): a vote or
note write inserts a `write_log` row (plus its two indexes), prunes an expired one, and upserts
the vote row (plus its index) with a tally update, about 9 rows written. A voter who uses a whole
window costs about 2,700 rows written, under 3% of the day, and at most 300 × 300 = 90,000 rows
read, because each write's precheck counts the voter's window. A person voting on all 55 ideas and
writing notes stays well under one window. The limit protects against a runaway page, not against
abuse: anyone can get a new cookie and a new count, so a scripted attacker could still use up the
daily free rows (on the free plan that should mean refused queries until the daily reset, not a
bill; check Cloudflare's current D1 pricing, this was not observed here), and the page would show
`server error; will retry…`. A Cloudflare WAF rate-limiting rule (below) is the real guard.

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

# Allow note-only ballot rows (rebuilds votes, then recounts tallies). Apply it BEFORE deploying the
# new Worker: the new code writes vote = '', which the old CHECK rejects. The old Worker keeps
# working on the new table.
# First, note a Time Travel bookmark to restore if anything looks wrong afterwards (restoring is
# destructive and overwrites the whole database; the free plan keeps 7 days), and check that votes
# has only the 0001 index and triggers: the rebuild recreates votes_idea and the three
# votes_tally_* triggers, and anything else on the table would be dropped with it.
npx wrangler d1 time-travel info ghostty-vote
npx wrangler d1 execute ghostty-vote --remote --command \
  "SELECT type, name FROM sqlite_master WHERE tbl_name = 'votes'"   # expect votes, its autoindex, votes_idea, 3 triggers
# Cloudflare's docs say D1 runs every query and migration in an implicit transaction (and imported
# files must not contain BEGIN/COMMIT), so the rebuild should be all or nothing; that has not been
# observed here, so run it while the page is quiet.
npx wrangler d1 execute ghostty-vote --remote --file migrations/0003_note_only_votes.sql
npx wrangler d1 execute ghostty-vote --remote --command \
  "SELECT sql FROM sqlite_master WHERE name = 'votes'"          # expect vote IN ('', 'want', ...)
# Only if it went wrong: npx wrangler d1 time-travel restore ghostty-vote --bookmark=<bookmark from info>

# Runs node scripts/build.js, then uploads public/ as static assets and src/worker.js as the script.
npx wrangler deploy

curl -sI https://spacegho.st/mods/ffxiv/term/vote/ | head -1            # expect 200, served as an asset
curl -s  https://spacegho.st/mods/ffxiv/term/vote/version.json          # expect {"version":1,"ideas":55,...}
curl -s  https://spacegho.st/mods/ffxiv/term/vote/api/tallies | head -c 200
```

0002 and 0003 are applied with `d1 execute` rather than `d1 migrations apply` because the live database was
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
  "SELECT idea_id, vote, note FROM votes WHERE note <> '' ORDER BY updated_at DESC"   # vote '' = a note without a vote
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
