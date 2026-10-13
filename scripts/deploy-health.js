// Generated from imba/scripts/deploy-health.imba; edit the Imba source.
import {iterable$} from 'imba/runtime';

/*body*/
// Check the public build and installer without credentials or database writes.
import {execFileSync} from 'node:child_process';

import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';

import {tmpdir} from 'node:os';

import {join} from 'node:path';

import {verifyProjects,verifyPlugins,verifyPage,verifyBallot} from './deploy-health-lib.js';

import assert from 'node:assert/strict';

const root = new URL('../',import.meta.url);

const registry = JSON.parse(readFileSync(new URL('data/mods.json',root),'utf8'));

const expected = JSON.parse(readFileSync(new URL('public/mods/ffxiv/projects.json',root),'utf8'));

const base = (process.argv[2] || 'https://spacegho.st');

const temp = mkdtempSync(join(tmpdir(),'ffxiv-deploy-health-'));

let sequence = 0;
const downloaded = new Map();

function get(path,binary = false){
	if (downloaded.has(path)) {
		const bytes = downloaded.get(path);
		return binary ? bytes : bytes.toString('utf8');
	};
	const output = join(temp,String((++sequence)));
	execFileSync('curl',['--silent','--show-error','--fail-with-body','--retry','3','--user-agent','spacegho.st-FFXIV-deploy-check/1.0 (+https://github.com/Spaceghost/ghostty-vote)','--retry-all-errors','--retry-delay','2','--connect-timeout','10','--max-time','30','--output',output,new URL(path,base).href],{stdio: ['ignore','ignore','inherit']});
	console.log((('GET ' + path) + ' -> 200'));
	const bytes = readFileSync(output);
	downloaded.set(path,bytes);
	return binary ? bytes : bytes.toString('utf8');
	return;
};

function pagePaths(dir){
	return readdirSync(new URL(dir,root),{withFileTypes: true}).flatMap(function(entry) { return entry.isDirectory() ? pagePaths(dir + '/' + entry.name) : (entry.name.endsWith('.html') ? [(dir + '/' + entry.name).replace(new RegExp('^public'),'').replace(new RegExp('index\\.html$'),'')] : []); });
};

try {
	verifyProjects(JSON.parse(get('/mods/ffxiv/projects.json')),expected);
	verifyPlugins(JSON.parse(get('/mods/ffxiv/plugins.json')),registry);
	verifyPage(get('/mods/ffxiv/term/vote/'),'/mods/ffxiv/term/vote/');
	verifyPage(get('/mods/ffxiv/'),'/mods/ffxiv/');
	verifyPage(get('/mods/ffxiv/plugins/'),'/mods/ffxiv/plugins/');
	verifyPage(get('/mods/ffxiv/roadmap/'),'/mods/ffxiv/roadmap/');
	assert.deepEqual(JSON.parse(get('/mods/ffxiv/roadmap/queue.json')),JSON.parse(readFileSync(new URL('public/mods/ffxiv/roadmap/queue.json',root),'utf8')),'Deployed implementation queue differs from this build');
	assert.ok(get('/mods/ffxiv/site/enhancements.js').includes('Generated from imba/'));
	assert.ok(get('/mods/ffxiv/site/enhancements.imba.css').includes('Generated from imba/'));
	assert.ok(get('/mods/ffxiv/site/theme.js').includes('Generated from imba/'));
	for (let mod of iterable$(registry.mods)){
		const page = get(mod.page);
		verifyPage(page,mod.page);
		assert.ok(page.includes('BEGIN PROJECT REVIEW'),'Missing reviewed release information for ' + mod.id);
		if (mod.votePage) {
			verifyPage(get(mod.votePage),mod.votePage);
			const ideasPath = mod.votePage + 'ideas.json';
			const ideas = JSON.parse(get(ideasPath));
			const expectedIdeas = JSON.parse(readFileSync(new URL('public' + ideasPath,root),'utf8'));
			verifyBallot(ideas,expectedIdeas,JSON.parse(get('/mods/ffxiv/term/vote/api/tallies?mod=' + mod.id)));
		};
		if (mod.publicationStage == 'preview') {
			verifyPage(get(mod.previewPage),mod.previewPage);
			const image = get(mod.bannerPath,true);
			assert.equal(image.subarray(0,4).toString(),'RIFF');
			assert.equal(image.subarray(8,12).toString(),'WEBP');
		};
	};
	for (let path of iterable$(pagePaths('public/mods/ffxiv'))){
		const html = get(path);
		verifyPage(html,path);
		assert.ok(html.includes('data-family-shell'),'Missing shared family shell: ' + path);
		assert.ok(html.includes('/mods/ffxiv/site/theme.js'),'Missing shared theme controller: ' + path);
		assert.ok(!html.includes('fonts.googleapis.com'),'Unexpected legacy font request: ' + path);
	};
	console.log('Deployed registry, installer, ballots and every page in the FFXIV family verified.');
} finally {
	rmSync(temp,{recursive: true,force: true});
};
