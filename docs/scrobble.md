# Spaceghost Scrobbles

The private music dashboard is `https://spacegho.st/scrobble/` (canonical; everything
under `/mods/ffxiv/scrobble/` keeps working as an alias, and existing XivPiano clients
keep using it). Sign in with the site's
existing GitHub or XIVAuth account, create a client token, and paste it into
XivPiano's Spaceghost Scrobbles destination. Client tokens are displayed once;
only their SHA-256 hashes are stored. Revocation stops future submissions.

History is private by default. The dashboard offers paginated JSON export and
history deletion. It retains at most 100,000 listens per account for 365 days
after receipt; periodic bounded housekeeping removes expired records. Now playing
expires after five minutes and is not added to completed listening history.
Deleting host history cannot delete copies already forwarded to another service.

## Client API

Base URL: `https://spacegho.st/scrobble` (alias: `https://spacegho.st/mods/ffxiv/scrobble`).

| Request | Result |
| --- | --- |
| `GET /1/validate-token` | `{valid:true,user_name:"…"}`; invalid tokens return 401 |
| `POST /1/submit-listens` | ListenBrainz `single`, `import`, or `playing_now`; returns `{status:"ok"}` after durable storage |
| `GET /1/user/recent?limit=15` | the account's own latest completed listens, newest first (`limit` 1–100, default 15): `{listens:[{listened_at, artist, title, album?, duration_ms?, art?}]}` |
| `GET /1/user/settings` | `{display_name, handle, name, leaderboard}` |
| `POST /1/user/settings` | `{display_name?, leaderboard?}`; provisioned accounts only (others use the dashboard), 403 otherwise |
| `GET /1/leaderboard?window=7d\|30d\|all` | public, no token: `{window, generated_at, songs:[{artist,title,listens}], artists:[{artist,listens}], listeners:[{name,listens}]}` |

All but the leaderboard require `Authorization: Token <client token>`. Submission bodies must be
JSON, at most 128 KiB, and contain one listen or up to 100 imported listens.
An account may make 120 submission/configuration requests per minute and have
eight active client tokens. Timestamps use Unix seconds; playing now omits one.
Repeated completed listens with the same account, timestamp, artist, track, and
release are idempotent, including after a provider reconnect.

The server rebuilds metadata from a public-field allowlist: music names, bounded
client/player/service names, duration, track number, and MusicBrainz IDs. Unknown
fields are discarded, including stream URLs, Pandora account information, audio
tokens, and arbitrary `additional_info`. The one URL kept is `additional_info.art_url`
(cover art, `https:` only, at most 512 characters), returned only to the account
itself by `/1/user/recent`. No audio is uploaded or proxied.

Browser controls use `/mods/ffxiv/term/vote/api/scrobble/*`, because the existing
signed site cookie is scoped to `/mods/ffxiv/term/vote`. Browser writes require an
explicit same-origin `Origin`; client tokens never authorize account controls.
Neither API enables cross-origin credentialed access.

## Leaderboards

`https://spacegho.st/scrobble/leaderboard` (and `/1/leaderboard` as JSON) shows the top
25 songs, artists and listeners by completed listens over the last 7 days, 30 days or
all retained history. Playing-now entries are never counted. Boards are recomputed at
most every five minutes.

Privacy defaults:

- Only accounts whose "Show me on the leaderboards" setting is on are counted on any
  board, including the song and artist boards. Accounts created before the leaderboards
  (XivPiano, GitHub and FFXIV sign-ins) had their history promised private, so the
  setting is **off** for them until the owner turns it on in the dashboard.
- Accounts provisioned by other spacegho.st services start with it **on**, and those
  services show the setting in their own settings next to their scrobbling switch.
- A listener appears only as a display name, or, until one is chosen, a handle generated
  from the account key (`listener-` plus six hex digits). Display names have 1–40
  characters and cannot contain an email address or a link.
- Nothing per listen, no history, no account identifiers and no art is published.

## Accounts provisioned by other spacegho.st services

Accounts can also be provisioned by other spacegho.st services. Such a service
reaches this Worker only through a Cloudflare service binding to the
`ScrobbleAccounts` entrypoint (`src/entry.js`); no public route provisions anything.
It names an external identity `{provider, subject}`, where `subject` is an opaque
identifier chosen by that service, and receives client tokens for an ordinary
Scrobbles account (account key: SHA-256 of `provider:subject`). The only other thing
stored about the identity is a display name the service passes along or the person
chooses. The calls are `provision` (issue a client token, optionally revoking earlier
ones; at most eight stay active), `revoke` (listed tokens, or all of them; revoking all
also turns the leaderboard setting off), `rename`,
and `ticket`. Such accounts show a generated handle until the person picks a display
name (`POST /1/user/settings` with their token, or the dashboard).

`ticket` returns a one-time link, valid for two minutes, that signs the person in to
this dashboard for that account. It sets a separate session cookie scoped to the
dashboard's API that lasts twelve hours and covers only the scrobble controls: it does
not sign anybody in to voting, the gallery or recordings, and the dashboard's sign-out
clears it. Privacy, retention, export, history deletion and forwarding are unchanged
for these accounts. Recordings need a GitHub or FFXIV sign-in.

## Optional forwarding

Connect ListenBrainz with its user token. For Last.fm, enter your own application
API key and shared secret, approve the link on Last.fm, then finish connecting.
This uses Last.fm's request-token flow; the site never requests a Last.fm password.

Only new listens received while a destination is connected are queued. D1 stores
the listen and an independent outbox row per destination in one transaction.
`waitUntil` attempts prompt delivery; a five-minute Cron Trigger resumes pending
deliveries after a browser or plugin closes. Conditional 90-second leases prevent
concurrent workers from claiming the same attempt. Temporary failures back off
from one minute to one hour, with at most eight attempts. Failed deliveries stay
visible and can be retried manually; an unavailable destination does not lose host
history. Last.fm HTTP 200 errors and ignored scrobbles count as failures.

Delivery is at least once when a provider's acceptance is followed by a network
failure. Retries preserve the original timestamp and metadata; the host itself
does not duplicate listens. A provider disconnect replaces its credential
generation, erases its encrypted credentials, and cancels queued deliveries.
An external request already in flight can complete after disconnect. Expired or
superseded now-playing entries are cancelled rather than forwarded later.

## Deployment

Reuse the existing `DB` binding. Apply **only** `migrations/0011_scrobble.sql` and
`migrations/0012_scrobble_ingestion_index.sql`, in order, to an existing deployment
whose earlier schema is already present. Some existing sites
have an empty migration ledger despite having that schema: do not blindly reapply
the full migrations directory. The new SQL is additive and should be applied once.

For provisioned accounts and leaderboards, apply `migrations/0014_scrobble_external.sql`
and then `migrations/0015_scrobble_profiles.sql` the same way
(`wrangler d1 execute ghostty-vote --remote --file …`), each once. The Worker's `main` is `src/entry.js`, which re-exports
`src/worker.js` and adds the entrypoint.

Provision `SCROBBLE_ENCRYPTION_KEY` once as a Worker secret: standard base64 encoding
of 32 cryptographically random bytes (43 characters, optionally `=` padded).
Never write it into source, logs, `.env` commits, or deploy output, and never
regenerate it on normal deployment. Existing authentication secrets must remain.
Without this key, private host history still works but provider connections return
503. Forwarding credentials use AES-256-GCM with fresh 96-bit IVs and versioned
envelopes bound to the account, provider, and connection generation.

During rotation, retain the old value as `SCROBBLE_ENCRYPTION_KEY_PREVIOUS` before
changing the current key. Reconnect providers to rewrite old envelopes before
removing the previous key. Keep both keys in the secret manager until that is
complete; removing the only key for existing envelopes makes them unreadable.

`wrangler.toml` adds the `/mods/ffxiv/scrobble*`, `/scrobble` and `/scrobble/*` zone routes, client API Worker
precedence, and the five-minute trigger. Other static pages retain asset handling.
Deploy the generated JavaScript with `npm run build`; edit the Imba originals.

Provider references: [ListenBrainz core API](https://listenbrainz.readthedocs.io/en/latest/users/api/core.html),
[ListenBrainz JSON](https://listenbrainz.readthedocs.io/en/latest/users/json.html),
[Last.fm authentication](https://www.last.fm/api/authspec),
[Last.fm scrobbling](https://www.last.fm/api/show/track.scrobble), and
[Last.fm now playing](https://www.last.fm/api/show/track.updateNowPlaying).
