-- Private, aggregate-only analytics and the abuse deny list (src/analytics.js,
-- src/analytics-lib.js). Additive: four new tables, nothing existing is touched, and
-- running it again changes nothing.
--
-- What is NOT here, on purpose: no IP addresses, no User-Agent strings, no cookies, no
-- session or account keys, no URLs with query strings, no per-person rows of any kind for
-- a request that succeeded. A successful request contributes +1 to a counter shared by
-- everyone who asked for the same thing on the same day from the same country.

-- One row per day x path bucket x client class x outcome x country. The columns are all
-- drawn from fixed vocabularies in analytics-lib.js, so the number of rows a day is
-- bounded by that vocabulary and cannot be driven by a caller.
--   hits    the estimate (an event counted while the isolate was sampling adds 10)
--   samples how many events were actually observed, so the page can say when it sampled
-- WITHOUT ROWID: the primary key *is* the table, so one upsert writes exactly one row —
-- which is what keeps the daily write count inside D1's free allowance.
CREATE TABLE IF NOT EXISTS hit_rollup (
  day     TEXT NOT NULL,                  -- 'YYYY-MM-DD', UTC
  bucket  TEXT NOT NULL,                  -- plugins-repo | download | vote-page | ...
  class   TEXT NOT NULL,                  -- dalamud | browser | bot | page | other | none
  outcome TEXT NOT NULL,                  -- ok | fresh | view | notfound | limited | ...
  country TEXT NOT NULL,                  -- two letters from request.cf.country, or ZZ
  hits    INTEGER NOT NULL DEFAULT 0,
  samples INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, bucket, class, outcome, country)
) WITHOUT ROWID;

-- Where visitors were linked from: the host only, lower-cased, never a path or a query
-- string, and this site's own host collapsed to 'self'.
CREATE TABLE IF NOT EXISTS ref_rollup (
  day    TEXT NOT NULL,
  bucket TEXT NOT NULL,
  host   TEXT NOT NULL,
  hits   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, bucket, host)
) WITHOUT ROWID;

-- Refused requests only — a rate limit, a rejected body, a cross-site POST, a ban, a run
-- of 404s — kept for 30 days and then deleted. `who` is a keyed digest of the address
-- made with a salt that rotates every seven days: inside one window repeat offenders line
-- up, across windows they do not, and the address itself is never stored anywhere. This
-- is the only table in the schema in which two requests from one machine can be linked,
-- and only while they are being refused.
CREATE TABLE IF NOT EXISTS abuse_log (
  day     TEXT NOT NULL,
  who     TEXT NOT NULL,                  -- sha256(secret, seven-day window, address)
  bucket  TEXT NOT NULL,
  outcome TEXT NOT NULL,                  -- refused | notfound | limited | banned
  country TEXT NOT NULL,
  asn     INTEGER NOT NULL DEFAULT 0,     -- request.cf.asn: the network, not the machine
  hits    INTEGER NOT NULL DEFAULT 0,
  last_at INTEGER NOT NULL DEFAULT 0,     -- epoch ms
  PRIMARY KEY (day, who, bucket, outcome)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS abuse_log_recent ON abuse_log (day, hits);

-- The owner's deny list, enforced at the edge for every path the Worker answers. An 'ip'
-- entry holds the same rotating digest as abuse_log and therefore expires at the end of
-- its window at the latest (analytics-lib.js banExpiry); 'asn', 'country' and 'ua'
-- entries are not personal data and last as long as they are given.
CREATE TABLE IF NOT EXISTS deny_list (
  id         TEXT PRIMARY KEY,            -- 22 url-safe random characters
  kind       TEXT NOT NULL,               -- ip | asn | country | ua
  value      TEXT NOT NULL,
  reason     TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL DEFAULT 0,  -- epoch ms; 0 means no expiry
  hits       INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS deny_list_entry ON deny_list (kind, value);
