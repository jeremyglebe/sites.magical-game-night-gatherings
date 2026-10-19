import { readFile, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const folder = resolve(root, 'research/everyday-life')
const data = JSON.parse(await readFile(resolve(folder, 'cards.json'), 'utf8'))
const cards = data.cards
const escape = value => String(value ?? '').replaceAll('|', '&#124;').replaceAll('\n', ' ')
const labels = { Direct: 'Direct', Setting: 'Setting', Almost: 'Almost' }

const groups = {
  'marvel-people': 'People and jobs', 'marvel-animals': 'Animals',
  'marvel-objects': 'Objects and transportation', 'marvel-places': 'Places',
  'marvel-activities': 'Everyday activities', people: 'People and jobs',
  animals: 'Animals', objects: 'Food and objects', transport: 'Transportation',
  places: 'Places', activities: 'Everyday activities'
}

const seenNames = new Set()
for (const card of cards) {
  if (!groups[card.category] || !labels[card.fit] || !card.name || !card.type_line || !card.note ||
      !card.scryfall_url?.startsWith('https://scryfall.com/card/') || seenNames.has(card.name)) {
    throw new Error(`Invalid or duplicate research entry: ${card.name ?? '(unnamed)'}`)
  }
  seenNames.add(card.name)
}

function table(rows) {
  const sorted = [...rows].sort((a, b) => a.name.localeCompare(b.name, 'en'))
  return '| Card and printing | Actual type | Fit | Why consider it / qualification |\n| --- | --- | --- | --- |\n' + sorted.map(card => {
    const special = card.rules_note ? ` **${escape(card.rules_note)}**` : ''
    const printing = `${card.set_code.toUpperCase()} ${card.collector_number}`
    const alias = card.flavor_name ? ` This printing's alternate title: ${escape(card.flavor_name)}.` : ''
    return `| [${escape(card.name)}](${card.scryfall_url}) · ${escape(printing)} | ${escape(card.type_line)} | ${labels[card.fit]} | ${escape(card.note)}${alias}${special} |`
  }).join('\n') + '\n'
}

async function replaceBlock(path, marker, contents) {
  const text = await readFile(path, 'utf8')
  const start = `<!-- ${marker}:start -->`
  const end = `<!-- ${marker}:end -->`
  const before = text.indexOf(start), after = text.indexOf(end)
  if (before < 0 || after < before || text.indexOf(start, before + start.length) >= 0) {
    throw new Error(`Missing or duplicate ${marker} markers in ${path}`)
  }
  await writeFile(path, text.slice(0, before + start.length) + '\n\n' + contents.trim() + '\n\n' + text.slice(after))
}

for (const [page, categories] of Object.entries({
  marvel: ['marvel-people', 'marvel-animals', 'marvel-objects', 'marvel-places', 'marvel-activities'],
  people: ['people'], animals: ['animals'], objects: ['objects', 'transport'],
  'places-and-activities': ['places', 'activities']
})) {
  const content = categories.map(category => `## ${groups[category]}\n\n${table(cards.filter(c => c.category === category && c.fit !== 'Almost'))}`).join('\n')
  await replaceBlock(resolve(folder, `${page}.md`), 'catalogue', content)
}

const almostSections = [
  ['Marvel and Spider-Man', c => c.category.startsWith('marvel-')],
  ['People and jobs', c => c.category === 'people'],
  ['Animals and pets', c => c.category === 'animals'],
  ['Food and objects', c => c.category === 'objects'],
  ['Transportation', c => c.category === 'transport'],
  ['Places and activities', c => ['places', 'activities'].includes(c.category)]
]
await replaceBlock(resolve(folder, 'almost-matches.md'), 'catalogue', almostSections.map(([title, predicate]) =>
  `## ${title}\n\n${table(cards.filter(c => c.fit === 'Almost' && predicate(c)))}`
).join('\n'))

const counts = Object.fromEntries(Object.keys(labels).map(fit => [fit, cards.filter(c => c.fit === fit).length]))
const marvel = cards.filter(c => c.category.startsWith('marvel-')).length
await replaceBlock(resolve(root, 'research/everyday-life.md'), 'catalogue-summary',
  `This snapshot contains **${cards.length} individually catalogued cards**: **${marvel} Marvel entries** and **${cards.length - marvel} additional candidates**. The fit labels comprise ${counts.Direct} Direct, ${counts.Setting} Setting, and ${counts.Almost} Almost entries. Ordinary-animal token examples are listed separately.`)

const columns = ['name', 'flavor_name', 'category', 'fit', 'type_line', 'mana_cost', 'color_identity', 'set_code', 'set_name', 'collector_number', 'rules_note', 'note', 'scryfall_url', 'scryfall_id', 'oracle_id', 'checked_at']
const csv = value => `"${String(Array.isArray(value) ? value.join(' ') : value ?? '').replaceAll('"', '""')}"`
await writeFile(resolve(folder, 'cards.csv'), '\uFEFF' + [columns.join(','), ...cards.map(card => columns.map(column => csv(card[column])).join(','))].join('\r\n') + '\r\n')
console.log(`Rendered ${cards.length} research cards and CSV; ${counts.Almost} explicitly marked almost matches.`)
