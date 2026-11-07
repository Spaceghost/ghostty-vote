-- Scrobbles accounts provisioned by other spacegho.st services through the Worker's
-- service-binding entrypoint (src/entry.js), never by a public route. The account key
-- is the SHA-256 hex digest of 'provider:subject'; `subject` is an opaque identifier
-- chosen by the provisioning service. Additive only; IF NOT EXISTS makes it safe to
-- run again. Apply with `wrangler d1 execute ghostty-vote --remote --file` (see
-- docs/scrobble.md, Deployment).
CREATE TABLE IF NOT EXISTS scrobble_external (
  account TEXT PRIMARY KEY CHECK(length(account)=64) REFERENCES scrobble_accounts(account) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  subject TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  UNIQUE(provider,subject)
) WITHOUT ROWID;

-- One-time dashboard sign-in tickets for those accounts: SHA-256 of the ticket only,
-- two-minute lifetime, consumed on first use.
CREATE TABLE IF NOT EXISTS scrobble_tickets (
  ticket_hash TEXT PRIMARY KEY CHECK(length(ticket_hash)=64),
  account TEXT NOT NULL REFERENCES scrobble_accounts(account) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS scrobble_tickets_expiry ON scrobble_tickets(expires_at);
