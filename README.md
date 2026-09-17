# ghostty-vote

Public feature vote for the **Ghostty for FFXIV** plugin by Johnneylee Jack Rollins
([github.com/Spaceghost](https://github.com/Spaceghost)). One Cloudflare Worker with a D1
database serves the page and a small JSON API at
`https://spacegho.st/mods/ffxiv/term/vote`.

The Worker route is exactly `spacegho.st/mods/ffxiv/term/vote*`. No other path on the zone is
touched, and the Worker returns 404 for anything under that prefix it does not own (for example
`/mods/ffxiv/term/voter`).

## Status

- Tested: `node --test` runs the helpers, and runs the full request handler against the real
  migration and seed on an in-memory SQLite database (`node:sqlite`) through a small D1 shim.
- Not yet tested: nothing has run on Cloudflare. That covers `wrangler` itself, real D1 (including
  the tally triggers in the migration), the zone route, and the page in a real browser. The page
  scripts have only been syntax-checked.

## Layout

| Path | What |
| --- | --- |
| `src/worker.js` | Worker entry; imports `page.html` as text |
| `src/app.js` | Routing, D1 queries, rate limits |
| `src/lib.js` | Pure helpers: cookies, voter hashing, body parsing, validation |
| `src/page.html` | The page (inline CSS/JS, per-response CSP nonce) |
| `migrations/0001_init.sql` | Schema: `catalogue`, `categories`, `ideas`, `votes`, `suggestions`, `write_log` |
| `data/catalogue.json` | The ideas (the source of truth), with `version` and per-idea `added_version` |
| `scripts/gen-seed.js` | Builds `seed/seed.sql` from `data/catalogue.json` |
| `seed/seed.sql` | Generated, idempotent upserts (currently catalogue version 1, 55 ideas) |
| `tests/` | `node --test` suites (no dependencies) |

## Endpoints

All paths are under `https://spacegho.st/mods/ffxiv/term/vote`.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `` (no trailing slash) | The page. `/vote/` redirects here. `?since=N` marks ideas newer than version N as new |
| GET | `/api/ideas` | `{version, categories[], ideas[]}`; each idea has `added_version`, `top_pick` and `tally: {want, maybe, skip}` |
| GET | `/api/mine` | `{votes: {idea_id: {vote, note, updated_at}}, suggestions[]}` for this browser's cookie |
| GET | `/api/version?since=N` | `{version, ideas, new_since, url}`; a cheap check the plugin can poll |
| POST | `/api/vote` | `{idea_id, vote: "want"\|"maybe"\|"skip", note?}`. Sending `vote: null` removes the vote. Leaving out `note` keeps the saved note |
| POST | `/api/suggest` | `{title (3-80 chars), detail? (up to 600)}` |

The server rejects a POST without `Content-Type: application/json` (415), a body over 4 KB (413),
invalid input (400), a cross-site `Origin` (403) and an unknown idea (404).

**Voter identity.** The cookie `__Secure-ghostty_voter` holds 32 random bytes and is set
`HttpOnly; Secure; SameSite=Lax; Path=/mods/ffxiv/term/vote`. It is only set on the first write.
D1 stores a SHA-256 hash of the token, never the token itself. The app stores no IPs, accounts or
user agents. Each voter gets one vote per idea (an upsert on `(voter, idea_id)`).

**Limits.**
- Each voter can make 60 writes per 10 minutes (counted from `write_log` timestamps).
- Each voter can send 10 suggestions per day.
- The whole site accepts 300 suggestions per day.

Anyone who clears their cookies starts over with no history, so the tallies are only a guide. If
abuse shows up, add a Cloudflare WAF rate-limiting rule on `/mods/ffxiv/term/vote/api/`. That rule
runs at Cloudflare's edge, so this app still stores no IPs.

**Nudging from the plugin.** Store the last catalogue version the player saw. Call
`GET /api/version?since=<that>`. If `version` is greater, show a nudge that opens `url`, which
already includes `?since=`. The page also remembers the last version it showed in `localStorage`
and marks newer ideas as **new**.

## Deploy

You need a Cloudflare login that can edit Workers, Workers Routes on the `spacegho.st` zone, and
D1. Either run `npx wrangler login` once (it opens a browser), or export `CLOUDFLARE_API_TOKEN`
(with those permissions) and `CLOUDFLARE_ACCOUNT_ID`. The route only fires if `spacegho.st` has
a proxied (orange-cloud) DNS record.

```sh
cd ~/ghostty-vote
node --test                                              # optional sanity check, no installs

npx wrangler d1 create ghostty-vote
# copy the printed database_id into wrangler.toml, replacing REPLACE_WITH_DATABASE_ID

npx wrangler d1 migrations apply ghostty-vote --remote
npx wrangler d1 execute ghostty-vote --remote --file seed/seed.sql
npx wrangler deploy

curl -s https://spacegho.st/mods/ffxiv/term/vote/api/version   # expect {"version":1,"ideas":55,...}
```

For a local preview, run `npx wrangler d1 migrations apply ghostty-vote --local`, then
`npx wrangler d1 execute ghostty-vote --local --file seed/seed.sql`, then `npx wrangler dev`, and
open `http://localhost:8787/mods/ffxiv/term/vote`.

## Adding ideas later

1. Edit `data/catalogue.json`:
   - Raise the top-level `version` by one (for example `1` to `2`).
   - Add the new ideas with `"added_version": 2`.
   - Leave the existing ideas' `added_version` alone.
   - To hide an idea, delete it from the file. The seed marks it `retired`, and its votes are kept.
2. Run `node scripts/gen-seed.js` to regenerate `seed/seed.sql`, then `node --test`. The tests fail
   if the seed is stale.
3. Run `npx wrangler d1 execute ghostty-vote --remote --file seed/seed.sql`.

Nothing needs to be redeployed. The seed is all upserts, so running it again only applies the
changes. It never touches votes or tallies, and it never lowers the catalogue version. Commit both
`data/catalogue.json` and `seed/seed.sql`.

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

Triggers on `votes` keep the tallies up to date. If you ever edit `votes` with the triggers
bypassed, rebuild the tallies with:

```sql
UPDATE ideas SET
  want  = (SELECT COUNT(*) FROM votes WHERE idea_id = ideas.id AND vote = 'want'),
  maybe = (SELECT COUNT(*) FROM votes WHERE idea_id = ideas.id AND vote = 'maybe'),
  skip  = (SELECT COUNT(*) FROM votes WHERE idea_id = ideas.id AND vote = 'skip');
```
