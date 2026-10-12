// Generated from imba/tests/accepted-votes.test.imba; edit the Imba source.

/*body*/

import {test} from 'node:test';

import assert from 'node:assert/strict';

import {loadAcceptedVotes} from '../scripts/accepted-votes.js';

test(
	'the confirmed ballot resolves to exactly 201 catalogue ideas',
	function() {
		const plan = loadAcceptedVotes();
		assert.equal(plan.accepted.length,201);
		assert.deepEqual(plan.counts,{ghostty: 73,xivmcp: 16,xivdesktop: 18,xivarcade: 17,xivwayfinder: 19,xivlantern: 20,xivpiano: 18,almanac: 20});
		assert.ok(
			plan.accepted.every(
				function(idea) {
					return (idea.status === 'queued');
				}
			)
		);
		return;
	}
);

test(
	'accepted idea keys are unique across every mod',
	function() {
		const {accepted: accepted} = loadAcceptedVotes();
		const keys = accepted.map(
			function(idea) {
				return ('' + String(idea.mod) + ':' + String(idea.id) + '');
			}
		);
		assert.equal(new Set(keys).size,keys.length);
		return;
	}
);
