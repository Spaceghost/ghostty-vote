# The durable capability arrives in a fragment, never an HTTP URL or browser storage.
const secret = window.location.hash.slice(1)
history.replaceState(null, '', window.location.pathname)
const q = do(id) document.getElementById(id)
const player = q('listen-audio')
let connecting = false

def say(message)
	q('listen-status').textContent = message

def connect()
	if connecting
		return
	if !new RegExp('^[A-Za-z0-9_-]{43}$').test(secret)
		say('This page needs the complete private link from your friend.')
		return
	connecting = true
	q('listen-retry').hidden = true
	try
		const response = await fetch('/mods/ffxiv/scrobble/1/recordings/access', {method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: {'content-type': 'application/json', accept: 'application/json'}, body: JSON.stringify({secret: secret}), signal: AbortSignal.timeout(25000)})
		const data = await response.json()
		if !response.ok
			throw new Error(data.message || 'The recording could not be opened.')
		if !data.recording || !new RegExp('^[0-9a-f]{64}$').test(data.recording.id) || data.audio_url !== '/mods/ffxiv/scrobble/1/recordings/audio/' + data.recording.id
			throw new Error('The host returned an invalid recording.')
		const meta = data.recording.track_metadata || {}
		q('song-title').textContent = meta.track_name || 'Saved recording'
		q('song-artist').textContent = meta.artist_name || ''
		q('song-album').textContent = meta.release_name || ''
		player.src = data.audio_url
		q('listen-download').href = data.audio_url
		q('listen-download').download = ((meta.artist_name || '') + ' - ' + (meta.track_name || 'recording')).replace(new RegExp('[\\x00-\\x1f/\\\\:*?"<>|]', 'g'), '_').slice(0, 120) + '.mp3'
		q('listen-recording').hidden = false
		say('Your recording is ready. Press play when you are ready.')
	catch error
		say(error.name === 'TimeoutError' ? 'The host did not answer in time. Try reconnecting.' : error.message || 'The recording could not be opened.')
		q('listen-retry').hidden = false
	finally
		connecting = false

player.addEventListener('error', do
	say('Playback could not continue. Reconnect to renew the private playback session.')
	q('listen-retry').hidden = false
)
q('listen-retry').addEventListener('click', do
	connect()
)
q('listen-copy').addEventListener('click', do
	try
		await navigator.clipboard.writeText(window.location.origin + window.location.pathname + '#' + secret)
		say('Listening link copied.')
	catch
		say('The browser could not copy the link. Ask your friend to send the original again.')
)
window.addEventListener('pagehide', do
	player.pause()
	player.removeAttribute('src')
	player.load()
)
window.addEventListener('pageshow', do
	connect()
)
