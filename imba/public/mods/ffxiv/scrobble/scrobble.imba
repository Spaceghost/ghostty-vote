# Private account dashboard. Tokens and provider credentials are never put in browser
# storage; all account writes use the existing path-scoped session cookie and CSRF gate.
const API = '/mods/ffxiv/term/vote/api/scrobble/'
const LOGOUT = '/mods/ffxiv/term/vote/api/auth/logout'
const q = do(id) document.getElementById(id)
let busy = false
let signingOut = false
let accountGeneration = 0
let refreshWhenIdle = false
let historyCursor = null
let nextHistoryCursor = null
let refreshGeneration = 0
let recordingsCursor = null

def node(tag, text, className = '')
	const result = document.createElement(tag)
	result.textContent = String(text || '')
	if className
		result.className = className
	return result

def say(message, error = false)
	q('page-status').textContent = message
	q('page-status').dataset.error = String(error)

def dateFor(value, milliseconds = false)
	const date = new Date(Number(value) * (milliseconds ? 1 : 1000))
	return Number.isFinite(date.getTime()) && Number(value) > 0 ? date : null

def time(value, milliseconds = false)
	const date = dateFor(value, milliseconds)
	return date ? date.toLocaleString() : 'Never'

def pageCursor(value)
	if value === undefined || value === null
		return null
	if !Number.isSafeInteger(value.before) || value.before <= 0 || typeof value.cursor !== 'string' || !new RegExp('^[0-9a-f]{64}$').test(value.cursor)
		throw new Error('The host returned an invalid history cursor. Refresh and try again.')
	return {before: value.before, cursor: value.cursor}

def urlFor(name, cursor = null)
	const url = new URL(API + name, window.location.origin)
	if cursor
		url.searchParams.set('before', String(cursor.before))
		url.searchParams.set('cursor', String(cursor.cursor))
	return url

def api(name, body = undefined, cursor = null)
	const generation = accountGeneration
	const response = await fetch(urlFor(name, cursor), {
		method: body === undefined ? 'GET' : 'POST',
		credentials: 'same-origin',
		cache: 'no-store',
		headers: body === undefined ? {accept: 'application/json'} : {accept: 'application/json', 'content-type': 'application/json'},
		body: body === undefined ? undefined : JSON.stringify(body),
		signal: AbortSignal.timeout(25000)
	})
	const data = await response.json()
	if generation !== accountGeneration
		throw new DOMException('The account changed.', 'AbortError')
	if !response.ok
		if response.status === 401
			signedOut()
			say('Sign in to see your private history and connect a player.')
		throw new Error(data.message || 'The request could not be completed (' + response.status + ').')
	return data

def signedOut()
	accountGeneration++
	refreshGeneration++
	historyCursor = null
	nextHistoryCursor = null
	q('dashboard').hidden = true
	q('signin').hidden = false
	q('account-label').textContent = ''
	for id of ['listen-count', 'pending-count', 'failed-count']
		q(id).textContent = '0'
	q('now-playing').replaceChildren()
	q('history').replaceChildren()
	q('tokens').replaceChildren()
	q('recordings-list').replaceChildren()
	q('recordings-usage').textContent = ''
	q('recording-link').value = ''
	q('recording-link-box').hidden = true
	q('recordings-older').hidden = true
	recordingsCursor = null
	q('recording-player').pause()
	q('recording-player').removeAttribute('src')
	q('recording-player').load()
	q('recording-player').hidden = true
	q('history-latest').hidden = true
	q('history-older').hidden = true
	for id of ['listenbrainz-token', 'lastfm-key', 'lastfm-secret', 'delete-confirm']
		q(id).value = ''
	q('token-label').value = 'XivPiano'
	q('lastfm-setup').open = false
	for name of ['listenbrainz', 'lastfm']
		renderProvider(name, {})
	clearToken()

def clearToken()
	q('client-token').value = ''
	q('client-token').type = 'password'
	q('new-token').hidden = true

def withBusy(action)
	if busy || signingOut
		return
	const generation = accountGeneration
	busy = true
	const buttons = Array.from(document.querySelectorAll('#dashboard button:not(#signout)'))
	const previous = buttons.map(do(button) button.disabled)
	for button of buttons
		button.disabled = true
	try
		await action()
	catch error
		if generation === accountGeneration
			say(error.name === 'TimeoutError' ? 'The request timed out. Refresh to check its result before trying again.' : (error.message || 'Could not reach the server. Try again.'), true)
	finally
		for [index, button] of buttons.entries()
			button.disabled = previous[index]
		busy = false
		if refreshWhenIdle
			refreshWhenIdle = false
			if !signingOut && document.visibilityState === 'visible'
				withBusy(do
					await refresh()
				)

def forwardingBadge(item)
	const badge = node('span', (item.provider === 'lastfm' ? 'Last.fm' : 'ListenBrainz') + ': ' + (item.status || 'pending'), 'forward-status')
	badge.dataset.status = item.status || 'pending'
	if item.last_error
		badge.title = String(item.last_error)
	return badge

def track(metadata, listenedAt = null, forwards = [], index = null)
	const wrapper = node('div', '', 'listen-main')
	if index !== null
		wrapper.append(node('span', String(index + 1).padStart(2, '0'), 'listen-number'))
	const content = node('div', '', 'listen-content')
	content.append(node('span', metadata.track_name || 'Untitled', 'listen-title'))
	content.append(node('p', [metadata.artist_name, metadata.release_name].filter(Boolean).join(' · '), 'listen-artist'))
	const bottom = node('div', '', 'listen-bottom')
	if listenedAt !== null
		const stamp = node('time', time(listenedAt))
		const date = dateFor(listenedAt)
		if date
			stamp.dateTime = date.toISOString()
		bottom.append(stamp)
	for item of forwards
		bottom.append(forwardingBadge(item))
	content.append(bottom)
	wrapper.append(content)
	return wrapper

def renderTokens(tokens)
	q('tokens').replaceChildren()
	q('tokens-empty').hidden = tokens.length > 0
	for token of tokens
		const row = node('li', '')
		const label = node('div', '')
		label.append(node('strong', token.label || 'Player'))
		label.append(node('span', (token.prefix || '') + '… · Last used: ' + time(token.last_used_at, true), 'small'))
		const button = node('button', token.revoked_at ? 'Revoked' : 'Revoke', 'chip')
		button.type = 'button'
		button.disabled = !!token.revoked_at
		button.addEventListener('click', do
			withBusy(do
				await api('tokens/revoke', {id: token.id})
				clearToken()
				await refresh()
				say('Player token revoked. That player can no longer submit listens.')
			)
		)
		row.append(label, button)
		q('tokens').append(row)

def lastfmApproval(pending, value = '')
	let href = ''
	if pending
		try
			const url = new URL(value)
			if url.origin === 'https://www.last.fm' && url.pathname === '/api/auth/' && !url.username && !url.password && !url.hash && url.searchParams.get('api_key') && url.searchParams.get('token')
				href = url.href
		catch
			href = ''
	const link = q('lastfm-authorize')
	link.removeAttribute('href')
	link.hidden = !href
	q('lastfm-approval').hidden = !href
	if href
		link.href = href
	return !!href

def renderProvider(name, state)
	const connected = !!state.connected
	const status = q(name + '-status')
	status.textContent = connected ? 'Connected' : (state.auth_pending ? 'Awaiting approval' : 'Not connected')
	status.dataset.connected = String(connected)
	const detail = []
	if state.user_name
		detail.push(String(state.user_name))
	if state.pending
		detail.push(String(state.pending) + ' waiting')
	if state.failed
		detail.push(String(state.failed) + ' need attention')
	if state.last_error
		detail.push(String(state.last_error))
	if name === 'lastfm'
		const approval = lastfmApproval(!!state.auth_pending, state.authorize_url)
		if state.auth_pending && !approval
			detail.push('Approval is unavailable or expired. Start the connection again.')
	q(name + '-detail').textContent = detail.join(' · ')
	const disconnect = document.querySelector('[data-disconnect="' + name + '"]')
	disconnect.hidden = !connected && !state.auth_pending
	const retry = document.querySelector('[data-retry="' + name + '"]')
	retry.hidden = !connected || !state.failed

def refresh(cursor = historyCursor)
	const generation = ++refreshGeneration
	const state = await api('state', undefined, cursor)
	if generation !== refreshGeneration
		return
	if !state.signed_in
		signedOut()
		say('Sign in to see your private history and connect a player.')
		throw new DOMException('Sign-in is required.', 'AbortError')
	q('signin').hidden = true
	q('dashboard').hidden = false
	q('account-label').textContent = state.user_name ? 'Signed in as ' + state.user_name : 'Signed in · your private history'
	const counts = state.counts || {}
	q('listen-count').textContent = Number(counts.listens || 0).toLocaleString()
	q('pending-count').textContent = Number(counts.pending || 0).toLocaleString()
	q('failed-count').textContent = Number(counts.failed || 0).toLocaleString()
	renderTokens(Array.isArray(state.tokens) ? state.tokens : [])
	for name of ['listenbrainz', 'lastfm']
		renderProvider(name, state.providers && state.providers[name] || {})
	const now = state.now_playing
	q('now-playing').replaceChildren()
	if now && now.track_metadata
		q('now-playing').append(track(now.track_metadata))
	else
		q('now-playing').append(node('p', 'Nothing playing right now.', 'muted'))
	const history = Array.isArray(state.history) ? state.history : []
	q('history').replaceChildren()
	for [index, listen] of history.entries()
		const row = node('li', '')
		row.append(track(listen.track_metadata || {}, listen.listened_at, listen.forwarding || [], index))
		q('history').append(row)
	q('history-empty').hidden = history.length > 0
	historyCursor = cursor
	nextHistoryCursor = pageCursor(state.next_cursor)
	q('history-latest').hidden = !cursor
	q('history-older').hidden = !nextHistoryCursor
	if !busy
		say('')

q('token-form').addEventListener('submit', do(event)
	event.preventDefault()
	withBusy(do
		const data = await api('tokens', {label: q('token-label').value.trim()})
		await refresh()
		q('client-token').value = data.client_token
		q('new-token').hidden = false
		say('Token created. Copy it into XivPiano now; it cannot be shown again.')
	)
)
q('copy-token').addEventListener('click', do
	withBusy(do
		const generation = accountGeneration
		try
			await navigator.clipboard.writeText(q('client-token').value)
			if generation === accountGeneration
				say('Token copied. Paste it into Spaceghost Scrobbles in XivPiano settings.')
		catch
			if generation === accountGeneration
				q('client-token').type = 'text'
				q('client-token').select()
				say('Clipboard access is unavailable. Copy the selected token manually.')
	)
)
q('hide-token').addEventListener('click', clearToken)
q('listenbrainz-form').addEventListener('submit', do(event)
	event.preventDefault()
	withBusy(do
		await api('providers/listenbrainz', {token: q('listenbrainz-token').value.trim()})
		q('listenbrainz-token').value = ''
		await refresh()
		say('ListenBrainz connected. New listens will be stored here and forwarded there.')
	)
)
q('lastfm-form').addEventListener('submit', do(event)
	event.preventDefault()
	withBusy(do
		const data = await api('providers/lastfm/start', {api_key: q('lastfm-key').value.trim(), api_secret: q('lastfm-secret').value.trim()})
		q('lastfm-secret').value = ''
		if !lastfmApproval(true, data.authorize_url)
			throw new Error('The host returned an invalid Last.fm approval address.')
		q('lastfm-setup').open = false
		say('Open Last.fm approval, approve the connection, then press “I approved it — finish”.')
	)
)
q('lastfm-finish').addEventListener('click', do
	withBusy(do
		await api('providers/lastfm/finish', {})
		lastfmApproval(false)
		await refresh()
		say('Last.fm connected. New listens will be stored here and forwarded there.')
	)
)
for button of document.querySelectorAll('[data-disconnect]')
	button.addEventListener('click', do
		withBusy(do
			const name = button.dataset.disconnect
			await api('providers/disconnect', {provider: name})
			if name === 'lastfm'
				lastfmApproval(false)
			await refresh()
			say('Destination disconnected. Its credentials and waiting forwards have been removed.')
		)
	)
for button of document.querySelectorAll('[data-retry]')
	button.addEventListener('click', do
		withBusy(do
			await api('retry', {provider: button.dataset.retry})
			await refresh()
			say('Failed forwards queued for another attempt.')
		)
	)
q('delete-form').addEventListener('submit', do(event)
	event.preventDefault()
	if q('delete-confirm').value !== 'DELETE'
		say('Type DELETE exactly to confirm deletion.', true)
		return
	withBusy(do
		await api('history/delete', {})
		q('delete-confirm').value = ''
		historyCursor = null
		await refresh()
		say('Your history and waiting forwards here have been deleted. Already forwarded listens stay on their destination services.')
	)
)
q('refresh').addEventListener('click', do
	withBusy(do
		await refresh()
		say('History refreshed.')
	)
)
q('signout').addEventListener('click', do
	if signingOut
		return
	signingOut = true
	q('signout').disabled = true
	signedOut()
	q('signin').hidden = true
	say('Signing out. Private information has been cleared from this page…')
	try
		const response = await fetch(LOGOUT, {
			method: 'POST', credentials: 'same-origin', cache: 'no-store',
			headers: {accept: 'application/json', 'content-type': 'application/json'},
			body: JSON.stringify({}), signal: AbortSignal.timeout(25000)
		})
		if !response.ok
			throw new Error('Sign-out could not be confirmed. Refresh before using this browser on a shared device.')
		say('Signed out. Your listening history is still private to your account.')
	catch
		say('Sign-out could not be confirmed. Your information is cleared from this page; refresh and try signing out again before leaving a shared browser.', true)
	finally
		signingOut = false
		q('signout').disabled = false
		q('signin').hidden = false
)
q('history-latest').addEventListener('click', do
	withBusy(do
		await refresh(null)
		say('Showing your latest listens.')
	)
)
q('history-older').addEventListener('click', do
	withBusy(do
		await refresh(nextHistoryCursor)
		say('Showing older listens.')
	)
)
q('export').addEventListener('click', do
	withBusy(do
		let cursor = null
		let chunks = []
		let count = 0
		let bytes = 0
		const seenCursors = new Set()
		loop
			const data = await api('export', undefined, cursor)
			if !Array.isArray(data.listens)
				throw new Error('The host returned an invalid export page. No partial export was downloaded. Refresh and try again.')
			const listens = data.listens
			for listen of listens
				const line = JSON.stringify(listen)
				bytes += line.length
				if bytes > 50000000 || count >= 100000
					throw new Error('This history is too large for a browser export (100,000 listens / 50 MB). Use the authenticated paginated export API documented in the source. No partial export was downloaded.')
				chunks.push((count ? ',\n' : '') + line)
				count++
			cursor = pageCursor(data.next_cursor)
			if cursor
				const key = JSON.stringify([cursor.before, cursor.cursor])
				if listens.length === 0 || seenCursors.has(key)
					throw new Error('The host returned a history page that does not advance. No partial export was downloaded. Refresh and try again.')
				seenCursors.add(key)
			say('Preparing export: ' + count.toLocaleString() + ' listens…')
			if !cursor
				break
		const file = new Blob(['[\n', ...chunks, '\n]\n'], {type: 'application/json'})
		const href = URL.createObjectURL(file)
		const link = document.createElement('a')
		link.href = href
		link.download = 'spaceghost-scrobbles-' + new Date().toISOString().slice(0,10) + '.json'
		document.body.append(link)
		link.click()
		link.remove()
		const releaseDownload = do
			URL.revokeObjectURL(href)
		window.setTimeout(releaseDownload, 30000)
		say('Exported ' + count.toLocaleString() + ' listens. The file contains public song metadata, not credentials.')
	)
)
window.addEventListener('pagehide', do
	signedOut()
)
window.addEventListener('pageshow', do
	if busy
		refreshWhenIdle = true
	else
		withBusy(do
			await refresh()
		)
)
const poll = do
	if document.visibilityState === 'visible' && !busy && !q('dashboard').hidden
		withBusy(do
			await refresh()
		)
window.setInterval(poll, 30000)

def loadRecordings(cursor = null)
	const data = await api('recordings', undefined, cursor)
	if !Array.isArray(data.recordings)
		throw new Error('The host returned an invalid recording list.')
	q('recordings-usage').textContent = (Number(data.bytes_used) / 1048576).toFixed(1) + ' MiB used of ' + (Number(data.bytes_limit) / 1073741824).toFixed(0) + ' GiB.'
	const list = q('recordings-list')
	list.replaceChildren()
	q('recording-link').value = ''
	q('recording-link-box').hidden = true
	for recording of data.recordings
		if !new RegExp('^[0-9a-f]{64}$').test(recording.id)
			throw new Error('The host returned an invalid recording identifier.')
		const meta = recording.track_metadata || {}
		const row = node('article', '', 'recording-row')
		row.append(node('h3', meta.track_name || 'Saved recording'), node('p', (meta.artist_name || '') + (meta.release_name ? ' · ' + meta.release_name : ''), 'small'))
		const actions = node('div', '', 'scrobble-actions')
		for [label, operation] of [['Play', 'open'], ['Create new listening link', 'share'], ['Revoke links', 'revoke'], ['Delete hosted MP3', 'delete']]
			const button = node('button', label, 'chip')
			button.type = 'button'
			button.addEventListener('click', do
				if operation === 'delete' && !window.confirm('Delete this hosted recording and revoke its listening links? Your local MP3 is kept.')
					return
				withBusy(do
					const result = await api('recordings/' + recording.id + '/' + operation, {})
					if operation === 'open'
						if result.audio_url !== '/mods/ffxiv/scrobble/1/recordings/audio/' + recording.id
							throw new Error('The host returned an invalid audio address.')
						q('recording-player').src = result.audio_url
						q('recording-player').hidden = false
						# The native controls work even when browser autoplay policy blocks this call.
						try
							await q('recording-player').play()
						catch
							say('Ready. Press play in the audio controls.')
					elif operation === 'share'
						const link = new URL(result.url)
						if link.origin !== window.location.origin || link.pathname !== '/mods/ffxiv/scrobble/listen/' || !new RegExp('^#[A-Za-z0-9_-]{43}$').test(link.hash) || link.search
							throw new Error('The host returned an invalid listening link.')
						q('recording-link').value = link.href
						q('recording-link-box').hidden = false
						say('Private link created. It expires in 30 days; any previous link for this song has been revoked.')
					else
						q('recording-player').pause()
						q('recording-player').removeAttribute('src')
						q('recording-player').load()
						q('recording-player').hidden = true
						await loadRecordings()
						say(operation === 'delete' ? 'Hosted recording deleted. Your local copy is kept.' : 'Listening links revoked.')
				)
			)
			actions.append(button)
		row.append(actions)
		list.append(row)
	if !data.recordings.length
		list.append(node('p', 'No recordings on this page. Upload one from XivPiano’s Recordings tab.', 'empty-state'))
	recordingsCursor = pageCursor(data.next_cursor)
	q('recordings-older').hidden = !recordingsCursor

q('recordings-refresh').addEventListener('click', do
	withBusy(do
		await loadRecordings()
	)
)
q('recordings-older').addEventListener('click', do
	withBusy(do
		await loadRecordings(recordingsCursor)
	)
)
q('recording-copy').addEventListener('click', do
	try
		await navigator.clipboard.writeText(q('recording-link').value)
		say('Listening link copied.')
	catch
		q('recording-link').select()
		say('Select and copy the listening link above.')
)
