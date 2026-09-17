-- Let a ballot row hold a note without a vote (vote = ''), so clearing a vote keeps
-- the note and a note can be written before voting. SQLite cannot alter a CHECK
-- constraint, so `votes` is rebuilt: new table, copy, drop, rename, then the index and
-- the three tally triggers are recreated (DROP TABLE removed them). The triggers are
-- unchanged: '' matches none of 'want'/'maybe'/'skip', so a note-only row counts toward
-- nothing, and the UPDATE trigger's `OLD.vote <> NEW.vote` covers '' <-> vote changes.
--
-- Safe on the live D1: nothing references `votes`, and D1 always enforces foreign
-- keys, so checks on votes.idea_id -> ideas(id) are deferred to the end of the
-- migration as D1 recommends for table rebuilds. DROP TABLE fires no triggers, so the
-- tallies are untouched by the drop, and the final UPDATE recounts them from the rows.
-- Re-running the whole file is harmless. If an earlier run stopped part way and left
-- `votes_new` behind, CREATE TABLE fails before anything is changed; inspect it first.
PRAGMA defer_foreign_keys = true;

CREATE TABLE votes_new (
  voter TEXT NOT NULL,
  idea_id TEXT NOT NULL REFERENCES ideas (id),
  vote TEXT NOT NULL DEFAULT '' CHECK (vote IN ('', 'want', 'maybe', 'skip')),
  note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 280),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (voter, idea_id)
) WITHOUT ROWID;

INSERT INTO votes_new (voter, idea_id, vote, note, created_at, updated_at)
  SELECT voter, idea_id, vote, note, created_at, updated_at FROM votes;

DROP TABLE votes;

ALTER TABLE votes_new RENAME TO votes;

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

-- Recount every tally from the rows, so they are exact after the rebuild whatever
-- state they were in before. Idempotent.
UPDATE ideas SET
  want  = (SELECT COUNT(*) FROM votes WHERE votes.idea_id = ideas.id AND votes.vote = 'want'),
  maybe = (SELECT COUNT(*) FROM votes WHERE votes.idea_id = ideas.id AND votes.vote = 'maybe'),
  skip  = (SELECT COUNT(*) FROM votes WHERE votes.idea_id = ideas.id AND votes.vote = 'skip');
