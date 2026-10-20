import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const officialRulesURL = 'https://magic.wizards.com/en/rules';
export const defaultRulesPath = fileURLToPath(new URL('../../.playtest/rules/ComprehensiveRules.txt', import.meta.url));
export const defaultBasicRulesPath = fileURLToPath(new URL('./basic-rules.txt', import.meta.url));
const quickstartURL = new URL('./quickstart.md', import.meta.url);

function positive(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = value === undefined || value === null || value === '' ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) throw new Error('Invalid rules line range');
  return parsed;
}

// Only the administrator chooses the comprehensive text path. Player requests
// select a named source and cannot read arbitrary local files.
export function readRules(options = {}, { comprehensivePath = process.env.TABLETOP_COMPREHENSIVE_RULES || defaultRulesPath, basicPath = defaultBasicRulesPath } = {}) {
  const available = Boolean(comprehensivePath && existsSync(comprehensivePath));
  const sources = [
    { source: 'quickstart', title: 'Table and MCP tool guide', available: true },
    { source: 'comprehensive', title: 'Magic: The Gathering Comprehensive Rules', available, source_url: officialRulesURL },
    { source: 'basic', title: 'Basic game rules — adapted and updated from the Wizards basic rulebook', available: Boolean(basicPath && existsSync(basicPath)) },
  ];
  if (!options.source) return {
    sources,
    note: 'Use basic for ordinary gameplay and quickstart for table/MCP controls. Read exact card text and available cached rulings through read_card. Search comprehensive only for unresolved rules questions; do not read it on every move. All these lookups are local. Run node experiments/tabletop/sync-rules.mjs only to explicitly refresh the official Comprehensive Rules TXT. Matches pin their own rules copies.',
  };
  if (!['quickstart', 'basic', 'comprehensive'].includes(options.source)) throw new Error('Unknown rules source');
  if (options.source === 'basic' && (!basicPath || !existsSync(basicPath))) throw new Error('The local basic game guide is unavailable');
  if (options.source === 'comprehensive' && !available) {
    throw new Error('Comprehensive Rules are not configured. Ask the administrator to run node experiments/tabletop/sync-rules.mjs or supply the official TXT from ' + officialRulesURL + ' via TABLETOP_COMPREHENSIVE_RULES. Do not invent a ruling.');
  }
  const text = readFileSync(options.source === 'quickstart' ? quickstartURL : options.source === 'basic' ? basicPath : comprehensivePath, 'utf8').replace(/^\uFEFF/, '');
  if (options.source === 'comprehensive' && !/^Magic: The Gathering Comprehensive Rules/m.test(text)) {
    throw new Error('The configured file is not recognized as the official Comprehensive Rules TXT');
  }
  const lines = text.split(/\r?\n/);
  const metadata = {
    source: options.source, total_lines: lines.length,
    ...(options.source === 'comprehensive' ? {
      source_url: officialRulesURL,
      effective: lines.slice(0, 30).find(line => /effective as of/i.test(line)) || 'Effective date not found in supplied file',
    } : {}),
  };
  const count = positive(options.count, 80, 120);
  let start = positive(options.start, 1);
  if (options.query !== undefined) {
    if (typeof options.query !== 'string' || !options.query.trim() || options.query.length > 200) throw new Error('Supply a nonempty rules query up to 200 characters');
    const query = options.query.toLowerCase();
    const matches = lines.map((line, i) => ({ line: i + 1, text: line }))
      .filter(line => line.line >= start && line.text.toLowerCase().includes(query));
    return {
      ...metadata, query: options.query, matches: matches.slice(0, count), remaining_matches: Math.max(0, matches.length - count),
      ...(matches.length > count ? { next_start: matches[count - 1].line + 1 } : {}),
    };
  }
  if (options.rule !== undefined) {
    if (options.source !== 'comprehensive') throw new Error('Numbered rule lookup is for the Comprehensive Rules; search the basic guide with query');
    if (typeof options.rule !== 'string' || !/^\d{3}(?:\.\d+[a-z]?)?\.?$/.test(options.rule)) throw new Error('Supply a rule number such as 117.3 or 704.5a');
    const rule = options.rule.replace(/\.$/, '');
    // The contents list repeats section headings. Prefer the last exact section
    // heading, which is the body, while subrules normally occur only once.
    const pattern = new RegExp('^' + rule.replace('.', '\\.') + (rule.includes('.') ? '(?:\\.|\\s)' : '\\.\\s'));
    const positions = lines.map((line, i) => pattern.test(line) ? i : -1).filter(i => i >= 0);
    if (!positions.length) throw new Error('Rule number not found in supplied source');
    start = positions.at(-1) + 1;
  }
  const selected = lines.slice(start - 1, start - 1 + count);
  return {
    ...metadata, start, text: selected.map((line, i) => `${start + i}: ${line}`).join('\n'),
    ...(start - 1 + selected.length < lines.length ? { next_start: start + selected.length } : {}),
  };
}
