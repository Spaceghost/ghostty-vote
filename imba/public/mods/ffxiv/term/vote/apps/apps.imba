# Connected apps: approve (or refuse) a device link by its code, and list or disconnect
# the apps already linked to the signed-in account. Everything comes from the gated API
# (api/auth/me, api/device/lookup, api/device/approve, api/apps, api/apps/revoke) and is
# rendered through textContent only. The code may arrive as ?code= from the app's link; it
# survives the sign-in round trip because the sign-in return path keeps it.
def cursor$1()
	'use strict'
	const API = '/mods/ffxiv/term/vote/api/'
	const PAGE = '/mods/ffxiv/term/vote/apps/'
	const CODE_RE = new RegExp('^[BCDFGHJKLMNPQRSTVWXZ]{4}-[BCDFGHJKLMNPQRSTVWXZ]{4}$', '')
	try
		const t = window.localStorage.getItem('ghostty-vote:theme')
		if ((t === 'dark') || (t === 'light'))
			(document.documentElement.dataset.theme = t)
	catch e
		undefined
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
	const when = (do(ms)
		return ((Number.isFinite(ms) && (ms > 0)) ? new Date(ms).toLocaleDateString() : 'never')
	)
	def cleanCode(raw)
		const s = str(raw).toUpperCase().replace(new RegExp('[^A-Z]', 'g'), '')
		const code = ((s.slice(0, 4) + '-') + s.slice(4))
		return (CODE_RE.test(code) ? code : null)
		return
	def api(name, body)
		let res = null
		let data = null
		try
			(res = (await fetch((API + name), {method: (body ? 'POST' : 'GET'), credentials: 'same-origin', cache: 'no-store', headers: (body ? {'content-type': 'application/json', accept: 'application/json'} : {accept: 'application/json'}), body: (body ? JSON.stringify(body) : undefined)})))
			(data = (await res.json().catch(
				(do()
					return null
				)
			)))
		catch e
			undefined
		return {ok: (! (! (res && res.ok))), status: (res ? res.status : 0), data: (data || {})}
		return
	const say = (do(text)
		(query$('#link-state').textContent = text)
		return
	)
	const failure = (do(r)
		return (str(r.data.message) || (r.status ? (('That did not work (' + r.status) + ').') : 'Could not reach the server; try again.'))
	)
	let current = null
	def lookup(code)
		say('checking…')
		(query$('#ask').hidden = true)
		const r = (await api('device/lookup', {user_code: code}))
		if (r.status === 401)
			signedOut(code)
			return
		if (! r.ok)
			say(failure(r))
			return
		(current = code)
		say('')
		query$('#ask-text').replaceChildren(el('strong', {text: str(r.data.client_name)}), ((' is asking to be linked to your account (code ' + code) + '). It will be able to:'))
		query$('#ask-scopes').replaceChildren(
			...(Array.isArray(r.data.scopes) ? r.data.scopes : []).map(
				(do(s)
					return el('li', {text: str(s.description)})
				)
			)
		)
		(query$('#ask').hidden = false)
		return
	def answer(action)
		if (! current)
			return
		(query$('#approve').disabled = (query$('#deny').disabled = true))
		const r = (await api('device/approve', {user_code: current, action: action}))
		(query$('#approve').disabled = (query$('#deny').disabled = false))
		if (r.status === 401)
			signedOut(current)
			return
		if (! r.ok)
			say(failure(r))
			return
		(query$('#ask').hidden = true)
		(query$('#code').value = '')
		(current = null)
		window.history.replaceState(null, '', PAGE)
		say(((action === 'approve') ? (str(r.data.client_name) + ' is linked. Go back to it: it finishes on its own within a few seconds.') : 'Refused. Nothing was linked.'))
		if (action === 'approve')
			window.setTimeout(listApps, 6000)
		return
	def appRow(a)
		const tr = el('tr', {class: ((a.status === 'active') ? null : 'hidden-row')}, el('td', {text: str(a.client_name)}), el('td', {text: (Array.isArray(a.scopes) ? a.scopes : []).join(', ')}), el('td', {text: when(a.created_at)}), el('td', {text: when(a.last_used_at)}), el('td', {text: ((a.status === 'active') ? ('until ' + when(a.expires_at)) : (str(a.status) + (a.revoked_by ? ((' (' + str(a.revoked_by)) + ')') : '')))}))
		const cell = el('td', {class: 'row'})
		if (a.status === 'active')
			const b = el('button', {class: 'btn ghost', type: 'button', text: 'Disconnect'})
			b.addEventListener(
				'click',
				(do()
					(b.disabled = true)
					const r = (await api('apps/revoke', {id: str(a.id)}))
					if (! r.ok)
						(b.disabled = false)
						say(failure(r))
						return
					listApps()
					return
				)
			)
			cell.append(b)
		tr.append(cell)
		return tr
		return
	def listApps()
		const r = (await api('apps'))
		if (r.status === 401)
			signedOut(current)
			return
		const apps = (Array.isArray(r.data.apps) ? r.data.apps : [])
		(query$('#whoami').textContent = (('Signed in with ' + ((r.data.provider === 'github') ? 'GitHub' : 'FFXIV')) + '.'))
		if (! apps.length)
			query$('#apps').replaceChildren(el('p', {class: 'empty', text: 'No apps are linked to this account.'}))
			return
		const head = el(
			'tr',
			null,
			...['App', 'May', 'Linked', 'Last used', 'Status', ''].map(
				(do(h)
					return el('th', {text: h})
				)
			)
		)
		query$('#apps').replaceChildren(el('div', {class: 'scroll'}, el('table', {class: 'results'}, el('thead', null, head), el('tbody', null, ...apps.map(appRow)))))
		return
	def signedOut(code)
		const back = (PAGE + (code ? ('?code=' + code) : ''))
		for id of ['#signin-github', '#signin-xivauth']
			const a = query$(id)
			a.setAttribute('href', ((a.getAttribute('href').split('?')[0] + '?return=') + encodeURIComponent(back)))
		(query$('#signin').hidden = false)
		(query$('#link').hidden = true)
		(query$('#apps-section').hidden = true)
		return
	def start()
		const code = cleanCode(new URLSearchParams(window.location.search).get('code'))
		const me = (await api('auth/me'))
		if ((! me.ok) || (! me.data.signed_in))
			signedOut(code)
			return
		(query$('#link').hidden = false)
		(query$('#apps-section').hidden = false)
		query$('#code-form').addEventListener(
			'submit',
			(do(ev)
				ev.preventDefault()
				const typed = cleanCode(query$('#code').value)
				if (! typed)
					say('That does not look like a code; it is eight letters, like BCDF-GHJK.')
					return
				lookup(typed)
				return
			)
		)
		query$('#approve').addEventListener(
			'click',
			(do()
				return answer('approve')
			)
		)
		query$('#deny').addEventListener(
			'click',
			(do()
				return answer('deny')
			)
		)
		if code
			(query$('#code').value = code)
			lookup(code)
		listApps()
		return
	if (document.readyState === 'loading')
		document.addEventListener('DOMContentLoaded', start, {once: true})
	else
		start()
	return
cursor$1()
