# Minimal in-memory D1 stand-in over node:sqlite, enough for the Worker's calls.
import { DatabaseSync } from 'node:sqlite'

class Statement
	def constructor(db, sql, params = [], stats)
		(this.db = db)
		(this.sql = sql)
		(this.params = params)
		(this.stats = stats)
	def bind(...params)
		for p of params
			if (p === undefined)
				throw new TypeError('D1_TYPE_ERROR: undefined bind value')
		return new Statement(
			this.db,
			this.sql,
			params.map(
				(do(p)
					return (((typeof p) === 'boolean') ? Number(p) : p)
				)
			),
			this.stats
		)
		return
	def rows()
		return this.db.prepare(this.sql).all(...this.params).map(
			(do(r)
				return {...r}
			)
		)
		return
	def first(column)
		(this.stats.calls++)
		const row = this.rows()[0]
		if (! row)
			return await null
		return await (column ? row[column] : row)
		return await undefined
	def all()
		(this.stats.calls++)
		return await {success: true, results: this.rows(), meta: {}}
		return await undefined
	def run()
		(this.stats.calls++)
		return await {success: true, results: this.rows(), meta: {}}
		return await undefined

export def createD1(...sqlFiles)
	const db = new DatabaseSync(':memory:')
	for sql of sqlFiles
		db.exec(sql)
	const stats = {calls: 0}
	return {
		raw: db
		stats: stats
		prepare: (do(sql)
			return new Statement(db, sql, [], stats)
		)
		batch: (do(statements)
			(stats.calls++)
			db.exec('BEGIN')
			try
				const out = statements.map(
					(do(s)
						return {success: true, results: s.rows(), meta: {}}
					)
				)
				db.exec('COMMIT')
				return await out
			catch err
				db.exec('ROLLBACK')
				throw err
			return await undefined
		)
	}
	return
