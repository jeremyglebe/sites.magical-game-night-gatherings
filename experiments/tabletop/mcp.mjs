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
const revision = { type: 'integer', minimum: 0 };
const speech = { type: 'string', minLength: 1, maxLength: 2000, description: 'Public words spoken to the table, never private reasoning or hidden strategy.' };
const tools = [
  {
    name: 'observe_table',
    description: 'Read the latest table, public zones, your private hand, counts, turn markers, and recent events. Each zone count is its actual number of cards; cards lists only objects visible to you, and hidden_count counts the omitted objects. A library with count:60, hidden_count:60, cards:[] is a loaded hidden deck, NOT an empty or missing deck. Draw from it through act without knowing card IDs. Your seat is fixed. Use read_events for complete unseen history. Read the latest state before acting on a queued notification. Card rules text is fetched separately with read_card. Library/stack top is index 0. Game rules and legal timing are the players’ responsibility.',
    inputSchema: object({}),
  },
  {
    name: 'act',
    description: 'Apply an atomic batch of physical table changes using the revision from observe_table. To draw an opening hand, actions:[{type:"draw",count:7}] draws real cards from your hidden library into your private hand; no card IDs or deck inspection are needed. No Magic effects, costs, triggers, cleanup, untaps, draws, or legality are automated. Batch only changes that require no intervening choice. Ordinary changes and speech do not wake another player. End your decision with pass_priority or pass_turn to explicitly hand control to the next player. A batch may instead end with one pass/pass_turn action; that handoff must be last and completes a managed decision. Do not call complete_decision after a handoff. A short reason is private to your seat; do not provide private chain-of-thought. say text and handoff messages are public table speech. Peek/reveal must be justified by the rules. Hidden/shuffled cards get new IDs; read the returned view. Counter/mana maps replace the previous map. Result is a player report, not a verified outcome.',
    inputSchema: {
      ...object({
        revision,
        reason: { type: 'string', minLength: 1, maxLength: 2000 },
        actions: {
          type: 'array', minItems: 1, maxItems: 30, items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['draw', 'move', 'shuffle', 'peek', 'reveal', 'card', 'player', 'turn', 'pass', 'pass_turn', 'say', 'token', 'remove_token', 'stack_item', 'remove_stack_item', 'zone', 'note', 'result'] },
              card: { ...string, description: 'Visible card ID for move, card, reveal, remove_token, remove_stack_item.' },
              count: { type: 'integer', description: 'draw/peek/token quantity.' },
              from: { ...string, description: 'draw source zone; defaults to your library.' },
              to: { description: 'move/draw/token destination zone, or reveal recipient player IDs. Omit for a public reveal including spectators.', anyOf: [string, { type: 'array', items: string }] },
              position: { type: 'string', enum: ['top', 'bottom'], description: 'move insertion position; default bottom.' },
              zone: { ...string, description: 'shuffle or peek zone.' },
              player: { ...string, description: 'player action target; defaults to your seat.' },
              next: { ...string, description: 'Required for pass/pass_turn: next player, chosen according to the rules. Exactly one handoff may end a batch, and it completes a managed decision even if the board is unchanged.' },
              message: speech,
              number: { type: 'integer', minimum: 1, description: 'pass_turn turn number; defaults to current number + 1.' },
              phase: { type: 'string', maxLength: 100, description: 'pass_turn phase marker; defaults to Untap. Does not untap cards or carry out the phase.' },
              set: {
                type: 'object',
                description: 'card fields: tapped, face_down, face, damage, counters, controller, attached_to, note. player: life, counters, mana, note. turn: number, active, priority (player ID or null), phase. No fields change automatically.',
              },
              definition: { type: 'object', description: 'token or stack_item: name, type_line, oracle_text, optional mana_cost, power, toughness, Scryfall image_url. stack_item creates a triggered/activated ability at the top; remove_stack_item removes it after manual resolution.' },
              owner: { ...string, description: 'Token/custom zone owner.' },
              id: { ...string, description: 'New zone ID.' },
              visibility: { type: 'string', enum: ['public', 'owner', 'hidden'], description: 'New zone visibility.' },
              text: { ...string, description: 'say: public table speech, never private reasoning. note: an agreed rule or temporary effect.' },
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
    name: 'say',
    description: 'Speak in plain language to the table. This is public dialogue attributed to your player, not private chain-of-thought. It records speech without changing priority or waking another player. You still hold control; continue your actions or end with an explicit pass_priority/pass_turn handoff.',
    inputSchema: { ...object({ revision, text: speech }), required: ['revision', 'text'] },
  },
  {
    name: 'pass_priority',
    description: 'Explicitly pass priority and hand control to next. Optional message is public table speech. This is an atomic final pass action and completes your managed decision; stop after it succeeds, without complete_decision or further actions. It changes only the priority marker and records the handoff; players apply the rules themselves.',
    inputSchema: { ...object({ revision, next: string, message: speech }), required: ['revision', 'next'] },
  },
  {
    name: 'pass_turn',
    description: 'Explicitly hand the next turn and control to next after completing required cleanup yourself. Sets active and priority to next, turn number to current + 1 unless number is supplied, and phase to Untap unless supplied. It does not untap, draw, resolve effects, or apply rules. Optional message is public table speech. Completes your managed decision; stop after success without complete_decision or further actions.',
    inputSchema: { ...object({
      revision, next: string, message: speech,
      number: { type: 'integer', minimum: 1 }, phase: { type: 'string', maxLength: 100 },
    }), required: ['revision', 'next'] },
  },
  {
    name: 'read_card',
    description: 'Get locally cached Oracle text, printing reference and available official Scryfall rulings for a card whose identity you can see. rulings_cache.status fetched with rulings:[] means checked and no official rulings; not_fetched means unavailable, not none. Reuse known card text and rulings rather than reading them every move. No web request is made. Missing card information needs host import/refresh.',
    inputSchema: { ...object({ id: string }), required: ['id'] },
  },
  {
    name: 'read_reference',
    description: 'List optional format/box rule overrides (no path), search a selected reference (path + query), or read exact numbered lines (path + start/count, max 120). An empty paths list means ordinary Magic with the supplied decks and starting state; no custom rules were selected, and play can begin. General Magic basic rules, the table/MCP guide, and targeted Comprehensive Rules lookup are available through read_rules. No summaries replace a configured source.',
    inputSchema: object({ path: string, query: string, start: { type: 'integer' }, count: { type: 'integer' } }),
  },
  {
    name: 'read_events',
    description: 'Read every visible game event after a revision, in order, including explicit passes. Contains card names only when visible to your seat at that event. Historical card handles are not current handles; use observe_table for actions. Keep the returned revision as your history cursor.',
    inputSchema: object({ since: { type: 'integer', minimum: 0 } }),
  },
  {
    name: 'read_rules',
    description: 'Read local rules: basic is the ordinary game guide (including instants, responses, stack and common keywords); quickstart is the separate table/MCP guide; comprehensive is the full official rules for targeted unresolved questions. Use the basic guide already supplied in context for routine play, and read_card for exact text/available card rulings; do not search the Comprehensive Rules on every action. query searches text; rule locates a numbered Comprehensive rule; start/count reads numbered lines (max 120). No web requests. Format/box variants remain in read_reference. Missing sources are reported explicitly.',
    inputSchema: object({
      source: { type: 'string', enum: ['quickstart', 'basic', 'comprehensive'] },
      query: string, rule: string, start: { type: 'integer', minimum: 1 },
      count: { type: 'integer', minimum: 1, maximum: 120 },
    }),
  },
  {
    name: 'complete_decision',
    description: 'Finish without handing control to another player: no_op when no action is appropriate, acted for completed bookkeeping without a handoff, or needs_help for a rules dispute or blocker. This does not change the table or wake another player. Normal play continues through pass_priority/pass_turn; those already complete your managed decision, so do not call this afterward. Never send a game note merely to acknowledge an update.',
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
      case 'say':
      case 'pass_priority':
      case 'pass_turn': {
        const action = params.name === 'say' ? { type: 'say', text: args.text }
          : { type: params.name === 'pass_priority' ? 'pass' : 'pass_turn', next: args.next,
            ...(args.message !== undefined ? { message: args.message } : {}),
            ...(params.name === 'pass_turn' && args.number !== undefined ? { number: args.number } : {}),
            ...(params.name === 'pass_turn' && args.phase !== undefined ? { phase: args.phase } : {}),
          };
        result = await requestTable('/api/act', {
          revision: args.revision, actions: [action],
          reason: params.name === 'say' ? 'Public table speech' : 'Explicit player handoff',
          ...(process.env.TABLETOP_DECISION_ID ? { decision_id: process.env.TABLETOP_DECISION_ID } : {}),
        });
        break;
      }
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
