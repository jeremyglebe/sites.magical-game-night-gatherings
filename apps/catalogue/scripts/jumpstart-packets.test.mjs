import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const root = new URL('../../../', import.meta.url);
const folder = new URL('boxed-sets/zombies-vs-plants/v0.1/', root);
const json = async url => JSON.parse(await readFile(url, 'utf8'));
const manifest = await json(new URL('packets.json', folder));
const snapshot = await json(new URL('cards.json', folder));
const research = await json(new URL('research/zombies-vs-plants/cards.json', root));
const byId = new Map(snapshot.cards.map(card => [card.oracle_id, card]));
const sum = rows => rows.reduce((total, row) => total + row.quantity, 0);
const isLand = row => byId.get(row.oracleId).type_line.includes('Land');

// Audit the playable inventory against saved Scryfall facts, rather than trusting display totals.
test('v0.1 has eight complete, single-color-payable twenty-card packets', () => {
  assert.equal(manifest.status, 'Draft — unplaytested');
  assert.deepEqual(manifest.packets.map(p => [p.name, p.faction, p.color]), [
    ['Overgrowth', 'plants', 'G'], ['Ancient Grove', 'plants', 'W'],
    ['Spore Swarm', 'plants', 'B'], ['Wild Awakening', 'plants', 'G'],
    ['Restless Dead', 'zombies', 'B'], ['Stitched Together', 'zombies', 'U'],
    ['Tomb Guard', 'zombies', 'W'], ['The Turned', 'zombies', 'G'],
  ]);
  assert.equal(new Set(manifest.packets.map(p => p.id)).size, 8);
  assert.equal(sum(manifest.packets.flatMap(p => p.cards)), 160);
  for (const packet of manifest.packets) {
    assert.equal(sum(packet.cards), 20, packet.name);
    assert.equal(sum(packet.cards.filter(isLand)), 8, packet.name);
    assert.equal(sum(packet.cards.filter(row => !isLand(row))), 12, packet.name);
    assert.equal(new Set(packet.cards.map(c => c.oracleId)).size, packet.cards.length);
    for (const row of packet.cards) {
      assert.ok(Number.isInteger(row.quantity) && row.quantity > 0);
      const card = byId.get(row.oracleId);
      assert.ok(card, `${row.name} has a saved card record`);
      assert.equal(row.name, card.name);
      assert.equal(row.manaCost, card.mana_cost || '');
      assert.equal(row.manaValue, card.cmc);
      assert.equal(row.typeLine, card.type_line);
      assert.ok(card.released_at <= manifest.draftedAt, `${row.name}: already released`);
      assert.ok(card.scryfall_uri.startsWith('https://scryfall.com/card/'));
      if (!isLand(row)) {
        assert.ok(research.cards.some(candidate => candidate.oracle_id === row.oracleId), `${row.name}: retained in research`);
        for (const [symbol] of row.manaCost.matchAll(/\{[^}]+\}/g)) {
          const value = symbol.slice(1, -1);
          assert.ok(/^\d+$/.test(value) || value === 'X' || value.split('/').includes(packet.color), `${packet.name}: cannot pay ${symbol} on ${row.name}`);
        }
      }
    }
  }
});

test('all twelve legal combinations have forty cards and only documented duplicates', () => {
  const allowed = new Map([['Slitherhead', 2], ['Sultai Devotee', 2]]);
  let pairs = 0;
  for (const faction of ['plants', 'zombies']) {
    const packets = manifest.packets.filter(p => p.faction === faction);
    const factionCounts = new Map();
    for (const row of packets.flatMap(p => p.cards)) {
      if (row.typeLine.startsWith('Basic Land')) continue;
      factionCounts.set(row.name, (factionCounts.get(row.name) || 0) + row.quantity);
    }
    for (const [name, quantity] of factionCounts) assert.equal(quantity, allowed.get(name) || 1, `${faction}: ${name}`);
    for (let i = 0; i < packets.length; i++) for (let j = i + 1; j < packets.length; j++) {
      const deck = [...packets[i].cards, ...packets[j].cards];
      assert.equal(sum(deck), 40);
      assert.equal(sum(deck.filter(isLand)), 16);
      pairs++;
    }
  }
  assert.equal(pairs, 12);
  const turned = manifest.packets.find(p => p.name === 'The Turned');
  assert.deepEqual(turned.duplicateExceptions.map(c => [c.name, c.quantity]).sort(), [...allowed].sort());
  for (const p of manifest.packets.filter(p => p.faction === 'plants')) {
    assert.ok(p.cards.every(c => !/\bZombie\b/.test(c.typeLine)), `${p.name}: living faction`);
  }
});

test('published Markdown and downloadable lists match the versioned inventory', () => {
  execFileSync(process.execPath, [new URL('scripts/render-zombies-vs-plants-packets.mjs', root).pathname, '--check'], { stdio: 'pipe' });
  assert.ok(!JSON.stringify(manifest).includes('pending parent MCP'), 'no unresolved verification placeholders');
});
