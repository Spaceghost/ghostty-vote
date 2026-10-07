import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAcceptedVotes } from '../scripts/accepted-votes.js';

test('the confirmed ballot resolves to exactly 201 catalogue ideas', () => {
  const plan = loadAcceptedVotes();
  assert.equal(plan.accepted.length, 201);
  assert.deepEqual(plan.counts, {
    ghostty: 73,
    xivmcp: 16,
    xivdesktop: 18,
    xivarcade: 17,
    xivwayfinder: 19,
    xivlantern: 20,
    xivpiano: 18,
    almanac: 20,
  });
  assert.ok(plan.accepted.every((idea) => idea.status === 'queued'));
});

test('accepted idea keys are unique across every mod', () => {
  const { accepted } = loadAcceptedVotes();
  const keys = accepted.map((idea) => `${idea.mod}:${idea.id}`);
  assert.equal(new Set(keys).size, keys.length);
});
