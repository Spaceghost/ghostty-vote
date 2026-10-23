-- Private music history. Account keys come from the existing signed site session.
-- Client secrets are SHA-256 hashes; downstream secrets are AES-GCM envelopes.
CREATE TABLE scrobble_accounts (
  account TEXT PRIMARY KEY CHECK(length(account)=64),
  provider TEXT NOT NULL,
  epoch TEXT NOT NULL,
  created_at INTEGER NOT NULL
) WITHOUT ROWID;

CREATE TABLE scrobble_tokens (
  id TEXT PRIMARY KEY,
  account TEXT NOT NULL REFERENCES scrobble_accounts(account) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash)=64),
  label TEXT NOT NULL,
  prefix TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL DEFAULT 0,
  revoked_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX scrobble_tokens_owner ON scrobble_tokens(account,created_at);

CREATE TABLE scrobble_providers (
  account TEXT NOT NULL REFERENCES scrobble_accounts(account) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK(provider IN ('listenbrainz','lastfm')),
  generation TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('connecting','pending_auth','connected','disconnected')),
  user_name TEXT NOT NULL DEFAULT '',
  credentials TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(account,provider)
) WITHOUT ROWID;

CREATE TABLE scrobble_listens (
  id TEXT NOT NULL CHECK(length(id)=64),
  account TEXT NOT NULL REFERENCES scrobble_accounts(account) ON DELETE CASCADE,
  listened_at INTEGER NOT NULL,
  metadata TEXT NOT NULL,
  ingestion_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(account,id)
) WITHOUT ROWID;
CREATE INDEX scrobble_listens_history ON scrobble_listens(account,listened_at DESC,id DESC);
CREATE INDEX scrobble_listens_retention ON scrobble_listens(created_at);

CREATE TABLE scrobble_nowplaying (
  account TEXT PRIMARY KEY REFERENCES scrobble_accounts(account) ON DELETE CASCADE,
  id TEXT NOT NULL,
  metadata TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
) WITHOUT ROWID;

-- Each destination has its own delivery state. Conditional lease claims serialize
-- workers; a provider generation prevents disconnected credentials being reused.
CREATE TABLE scrobble_outbox (
  id TEXT PRIMARY KEY,
  account TEXT NOT NULL REFERENCES scrobble_accounts(account) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  generation TEXT NOT NULL,
  listen_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('single','playing_now')),
  listened_at INTEGER NOT NULL,
  metadata TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','retry','delivered','failed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  lease TEXT NOT NULL DEFAULT '',
  lease_until INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(account,provider,generation,listen_id,kind)
);
CREATE INDEX scrobble_outbox_due ON scrobble_outbox(status,next_attempt_at,lease_until);
CREATE INDEX scrobble_outbox_owner ON scrobble_outbox(account,provider,status);
CREATE INDEX scrobble_outbox_listen ON scrobble_outbox(account,listen_id);

CREATE TABLE scrobble_rate (
  account TEXT NOT NULL REFERENCES scrobble_accounts(account) ON DELETE CASCADE,
  bucket INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY(account,bucket)
) WITHOUT ROWID;
