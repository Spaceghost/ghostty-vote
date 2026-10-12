# The FFXIV mods hub and minisites: the theme toggle, the copy button, the media slots
# (from each mod's media/manifest.json) and the community screenshots of one mod.
# Everything is rendered through textContent and attributes only. The pages are complete
# without this script except for the media slots and the community shots.
#
# A page says which mod it is on <body data-mod="..."> and where its manifest is with
# data-media="...". docs/MEDIA.md describes the manifest.
def cursor$1()
	'use strict'
	var VOTE_API = '/mods/ffxiv/term/vote/api/'
	var GALLERY = '/mods/ffxiv/term/gallery/'
	var THEME_KEY = 'ghostty-vote:theme'
	var MAX_BYTES = ((8 * 1024) * 1024)
	var MODS = ["ghostty","almanac","xivmcp","xivdesktop","xivarcade","xivwayfinder","xivlantern","xivpiano","xivhud","xivhud-journal","xivhud-character","xivrug","xivstream"]
	var DOT = ' · '
	def get(k)
		try
			return window.localStorage.getItem(k)
		catch e
			return null
		return
	def set(k, v)
		try
			if v
				window.localStorage.setItem(k, v)
			else
				window.localStorage.removeItem(k)
		catch e
			undefined
		return
	var saved = get(THEME_KEY)
	if ((saved === 'dark') || (saved === 'light'))
		(document.documentElement.dataset.theme = saved)
	def query$(s)
		return document.querySelector(s)
		return
	def el(tag, attrs)
		var n = document.createElement(tag)
		var a = (attrs || {})
		Object.keys(a).forEach(
			(do(k)
				var v = a[k]
				if (((v === false) || (v === null)) || (v === undefined))
					return
				if (k === 'class')
					(n.className = v)
				else
					if (k === 'text')
						(n.textContent = String(v))
					else
						n.setAttribute(k, ((v === true) ? '' : String(v)))
				return
			)
		)
		var i = 2
		while (i < arguments.length)
			var kid = arguments[i]
			if (((kid !== null) && (kid !== undefined)) && (kid !== false))
				n.append(kid)
			(i++)
		return n
		return
	def str(v)
		return (((typeof v) === 'string') ? v : '')
		return
	def int(v)
		var n = Number(v)
		return ((Number.isFinite(n) && (n > 0)) ? Math.round(n) : 0)
		return
	def applyTheme(t)
		if ((t === 'dark') || (t === 'light'))
			(document.documentElement.dataset.theme = t)
		else
			(delete document.documentElement.dataset.theme)
		var b = query$('#theme')
		if b
			(b.textContent = ('theme: ' + (t || 'auto')))
		return
	def wireTheme()
		var b = query$('#theme')
		if (! b)
			return
		b.addEventListener(
			'click',
			(do()
				var cur = (document.documentElement.dataset.theme || '')
				var next = ((cur === '') ? 'dark' : ((cur === 'dark') ? 'light' : ''))
				set(THEME_KEY, next)
				applyTheme(next)
				return
			)
		)
		applyTheme((document.documentElement.dataset.theme || ''))
		return
	def wireCopy()
		var b = query$('#copy')
		var src = query$('#repo-url')
		if ((! b) || (! src))
			return
		b.addEventListener(
			'click',
			(do()
				var done = (do(ok)
					(b.textContent = (ok ? 'copied' : 'select and copy'))
					window.setTimeout(
						(do()
							(b.textContent = 'copy')
							return
						),
						1800
					)
					return
				)
				try
					window.navigator.clipboard.writeText(src.textContent.trim()).then(
						(do()
							done(true)
							return
						),
						(do()
							done(false)
							return
						)
					)
				catch e
					done(false)
				return
			)
		)
		return
	var FILE_RE = new RegExp('^[a-z0-9][a-z0-9._-]{0,80}\\.(webp|avif|jpg|jpeg|png|mp4|webm)$', '')
	def fileUrl(dir, name)
		return (FILE_RE.test(str(name)) ? (dir + name) : null)
		return
	def picture(dir, f, alt, eager)
		var src = fileUrl(dir, f.src)
		if (! src)
			return null
		var set = []
		(Array.isArray(f.sizes) ? f.sizes : []).forEach(
			(do(s)
				var u = (s && fileUrl(dir, s.src))
				if (u && int(s.w))
					set.push((((u + ' ') + int(s.w)) + 'w'))
				return
			)
		)
		if (set.length && int(f.width))
			set.push((((src + ' ') + int(f.width)) + 'w'))
		var img = el('img', {src: src, alt: alt, width: (int(f.width) || null), height: (int(f.height) || null), srcset: (set.length ? set.join(', ') : null), sizes: (set.length ? '(min-width: 1100px) 520px, (min-width: 720px) 50vw, 100vw' : null), loading: (eager ? null : 'lazy'), decoding: 'async'})
		return el('a', {href: src, target: '_blank', rel: 'noopener'}, img)
		return
	def clip(dir, f, label)
		var src = fileUrl(dir, f.src)
		if (! src)
			return null
		var v = el('video', {controls: true, preload: 'none', playsinline: true, muted: (f.loop === true), loop: (f.loop === true), poster: fileUrl(dir, f.poster), width: (int(f.width) || null), height: (int(f.height) || null), 'aria-label': label})
		v.append(el('source', {src: src, type: (new RegExp('\\.webm$', '').test(src) ? 'video/webm' : 'video/mp4')}))
		return v
		return
	def slotFigure(dir, slot, first)
		var title = (str(slot.title) || str(slot.id))
		var fig = el('figure', {class: ('slot' + ((slot.wide === true) ? ' wide' : '')), id: ('shot-' + str(slot.id).replace(new RegExp('[^a-z0-9-]', 'g'), ''))})
		var files = (Array.isArray(slot.files) ? slot.files : [])
		var shown = 0
		files.forEach(
			(do(f)
				if ((! f) || ((typeof f) !== 'object'))
					return
				var alt = (str(f.alt) || title)
				var node = ((f.type === 'video') ? clip(dir, f, alt) : picture(dir, f, alt, (first && (shown === 0))))
				if (! node)
					return
				fig.append(el('div', {class: 'frame'}, node))
				(shown++)
				return
			)
		)
		if (! shown)
			fig.append(el('div', {class: 'frame pending'}, el('span', {}, el('b', {text: 'Not captured yet'}), (str(slot.kind) || 'screenshot'))))
		var cap = el('figcaption', {}, el('b', {text: title}))
		if str(slot.caption)
			cap.append(str(slot.caption))
		if str(slot.where)
			cap.append(el('span', {class: 'small', text: (' ' + str(slot.where))}))
		fig.append(cap)
		return fig
		return
	def renderVideo(dir, video)
		var box = query$('#video')
		if (((! box) || (! video)) || ((typeof video) !== 'object'))
			return
		var fig = el('figure', {class: 'slot wide'})
		var node = ((video.file && ((typeof video.file) === 'object')) ? clip(dir, video.file, str(video.title)) : null)
		fig.append((node ? el('div', {class: 'frame'}, node) : el('div', {class: 'frame pending'}, el('span', {}, el('b', {text: 'Not recorded yet'}), (str(video.length) || 'video')))))
		var cap = el('figcaption', {}, el('b', {text: (str(video.title) || 'Video')}))
		if str(video.caption)
			cap.append(str(video.caption))
		fig.append(cap)
		if (Array.isArray(video.cuts) && video.cuts.length)
			var ol = el('ol', {class: 'cuts', 'aria-label': 'Planned cuts'})
			video.cuts.forEach(
				(do(c)
					ol.append(el('li', {}, el('span', {text: str(c.t)}), el('span', {text: str(c.note)})))
					return
				)
			)
			fig.append(ol)
		box.replaceChildren(fig)
		return
	def loadMedia()
		var box = query$('#media')
		var url = document.body.dataset.media
		if (((! box) || (! url)) || (! new RegExp('^\\/mods\\/ffxiv\\/[a-z/]+\\/media\\/manifest\\.json$', '').test(url)))
			return
		var dir = url.slice(0, (url.lastIndexOf('/') + 1))
		fetch(url, {headers: {accept: 'application/json'}}).then(
			(do(r)
				return (r.ok ? r.json() : null)
				return
			)
		).then(
			(do(m)
				if ((! m) || (! Array.isArray(m.slots)))
					throw new Error('manifest')
				var grid = el('div', {class: 'media'})
				m.slots.forEach(
					(do(s, i)
						if (s && ((typeof s) === 'object'))
							grid.append(slotFigure(dir, s, (i === 0)))
						return
					)
				)
				box.replaceChildren(grid)
				renderVideo(dir, m.video)
				return
			)
		).catch(
			(do()
				box.replaceChildren(el('p', {class: 'empty', text: 'The shot list could not be loaded.'}))
				return
			)
		)
		return
	def ownShot(p)
		return (((typeof p) === 'string') && new RegExp('^\\/mods\\/ffxiv\\/term\\/gallery\\/(img|thumb)\\/[A-Za-z0-9_-]{22}$', '').test(p))
		return
	def day(ms)
		return ((Number.isFinite(ms) && (ms > 0)) ? new Date(ms).toLocaleDateString() : '')
		return
	def shotCard(s, name)
		if (! ownShot(s.src))
			return null
		var img = el('img', {src: (ownShot(s.thumb) ? s.thumb : s.src), alt: ((('Screenshot of ' + name) + ' in FFXIV') + (s.credit ? (' by ' + str(s.credit)) : '')), loading: 'lazy', decoding: 'async', width: (int(s.width) || 16), height: (int(s.height) || 9)})
		var cap = el('figcaption')
		if s.credit
			cap.append(el('b', {text: str(s.credit)}), DOT)
		cap.append(day(s.approved_at))
		return el('figure', {class: 'shot'}, el('div', {class: 'frame'}, el('a', {href: s.src, target: '_blank', rel: 'noopener'}, img)), cap)
		return
	def loadShots(mod, name)
		var box = query$('#shots')
		if (! box)
			return
		fetch(((GALLERY + 'api/shots?mod=') + mod), {headers: {accept: 'application/json'}}).then(
			(do(r)
				return (r.ok ? r.json() : null)
				return
			)
		).then(
			(do(d)
				if ((! d) || (! Array.isArray(d.shots)))
					throw new Error('shots')
				var mine = d.shots.filter(
					(do(s)
						return (s && (s.mod === mod))
						return
					)
				).slice(0, 24)
				var grid = el('div', {class: 'shots'})
				mine.forEach(
					(do(s)
						var c = shotCard(s, name)
						if c
							grid.append(c)
						return
					)
				)
				box.replaceChildren((mine.length ? grid : el('p', {class: 'empty', text: (('No community screenshots of ' + name) + ' yet. Yours could be the first.')})))
				return
			)
		).catch(
			(do()
				box.replaceChildren(el('p', {class: 'empty', text: 'The community screenshots could not be loaded.'}))
				return
			)
		)
		return
	def wireUpload(mod)
		var form = query$('#upload')
		if (! form)
			return
		form.addEventListener(
			'submit',
			(do(ev)
				ev.preventDefault()
				var state = query$('#u-state')
				var input = query$('#u-file')
				var file = (input.files && input.files[0])
				if (! file)
					(state.textContent = 'Pick a screenshot first.')
					return
				if ((file.type !== 'image/png') && (file.type !== 'image/jpeg'))
					(state.textContent = 'Only PNG and JPEG screenshots can be shared.')
					return
				if (file.size > MAX_BYTES)
					(state.textContent = 'Screenshots can be at most 8 MB.')
					return
				var credit = query$('#u-credit').value.trim()
				var send = query$('#u-send')
				(send.disabled = true)
				(state.textContent = 'uploading…')
				fetch((((VOTE_API + 'shots/upload?mod=') + mod) + (credit ? ('&credit=' + encodeURIComponent(credit)) : '')), {method: 'POST', credentials: 'same-origin', headers: {'content-type': file.type}, body: file}).then(
					(do(res)
						return res.json().catch(
							(do()
								return null
								return
							)
						).then(
							(do(data)
								(send.disabled = false)
								if (res.status === 401)
									showAccount(false)
									(state.textContent = '')
									return
								(state.textContent = ((data && str(data.message)) || (res.ok ? 'Thanks! It shows here once it is reviewed.' : (('The upload failed (' + res.status) + ').'))))
								if res.ok
									form.reset()
								return
							)
						)
						return
					)
				).catch(
					(do()
						(send.disabled = false)
						(state.textContent = 'Could not reach the server; try again.')
						return
					)
				)
				return
			)
		)
		var out = query$('#signout')
		if out
			out.addEventListener(
				'click',
				(do()
					fetch((VOTE_API + 'auth/logout'), {method: 'POST', credentials: 'same-origin'}).then(
						(do()
							showAccount(false)
							return
						),
						(do()
							undefined
							return
						)
					)
					return
				)
			)
		return
	def showAccount(signedIn)
		var a = query$('#signed-out')
		var b = query$('#signed-in')
		if a
			(a.hidden = signedIn)
		if b
			(b.hidden = (! signedIn))
		return
	def loadAccount()
		if (! query$('#signed-out'))
			return
		fetch((VOTE_API + 'auth/me'), {credentials: 'same-origin', cache: 'no-store', headers: {accept: 'application/json'}}).then(
			(do(r)
				return (r.ok ? r.json() : null)
				return
			)
		).then(
			(do(me)
				showAccount((! (! (me && (me.signed_in === true)))))
				return
			)
		).catch(
			(do()
				showAccount(false)
				return
			)
		)
		return
	def readReturn()
		var h = window.location.hash
		if ((h !== '#signed-in') && (h.indexOf('#auth-error=') !== 0))
			return
		var note = query$('#account-note')
		if note
			(note.textContent = ((h === '#signed-in') ? 'Signed in.' : 'Sign-in did not finish; try again.'))
		try
			window.history.replaceState(null, '', (window.location.pathname + '#community'))
		catch e
			undefined
		var c = query$('#community')
		if (c && ((typeof c.scrollIntoView) === 'function'))
			c.scrollIntoView()
		return
	def start()
		wireTheme()
		wireCopy()
		loadMedia()
		var mod = document.body.dataset.mod
		if (MODS.indexOf(mod) >= 0)
			loadShots(mod, (document.body.dataset.name || mod))
			wireUpload(mod)
			loadAccount()
			readReturn()
		return
	if (document.readyState === 'loading')
		document.addEventListener('DOMContentLoaded', start, {once: true})
	else
		start()
	return
cursor$1()
