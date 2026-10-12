
import { test } from 'node:test'

import assert from 'node:assert/strict'

import { readFileSync } from 'node:fs'

import { galleryProjects, projectNavigation, projectOutputs, projectRoutes } from '../scripts/project-pages.js'

import { firstEntry, listedMods, validateMods } from '../scripts/plugins-lib.js'

import { handle } from '../src/app.js'

import { MOD_IDS } from '../src/clients.js'

import { memoryCache } from './harness.js'

const registry = JSON.parse(readFileSync(new URL('../data/mods.json', import.meta.url), 'utf8'))

test(
	'host tools and bundled libraries never enter the Dalamud installer',
	(do()
		assert.deepEqual(validateMods(registry), [])
		assert.ok(
			(! listedMods(registry).some(
				(do(m)
					return ['XivStream', 'XivHud.Windowing'].includes(m.internalName)
				)
			))
		)
		const invalid = structuredClone(registry)
		(invalid.mods.find(
			(do(m)
				return (m.internalName === 'XivStream')
			)
		).listed = true)
		assert.ok(
			validateMods(invalid).some(
				(do(e)
					return e.includes('only plugins')
				)
			)
		)
		return
	)
)

test(
	'HUD family navigation and gallery identifiers agree while the library stays out of the gallery',
	(do()
		const nav = projectNavigation(registry)
		assert.ok(nav.includes('/mods/ffxiv/xivhud/'))
		assert.ok(nav.includes('/mods/ffxiv/xivrug/'))
		assert.ok(nav.includes('/mods/ffxiv/xivstream/'))
		assert.deepEqual(
			MOD_IDS,
			galleryProjects(registry).map(
				(do(m)
					return m.id
				)
			)
		)
		assert.ok((MOD_IDS.includes('xivhud-journal') && MOD_IDS.includes('xivhud-character')))
		assert.ok((! MOD_IDS.includes('xivhud-windowing')))
		const out = projectOutputs(registry, {})
		assert.ok(out['public/mods/ffxiv/xivhud/character/index.html'].includes('held out of the automatic installer'))
		assert.ok(out['public/mods/ffxiv/xivstream/index.html'].includes('not installed through Dalamud'))
		return
	)
)

test(
	'a shared repository release selects the matching module instead of its first entry',
	(do()
		const entries = [{InternalName: 'XivHud'}, {InternalName: 'XivHud.Journal'}]
		assert.equal(firstEntry(entries, 'XivHud.Journal'), entries[1])
		assert.equal(firstEntry(entries, 'XivHud.Character'), null)
		return
	)
)

test(
	'the live listing assembles multiple HUD modules from one release and excludes an unpublished Character package',
	(do()
		const entries = ['XivHud', 'XivHud.Journal'].map(
			(do(name)
				return {InternalName: name, AssemblyVersion: '0.1.0.1', DalamudApiLevel: 15, DownloadLinkInstall: ('https://github.com/Spaceghost/xivhud-dalamud/releases/download/testing/' + String(name) + '-latest.zip')}
			)
		)
		const fetcher = (do(url)
			return await ((String(url) === 'https://github.com/Spaceghost/xivhud-dalamud/releases/download/testing/pluginmaster-testing.json') ? new Response(JSON.stringify(entries), {headers: {'content-type': 'application/json'}}) : new Response('missing', {status: 404}))
		)
		const res = (await handle(new Request('https://spacegho.st/mods/ffxiv/plugins.json'), {}, null, memoryCache(), fetcher))
		const body = (await res.json())
		assert.deepEqual(
			body.map(
				(do(m)
					return m.InternalName
				)
			),
			['XivHud', 'XivHud.Journal']
		)
		assert.ok(
			body.every(
				(do(m)
					return m.IsTestingExclusive
				)
			)
		)
		return
	)
)

test(
	'all generated project pages and the public registry have deployed Cloudflare routes',
	(do()
		const routes = projectRoutes(registry)
		const config = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8')
		assert.ok(config.includes(routes))
		for m of registry.mods.filter(
			(do(m)
				return m.sections
			)
		)
			assert.ok(routes.includes((('spacegho.st' + m.page.split('/').slice(0, 4).join('/')) + '*')))
		assert.ok(routes.includes('spacegho.st/mods/ffxiv/projects.json'))
		return
	)
)
