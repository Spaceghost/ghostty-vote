
import test from 'node:test'

import assert from 'node:assert/strict'

import { verifyProjects, verifyPlugins, verifyPage } from '../scripts/deploy-health-lib.js'

const registry = {mods: [{internalName: 'Stable', listed: true, released: true}, {internalName: 'Testing', listed: true, testingVersion: '0.1.0.1'}, {internalName: 'Character', listed: false}, {internalName: 'Library', kind: 'library', listed: false}]}

const entry = (do(name)
	return {InternalName: name, AssemblyVersion: '0.1.0.1', DownloadLinkInstall: (('https://example.com/' + name) + '.zip')}
)

test(
	'deploy verification rejects stale public project metadata',
	(do()
		verifyProjects({version: 1, projects: ['HUD']}, {version: 1, projects: ['HUD']})
		assert.throws(
			(do()
				return verifyProjects({version: 1, projects: []}, {version: 1, projects: ['HUD']})
			)
		)
		return
	)
)

test(
	'deploy verification requires published plugins and keeps development modules out of the installer',
	(do()
		verifyPlugins([entry('Stable'), entry('Testing')], registry)
		assert.throws(
			(do()
				return verifyPlugins([entry('Stable')], registry)
			)
		)
		assert.throws(
			(do()
				return verifyPlugins([entry('Stable'), entry('Testing'), entry('Character')], registry)
			)
		)
		assert.throws(
			(do()
				return verifyPlugins([entry('Stable'), entry('Testing'), entry('Library')], registry)
			)
		)
		assert.throws(
			(do()
				return verifyPlugins([entry('Stable'), entry('Testing'), entry('Testing')], registry)
			)
		)
		assert.throws(
			(do()
				return verifyPlugins([{...entry('Stable'), DownloadLinkInstall: 'http://example.com/a.zip'}, entry('Testing')], registry)
			)
		)
		return
	)
)

test(
	'deploy verification rejects error documents and pages served under the wrong route',
	(do()
		verifyPage('<!doctype html><link rel="canonical" href="https://spacegho.st/mods/ffxiv/xivhud/">', '/mods/ffxiv/xivhud/')
		assert.throws(
			(do()
				return verifyPage('Forbidden', '/mods/ffxiv/xivhud/')
			)
		)
		assert.throws(
			(do()
				return verifyPage('<!doctype html><title>Fallback</title>', '/mods/ffxiv/xivhud/')
			)
		)
		return
	)
)
