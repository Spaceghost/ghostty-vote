-- Ghostty for FFXIV feature vote: initial schema.
-- Timestamps are Unix epoch milliseconds. Voter columns hold a SHA-256 hex
-- digest of the anonymous cookie token, never the token itself. No IPs.

-- Single row: the catalogue version the seed last loaded.
CREATE TABLE catalogue (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL CHECK (version >= 1)
);

CREATE TABLE categories (
  name TEXT PRIMARY KEY,
  tagline TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL
);

CREATE TABLE ideas (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64),
  category TEXT NOT NULL REFERENCES categories (name),
  title TEXT NOT NULL,
  pitch TEXT NOT NULL DEFAULT '',
  experience TEXT NOT NULL DEFAULT '',
  how TEXT NOT NULL DEFAULT '',
  risks TEXT NOT NULL DEFAULT '',
  audience TEXT NOT NULL DEFAULT '',
  in_world INTEGER NOT NULL DEFAULT 0 CHECK (in_world IN (0, 1)),
  tos_safe INTEGER NOT NULL DEFAULT 1 CHECK (tos_safe IN (0, 1)),
  top_pick INTEGER NOT NULL DEFAULT 0 CHECK (top_pick IN (0, 1)),
  wow INTEGER NOT NULL DEFAULT 0 CHECK (wow BETWEEN 0 AND 10),
  feasibility TEXT NOT NULL DEFAULT '',
  effort TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL,
  added_version INTEGER NOT NULL CHECK (added_version >= 1),
  retired INTEGER NOT NULL DEFAULT 0 CHECK (retired IN (0, 1)),
  -- Tallies, maintained by the votes triggers below so reads stay O(ideas).
  want INTEGER NOT NULL DEFAULT 0,
  maybe INTEGER NOT NULL DEFAULT 0,
  skip INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE votes (
  voter TEXT NOT NULL,
  idea_id TEXT NOT NULL REFERENCES ideas (id),
  vote TEXT NOT NULL CHECK (vote IN ('want', 'maybe', 'skip')),
  note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 280),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (voter, idea_id)
) WITHOUT ROWID;

CREATE INDEX votes_idea ON votes (idea_id);

CREATE TRIGGER votes_tally_insert AFTER INSERT ON votes
BEGIN
  UPDATE ideas SET
    want = want + (NEW.vote = 'want'),
    maybe = maybe + (NEW.vote = 'maybe'),
    skip = skip + (NEW.vote = 'skip')
  WHERE id = NEW.idea_id;
END;

CREATE TRIGGER votes_tally_update AFTER UPDATE OF vote ON votes
WHEN OLD.vote <> NEW.vote
BEGIN
  UPDATE ideas SET
    want = want + (NEW.vote = 'want') - (OLD.vote = 'want'),
    maybe = maybe + (NEW.vote = 'maybe') - (OLD.vote = 'maybe'),
    skip = skip + (NEW.vote = 'skip') - (OLD.vote = 'skip')
  WHERE id = NEW.idea_id;
END;

CREATE TRIGGER votes_tally_delete AFTER DELETE ON votes
BEGIN
  UPDATE ideas SET
    want = want - (OLD.vote = 'want'),
    maybe = maybe - (OLD.vote = 'maybe'),
    skip = skip - (OLD.vote = 'skip')
  WHERE id = OLD.idea_id;
END;

CREATE TABLE suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voter TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
  detail TEXT NOT NULL DEFAULT '' CHECK (length(detail) <= 600),
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'accepted', 'declined', 'duplicate')),
  created_at INTEGER NOT NULL
);

CREATE INDEX suggestions_voter ON suggestions (voter, created_at);
CREATE INDEX suggestions_created ON suggestions (created_at);

-- Rate limiting: one row per accepted write, pruned after the window.
CREATE TABLE write_log (
  voter TEXT NOT NULL,
  at INTEGER NOT NULL
);

CREATE INDEX write_log_voter ON write_log (voter, at);
CREATE INDEX write_log_at ON write_log (at);
