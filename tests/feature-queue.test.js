// Generated from imba/tests/feature-queue.test.imba; edit the Imba source.

/*body*/
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CATALOGUES} from '../scripts/accepted-votes.js';
import {buildFeatureQueue,featureQueuePage} from '../scripts/feature-queue.js';

const read = function(path) { return JSON.parse(readFileSync(new URL('../' + path,import.meta.url),'utf8')); };
const paths = {...CATALOGUES,xivprism: 'data/catalogues/xivprism.json',xivdispatch: 'data/catalogues/xivdispatch.json',xivcamp: 'data/catalogues/xivcamp.json'};
const catalogues = Object.fromEntries(Object.entries(paths).map(function([mod,path]) { return [mod,read(path)]; }));
const scope = read('data/accepted-votes.json');
const snapshot = read('data/feature-queue.json');

test('the live queue preserves all 201 commitments and admits 34 new Want-majority ideas',function() {
	const queue = buildFeatureQueue(catalogues,scope,snapshot);
	assert.equal(queue.total,235);
	assert.equal(new Set(queue.entries.map(function(entry) { return entry.id; })).size,235);
	assert.equal(queue.entries.filter(function(entry) { return entry.basis == 'confirmed ballot'; }).length,201);
	assert.equal(queue.entries.filter(function(entry) { return entry.status == 'verification_pending'; }).length,7);
	assert.ok(!(queue.entries.some(function(entry) { return entry.id == 'xivprism-native-moonlight'; })));
	return assert.ok(queue.review.some(function(entry) { return entry.id == 'way-nearest-fate'; }));
});

test('a new public Want vote cannot silently override the confirmed Maybe and Skip decisions',function() {
	const updated = structuredClone(snapshot);
	updated.tallies.xivmcp['mcp-session-receipt'].want = 100;
	const queue = buildFeatureQueue(catalogues,scope,updated);
	assert.ok(!(queue.entries.some(function(entry) { return entry.id == 'mcp-session-receipt'; })));
	return assert.ok(queue.review.some(function(entry) { return entry.id == 'mcp-session-receipt'; }));
});

test('new projects need a Want majority and zero votes never become a commitment',function() {
	const updated = structuredClone(snapshot);
	updated.tallies.xivprism['xivprism-native-moonlight'] = {want: 1,maybe: 1,skip: 0};
	assert.equal(buildFeatureQueue(catalogues,scope,updated).total,235);
	updated.tallies.xivprism['xivprism-native-moonlight'] = {want: 2,maybe: 1,skip: 0};
	return assert.equal(buildFeatureQueue(catalogues,scope,updated).total,236);
});

test('missing, stale or invalid tally snapshots fail instead of manufacturing a feature queue',function() {
	var $1;
	const missing = structuredClone(snapshot);
	((($1 = missing.tallies.xivprism['xivprism-standalone']),delete missing.tallies.xivprism['xivprism-standalone'], $1));
	assert.throws(function() { return buildFeatureQueue(catalogues,scope,missing); });
	const invalid = structuredClone(snapshot);
	invalid.tallies.xivprism['xivprism-standalone'].want = -1;
	return assert.throws(function() { return buildFeatureQueue(catalogues,scope,invalid); });
});

test('the queue is complete accessible HTML before any Imba island mounts',function() {
	const queue = buildFeatureQueue(catalogues,scope,snapshot);
	const html = featureQueuePage(queue,read('data/mods.json'));
	assert.equal((html.match(new RegExp('<tr id=','g')) || []).length,235);
	assert.ok(html.includes('<thead>'));
	assert.ok(html.includes('data-queue-controls'));
	assert.ok(html.includes('queue.json'));
	return assert.doesNotMatch(html,new RegExp('<script(?![^>]*src=)|\\son\\w+=|\\sstyle=','i'));
});
