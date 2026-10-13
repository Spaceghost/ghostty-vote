# The FFXIV mods gallery: lists the approved screenshots from GET api/shots (every mod's;
# ?mod=<id> on the page shows one mod's, untagged shots being Ghostty's) and, for a
# signed-in visitor, sends a picked file to the vote API's gallery/upload (where the session
# cookie reaches); it waits for review before it is ever shown. Signed out, the form gives
# way to the two sign-in buttons.
# A signed-in visitor also votes keep or pass on each shot. The gallery keeps the
# full-resolution images only while it has room for them, and the lowest-voted are the
# ones it drops, so these votes decide what stays.
# Rendered through textContent and attributes only.
def cursor$1()
	'use strict'
	const BASE = '/mods/ffxiv/term/gallery/'
	const VOTE_API = '/mods/ffxiv/term/vote/api/'
	const THEME_KEY = 'ghostty-vote:theme'
	const MAX_BYTES = ((8 * 1024) * 1024)
	const DOT = ' · '
	const MODS = {"ghostty":"Ghostty","almanac":"Almanac","xivmcp":"XivMcp","xivdesktop":"XivDesktop","xivarcade":"XivArcade","xivwayfinder":"XivWayfinder","xivlantern":"XivLantern","xivpiano":"XivPiano","xivhud":"XivHud","xivhud-journal":"XivHud · Journal","xivhud-character":"XivHud · Character","xivrug":"XivRug","xivstream":"XivStream","xivprism":"XivPrism","xivdispatch":"XivDispatch","xivcamp":"XivCamp"}
	const want = new URLSearchParams(location.search).get('mod')
	const MOD = ((want && Object.hasOwn(MODS, want)) ? want : '')
	const modOf = (do(s)
		return ((((typeof s.mod) === 'string') && Object.hasOwn(MODS, s.mod)) ? s.mod : 'ghostty')
	)
	const get = (do(k)
		try
			return window.localStorage.getItem(k)
		catch e
			return null
		return
	)
	const set = (do(k, v)
		try
			if v
				window.localStorage.setItem(k, v)
			else
				window.localStorage.removeItem(k)
		catch e
			undefined
		return
	)
	const saved = get(THEME_KEY)
	if ((saved === 'dark') || (saved === 'light'))
		(document.documentElement.dataset.theme = saved)
	let myVotes = Object.create(null)
	let canVote = false
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
	const str = (do(v)
		return (((typeof v) === 'string') ? v : '')
	)
	const day = (do(ms)
		return ((Number.isFinite(ms) && (ms > 0)) ? new Date(ms).toLocaleDateString() : '')
	)
	const ownPath = (do(p)
		return (((typeof p) === 'string') && new RegExp('^\\/mods\\/ffxiv\\/term\\/gallery\\/(img|thumb)\\/[A-Za-z0-9_-]{22}$', '').test(p))
	)
	def applyTheme(t)
		if ((t === 'dark') || (t === 'light'))
			(document.documentElement.dataset.theme = t)
		else
			(delete document.documentElement.dataset.theme)
		(query$('#theme').textContent = ('theme: ' + (t || 'auto')))
		return
	def summary(text)
		query$('#summary').replaceChildren('$ ', el('b', {text: 'ls'}), (' gallery/  ' + text))
		return
	def shotCard(s)
		if (! ownPath(s.src))
			return null
		const w = (Number(s.width) || 16)
		const h = (Number(s.height) || 9)
		const img = el('img', {src: (ownPath(s.thumb) ? s.thumb : s.src), alt: ((('Screenshot of ' + MODS[modOf(s)]) + ' in FFXIV') + (s.credit ? (' by ' + str(s.credit)) : '')), loading: 'lazy', decoding: 'async', width: String(w), height: String(h)})
		const cap = el('figcaption')
		if s.credit
			cap.append(el('b', {text: str(s.credit)}), DOT)
		cap.append(day(s.approved_at))
		return el('figure', {class: 'shot'}, el('a', {href: s.src, target: '_blank', rel: 'noopener'}, img), cap, voteRow(s))
		return
	def voteRow(s)
		const id = str(s.id)
		const row = el('div', {class: 'votes'})
		const counts = el('span', {class: 'tally'})
		const paint = (do(keeps, passes)
			(counts.textContent = ((((keeps + ' keep') + DOT) + passes) + ' pass'))
			for b of row.querySelectorAll('button')
				b.setAttribute('aria-pressed', ((myVotes[id] === b.dataset.vote) ? 'true' : 'false'))
			return
		)
		for kind of ['keep', 'pass']
			const b = el('button', {type: 'button', class: 'vote', 'data-vote': kind, text: kind, title: (canVote ? (('Vote to ' + kind) + ' this screenshot') : 'Sign in to vote'), disabled: (! canVote)})
			b.addEventListener(
				'click',
				(do()
					const want = ((myVotes[id] === kind) ? null : kind)
					for x of row.querySelectorAll('button')
						(x.disabled = true)
					const r = (await castVote(id, want))
					for x of row.querySelectorAll('button')
						(x.disabled = false)
					if (! r)
						return
					if want
						(myVotes[id] = want)
					else
						(delete myVotes[id])
					paint(r.keeps, r.passes)
					return
				)
			)
			row.append(b)
		row.append(counts)
		paint((Number(s.keeps) || 0), (Number(s.passes) || 0))
		return row
		return
	def castVote(id, vote)
		try
			const res = (await fetch((VOTE_API + 'gallery/vote'), {method: 'POST', credentials: 'same-origin', headers: {'content-type': 'application/json'}, body: JSON.stringify({id: id, vote: vote})}))
			if (res.status === 401)
				(canVote = false)
				signedIn(null)
				return null
			const data = (await res.json().catch(
				(do()
					return null
				)
			))
			if (((! res.ok) || (! data)) || (! data.ok))
				return null
			return {keeps: (Number(data.keeps) || 0), passes: (Number(data.passes) || 0)}
		catch e
			return null
		return
	def loadMyVotes()
		try
			const res = (await fetch((VOTE_API + 'gallery/mine'), {credentials: 'same-origin', cache: 'no-store', headers: {accept: 'application/json'}}))
			if (! res.ok)
				return
			const data = (await res.json())
			(canVote = (! (! (data && data.signed_in))))
			(myVotes = Object.create(null))
			for [id, v] of Object.entries(((data && data.votes) || {}))
				if ((v === 'keep') || (v === 'pass'))
					(myVotes[id] = v)
		catch e
			undefined
		return
	def load()
		let data = null
		try
			const res = (await fetch((BASE + 'api/shots'), {headers: {accept: 'application/json'}}))
			if res.ok
				(data = (await res.json()))
		catch e
			undefined
		const shots = ((data && Array.isArray(data.shots)) ? data.shots : null)
		if (! shots)
			summary('could not be loaded; try again later')
			query$('#shots').replaceChildren(el('p', {class: 'empty', text: 'The gallery could not be loaded.'}))
			return
		const shown = (MOD ? shots.filter(
			(do(s)
				return (modOf(s) === MOD)
			)
		) : shots)
		summary(((shown.length + ((shown.length === 1) ? ' screenshot' : ' screenshots')) + (MOD ? (' of ' + MODS[MOD]) : '')))
		const grid = el('div', {class: 'shots'})
		for s of shown
			const c = shotCard(s)
			if c
				grid.append(c)
		query$('#shots').replaceChildren((shown.length ? grid : el('p', {class: 'empty', text: (('No screenshots' + (MOD ? (' of ' + MODS[MOD]) : '')) + ' yet. Be the first to share one!')})))
		return
	def signedIn(me)
		const yes$ = (! (! (me && me.signed_in)))
		(query$('#signin').hidden = yes$)
		(query$('#upload').hidden = (! yes$))
		const who = query$('#whoami')
		(who.hidden = (! yes$))
		if yes$
			const c = me.character
			(who.textContent = ((('Signed in with ' + ((me.provider === 'github') ? 'GitHub' : 'FFXIV')) + ((c && c.name) ? ((' as ' + str(c.name)) + (c.world ? (' @ ' + str(c.world)) : '')) : '')) + '.'))
			if ((c && c.name) && (! query$('#u-credit').value))
				(query$('#u-credit').value = (str(c.name) + (c.world ? (' @ ' + str(c.world)) : '')))
		return
	def whoAmI()
		let me = null
		try
			const res = (await fetch((VOTE_API + 'auth/me'), {credentials: 'same-origin', cache: 'no-store', headers: {accept: 'application/json'}}))
			if res.ok
				(me = (await res.json()))
		catch e
			undefined
		signedIn(me)
		return
	def upload(ev)
		ev.preventDefault()
		const state = query$('#u-state')
		const file = (query$('#u-file').files && query$('#u-file').files[0])
		if (! file)
			(state.textContent = 'Pick a screenshot first.')
			return
		if ((file.type !== 'image/png') && (file.type !== 'image/jpeg'))
			(state.textContent = 'Only PNG and JPEG screenshots can be shared.')
			return
		if (file.size > MAX_BYTES)
			(state.textContent = 'Screenshots can be at most 8 MB.')
			return
		const credit = query$('#u-credit').value.trim()
		const send = query$('#u-send')
		(send.disabled = true)
		(state.textContent = 'uploading…')
		let res = null
		let data = null
		try
			const q = new URLSearchParams()
			if credit
				q.set('credit', credit)
			if MOD
				q.set('mod', MOD)
			(res = (await fetch(((VOTE_API + 'gallery/upload') + (q.toString() ? ('?' + q) : '')), {method: 'POST', credentials: 'same-origin', headers: {'content-type': file.type}, body: file})))
			(data = (await res.json().catch(
				(do()
					return null
				)
			)))
		catch e
			undefined
		(send.disabled = false)
		if (! res)
			(state.textContent = 'Could not reach the server; try again.')
			return
		if (res.status === 401)
			signedIn(null)
			return
		(state.textContent = ((data && str(data.message)) || (res.ok ? 'Thanks! It shows here once it is reviewed.' : (('The upload failed (' + res.status) + ').'))))
		if res.ok
			query$('#upload').reset()
		return
	def start()
		for a of document.querySelectorAll('#mod-filter a')
			if (a.dataset.mod === MOD)
				a.setAttribute('aria-current', 'page')
		if MOD
			(document.title = (MODS[MOD] + ' screenshots · FFXIV Mods Gallery'))
			(query$('#u-send').textContent = (('Share a ' + MODS[MOD]) + ' screenshot'))
		query$('#theme').addEventListener(
			'click',
			(do()
				const cur = (document.documentElement.dataset.theme || '')
				const next = ((cur === '') ? 'dark' : ((cur === 'dark') ? 'light' : ''))
				set(THEME_KEY, next)
				applyTheme(next)
				return
			)
		)
		applyTheme((document.documentElement.dataset.theme || ''))
		query$('#upload').addEventListener('submit', upload)
		whoAmI()
		loadMyVotes().then(load)
		return
	if (document.readyState === 'loading')
		document.addEventListener('DOMContentLoaded', start, {once: true})
	else
		start()
	return
cursor$1()
