import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
  assert(call.args.includes('mcp_servers.tabletop.enabled_tools=["observe_table","act","say","pass_priority","pass_turn","read_card","read_reference","read_events","read_rules","complete_decision"]'));
  assert(!call.args.join(' ').includes(connection.token));
  assert(!call.args.join(' ').includes('--session'));
  assert.equal(call.env.TABLETOP_PLAYER_TOKEN, connection.token);
  assert.equal(call.env.TABLETOP_DECISION_ID, request.decisionId);
  assert.equal(call.env.OPENAI_API_KEY, undefined);
  assert.equal(call.env.CODEX_THREAD_ID, undefined);
  assert.equal(call.env.CODEX_HOME, '/user/.codex');
});

test('initial and resumed prompts require explicit terminal handoffs and efficient public shortcuts', () => {
  const first = playerPrompt({ ...request, quickstart: 'An authored operational guide.' });
  assert.match(first, /An authored operational guide/);
  assert(!first.includes(connection.token));
  const resumed = playerPrompt({ ...request, sessionId: 'own-history', quickstart: 'An authored operational guide.' });
  assert(!resumed.includes('An authored operational guide.'));
  for (const prompt of [first, resumed]) {
    assert.match(prompt, /only one player runs at a time/);
    assert.match(prompt, /replaces any older broadcast instructions/);
    assert.match(prompt, /ordinary changes and public speech do not prompt other players/);
    assert.match(prompt, /Batch physical steps in act/);
    assert.match(prompt, /say\(\{revision,text\}\)/);
    assert.match(prompt, /Do not silently skip mandatory opponent choices/);
    assert.match(prompt, /request an earlier legal response point/);
    assert.match(prompt, /pass_turn\(\{revision,next,message\?\}\)/);
    assert.match(prompt, /TERMINAL for this decision/);
    assert.match(prompt, /Do not call complete_decision, observe, say, or any other tool after a successful handoff/);
    assert.match(prompt, /without a handoff pauses for operator intervention/);
    assert.match(prompt, /one opponent passing does not mean everyone passed/);
    assert(!prompt.includes('A quick no_op is normal'));
  }
  const setup = playerPrompt({ ...request, sessionId: 'own-history', view: { turn: { phase: 'Setup', priority: null } } });
  assert.match(setup, /ordinary priority has not started/);
  assert.match(setup, /prepare your own opening hand once/);
  assert.match(setup, /all seats have completed their initial draws before the first mulligan declaration round/);
  assert.match(setup, /declarations proceed in starting-player\/turn order/);
  assert.match(setup, /Complete every declaration for the current round BEFORE any player takes that round's mulligan/);
  assert.match(setup, /only after that stage is complete begin the next declaration round/);
  assert.match(setup, /Kept players no longer participate in later mulligan rounds/);
  assert.match(setup, /Do not finish all of one player's mulligans before others make their first declarations/);
  assert.match(setup, /Once everyone has kept, explicitly hand back to the starting player/);
  assert(!resumed.includes('Begin the configured game'));
});

test('every resume avoids empty-phase permission handoffs and counts the casting player pass', () => {
  const prompt = playerPrompt({ ...request, sessionId: 'existing-player-history' });
  assert.match(prompt, /stack is clear, and no opponent choice, pending trigger, or relevant response window remains/);
  assert.match(prompt, /perform required cleanup and use pass_turn directly/);
  assert.match(prompt, /Do not make a separate handoff solely to confirm every empty phase or ask permission to end your turn/);
  assert.match(prompt, /recipient can request an earlier legal response point/);
  assert.match(prompt, /Casting a spell followed by pass_priority already records the caster's pass; count it/);
  assert.match(prompt, /both have passed and resolution is due, without another pass from p1/);
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

test('resumed handoffs preserve full unseen event history and whole-turn land and pass tracking', () => {
  const prompt = playerPrompt({ ...request, sessionId: 'own-history', fromRevision: 14, revision: 20,
    turnHistory: { number: 1, active: 'p1', events: [{ revision: 7, actor: 'p1', summary: 'Plains played in Main1' }] },
  });
  assert.match(prompt, /Unseen events 14 through 20/);
  assert.match(prompt, /do not replay actions for individual historical events/);
  assert.match(prompt, /ONE land play across the entire turn/);
  assert.match(prompt, /another main phase does not reset/);
  assert.match(prompt, /Do not start another identical pass round/);
  assert.match(prompt, /Plains played in Main1/);
});

test('supplied basic adaptation is separate from MCP instructions without mislabeling its authorship', () => {
  const basicRules = 'Authored adaptation fixture. Source: supplied 2013 rulebook. Current updates and version stated here.';
  for (const sessionId of [null, 'older-history']) {
    const prompt = playerPrompt({ ...request, sessionId, quickstart: 'Authored control instructions.', basicRules });
    assert.match(prompt, /Supplied basic game guide \(source\/version inside; separate from the authored MCP tool guide\)/);
    assert(prompt.includes(basicRules));
    assert.equal(prompt.includes('Authored control instructions.'), !sessionId);
    assert.match(prompt, /Oracle text and available cached official rulings/);
    assert.match(prompt, /rulings_cache.status=fetched with rulings:\[\]/);
    assert.match(prompt, /not_fetched or missing cache metadata means unknown/);
    assert.match(prompt, /local read_rules with source basic; its included glossary can be searched by term/);
    assert(!prompt.includes('official basic game guide'));
    assert(!prompt.includes('source basic or glossary'));
    assert.match(prompt, /Only if those leave an unusual interaction or ambiguity unresolved/);
    assert.match(prompt, /Do not consult the Comprehensive Rules routinely on every move or read the entire document/);
  }
});

test('basic guide delivery persists once per seat, session and content hash across runner restarts', async t => {
  const workspaceRoot = temporary(t);
  const prompts = [];
  const original = 'Supplied basic rules fixture, original adaptation.';
  const updated = 'Supplied basic rules fixture, updated adaptation.';
  async function run(sessionId, responseId, basicRules = original, id = 'p1') {
    const runner = createCodexRunner({
      workspaceRoot, getConnection: () => connection, basicRules,
      spawnImpl: fakeSpawn((child, prompt) => {
        prompts.push(prompt);
        output(child, [{ type: 'thread.started', thread_id: responseId }, { type: 'turn.completed' }]);
      }),
    });
    return runner({ ...request, player: { ...request.player, id }, sessionId });
  }
  await run(null, 'new-history');
  await run('new-history', 'new-history');
  await run('old-history-without-guide', 'old-history-without-guide');
  await run('old-history-without-guide', 'old-history-without-guide');
  assert.deepEqual(prompts.map(p => p.includes(original)), [true, false, true, false]);
  await run('old-history-without-guide', 'old-history-without-guide', updated);
  await run('old-history-without-guide', 'old-history-without-guide', updated);
  assert.deepEqual(prompts.slice(-2).map(p => p.includes(updated)), [true, false]);
  await run(null, 'replacement-history', updated);
  await run('other-seat-history', 'other-seat-history', updated, 'p2');
  assert(prompts.at(-2).includes(updated), 'a genuinely new conversation receives the guide');
  assert(prompts.at(-1).includes(updated), 'another seat cannot inherit this seat delivery marker');
  const metadata = JSON.parse(readFileSync(join(workspaceRoot, 'p1', 'basic-rules-context.json'), 'utf8'));
  assert.equal(metadata.sessionId, 'replacement-history');
  assert.match(metadata.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(metadata).sort(), ['sessionId', 'sha256', 'version']);
  assert(!JSON.stringify(metadata).includes(updated));
});

test('failed CLI turns do not mark the basic guide as delivered, even after turn.completed output', async t => {
  const workspaceRoot = temporary(t);
  const basicRules = 'Supplied guide fixture requiring successful delivery.';
  const prompts = [];
  let fail = true;
  const runner = createCodexRunner({
    workspaceRoot, getConnection: () => connection, basicRules,
    spawnImpl: fakeSpawn((child, prompt) => {
      prompts.push(prompt);
      output(child, [{ type: 'thread.started', thread_id: 'existing-history' }, { type: 'turn.completed' }], fail ? 1 : 0);
    }),
  });
  await assert.rejects(runner({ ...request, sessionId: 'existing-history' }), /exited with code 1/);
  assert.equal(existsSync(join(workspaceRoot, 'p1', 'basic-rules-context.json')), false);
  fail = false;
  await runner({ ...request, sessionId: 'existing-history' });
  await runner({ ...request, sessionId: 'existing-history' });
  assert.deepEqual(prompts.map(p => p.includes(basicRules)), [true, true, false]);
});

test('runner parses split JSON events and reports cumulative session usage without storing transcripts', async t => {
  const capture = {}, sessions = [], usages = [], usageMetadata = [];
  const runner = createCodexRunner({
    workspaceRoot: temporary(t), getConnection: () => connection,
    spawnImpl: fakeSpawn((child, prompt) => {
      capture.prompt = prompt;
      child.stdout.write('{"type":"thread.');
      child.stdout.write('started","thread_id":"own-history"}\n');
      output(child, [{ type: 'turn.completed', usage: { input_tokens: 21, output_tokens: 3 } }]);
    }, capture),
  });
  const result = await runner({ ...request, onSession: id => sessions.push(id), onUsage: (usage, metadata) => { usages.push(usage); usageMetadata.push(metadata); } });
  assert.deepEqual(result, { sessionId: 'own-history' });
  assert.deepEqual(sessions, ['own-history']);
  assert.equal(usages[0].output_tokens, 3);
  assert.deepEqual(usageMetadata, [{ scope: 'session', sessionId: 'own-history' }]);
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
