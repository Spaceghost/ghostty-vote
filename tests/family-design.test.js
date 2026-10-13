// Generated from imba/tests/family-design.test.imba; edit the Imba source.
import {iterable$} from 'imba/runtime';

/*body*/
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {familyPage} from '../scripts/project-pages.js';

const root = new URL('../',import.meta.url);
const registry = JSON.parse(readFileSync(new URL('data/mods.json',root),'utf8'));

function pages(dir){
	return readdirSync(new URL(dir,root),{withFileTypes: true}).flatMap(function(entry) { return entry.isDirectory() ? pages(dir + '/' + entry.name) : (entry.name.endsWith('.html') ? [dir + '/' + entry.name] : []); });
};

test('every FFXIV page has one shared accessible shell and a common final stylesheet',function() {
	var $1;
	const files = pages('public/mods/ffxiv');
	assert.ok(files.length >= 38);
	$1 = [];
	for (let path of iterable$(files)){
		const html = readFileSync(new URL(path,root),'utf8');
		assert.equal((html.match(new RegExp('data-family-shell','g')) || []).length,1,path);
		assert.equal((html.match(new RegExp('<footer\\b','g')) || []).length,1,path);
		assert.equal((html.match(new RegExp('<main\\b','g')) || []).length,1,path);
		assert.equal((html.match(new RegExp('id="theme"','g')) || []).length,1,path);
		assert.ok(html.includes('href="#main"'),path);
		const sheets = [...html.matchAll(new RegExp('<link rel="stylesheet" href="([^"]+)"','g'))].map(function(match) { return match[1]; });
		assert.equal(sheets.at(-1),'/mods/ffxiv/site/site.css',path);
		assert.equal(sheets.filter(function(url) { return url == '/mods/ffxiv/site/site.css'; }).length,1,path);
		assert.doesNotMatch(html,new RegExp('fonts\\.googleapis|fonts\\.gstatic|<style|\\son\\w+=','i'),path);
		$1.push(assert.equal(familyPage(html,registry,path),html,'Shell generation must be idempotent: ' + path));
	};
	return $1;
});

test('ballot, gallery and admin containers keep their identities inside the common main',function() {
	var $2;
	$2 = [];
	for (let [path,id] of [['term/vote','cats'],['term/gallery','shots'],['term/vote/admin','voters']]){
		const html = readFileSync(new URL('public/mods/ffxiv/' + path + '/index.html',root),'utf8');
		assert.equal((html.match(new RegExp('id="' + id + '"','g')) || []).length,1);
		assert.ok(html.includes('<main id="main">'));
		$2.push(path.includes('admin') && (
			assert.ok(html.includes('noindex, nofollow'))
		));
	};
	return $2;
});

test('project subpages have active contextual tabs and previews join the family navigation',function() {
	var $3;
	$3 = [];
	for (let [path,label] of [['xivprism/vote','Vote'],['xivprism/preview','Preview']]){
		const html = readFileSync(new URL('public/mods/ffxiv/' + path + '/index.html',root),'utf8');
		assert.ok(html.includes('aria-label="Project"'));
		assert.ok(html.includes('aria-current="page">' + label + '</a>'));
		$3.push(assert.ok(html.includes('FFXIV mods home')));
	};
	return $3;
});
