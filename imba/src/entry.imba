# Deployed Worker entry (wrangler.toml `main`): the HTTP/cron Worker from worker.js plus
# ScrobbleAccounts, the service-binding entrypoint other spacegho.st Workers use to
# provision Scrobbles accounts (scrobble-external.js). It has no public route. Kept
# apart from worker.js so node --test can import the rest without cloudflare:workers.
import {WorkerEntrypoint} from 'cloudflare:workers'
import worker from './worker.js'
import {ScrobbleError} from './scrobble-data.js'
import {eraseExternal, issueTicket, provisionToken, renameExternal, revokeExternal} from './scrobble-external.js'

export default worker

# Errors cross the binding as {error, message}; nothing else about them does.
def guarded(work)
	try
		return await work()
	catch error
		if error instanceof ScrobbleError
			return {error: error.code, message: error.message}
		console.error('scrobble_external: internal_error')
		return {error: 'server_error', message: 'Scrobbles are temporarily unavailable.'}

export class ScrobbleAccounts < WorkerEntrypoint
	# {provider, subject, display_name?, label?, revoke?: [token ids]} -> {token, token_id, user_name}
	def provision(input)
		return await guarded(do() provisionToken(self.env, input))

	# {provider, subject, token_ids?} -> {revoked}; every active token without token_ids
	def revoke(input)
		return await guarded(do() revokeExternal(self.env, input))

	# {provider, subject, display_name} -> {user_name}
	def rename(input)
		return await guarded(do() renameExternal(self.env, input))

	# {provider, subject, display_name?} -> {url, expires_at}: one-time dashboard sign-in link
	def ticket(input)
		return await guarded(do() issueTicket(self.env, input))

	# {subjects?: [spacegho.st subjects], github?: [GitHub ids]} -> {accounts, counts}: erase everything
	def erase(input)
		return await guarded(do() eraseExternal(self.env, input))
