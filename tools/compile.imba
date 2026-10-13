# Precompile authored Imba to the existing runtime paths. Browser scripts remain
# self-contained classic scripts; the Worker and Node tools retain ESM imports.
import * as compiler from 'imba/compiler'
import {buildSync} from 'esbuild'
import {parse} from 'acorn'
import {readFileSync, readdirSync, mkdirSync, writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {execFileSync} from 'node:child_process'

const root = process.cwd()
const check = process.argv.includes('--check')
const browserOnly = process.argv.includes('--browser-only')
const nodeOnly = process.argv.includes('--node-only')
let changed = 0
let count = 0

def sources(dir)
	let result = []
	for entry of readdirSync(join(root, dir), {withFileTypes: true})
		const path = dir + '/' + entry.name
		if entry.isDirectory()
			result.push(...sources(path))
		else
			if entry.name.endsWith('.imba')
				result.push(path)
	return result.sort()

const authored = sources('imba')
const outputs = new Set(authored.map(do(source) source.slice(5).replace(new RegExp('\\.imba$'), '.js')))
const dataModules = new Set(['src/mods-data.js', 'src/almanac-schema.js'])
for path of execFileSync('git', ['ls-files', '*.js', '*.mjs', '*.cjs'], {encoding: 'utf8'}).trim().split('\n')
	if path && !outputs.has(path) && !dataModules.has(path)
		throw new Error('Authored JavaScript has no Imba source: ' + path)

for source of authored
	const output = source.slice(5).replace(new RegExp('\\.imba$'), '.js')
	const browser = output.startsWith('public/')
	if (nodeOnly && browser) || (browserOnly && !browser)
		continue
	const input = readFileSync(join(root, source), 'utf8')
	const result = compiler.compile(input, {sourcePath: source, platform: browser ? 'browser' : 'node', format: 'esm'})
	const errors = result.diagnostics.filter(do(d) d.severity === 1)
	if errors.length
		throw new Error(source + ': ' + JSON.stringify(errors))
	let code = result.js
	# Imba tags generate CSS even without explicit styling. Publish it alongside
	# the browser bundle and remove only the compiler's matching registration;
	# the site's strict style-src policy can then stay unchanged.
	if browser && result.css
		const tree = parse(code, {ecmaVersion: 'latest', sourceType: 'module'})
		const registration = tree.body.find(do(node) node.type == 'ExpressionStatement' && node.expression.type == 'CallExpression' && node.expression.callee.type == 'MemberExpression' && node.expression.callee.object.name == 'imba_styles' && node.expression.callee.property.name == 'register' && node.expression.arguments[1] && node.expression.arguments[1].value == result.css)
		if !registration
			throw new Error(source + ': generated CSS registration was not found')
		code = code.slice(0, registration.start) + code.slice(registration.end)
		const cssPath = output.replace(new RegExp('\\.js$'), '.imba.css')
		const generatedCss = '/* Generated from ' + source + '; edit the Imba source. */\n' + result.css + '\n'
		let currentCss = null
		try
			currentCss = readFileSync(join(root, cssPath), 'utf8')
		catch
			currentCss = null
		if currentCss != generatedCss
			changed++
			if check
				console.error(cssPath + ' is stale; run npm run build')
			else
				mkdirSync(dirname(join(root, cssPath)), {recursive: true})
				writeFileSync(join(root, cssPath), generatedCss)
	parse(code, {ecmaVersion: 'latest', sourceType: 'module'})
	if browser
		code = buildSync({stdin: {contents: code, sourcefile: output, resolveDir: root}, bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022', charset: 'ascii', legalComments: 'none'}).outputFiles[0].text
	code = code.split('\n').map(do(line) line.trimEnd()).join('\n')
	const generated = '// Generated from ' + source + '; edit the Imba source.\n' + code
	let current = null
	try
		current = readFileSync(join(root, output), 'utf8')
	catch
		current = null
	if current !== generated
		changed++
		if check
			console.error(output + ' is stale; run npm run build')
		else
			mkdirSync(dirname(join(root, output)), {recursive: true})
			writeFileSync(join(root, output), generated)
	count++

if check && changed
	process.exit(1)
console.log(String(count) + ' authored Imba modules: ' + (check ? 'compiled output is current' : 'compiled'))
