# Private saved recordings

The existing Scrobbles host also stores explicitly uploaded MP3s. Listen ingestion
and provider forwarding remain metadata-only. Recordings use a separate, private
`xivpiano-recordings` R2 bucket bound as `RECORDINGS`; no public bucket endpoint or
custom domain is enabled.

Apply only `migrations/0013_recordings.sql` before deploying this feature. Do not
reapply legacy migrations to an existing database whose migration ledger is empty.
The existing `*/5 * * * *` cron separately handles recording cleanup and provider
retries, so a storage cleanup failure cannot stop scrobble forwarding.

## API

Client routes start at `/mods/ffxiv/scrobble/1/recordings`. They use the listener's
existing `Authorization: Token …` client token, except the browser playback exchange
and audio routes, which use a share capability and recording-scoped cookie.

| Route | Purpose |
|---|---|
| `GET /` | List this account's hosted recordings; keyset pagination with `before` and `cursor` |
| `POST /uploads`, then `PUT /:id/audio` | Reserve quota with `{id,bytes,track_metadata}`, then stream MP3 bytes with `X-Recording-Upload`, `Content-Length` and `Content-Type: audio/mpeg` |
| `POST /:id/share`, `/revoke`, `/delete` | Create/replace a 30-day listening link, revoke it, or delete the hosted MP3 |
| `POST /access` | Exchange `{secret}` from a fragment for a one-hour playback grant |
| `GET` or `HEAD /audio/:id` | Serve audio under its HttpOnly grant; supports single byte ranges |

Signed-in browser management uses
`/mods/ffxiv/term/vote/api/scrobble/recordings`, keeping the existing session cookie
scope. It offers list, share, revoke, delete and `POST /:id/open` for owner playback.
Browser writes require an explicit same-origin `Origin` header. Signing out revokes
owner playback grants; friend links remain independently controlled by their owner.

## Storage and concurrency

MP3s are limited to 64 MiB each, 2 GiB per account and 20 GiB service-wide. A single
SQLite statement reserves account and global quota before accepting a stream. All
reservation states count toward capacity until their object has been removed.
R2 checks the declared SHA256; the returned object size must match the reservation.

Each reservation has a unique object key and 15-minute lease. Publication verifies
the same lease, client-token validity, account epoch and ban state. Deletes first
hide the row and revoke links; failed R2 deletes remain queued for cron cleanup.
An old in-flight upload cannot publish over a newer reservation. A bounded object
sweep removes unreferenced objects older than one day after interrupted R2/D1 work.

Ready recordings have no automatic retention expiry. They remain until the owner
deletes them. Listen-history deletion does not delete recordings. Metadata is
limited to the existing supported public music fields; no Pandora account tokens,
stream URLs, player passwords or arbitrary additional metadata are accepted.

## Sharing

Links use 256-bit random capabilities in fragments, excluded from HTTP URLs. Only
their hashes are stored. The browser exchanges a capability for a one-hour HttpOnly,
Secure, SameSite=Strict cookie scoped to that recording's audio path. Grants are
checked against current share hash, expiry and ban state on every audio request.
The owner can rotate or revoke links. Already downloaded audio cannot be recalled.
Raw links and capabilities must never be logged or added to analytics.

The browser player supports seeking and downloading without a Pandora or FFXIV
account. The signed-in dashboard lists hosted recordings and manages their links.
The plugin saves locally by opt-in and uploads only when Upload & share is chosen.

Runtime APIs follow the [R2 Workers reference](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).
