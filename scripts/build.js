#!/usr/bin/env node
// Usage: node scripts/build.js [--check]
// Generates public/mods/ffxiv/term/vote/{ideas,version}.json and seed/seed.sql from
// data/catalogue.json. --check writes nothing and fails if any output is stale.
// No dependencies; wrangler runs this as the [build] command before deploy.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSeedSql } from './seed-lib.js';
import { buildOutputs } from './static-lib.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const catalogue = JSON.parse(readFileSync(root + 'data/catalogue.json', 'utf8'));
const outputs = buildOutputs(catalogue, buildSeedSql);
const check = process.argv.includes('--check');
let stale = 0;

for (const [path, body] of Object.entries(outputs)) {
  let current = null;
  try { current = readFileSync(root + path, 'utf8'); } catch {}
  if (current === body) continue;
  if (check) {
    console.error(`${path} is out of date; run: node scripts/build.js`);
    stale++;
  } else {
    mkdirSync(dirname(root + path), { recursive: true });
    writeFileSync(root + path, body);
    console.log(`wrote ${path}`);
  }
}
if (stale) process.exit(1);
console.log(`catalogue version ${catalogue.version}: ${check ? "outputs are current" : "build done"}`);
