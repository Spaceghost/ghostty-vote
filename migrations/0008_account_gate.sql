-- Every write needs a signed-in GitHub or XIVAuth account (src/account.js), and the
-- plugins and the CLI sign in through a device link (src/device.js). Additive: no existing
-- row is changed or deleted. Unlike the earlier files this one is NOT safe to run twice
-- (SQLite has no ADD COLUMN IF NOT EXISTS): apply it exactly once.
--
-- provider/account on a row: which sign-in wrote it ('github' | 'xivauth') and the account
-- key, the SHA-256 hex digest of 'provider:provider_user_id' (the same key votes.voter has
-- held since 0004). Rows from before this migration keep provider = '' and account = '':
-- that is what "legacy / anonymous" means everywhere in the code and on the admin page.
-- token_id names the api_tokens row when the write came from a linked app, else ''.

ALTER TABLE votes ADD COLUMN provider TEXT NOT NULL DEFAULT '';
ALTER TABLE suggestions ADD COLUMN provider TEXT NOT NULL DEFAULT '';

ALTER TABLE shots ADD COLUMN provider TEXT NOT NULL DEFAULT '';
ALTER TABLE shots ADD COLUMN account TEXT NOT NULL DEFAULT '';
ALTER TABLE shots ADD COLUMN token_id TEXT NOT NULL DEFAULT '';
-- Which mod's page a shot belongs to: one of the ids in src/clients.js MOD_IDS
-- (ghostty | almanac | xivmcp | xivdesktop), or NULL for the original Ghostty gallery.
ALTER TABLE shots ADD COLUMN mod TEXT;
CREATE INDEX IF NOT EXISTS shots_account ON shots (account, created_at);
CREATE INDEX IF NOT EXISTS shots_mod ON shots (mod, status, reviewed_at);
ALTER TABLE upload_log ADD COLUMN account TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS upload_log_account ON upload_log (account, at);

ALTER TABLE almanac_results ADD COLUMN provider TEXT NOT NULL DEFAULT '';
ALTER TABLE almanac_results ADD COLUMN account TEXT NOT NULL DEFAULT '';
ALTER TABLE almanac_results ADD COLUMN token_id TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS almanac_results_account ON almanac_results (account, created_at);
ALTER TABLE almanac_submit_log ADD COLUMN account TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS almanac_submit_log_account ON almanac_submit_log (account, at);

-- A device link in progress (RFC 8628). The device code is a bearer secret, so only its
-- SHA-256 is kept; the user code is short-lived and typed by a person, so it is kept as is.
-- requester is a keyed digest of the asking IP address (rate limit only). Rows are pruned
-- once expired.
CREATE TABLE IF NOT EXISTS device_codes (
  device_hash  TEXT PRIMARY KEY CHECK (length(device_hash) = 64),
  user_code    TEXT NOT NULL UNIQUE,
  client       TEXT NOT NULL,                    -- a key of CLIENTS in src/clients.js
  scope        TEXT NOT NULL,                    -- space-separated
  status       TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | denied
  provider     TEXT NOT NULL DEFAULT '',         -- who approved
  account      TEXT NOT NULL DEFAULT '',
  requester    TEXT NOT NULL DEFAULT '',
  created_at   INTEGER NOT NULL,                 -- epoch ms
  expires_at   INTEGER NOT NULL,
  last_poll_at INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS device_codes_expires ON device_codes (expires_at);
CREATE INDEX IF NOT EXISTS device_codes_requester ON device_codes (requester, created_at);

-- A linked app's API token. The token itself is shown to the app once and never stored:
-- token_hash is its SHA-256. revoked_at > 0 means revoked (by 'account', 'owner' or 'ban').
CREATE TABLE IF NOT EXISTS api_tokens (
  id           TEXT PRIMARY KEY,                 -- 22 url-safe random characters; safe to show
  token_hash   TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  provider     TEXT NOT NULL,
  account      TEXT NOT NULL CHECK (length(account) = 64),
  client       TEXT NOT NULL,
  scope        TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL DEFAULT 0,
  revoked_at   INTEGER NOT NULL DEFAULT 0,
  revoked_by   TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS api_tokens_account ON api_tokens (account, created_at);

-- Accounts the owner has banned: no new writes, no new links, and their tokens are revoked.
CREATE TABLE IF NOT EXISTS account_bans (
  account    TEXT PRIMARY KEY CHECK (length(account) = 64),
  provider   TEXT NOT NULL DEFAULT '',
  reason     TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
) WITHOUT ROWID;
