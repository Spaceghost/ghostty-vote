-- The Almanac community model leaderboard (src/almanac.js). Additive: three new tables,
-- nothing else is touched, and running it again changes nothing.
--
-- almanac_results: one row per accepted benchmark run (schema:
-- public/mods/ffxiv/almanac/schema/results.v1.json). `payload` is the validated submission
-- as sent (it holds no names, paths or addresses: the schema and the Worker refuse them);
-- the other columns are copies of the fields the leaderboard groups and ranks by.
-- `submitter` is a keyed digest of the submitting IP address (never the address): it
-- drives the rate limit and lets the aggregate count each submitter once per model.
CREATE TABLE IF NOT EXISTS almanac_results (
  id            TEXT PRIMARY KEY,                 -- 22 url-safe random characters
  status        TEXT NOT NULL DEFAULT 'visible',  -- visible | hidden (owner moderation)
  suite_id      TEXT NOT NULL,
  suite_version TEXT NOT NULL,
  mode          TEXT NOT NULL,                    -- live | mock
  model         TEXT NOT NULL,                    -- lower-cased model.name
  quant         TEXT NOT NULL,                    -- upper-cased model.quant
  context       INTEGER NOT NULL,
  tool_calling  TEXT NOT NULL,
  backend       TEXT NOT NULL,
  gpu_vendor    TEXT NOT NULL,
  gpu_model     TEXT NOT NULL,
  vram_mb       INTEGER NOT NULL,
  os            TEXT NOT NULL,
  score         REAL NOT NULL,                    -- 0..100
  success_rate  REAL NOT NULL,                    -- 0..1
  tool_call_validity REAL NOT NULL,               -- 0..1
  tokens_per_s  REAL NOT NULL,
  ttft_ms       REAL NOT NULL,
  peak_vram_mb  INTEGER,                          -- null when unmeasurable
  task_scores   TEXT NOT NULL,                    -- compact JSON {task id: score 0..1}
  payload       TEXT NOT NULL,
  digest        TEXT NOT NULL,                    -- sha256 of payload (exact resubmissions)
  submitter     TEXT NOT NULL,
  created_at    INTEGER NOT NULL,                 -- epoch ms
  reviewed_at   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS almanac_results_status ON almanac_results (status, suite_id, suite_version);
CREATE INDEX IF NOT EXISTS almanac_results_created ON almanac_results (created_at);
CREATE INDEX IF NOT EXISTS almanac_results_digest ON almanac_results (digest);

-- One row per suite version seen. The first accepted submission pins its sha256; later
-- submissions with another hash for that version are refused. The owner can deprecate a
-- suite (its results leave the leaderboard and the recommendations, and new ones are refused).
CREATE TABLE IF NOT EXISTS almanac_suites (
  suite_id      TEXT NOT NULL,
  suite_version TEXT NOT NULL,
  sha256        TEXT NOT NULL,
  deprecated    INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  PRIMARY KEY (suite_id, suite_version)
);

-- One row per accepted submission for the per-address and site-wide limits; rows older
-- than a day are pruned by the submission that follows.
CREATE TABLE IF NOT EXISTS almanac_submit_log (
  submitter TEXT NOT NULL,
  at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS almanac_submit_log_submitter ON almanac_submit_log (submitter, at);
CREATE INDEX IF NOT EXISTS almanac_submit_log_at ON almanac_submit_log (at);
