# Accepted votes

The 2026-09-27 ballot is an implementation commitment: all 201 ideas marked
**Want** are in scope. The five **Maybe** and seven **Skip** ideas are not.

`data/accepted-votes.json` records the catalogue versions, the twelve explicit
exclusions and the expected count for each mod. This compact representation
means a catalogue edit cannot silently add, remove or rename committed work:
`npm test` reconstructs the accepted set and fails unless it is still exactly
201 unique ideas.

Run `node scripts/accepted-votes.js` for the complete Markdown ledger, or add
`--json` for machine-readable output. Every entry begins as `queued`; delivery
status belongs in the implementation repository and must be backed by its
tests and release evidence before it is called complete.

Work ships in independently testable releases. Stability, security and live
in-game certification remain gates for every release; the size of this ballot
does not turn research ideas into unreviewed hooks or permit one unstable mega
release.
