import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,readdirSync} from 'node:fs'
import {familyPage} from '../scripts/project-pages.js'

const root = new URL('../',import.meta.url)
const registry = JSON.parse(readFileSync(new URL('data/mods.json',root),'utf8'))

def pages(dir)
	return readdirSync(new URL(dir,root),{withFileTypes:true}).flatMap(do(entry) entry.isDirectory() ? pages(dir + '/' + entry.name) : entry.name.endsWith('.html') ? [dir + '/' + entry.name] : [])

test('every FFXIV page has one shared accessible shell and a common final stylesheet', do
	const files = pages('public/mods/ffxiv')
	assert.ok(files.length >= 38)
	for path of files
		const html = readFileSync(new URL(path,root),'utf8')
		assert.equal((html.match(new RegExp('data-family-shell','g')) || []).length,1,path)
		assert.equal((html.match(new RegExp('<footer\\b','g')) || []).length,1,path)
		assert.equal((html.match(new RegExp('<main\\b','g')) || []).length,1,path)
		assert.equal((html.match(new RegExp('id="theme"','g')) || []).length,1,path)
		assert.ok(html.includes('href="#main"'),path)
		const sheets = [...html.matchAll(new RegExp('<link rel="stylesheet" href="([^"]+)"','g'))].map(do(match) match[1])
		assert.equal(sheets.at(-1),'/mods/ffxiv/site/site.css',path)
		assert.equal(sheets.filter(do(url) url == '/mods/ffxiv/site/site.css').length,1,path)
		assert.doesNotMatch(html,new RegExp('fonts\\.googleapis|fonts\\.gstatic|<style|\\son\\w+=','i'),path)
		assert.equal(familyPage(html,registry,path),html,'Shell generation must be idempotent: ' + path)
)

test('ballot, gallery and admin containers keep their identities inside the common main', do
	for [path,id] of [['term/vote','cats'],['term/gallery','shots'],['term/vote/admin','voters']]
		const html = readFileSync(new URL('public/mods/ffxiv/' + path + '/index.html',root),'utf8')
		assert.equal((html.match(new RegExp('id="' + id + '"','g')) || []).length,1)
		assert.ok(html.includes('<main id="main">'))
		if path.includes('admin')
			assert.ok(html.includes('noindex, nofollow'))
)

test('project subpages have active contextual tabs and previews join the family navigation', do
	for [path,label] of [['xivprism/vote','Vote'],['xivprism/preview','Preview']]
		const html = readFileSync(new URL('public/mods/ffxiv/' + path + '/index.html',root),'utf8')
		assert.ok(html.includes('aria-label="Project"'))
		assert.ok(html.includes('aria-current="page">' + label + '</a>'))
		assert.ok(html.includes('FFXIV mods home'))
)
