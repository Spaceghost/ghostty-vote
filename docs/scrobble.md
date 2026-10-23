# Spaceghost Scrobbles

The private music dashboard is `/mods/ffxiv/scrobble/`. Sign in with the site's
existing GitHub or XIVAuth account, create a client token, and paste it into
XivPiano's Spaceghost Scrobbles destination. Client tokens are displayed once;
only their SHA-256 hashes are stored. Revocation stops future submissions.

History is private by default. The dashboard offers paginated JSON export and
history deletion. It retains at most 100,000 listens per account for 365 days
after receipt; periodic bounded housekeeping removes expired records. Now playing
expires after five minutes and is not added to completed listening history.
Deleting host history cannot delete copies already forwarded to another service.

## Client API

Base URL: `https://spacegho.st/mods/ffxiv/scrobble`.

| Request | Result |
| --- | --- |
| `GET /1/validate-token` | `{valid:true,user_name:"…"}`; invalid tokens return 401 |
| `POST /1/submit-listens` | ListenBrainz `single`, `import`, or `playing_now`; returns `{status:"ok"}` after durable storage |

Both require `Authorization: Token <client token>`. Submission bodies must be
JSON, at most 128 KiB, and contain one listen or up to 100 imported listens.
An account may make 120 submission/configuration requests per minute and have
eight active client tokens. Timestamps use Unix seconds; playing now omits one.
Repeated completed listens with the same account, timestamp, artist, track, and
release are idempotent, including after a provider reconnect.

The server rebuilds metadata from a public-field allowlist: music names, bounded
client/player/service names, duration, track number, and MusicBrainz IDs. Unknown
fields are discarded, including stream URLs, Pandora account information, audio
tokens, and arbitrary `additional_info`. No audio is uploaded or proxied.

Browser controls use `/mods/ffxiv/term/vote/api/scrobble/*`, because the existing
signed site cookie is scoped to `/mods/ffxiv/term/vote`. Browser writes require an
explicit same-origin `Origin`; client tokens never authorize account controls.
Neither API enables cross-origin credentialed access.

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

`wrangler.toml` adds only the `/mods/ffxiv/scrobble*` zone route, client API Worker
precedence, and the five-minute trigger. Other static pages retain asset handling.
Deploy the generated JavaScript with `npm run build`; edit the Imba originals.

Provider references: [ListenBrainz core API](https://listenbrainz.readthedocs.io/en/latest/users/api/core.html),
[ListenBrainz JSON](https://listenbrainz.readthedocs.io/en/latest/users/json.html),
[Last.fm authentication](https://www.last.fm/api/authspec),
[Last.fm scrobbling](https://www.last.fm/api/show/track.scrobble), and
[Last.fm now playing](https://www.last.fm/api/show/track.updateNowPlaying).
