import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { codexInvocation, createCodexRunner, playerPrompt } from './codex-player.mjs';

const connection = { url: 'http://127.0.0.1:1234', token: 'private-seat-token' };
const request = {
  player: { id: 'p1', name: 'Player one', model: 'gpt-6-luna', reasoning: 'high' },
  sessionId: null, decisionId: 'decision-p1', revision: 1,
  view: { revision: 2, hand: ['My own card'] }, events: [{ revision: 1, summary: 'A visible move' }],
  signal: new AbortController().signal,
};
function fakeSpawn(handler, capture = {}) {
  return (bin, args, options) => {
    Object.assign(capture, { bin, args, options });
    const child = new EventEmitter();
    child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    let prompt = '';
    child.stdin.on('data', data => { prompt += data; });
    child.stdin.on('finish', () => queueMicrotask(() => handler(child, prompt)));
    child.kill = signal => { capture.killed = signal; queueMicrotask(() => child.emit('close', null)); };
    return child;
  };
}
function output(child, events, code = 0) {
  for (const event of events) child.stdout.write(JSON.stringify(event) + '\n');
  child.emit('close', code);
}
function temporary(t) {
  const path = mkdtempSync(join(tmpdir(), 'tabletop-player-'));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
}

test('invocation uses explicit session, isolated workspace, restricted tools and seat-only environment', () => {
  const call = codexInvocation({
    ...request, sessionId: 'own-history', workspace: '/tmp/seat-p1', connection,
    baseEnv: { HOME: '/user', PATH: '/bin', CODEX_HOME: '/user/.codex', OPENAI_API_KEY: 'unrelated-secret', CODEX_THREAD_ID: 'parent-thread' },
  });
  assert.deepEqual(call.args.slice(0, 3), ['exec', 'resume', 'own-history']);
  assert(!call.args.includes('--last'));
  assert(call.args.includes('--ignore-user-config'));
  assert(call.args.includes('features.shell_tool=false'));
  assert(call.args.includes('tools.view_image=false'));
  assert(call.args.includes('features.multi_agent=false'));
  assert(call.args.includes('forced_login_method="chatgpt"'));
  assert(call.args.includes('memories.use_memories=false'));
  assert(call.args.includes('mcp_servers.tabletop.required=true'));
  assert(call.args.includes('approval_policy="never"'));
  assert(call.args.includes('sandbox_mode="read-only"'));
  assert(call.args.includes('mcp_servers.tabletop.default_tools_approval_mode="approve"'));
  assert(call.args.includes('mcp_servers.tabletop.enabled_tools=["observe_table","act","read_card","read_reference","read_events","read_rules","complete_decision"]'));
  assert(!call.args.join(' ').includes(connection.token));
  assert(!call.args.join(' ').includes('--session'));
  assert.equal(call.env.TABLETOP_PLAYER_TOKEN, connection.token);
  assert.equal(call.env.TABLETOP_DECISION_ID, request.decisionId);
  assert.equal(call.env.OPENAI_API_KEY, undefined);
  assert.equal(call.env.CODEX_THREAD_ID, undefined);
  assert.equal(call.env.CODEX_HOME, '/user/.codex');
});

test('prompt clearly separates notifications, no-op and passes; quickstart is initial-only', () => {
  const first = playerPrompt({ ...request, quickstart: 'A brief verified introduction.' });
  assert.match(first, /notification is information/);
  assert.match(first, /Passing priority is different/);
  assert.match(first, /A brief verified introduction/);
  assert.match(first, /CURRENT state/);
  assert.match(first, /prepare your own opening hand once/);
  const resumed = playerPrompt({ ...request, sessionId: 'own-history', quickstart: 'A brief verified introduction.' });
  assert(!resumed.includes('A brief verified introduction.'));
  assert.match(resumed, /current table may already be newer/);
  assert(!first.includes(connection.token));
  const setup = playerPrompt({ ...request, sessionId: 'own-history', view: { turn: { phase: 'Setup', priority: null } } });
  assert.match(setup, /ordinary priority has not started/);
  assert.match(setup, /Prepare your own opening hand once/);
  assert.match(setup, /starting player coordinates the first turn after everyone is ready/);
  assert(!resumed.includes('Begin the configured game'));
});

test('new and resumed sessions distinguish optional overrides and hidden libraries from missing setup', () => {
  for (const sessionId of [null, 'existing-player-history']) {
    for (const phase of ['Setup', 'Upkeep']) {
      const prompt = playerPrompt({
        ...request, sessionId, view: {
          turn: { phase, active: 'p1', priority: null },
          zones: { 'p1:library': { count: 60, cards: [], visibility: 'hidden' } },
        },
      });
      assert.match(prompt, /empty paths list means no custom overrides/);
      assert.match(prompt, /ordinary casual Magic with the supplied decks and life totals/);
      assert.match(prompt, /not a sanctioned Standard deck-legality check/);
      assert.match(prompt, /count:60 and cards:\[\] contains 60 real cards/);
      assert.match(prompt, /Drawing does not require card IDs/);
      assert.match(prompt, /\{"type":"draw","count":7\}/);
      assert.match(prompt, /earlier decision reported needs_help/);
      assert.match(prompt, /Do not peek or reveal a library/);
    }
  }
});

test('runner parses split JSON events and reports session and usage without storing transcripts', async t => {
  const capture = {}, sessions = [], usages = [];
  const runner = createCodexRunner({
    workspaceRoot: temporary(t), getConnection: () => connection,
    spawnImpl: fakeSpawn((child, prompt) => {
      capture.prompt = prompt;
      child.stdout.write('{"type":"thread.');
      child.stdout.write('started","thread_id":"own-history"}\n');
      output(child, [{ type: 'turn.completed', usage: { input_tokens: 21, output_tokens: 3 } }]);
    }, capture),
  });
  const result = await runner({ ...request, onSession: id => sessions.push(id), onUsage: usage => usages.push(usage) });
  assert.deepEqual(result, { sessionId: 'own-history' });
  assert.deepEqual(sessions, ['own-history']);
  assert.equal(usages[0].output_tokens, 3);
  assert.equal(capture.options.shell, false);
  assert(capture.options.cwd.endsWith('/p1'));
  assert.match(capture.prompt, /My own card/);
});

test('runner rejects session crossover and unavailable models without retrying', async t => {
  let count = 0;
  const runner = createCodexRunner({
    workspaceRoot: temporary(t), getConnection: () => connection,
    spawnImpl: fakeSpawn(child => {
      count++;
      output(child, [{ type: 'thread.started', thread_id: 'someone-else' }]);
    }),
  });
  await assert.rejects(runner({ ...request, sessionId: 'own-history' }), /different player session/);
  assert.equal(count, 1);
  const unavailable = createCodexRunner({
    workspaceRoot: temporary(t), getConnection: () => connection,
    spawnImpl: fakeSpawn(child => output(child, [{ type: 'error', message: 'Selected model unavailable' }], 1)),
  });
  await assert.rejects(unavailable(request), /Selected model unavailable/);
});

test('stderr diagnostics redact credentials and cancellation kills the subprocess', async t => {
  const failure = createCodexRunner({
    workspaceRoot: temporary(t), getConnection: () => connection,
    spawnImpl: fakeSpawn(child => { child.stderr.write(`bad ${connection.token} ${request.decisionId}`); child.emit('close', 1); }),
  });
  await assert.rejects(failure(request), error => !error.message.includes(connection.token) && !error.message.includes(request.decisionId));
  const capture = {};
  const abort = new AbortController();
  const hanging = createCodexRunner({
    workspaceRoot: temporary(t), getConnection: () => connection,
    spawnImpl: fakeSpawn(() => abort.abort(new Error('Operator paused')), capture),
  });
  await assert.rejects(hanging({ ...request, signal: abort.signal }), /Operator paused/);
  assert.equal(capture.killed, 'SIGTERM');
});
