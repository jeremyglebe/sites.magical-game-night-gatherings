import { defineConfig } from 'vitepress'
import { cp, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

export default defineConfig({
  title: 'MTG Game Night',
  description: 'Magic: The Gathering format rules, house variants, and personal game-night boxes.',
  base: process.env.VITEPRESS_BASE ?? '/',
  cleanUrls: false,
  srcExclude: ['**/README.md', '**/AGENTS.md', 'docs/**'],
  lastUpdated: true,
  themeConfig: {
    nav: [
      { text: 'Formats', link: '/formats/' },
      { text: 'Boxed Sets', link: '/boxed-sets/' },
      { text: 'Using the Rules', link: '/rules/' },
      { text: 'Research', link: '/research/' },
      { text: 'Sources', link: '/sources/' }
    ],
    sidebar: [
      {
        text: 'Start',
        items: [
          { text: 'Home', link: '/' },
          { text: 'All Formats', link: '/formats/' },
          { text: 'Using the Rules', link: '/rules/' }
        ]
      },
      {
        text: 'Archenemy',
        link: '/formats/archenemy/',
        collapsed: true,
        items: [
          { text: 'Choose a Version', link: '/formats/archenemy/' },
          { text: 'Standard Archenemy', link: '/formats/archenemy/variants/standard' },
          { text: 'Archenemy Commander', link: '/formats/archenemy/variants/commander' },
          { text: 'Supervillain Rumble', link: '/formats/archenemy/variants/rumble' },
          { text: 'Commander Rumble', link: '/formats/archenemy/variants/rumble-commander' }
        ]
      },
      {
        text: 'Assassin',
        link: '/formats/assassin/',
        collapsed: true,
        items: [
          { text: 'Choose a Version', link: '/formats/assassin/' },
          { text: 'Hitmen', link: '/formats/assassin/variants/hitmen' }
        ]
      },
      {
        text: 'BANG-Like Hidden Roles',
        link: '/formats/bang-like/',
        collapsed: true,
        items: [
          { text: 'Choose a Version', link: '/formats/bang-like/' },
          { text: 'BANG! Magic', link: '/formats/bang-like/variants/bang-magic' },
          { text: 'Kingdoms', link: '/formats/bang-like/variants/kingdoms' },
          { text: 'Kingdom / BANG EDH', link: '/formats/bang-like/variants/kingdom-bang-edh' },
          { text: 'MTG Treachery', link: '/formats/bang-like/variants/treachery' }
        ]
      },
      {
        text: 'Big Deck',
        link: '/formats/big-deck/',
        collapsed: true,
        items: [
          { text: 'Choose a Version', link: '/formats/big-deck/' },
          { text: "Pile o' Magic", link: '/formats/big-deck/pile-o-magic/' },
          { text: "Pile o' Magic Commander", link: '/formats/big-deck/pile-o-magic/commander' }
        ]
      },
      {
        text: 'Creature Feature',
        link: '/formats/creature-feature/',
        collapsed: true,
        items: [
          { text: 'Overview', link: '/formats/creature-feature/' },
          { text: 'Full Rules', link: '/formats/creature-feature/rules' }
        ]
      },
      {
        text: 'Cube',
        link: '/formats/cube/',
        collapsed: true,
        items: [
          { text: 'Overview and Cube Types', link: '/formats/cube/' },
          { text: 'Booster-Draft Cube', link: '/formats/cube/variants/booster-draft' }
        ]
      },
      {
        text: 'Horde',
        link: '/formats/horde/',
        collapsed: true,
        items: [
          { text: 'Choose a Version', link: '/formats/horde/' },
          { text: 'Classic Zombie Horde', link: '/formats/horde/variants/classic' },
          { text: 'Open Source Version', link: '/formats/horde/variants/open-source' },
          { text: 'HordeMagic.com', link: '/formats/horde/variants/hordemagic' },
          { text: 'Archived Wiki Version', link: '/formats/horde/variants/wiki' },
          { text: 'Raid', link: '/formats/horde/variants/raid' }
        ]
      },
      {
        text: 'Jumpstart',
        link: '/formats/jumpstart/',
        collapsed: true,
        items: [
          { text: 'Overview', link: '/formats/jumpstart/' },
          { text: 'Two-Packet Jumpstart', link: '/formats/jumpstart/variants/two-packet' },
          { text: 'Build and Label Packets', link: '/formats/jumpstart/building-packets' }
        ]
      },
      {
        text: 'Boxed Sets',
        items: [
          { text: 'All Boxes', link: '/boxed-sets/' },
          { text: 'Feudalism — Draft', link: '/boxed-sets/feudalism' }
        ]
      },
      {
        text: 'Research',
        link: '/research/',
        collapsed: true,
        items: [
          { text: 'Research Index', link: '/research/' },
          { text: 'Marvel Sets and Supporting Pools', link: '/research/marvel-card-pools' },
          { text: 'Everyday-Life Catalogue', link: '/research/everyday-life' },
          { text: 'Everyday Marvel Cards', link: '/research/everyday-life/marvel' },
          { text: 'People and Jobs', link: '/research/everyday-life/people' },
          { text: 'Pets, Pests, and Wildlife', link: '/research/everyday-life/animals' },
          { text: 'Food, Objects, and Transport', link: '/research/everyday-life/objects' },
          { text: 'Places and Activities', link: '/research/everyday-life/places-and-activities' },
          { text: 'Almost Matches', link: '/research/everyday-life/almost-matches' },
          { text: 'Animal Tokens', link: '/research/everyday-life/tokens' }
        ]
      },
      {
        text: 'References',
        items: [
          { text: 'Sources and Notes', link: '/sources/' },
          { text: 'Treachery Card Materials', link: '/formats/bang-like/sources/treachery-cards/' }
        ]
      }
    ],
    outline: { level: [2, 3] },
    search: { provider: 'local' },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/jeremyglebe/magical-game-night-gatherings' }
    ]
  },
  markdown: { image: { lazyLoading: true } },
  vite: { publicDir: false },
  async buildEnd(siteConfig) {
    // Markdown download links do not cause Vite to emit arbitrary JSON files.
    const downloads = [
      'formats/bang-like/sources/treachery-cards-oracle.json',
      'research/everyday-life/cards.json',
      'research/everyday-life/cards.csv',
      'research/everyday-life/searches.json'
    ]
    for (const path of downloads) {
      const destination = resolve(siteConfig.outDir, path)
      await mkdir(dirname(destination), { recursive: true })
      await cp(resolve(siteConfig.srcDir, path), destination)
    }
  }
})
