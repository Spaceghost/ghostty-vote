// Generated from imba/tests/deploy-health.test.imba; edit the Imba source.

/*body*/

import test from 'node:test';

import assert from 'node:assert/strict';

import {verifyProjects,verifyPlugins,verifyPage,verifyBallot} from '../scripts/deploy-health-lib.js';

const registry = {mods: [{internalName: 'Stable',listed: true,released: true},{internalName: 'Testing',listed: true,testingVersion: '0.1.0.1'},{internalName: 'Character',listed: false},{internalName: 'Library',kind: 'library',listed: false}]};

const entry = function(name) {
	return {InternalName: name,AssemblyVersion: '0.1.0.1',DownloadLinkInstall: (('https://example.com/' + name) + '.zip')};
};

test(
	'deploy verification rejects stale public project metadata',
	function() {
		verifyProjects({version: 1,projects: ['HUD']},{version: 1,projects: ['HUD']});
		assert.throws(
			function() {
				return verifyProjects({version: 1,projects: []},{version: 1,projects: ['HUD']});
			}
		);
		return;
	}
);

test(
	'deploy verification requires published plugins and keeps development modules out of the installer',
	function() {
		verifyPlugins([entry('Stable'),entry('Testing')],registry);
		assert.throws(
			function() {
				return verifyPlugins([entry('Stable')],registry);
			}
		);
		assert.throws(
			function() {
				return verifyPlugins([entry('Stable'),entry('Testing'),entry('Character')],registry);
			}
		);
		assert.throws(
			function() {
				return verifyPlugins([entry('Stable'),entry('Testing'),entry('Library')],registry);
			}
		);
		assert.throws(
			function() {
				return verifyPlugins([entry('Stable'),entry('Testing'),entry('Testing')],registry);
			}
		);
		assert.throws(
			function() {
				return verifyPlugins([{...entry('Stable'),DownloadLinkInstall: 'http://example.com/a.zip'},entry('Testing')],registry);
			}
		);
		return;
	}
);

test(
	'deploy verification rejects error documents and pages served under the wrong route',
	function() {
		verifyPage('<!doctype html><link rel="canonical" href="https://spacegho.st/mods/ffxiv/xivhud/">','/mods/ffxiv/xivhud/');
		assert.throws(
			function() {
				return verifyPage('Forbidden','/mods/ffxiv/xivhud/');
			}
		);
		assert.throws(
			function() {
				return verifyPage('<!doctype html><title>Fallback</title>','/mods/ffxiv/xivhud/');
			}
		);
		return;
	}
);


test('public vote verification rejects unseeded ideas',function() {
	const ideas = {version: 1,ideas: [{id: 'prism-example'}]};
	verifyBallot(ideas,ideas,{'prism-example': {want: 0,maybe: 0,skip: 0}});
	assert.throws(function() { return verifyBallot(ideas,ideas,{}); });
	return assert.throws(function() { return verifyBallot({version: 2,ideas: []},ideas,{}); });
});
