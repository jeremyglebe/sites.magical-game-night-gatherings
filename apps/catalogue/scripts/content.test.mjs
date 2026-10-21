import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import MarkdownIt from 'markdown-it';
import { catalogueSources, compileCatalogue, contentDirectories, pageOutputPath } from '../content/catalogue.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const compiled = await compileCatalogue({ root });
const bySource = new Map(compiled.pages.map(page => [page.source, page]));
const strip = value => value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const plain = value => strip(new MarkdownIt().render(value));

test('every published Markdown source has its own page and canonical static output', async () => {
  assert.equal(compiled.pages.length, 54);
  assert.deepEqual([...bySource.keys()], await catalogueSources(root));
  assert.equal(new Set(compiled.pages.map(page => page.path)).size, compiled.pages.length);
  assert.equal(pageOutputPath('/'), 'index.html');
  assert.equal(pageOutputPath('/formats/horde/'), 'formats/horde/index.html');
  assert.equal(pageOutputPath('/formats/horde/variants/classic.html'), 'formats/horde/variants/classic.html');
  for (const page of compiled.pages) {
    assert.ok(page.html.length && page.text.length && page.title.length, page.source);
    assert.ok(!/README|AGENTS|\.playtest|tabletop/.test(page.source), page.source);
    assert.ok(!page.html.includes('<!--@include'), page.source);
  }
});

test('all included procedures survive, including material after each include', async () => {
  const partials = await readdir(join(root, 'apps/catalogue/content/partials'));
  for (const partial of partials) {
    const source = await readFile(join(root, 'apps/catalogue/content/partials', partial), 'utf8');
    const includedBy = [];
    for (const page of compiled.pages) {
      const markdown = await readFile(join(root, page.source), 'utf8');
      if (markdown.includes(`/partials/${partial}`)) includedBy.push(page);
    }
    assert.ok(includedBy.length, `${partial} is used`);
    for (const page of includedBy) {
      const paragraphTokens = new MarkdownIt().parse(source, {}).filter(token => token.type === 'inline');
      for (const paragraph of paragraphTokens) {
        const content = plain(paragraph.content);
        assert.ok(strip(page.html).includes(content), `${page.source} preserves ${partial}: ${content.slice(0, 60)}`);
      }
    }
  }
  assert.match(bySource.get('formats/big-deck/pile-o-magic/index.md').html, /Local rules still needing decisions/);
  assert.match(bySource.get('formats/archenemy/variants/standard.md').html, /Winning, losing, and leaving/);
});

test('source caveats, drafts, and full rules remain in the rendered articles', () => {
  const draft = bySource.get('boxed-sets/feudalism.md');
  assert.match(draft.html, /class="custom-block warning"/);
  assert.match(draft.html, /Draft — not yet a complete playable box/);
  assert.ok(draft.headings.some(heading => heading.id === 'replacement-rules-still-to-design'));
  const ambiguity = bySource.get('formats/bang-like/variants/kingdom-bang-edh.md');
  assert.match(ambiguity.html, /Source ambiguity: Rogue victory/);
  const notes = bySource.get('formats/horde/sources/original-horde-magic-quiet-speculation.md');
  assert.match(notes.html, /class="custom-block info"/);
  assert.match(notes.html, /Reference notes/);
  const jumpstart = bySource.get('formats/jumpstart/variants/two-packet.md');
  assert.ok(jumpstart.headings.some(heading => heading.id === 'winning-and-losing'));
  assert.ok(jumpstart.headings.some(heading => heading.id === 'reset-a-reusable-box'));
});

test('local links, source images and downloads work under a repository base', async () => {
  const base = '/sites.magical-game-night-gatherings/';
  const prefixed = await compileCatalogue({ root, base });
  const canonical = new Set(compiled.pages.map(page => page.path));
  for (const page of prefixed.pages) {
    for (const match of page.html.matchAll(/(?:href|src)="([^"]*)"/g)) {
      const value = match[1];
      if (/^(?:https?:|mailto:|#|\/\/)/.test(value)) continue;
      assert.ok(value.startsWith(base), `${page.source}: ${value}`);
      const target = decodeURIComponent(value.slice(base.length).split(/[?#]/)[0]);
      assert.ok(canonical.has(`/${target}`) || prefixed.assets.includes(target), `${page.source}: ${value}`);
    }
  }
  assert.deepEqual(prefixed.assets, compiled.assets);
  assert.ok(compiled.assets.includes('research/everyday-life/cards.csv'));
  assert.ok(compiled.assets.includes('research/everyday-life/cards.json'));
  assert.ok(compiled.assets.includes('research/everyday-life/searches.json'));
  assert.ok(compiled.assets.includes('formats/bang-like/sources/treachery-cards-oracle.json'));
  assert.ok(compiled.assets.includes('formats/big-deck/pile-o-magic/assets/four-color-gates/four-color-gates.webp'));
  assert.match(prefixed.pages.find(page => page.source === 'research/everyday-life/tokens.md').html,
    /marvel\.html#animals/);
  assert.match(prefixed.pages.find(page => page.source === 'formats/big-deck/pile-o-magic/index.md').html,
    /assets\/four-color-gates\/four-color-gates\.webp/);
});

async function fixture(t, index = '# Home\n') {
  const directory = await mkdtemp(join(tmpdir(), 'game-night-content-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const folder of contentDirectories) await mkdir(join(directory, folder));
  await writeFile(join(directory, 'index.md'), index);
  return directory;
}

test('heading IDs preserve punctuation, numeric headings and duplicate anchors', async t => {
  const directory = await fixture(t, '# Guide\n\n## 1. Setup\n\n## The Horde\'s turn\n\n## Café & rules\n\n## Setup\n\n## Setup\n');
  const { pages } = await compileCatalogue({ root: directory });
  assert.deepEqual(pages[0].headings.map(heading => heading.id), ['guide', '_1-setup', 'the-horde-s-turn', 'cafe-rules', 'setup', 'setup-1']);
});

test('broken pages or anchors fail the build instead of silently producing dead links', async t => {
  const directory = await fixture(t, '# Home\n\n[Missing](formats/missing.md)\n');
  await assert.rejects(compileCatalogue({ root: directory }), /Unknown local catalogue link/);
  await writeFile(join(directory, 'index.md'), '# Home\n\n[Missing section](#missing)\n');
  await assert.rejects(compileCatalogue({ root: directory }), /Unknown heading/);
});

test('private data and application files cannot become downloadable catalogue assets', async t => {
  const directory = await fixture(t, '# Home\n\n[Private](.playtest/current.json)\n');
  await mkdir(join(directory, '.playtest'));
  await writeFile(join(directory, '.playtest/current.json'), '{}');
  await assert.rejects(compileCatalogue({ root: directory }), /Unknown local catalogue link/);
  await writeFile(join(directory, 'index.md'), '# Home\n\n<!--@include:package.md-->\n');
  await writeFile(join(directory, 'package.md'), 'Private application notes');
  await assert.rejects(compileCatalogue({ root: directory }), /outside catalogue content/);
});
