# Optional real-browser regression gate. All content is served from this checkout.
import {chromium} from 'playwright'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {readFile} from 'node:fs/promises'
import {resolve, extname, sep} from 'node:path'

const root = resolve('public')
const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp'}
const server = createServer(do(req,res)
	try
		let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
		if path.endsWith('/')
			path += 'index.html'
		const file = resolve(root, '.' + path)
		if !file.startsWith(root + sep)
			res.writeHead(403).end()
			return
		const body = await readFile(file)
		res.writeHead(200, {'content-type':types[extname(file)] || 'application/octet-stream'}).end(body)
	catch
		res.writeHead(404).end()
)
await new Promise(do(done) server.listen(0,'127.0.0.1',done))
let browser = null
try
	browser = await chromium.launch({headless:true, executablePath:process.env.BROWSER_EXECUTABLE || undefined})
	const page = await browser.newPage()
	const errors = []
	page.on('pageerror', do(error) errors.push(error.message))
	const base = 'http://127.0.0.1:' + server.address().port
	const registry = JSON.parse(await readFile('data/mods.json','utf8'))
	const queue = JSON.parse(await readFile('public/mods/ffxiv/roadmap/queue.json','utf8'))
	const fullCount = queue.total + ' of ' + queue.total + ' features'
	for width of [1440,390]
		await page.setViewportSize({width,height:900})
		for mod of registry.mods
			await page.goto(base + mod.page)
			assert.equal(await page.locator('main').count(),1,mod.id)
			assert.equal(await page.evaluate(do globalThis.document.documentElement.scrollWidth > globalThis.innerWidth + 1),false,mod.id + ' overflows at ' + width)
		for [path,title] of [['/os/ackerman-os/vote/','One reply, one voice, three screens'],['/os/ackerman-os/vote/android/','A readable Levi reply card'],['/os/ackerman-os/vote/tdeck/','Reply ledger for weak links'],['/os/ackerman-os/vote/twatch/','A wrist-sized turn receipt']]
			await page.goto(base + path)
			await page.getByRole('heading',{name:title}).waitFor()
			assert.equal(await page.locator('article.idea').count(),9,path + ' idea count')
			assert.equal(await page.evaluate(do globalThis.document.documentElement.scrollWidth > globalThis.innerWidth + 1),false,path + ' overflows at ' + width)
	await page.goto(base + '/mods/ffxiv/roadmap/?project=typo&status=typo')
	await page.waitForFunction((do(expected) globalThis.document.querySelector('.queue-result')?.textContent == expected),fullCount)
	assert.equal(new URL(page.url()).search,'')
	await page.locator('select').first().selectOption('xivprism')
	await page.waitForFunction(do globalThis.document.querySelector('queue-controls').project == 'xivprism')
	assert.ok((await page.locator('tbody tr:visible').count()) > 0)
	await page.goto(base + '/mods/ffxiv/roadmap/?project=xivprism')
	await page.waitForFunction(do globalThis.document.querySelector('queue-controls')?.visible > 0)
	assert.equal(await page.locator('select').first().inputValue(),'xivprism')
	assert.equal(await page.locator('.queue-result').innerText(),(await page.locator('tbody tr:visible').count()) + ' of ' + queue.total + ' features')
	await page.goto(base + '/mods/ffxiv/')
	await page.getByRole('button',{name:'Find a project'}).waitFor()
	await page.keyboard.press('/')
	await page.getByRole('searchbox').fill('prism')
	await page.getByRole('dialog').getByRole('link',{name:new RegExp('XivPrism')}).waitFor()
	await page.getByRole('button',{name:'Close project search'}).click()
	await page.keyboard.press('/')
	assert.equal(await page.getByRole('searchbox').inputValue(),'')
	assert.equal(await page.getByRole('dialog').getByRole('link').count(),registry.mods.length)
	await page.keyboard.press('Escape')
	await page.locator('dialog').waitFor({state:'hidden'})
	for [project,control,next] of [['xivprism','Simulate unplug','Simulate reconnect'],['xivcamp','Work corner','Work corner']]
		await page.goto(base + '/mods/ffxiv/' + project + '/preview/')
		await page.getByRole('button',{name:control,exact:true}).focus()
		await page.keyboard.press('Enter')
		assert.equal(await page.evaluate(do globalThis.document.activeElement.textContent),next)
	await page.addInitScript(do
		Storage.prototype.setItem = do
			throw new Error('Storage blocked for regression check')
	)
	await page.goto(base + '/mods/ffxiv/xivdispatch/preview/')
	await page.locator('textarea').fill('Keep this idea')
	await page.getByRole('button',{name:'Quiet session',exact:true}).click()
	assert.equal(await page.locator('textarea').inputValue(),'Keep this idea')
	await page.getByRole('button',{name:'Thread',exact:true}).click()
	assert.equal(await page.locator('textarea').inputValue(),'Keep this idea')
	assert.deepEqual(errors,[])
	console.log('Browser checks passed: ' + registry.mods.length + ' project pages at desktop/mobile widths, queue links, project finder and preview continuity.')
finally
	if browser
		await browser.close()
	await new Promise(do(done) server.close(done))
