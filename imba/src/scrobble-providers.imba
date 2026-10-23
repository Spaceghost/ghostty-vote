# Fixed provider origins; encrypted credentials never appear in response bodies,
# outbox rows, or logs. MD5 is used only for Last.fm's required legacy signature.
import {base64url, fromBase64url, sha256hex, utf8} from './lib.js'
import {ScrobbleError, object, problem} from './scrobble-data.js'

export const LISTENBRAINZ_API = 'https://api.listenbrainz.org/1/'
export const LASTFM_API = 'https://ws.audioscrobbler.com/2.0/'
const USER_AGENT = 'Spaceghost-Scrobbles/1.0 (+https://spacegho.st/mods/ffxiv/scrobble/)'

export class DeliveryError < Error
	def constructor(code, retryable = false)
		super(code)
		this.code = code
		this.retryable = retryable

def keyBytes(value)
	if typeof value !== 'string' || !new RegExp('^[A-Za-z0-9+/]{43}=?$').test(value)
		return null
	try
		const bytes = fromBase64url(value.replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', ''))
		return bytes && bytes.length === 32 ? bytes : null
	catch
		return null

export def encryptionReady(env)
	return !!keyBytes(env.SCROBBLE_ENCRYPTION_KEY)

def cryptoKey(value)
	const bytes = keyBytes(value)
	if !bytes
		problem(503, 'encryption_unavailable', 'Provider connections are temporarily unavailable.')
	return await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt'])

def aad(account, provider, generation, keyId)
	return utf8(JSON.stringify(['spaceghost-scrobble', 1, keyId, account, provider, generation]))

export def encryptCredentials(env, account, provider, generation, value)
	const key = await cryptoKey(env.SCROBBLE_ENCRYPTION_KEY)
	const keyId = (await sha256hex(base64url(keyBytes(env.SCROBBLE_ENCRYPTION_KEY)))).slice(0, 16)
	const iv = new Uint8Array(12)
	crypto.getRandomValues(iv)
	const ciphertext = await crypto.subtle.encrypt({name: 'AES-GCM', iv: iv, additionalData: aad(account, provider, generation, keyId), tagLength: 128}, key, utf8(JSON.stringify(value)))
	return JSON.stringify({v: 1, k: keyId, iv: base64url(iv), ct: base64url(new Uint8Array(ciphertext))})

export def decryptCredentials(env, row)
	try
		const data = JSON.parse(row.credentials)
		if data.v !== 1 || typeof data.k !== 'string'
			throw new Error('envelope')
		for value of [env.SCROBBLE_ENCRYPTION_KEY, env.SCROBBLE_ENCRYPTION_KEY_PREVIOUS]
			if !keyBytes(value) || (await sha256hex(base64url(keyBytes(value)))).slice(0, 16) !== data.k
				continue
			const key = await cryptoKey(value)
			const iv = fromBase64url(data.iv)
			const ciphertext = fromBase64url(data.ct)
			if !iv || iv.length !== 12 || !ciphertext || ciphertext.length > 16384
				throw new Error('envelope')
			const bytes = await crypto.subtle.decrypt({name: 'AES-GCM', iv: iv, additionalData: aad(row.account, row.provider, row.generation, data.k), tagLength: 128}, key, ciphertext)
			return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes))
	catch
		throw new DeliveryError('credentials_unavailable', true)
	throw new DeliveryError('credentials_unavailable', true)

export def boundedProviderJson(response)
	if Number(response.headers.get('content-length')) > 65536
		if response.body
			await response.body.cancel()
		throw new DeliveryError('provider_response_invalid', true)
	if !response.body
		throw new DeliveryError('provider_response_invalid', true)
	const reader = response.body.getReader()
	const chunks = []
	let size = 0
	while true
		let chunk
		try
			chunk = await reader.read()
		catch
			throw new DeliveryError('provider_network', true)
		if chunk.done
			break
		size += chunk.value.byteLength
		if size > 65536
			await reader.cancel()
			throw new DeliveryError('provider_response_invalid', true)
		chunks.push(chunk.value)
	const bytes = new Uint8Array(size)
	let offset = 0
	for chunk of chunks
		bytes.set(chunk, offset)
		offset += chunk.byteLength
	try
		const value = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes))
		if !object(value)
			throw new Error('shape')
		return value
	catch
		throw new DeliveryError('provider_response_invalid', true)

def providerFetch(fetcher, url, init)
	let response
	try
		response = await fetcher(url, {...init, redirect: 'error', signal: AbortSignal.timeout(8000)})
	catch
		throw new DeliveryError('provider_network', true)
	if !response.ok
		if response.body
			await response.body.cancel()
		throw new DeliveryError('provider_http_' + response.status, response.status === 429 || response.status >= 500)
	return await boundedProviderJson(response)

export def validateListenBrainz(fetcher, token)
	if typeof token !== 'string' || !new RegExp('^[A-Za-z0-9_-]{16,128}$').test(token)
		problem(400, 'invalid_provider_token', 'Enter your ListenBrainz user token.')
	const data = await providerFetch(fetcher, LISTENBRAINZ_API + 'validate-token', {headers: {authorization: 'Token ' + token, accept: 'application/json', 'user-agent': USER_AGENT}})
	if data.valid !== true || typeof data.user_name !== 'string' || !data.user_name || data.user_name.length > 128
		problem(400, 'invalid_provider_token', 'ListenBrainz did not validate that token.')
	return data.user_name

export def lastfmSignature(parameters, secret)
	const keys = Object.keys(parameters).filter(do(key) key !== 'format' && key !== 'callback' && key !== 'api_sig').sort()
	const value = keys.map(do(key) key + String(parameters[key])).join('') + secret
	const digest = await crypto.subtle.digest('MD5', utf8(value))
	return [...new Uint8Array(digest)].map(do(byte) byte.toString(16).padStart(2, '0')).join('')

export def lastfmRequest(fetcher, credentials, parameters)
	const params = {...parameters, api_key: credentials.api_key}
	if credentials.session_key
		params.sk = credentials.session_key
	params.api_sig = await lastfmSignature(params, credentials.api_secret)
	params.format = 'json'
	const data = await providerFetch(fetcher, LASTFM_API, {method: 'POST', headers: {'content-type': 'application/x-www-form-urlencoded', accept: 'application/json', 'user-agent': USER_AGENT}, body: new URLSearchParams(params).toString()})
	if data.error !== undefined
		const code = Number(data.error)
		throw new DeliveryError(Number.isInteger(code) ? 'lastfm_' + code : 'lastfm_invalid_error', [8, 11, 16, 29].includes(code))
	return data

export def beginLastfm(fetcher, apiKey, apiSecret)
	if typeof apiKey !== 'string' || typeof apiSecret !== 'string' || !new RegExp('^[a-f0-9]{32}$', 'i').test(apiKey) || !new RegExp('^[a-f0-9]{32}$', 'i').test(apiSecret)
		problem(400, 'invalid_lastfm_credentials', 'Enter your Last.fm application API key and shared secret, each 32 hexadecimal characters.')
	const creds = {api_key: apiKey, api_secret: apiSecret}
	const data = await lastfmRequest(fetcher, creds, {method: 'auth.getToken'})
	if typeof data.token !== 'string' || !new RegExp('^[a-zA-Z0-9_-]{16,128}$').test(data.token)
		throw new DeliveryError('provider_response_invalid')
	return {...creds, token: data.token, started_at: Date.now()}

export def finishLastfm(fetcher, credentials)
	if !credentials.started_at || Date.now() - credentials.started_at > 3600000
		problem(400, 'lastfm_expired', 'That authorization expired. Start a new connection.')
	const data = await lastfmRequest(fetcher, credentials, {method: 'auth.getSession', token: credentials.token})
	if !object(data.session) || typeof data.session.key !== 'string' || !new RegExp('^[a-zA-Z0-9_-]{16,128}$').test(data.session.key) || typeof data.session.name !== 'string' || !data.session.name || data.session.name.length > 128
		throw new DeliveryError('provider_response_invalid')
	return {api_key: credentials.api_key, api_secret: credentials.api_secret, session_key: data.session.key, user_name: data.session.name}

export def deliver(fetcher, provider, credentials, row)
	const meta = JSON.parse(row.metadata)
	if provider === 'listenbrainz'
		const listen = {track_metadata: meta}
		if row.kind !== 'playing_now'
			listen.listened_at = row.listened_at
		const data = await providerFetch(fetcher, LISTENBRAINZ_API + 'submit-listens', {method: 'POST', headers: {authorization: 'Token ' + credentials.token, 'content-type': 'application/json', accept: 'application/json', 'user-agent': USER_AGENT}, body: JSON.stringify({listen_type: row.kind, payload: [listen]})})
		if data.status !== 'ok'
			throw new DeliveryError('listenbrainz_not_accepted')
		return
	const params = {method: row.kind === 'playing_now' ? 'track.updateNowPlaying' : 'track.scrobble', artist: meta.artist_name, track: meta.track_name}
	if meta.release_name
		params.album = meta.release_name
	if (meta.additional_info && meta.additional_info.duration_ms)
		params.duration = String(Math.floor(meta.additional_info.duration_ms / 1000))
	if row.kind !== 'playing_now'
		params.timestamp = String(row.listened_at)
		params.chosenByUser = '0'
	const data = await lastfmRequest(fetcher, credentials, params)
	let result
	if row.kind === 'playing_now'
		result = data.nowplaying
	else
		if !data.scrobbles || Number(data.scrobbles['@attr'] && data.scrobbles['@attr'].accepted) !== 1 || Number(data.scrobbles['@attr'] && data.scrobbles['@attr'].ignored) !== 0
			const ignored = Number((data.scrobbles && data.scrobbles.scrobble && data.scrobbles.scrobble.ignoredMessage && data.scrobbles.scrobble.ignoredMessage.code))
			throw new DeliveryError(Number.isInteger(ignored) ? 'lastfm_ignored_' + ignored : 'lastfm_not_accepted', [4, 5].includes(ignored))
		result = Array.isArray(data.scrobbles.scrobble) ? data.scrobbles.scrobble[0] : data.scrobbles.scrobble
	const code = Number((result && result.ignoredMessage && result.ignoredMessage.code))
	if code !== 0
		throw new DeliveryError(Number.isInteger(code) ? 'lastfm_ignored_' + code : 'lastfm_not_accepted', [4, 5].includes(code))
