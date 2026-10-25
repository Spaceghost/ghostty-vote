-- Private audio objects. Quota reservations include unfinished/deleting uploads.
CREATE TABLE recordings (
  account TEXT NOT NULL REFERENCES scrobble_accounts(account),
  id TEXT NOT NULL CHECK(length(id)=64),
  object_key TEXT NOT NULL UNIQUE,
  upload_id TEXT NOT NULL,
  bytes INTEGER NOT NULL CHECK(bytes>0 AND bytes<=67108864),
  metadata TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','uploading','ready','deleting')),
  created_at INTEGER NOT NULL,
  upload_expires_at INTEGER NOT NULL,
  share_hash TEXT UNIQUE,
  share_expires_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(account,id)
);
CREATE INDEX recordings_cleanup ON recordings(status,upload_expires_at);
CREATE INDEX recordings_owner ON recordings(account,created_at DESC,id);

-- Browser audio tags receive short-lived, HttpOnly grants after authentication.
-- Permanent share capabilities stay in URL fragments, outside HTTP access logs.
CREATE TABLE recording_grants (
  token_hash TEXT PRIMARY KEY,
  account TEXT NOT NULL,
  recording_id TEXT NOT NULL,
  share_hash TEXT,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY(account,recording_id) REFERENCES recordings(account,id) ON DELETE CASCADE
);
CREATE INDEX recording_grants_expiry ON recording_grants(expires_at);
CREATE INDEX recording_grants_owner ON recording_grants(account,expires_at);

-- A bounded sweep recovers objects left between an R2 write and a D1 commit.
CREATE TABLE recording_gc_state (id INTEGER PRIMARY KEY CHECK(id=1), cursor TEXT NOT NULL);
INSERT INTO recording_gc_state(id,cursor) VALUES(1,'');
