#!/usr/bin/env node
// Usage: node scripts/gen-seed.js [--check]
// Writes seed/seed.sql from data/catalogue.json; --check fails if it is stale.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSeedSql } from './seed-lib.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const catalogue = JSON.parse(readFileSync(root + 'data/catalogue.json', 'utf8'));
const sql = buildSeedSql(catalogue);
const target = root + 'seed/seed.sql';

if (process.argv.includes('--check')) {
  let current = '';
  try { current = readFileSync(target, 'utf8'); } catch {}
  if (current !== sql) {
    console.error('seed/seed.sql is out of date; run: node scripts/gen-seed.js');
    process.exit(1);
  }
  console.log(`seed/seed.sql is current (catalogue version ${catalogue.version})`);
} else {
  writeFileSync(target, sql);
  console.log(`wrote seed/seed.sql (catalogue version ${catalogue.version})`);
}
