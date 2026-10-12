
import { readFileSync } from 'node:fs'

import { fileURLToPath } from 'node:url'

const ROOT = new URL('../', import.meta.url)

export const CATALOGUES = Object.freeze({ghostty: 'data/catalogue.json', xivmcp: 'data/catalogues/xivmcp.json', xivdesktop: 'data/catalogues/xivdesktop.json', xivarcade: 'data/catalogues/xivarcade.json', xivwayfinder: 'data/catalogues/xivwayfinder.json', xivlantern: 'data/catalogues/xivlantern.json', xivpiano: 'data/catalogues/xivpiano.json', almanac: 'data/catalogues/almanac.json'})

const load = (do(path)
	return JSON.parse(readFileSync(new URL(path, ROOT), 'utf8'))
)

const key = (do(mod, id)
	return ('' + String(mod) + ':' + String(id) + '')
)

export def buildAcceptedVotes(catalogues, scope)
	const errors = []
	const excluded = new Map()
	for item of (scope.excluded || [])
		const k = key(item.mod, item.id)
		if excluded.has(k)
			errors.push(('duplicate exclusion ' + String(k) + ''))
		if (! ['maybe', 'skip'].includes(item.vote))
			errors.push(('' + String(k) + ' has invalid vote ' + String(item.vote) + ''))
		excluded.set(k, item.vote)
	const accepted = []
	const seen = new Set()
	for [mod, catalogue] of Object.entries(catalogues)
		if (catalogue.version !== (do()
			let cursor$1 = scope
			let cursor$2 = undefined
			cursor$2 = cursor$1
			cursor$1 = cursor$1.catalogue_versions
			if cursor$1 == null
				return undefined
			cursor$2 = cursor$1
			cursor$1 = cursor$1[mod]
			return cursor$1
		)())
			errors.push(
				('' + String(mod) + ' catalogue is version ' + String(catalogue.version) + '; scope records ' + String((do()
					let cursor$3 = scope
					let cursor$4 = undefined
					cursor$4 = cursor$3
					cursor$3 = cursor$3.catalogue_versions
					if cursor$3 == null
						return undefined
					cursor$4 = cursor$3
					cursor$3 = cursor$3[mod]
					return cursor$3
				)()) + '')
			)
		for category of (catalogue.categories || [])
			for idea of (category.ideas || [])
				const k = key(mod, idea.id)
				if seen.has(k)
					errors.push(('duplicate catalogue idea ' + String(k) + ''))
				seen.add(k)
				if (! excluded.has(k))
					accepted.push({mod: mod, id: idea.id, category: category.name, title: idea.title, feasibility: idea.feasibility, effort: idea.effort, status: 'queued'})
	for k of excluded.keys()
		if (! seen.has(k))
			errors.push(('excluded idea is not in the catalogues: ' + String(k) + ''))
	const counts = Object.fromEntries(
		Object.keys(catalogues).map(
			(do(mod)
				return [mod, accepted.filter(
					(do(x)
						return (x.mod === mod)
					)
				).length]
			)
		)
	)
	for [mod, expected] of Object.entries((scope.expected_by_mod || {}))
		if (counts[mod] !== expected)
			errors.push(('' + String(mod) + ' accepts ' + String(counts[mod]) + ', expected ' + String(expected) + ''))
	if (accepted.length !== scope.expected_total)
		errors.push(('accepted total is ' + String(accepted.length) + ', expected ' + String(scope.expected_total) + ''))
	if errors.length
		throw new Error(('invalid accepted vote scope:\n  ' + String(errors.join('\n  ')) + ''))
	return {accepted: accepted, counts: counts}
	return

export def loadAcceptedVotes()
	const catalogues = Object.fromEntries(
		Object.entries(CATALOGUES).map(
			(do([mod, path])
				return [mod, load(path)]
			)
		)
	)
	return buildAcceptedVotes(catalogues, load('data/accepted-votes.json'))
	return

def markdown(plan)
	const lines = ['# Accepted vote implementation ledger', '', ('Total: ' + String(plan.accepted.length) + ''), '']
	for mod of Object.keys(CATALOGUES)
		lines.push(('## ' + String(mod) + ' (' + String(plan.counts[mod]) + ')'), '', '| ID | Idea | Feasibility | Effort | Status |', '|---|---|---|---|---|')
		for idea of plan.accepted.filter(
			(do(x)
				return (x.mod === mod)
			)
		)
			lines.push(('| `' + String(idea.id) + '` | ' + String(idea.title.replaceAll('|', '\\|')) + ' | ' + String(idea.feasibility) + ' | ' + String(idea.effort) + ' | ' + String(idea.status) + ' |'))
		lines.push('')
	return lines.join('\n')
	return

if (process.argv[1] === fileURLToPath(import.meta.url))
	const plan = loadAcceptedVotes()
	if process.argv.includes('--json')
		process.stdout.write(('' + String(JSON.stringify(plan, null, 2)) + '\n'))
	else
		process.stdout.write(('' + String(markdown(plan)) + '\n'))
