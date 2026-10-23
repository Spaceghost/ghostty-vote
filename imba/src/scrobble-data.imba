# Bounded public music metadata only. In particular no Pandora account fields,
# track/audio tokens, arbitrary additional_info, origin URLs, or stream URLs survive.
import {cleanText, utf8} from './lib.js'

export const SCROBBLE_BASE = '/mods/ffxiv/scrobble'
export const SCROBBLE_BROWSER = '/mods/ffxiv/term/vote/api/scrobble/'
export const SCROBBLE_BODY_BYTES = 131072
export const SCROBBLE_RETENTION_MS = (365 * 86400000)
export const SCROBBLE_MAX_ATTEMPTS = 8

export class ScrobbleError < Error
	def constructor(status, code, message)
		super(message)
		this.status = status
		this.code = code

export def problem(status, code, message)
	throw new ScrobbleError(status, code, message)

export def object(value)
	return value != null && typeof value === 'object' && !Array.isArray(value)

export def text(value, max = 512, required = false)
	if value === undefined && !required
		return undefined
	if typeof value !== 'string' || utf8(value).length > max * 4
		problem(400, 'invalid_metadata', 'Music metadata must contain bounded text fields.')
	const result = cleanText(value)
	if result.length > max || (required && !result)
		problem(400, 'invalid_metadata', 'Artist and track names are required and must be at most 512 characters.')
	# Metadata fields are names, never URLs or headers containing credentials.
	if new RegExp('https?://|(?:Bearer|Token)\\s+[A-Za-z0-9_-]{16,}', 'i').test(result)
		problem(400, 'invalid_metadata', 'Send music names without URLs or credentials.')
	return result || undefined

export def metadata(input)
	if !object(input)
		problem(400, 'invalid_metadata', 'track_metadata must be an object.')
	const result = {artist_name: text(input.artist_name, 512, true), track_name: text(input.track_name, 512, true)}
	const release = text(input.release_name)
	if release
		result.release_name = release
	const info = input.additional_info
	if info !== undefined && !object(info)
		problem(400, 'invalid_metadata', 'additional_info must be an object.')
	const extra = {}
	if info
		for key of ['submission_client', 'submission_client_version', 'media_player', 'media_player_version', 'music_service_name']
			const value = text(info[key], 128)
			if value
				extra[key] = value
		if info.music_service !== undefined
			const service = text(info.music_service, 128)
			if service && new RegExp('^[a-zA-Z0-9.-]+$').test(service)
				extra.music_service = service
		if info.duration_ms !== undefined
			if !Number.isSafeInteger(info.duration_ms) || info.duration_ms < 0 || info.duration_ms > 86400000
				problem(400, 'invalid_metadata', 'duration_ms must be an integer between zero and one day.')
			extra.duration_ms = info.duration_ms
		if info.tracknumber !== undefined
			const n = String(info.tracknumber)
			if !new RegExp('^[0-9]{1,5}$').test(n)
				problem(400, 'invalid_metadata', 'tracknumber must be a bounded positive integer.')
			extra.tracknumber = n
		const mbid = new RegExp('^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'i')
		for key of ['recording_mbid', 'release_mbid', 'release_group_mbid', 'track_mbid']
			if info[key] !== undefined
				if typeof info[key] !== 'string' || !mbid.test(info[key])
					problem(400, 'invalid_metadata', 'MusicBrainz identifiers must be UUIDs.')
				extra[key] = info[key].toLowerCase()
		for key of ['artist_mbids', 'release_artist_mbids', 'work_mbids']
			if info[key] !== undefined
				if !Array.isArray(info[key]) || info[key].length > 16 || info[key].some(do(value) typeof value !== 'string' || !mbid.test(value))
					problem(400, 'invalid_metadata', 'MusicBrainz identifier lists must contain at most sixteen UUIDs.')
				extra[key] = info[key].map(do(value) value.toLowerCase())
	if Object.keys(extra).length
		result.additional_info = extra
	return result

export def submission(body, now = Date.now())
	if !object(body) || !['single', 'import', 'playing_now'].includes(body.listen_type)
		problem(400, 'invalid_listen_type', 'listen_type must be single, import, or playing_now.')
	const kind = body.listen_type
	if !Array.isArray(body.payload) || !body.payload.length || body.payload.length > 100 || (kind !== 'import' && body.payload.length !== 1)
		problem(400, 'invalid_payload', 'Send one listen, or up to 100 listens in an import.')
	const payload = body.payload.map(do(entry)
		if !object(entry)
			problem(400, 'invalid_payload', 'Every listen must be an object.')
		const row = {track_metadata: metadata(entry.track_metadata)}
		if kind !== 'playing_now'
			if !Number.isSafeInteger(entry.listened_at) || entry.listened_at < 1033430400 || entry.listened_at > Math.floor(now / 1000) + 300
				problem(400, 'invalid_timestamp', 'listened_at must be Unix seconds from October 2002 through five minutes in the future.')
			row.listened_at = entry.listened_at
		else
			if entry.listened_at !== undefined
				problem(400, 'invalid_timestamp', 'playing_now must omit listened_at.')
		return row
	)
	return {listen_type: kind, payload: payload}

export def cursor(url)
	const before = url.searchParams.get('before')
	const id = url.searchParams.get('cursor')
	if before === null && id === null
		return {before: 9007199254740991, id: 'z'}
	if !new RegExp('^[0-9]{1,16}$').test(before || '') || !new RegExp('^[0-9a-f]{64}$').test(id || '') || !Number.isSafeInteger(Number(before))
		problem(400, 'invalid_cursor', 'Use the next_cursor returned by this endpoint.')
	return {before: Number(before), id: id}
