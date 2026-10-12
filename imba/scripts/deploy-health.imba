# Check the public build and installer without credentials or database writes.
import { execFileSync } from 'node:child_process'

import { mkdtempSync, readFileSync, rmSync } from 'node:fs'

import { tmpdir } from 'node:os'

import { join } from 'node:path'

import { verifyProjects, verifyPlugins, verifyPage } from './deploy-health-lib.js'

const root = new URL('../', import.meta.url)

const registry = JSON.parse(readFileSync(new URL('data/mods.json', root), 'utf8'))

const expected = JSON.parse(readFileSync(new URL('public/mods/ffxiv/projects.json', root), 'utf8'))

const base = (process.argv[2] || 'https://spacegho.st')

const temp = mkdtempSync(join(tmpdir(), 'ffxiv-deploy-health-'))

let sequence = 0

def get(path)
	const output = join(temp, String((++sequence)))
	execFileSync('curl', ['--silent', '--show-error', '--fail-with-body', '--retry', '3', '--user-agent', 'spacegho.st-FFXIV-deploy-check/1.0 (+https://github.com/Spaceghost/ghostty-vote)', '--retry-all-errors', '--retry-delay', '2', '--connect-timeout', '10', '--max-time', '30', '--output', output, new URL(path, base).href], {stdio: ['ignore', 'ignore', 'inherit']})
	console.log((('GET ' + path) + ' -> 200'))
	return readFileSync(output, 'utf8')
	return

try
	verifyProjects(JSON.parse(get('/mods/ffxiv/projects.json')), expected)
	verifyPlugins(JSON.parse(get('/mods/ffxiv/plugins.json')), registry)
	verifyPage(get('/mods/ffxiv/term/vote/'), '/mods/ffxiv/term/vote/')
	for mod of registry.mods.filter(
		(do(m)
			return m.sections
		)
	)
		verifyPage(get(mod.page), mod.page)
	console.log('Deployed project registry, published installer entries and project pages verified.')
finally
	rmSync(temp, {recursive: true, force: true})
