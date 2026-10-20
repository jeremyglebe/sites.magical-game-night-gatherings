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
let token = process.env.TABLETOP_PLAYER_TOKEN;
// Managed players receive one token; reading a complete administrator session
// remains available only for the original manual MCP startup workflow.
if (!token) {
  const credentials = JSON.parse(readFileSync(values.session, 'utf8')).credentials;
  token = Object.hasOwn(credentials, values.seat) ? credentials[values.seat] : null;
}
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
    description: 'Read the latest table, public zones, your private hand, counts, turn markers, and recent events. Your seat is fixed. Use read_events for complete unseen history. Read the latest state before acting on a queued notification. Card rules text is fetched separately with read_card. Library/stack top is index 0. Game rules and legal timing are the players’ responsibility.',
    inputSchema: object({}),
  },
  {
    name: 'act',
    description: 'Apply an atomic batch of physical table changes using the revision from observe_table. No Magic effects, costs, triggers, turns, cleanup, or legality are automated. Wait for opponents’ response opportunities; batch only changes that require no intervening choice. Use pass with next player for an actual priority pass. If you have nothing to do, use complete_decision(no_op), never a note or turn update. A short reason is private to your seat in player views. Peek/reveal must be justified by the rules. Hidden/shuffled cards get new IDs; read the returned view. Counter/mana maps replace the previous map. Result is a player report, not a verified outcome.',
    inputSchema: {
      ...object({
        revision: { type: 'integer', minimum: 0 },
        reason: { type: 'string', minLength: 1, maxLength: 2000 },
        actions: {
          type: 'array', minItems: 1, maxItems: 30, items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['draw', 'move', 'shuffle', 'peek', 'reveal', 'card', 'player', 'turn', 'pass', 'token', 'remove_token', 'stack_item', 'remove_stack_item', 'zone', 'note', 'result'] },
              card: { ...string, description: 'Visible card ID for move, card, reveal, remove_token, remove_stack_item.' },
              count: { type: 'integer', description: 'draw/peek/token quantity.' },
              from: { ...string, description: 'draw source zone; defaults to your library.' },
              to: { description: 'move/draw/token destination zone, or reveal recipient player IDs. Omit for a public reveal including spectators.', anyOf: [string, { type: 'array', items: string }] },
              position: { type: 'string', enum: ['top', 'bottom'], description: 'move insertion position; default bottom.' },
              zone: { ...string, description: 'shuffle or peek zone.' },
              player: { ...string, description: 'player action target; defaults to your seat.' },
              next: { ...string, description: 'Required for pass: next player receiving priority, chosen according to the rules. A pass is recorded even when the board is unchanged.' },
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
  {
    name: 'read_events',
    description: 'Read every visible game event after a revision, in order, including explicit passes. Contains card names only when visible to your seat at that event. Historical card handles are not current handles; use observe_table for actions. Keep the returned revision as your history cursor.',
    inputSchema: object({ since: { type: 'integer', minimum: 0 } }),
  },
  {
    name: 'read_rules',
    description: 'List available rules sources, read the bundled quickstart/table protocol, or search/read an administrator-provided official Comprehensive Rules TXT. Use source quickstart or comprehensive; query searches text, rule locates a numbered rule, start/count reads numbered lines (max 120). Catalogue variants remain in read_reference. Missing comprehensive text is reported explicitly; do not invent a ruling.',
    inputSchema: object({
      source: { type: 'string', enum: ['quickstart', 'comprehensive'] },
      query: string, rule: string, start: { type: 'integer', minimum: 1 },
      count: { type: 'integer', minimum: 1, maximum: 120 },
    }),
  },
  {
    name: 'complete_decision',
    description: 'Finish processing this notification: no_op when no action is currently appropriate, acted after a completed action/pass, or needs_help for a rules dispute or blocker. This does not change the table or broadcast an event. It is NOT a priority pass. Never send a game note merely to acknowledge an update.',
    inputSchema: {
      ...object({
        status: { type: 'string', enum: ['no_op', 'acted', 'needs_help'] },
        note: { type: 'string', maxLength: 2000 },
      }),
      required: ['status'],
    },
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
      case 'act':
        result = await requestTable('/api/act', {
          ...args,
          ...(process.env.TABLETOP_DECISION_ID ? { decision_id: process.env.TABLETOP_DECISION_ID } : {}),
        });
        break;
      case 'read_card': result = await requestTable('/api/card?id=' + encodeURIComponent(args.id)); break;
      case 'read_reference': result = await requestTable('/api/references?' + new URLSearchParams(args)); break;
      case 'read_events': result = await requestTable('/api/events?' + new URLSearchParams(args)); break;
      case 'read_rules': result = await requestTable('/api/rules?' + new URLSearchParams(args)); break;
      case 'complete_decision':
        result = await requestTable('/api/decision', {
          status: args.status, ...(args.note !== undefined ? { note: args.note } : {}),
          ...(process.env.TABLETOP_DECISION_ID ? { decision_id: process.env.TABLETOP_DECISION_ID } : {}),
        });
        break;
      default: throw new Error('Unknown tool');
    }
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  } catch (error) {
    return { isError: true, content: [{ type: 'text', text: error.message }] };
  }
});
await server.connect(new StdioServerTransport());
