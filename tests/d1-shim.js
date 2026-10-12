// Generated from imba/tests/d1-shim.imba; edit the Imba source.
import {inited$, register$, iterable$} from 'imba/runtime';

/*body*/
// Minimal in-memory D1 stand-in over node:sqlite, enough for the Worker's calls.
import {DatabaseSync} from 'node:sqlite';

let c$0 = Symbol();
class Statement {
	constructor(db,sql,params = [],stats){
		this.db = db;
		this.sql = sql;
		this.params = params;
		this.stats = stats;
		inited$(this,c$0);
	}
	bind(...params){
		for (let p of iterable$(params)){
			if ((p === undefined)) {
				throw new TypeError('D1_TYPE_ERROR: undefined bind value');
			};
		};
		return new Statement(
			this.db,
			this.sql,
			params.map(
				function(p) {
					return (((typeof p) === 'boolean') ? Number(p) : p);
				}
			),
			this.stats
		);
		return;
	}
	rows(){
		return this.db.prepare(this.sql).all(...this.params).map(
			function(r) {
				return {...r};
			}
		);
		return;
	}
	async first(column){
		this.stats.calls++;
		const row = this.rows()[0];
		if ((!row)) {
			return await null;
		};
		return await (column ? row[column] : row);
		return await undefined;
	}
	async all(){
		this.stats.calls++;
		return await {success: true,results: this.rows(),meta: {}};
		return await undefined;
	}
	async run(){
		this.stats.calls++;
		return await {success: true,results: this.rows(),meta: {}};
		return await undefined;
	}
	static { register$(this,c$0,'Statement',16) }
};

export function createD1(...sqlFiles){
	const db = new DatabaseSync(':memory:');
	for (let sql of iterable$(sqlFiles)){
		db.exec(sql);
	};
	const stats = {calls: 0};
	return {
		raw: db,
		stats: stats,
		prepare: function(sql) {
			return new Statement(db,sql,[],stats);
		},
		batch: async function(statements) {
			stats.calls++;
			db.exec('BEGIN');
			try {
				const out = statements.map(
					function(s) {
						return {success: true,results: s.rows(),meta: {}};
					}
				);
				db.exec('COMMIT');
				return await out;
			} catch (err) {
				db.exec('ROLLBACK');
				throw err;
			};
			return await undefined;
		}
	};
	return;
};
