-- The screenshot gallery (src/gallery.js). Additive: two new tables, nothing else is
-- touched, and running it again changes nothing.
--
-- shots: one row per upload. The image itself lives in the gallery store (KV or R2) under
-- shots/<id>, and a thumbnail (made in the owner's browser on approval) under thumbs/<id>.
-- Only rows with status 'approved' are ever served to the public. uploader is a keyed
-- digest of the uploading IP address, kept only while a shot is pending (for the rate
-- limit and so the owner can spot a flood); review clears it.
CREATE TABLE IF NOT EXISTS shots (
  id           TEXT PRIMARY KEY,                 -- 22 url-safe random characters
  status       TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected | removed
  content_type TEXT NOT NULL,                    -- image/png | image/jpeg
  bytes        INTEGER NOT NULL,
  width        INTEGER NOT NULL,
  height       INTEGER NOT NULL,
  digest       TEXT NOT NULL,                    -- sha256 of the stored bytes (duplicates)
  credit       TEXT NOT NULL DEFAULT '',         -- optional, e.g. a character name and world
  source       TEXT NOT NULL DEFAULT 'web',      -- plugin | web
  uploader     TEXT NOT NULL DEFAULT '',
  has_thumb    INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,                 -- epoch ms
  reviewed_at  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS shots_status ON shots (status, reviewed_at);
CREATE INDEX IF NOT EXISTS shots_digest ON shots (digest);

-- One row per accepted upload for the per-address and site-wide limits; rows older than
-- a day are pruned by the upload that follows.
CREATE TABLE IF NOT EXISTS upload_log (
  uploader TEXT NOT NULL,
  at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS upload_log_uploader ON upload_log (uploader, at);
CREATE INDEX IF NOT EXISTS upload_log_at ON upload_log (at);
