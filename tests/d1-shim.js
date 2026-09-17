// Minimal in-memory D1 stand-in over node:sqlite, enough for the Worker's calls.
import { DatabaseSync } from 'node:sqlite';

// `stats.calls` counts round trips to D1 (first/all/run/batch), so tests can hold the Worker to its query budget.
class Statement {
  constructor(db, sql, params = [], stats) { this.db = db; this.sql = sql; this.params = params; this.stats = stats; }
  bind(...params) {
    for (const p of params) if (p === undefined) throw new TypeError('D1_TYPE_ERROR: undefined bind value');
    return new Statement(this.db, this.sql, params.map((p) => (typeof p === 'boolean' ? Number(p) : p)), this.stats);
  }
  rows() { return this.db.prepare(this.sql).all(...this.params).map((r) => ({ ...r })); }
  async first(column) {
    this.stats.calls++;
    const row = this.rows()[0];
    if (!row) return null;
    return column ? row[column] : row;
  }
  async all() { this.stats.calls++; return { success: true, results: this.rows(), meta: {} }; }
  async run() { this.stats.calls++; return { success: true, results: this.rows(), meta: {} }; }
}

export function createD1(...sqlFiles) {
  const db = new DatabaseSync(':memory:');
  for (const sql of sqlFiles) db.exec(sql);
  const stats = { calls: 0 };
  return {
    raw: db,
    stats,
    prepare: (sql) => new Statement(db, sql, [], stats),
    async batch(statements) {
      stats.calls++;
      db.exec('BEGIN');
      try {
        const out = statements.map((s) => ({ success: true, results: s.rows(), meta: {} }));
        db.exec('COMMIT');
        return out;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
  };
}
