// Generated from imba/src/entry.imba; edit the Imba source.
import {register$} from 'imba/runtime';

/*body*/
// Deployed Worker entry (wrangler.toml `main`): the HTTP/cron Worker from worker.js plus
// ScrobbleAccounts, the service-binding entrypoint other spacegho.st Workers use to
// provision Scrobbles accounts (scrobble-external.js). It has no public route. Kept
// apart from worker.js so node --test can import the rest without cloudflare:workers.
import {WorkerEntrypoint} from 'cloudflare:workers';
import worker from './worker.js';
import {ScrobbleError} from './scrobble-data.js';
import {issueTicket,provisionToken,renameExternal,revokeExternal} from './scrobble-external.js';

export default worker;

// Errors cross the binding as {error, message}; nothing else about them does.
async function guarded(work){
	try {
		return await work();
	} catch (error) {
		if (error instanceof ScrobbleError) {
			return {error: error.code,message: error.message};
		};
		console.error('scrobble_external: internal_error');
		return {error: 'server_error',message: 'Scrobbles are temporarily unavailable.'};
	};
};

let c$0 = Symbol();
export class ScrobbleAccounts extends WorkerEntrypoint {
	// {provider, subject, display_name?, label?, revoke?: [token ids]} -> {token, token_id, user_name}
	async provision(input){
		var self = this;
		return await guarded(function() { return provisionToken(self.env,input); });
	}

	// {provider, subject, token_ids?} -> {revoked}; every active token without token_ids
	async revoke(input){
		var self = this;
		return await guarded(function() { return revokeExternal(self.env,input); });
	}

	// {provider, subject, display_name} -> {user_name}
	async rename(input){
		var self = this;
		return await guarded(function() { return renameExternal(self.env,input); });
	}

	// {provider, subject, display_name?} -> {url, expires_at}: one-time dashboard sign-in link
	async ticket(input){
		var self = this;
		return await guarded(function() { return issueTicket(self.env,input); });
	}
	static { register$(this,c$0,'ScrobbleAccounts',0) }
};
