# Ghostty for FFXIV vote page: the ballot logic that has no DOM, loaded before vote.js
# as a plain script (window.GhosttyBallot) and run by tests/ballot.test.js.
# - normalizeBallot / normalizeSuggestions clean data from localStorage or api/mine.
# - mergeBallot lets the server ballot win except where the visitor is still editing.
# - createSaveQueue sends ballot changes: one request in flight per idea, newer fields
#   coalesce into the next request, transient failures retry, and flush() sends
#   what is left with fetch keepalive when the page is hidden or closed.
def cursor$1(root)
	'use strict'
	const VOTES = ['want', 'maybe', 'skip']
	const ID_RE = new RegExp('^[a-z0-9][a-z0-9-]{0,63}$', '')
	const NOTE_MAX = 280
	const TITLE_MAX = 80
	const DETAIL_MAX = 600
	const isObject = (do(v)
		return (((! (! v)) && ((typeof v) === 'object')) && (! Array.isArray(v)))
	)
	def normalizeBallot(raw)
		const out = {}
		if (! isObject(raw))
			return out
		for [id, v] of Object.entries(raw)
			if ((! ID_RE.test(id)) || (! isObject(v)))
				continue
			const vote = (VOTES.includes(v.vote) ? v.vote : '')
			const note = (((typeof v.note) === 'string') ? v.note.slice(0, NOTE_MAX) : '')
			if ((! vote) && (! note))
				continue
			(out[id] = {vote: vote, note: note})
			if Number.isFinite(v.updated_at)
				(out[id].updated_at = v.updated_at)
		return out
		return
	def normalizeSuggestions(raw, keep)
		if (! Array.isArray(raw))
			return []
		return raw.filter(
			(do(s)
				return (isObject(s) && ((typeof s.title) === 'string'))
			)
		).slice(0, keep).map(
			(do(s)
				const out = {title: s.title.slice(0, TITLE_MAX), detail: (((typeof s.detail) === 'string') ? s.detail.slice(0, DETAIL_MAX) : ''), created_at: (Number.isFinite(s.created_at) ? s.created_at : 0)}
				if Number.isInteger(s.id)
					(out.id = s.id)
				return out
				return
			)
		)
		return
	def mergeBallot(local, server, isBusy)
		const out = {}
		for [id, v] of Object.entries(server)
			if (! isBusy(id))
				(out[id] = v)
		for [id, v] of Object.entries(local)
			if isBusy(id)
				(out[id] = v)
		return out
		return
	def ballotLost(serverVotes, serverSuggestions, localVotes, localSuggestions, storedWrite)
		return ((((! (! storedWrite)) && (! Object.keys(serverVotes).length)) && (! serverSuggestions.length)) && ((Object.keys(localVotes).length > 0) || (localSuggestions.length > 0)))
		return
	def noteNeedsRewrite(current, next, focused, drafting)
		if (drafting || (current === next))
			return false
		return ((! focused) || (current.trim() !== next.trim()))
		return
	def mergeSuggestions(server, local, sentIds, keep)
		const have = new Set(
			server.map(
				(do(s)
					return s.id
				)
			)
		)
		const extra = local.filter(
			(do(s)
				return (sentIds.has(s.id) && (! have.has(s.id)))
			)
		)
		return server.concat(extra).sort(
			(do(a, b)
				return (b.created_at - a.created_at)
			)
		).slice(0, keep)
		return
	def adjustTally(tally, from, to)
		const t = {want: (tally.want | 0), maybe: (tally.maybe | 0), skip: (tally.skip | 0)}
		if (from !== to)
			if VOTES.includes(from)
				(t[from] = Math.max(0, (t[from] - 1)))
			if VOTES.includes(to)
				(t[to]++)
		return t
		return
	const isTransient = (do(err)
		return (((((! err) || (! err.status)) || (err.status === 408)) || (err.status === 429)) || (err.status >= 500))
	)
	const RETRY_MIN_MS = 1000
	const RETRY_MAX_MS = 60000
	def retryDelay(attempt, retryAfter)
		if (Number.isFinite(retryAfter) && (retryAfter >= 0))
			return Math.max(RETRY_MIN_MS, (retryAfter * 1000))
		return Math.min(RETRY_MAX_MS, (RETRY_MIN_MS * Math.pow(2, Math.max(0, (attempt - 1)))))
		return
	def createDebouncer(ms, timers)
		const waiting = new Map()
		const api = {
			schedule: (do(key, fn)
				const cur = waiting.get(key)
				if cur
					timers.clear(cur.handle)
				waiting.set(
					key,
					{
						fn: fn
						handle: timers.set(
							(do()
								waiting.delete(key)
								fn()
								return
							),
							ms
						)
					}
				)
				return
			)
			fire: (do(key)
				const cur = waiting.get(key)
				if (! cur)
					return
				timers.clear(cur.handle)
				waiting.delete(key)
				cur.fn()
				return
			)
			fireAll: (do()
				for key of [...waiting.keys()]
					api.fire(key)
				return
			)
			has: (do(key)
				return waiting.has(key)
			)
		}
		return api
		return
	def createSaveQueue(o)
		const entries = new Map()
		let seq = 0
		let holdUntil = 0
		const entry = (do(id)
			let e = entries.get(id)
			if (! e)
				entries.set(id, (e = {pending: null, inflight: null, retry: null, attempts: 0, err: null}))
			return e
			return
		)
		const idle = (do(id, e)
			if (((! e.pending) && (! e.inflight)) && (! e.retry))
				entries.delete(id)
			return
		)
		def wait(id, e, ms, err)
			if e.retry
				o.timers.clear(e.retry)
			(e.err = err)
			(e.retry = o.timers.set(
				(do()
					(e.retry = null)
					pump(id)
					return
				),
				ms
			))
			o.onStatus(id, 'retry', err)
			return
		def pump(id, force)
			const e = entries.get(id)
			if ((((! e) || (! e.pending)) || e.inflight) || e.retry)
				return
			const held = (holdUntil - o.now())
			if ((held > 0) && (! force))
				return wait(id, e, held, {status: 429})
			const fields = e.pending
			const mine = (++seq)
			const keepalive = ((! (! force)) || (! (! (o.keepalive && o.keepalive()))))
			(e.pending = null)
			(e.inflight = {seq: mine, fields: fields, keepalive: keepalive})
			o.onStatus(id, 'saving')
			let sent
			try
				(sent = Promise.resolve(o.send(id, fields, {keepalive: keepalive})))
			catch err
				(sent = Promise.reject(err))
			sent.then(
				(do(data)
					return done(id, mine, fields, null, data)
				),
				(do(err)
					return done(id, mine, fields, (err || {}))
				)
			)
			return
		def done(id, mine, fields, err, data)
			const e = entries.get(id)
			if (((! e) || (! e.inflight)) || (e.inflight.seq !== mine))
				return
			(e.inflight = null)
			if ((! err) && (! (data && (data.ok === true))))
				(err = {})
			if (! err)
				(e.attempts = 0)
				o.onSaved(id, data, fields)
				if e.pending
					pump(id)
				else
					o.onStatus(id, 'saved')
			else
				if isTransient(err)
					(e.attempts++)
					(e.pending = Object.assign({}, fields, e.pending))
					const ms = retryDelay(e.attempts, err.retryAfter)
					if (err.status === 429)
						(holdUntil = Math.max(holdUntil, (o.now() + ms)))
					wait(id, e, ms, err)
				else
					(e.attempts = 0)
					o.onFailed(id, fields, err)
					if e.pending
						pump(id)
					else
						o.onStatus(id, 'error', err)
			idle(id, e)
			return
		return {
			change: (do(id, fields)
				const e = entry(id)
				(e.pending = Object.assign((e.pending || {}), fields))
				if e.inflight
					o.onStatus(id, 'saving')
				else
					if e.retry
						o.onStatus(id, 'retry', e.err)
					else
						pump(id)
				return
			)
			flush: (do(force)
				for [id, e] of [...entries]
					if e.retry
						o.timers.clear(e.retry)
						(e.retry = null)
					if ((force && e.inflight) && (e.pending || (! e.inflight.keepalive)))
						(e.pending = Object.assign({}, e.inflight.fields, e.pending))
						(e.inflight = null)
					if (e.pending && (! e.inflight))
						pump(id, force)
					idle(id, e)
				return
			)
			busy: (do(id)
				const e = entries.get(id)
				return ((! (! e)) && (! (! ((e.pending || e.inflight) || e.retry))))
				return
			)
			pending: (do(id)
				const e = entries.get(id)
				return (e ? Object.assign({}, (e.inflight && e.inflight.fields), e.pending) : null)
				return
			)
		}
		return
	(root.GhosttyBallot = Object.freeze({VOTES: VOTES, ID_RE: ID_RE, NOTE_MAX: NOTE_MAX, normalizeBallot: normalizeBallot, normalizeSuggestions: normalizeSuggestions, mergeBallot: mergeBallot, ballotLost: ballotLost, noteNeedsRewrite: noteNeedsRewrite, mergeSuggestions: mergeSuggestions, adjustTally: adjustTally, isTransient: isTransient, retryDelay: retryDelay, createDebouncer: createDebouncer, createSaveQueue: createSaveQueue}))
	return
cursor$1(globalThis)
