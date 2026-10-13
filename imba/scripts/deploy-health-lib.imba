
import assert from 'node:assert/strict'

import { usableEntry } from './plugins-lib.js'

export def verifyBallot(ideas, expected, tallies)
	assert.deepEqual(ideas, expected, 'Deployed feature catalogue differs from this build')
	assert.deepEqual(Object.keys(tallies).sort(), expected.ideas.map(do(idea) idea.id).sort(), 'Live vote database does not contain every published idea')

export def verifyProjects(actual, expected)
	assert.deepEqual(actual, expected, 'Deployed project registry differs from this build')
	return

export def verifyPlugins(actual, registry)
	assert.ok(Array.isArray(actual), 'Plugin repository must be an array')
	const expected = registry.mods.filter(
		(do(m)
			return (m.listed && ((m.kind || 'plugin') === 'plugin'))
		)
	)
	const names = new Set()
	for entry of actual
		assert.ok(usableEntry(entry), 'Installer entry must contain a version and HTTPS download')
		assert.ok((! names.has(entry.InternalName)), ('Duplicate installer entry: ' + entry.InternalName))
		names.add(entry.InternalName)
		assert.ok(
			expected.some(
				(do(m)
					return (m.internalName === entry.InternalName)
				)
			),
			('Unlisted project in installer: ' + entry.InternalName)
		)
	for mod of expected.filter(
		(do(m)
			return (m.released || m.testingVersion)
		)
	)
		assert.ok(names.has(mod.internalName), ('Published plugin missing from installer: ' + mod.internalName))
	return

export def verifyPage(html, path)
	assert.match(html, new RegExp('<!doctype html>', 'i'), ('Expected a complete HTML page at ' + path))
	assert.ok(html.includes(('https://spacegho.st' + path)), ('Expected canonical route at ' + path))
	return
