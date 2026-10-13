import {buildAcceptedVotes} from './accepted-votes.js'
import {escape, projectNavigation} from './project-pages.js'

# The confirmed ballot stays authoritative. New projects need a positive live
# Want majority. Tally snapshots contain counts only, never voter identities.
export def buildFeatureQueue(catalogues, scope, snapshot)
	const committedCatalogues = Object.fromEntries(Object.keys(scope.catalogue_versions).map(do(mod) [mod, catalogues[mod]]))
	const committed = buildAcceptedVotes(committedCatalogues, scope).accepted
	const accepted = new Set(committed.map(do(idea) idea.mod + ':' + idea.id))
	const entries = []
	const review = []
	for [mod, catalogue] of Object.entries(catalogues)
		const tally = snapshot.tallies[mod]
		if !tally
			throw new Error('Missing vote snapshot for ' + mod)
		const ideas = catalogue.categories.flatMap(do(category) category.ideas)
		if Object.keys(tally).length != ideas.length
			throw new Error('Vote snapshot catalogue differs for ' + mod)
		for idea of ideas
			const votes = tally[idea.id]
			if !votes || !['want','maybe','skip'].every(do(key) Number.isSafeInteger(votes[key]) && votes[key] >= 0)
				throw new Error('Invalid vote counts for ' + idea.id)
			const key = mod + ':' + idea.id
			const confirmed = accepted.has(key)
			const newProject = !Object.hasOwn(scope.catalogue_versions, mod)
			if !confirmed && !(newProject && votes.want > votes.maybe + votes.skip)
				if votes.want > 0
					review.push({mod, id:idea.id, title:idea.title, votes, reason:'Outside the confirmed ballot; needs a new acceptance decision.'})
				continue
			entries.push({mod, id:idea.id, title:idea.title, pitch:idea.pitch, how:idea.how, risks:idea.risks, feasibility:idea.feasibility, effort:idea.effort, topPick:!!idea.top_pick, value:idea.wow || 0, votes, basis:confirmed ? 'confirmed ballot' : 'live Want majority', status:snapshot.implementation[idea.id] ? 'verification_pending' : 'queued', evidence:snapshot.implementation[idea.id] || null})
	const effort = {hours:0, days:1, weeks:2, months:3}
	const feasible = {ready:0, stretch:1, research:2}
	entries.sort(do(a,b) (feasible[a.feasibility] ?? 3) - (feasible[b.feasibility] ?? 3) || (effort[a.effort] ?? 4) - (effort[b.effort] ?? 4) || b.votes.want - a.votes.want || Number(b.topPick) - Number(a.topPick) || b.value - a.value || a.mod.localeCompare(b.mod) || a.id.localeCompare(b.id))
	entries.forEach(do(entry,index) entry.rank = index + 1)
	return {version:1, capturedAt:snapshot.capturedAt, rule:snapshot.rule, entries, review, tracking:snapshot.tracking, total:entries.length, counts:Object.fromEntries(Object.keys(catalogues).map(do(mod) [mod,entries.filter(do(entry) entry.mod == mod).length]))}

export def featureQueuePage(queue, registry)
	const rows = queue.entries.map(do(entry)
		const mod = registry.mods.find(do(m) m.id == entry.mod)
		const issue = queue.tracking[entry.mod]
		const status = entry.status == 'verification_pending' ? 'Implementation evidence; acceptance pending' : 'Queued for implementation review'
		return '<tr id="' + escape(entry.id) + '"><td>' + entry.rank + '</td><td><a href="' + escape(mod.page) + '">' + escape(mod.name) + '</a></td><td><a href="' + escape((issue && issue.url) || mod.votePage) + '">' + escape(entry.title) + '</a><br><small>' + escape(entry.pitch) + '</small></td><td>' + entry.votes.want + ' / ' + entry.votes.maybe + ' / ' + entry.votes.skip + '</td><td>' + escape(entry.feasibility) + ' · ' + escape(entry.effort) + '</td><td>' + escape(status) + '</td></tr>'
	).join('\n')
	const review = queue.review.map(do(entry) '<li>' + escape(entry.title) + ' (' + entry.votes.want + ' Want, ' + entry.votes.maybe + ' Maybe, ' + entry.votes.skip + ' Skip): ' + escape(entry.reason) + '</li>').join('')
	return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>FFXIV voted feature queue</title><meta name="description" content="The accepted feature queue, vote snapshot, implementation order and GitHub tracking for the FFXIV mod family."><link rel="canonical" href="https://spacegho.st/mods/ffxiv/roadmap/"><meta name="color-scheme" content="dark light"><link rel="stylesheet" href="/mods/ffxiv/site/site.css"><script src="/mods/ffxiv/site/site.js"></script></head><body><a class="skip" href="#main">Skip to content</a><div class="wrap"><header class="sitebar"><a class="brand" href="/mods/ffxiv/"><b>spacegho.st</b> / ffxiv mods</a><nav aria-label="Mods">' + projectNavigation(registry) + '</nav></header><main id="main"><section class="glass project-section"><h1>Voted feature queue</h1><p>' + queue.total + ' accepted features. Snapshot: <time>' + escape(queue.capturedAt) + '</time>.</p><p>' + escape(queue.rule) + '</p><p>Order: feasibility, estimated effort, Want votes, then the catalogue’s top-pick and value signals. Estimates describe the idea, not a delivery date. Shared dependencies and release checks can change which item starts next.</p><p>Each project has a GitHub tracking checklist. Check existing implementation before building; tests, release evidence and applicable live acceptance are required before marking an item delivered. Entries with implementation evidence remain awaiting acceptance.</p><p><a href="queue.json">Download the queue and vote snapshot as JSON</a> · <a href="https://github.com/Spaceghost/ghostty-vote/blob/master/docs/FEATURE_QUEUE.md">Queue policy and source</a></p></section><section class="glass project-section"><h2>Implementation and acceptance order</h2><div data-queue-controls></div><div class="queue-scroll"><table><thead><tr><th>Order</th><th>Project</th><th>Feature</th><th>Want / Maybe / Skip</th><th>Feasibility / effort</th><th>Delivery status</th></tr></thead><tbody>' + rows + '</tbody></table></div></section><section class="glass project-section"><h2>Needs a new acceptance decision</h2><ul>' + review + '</ul><p>Ideas with no Want votes stay on their voting pages. This queue does not replace the original Maybe and Skip choices or change anyone’s ballot.</p></section></main><footer class="foot">Made by Johnneylee Jack Rollins · <a href="/mods/ffxiv/">FFXIV mods</a></footer></div></body></html>\n'
