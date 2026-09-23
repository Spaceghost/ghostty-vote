// Turns each mod's catalogue into the static files its vote page and plugin read:
// ideas.json (the catalogue, no tallies) and version.json (a cheap poll). Pure; no I/O.
import { catalogueMod, validateCatalogue } from './seed-lib.js';
import { VOTE_MODS } from '../src/lib.js';

// Ghostty's vote, the original; every other mod's is at VOTE_MODS[mod].
export const BASE = '/mods/ffxiv/term/vote/';
export const PUBLIC_URL = 'https://spacegho.st' + BASE;
export const STATIC_DIR = 'public' + BASE;
const pageOf = (cat) => VOTE_MODS[catalogueMod(cat)];

function checked(cat) {
  const errors = validateCatalogue(cat);
  if (errors.length) throw new Error('invalid catalogue:\n  ' + errors.join('\n  '));
  return cat;
}

export function buildIdeas(cat) {
  checked(cat);
  const top = new Set(cat.top_picks || []);
  return {
    version: cat.version,
    categories: cat.categories.map((c) => ({ name: c.name, tagline: c.tagline || '' })),
    ideas: cat.categories.flatMap((c) => c.ideas.map((i) => ({
      id: i.id,
      category: c.name,
      title: i.title,
      pitch: i.pitch || '',
      experience: i.experience || '',
      how: i.how || '',
      risks: i.risks || '',
      audience: i.audience || '',
      in_world: i.in_world === true,
      tos_safe: i.tos_safe !== false,
      top_pick: top.has(i.id),
      wow: i.wow,
      feasibility: i.feasibility || '',
      effort: i.effort || '',
      added_version: i.added_version,
    }))),
  };
}

// `added` counts ideas per catalogue version, so a client that last saw version N
// can work out how many are new (sum of added[v] for v > N) without a server.
export function buildVersion(cat) {
  checked(cat);
  const added = {};
  let ideas = 0;
  for (const c of cat.categories) {
    for (const i of c.ideas) {
      added[i.added_version] = (added[i.added_version] || 0) + 1;
      ideas++;
    }
  }
  return { version: cat.version, ideas, added, url: 'https://spacegho.st' + pageOf(cat) };
}

export const serialize = (value) => JSON.stringify(value) + '\n';

// Relative path (from the repo root) -> file contents, for everything generated: each
// mod's ideas.json and version.json beside its vote page, and one seed for them all.
export function buildOutputs(cats, buildSeedSqlAll) {
  const list = Array.isArray(cats) ? cats : [cats];
  const out = {};
  for (const cat of list) {
    const dir = 'public' + pageOf(cat);
    out[dir + 'ideas.json'] = serialize(buildIdeas(cat));
    out[dir + 'version.json'] = serialize(buildVersion(cat));
  }
  out['seed/seed.sql'] = buildSeedSqlAll(list);
  return out;
}
