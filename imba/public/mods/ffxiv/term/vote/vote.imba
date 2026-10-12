# The feature vote page, shared by every mod: <html data-mod data-page> says whose vote
# it is and where its ideas.json lives (Ghostty's when absent). The API is always under
# /mods/ffxiv/term/vote/api/, where the sign-in cookie reaches, with ?mod= naming the vote.
# A static asset: the catalogue comes from ideas.json,
# tallies from GET api/tallies (edge-cached for a minute), who is signed in from
# GET api/auth/me, and the signed-in voter's own ballot from GET api/mine, painted
# first from localStorage. Changes go to POST api/vote and api/suggest through the
# save queue in ballot.js; signed out, the voting controls stay disabled.
# All data is rendered through textContent; no HTML strings are built from data.
def cursor$1()
	'use strict'
	const BASE = '/mods/ffxiv/term/vote/'
	const B = window.GhosttyBallot
	const root = document.documentElement
	const MOD = (new RegExp('^[a-z]{1,24}$', '').test((root.dataset.mod || '')) ? root.dataset.mod : 'ghostty')
	const PAGE = (new RegExp('^\\/mods\\/ffxiv\\/[a-z/]{1,40}\\/$', '').test((root.dataset.page || '')) ? root.dataset.page : BASE)
	const Q = ('?mod=' + MOD)
	const NS = ((MOD === 'ghostty') ? 'ghostty-vote:' : (('ghostty-vote:' + MOD) + ':'))
	const KEY = {theme: 'ghostty-vote:theme', seen: (NS + 'seen-version'), since: (NS + 'session-since'), votes: (NS + 'votes'), suggestions: (NS + 'suggestions')}
	def storage(kind)
		try
			return window[kind]
		catch e
			return null
		return
	def getItem(kind, k)
		try
			return ((do()
				let cursor$2 = storage
				let cursor$3 = undefined
				cursor$2 = Reflect.apply(cursor$2, cursor$3, [kind])
				cursor$3 = undefined
				if cursor$2 == null
					return undefined
				cursor$3 = cursor$2
				cursor$2 = cursor$2.getItem
				cursor$2 = Reflect.apply(cursor$2, cursor$3, [k])
				cursor$3 = undefined
				return cursor$2
			)() ?? null)
		catch e
			return null
		return
	def setItem(kind, k, v)
		try
			const cursor$4 = (do()
				let cursor$5 = storage
				let cursor$6 = undefined
				cursor$5 = Reflect.apply(cursor$5, cursor$6, [kind])
				cursor$6 = undefined
				if cursor$5 == null
					return undefined
				cursor$6 = cursor$5
				cursor$5 = cursor$5.setItem
				cursor$5 = Reflect.apply(cursor$5, cursor$6, [k, v])
				cursor$6 = undefined
				return cursor$5
			)()
		catch e
			undefined
		return
	def removeItem(kind, k)
		try
			const cursor$7 = (do()
				let cursor$8 = storage
				let cursor$9 = undefined
				cursor$8 = Reflect.apply(cursor$8, cursor$9, [kind])
				cursor$9 = undefined
				if cursor$8 == null
					return undefined
				cursor$9 = cursor$8
				cursor$8 = cursor$8.removeItem
				cursor$8 = Reflect.apply(cursor$8, cursor$9, [k])
				cursor$9 = undefined
				return cursor$8
			)()
		catch e
			undefined
		return
	const savedTheme = getItem('localStorage', KEY.theme)
	if ((savedTheme === 'dark') || (savedTheme === 'light'))
		(document.documentElement.dataset.theme = savedTheme)
	if (! B)
		const broken = (do()
			const m = document.getElementById('cats')
			if m
				(m.textContent = 'Could not load the page script; reload to try again.')
			return
		)
		if (document.readyState === 'loading')
			document.addEventListener('DOMContentLoaded', broken, {once: true})
		else
			broken()
		return
	const NOTE_MAX = B.NOTE_MAX
	const DETAIL_MAX = 600
	const KEEP_SUGGESTIONS = 50
	const NOTE_DEBOUNCE_MS = 700
	const MINE_REFRESH_MS = (30 * 1000)
	const VOTES = B.VOTES
	const FEAS = {ready: 0, stretch: 1, research: 2}
	const EFFORT = {hours: 0, days: 1, weeks: 2}
	const LABELS = [['want', 'Want'], ['maybe', 'Maybe'], ['skip', 'Skip']]
	const ELLIPSIS = '…'
	const DOT = ' · '
	const state = {version: 0, categories: [], ideas: [], byId: new Map(), talliesOk: false, filter: 'all', sort: 'catalogue', since: null, open: new Set(), votes: {}, saved: {}, drafts: {}, status: {}, touched: {}, writeSeq: 0, mineAt: 0, mineBusy: false, storedWrite: false, suggestions: [], sentIds: new Set(), auth: 'checking', me: null, legacyBallot: false}
	const canVote = (do()
		return ((state.auth === 'in') || (state.auth === 'offline'))
	)
	const query$ = (do(s)
		return document.querySelector(s)
	)
	def el(tag, attrs, ...kids)
		const n = document.createElement(tag)
		for [k, v] of Object.entries((attrs || {}))
			if (((v === false) || (v === null)) || (v === undefined))
				continue
			if (k === 'class')
				(n.className = v)
			else
				if (k === 'text')
					(n.textContent = String(v))
				else
					n.setAttribute(k, ((v === true) ? '' : String(v)))
		for k of kids
			if (((k !== null) && (k !== undefined)) && (k !== false))
				n.append(k)
		return n
		return
	def request(path, init)
		const res = (await fetch((((path === 'ideas.json') ? PAGE : BASE) + path), {headers: {accept: 'application/json'}, ...init}))
		let data = null
		try
			(data = (await res.json()))
		catch e
			undefined
		if (! res.ok)
			const err = new Error(((data && data.message) || (('Request failed (' + res.status) + ').')))
			(err.status = res.status)
			const after = (res.headers.get('retry-after') || '').trim()
			if new RegExp('^\\d{1,6}$', '').test(after)
				(err.retryAfter = Number(after))
			throw err
		return data
		return
	const post = (do(name, body, keepalive)
		return request(('api/' + name), {method: 'POST', credentials: 'same-origin', keepalive: (! (! keepalive)), headers: {accept: 'application/json', 'content-type': 'application/json'}, body: JSON.stringify(body)})
	)
	def errorText(e, offline)
		if (e && e.status)
			return e.message
		return (offline || 'Could not reach the server; not saved.')
		return
	def readJson(key, fallback)
		const raw = getItem('localStorage', key)
		if (raw === null)
			return fallback
		try
			return JSON.parse(raw)
		catch e
			return fallback
		return
	const loadVotes = (do()
		return B.normalizeBallot(readJson(KEY.votes, {}))
	)
	const saveVotes = (do()
		return setItem('localStorage', KEY.votes, JSON.stringify(state.votes))
	)
	const loadSuggestions = (do()
		return B.normalizeSuggestions(readJson(KEY.suggestions, []), KEEP_SUGGESTIONS)
	)
	const saveSuggestions = (do()
		return setItem('localStorage', KEY.suggestions, JSON.stringify(state.suggestions))
	)
	def setMine(id, vote, note)
		if (vote || note)
			(state.votes[id] = {vote: vote, note: note})
		else
			(delete state.votes[id])
		return
	const touch = (do(id)
		(state.touched[id] = (++state.writeSeq))
		return
	)
	def applyTheme(t)
		if ((t === 'dark') || (t === 'light'))
			(document.documentElement.dataset.theme = t)
		else
			(delete document.documentElement.dataset.theme)
		(query$('#theme').textContent = ('theme: ' + (t || 'auto')))
		return
	def computeSince(version)
		const seenRaw = getItem('localStorage', KEY.seen)
		const seen = (((seenRaw !== null) && new RegExp('^\\d{1,9}$', '').test(seenRaw)) ? Number(seenRaw) : null)
		setItem('localStorage', KEY.seen, String(Math.max(version, (seen || 0))))
		const q = new URLSearchParams(location.search).get('since')
		if ((q !== null) && new RegExp('^\\d{1,9}$', '').test(q))
			return Number(q)
		const pinned = getItem('sessionStorage', KEY.since)
		if ((pinned !== null) && new RegExp('^\\d{1,9}$', '').test(pinned))
			return Number(pinned)
		const since = ((seen === null) ? version : seen)
		setItem('sessionStorage', KEY.since, String(since))
		return since
		return
	const isNew = (do(i)
		return ((state.since !== null) && (i.added_version > state.since))
	)
	def myCounts()
		const t = {want: 0, maybe: 0, skip: 0}
		for i of state.ideas
			const v = (do()
				let cursor$10 = state
				let cursor$11 = undefined
				cursor$11 = cursor$10
				cursor$10 = cursor$10.votes
				cursor$11 = cursor$10
				cursor$10 = cursor$10[i.id]
				if cursor$10 == null
					return undefined
				cursor$11 = cursor$10
				cursor$10 = cursor$10.vote
				return cursor$10
			)()
			if Reflect.has(t, v)
				(t[v]++)
		return t
		return
	def renderTally()
		const t = myCounts()
		const total = state.ideas.length
		const done = ((t.want + t.maybe) + t.skip)
		const open = (total - done)
		query$('#tally').replaceChildren('$ ', el('b', {text: 'vote'}), ' --mine  ', el('span', {class: 'w', text: ('want ' + t.want)}), DOT, el('span', {class: 'm', text: ('maybe ' + t.maybe)}), DOT, el('span', {class: 's', text: ('skip ' + t.skip)}), DOT, el('span', {class: 'u', text: ('open ' + open)}), (((((' of ' + total) + ' ') + DOT) + ' catalogue v') + state.version))
		(query$('#progress').style.width = (total ? (((100 * done) / total).toFixed(1) + '%') : '0'))
		for chip of document.querySelectorAll('.chip[data-filter="unvoted"]')
			chip.replaceChildren('Not voted', el('span', {class: 'n', text: open}))
		return
	def visible(i)
		const v = (do()
			let cursor$12 = state
			let cursor$13 = undefined
			cursor$13 = cursor$12
			cursor$12 = cursor$12.votes
			cursor$13 = cursor$12
			cursor$12 = cursor$12[i.id]
			if cursor$12 == null
				return undefined
			cursor$13 = cursor$12
			cursor$12 = cursor$12.vote
			return cursor$12
		)()
		switch state.filter
			when 'unvoted'
				return (! v)
			when 'new'
				return isNew(i)
			when 'top'
				return i.top_pick
			when 'world'
				return i.in_world
			when 'want'
				return (v === 'want')
			else
				return true
		return
	def sorted(list)
		const by = state.sort
		return [...list].sort(
			(do(a, b)
				if (by === 'wow')
					return ((b.wow - a.wow) || (a.order - b.order))
				if (by === 'wanted')
					return (((b.tally.want - a.tally.want) || (b.tally.maybe - a.tally.maybe)) || (a.order - b.order))
				if (by === 'feas')
					return (((FEAS[a.feasibility] ?? 9) - (FEAS[b.feasibility] ?? 9)) || (b.wow - a.wow))
				if (by === 'effort')
					return (((EFFORT[a.effort] ?? 9) - (EFFORT[b.effort] ?? 9)) || (b.wow - a.wow))
				return (a.order - b.order)
				return
			)
		)
		return
	def tallyNode(i)
		const {want: want, maybe: maybe, skip: skip} = i.tally
		const total = ((want + maybe) + skip)
		const wrap = el('div', {class: 'tally', id: ('tally-' + i.id)})
		const bar = el('div', {class: 'tbar', 'aria-hidden': 'true'})
		for [cls, n] of [['w', want], ['m', maybe], ['s', skip]]
			const seg = el('i', {class: cls})
			(seg.style.width = (total ? (((100 * n) / total).toFixed(2) + '%') : '0'))
			bar.append(seg)
		let line
		if total
			(line = el('span', null, 'everyone: ', el('span', {class: 'w', text: (want + ' want')}), DOT, el('span', {class: 'm', text: (maybe + ' maybe')}), DOT, el('span', {class: 's', text: (skip + ' skip')})))
		else
			(line = el('span', {text: (state.talliesOk ? 'everyone: no votes yet' : 'everyone: tallies unavailable right now')}))
		wrap.append(bar, line)
		return wrap
		return
	const NOTE_PLACEHOLDER = 'A note for the plan (optional, only the maintainer sees it)'
	const NOTE_SIGNED_OUT = 'Sign in to leave a note'
	def cueOf(vote)
		if (state.auth === 'out')
			return ['cue open', (vote ? 'your vote · sign in to change it' : 'sign in to vote')]
		return (vote ? ['cue', 'your vote'] : ['cue open', 'not voted yet'])
		return
	def card(i)
		const mine = state.votes[i.id]
		const vote = ((do()
			let cursor$14 = mine
			let cursor$15 = undefined
			if cursor$14 == null
				return undefined
			cursor$15 = cursor$14
			cursor$14 = cursor$14.vote
			return cursor$14
		)() || '')
		const a = el('article', {class: 'idea', 'data-vote': vote, id: ('idea-' + i.id), 'aria-labelledby': ('h-' + i.id)})
		a.append(el('h3', {id: ('h-' + i.id), text: i.title}), el('p', {class: 'pitch', text: i.pitch}))
		const meta = el('div', {class: 'meta'})
		if isNew(i)
			meta.append(el('span', {class: 'tag new', text: 'new'}))
		if i.top_pick
			meta.append(el('span', {class: 'tag top', text: 'top pick'}))
		if i.in_world
			meta.append(el('span', {class: 'tag world', text: 'in-world'}))
		if i.feasibility
			meta.append(el('span', {class: ('tag feas-' + i.feasibility), text: i.feasibility}))
		if i.effort
			meta.append(el('span', {class: 'tag', text: i.effort}))
		const wow = el('span', {class: 'wow', role: 'img', title: (('wow ' + i.wow) + '/10'), 'aria-label': (('wow ' + i.wow) + ' of 10')})
		let cursor$16 = 1
		while (cursor$16 <= 10)
			wow.append(el('i', {class: ((cursor$16 <= i.wow) ? 'on' : '')}))
			(cursor$16++)
		meta.append(wow)
		a.append(meta, tallyNode(i))
		const [cueClass, cueText] = cueOf(vote)
		a.append(el('span', {id: ('cue-' + i.id), class: cueClass, text: cueText}))
		const vr = el('div', {class: 'vote', role: 'group', 'aria-label': ('Your vote on ' + i.title)})
		for [v, label] of LABELS
			const b = el('button', {type: 'button', id: ((('v-' + v) + '-') + i.id), 'data-v': v, 'aria-pressed': String((vote === v)), text: label, 'aria-disabled': (canVote() ? false : 'true')})
			b.addEventListener(
				'click',
				(do()
					return castVote(i.id, v)
				)
			)
			vr.append(b)
		a.append(vr)
		const d = el('details', {open: state.open.has(i.id)})
		d.addEventListener(
			'toggle',
			(do()
				if d.open
					state.open.add(i.id)
				else
					state.open.delete(i.id)
				return
			)
		)
		d.append(el('summary', {text: (((('the moment' + DOT) + 'how') + DOT) + 'risks')}))
		for [k, v] of [['the moment', i.experience], ['how it would work', i.how], ['risks', i.risks], ['for', i.audience]]
			if v
				d.append(el('span', {class: 'k', text: k}), el('p', {text: v}))
		a.append(d)
		const draft = state.drafts[i.id]
		const ta = el('textarea', {id: ('note-' + i.id), rows: '2', maxlength: String(NOTE_MAX), placeholder: (canVote() ? NOTE_PLACEHOLDER : NOTE_SIGNED_OUT), 'aria-label': ('Note on ' + i.title), disabled: (! canVote())})
		(ta.value = ((draft !== undefined) ? draft : ((do()
			let cursor$17 = mine
			let cursor$18 = undefined
			if cursor$17 == null
				return undefined
			cursor$18 = cursor$17
			cursor$17 = cursor$17.note
			return cursor$17
		)() || '')))
		const st = el('span', {id: ('note-state-' + i.id), text: (state.status[i.id] || '')})
		const count = el('span', {id: ('note-count-' + i.id), text: ((ta.value.length + ' / ') + NOTE_MAX)})
		ta.addEventListener(
			'input',
			(do()
				(state.drafts[i.id] = ta.value)
				(count.textContent = ((ta.value.length + ' / ') + NOTE_MAX))
				setStatus(i.id, ELLIPSIS)
				notes.schedule(
					i.id,
					(do()
						return commitNote(i.id)
					)
				)
				return
			)
		)
		ta.addEventListener(
			'blur',
			(do()
				return notes.fire(i.id)
			)
		)
		a.append(ta, el('div', {class: 'note-row'}, st, count))
		return a
		return
	def syncCard(i)
		if (! document.getElementById(('idea-' + i.id)))
			return
		const mine = state.votes[i.id]
		const vote = ((do()
			let cursor$19 = mine
			let cursor$20 = undefined
			if cursor$19 == null
				return undefined
			cursor$20 = cursor$19
			cursor$19 = cursor$19.vote
			return cursor$19
		)() || '')
		document.getElementById(('idea-' + i.id)).setAttribute('data-vote', vote)
		const cue = document.getElementById(('cue-' + i.id))
		if cue
			([cue.className, cue.textContent] = cueOf(vote))
		for [v] of LABELS
			const cursor$21 = (do()
				let cursor$22 = document
				let cursor$23 = undefined
				cursor$23 = cursor$22
				cursor$22 = cursor$22.getElementById
				cursor$22 = Reflect.apply(cursor$22, cursor$23, [((('v-' + v) + '-') + i.id)])
				cursor$23 = undefined
				if cursor$22 == null
					return undefined
				cursor$23 = cursor$22
				cursor$22 = cursor$22.setAttribute
				cursor$22 = Reflect.apply(cursor$22, cursor$23, ['aria-pressed', String((vote === v))])
				cursor$23 = undefined
				return cursor$22
			)()
		const cursor$24 = (do()
			let cursor$25 = document
			let cursor$26 = undefined
			cursor$26 = cursor$25
			cursor$25 = cursor$25.getElementById
			cursor$25 = Reflect.apply(cursor$25, cursor$26, [('tally-' + i.id)])
			cursor$26 = undefined
			if cursor$25 == null
				return undefined
			cursor$26 = cursor$25
			cursor$25 = cursor$25.replaceWith
			cursor$25 = Reflect.apply(cursor$25, cursor$26, [tallyNode(i)])
			cursor$26 = undefined
			return cursor$25
		)()
		const ta = document.getElementById(('note-' + i.id))
		const note = ((do()
			let cursor$27 = mine
			let cursor$28 = undefined
			if cursor$27 == null
				return undefined
			cursor$28 = cursor$27
			cursor$27 = cursor$27.note
			return cursor$27
		)() || '')
		if (ta && B.noteNeedsRewrite(ta.value, note, (ta === document.activeElement), (state.drafts[i.id] !== undefined)))
			(ta.value = note)
			const count = document.getElementById(('note-count-' + i.id))
			if count
				(count.textContent = ((note.length + ' / ') + NOTE_MAX))
		const st = document.getElementById(('note-state-' + i.id))
		if st
			(st.textContent = (state.status[i.id] || ''))
		return
	def withFocus(fn)
		const active = document.activeElement
		const id = (do()
			let cursor$29 = active
			let cursor$30 = undefined
			if cursor$29 == null
				return undefined
			cursor$30 = cursor$29
			cursor$29 = cursor$29.id
			return cursor$29
		)()
		const range = ((active instanceof HTMLTextAreaElement) ? [active.selectionStart, active.selectionEnd] : null)
		fn()
		if ((! id) || ((do()
			let cursor$31 = document
			let cursor$32 = undefined
			cursor$32 = cursor$31
			cursor$31 = cursor$31.activeElement
			if cursor$31 == null
				return undefined
			cursor$32 = cursor$31
			cursor$31 = cursor$31.id
			return cursor$31
		)() === id))
			return
		const next = document.getElementById(id)
		if (! next)
			return
		next.focus({preventScroll: true})
		if (range && (next instanceof HTMLTextAreaElement))
			try
				next.setSelectionRange(range[0], range[1])
			catch e
				undefined
		return
	def render()
		renderTally()
		const root = query$('#cats')
		if (! state.ideas.length)
			root.replaceChildren(el('p', {class: 'empty', text: 'No ideas are open for voting yet.'}))
			return
		withFocus(
			(do()
				root.replaceChildren()
				const byCat = new Map()
				for i of state.ideas
					if (! byCat.has(i.category))
						byCat.set(i.category, [])
					byCat.get(i.category).push(i)
				for c of state.categories
					const list = sorted((byCat.get(c.name) || []).filter(visible))
					if (! list.length)
						continue
					const sec = el('section', {class: 'cat', 'aria-label': c.name})
					sec.append(el('div', {class: 'cat-head'}, el('h2', {text: c.name}), (c.tagline ? el('p', {text: c.tagline}) : null)))
					const g = el('div', {class: 'grid'})
					for i of list
						g.append(card(i))
					sec.append(g)
					root.append(sec)
				if (! root.children.length)
					const msg = ((state.filter === 'unvoted') ? 'You have voted on every idea. Thank you!' : 'Nothing matches this filter yet.')
					root.append(el('p', {class: 'empty', text: msg}))
				return
			)
		)
		return
	def refresh(id)
		renderTally()
		const idea = state.byId.get(id)
		if (! idea)
			return
		if ((! (! document.getElementById(('idea-' + id)))) !== visible(idea))
			return render()
		syncCard(idea)
		return
	def applyBallot(next, adjustTallies)
		const prev = state.votes
		(state.votes = next)
		if (! state.ideas.length)
			return
		let again = false
		for i of state.ideas
			const a = (prev[i.id] || {vote: '', note: ''})
			const b = (next[i.id] || {vote: '', note: ''})
			if ((a.vote === b.vote) && (a.note === b.note))
				continue
			if adjustTallies
				(i.tally = B.adjustTally(i.tally, a.vote, b.vote))
			if ((! (! document.getElementById(('idea-' + i.id)))) !== visible(i))
				(again = true)
			else
				syncCard(i)
		renderTally()
		if again
			render()
		return
	def renderNewBanner()
		const n = state.ideas.filter(isNew).length
		const chip = query$('.chip[data-filter="new"]')
		(chip.hidden = (n === 0))
		if n
			chip.replaceChildren('New', el('span', {class: 'n', text: n}))
		(query$('#new-banner').hidden = (n === 0))
		if n
			(query$('#new-text').textContent = (((((n === 1) ? '1 idea has' : (n + ' ideas have')) + ' been added since catalogue v') + state.since) + '. They are marked new.'))
		return
	def renderSuggestions()
		const g = query$('#suggestions')
		g.replaceChildren()
		for s of state.suggestions
			const a = el('article', {class: 'idea'})
			a.append(el('h3', {text: s.title}))
			if s.detail
				a.append(el('p', {class: 'pitch', text: s.detail}))
			const when = (s.created_at ? new Date(s.created_at).toLocaleDateString() : '')
			a.append(el('div', {class: 'meta'}, el('span', {class: 'tag world', text: 'your suggestion'}), el('span', {class: 'tag', text: (when ? ('sent ' + when) : 'sent')})))
			g.append(a)
		return
	const timers = {
		set: (do(fn, ms)
			return setTimeout(fn, ms)
		)
		clear: (do(h)
			return clearTimeout(h)
		)
	}
	const notes = B.createDebouncer(NOTE_DEBOUNCE_MS, timers)
	const queue = B.createSaveQueue(
		{
			timers: timers
			now: (do()
				return Date.now()
			)
			keepalive: (do()
				return true
			)
			send: (do(id, fields, opts)
				return post('vote', {idea_id: id, ...fields}, opts.keepalive)
			)
			onSaved: onSaved
			onFailed: onFailed
			onStatus: onStatus
		}
	)
	const isBusy = (do(id)
		return (((state.drafts[id] !== undefined) || notes.has(id)) || queue.busy(id))
	)
	def setStatus(id, text)
		(state.status[id] = text)
		const st = document.getElementById(('note-state-' + id))
		if st
			(st.textContent = text)
		return
	def onStatus(id, kind, err)
		if (kind === 'saving')
			return setStatus(id, ('saving' + ELLIPSIS))
		if (kind === 'saved')
			return setStatus(id, (notes.has(id) ? ELLIPSIS : 'saved'))
		if (kind === 'error')
			return setStatus(id, errorText(err))
		const why = (((! err) || (! err.status)) ? 'offline' : ((err.status === 429) ? 'busy' : 'server error'))
		setStatus(id, ((why + '; will retry') + ELLIPSIS))
		return
	def castVote(id, v)
		const idea = state.byId.get(id)
		if (! idea)
			return
		if (! canVote())
			if (state.auth === 'out')
				promptSignIn()
			return
		const cur = (state.votes[id] || {vote: '', note: ''})
		const next = ((cur.vote === v) ? '' : v)
		(idea.tally = B.adjustTally(idea.tally, cur.vote, next))
		setMine(id, next, cur.note)
		touch(id)
		refresh(id)
		queue.change(id, {vote: (next || null)})
		return
	def commitNote(id)
		const text = state.drafts[id]
		(delete state.drafts[id])
		if (text === undefined)
			return
		const cur = (state.votes[id] || {vote: '', note: ''})
		if (text === cur.note)
			setStatus(id, (queue.busy(id) ? ('saving' + ELLIPSIS) : ''))
			return
		setMine(id, cur.vote, text)
		touch(id)
		queue.change(id, {note: text})
		return
	def onSaved(id, data)
		(state.storedWrite = true)
		const vote = (VOTES.includes(data.vote) ? data.vote : '')
		const note = (((typeof data.note) === 'string') ? data.note : '')
		(state.saved[id] = {vote: vote, note: note})
		touch(id)
		if (! isBusy(id))
			setMine(id, vote, note)
		const idea = state.byId.get(id)
		if (idea && data.tally)
			(idea.tally = B.adjustTally(
				data.tally,
				vote,
				((do()
					let cursor$33 = state
					let cursor$34 = undefined
					cursor$34 = cursor$33
					cursor$33 = cursor$33.votes
					cursor$34 = cursor$33
					cursor$33 = cursor$33[id]
					if cursor$33 == null
						return undefined
					cursor$34 = cursor$33
					cursor$33 = cursor$33.vote
					return cursor$33
				)() || '')
			))
		saveVotes()
		refresh(id)
		return
	def onFailed(id, fields, err)
		if (err && (err.status === 401))
			signedOutMidway()
		if ((! Reflect.has(fields, 'vote')) || Reflect.has((queue.pending(id) || {}), 'vote'))
			return
		const cur = (state.votes[id] || {vote: '', note: ''})
		const back = ((do()
			let cursor$35 = state
			let cursor$36 = undefined
			cursor$36 = cursor$35
			cursor$35 = cursor$35.saved
			cursor$36 = cursor$35
			cursor$35 = cursor$35[id]
			if cursor$35 == null
				return undefined
			cursor$36 = cursor$35
			cursor$35 = cursor$35.vote
			return cursor$35
		)() || '')
		const idea = state.byId.get(id)
		if idea
			(idea.tally = B.adjustTally(idea.tally, cur.vote, back))
		setMine(id, back, cur.note)
		touch(id)
		saveVotes()
		refresh(id)
		return
	def loadMine()
		if state.mineBusy
			return
		(state.mineBusy = true)
		(state.mineAt = Date.now())
		const since = state.writeSeq
		let data = null
		try
			(data = (await request(('api/mine' + Q), {credentials: 'same-origin', cache: 'no-store'})))
		catch e
			(data = null)
		finally
			(state.mineBusy = false)
		if ((! data) || ((typeof data) !== 'object'))
			return
		if (data.signed_in === false)
			signedOutMidway()
			return
		const votes = B.normalizeBallot(data.votes)
		const suggestions = B.normalizeSuggestions(data.suggestions, KEEP_SUGGESTIONS)
		if B.ballotLost(votes, suggestions, state.votes, state.suggestions, state.storedWrite)
			return
		const keepLocal = (do(id)
			return (isBusy(id) || ((state.touched[id] || 0) > since))
		)
		const saved = {...votes}
		for id of Object.keys(state.touched)
			if (state.touched[id] > since)
				if state.saved[id]
					(saved[id] = state.saved[id])
				else
					(delete saved[id])
		(state.saved = saved)
		applyBallot(B.mergeBallot(state.votes, votes, keepLocal), false)
		saveVotes()
		(state.suggestions = B.mergeSuggestions(suggestions, state.suggestions, state.sentIds, KEEP_SUGGESTIONS))
		saveSuggestions()
		renderSuggestions()
		return
	const AUTH_ERRORS = {denied: 'Sign-in was cancelled.', expired: 'Sign-in took too long, or this browser blocked its cookie. Please try again.', state: 'That sign-in could not be verified. Please try again.', provider: 'GitHub or XIVAuth did not answer as expected. Please try again in a moment.', 'not-configured': 'Sign-in is not set up yet.', 'sign-in-first': 'Sign in first, then link a character.', 'no-character': 'No character was shared, so nothing was linked. Pick a verified character on XIVAuth to link it.', refused: 'Start sign-in from the buttons on this page.', 'bad-request': 'Sign-in failed. Please try again.', 'server': 'Sign-in worked, but the site could not start your session. Please try again in a minute.'}
	def authFragmentMessage()
		const h = location.hash
		let msg = null
		if (h === '#signed-in')
			(msg = '')
		else
			if (h === '#character-linked')
				(msg = 'Character linked.')
			else
				const m = new RegExp('^#auth-error=([a-z-]{1,32})$', '').exec(h)
				if m
					(msg = (Object.hasOwn(AUTH_ERRORS, m[1]) ? AUTH_ERRORS[m[1]] : AUTH_ERRORS['bad-request']))
		if (msg !== null)
			try
				history.replaceState(null, '', (location.pathname + location.search))
			catch e
				undefined
		return msg
		return
	def setNotice(text)
		(query$('#account-notice').textContent = (text || ''))
		return
	def renderAccount()
		const out = (state.auth === 'out')
		const me = state.me
		(query$('#signed-out').hidden = (! out))
		(query$('#signed-in').hidden = (! ((state.auth === 'in') && me)))
		const back = ('?return=' + encodeURIComponent((location.pathname + location.search)))
		(query$('#signin-github').href = ((BASE + 'api/auth/github/start') + back))
		(query$('#signin-xivauth').href = ((BASE + 'api/auth/xivauth/start') + back))
		(query$('#link-character').href = ((BASE + 'api/auth/xivauth/link') + back))
		(query$('#signed-out-text').textContent = (state.legacyBallot ? 'Sign in to keep voting. The votes you made in this browser before sign-in move to your account.' : 'Sign in to vote: one ballot per account. Anyone can read the tallies.'))
		if (! me)
			return
		const c = me.character
		const via = ((me.provider === 'github') ? 'GitHub' : 'FFXIV')
		(query$('#who').textContent = (c ? (((('Signed in with ' + via) + ' as ') + c.name) + (c.world ? (' @ ' + c.world) : '')) : ('Signed in with ' + via)))
		const img = query$('#who-portrait')
		(img.hidden = (! (c && c.portrait_url)))
		if (c && c.portrait_url)
			(img.src = c.portrait_url)
		else
			img.removeAttribute('src')
		(query$('#link-character').hidden = (! (! c)))
		(query$('#link-disclosure').hidden = (! (! c)))
		(query$('#forget-character').hidden = (! c))
		(query$('#admin-link').hidden = (! me.admin))
		return
	def renderSuggestForm()
		const on = canVote()
		(query$('#s-title').disabled = (! on))
		(query$('#s-detail').disabled = (! on))
		query$('#s-send').setAttribute('aria-disabled', String((! on)))
		return
	def applyAuth()
		renderAccount()
		renderSuggestForm()
		if state.ideas.length
			render()
		return
	def forgetLocalBallot()
		removeItem('localStorage', KEY.votes)
		removeItem('localStorage', KEY.suggestions)
		(state.saved = {})
		(state.suggestions = [])
		renderSuggestions()
		applyBallot({}, false)
		return
	def promptSignIn()
		setNotice('Sign in with GitHub or FFXIV to vote.')
		const target = query$('#signin-github')
		target.scrollIntoView({block: 'center', behavior: (window.matchMedia('(prefers-reduced-motion: no-preference)').matches ? 'smooth' : 'auto')})
		target.focus({preventScroll: true})
		return
	def signedOutMidway()
		if (state.auth === 'out')
			return
		(state.auth = 'out')
		(state.me = null)
		applyAuth()
		setNotice('You are signed out. Sign in again to keep voting.')
		return
	def loadAuth()
		let me = null
		try
			(me = (await request('api/auth/me', {credentials: 'same-origin', cache: 'no-store'})))
		catch e
			(me = null)
		if ((! me) || ((typeof me) !== 'object'))
			(state.auth = 'offline')
		else
			if (me.signed_in === true)
				(state.auth = 'in')
				const c = (((me.character && ((typeof me.character) === 'object')) && ((typeof me.character.name) === 'string')) ? me.character : null)
				(state.me = {provider: ((me.provider === 'xivauth') ? 'xivauth' : 'github'), character: (c && {name: c.name, world: (((typeof c.world) === 'string') ? c.world : ''), portrait_url: (new RegExp('^https:\\/\\/', '').test(c.portrait_url) ? c.portrait_url : '')}), admin: (me.admin === true)})
			else
				(state.auth = 'out')
				(state.me = null)
				(state.legacyBallot = (me.legacy_ballot === true))
				if (! state.legacyBallot)
					forgetLocalBallot()
		applyAuth()
		return
	def logout()
		(query$('#logout').disabled = true)
		try
			(await post('auth/logout', {}))
			(state.auth = 'out')
			(state.me = null)
			(state.legacyBallot = false)
			forgetLocalBallot()
			applyAuth()
			setNotice('Signed out.')
		catch err
			setNotice(errorText(err))
		finally
			(query$('#logout').disabled = false)
		return
	def forgetCharacter()
		const b = query$('#forget-character')
		(b.disabled = true)
		try
			(await post('auth/character/forget', {}))
			if state.me
				(state.me.character = null)
			renderAccount()
			setNotice('Character forgotten. Your votes stay.')
			query$('#logout').focus()
		catch err
			if (err.status === 401)
				signedOutMidway()
			else
				setNotice(errorText(err))
		finally
			(b.disabled = false)
		return
	def setFilter(f)
		(state.filter = f)
		for c of document.querySelectorAll('.chip[data-filter]')
			c.setAttribute('aria-pressed', String((c.dataset.filter === f)))
		render()
		return
	def wireControls()
		query$('#theme').addEventListener(
			'click',
			(do()
				const cur = (document.documentElement.dataset.theme || '')
				const next = ((cur === '') ? 'dark' : ((cur === 'dark') ? 'light' : ''))
				setItem('localStorage', KEY.theme, next)
				applyTheme(next)
				return
			)
		)
		applyTheme((document.documentElement.dataset.theme || ''))
		for b of document.querySelectorAll('.chip[data-filter]')
			b.addEventListener(
				'click',
				(do()
					return setFilter(b.dataset.filter)
				)
			)
		query$('#new-show').addEventListener(
			'click',
			(do()
				setFilter('new')
				query$('#cats').scrollIntoView({block: 'start'})
				return
			)
		)
		query$('#sort').addEventListener(
			'change',
			(do(e)
				(state.sort = e.target.value)
				render()
				return
			)
		)
		query$('#next-open').addEventListener(
			'click',
			(do()
				const cards = [...document.querySelectorAll('article.idea[data-vote=""]')]
				(query$('#next-open').textContent = (cards.length ? 'Next unvoted ↓' : 'All voted ✓'))
				if (! cards.length)
					return
				const target = (cards.find(
					(do(c)
						return (c.getBoundingClientRect().top > 120)
					)
				) || cards[0])
				const smooth = window.matchMedia('(prefers-reduced-motion: no-preference)').matches
				target.scrollIntoView({block: 'center', behavior: (smooth ? 'smooth' : 'auto')})
				const cursor$37 = (do()
					let cursor$38 = target
					let cursor$39 = undefined
					cursor$39 = cursor$38
					cursor$38 = cursor$38.querySelector
					cursor$38 = Reflect.apply(cursor$38, cursor$39, ['.vote button'])
					cursor$39 = undefined
					if cursor$38 == null
						return undefined
					cursor$39 = cursor$38
					cursor$38 = cursor$38.focus
					cursor$38 = Reflect.apply(cursor$38, cursor$39, [{preventScroll: true}])
					cursor$39 = undefined
					return cursor$38
				)()
				return
			)
		)
		query$('#logout').addEventListener('click', logout)
		query$('#forget-character').addEventListener('click', forgetCharacter)
		const sTitle = query$('#s-title')
		const sDetail = query$('#s-detail')
		const sState = query$('#s-state')
		const sSend = query$('#s-send')
		sDetail.addEventListener(
			'input',
			(do()
				(query$('#s-count').textContent = ((sDetail.value.length + ' / ') + DETAIL_MAX))
				return
			)
		)
		query$('#suggest').addEventListener(
			'submit',
			(do(e)
				e.preventDefault()
				if (! canVote())
					(sState.textContent = ((state.auth === 'out') ? 'Sign in to send a suggestion.' : ''))
					if (state.auth === 'out')
						promptSignIn()
					return
				const title = sTitle.value.trim()
				const detail = sDetail.value.trim()
				if (title.length < 3)
					(sState.textContent = 'Give the idea a short title (3+ characters).')
					sTitle.focus()
					return
				(sSend.disabled = true)
				(sState.textContent = ('Sending' + ELLIPSIS))
				try
					const r = (await post('suggest', {title: title, detail: detail, mod: MOD}))
					const s = (r.suggestion || {})
					const saved = {title: (s.title || title), detail: (s.detail ?? detail), created_at: (s.created_at || Date.now())}
					if Number.isInteger(s.id)
						(saved.id = s.id)
						state.sentIds.add(s.id)
					(state.storedWrite = true)
					state.suggestions.unshift(saved)
					(state.suggestions.length = Math.min(state.suggestions.length, KEEP_SUGGESTIONS))
					saveSuggestions()
					renderSuggestions()
					(sTitle.value = '')
					(sDetail.value = '')
					(query$('#s-count').textContent = ('0 / ' + DETAIL_MAX))
					(sState.textContent = 'Thanks! It is in the review pile.')
				catch err
					(sState.textContent = errorText(err))
					if (err.status === 401)
						signedOutMidway()
				finally
					(sSend.disabled = false)
				return
			)
		)
		window.addEventListener(
			'storage',
			(do(e)
				if ((e.key === KEY.votes) && (e.newValue === null))
					signedOutMidway()
					applyBallot({}, false)
					return
				if (e.key === KEY.votes)
					applyBallot(B.mergeBallot(state.votes, loadVotes(), isBusy), true)
				if (e.key === KEY.suggestions)
					(state.suggestions = loadSuggestions())
					renderSuggestions()
				return
			)
		)
		document.addEventListener(
			'visibilitychange',
			(do()
				if (document.visibilityState === 'hidden')
					notes.fireAll()
					queue.flush(false)
				else
					if (canVote() && ((Date.now() - state.mineAt) >= MINE_REFRESH_MS))
						loadMine()
				return
			)
		)
		window.addEventListener(
			'pagehide',
			(do()
				notes.fireAll()
				queue.flush(true)
				return
			)
		)
		window.addEventListener(
			'online',
			(do()
				return queue.flush(false)
			)
		)
		return
	def load()
		(state.votes = loadVotes())
		(state.saved = {...state.votes})
		(state.suggestions = loadSuggestions())
		renderSuggestions()
		loadAuth().then(
			(do()
				if canVote()
					loadMine()
				return
			)
		)
		try
			const [data, tallies] = (await Promise.all(
				[request('ideas.json', {credentials: 'omit'}), request(('api/tallies' + Q), {credentials: 'omit'}).catch(
					(do()
						return null
					)
				)]
			))
			(state.talliesOk = (! (! (tallies && ((typeof tallies) === 'object')))))
			(state.version = data.version)
			(state.categories = data.categories)
			(state.ideas = data.ideas.map(
				(do(i, order)
					const t = ((state.talliesOk && tallies[i.id]) || {})
					return {...i, order: order, tally: {want: (t.want | 0), maybe: (t.maybe | 0), skip: (t.skip | 0)}}
					return
				)
			))
			(state.byId = new Map(
				state.ideas.map(
					(do(i)
						return [i.id, i]
					)
				)
			))
			(state.since = computeSince(state.version))
			renderNewBanner()
			render()
		catch e
			const retry = el('button', {class: 'btn ghost', type: 'button', text: 'Try again'})
			retry.addEventListener(
				'click',
				(do()
					query$('#cats').replaceChildren(el('p', {class: 'empty', text: ('Loading ideas' + ELLIPSIS)}))
					load()
					return
				)
			)
			query$('#cats').replaceChildren(el('p', {class: 'empty', text: ('Could not load the ideas. ' + errorText(e, 'Could not reach the server.'))}), retry)
		return
	def start()
		const msg = authFragmentMessage()
		wireControls()
		renderAccount()
		renderSuggestForm()
		if msg
			setNotice(msg)
		load()
		return
	if (document.readyState === 'loading')
		document.addEventListener('DOMContentLoaded', start, {once: true})
	else
		start()
	return
cursor$1()
