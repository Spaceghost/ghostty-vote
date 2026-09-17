-- Sign-in with GitHub or FFXIV (XIVAuth). Additive only: no existing table, row, index,
-- trigger or tally is touched, and IF NOT EXISTS makes the file safe to run again.
--
-- Accounts need no table: a signed-in voter's key is the SHA-256 hex digest of
-- 'provider:provider_user_id' (for example 'github:251370'), stored in the same `voter`
-- columns the anonymous ballots already use. Moving an anonymous ballot onto an account
-- happens with plain UPDATE/DELETE statements on votes, suggestions and write_log, whose
-- existing primary keys and indexes already cover the voter lookups, and the existing
-- tally triggers keep the tallies right.
--
-- The one new table: the character a voter shared through XIVAuth, either by signing in
-- with FFXIV or by linking one to a GitHub sign-in. At most one per voter. Only what
-- the page and the owner's list show is kept: no XIVAuth user id, email or token.
-- Timestamps are Unix epoch milliseconds. "Forget my character" deletes the row.
CREATE TABLE IF NOT EXISTS characters (
  voter TEXT PRIMARY KEY CHECK (length(voter) = 64),
  lodestone_id TEXT NOT NULL CHECK (length(lodestone_id) BETWEEN 1 AND 20),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 64),
  world TEXT NOT NULL DEFAULT '' CHECK (length(world) <= 32),
  portrait_url TEXT NOT NULL DEFAULT '' CHECK (length(portrait_url) <= 512),
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
) WITHOUT ROWID;
