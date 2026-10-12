import assert from 'node:assert/strict';
import { usableEntry } from './plugins-lib.js';

export function verifyProjects(actual, expected) {
  assert.deepEqual(actual, expected, 'Deployed project registry differs from this build');
}

export function verifyPlugins(actual, registry) {
  assert.ok(Array.isArray(actual), 'Plugin repository must be an array');
  const expected = registry.mods.filter((m) => m.listed && (m.kind || 'plugin') === 'plugin');
  const names = new Set();
  for (const entry of actual) {
    assert.ok(usableEntry(entry), 'Installer entry must contain a version and HTTPS download');
    assert.ok(!names.has(entry.InternalName), 'Duplicate installer entry: ' + entry.InternalName);
    names.add(entry.InternalName);
    assert.ok(expected.some((m) => m.internalName === entry.InternalName), 'Unlisted project in installer: ' + entry.InternalName);
  }
  for (const mod of expected.filter((m) => m.released || m.testingVersion)) {
    assert.ok(names.has(mod.internalName), 'Published plugin missing from installer: ' + mod.internalName);
  }
}

export function verifyPage(html, path) {
  assert.match(html, /<!doctype html>/i, 'Expected a complete HTML page at ' + path);
  assert.ok(html.includes('https://spacegho.st' + path), 'Expected canonical route at ' + path);
}
