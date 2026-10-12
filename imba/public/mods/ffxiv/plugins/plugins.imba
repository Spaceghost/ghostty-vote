# The plugin repository page: the theme toggle, the copy button, and the live version
# of each plugin read from plugins.json (the same file the in-game installer reads).
# The page is complete without any of this; nothing below is required to install a
# plugin, and every value is written through textContent, never into markup.
def cursor$1()
	'use strict'
	const THEME_KEY = 'ghostty-vote:theme'
	const LISTING = '/mods/ffxiv/plugins.json'
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
	const query$ = (do(s)
		return document.querySelector(s)
	)
	def applyTheme(t)
		if ((t === 'dark') || (t === 'light'))
			(document.documentElement.dataset.theme = t)
		else
			(delete document.documentElement.dataset.theme)
		(query$('#theme').textContent = ('theme: ' + (t || 'auto')))
		return
	def copyUrl(button)
		const text = query$('#repo-url').textContent.trim()
		const done = (do(ok)
			(button.textContent = (ok ? 'copied' : 'select it'))
			setTimeout(
				(do()
					(button.textContent = 'copy')
					return
				),
				1600
			)
			return
		)
		if (navigator.clipboard && navigator.clipboard.writeText)
			navigator.clipboard.writeText(text).then(
				(do()
					return done(true)
				),
				(do()
					return done(false)
				)
			)
			return
		done(false)
		return
	def showVersions(entries)
		const byName = new Map(
			entries.map(
				(do(e)
					return [e.InternalName, e]
				)
			)
		)
		for article of document.querySelectorAll('.mod[data-plugin]')
			const entry = byName.get(article.dataset.plugin)
			const slot = article.querySelector('[data-ver]')
			if (! slot)
				continue
			const unreleased = article.querySelector('[data-unreleased]')
			if unreleased
				(unreleased.hidden = (! (! entry)))
			if (! entry)
				(slot.textContent = '')
				continue
			(slot.textContent = ((entry.IsTestingExclusive ? 'test build v' : 'v') + entry.AssemblyVersion.replace(new RegExp('\\.0$', ''), '')))
			(slot.title = (entry.TestingAssemblyVersion ? ('testing: v' + entry.TestingAssemblyVersion.replace(new RegExp('\\.0$', ''), '')) : ''))
		return
	def load()
		fetch(LISTING, {headers: {accept: 'application/json'}}).then(
			(do(r)
				return (r.ok ? r.json() : [])
			)
		).then(
			(do(body)
				return showVersions((Array.isArray(body) ? body : []))
			)
		).catch(
			(do()
				undefined
				return
			)
		)
		return
	def start()
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
		query$('#copy').addEventListener(
			'click',
			(do(e)
				return copyUrl(e.currentTarget)
			)
		)
		load()
		return
	if (document.readyState === 'loading')
		document.addEventListener('DOMContentLoaded', start)
	else
		start()
	return
cursor$1()
