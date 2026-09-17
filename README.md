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
  signs voters in with GitHub or FFXIV (XIVAuth), records votes, notes and suggestions, returns
  tallies, and hands each voter back their own ballot.
- **D1** (free tier) holds the votes, notes, suggestions and tallies. Each write uses two D1 round
  trips, and reading a visitor's own ballot uses one. Tallies are cached for 60 seconds, so a burst
  of page loads costs one D1 read per Cloudflare location.

The Worker route is exactly `spacegho.st/mods/ffxiv/term/vote*`. No other path on the zone is
touched. There are no Durable Objects, KV namespaces or other bindings: sessions are signed cookies.

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
- Sign-in: `node --test` covers the signed cookies (sign, verify, tampering,
  purpose, expiry, secret rotation), OAuth state checks, the return-path check against open
  redirects, voter key derivation, admin gating, the anonymous-ballot claim with tallies recounted,
  migration 0004 on a database that already has 0001-0003 and votes, and both providers' callbacks
  through the real handler with a scripted `fetch` standing in for GitHub and XIVAuth. The page and
  admin page were driven once in headless Firefox 156 (Marionette) against a local Node stand-in
  (same approach as above: cookies renamed without `__Secure-`/`Secure`, provider authorize pages
  faked, provider APIs scripted): signed out with disabled controls and the prompt, the old-ballot
  hint, GitHub sign-in with the claim, voting and reload, linking and forgetting a character, the
  admin list, sign-out, the admin page signed out, and an error fragment. That run is not in the repo,
  and predates the change that made FFXIV sign-in ask for `user` only and offered the link to FFXIV
  sessions; that change is covered by `node --test` only.
- Not verified against the real providers: nothing has signed in with the real GitHub App or
  XIVAuth client. The XIVAuth request and response shapes come from its source (XIVAuth/XIVAuth at
  4bc2440, Doorkeeper 5.9.6), not live calls; the GitHub ones from GitHub's docs. In particular:
  GitHub's token endpoint accepting a form body (its docs show query parameters), XIVAuth's
  `api/v1/characters` list shape and the exact portrait host (`img2.finalfantasyxiv.com` in
  XIVAuth's Lodestone fixtures; the Worker keeps any `https://*.finalfantasyxiv.com` URL and the CSP
  allows the same), and whether XIVAuth skips its consent screen (and so the character choice) for
  a returning voter.
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
| `public/mods/ffxiv/term/vote/admin/index.html`, `admin.js` | The owner's voter list: a static shell, data only from `api/admin/voters` |
| `src/app.js` | Routing, the ballot endpoints, D1 queries, tally cache, rate limits |
| `src/auth.js` | Sign-in (GitHub, XIVAuth), the claim, `me`, logout, forget, the admin voter list |
| `src/session.js` | Signed cookies (HMAC-SHA256), account keys, admin gating, return-path check, PKCE |
| `src/lib.js` | Pure helpers: routing table, cookies, hashing, body parsing, validation |
| `data/catalogue.json` | The ideas (the source of truth), with `version` and per-idea `added_version` |
| `scripts/build.js` | Generates `ideas.json`, `version.json` and `seed/seed.sql` from the catalogue (`--check` to verify) |
| `seed/seed.sql` | Generated, idempotent upserts of the catalogue into D1 |
| `migrations/0001_init.sql` | Schema: `catalogue`, `categories`, `ideas`, `votes`, `suggestions`, `write_log` |
| `migrations/0002_drop_site_assets.sql` | Drops the unused `site_assets`/`deploy_sources` tables (`IF EXISTS`) |
| `migrations/0003_note_only_votes.sql` | Rebuilds `votes` so a row can hold a note without a vote (`vote = ''`), then recounts the tallies |
| `migrations/0004_sign_in.sql` | Adds the `characters` table (additive, `IF NOT EXISTS`) |
| `tests/` | `node --test` suites (no dependencies) |

`wrangler deploy` runs `node scripts/build.js` first (the `[build]` command), so the generated
files are always current when they are uploaded. They are committed too, and the tests fail if
they are stale.

## Endpoints

Static, served without the Worker (paths under `https://spacegho.st/mods/ffxiv/term/vote`):

| Path | Notes |
| --- | --- |
| `/` | The page. `/vote` redirects to `/vote/`. `?since=N` marks ideas newer than version N as new |
| `/admin/` | The owner's voter list (`X-Robots-Tag: noindex`). Holds no data; shows nothing without an admin session |
| `/ideas.json` | The catalogue |
| `/version.json` | A cheap poll for the plugin (see below) |

Worker:

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/vote` | Needs a session (else 401 `sign_in_required`). `{idea_id, vote?, note?}` → `{ok, idea_id, vote: string\|null, note, tally, updated_at}`. `vote`: `"want"\|"maybe"\|"skip"` sets it, `null` or `""` clears it, leaving it out keeps it. `note` (up to 280): a string sets it (`""` clears it), leaving it out or `null` keeps it. At least one of the two is required. Clearing a vote keeps the note; a row left with neither is deleted |
| POST | `/api/suggest` | Needs a session. `{title (3-80 chars), detail? (up to 600)}` → `201 {ok, suggestion: {id, title, detail, created_at}}` |
| GET | `/api/tallies` | `{idea_id: {want, maybe, skip}}` for every open idea. `Cache-Control: public, max-age=60`, also stored in the Cache API under one key (query strings are ignored). Sent without credentials |
| GET | `/api/mine` | The signed-in voter's own ballot: `{signed_in, votes: {idea_id: {vote: string\|null, note, updated_at}}, suggestions: [{id, title, detail, created_at}]}` (the newest 50 suggestions). `Cache-Control: private, no-store`, `Vary: Cookie`, never put in the Cache API. Without a valid session it returns `{signed_in: false, votes: {}, suggestions: []}` without querying D1; with one, it is one D1 batch. A cross-site request gets a 403 |
| GET | `/api/auth/github/start`, `/api/auth/xivauth/start` | Navigations. `?return=` may name the vote page (keeping a numeric `?since=`) or `/admin/`; anything else returns to the vote page. Sets the state cookie and redirects (303) to the provider. A cross-site start is refused |
| GET | `/api/auth/xivauth/link` | Like start, for any signed-in voter (GitHub or FFXIV): asks XIVAuth for the `character` scope only and attaches that character to the signed-in account |
| GET | `/api/auth/github/callback`, `/api/auth/xivauth/callback` | The registered callback URLs. Checks the state, exchanges the code (with the PKCE verifier), reads the account id (or, for a link, the character), claims an old anonymous ballot, sets the session and redirects to the page with `#signed-in`, `#character-linked` or `#auth-error=<code>` |
| GET | `/api/auth/me` | `{signed_in: false, legacy_ballot}` without D1, or `{signed_in: true, provider, character: {name, world, portrait_url}\|null, admin}` (one query). Renews a session with under 15 days left |
| POST | `/api/auth/logout` | Same-origin only. Clears the session cookie; no D1 |
| POST | `/api/auth/character/forget` | Same-origin, needs a session. Deletes the voter's character row; votes stay |
| GET | `/api/admin/voters` | Only for accounts in `ADMIN_ACCOUNTS` (401 signed out, 403 otherwise, both before D1). One D1 batch: every voter with `{voter, you, character, want, maybe, skip, last_active, notes[], suggestions[]}` plus `totals`. `Cache-Control: private, no-store` |

Any other path that reaches the Worker gets a 404 without touching D1. The server rejects a POST
without `Content-Type: application/json` (415), a body over 4 KB (413), invalid input (400), a
cross-site `Origin` (403), an unknown or retired idea (404) and the wrong method (405). Tallies
count only rows with a vote; a note-only row counts toward nothing.

**The voter's own ballot.** Votes, notes and suggestions are kept on the server, keyed by the
signed-in account, and the page loads them back from `GET api/mine` every time it opens, so a
reload, a second tab, another browser signed in to the same account or a browser with cleared
`localStorage` shows the same ballot. Signed out, the vote buttons are `aria-disabled` (a click
points at the sign-in buttons), the note boxes and suggestion form are disabled, and the local copy
is cleared unless the browser still has an old anonymous ballot to claim; signing out clears it too.
A 401 from any save flips the page to signed out. The page also keeps a
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

## Sign-in

Voting, notes and suggestions need a sign-in with **GitHub** (the GitHub App
`ghostty-for-ffxiv-vote`, user-to-server OAuth, no repository permissions) or **FFXIV** through
[XIVAuth](https://xivauth.net) (a confidential client; sign-in asks for the `user` scope, linking a
character for `character`). The
tallies stay public and cached without any sign-in.

**One ballot per account.** A signed-in voter's key is `sha256hex('provider:' + provider_user_id)`,
for example `sha256hex('github:251370')`, stored in the same `voter` columns as before. The GitHub
id is the numeric user id; the XIVAuth id is its user UUID. The key is not anonymous and not a
pseudonym: there is no secret in it, GitHub ids are public (`GET https://api.github.com/user/<id>`),
and anyone who knows an account id can compute the key. Votes, notes and suggestions are linked to
the voter's GitHub or XIVAuth account id, and the site owner can see them.

**Flow.** `start` creates a random state and a PKCE verifier (S256; GitHub supports it, XIVAuth
supports it and does not require it for confidential clients), puts both in a signed state cookie
(`__Secure-ghostty_oauth`, `Path=/mods/ffxiv/term/vote/api/auth`, 20 minutes, `HttpOnly; Secure;
SameSite=Lax`) and redirects to the provider. The callback checks the signature, expiry, provider and
state (constant time), exchanges the code with the client secret and verifier, and reads:

- GitHub: `GET https://api.github.com/user` (with `User-Agent`), keeping only `id`.
- XIVAuth sign-in (scope `user`): `GET https://xivauth.net/api/v1/user`, keeping only `id`. No
  character is asked for, on purpose: with `character` in the scope, XIVAuth's
  `OAuth::PreflightCheck` (source at 4bc2440, not observed live) refuses a user with no verified
  character on its own error page ("You have no verified characters") before consent, and never
  redirects back, so that visitor could not sign in with FFXIV at all.
- XIVAuth link (scope `character`): `GET https://xivauth.net/api/v1/characters`, keeping the first
  character's name, home world, Lodestone id and portrait URL. With the plain `character` scope
  XIVAuth returns at most the one character the voter picked on its consent screen. If the list is
  empty, nothing is stored and the page gets `#auth-error=no-character`. A voter with no verified
  character still hits XIVAuth's preflight page here, and stays on xivauth.net; the page says next
  to the link button that linking needs a verified character.

The access token is used only inside that callback and then dropped: it is never stored, put in a
cookie or logged, and no refresh token is asked for. Errors log the provider, stage and HTTP status
only.

**Sessions** are a stateless cookie, `__Secure-ghostty_session`
(`Path=/mods/ffxiv/term/vote; HttpOnly; Secure; SameSite=Lax`, 30 days): `v1.<base64url JSON
{p: provider, k: voter key, iat, exp}>.<base64url HMAC-SHA256>`, where `iat` is the sign-in time.
The MAC covers the version and a purpose (`session` or `oauth`), so a state cookie never passes as
a session, and it is verified with WebCrypto `crypto.subtle.verify`. `api/auth/me` re-issues a
session that has under 15 days left, so a regular visitor stays signed in. The renewed cookie keeps
the original `iat`, and its `exp` never goes past `iat` + 90 days (`iat` + 14 days for an
`ADMIN_ACCOUNTS` entry, whose cookie gets that shorter lifetime from sign-in on). A session older than
that is refused as expired whatever its `exp` says, and is not renewed, so everyone signs in again
at least every 90 days (admins every 14). Nothing about sessions is stored server-side, so signing
out clears the cookie in that browser only; a copied cookie keeps working until its `exp` or that
limit, whichever comes first.

**Rotating `SESSION_SECRET`.** It must be at least 32 characters, or sign-in answers
`#auth-error=not-configured` and every write gets 401. To rotate without signing everyone out, set
the current value as `SESSION_SECRET_PREVIOUS`, set a new `SESSION_SECRET`, and delete
`SESSION_SECRET_PREVIOUS` after 30 days. To sign everyone out at once, change `SESSION_SECRET` alone.

**If `SESSION_SECRET` leaks** (anyone holding it can sign a session for any account, including an
admin), do not use the rotation above: that keeps the leaked value valid as
`SESSION_SECRET_PREVIOUS`. Replace `SESSION_SECRET` with a new random value and make sure
`SESSION_SECRET_PREVIOUS` is unset (`npx wrangler secret delete SESSION_SECRET_PREVIOUS` if
`npx wrangler secret list` shows it). Every existing session, forged or not, stops working at once,
and voters sign in again.

**Characters.** Any signed-in voter, GitHub or FFXIV, can add one with **Link an FFXIV
character**: an XIVAuth authorization that asks only for `character` and attaches it to the
signed-in account (the state cookie names that account, and the callback refuses if a different
one is signed in by then). An FFXIV sign-in stores no character by itself, so an FFXIV voter who
wants one shown links it as a second step. The character goes in `characters`, keyed by the voter
key: `lodestone_id`, `name`, `world`, `portrait_url` (kept only if it is `https` on
`*.finalfantasyxiv.com`, else `''`), `first_seen` and `last_seen` (epoch ms; `first_seen` starts
over when the character changes, `last_seen` moves on each link). **Forget my character** deletes
the row; the ballot stays. Next to the sign-in buttons the page says: "Signing in with FFXIV needs
an XIVAuth account and shares no character. After signing in you can link one, which needs a
character verified on XIVAuth." Next to the link button: "Linking needs a character verified on
XIVAuth, and shares the character you choose (name and world) with the site owner."

**Claiming an old ballot.** Ballots from before sign-in are keyed by the anonymous cookie
`__Secure-ghostty_voter`, which is no longer handed out. When a browser that still has it signs in,
the callback moves that ballot onto the account in the same D1 batch: votes and notes for ideas the
account has no row for change owner. Where the account already has a row for an idea, that row
keeps its vote and note and only fills what is empty from the anonymous row (an empty vote takes
the anonymous vote, an empty note the anonymous note); then the anonymous row is deleted.
Suggestions and the rate-limit log follow. Moving a row does not touch its vote column, so the
tally triggers leave it alone; filling an empty vote fires the UPDATE trigger, which counts it; and
deleting the anonymous row fires the DELETE trigger, which takes its vote out of the tallies, so
each vote is counted exactly once. Then the cookie is cleared. Signed out, the
page says so when it sees that cookie (`legacy_ballot`) and keeps showing the local copy.
Anonymous ballots that nobody claims stay in the tallies, as before.

**Owner-only voter list.** `ADMIN_ACCOUNTS` in `wrangler.toml` `[vars]` lists `provider:user_id`
entries, separated by commas or spaces: `github:251370` is Spaceghost (`GET
https://api.github.com/users/Spaceghost` shows `"id": 251370`). To add an XIVAuth account, append
`xivauth:<user UUID>` (from `GET https://xivauth.net/api/v1/user` for that account) and deploy.
`/admin/` is a static page; it fetches `api/admin/voters`, which checks the session's key against
the listed accounts and answers 401 or 403, without querying D1, to everyone else. The list shows
each voter's portrait and `name @ world` linking to the Lodestone, their want/maybe/skip counts,
notes and suggestions. Voters without a character appear by the start of their voter key.

**Privacy.** Votes, notes and suggestions are linked to the voter's GitHub or XIVAuth account id
and are visible to the site owner; this is not an anonymous vote. Stored per account: the voter key
(`sha256hex('provider:' + id)`, which identifies the account to anyone who has the id), the ballot
(votes, notes, suggestions, write times for the rate limit) and, for voters who link one, the
character above. Not stored: GitHub login names, emails, the raw account ids themselves, provider
tokens, IP addresses or user agents. The owner can still find a GitHub voter's login from the id.
Character data is seen only by the owner. Portraits load from the Lodestone's image host in the
owner's (and the signed-in voter's own) browser. The page footer says the same.

**Limits.**
- Each account can make 300 writes per 10 minutes (votes, note saves and suggestions together,
  counted from `write_log` timestamps). It was 60, and a real session went past that: 55 votes in
  five minutes, after which note saves failed with 429. The page now also retries a 429 instead of
  dropping the note.
- Each voter can send 10 suggestions per day.
- The whole site accepts 300 suggestions per day.

Why 300 fits the D1 free tier (100,000 rows written and 5 million rows read per day): a vote or
note write inserts a `write_log` row (plus its two indexes), prunes an expired one, and upserts
the vote row (plus its index) with a tally update, about 9 rows written. A voter who uses a whole
window costs about 2,700 rows written, under 3% of the day, and at most 300 × 300 = 90,000 rows
read, because each write's precheck counts the voter's window. A person voting on all 81 ideas and
writing notes stays well under one window. The limit protects against a runaway page, not against
abuse: anyone can make new GitHub or XIVAuth accounts, so a scripted attacker could still use up the
daily free rows (on the free plan that should mean refused queries until the daily reset, not a
bill; check Cloudflare's current D1 pricing, this was not observed here), and the page would show
`server error; will retry…`. The WAF rate-limiting rule in the deploy steps (below) slows cycling
through accounts from one IP address, because every sign-in goes through `api/auth/`; it does not
limit writes from sessions that already exist.

Sign-in makes one ballot per account, not per person, so the tallies are still only a guide. The
Free plan's single rate-limiting rule is spent on `api/auth/*` (deploy step 3). If write abuse shows
up, widening that rule's path to `/mods/ffxiv/term/vote/api/` with a higher request count (the page
sends one request per vote click and per note save) is the next step. The rule runs at
Cloudflare's edge, so this app still stores no IPs.

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
already have migrations 0001-0003 and the seed. For sign-in, the secrets `GITHUB_CLIENT_SECRET`,
`XIVAUTH_CLIENT_SECRET` and `SESSION_SECRET` must already be set (`npx wrangler secret list` shows
their names); the client ids and `ADMIN_ACCOUNTS` are in `[vars]`. The registered callback URLs are
`https://spacegho.st/mods/ffxiv/term/vote/api/auth/github/callback` and
`https://spacegho.st/mods/ffxiv/term/vote/api/auth/xivauth/callback`.

Do these three steps in this order.

**1. D1: apply migration 0004 (and the catalogue seed).** The sign-in Worker reads and writes the
`characters` table on a character link, `api/auth/me` and the admin list, so the table must exist
before the Worker is deployed. 0004 is additive (`CREATE TABLE IF NOT EXISTS`), leaves every existing
table alone and is safe to run again. The seed is all upserts and never lowers the catalogue
version; it puts catalogue version 2 into D1 so the Worker accepts votes on the new ideas that the
deployed `ideas.json` lists (running it again when D1 already has version 2 changes nothing).

```sh
cd ~/ghostty-vote
node --test                                   # optional sanity check, no installs
node scripts/build.js --check                 # generated files match data/catalogue.json

npx wrangler d1 execute ghostty-vote --remote --file migrations/0004_sign_in.sql
npx wrangler d1 execute ghostty-vote --remote --command \
  "SELECT name FROM sqlite_master WHERE name = 'characters'"      # expect characters
npx wrangler d1 execute ghostty-vote --remote --file seed/seed.sql
```

**2. Deploy the Worker and the static assets.** `wrangler deploy` runs `node scripts/build.js`, then
uploads `public/` as static assets and `src/worker.js` as the script, in one deployment. The
checks use GET, not `curl -I`: the Worker answers a HEAD request on a GET route with 405, so a HEAD
check of an API route fails even when the deploy worked.

```sh
npx wrangler deploy

curl -s -o /dev/null -w '%{http_code}\n' https://spacegho.st/mods/ffxiv/term/vote/   # expect 200, served as an asset
curl -s https://spacegho.st/mods/ffxiv/term/vote/version.json               # expect {"version":2,"ideas":81,...}
curl -s https://spacegho.st/mods/ffxiv/term/vote/api/tallies | head -c 200
curl -s https://spacegho.st/mods/ffxiv/term/vote/api/auth/me               # expect {"signed_in":false,"legacy_ballot":false}
curl -s -o /dev/null -D - https://spacegho.st/mods/ffxiv/term/vote/api/auth/github/start | grep -i '^location'
                                              # expect location: https://github.com/login/oauth/authorize?...
```

Deploying the sign-in Worker ends anonymous voting at once: the old page (still cached in a
browser) gets 401 on every write. Then sign in once with GitHub from the browser that holds your
old ballot, so it moves onto `github:251370`, and open `/admin/` to check the list.

**3. Add a WAF rate-limiting rule for `/mods/ffxiv/term/vote/api/auth/*`.** This is done in the
Cloudflare dashboard, not by Wrangler, and nothing in this repository creates or checks it. On the
Free plan a zone gets one rate-limiting rule, whose expression can use only the URI path (and
Verified Bot), which counts by IP only, and whose counting period and mitigation timeout are both
fixed at 10 seconds (Cloudflare's rate limiting rules docs, read on 2026-09-17; not observed in the
dashboard here). A per-minute budget such as 20 requests per minute cannot be expressed on Free, so
the rule is 10 requests per 10 seconds per IP. One sign-in round trip is 3 requests to `api/auth/`
(`start`, `callback`, then `me` when the page loads), and linking a character is 3 more, so a
person signing in never comes near it; a script cycling through accounts from one address does.
If `spacegho.st` already uses its one free rate-limiting rule for something else, stop and decide
which rule to keep instead of replacing it.

In the dashboard: the `spacegho.st` zone, **Security**, **WAF**, **Rate limiting rules**,
**Create rule** (the menu names may have moved; the settings are what matter):

| Setting | Value |
| --- | --- |
| Rule name | `ghostty-vote auth` |
| If incoming requests match | Field **URI Path**, operator **starts with**, value `/mods/ffxiv/term/vote/api/auth/` |
| Expression (as the editor shows it) | `starts_with(http.request.uri.path, "/mods/ffxiv/term/vote/api/auth/")` |
| With the same characteristics | **IP** |
| When rate exceeds | **Requests** `10`, **Period** `10 seconds` |
| Then take action | **Block** |
| For duration | `10 seconds` |

Deploy the rule, then check it from one machine (the 11th request inside 10 seconds should be
refused; Cloudflare's block response for a rate-limiting rule is expected to be a 429, which has not
been observed here):

```sh
for n in $(seq 12); do
  curl -s -o /dev/null -w '%{http_code}\n' https://spacegho.st/mods/ffxiv/term/vote/api/auth/me
done                                          # expect 200 ten times, then 429
```

The rule runs at Cloudflare's edge, before the Worker, so the app itself still stores no IP
addresses. It limits only `api/auth/*`: votes, notes and suggestions from a session that already
exists are limited by the per-account write limit above, not by this rule.

**Only for a database without 0002 and 0003.** The live database already has them. A copy that
does not must get them before step 1:

```sh
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
```

0002, 0003 and 0004 are applied with `d1 execute` rather than `d1 migrations apply` because the live database was
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
`npx wrangler dev`, and open `http://localhost:8787/mods/ffxiv/term/vote/`. The session and state
cookies are `__Secure-` and `Secure`, so a browser may refuse to store them over plain
`http://localhost`, and the providers only redirect to the registered `https://spacegho.st`
callbacks, so sign-in cannot complete locally. Put local secrets in `.dev.vars` (ignored by git).

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
npx wrangler d1 execute ghostty-vote --remote --command \
  "SELECT name, world, lodestone_id, datetime(last_seen / 1000, 'unixepoch') FROM characters ORDER BY last_seen DESC"
```

The same, with notes and suggestions per voter, is on `/admin/` for accounts in `ADMIN_ACCOUNTS`.

Suggestion status is for the maintainer only. The page does not show it to visitors.

Triggers on `votes` keep the tallies up to date. If you ever edit `votes` with the triggers
bypassed, rebuild the tallies with:

```sql
UPDATE ideas SET
  want  = (SELECT COUNT(*) FROM votes WHERE idea_id = ideas.id AND vote = 'want'),
  maybe = (SELECT COUNT(*) FROM votes WHERE idea_id = ideas.id AND vote = 'maybe'),
  skip  = (SELECT COUNT(*) FROM votes WHERE idea_id = ideas.id AND vote = 'skip');
```
