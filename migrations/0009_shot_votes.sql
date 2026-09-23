-- Votes on gallery shots, and the storage budget they decide (src/gallery.js).
-- Additive: two columns, one table and its triggers; running it again changes nothing.
--
-- Full-resolution screenshots are kept only while there is room for them. R2's free
-- tier is 10 GB, so the gallery holds a budget below that and, when an upload takes it
-- over, drops the lowest-voted shots that are past their grace period: the image object
-- goes, the row and its thumbnail stay, so the shot is still listed as an archive entry
-- and its digest still catches a re-upload.
--
-- One vote per account per shot, 'keep' or 'pass', the same shape as votes on ideas.
-- The triggers keep shots.keeps and shots.passes in step with the rows, so ranking the
-- gallery never counts votes at read time.
ALTER TABLE shots ADD COLUMN keeps INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shots ADD COLUMN passes INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS shot_votes (
  voter      TEXT NOT NULL,
  shot_id    TEXT NOT NULL REFERENCES shots (id),
  vote       TEXT NOT NULL CHECK (vote IN ('keep', 'pass')),
  provider   TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (voter, shot_id)
);
CREATE INDEX IF NOT EXISTS shot_votes_shot ON shot_votes (shot_id);

-- The eviction order: approved shots, worst score first, oldest first among equals.
CREATE INDEX IF NOT EXISTS shots_rank ON shots (status, keeps, passes, reviewed_at);

CREATE TRIGGER IF NOT EXISTS shot_votes_insert AFTER INSERT ON shot_votes BEGIN
  UPDATE shots SET
    keeps = keeps + (NEW.vote = 'keep'),
    passes = passes + (NEW.vote = 'pass')
  WHERE id = NEW.shot_id;
END;

CREATE TRIGGER IF NOT EXISTS shot_votes_update AFTER UPDATE ON shot_votes BEGIN
  UPDATE shots SET
    keeps = keeps + (NEW.vote = 'keep') - (OLD.vote = 'keep'),
    passes = passes + (NEW.vote = 'pass') - (OLD.vote = 'pass')
  WHERE id = NEW.shot_id;
END;

CREATE TRIGGER IF NOT EXISTS shot_votes_delete AFTER DELETE ON shot_votes BEGIN
  UPDATE shots SET
    keeps = keeps - (OLD.vote = 'keep'),
    passes = passes - (OLD.vote = 'pass')
  WHERE id = OLD.shot_id;
END;
