import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyProjects, verifyPlugins, verifyPage } from '../scripts/deploy-health-lib.js';

const registry = { mods: [
  { internalName: 'Stable', listed: true, released: true },
  { internalName: 'Testing', listed: true, testingVersion: '0.1.0.1' },
  { internalName: 'Character', listed: false },
  { internalName: 'Library', kind: 'library', listed: false },
] };
const entry = (name) => ({ InternalName: name, AssemblyVersion: '0.1.0.1', DownloadLinkInstall: 'https://example.com/' + name + '.zip' });

test('deploy verification rejects stale public project metadata', () => {
  verifyProjects({ version: 1, projects: ['HUD'] }, { version: 1, projects: ['HUD'] });
  assert.throws(() => verifyProjects({ version: 1, projects: [] }, { version: 1, projects: ['HUD'] }));
});
test('deploy verification requires published plugins and keeps development modules out of the installer', () => {
  verifyPlugins([entry('Stable'), entry('Testing')], registry);
  assert.throws(() => verifyPlugins([entry('Stable')], registry));
  assert.throws(() => verifyPlugins([entry('Stable'), entry('Testing'), entry('Character')], registry));
  assert.throws(() => verifyPlugins([entry('Stable'), entry('Testing'), entry('Library')], registry));
  assert.throws(() => verifyPlugins([entry('Stable'), entry('Testing'), entry('Testing')], registry));
  assert.throws(() => verifyPlugins([{ ...entry('Stable'), DownloadLinkInstall: 'http://example.com/a.zip' }, entry('Testing')], registry));
});
test('deploy verification rejects error documents and pages served under the wrong route', () => {
  verifyPage('<!doctype html><link rel="canonical" href="https://spacegho.st/mods/ffxiv/xivhud/">', '/mods/ffxiv/xivhud/');
  assert.throws(() => verifyPage('Forbidden', '/mods/ffxiv/xivhud/'));
  assert.throws(() => verifyPage('<!doctype html><title>Fallback</title>', '/mods/ffxiv/xivhud/'));
});
