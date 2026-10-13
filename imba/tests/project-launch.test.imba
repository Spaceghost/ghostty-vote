import {test} from 'node:test'
import assert from 'node:assert/strict'
import {setup,API,read,allTallies} from './harness.js'

test('new project ballots accept ideas and keep each project ballot separate', do
	const t = setup()
	const cookie = await t.signedIn()
	for mod of ['xivprism', 'xivdispatch', 'xivcamp']
		const catalogue = JSON.parse(read('data/catalogues/' + mod + '.json'))
		const idea = catalogue.categories[0].ideas[0].id
		const response = await t.vote({mod,idea_id:idea,vote:'want',note:'A useful first release'}, {cookie})
		assert.equal(response.status,200)
		const mine = await (await t.call(API + 'mine?mod=' + mod, {cookie})).json()
		assert.equal(mine.votes[idea].vote,'want')
		const original = await (await t.call(API + 'mine?mod=ghostty', {cookie})).json()
		assert.equal(original.votes[idea],undefined)
		const count = t.env.DB.raw.prepare('SELECT COUNT(*) AS n FROM ideas WHERE mod = ? AND retired = 0').get(mod).n
		assert.equal(count,12)
)

test('the scoped launch seed is idempotent and preserves existing votes and tallies', do
	const t = setup()
	const cookie = await t.signedIn()
	const old = JSON.parse(read('data/catalogue.json')).categories[0].ideas[0].id
	assert.equal((await t.vote({idea_id:old,vote:'want',note:'Keep my vote'}, {cookie})).status,200)
	assert.equal((await t.vote({mod:'xivprism',idea_id:'xivprism-standalone',vote:'maybe'}, {cookie})).status,200)
	const before = allTallies(t.env.DB.raw)
	const votes = t.env.DB.raw.prepare('SELECT * FROM votes ORDER BY voter,idea_id').all()
	const seed = read('seed/project-launch.sql')
	assert.doesNotMatch(seed,new RegExp('^\\s*(DELETE\\b|UPDATE ideas SET retired|INSERT INTO catalogue)', 'im'))
	t.env.DB.raw.exec(seed)
	t.env.DB.raw.exec(seed)
	assert.deepEqual(allTallies(t.env.DB.raw),before)
	assert.deepEqual(t.env.DB.raw.prepare('SELECT * FROM votes ORDER BY voter,idea_id').all(),votes)
)
