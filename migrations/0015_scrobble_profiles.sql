-- Public leaderboards (2026-11-07). Every account gets a display name (empty = a generated
-- "listener-xxxxxx" handle) and a "show me on the leaderboards" switch. Existing accounts
-- were promised private history, so the switch defaults to OFF; accounts provisioned by
-- other services are created with it ON (src/scrobble-external.js). Only accounts with it
-- ON count towards any leaderboard, including the song and artist boards.
-- Apply once with `wrangler d1 execute ghostty-vote --remote --file` (ALTER is not idempotent).
ALTER TABLE scrobble_accounts ADD COLUMN display_name TEXT NOT NULL DEFAULT '';
ALTER TABLE scrobble_accounts ADD COLUMN leaderboard INTEGER NOT NULL DEFAULT 0;
-- 0014 kept the provisioned display name on scrobble_external; it lives on the account now.
UPDATE scrobble_accounts SET display_name = (SELECT e.display_name FROM scrobble_external e WHERE e.account = scrobble_accounts.account)
  WHERE EXISTS (SELECT 1 FROM scrobble_external e WHERE e.account = scrobble_accounts.account AND e.display_name <> '');
ALTER TABLE scrobble_external DROP COLUMN display_name;
CREATE INDEX IF NOT EXISTS scrobble_listens_board ON scrobble_listens(listened_at);
