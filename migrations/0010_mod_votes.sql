-- One vote for every mod, not only Ghostty's (src/app.js, scripts/seed-lib.js).
-- Additive: each idea, category and suggestion says which mod it belongs to, and every
-- row that exists already is Ghostty's, which is what the default says. Idea ids and
-- category names stay unique across all mods, so votes, notes and the tallies keep
-- their shape; api/tallies, api/mine and the seed's retirement step filter by mod.
ALTER TABLE ideas ADD COLUMN mod TEXT NOT NULL DEFAULT 'ghostty';
ALTER TABLE categories ADD COLUMN mod TEXT NOT NULL DEFAULT 'ghostty';
ALTER TABLE suggestions ADD COLUMN mod TEXT NOT NULL DEFAULT 'ghostty';
CREATE INDEX IF NOT EXISTS ideas_mod ON ideas (mod, retired);
CREATE INDEX IF NOT EXISTS suggestions_mod ON suggestions (mod, created_at);
