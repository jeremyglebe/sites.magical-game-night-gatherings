import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const { values } = parseArgs({ options: {
  seat: { type: 'string' }, session: { type: 'string', default: '.playtest/table.json' },
  url: { type: 'string', default: 'http://127.0.0.1:5180' },
} });
if (!values.seat) throw new Error('Choose a player with --seat');
const credentials = JSON.parse(readFileSync(values.session, 'utf8')).credentials;
const token = Object.hasOwn(credentials, values.seat) ? credentials[values.seat] : null;
if (!token) throw new Error('Unknown player');

export async function requestTable(path, body) {
  const response = await fetch(new URL(path, values.url), {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10000),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || 'Table request failed');
  return value;
}

const object = properties => ({ type: 'object', properties, additionalProperties: false });
const string = { type: 'string' };
const tools = [
  {
    name: 'observe_table',
    description: 'Read the latest table, public zones, your private hand, counts, turn markers, and recent events. Your seat is fixed. Card rules text is fetched separately with read_card. Library/stack top is index 0. Game rules and legal timing are the players’ responsibility.',
    inputSchema: object({}),
  },
  {
    name: 'act',
    description: 'Apply an atomic batch of physical table changes using the revision from observe_table. No Magic effects, costs, triggers, turns, cleanup, or legality are automated. Wait for opponents’ response opportunities; batch only changes that require no intervening choice. A short reason is private to your seat in player views. Peek/reveal must be justified by the rules. Hidden/shuffled cards get new IDs; read the returned view. Counter/mana maps replace the previous map. Result is a player report, not a verified outcome.',
    inputSchema: {
      ...object({
        revision: { type: 'integer', minimum: 0 },
        reason: { type: 'string', minLength: 1, maxLength: 2000 },
        actions: {
          type: 'array', minItems: 1, maxItems: 30, items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['draw', 'move', 'shuffle', 'peek', 'reveal', 'card', 'player', 'turn', 'token', 'remove_token', 'stack_item', 'remove_stack_item', 'zone', 'note', 'result'] },
              card: { ...string, description: 'Visible card ID for move, card, reveal, remove_token, remove_stack_item.' },
              count: { type: 'integer', description: 'draw/peek/token quantity.' },
              from: { ...string, description: 'draw source zone; defaults to your library.' },
              to: { description: 'move/draw/token destination zone, or reveal recipient player IDs. Omit for a public reveal including spectators.', anyOf: [string, { type: 'array', items: string }] },
              position: { type: 'string', enum: ['top', 'bottom'], description: 'move insertion position; default bottom.' },
              zone: { ...string, description: 'shuffle or peek zone.' },
              player: { ...string, description: 'player action target; defaults to your seat.' },
              set: {
                type: 'object',
                description: 'card fields: tapped, face_down, face, damage, counters, controller, attached_to, note. player: life, counters, mana, note. turn: number, active, priority (player ID or null), phase. No fields change automatically.',
              },
              definition: { type: 'object', description: 'token or stack_item: name, type_line, oracle_text, optional mana_cost, power, toughness, Scryfall image_url. stack_item creates a triggered/activated ability at the top; remove_stack_item removes it after manual resolution.' },
              owner: { ...string, description: 'Token/custom zone owner.' },
              id: { ...string, description: 'New zone ID.' },
              visibility: { type: 'string', enum: ['public', 'owner', 'hidden'], description: 'New zone visibility.' },
              text: { ...string, description: 'Public note text, e.g. an agreed rule or temporary effect.' },
              winners: { type: 'array', items: string, description: 'result winner IDs, [] for draw.' },
              explanation: { ...string, description: 'result explanation.' },
            },
            required: ['type'], additionalProperties: false,
          },
        },
      }),
      required: ['revision', 'reason', 'actions'],
    },
  },
  {
    name: 'read_card',
    description: 'Get imported rules text and printing reference for one card whose identity you can currently see. Use the Scryfall MCP for missing or updated official card information.',
    inputSchema: { ...object({ id: string }), required: ['id'] },
  },
  {
    name: 'read_reference',
    description: 'List configured complete format/box rules (no path), search a reference (path + query), or read exact numbered lines (path + start/count, max 120). No summaries replace the source. This does not yet include the Comprehensive Rules.',
    inputSchema: object({ path: string, query: string, start: { type: 'integer' }, count: { type: 'integer' } }),
  },
];

const server = new Server({ name: 'game-night-tabletop-' + values.seat, version: '0.1.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
  try {
    const args = params.arguments || {};
    let result;
    switch (params.name) {
      case 'observe_table': result = await requestTable('/api/observe'); break;
      case 'act': result = await requestTable('/api/act', args); break;
      case 'read_card': result = await requestTable('/api/card?id=' + encodeURIComponent(args.id)); break;
      case 'read_reference': result = await requestTable('/api/references?' + new URLSearchParams(args)); break;
      default: throw new Error('Unknown tool');
    }
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  } catch (error) {
    return { isError: true, content: [{ type: 'text', text: error.message }] };
  }
});
await server.connect(new StdioServerTransport());
