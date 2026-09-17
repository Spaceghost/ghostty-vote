// Minimal in-memory D1 stand-in over node:sqlite, enough for the Worker's calls.
import { DatabaseSync } from 'node:sqlite';

class Statement {
  constructor(db, sql, params = []) { this.db = db; this.sql = sql; this.params = params; }
  bind(...params) {
    for (const p of params) if (p === undefined) throw new TypeError('D1_TYPE_ERROR: undefined bind value');
    return new Statement(this.db, this.sql, params.map((p) => (typeof p === 'boolean' ? Number(p) : p)));
  }
  rows() { return this.db.prepare(this.sql).all(...this.params).map((r) => ({ ...r })); }
  async first(column) {
    const row = this.rows()[0];
    if (!row) return null;
    return column ? row[column] : row;
  }
  async all() { return { success: true, results: this.rows(), meta: {} }; }
  async run() { return { success: true, results: this.rows(), meta: {} }; }
}

export function createD1(...sqlFiles) {
  const db = new DatabaseSync(':memory:');
  for (const sql of sqlFiles) db.exec(sql);
  return {
    raw: db,
    prepare: (sql) => new Statement(db, sql),
    async batch(statements) {
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
