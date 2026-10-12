# The owner's analytics and abuse panels on the admin page. A static shell with no data
# in it: everything comes from GET api/admin/analytics, which answers only the accounts
# in ADMIN_ACCOUNTS (403 for anyone else, 401 when signed out). There is no public
# analytics endpoint and no analytics data in any static file.
#
# Every number drawn here is an aggregate daily counter. The only per-machine rows are in
# the abuse panel, which lists refused requests by a keyed digest that rotates weekly;
# the Ban buttons post that digest, so an address never passes through this page either.
# Charts are inline SVG with no libraries and no inline styles (the page's CSP forbids
# both). Text is set with textContent only.
def cursor$1()
	'use strict'
	var BASE = '/mods/ffxiv/term/vote/'
	var NS = 'http://www.w3.org/2000/svg'
	var CLASSES = ['dalamud', 'browser', 'page', 'bot', 'other', 'none']
	var COLOURS = {dalamud: '#6fd6d0', browser: '#d8b26a', page: '#9bd66f', bot: '#c98fd6', other: '#8a93a0', none: '#5a6270'}
	var BAD = {notfound: 1, limited: 1, refused: 1, banned: 1, error: 1}
	var state = {data: null, mode: 'class'}
	def el(tag, attrs, kids)
		var n = document.createElement(tag)
		apply(n, attrs)
		add(n, kids)
		return n
		return
	def s(tag, attrs, kids)
		var n = document.createElementNS(NS, tag)
		apply(n, attrs)
		add(n, kids)
		return n
		return
	def apply(n, attrs)
		for k of Object.keys((attrs || {}))
			var v = attrs[k]
			if (((v === null) || (v === undefined)) || (v === false))
				continue
			if (k === 'text')
				(n.textContent = String(v))
			else
				if (k === 'class')
					n.setAttribute('class', v)
				else
					n.setAttribute(k, ((v === true) ? '' : String(v)))
		return
	def add(n, kids)
		if (! kids)
			return
		var i = 0
		while (i < kids.length)
			if (((kids[i] !== null) && (kids[i] !== undefined)) && (kids[i] !== false))
				n.append(kids[i])
			(i++)
		return
	var query$ = (do(q)
		return document.querySelector(q)
		return
	)
	var num = (do(v)
		return (Number.isFinite(Number(v)) ? Number(v) : 0)
		return
	)
	var fmt = (do(v)
		return num(v).toLocaleString()
		return
	)
	var when = (do(ms)
		return ((Number.isFinite(Number(ms)) && (ms > 0)) ? new Date(Number(ms)).toLocaleString() : '-')
		return
	)
	var str = (do(v)
		return (((typeof v) === 'string') ? v : '')
		return
	)
	def say(id, text, bad)
		var box = query$(id)
		if (! box)
			return
		box.replaceChildren('$ ', el('b', {text: ((id === '#stats-summary') ? 'analytics' : 'abuse')}), '  ', el('span', {text: text, class: (bad ? 'warn' : null)}))
		return
	def stack(days, keys, colours)
		var W = 720
		var H = 180
		var L = 34
		var B = 16
		var top = 6
		var max = 1
		var i = 0
		while (i < days.length)
			var t = 0
			var k = 0
			while (k < keys.length)
				(t += num(days[i].by[keys[k]]))
				(k++)
			if (t > max)
				(max = t)
			(i++)
		var bw = ((W - L) / Math.max(days.length, 1))
		var kids = []
		var g = 0
		while (g <= 2)
			var y = (top + (((H - top) - B) * (g / 2)))
			kids.push(s('line', {class: 'grid', x1: L, x2: W, y1: y, y2: y}))
			kids.push(s('text', {class: 'dim', x: 0, y: (y + 3), text: fmt(Math.round((max * (1 - (g / 2)))))}))
			(g++)
		var d = 0
		while (d < days.length)
			var base = (H - B)
			var x = (L + (d * bw))
			var j = 0
			while (j < keys.length)
				var v = num(days[d].by[keys[j]])
				if (! v)
					(j++)
					continue
				var h = (((H - top) - B) * (v / max))
				(base -= h)
				kids.push(s('rect', {x: (x + 0.5), y: base, width: Math.max((bw - 1), 0.8), height: h, fill: colours[keys[j]]}, [s('title', {text: ((((days[d].day + ' - ') + keys[j]) + ' - ') + fmt(v))})]))
				(j++)
			if ((days.length <= 40) || ((d % 7) === 0))
				kids.push(s('text', {class: 'dim', x: x, y: (H - 4), text: days[d].day.slice(5)}))
			(d++)
		return s('svg', {class: 'chart', viewBox: ((('0 0 ' + W) + ' ') + H), role: 'img', 'aria-label': 'daily requests'}, kids)
		return
	def bars(rows, badKey)
		var W = 360
		var rowH = 17
		var H = Math.max((rows.length * rowH), rowH)
		var max = 1
		var i
		(i = 0)
		while (i < rows.length)
			if (num(rows[i].n) > max)
				(max = num(rows[i].n))
			(i++)
		var kids = []
		(i = 0)
		while (i < rows.length)
			var y = (i * rowH)
			var w = ((W - 190) * (num(rows[i].n) / max))
			kids.push(s('text', {x: 0, y: (y + 11), text: String(rows[i].name).slice(0, 22)}))
			kids.push(s('rect', {class: 'track', x: 120, y: (y + 4), width: (W - 190), height: 8, rx: 4}))
			kids.push(s('rect', {class: ((badKey && badKey(rows[i])) ? 'bar bad' : 'bar'), x: 120, y: (y + 4), width: Math.max(w, 1), height: 8, rx: 4}))
			kids.push(s('text', {class: 'dim', x: W, y: (y + 11), 'text-anchor': 'end', text: fmt(rows[i].n)}))
			(i++)
		return s('svg', {class: 'chart', viewBox: ((('0 0 ' + W) + ' ') + H), role: 'img', 'aria-label': 'totals'}, kids)
		return
	def legend(keys, colours)
		var kids = keys.map(
			(do(k)
				return el('span', null, [s('svg', {width: 14, height: 6, 'aria-hidden': 'true'}, [s('rect', {width: 14, height: 6, rx: 3, fill: colours[k]})]), k])
				return
			)
		)
		return el('div', {class: 'legend'}, kids)
		return
	def byDay(series, key, only)
		var map = new Map()
		var i = 0
		while (i < series.length)
			var r = series[i]
			if (only && (str(r.bucket) !== only))
				(i++)
				continue
			var day = str(r.day)
			if (! map.has(day))
				map.set(day, {day: day, by: {}, total: 0})
			var e = map.get(day)
			var k = (str(r[key]) || 'other')
			(e.by[k] = ((e.by[k] || 0) + num(r.hits)))
			(e.total += num(r.hits))
			(i++)
		return Array.from(map.values()).sort(
			(do(a, b)
				return ((a.day < b.day) ? (- 1) : 1)
				return
			)
		)
		return
	def topBuckets(series)
		var map = new Map()
		var i = 0
		while (i < series.length)
			map.set(str(series[i].bucket), ((map.get(str(series[i].bucket)) || 0) + num(series[i].hits)))
			(i++)
		return Array.from(
			map,
			(do(e)
				return {name: e[0], n: e[1]}
				return
			)
		).sort(
			(do(a, b)
				return (b.n - a.n)
				return
			)
		)
		return
	def linkTable(spans)
		var per = new Map()
		var i = 0
		while (i < spans.length)
			var r = spans[i]
			var b = str(r.bucket)
			if (! per.has(b))
				per.set(b, {bucket: b, today: 0, week: 0, month: 0, bad: 0})
			var e = per.get(b)
			(e.today += num(r.today))
			(e.week += num(r.week))
			(e.month += num(r.month))
			if BAD[str(r.outcome)]
				(e.bad += num(r.month))
			(i++)
		var rows = Array.from(per.values()).sort(
			(do(a, b)
				return (b.month - a.month)
				return
			)
		)
		var head = el('tr')
		['link', 'today', '7 days', '30 days', 'not ok'].forEach(
			(do(h, n)
				head.append(el('th', {scope: 'col', text: h, class: (n ? 'n' : null)}))
				return
			)
		)
		var body = el('tbody')
		rows.forEach(
			(do(r)
				var pct = (r.month ? Math.round(((r.bad / r.month) * 100)) : 0)
				body.append(el('tr', null, [el('td', {text: r.bucket}), el('td', {class: 'n', text: fmt(r.today)}), el('td', {class: 'n', text: fmt(r.week)}), el('td', {class: 'n', text: fmt(r.month)}), el('td', {class: ('n' + ((pct >= 20) ? ' warn' : '')), text: (fmt(r.bad) + (pct ? ((' (' + pct) + '%)') : ''))})]))
				return
			)
		)
		return el('div', {class: 'scroll'}, [el('table', {class: 'results'}, [el('thead', null, [head]), body])])
		return
	def abuseTable(rows)
		if (! rows.length)
			return el('p', {class: 'empty', text: 'Nothing has been refused in the last 30 days.'})
		var head = el('tr')
		['who (digest)', 'refusals', 'why', 'where', 'from', 'last seen', ''].forEach(
			(do(h)
				head.append(el('th', {scope: 'col', text: h}))
				return
			)
		)
		var body = el('tbody')
		rows.forEach(
			(do(r)
				var who = str(r.who)
				var asn = num(r.asn)
				body.append(el('tr', null, [el('td', null, [el('code', {text: (who.slice(0, 12) || '-')})]), el('td', {class: 'n', text: fmt(r.hits)}), el('td', {text: str(r.outcomes).replace(new RegExp(',', 'g'), ' ')}), el('td', {text: str(r.buckets).replace(new RegExp(',', 'g'), ' ').slice(0, 40)}), el('td', {text: (str(r.country) + (asn ? (' - AS' + asn) : ''))}), el('td', {text: when(r.last_at)}), el('td', null, [((who && (who !== 'overflow')) ? banButton('Ban 7d', {action: 'ban', kind: 'ip', value: who, days: 7, reason: 'admin page'}) : null), (asn ? banButton(('Ban AS' + asn), {action: 'ban', kind: 'asn', value: String(asn), days: 30, reason: 'admin page'}) : null)])]))
				return
			)
		)
		return el('div', {class: 'scroll'}, [el('table', {class: 'results'}, [el('thead', null, [head]), body])])
		return
	def denyTable(rows)
		if (! rows.length)
			return el('p', {class: 'empty', text: 'Nothing is blocked.'})
		var head = el('tr')
		['kind', 'value', 'reason', 'blocked', 'until', 'hits', ''].forEach(
			(do(h)
				head.append(el('th', {scope: 'col', text: h}))
				return
			)
		)
		var body = el('tbody')
		rows.forEach(
			(do(r)
				body.append(el('tr', null, [el('td', {text: str(r.kind)}), el('td', null, [el('code', {text: str(r.value).slice(0, 24)})]), el('td', {text: str(r.reason)}), el('td', {text: when(r.created_at)}), el('td', {text: (num(r.expires_at) ? when(r.expires_at) : 'no expiry')}), el('td', {class: 'n', text: fmt(r.hits)}), el('td', null, [banButton('Unban', {action: 'unban', id: str(r.id)})])]))
				return
			)
		)
		return el('div', {class: 'scroll'}, [el('table', {class: 'results'}, [el('thead', null, [head]), body])])
		return
	def banButton(label, body)
		var b = el('button', {class: 'chip', type: 'button', text: label})
		b.addEventListener(
			'click',
			(do()
				(b.disabled = true)
				fetch((BASE + 'api/admin/deny'), {method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)}).then(
					(do(res)
						if (! res.ok)
							(b.textContent = (('failed (' + res.status) + ')'))
							(b.disabled = false)
							return
						(b.textContent = ((body.action === 'unban') ? 'unbanned' : 'banned'))
						load()
						return
					)
				).catch(
					(do()
						(b.textContent = 'failed')
						(b.disabled = false)
						return
					)
				)
				return
			)
		)
		return b
		return
	def zonePanel(cf)
		if ((! cf) || ((typeof cf) !== 'object'))
			return el('p', {class: 'empty', text: 'Cloudflare zone totals unavailable.'})
		if (! cf.configured)
			return el('p', {class: 'small', text: (str(cf.hint) || 'Cloudflare zone totals are not configured.')})
		if cf.error
			return el('p', {class: 'small warn', text: ('Cloudflare zone totals: ' + str(cf.error))})
		var days = (Array.isArray(cf.days) ? cf.days : [])
		if (! days.length)
			return el('p', {class: 'empty', text: 'Cloudflare returned no days.'})
		var shaped = days.map(
			(do(d)
				return {day: str(d.date), by: {cached: num(d.cached), origin: Math.max((num(d.requests) - num(d.cached)), 0)}}
				return
			)
		)
		var total = days.reduce(
			(do(a, d)
				return (a + num(d.requests))
				return
			),
			0
		)
		var threats = days.reduce(
			(do(a, d)
				return (a + num(d.threats))
				return
			),
			0
		)
		return el('div', null, [el('p', {class: 'small stat', text: (((((fmt(total) + ' zone requests over ') + days.length) + ' days - ') + fmt(threats)) + ' flagged by Cloudflare security')}), legend(['cached', 'origin'], {cached: '#6fd6d0', origin: '#d8b26a'}), stack(shaped, ['cached', 'origin'], {cached: '#6fd6d0', origin: '#d8b26a'})])
		return
	def render()
		var d = state.data
		if (! d)
			return
		var series = (Array.isArray(d.series) ? d.series : [])
		var spans = (Array.isArray(d.spans) ? d.spans : [])
		var days = byDay(series, ((state.mode === 'class') ? 'class' : 'bucket'))
		var keys = ((state.mode === 'class') ? CLASSES : topBuckets(series).slice(0, 6).map(
			(do(r)
				return r.name
				return
			)
		))
		var colours = {}
		var palette = ['#6fd6d0', '#d8b26a', '#9bd66f', '#c98fd6', '#8a93a0', '#5a6270']
		keys.forEach(
			(do(k, i)
				(colours[k] = (COLOURS[k] || palette[(i % palette.length)]))
				return
			)
		)
		var sampled = series.some(
			(do(r)
				return (num(r.samples) && (num(r.hits) > num(r.samples)))
				return
			)
		)
		var total30 = spans.reduce(
			(do(a, r)
				return (a + num(r.month))
				return
			),
			0
		)
		say(
			'#stats-summary',
			((((((((fmt(total30) + ' requests in 30 days') + ' - ') + fmt(
				spans.reduce(
					(do(a, r)
						return (a + num(r.today))
						return
					),
					0
				)
			)) + ' today') + ' - rollups kept ') + num((d.retention && d.retention.rollup_days))) + ' days') + (sampled ? ' - sampled during a spike' : ''))
		)
		query$('#stats-chart').replaceChildren(legend(keys, colours), stack(days, keys, colours))
		query$('#stats-links').replaceChildren(linkTable(spans))
		query$('#stats-panels').replaceChildren(
			el(
				'div',
				null,
				[el('h3', {text: 'Countries (30 days)'}), bars(
					(d.countries || []).slice(0, 12).map(
						(do(r)
							return {name: str(r.country), n: num(r.hits)}
							return
						)
					)
				)]
			),
			el(
				'div',
				null,
				[el('h3', {text: 'Linked from (30 days)'}), ((d.refs || []).length ? bars(
					d.refs.slice(0, 12).map(
						(do(r)
							return {name: str(r.host), n: num(r.hits)}
							return
						)
					)
				) : el('p', {class: 'empty', text: 'No referrers yet.'}))]
			),
			el('div', null, [el('h3', {text: (('Busiest links (' + num(d.days)) + ' days)')}), bars(topBuckets(series).slice(0, 12))]),
			el('div', null, [el('h3', {text: 'Cloudflare zone'}), zonePanel(d.cloudflare)])
		)
		var abuse = (Array.isArray(d.abuse) ? d.abuse : [])
		var deny = (Array.isArray(d.deny) ? d.deny : [])
		say('#abuse-summary', (((((((abuse.length + ' refused sources in 30 days - ') + deny.length) + ' blocked - log kept ') + num((d.retention && d.retention.abuse_days))) + ' days, digests rotate every ') + num((d.retention && d.retention.salt_window_days))) + ' days'), (abuse.length > 0))
		query$('#abuse').replaceChildren(abuseTable(abuse))
		query$('#deny').replaceChildren(denyTable(deny))
		return
	def load()
		fetch((BASE + 'api/admin/analytics'), {credentials: 'same-origin', cache: 'no-store'}).then(
			(do(res)
				if (res.status === 401)
					say('#stats-summary', 'sign in as the owner to see this', true)
					return null
				if (res.status === 403)
					say('#stats-summary', 'this account is not the site owner', true)
					return null
				if (! res.ok)
					say('#stats-summary', (('could not be loaded (' + res.status) + ')'), true)
					return null
				return res.json()
				return
			)
		).then(
			(do(data)
				if ((! data) || ((typeof data) !== 'object'))
					return
				(state.data = data)
				render()
				return
			)
		).catch(
			(do()
				say('#stats-summary', 'could not be loaded', true)
				return
			)
		)
		return
	def start()
		if (! query$('#stats-chart'))
			return
		var toggles = document.querySelectorAll('.chip[data-stats]')
		var i = 0
		while (i < toggles.length)
			const cursor$2 = (do(b)
				b.addEventListener(
					'click',
					(do()
						(state.mode = b.dataset.stats)
						var j = 0
						while (j < toggles.length)
							toggles[j].setAttribute('aria-pressed', String((toggles[j] === b)))
							(j++)
						render()
						return
					)
				)
				return
			)
			cursor$2(toggles[i])
			(i++)
		load()
		return
	if (document.readyState === 'loading')
		document.addEventListener('DOMContentLoaded', start, {once: true})
	else
		start()
	return
cursor$1()
