#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../', import.meta.url);
export const CATALOGUES = Object.freeze({
  ghostty: 'data/catalogue.json',
  xivmcp: 'data/catalogues/xivmcp.json',
  xivdesktop: 'data/catalogues/xivdesktop.json',
  xivarcade: 'data/catalogues/xivarcade.json',
  xivwayfinder: 'data/catalogues/xivwayfinder.json',
  xivlantern: 'data/catalogues/xivlantern.json',
  xivpiano: 'data/catalogues/xivpiano.json',
  almanac: 'data/catalogues/almanac.json',
});

const load = (path) => JSON.parse(readFileSync(new URL(path, ROOT), 'utf8'));
const key = (mod, id) => `${mod}:${id}`;

export function buildAcceptedVotes(catalogues, scope) {
  const errors = [];
  const excluded = new Map();
  for (const item of scope.excluded || []) {
    const k = key(item.mod, item.id);
    if (excluded.has(k)) errors.push(`duplicate exclusion ${k}`);
    if (!['maybe', 'skip'].includes(item.vote)) errors.push(`${k} has invalid vote ${item.vote}`);
    excluded.set(k, item.vote);
  }

  const accepted = [];
  const seen = new Set();
  for (const [mod, catalogue] of Object.entries(catalogues)) {
    if (catalogue.version !== scope.catalogue_versions?.[mod]) {
      errors.push(`${mod} catalogue is version ${catalogue.version}; scope records ${scope.catalogue_versions?.[mod]}`);
    }
    for (const category of catalogue.categories || []) {
      for (const idea of category.ideas || []) {
        const k = key(mod, idea.id);
        if (seen.has(k)) errors.push(`duplicate catalogue idea ${k}`);
        seen.add(k);
        if (!excluded.has(k)) accepted.push({
          mod,
          id: idea.id,
          category: category.name,
          title: idea.title,
          feasibility: idea.feasibility,
          effort: idea.effort,
          status: 'queued',
        });
      }
    }
  }

  for (const k of excluded.keys()) if (!seen.has(k)) errors.push(`excluded idea is not in the catalogues: ${k}`);
  const counts = Object.fromEntries(Object.keys(catalogues).map((mod) => [mod, accepted.filter((x) => x.mod === mod).length]));
  for (const [mod, expected] of Object.entries(scope.expected_by_mod || {})) {
    if (counts[mod] !== expected) errors.push(`${mod} accepts ${counts[mod]}, expected ${expected}`);
  }
  if (accepted.length !== scope.expected_total) errors.push(`accepted total is ${accepted.length}, expected ${scope.expected_total}`);
  if (errors.length) throw new Error(`invalid accepted vote scope:\n  ${errors.join('\n  ')}`);
  return { accepted, counts };
}

export function loadAcceptedVotes() {
  const catalogues = Object.fromEntries(Object.entries(CATALOGUES).map(([mod, path]) => [mod, load(path)]));
  return buildAcceptedVotes(catalogues, load('data/accepted-votes.json'));
}

function markdown(plan) {
  const lines = ['# Accepted vote implementation ledger', '', `Total: ${plan.accepted.length}`, ''];
  for (const mod of Object.keys(CATALOGUES)) {
    lines.push(`## ${mod} (${plan.counts[mod]})`, '', '| ID | Idea | Feasibility | Effort | Status |', '|---|---|---|---|---|');
    for (const idea of plan.accepted.filter((x) => x.mod === mod)) {
      lines.push(`| \`${idea.id}\` | ${idea.title.replaceAll('|', '\\|')} | ${idea.feasibility} | ${idea.effort} | ${idea.status} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const plan = loadAcceptedVotes();
  if (process.argv.includes('--json')) process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  else process.stdout.write(`${markdown(plan)}\n`);
}
