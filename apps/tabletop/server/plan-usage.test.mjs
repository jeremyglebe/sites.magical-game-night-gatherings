import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { readCodexPlanUsage } from './plan-usage.mjs';

function fakeServer(result, { silent = false, ignoreTerm = false, rpcError = false, malformed = false } = {}) {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  const messages = [], signals = [];
  let invocation;
  let input = '';
  child.kill = signal => {
    signals.push(signal);
    if (!ignoreTerm || signal === 'SIGKILL') queueMicrotask(() => child.emit('close', 0));
    return true;
  };
  child.stdin.on('data', chunk => {
    input += chunk.toString();
    let newline;
    while ((newline = input.indexOf('\n')) >= 0) {
      const message = JSON.parse(input.slice(0, newline));
      input = input.slice(newline + 1);
      messages.push(message);
      if (silent || message.id === undefined) continue;
      queueMicrotask(() => {
        if (malformed) { child.stdout.write('broken JSON\n'); return; }
        if (message.id === 1) child.stdout.write(JSON.stringify({ id: 1, result: { userAgent: 'fixture', codexHome: '/private/ignored' } }) + '\n');
        else {
          const response = rpcError
            ? { id: 2, error: { message: 'private account/token details', code: -32000 } }
            : { id: 2, result };
          const text = JSON.stringify(response) + '\n';
          child.stdout.write(text.slice(0, 8));
          child.stdout.write(text.slice(8));
        }
      });
    }
  });
  return {
    child, messages, signals,
    spawnImpl(bin, args, options) { invocation = { bin, args, options }; return child; },
    invocation: () => invocation,
  };
}

test('usage reader handshakes, reads only limits, sanitizes buckets and preserves unavailable windows', async () => {
  const fake = fakeServer({
    rateLimits: { primary: { usedPercent: 99, windowDurationMins: 300 } },
    rateLimitsByLimitId: {
      codex: {
        limitId: 'codex', limitName: 'Codex', credits: { balance: 'private' },
        primary: { usedPercent: 125, windowDurationMins: 300, resetsAt: 1900000000, privateField: true },
        secondary: { usedPercent: null, windowDurationMins: 10080, resetsAt: null },
      },
      light: {
        limitName: null,
        primary: { usedPercent: -3, windowDurationMins: null, resetsAt: null },
        secondary: { usedPercent: 12.5, windowDurationMins: '10080', resetsAt: -1 },
      },
      unknown: { primary: null, secondary: { usedPercent: '0' } },
    },
  });
  const usage = await readCodexPlanUsage({
    codexBin: '/fixture/codex', spawnImpl: fake.spawnImpl,
    baseEnv: { PATH: '/bin', HOME: '/fixture', CODEX_HOME: '/fixture/.codex', OPENAI_API_KEY: 'secret', TABLETOP_PLAYER_TOKEN: 'seat-secret', CODEX_THREAD_ID: 'private-thread' },
  });
  assert.equal(new Date(usage.checkedAt).toISOString(), usage.checkedAt);
  assert.deepEqual(usage.buckets, [
    { id: 'codex', name: 'Codex', windows: [{ id: 'primary', usedPercent: 100, windowDurationMins: 300, resetsAt: 1900000000 }] },
    { id: 'light', name: 'light', windows: [
      { id: 'primary', usedPercent: 0, windowDurationMins: null, resetsAt: null },
      { id: 'secondary', usedPercent: 12.5, windowDurationMins: null, resetsAt: null },
    ] },
    { id: 'unknown', name: 'unknown', windows: [] },
  ]);
  assert.deepEqual(fake.messages.map(message => message.method), ['initialize', 'initialized', 'account/rateLimits/read']);
  assert.deepEqual(fake.signals, ['SIGTERM']);
  assert.deepEqual(fake.invocation().options.env, { PATH: '/bin', HOME: '/fixture', CODEX_HOME: '/fixture/.codex' });
  assert.equal(fake.invocation().options.shell, false);
  assert.deepEqual(fake.invocation().args.slice(0, 3), ['app-server', '--listen', 'stdio://']);
  assert.ok(!JSON.stringify(usage).includes('private'));
});

test('legacy limits are used when the bucket map is absent or empty, without inventing unavailable usage', async () => {
  for (const rateLimitsByLimitId of [undefined, null, {}]) {
    const fake = fakeServer({ rateLimitsByLimitId, rateLimits: {
      limitId: 'legacy', primary: { usedPercent: 0, windowDurationMins: 300, resetsAt: null }, secondary: null,
    } });
    const usage = await readCodexPlanUsage({ spawnImpl: fake.spawnImpl });
    assert.deepEqual(usage.buckets, [{ id: 'legacy', name: 'legacy', windows: [{ id: 'primary', usedPercent: 0, windowDurationMins: 300, resetsAt: null }] }]);
  }
  const fake = fakeServer({ rateLimits: null, rateLimitsByLimitId: null });
  assert.deepEqual((await readCodexPlanUsage({ spawnImpl: fake.spawnImpl })).buckets, []);
});

test('RPC failure is reported without exposing raw account data and closes the child', async () => {
  const fake = fakeServer(null, { rpcError: true });
  await assert.rejects(readCodexPlanUsage({ spawnImpl: fake.spawnImpl }), error => {
    assert.match(error.message, /unavailable; check the CLI ChatGPT login/);
    assert.ok(!error.message.includes('private'));
    return true;
  });
  assert.deepEqual(fake.signals, ['SIGTERM']);
});

test('timeout bounds cleanup and kills a child that ignores SIGTERM', async () => {
  const fake = fakeServer(null, { silent: true, ignoreTerm: true });
  await assert.rejects(readCodexPlanUsage({ spawnImpl: fake.spawnImpl, timeoutMs: 10, shutdownTimeoutMs: 5 }), /timed out/);
  assert.deepEqual(fake.signals, ['SIGTERM', 'SIGKILL']);
  assert.deepEqual(fake.messages.map(message => message.method), ['initialize']);
});

test('malformed output, early exit and spawn failure reject without hanging', async () => {
  const malformed = fakeServer(null, { malformed: true });
  await assert.rejects(readCodexPlanUsage({ spawnImpl: malformed.spawnImpl }), /invalid plan usage data/);
  assert.deepEqual(malformed.signals, ['SIGTERM']);
  const early = fakeServer(null, { silent: true });
  const result = readCodexPlanUsage({ spawnImpl: early.spawnImpl });
  early.child.emit('close', 1);
  await assert.rejects(result, /exited before returning/);
  await assert.rejects(readCodexPlanUsage({ spawnImpl: () => { throw new Error('private path'); } }), /Unable to launch Codex/);
});
