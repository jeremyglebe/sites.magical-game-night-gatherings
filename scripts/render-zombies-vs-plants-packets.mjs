import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const directory = resolve(root, 'boxed-sets/zombies-vs-plants/v0.1');
const page = resolve(root, 'boxed-sets/zombies-vs-plants-jumpstart.md');
const { packets } = JSON.parse(await readFile(resolve(directory, 'packets.json'), 'utf8'));
const check = process.argv.includes('--check');
const colors = { W: 'White', U: 'Blue', B: 'Black', G: 'Green' };
const escape = value => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
const fileLink = packet => `./zombies-vs-plants/v0.1/${packet.slug}.txt`;
const summary = [
  '## The eight packets', '',
  'Every packet contains **12 nonland cards and 8 lands**. Combine two different packets from the same faction; all forty cards stay in the deck. Creature counts below count cards, not the tokens or animated lands they can produce.', '',
  '| ID | Faction | Packet | Mana | Creatures / other spells / lands |',
  '| --- | --- | --- | --- | --- |',
  ...packets.map(p => `| ${p.id} | ${p.faction === 'plants' ? 'Plants' : 'Zombies'} | [${p.name}](#${p.slug}) | ${colors[p.color]} | ${p.counts.creatures} / ${p.counts.otherSpells} / ${p.counts.lands} |`), '',
  'The named printings identify the cards and their verified text; other printings are usable. **Mono-color means the packet can cast its spells with its stated mana color.** Hybrid cards keep their actual colors. Optional abilities may improve with a partner’s color, but the base card must work without that partner.', '',
  '**Singleton exception:** The Turned contains two Slitherheads and two Sultai Devotees to provide enough inexpensive green-paid Zombies. All other nonbasic cards appear once across each faction’s four packets. Shared spells or lands on opposing factions do not create duplicates in a legal deck.', '',
];
const sections = packets.flatMap(p => [
  `## ${p.name}`, '',
  `**${p.id} · ${p.faction === 'plants' ? 'Plants' : 'Zombies'} · ${colors[p.color]} · 20 cards** · [Plain-text list](${fileLink(p)})`, '',
  p.plan, '',
  '| Qty | Card | Mana cost | Role |',
  '| ---: | --- | --- | --- |',
  ...p.cards.map(c => `| ${c.quantity} | [${c.name}](${c.scryfallUri}) | ${c.manaCost || '—'} | ${escape(c.role)} |`), '',
  `**Composition:** ${p.counts.creatures} creature cards, ${p.counts.otherSpells} other spells, ${p.counts.lands} lands.`, '',
  '**Playing the packet**', '',
  ...p.notes.map(note => `- ${note}`), '',
  '**First-test watch points**', '',
  ...p.risks.map(note => `- ${note}`), '',
  '**Retained alternatives:** ' + p.cuts.map(c => `${c.name} — ${c.reason}`).join(' '), '',
]);
const content = [...summary, ...sections].join('\n');
const start = '<!-- BEGIN ZVP V0.1 PACKETS -->';
const end = '<!-- END ZVP V0.1 PACKETS -->';
const current = await readFile(page, 'utf8');
if (!current.includes(start) || !current.includes(end)) throw new Error('Packet section markers are missing');
const updated = current.slice(0, current.indexOf(start) + start.length) + '\n\n' + content + '\n' + current.slice(current.indexOf(end));
const outputs = new Map([[page, updated]]);
for (const packet of packets) outputs.set(resolve(directory, `${packet.slug}.txt`), packet.cards.map(c => `${c.quantity} ${c.name}`).join('\n') + '\n');
const inventory = new Map();
for (const p of packets) for (const c of p.cards) inventory.set(c.name, (inventory.get(c.name) || 0) + c.quantity);
outputs.set(resolve(directory, 'box-inventory.txt'), [...inventory].sort(([a], [b]) => a.localeCompare(b)).map(([name, quantity]) => `${quantity} ${name}`).join('\n') + '\n');
for (const [file, expected] of outputs) {
  if (check) {
    const actual = await readFile(file, 'utf8').catch(() => null);
    if (actual !== expected) throw new Error(`Stale packet export: ${file}. Run node scripts/render-zombies-vs-plants-packets.mjs`);
  } else await writeFile(file, expected);
}
console.log(`${check ? 'Verified' : 'Rendered'} eight packet lists, the 160-card inventory, and the Markdown packet section.`);
