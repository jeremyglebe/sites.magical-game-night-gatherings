import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRules } from './rules.mjs';
import { syncRules } from './sync-rules.mjs';

test('quickstart is available without a comprehensive file and distinguishes no-op from pass', () => {
  const options = { comprehensivePath: null };
  const catalog = readRules({}, options);
  assert.equal(catalog.sources[0].available, true);
  assert.equal(catalog.sources[1].available, false);
  const source = readRules({ source: 'quickstart', count: 120 }, options);
  assert.match(source.text, /complete_decision/);
  assert.match(source.text, /no_op/);
  assert.match(source.text, /passed|pass priority/);
  assert.match(source.text, /mulligan/);
  assert.throws(() => readRules({ source: 'comprehensive' }, options), /not configured/);
  assert.throws(() => readRules({ source: '../../package.json' }, options), /Unknown rules source/);
});

test('explicit rules refresh follows the official TXT link and saves verified provenance', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tabletop-rules-sync-'));
  const content = [
    'Magic: The Gathering Comprehensive Rules',
    'These rules are effective as of Test Date.',
    '117. Timing and Priority',
    '704. State-Based Actions',
  ].join('\n');
  const calls = [];
  try {
    const path = join(dir, 'rules', 'ComprehensiveRules.txt');
    const result = await syncRules({
      path,
      fetchImpl: async url => {
        calls.push(url);
        if (url === 'https://magic.wizards.com/en/rules') return new Response('<a href="https://media.wizards.com/2026/downloads/MagicCompRules Test.txt">TXT</a>');
        return new Response(content);
      },
    });
    assert.equal(calls[1], 'https://media.wizards.com/2026/downloads/MagicCompRules%20Test.txt');
    assert.equal(readFileSync(path, 'utf8'), content);
    const metadata = JSON.parse(readFileSync(path + '.json', 'utf8'));
    assert.equal(metadata.source_url, calls[1]);
    assert.equal(metadata.sha256, createHash('sha256').update(content).digest('hex'));
    assert.equal(result.effective, 'These rules are effective as of Test Date.');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rules refresh refuses nonofficial download hosts and invalid text without replacing an existing cache', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tabletop-rules-invalid-'));
  try {
    const path = join(dir, 'ComprehensiveRules.txt');
    writeFileSync(path, 'existing pinned source');
    await assert.rejects(() => syncRules({
      path, fetchImpl: async () => new Response('<a href="https://example.com/MagicCompRules.txt">TXT</a>'),
    }), /official HTTPS Wizards/);
    let calls = 0;
    await assert.rejects(() => syncRules({
      path,
      fetchImpl: async () => ++calls === 1
        ? new Response('<a href="https://media.wizards.com/MagicCompRules.txt">TXT</a>')
        : new Response('<html>server error</html>'),
    }), /not recognized/);
    assert.equal(readFileSync(path, 'utf8'), 'existing pinned source');
    assert.equal(existsSync(path + '.json'), false);
    await assert.rejects(() => syncRules({
      path, fetchImpl: async () => new Response('', { status: 302, headers: { location: 'https://example.com/' } }),
    }), /official HTTPS Wizards/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('official local text supports exact sections, subrules, paged searches, and numbered line reads', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tabletop-rules-'));
  try {
    const path = join(dir, 'rules.txt');
    writeFileSync(path, [
      'Magic: The Gathering Comprehensive Rules', 'These rules are effective as of Test Date.',
      'Contents', '117. Timing and Priority', '',
      '117. Timing and Priority', '117.1. Test priority text.', '117.3. Test active player text.',
      '117.3a Test priority subrule.', '117.30. Different rule.', '118. Costs',
    ].join('\r\n'));
    const options = { comprehensivePath: path };
    assert.equal(readRules({}, options).sources[1].available, true);
    const section = readRules({ source: 'comprehensive', rule: '117', count: 2 }, options);
    assert.equal(section.start, 6);
    assert.match(section.text, /^6: 117\. Timing/);
    assert.match(section.effective, /Test Date/);
    assert.equal(readRules({ source: 'comprehensive', rule: '117.3', count: 1 }, options).start, 8);
    assert.equal(readRules({ source: 'comprehensive', rule: '117.3a', count: 1 }, options).start, 9);
    const search = readRules({ source: 'comprehensive', query: 'priority', count: 2 }, options);
    assert.equal(search.matches.length, 2);
    assert.ok(search.remaining_matches > 0);
    const rest = readRules({ source: 'comprehensive', query: 'priority', start: search.next_start }, options);
    assert.ok(rest.matches.every(match => match.line >= search.next_start));
    assert.throws(() => readRules({ source: 'comprehensive', count: 121 }, options), /Invalid rules line range/);
    assert.throws(() => readRules({ source: 'comprehensive', query: '' }, options), /nonempty/);
    assert.throws(() => readRules({ source: 'comprehensive', rule: '999.999' }, options), /not found/);
    writeFileSync(path, '<html>not the official text</html>');
    assert.throws(() => readRules({ source: 'comprehensive' }, options), /not recognized/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
