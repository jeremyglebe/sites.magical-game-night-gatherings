import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const directory = resolve(import.meta.dirname, '../research/zombies-vs-plants');
const read = async name => JSON.parse(await readFile(resolve(directory, name), 'utf8'));
const metadata = await read('metadata.json');
const sources = ['crossover-candidates.json', 'plant-candidates.json', 'zombie-candidates.json', 'mana-candidates.json', 'botanical-allies.json', 'additional-botanical-leads.json', 'necrobloom-candidate.json', 'living-lands.json', 'plant-support-spells.json', 'zombie-support-spells.json', 'white-grove-candidates.json', 'white-grove-birds.json', 'draft-v0.1-additions.json', 'interaction-priority.json', 'interaction-zombies.json', 'interaction-plants.json'];
const groups = new Set(metadata.groups.map(group => group.id));
const merged = new Map();
const queries = [];
const discoverySources = [];
const resolvedLeads = [];
const unique = values => [...new Set(values.filter(Boolean))];
const combine = (a, b) => unique([a, b]).join(' ');
const mergeFactions = (a, b, name) => {
  const first = unique(a || []), second = unique(b || []);
  if (first.length && second.length && (first.length !== second.length || first.some(faction => !second.includes(faction)))) {
    throw new Error(`Conflicting editorial factions for ${name}; resolve the source assignment instead of combining factions`);
  }
  return first.length ? first : second;
};

for (const source of sources) {
  const data = await read(source);
  queries.push(...data.queries.map(query => ({ source, ...query })));
  discoverySources.push(...(data.discoverySources || []).map(entry => ({ source, ...entry })));
  resolvedLeads.push(...(data.resolvedLeads || []).map(entry => ({ source, ...entry })));
  for (const card of data.cards) {
    if (!card.oracle_id || !card.name || !card.scryfall_uri || !card.research?.groups?.length) throw new Error(`Incomplete card in ${source}: ${card.name}`);
    if (card.research.groups.some(group => !groups.has(group))) throw new Error(`Unknown group for ${card.name}`);
    if (card.released_at > metadata.researchedAt) throw new Error(`Card beyond research cutoff: ${card.name}`);
    const previous = merged.get(card.oracle_id);
    if (!previous) {
      merged.set(card.oracle_id, structuredClone(card));
      continue;
    }
    // Keep one printing's ID, imagery, and Oracle fields together. Only combine editorial metadata.
    const a = previous.research, b = card.research;
    previous.research = {
      groups: unique([...a.groups, ...b.groups]),
      roles: unique([...(a.roles || []), ...(b.roles || [])]),
      note: combine(a.note, b.note),
      caution: combine(a.caution, b.caution),
      manaNote: combine(a.manaNote, b.manaNote),
      crossover: Boolean(a.crossover || b.crossover),
      thematicCrossover: Boolean(a.thematicCrossover || b.thematicCrossover),
      factions: mergeFactions(a.factions, b.factions, card.name),
    };
  }
}

const cards = [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
const crossoverSource = await read('crossover-candidates.json');
const expected = new Set(crossoverSource.cards.map(card => card.oracle_id));
const actual = cards.filter(card => card.research.crossover);
if (actual.length !== expected.size || actual.some(card => !expected.has(card.oracle_id))) throw new Error('Crossover catalogue is incomplete or inconsistent');
const thematicUndead = ['Skullbriar, the Walking Grave', 'The Necrobloom'];
const botanicalUndead = cards.filter(card => expected.has(card.oracle_id) || thematicUndead.includes(card.name));
if (botanicalUndead.length !== expected.size + thematicUndead.length || botanicalUndead.some(card => card.research.factions?.length !== 1 || card.research.factions[0] !== 'zombies')) {
  throw new Error('Botanical undead candidates must have an explicit Zombie-only faction assignment');
}

await writeFile(resolve(directory, 'cards.json'), JSON.stringify({ ...metadata, cards }, null, 2) + '\n');
await writeFile(resolve(directory, 'searches.json'), JSON.stringify({
  researchedAt: metadata.researchedAt,
  coverage: 'Explicit botanical Zombie crossover query is complete; other pools are curated candidates, not exhaustive decklists.',
  sources,
  queries,
  discoverySources,
  resolvedLeads,
}, null, 2) + '\n');
console.log(`Saved ${cards.length} research candidates, including all ${actual.length} crossovers.`);
