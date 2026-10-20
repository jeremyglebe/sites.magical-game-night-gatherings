import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const localCodex = fileURLToPath(new URL('../../node_modules/.bin/codex', import.meta.url));
const defaultCodex = process.env.TABLETOP_CODEX_BIN || (existsSync(localCodex) ? localCodex : 'codex');
const runtimeVariables = ['PATH', 'HOME', 'USERPROFILE', 'CODEX_HOME', 'TMPDIR', 'TEMP', 'TMP', 'SYSTEMROOT', 'LANG', 'LC_ALL', 'SSL_CERT_FILE', 'SSL_CERT_DIR'];
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const label = (value, fallback) => typeof value === 'string' && value.trim() ? value : fallback;

function usageBuckets(result) {
  const map = result?.rateLimitsByLimitId;
  const entries = record(map) && Object.keys(map).length
    ? Object.entries(map)
    : record(result?.rateLimits) ? [['codex', result.rateLimits]] : [];
  return entries.filter(([, bucket]) => record(bucket)).map(([key, bucket]) => {
    const id = label(bucket.limitId, key);
    const windows = ['primary', 'secondary'].flatMap(windowId => {
      const window = bucket[windowId];
      if (!record(window) || typeof window.usedPercent !== 'number' || !Number.isFinite(window.usedPercent)) return [];
      return [{
        id: windowId,
        usedPercent: Math.max(0, Math.min(100, window.usedPercent)),
        windowDurationMins: Number.isSafeInteger(window.windowDurationMins) && window.windowDurationMins > 0 ? window.windowDurationMins : null,
        resetsAt: Number.isSafeInteger(window.resetsAt) && window.resetsAt >= 0 ? window.resetsAt : null,
      }];
    });
    return { id, name: label(bucket.limitName, id), windows };
  });
}

/** Read account limits through the documented stdio app-server protocol.
 * No thread, turn, login, reset, or account-changing methods are sent.
 * The pinned app-server does not support exec's --ignore-user-config/--ignore-rules.
 */
export async function readCodexPlanUsage({
  codexBin = defaultCodex, baseEnv = process.env, spawnImpl = spawn,
  timeoutMs = 10000, shutdownTimeoutMs = 500,
} = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || !Number.isSafeInteger(shutdownTimeoutMs) || shutdownTimeoutMs < 1) {
    throw new Error('Usage reader timeouts must be positive integers');
  }
  const env = Object.fromEntries(runtimeVariables.filter(name => baseEnv[name] !== undefined).map(name => [name, baseEnv[name]]));
  const args = ['app-server', '--listen', 'stdio://'];
  for (const [key, value] of Object.entries({
    forced_login_method: 'chatgpt',
    'analytics.enabled': false,
    mcp_servers: {},
    'features.apps': false,
    'features.plugins': false,
    'features.remote_plugin': false,
    'features.hooks': false,
  })) args.push('-c', `${key}=${JSON.stringify(value)}`);

  return new Promise((resolve, reject) => {
    let child;
    try { child = spawnImpl(codexBin, args, { env, stdio: ['pipe', 'pipe', 'pipe'], shell: false }); }
    catch { reject(new Error('Unable to launch Codex for plan usage')); return; }
    let buffer = '', bytes = 0, expectedId = 1;
    let finished = false, closed = false, settled = false, cleanupTimer;
    let outcome, failure;
    const timeout = setTimeout(() => finish(new Error('Codex plan usage request timed out')), timeoutMs);
    function settle() {
      if (settled) return;
      settled = true;
      clearTimeout(cleanupTimer);
      if (failure) reject(failure);
      else resolve(outcome);
    }
    function kill(signal) { try { child.kill(signal); } catch { /* Process already exited. */ } }
    function finish(error, result) {
      if (finished) return;
      finished = true;
      failure = error;
      outcome = result;
      clearTimeout(timeout);
      if (closed) { settle(); return; }
      // Close the short-lived reader on success as well as error. Bound cleanup
      // even if a broken child ignores EOF and SIGTERM.
      cleanupTimer = setTimeout(() => { kill('SIGKILL'); settle(); }, shutdownTimeoutMs);
      try { child.stdin.end(); } catch { /* A failed launch may have no stdin. */ }
      kill('SIGTERM');
    }
    function send(message) {
      try { child.stdin.write(JSON.stringify(message) + '\n'); }
      catch { finish(new Error('Codex plan usage connection failed')); }
    }
    function line(text) {
      if (finished || !text.trim()) return;
      let message;
      try { message = JSON.parse(text); }
      catch { finish(new Error('Codex emitted invalid plan usage data')); return; }
      if (!record(message) || message.method || message.id !== expectedId) return;
      if (message.error || !record(message.result)) {
        finish(new Error(expectedId === 1 ? 'Codex app-server initialization failed' : 'Codex plan usage is unavailable; check the CLI ChatGPT login'));
        return;
      }
      if (expectedId === 1) {
        expectedId = 2;
        send({ method: 'initialized', params: {} });
        send({ id: 2, method: 'account/rateLimits/read', params: {} });
      } else {
        finish(null, { checkedAt: new Date().toISOString(), buckets: usageBuckets(message.result) });
      }
    }
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      if (finished) return;
      bytes += Buffer.byteLength(chunk);
      if (bytes > 1024 * 1024) { finish(new Error('Codex plan usage response exceeded its size limit')); return; }
      buffer += chunk;
      let newline;
      while (!finished && (newline = buffer.indexOf('\n')) >= 0) {
        const current = buffer.slice(0, newline); buffer = buffer.slice(newline + 1); line(current);
      }
    });
    // Drain diagnostics without returning auth/account details to the UI.
    child.stderr.resume();
    child.stdin.on('error', () => { if (!finished) finish(new Error('Codex plan usage connection failed')); });
    child.once('error', () => finish(new Error('Unable to launch Codex for plan usage')));
    child.once('close', () => {
      closed = true;
      if (!finished && buffer.trim()) line(buffer);
      if (!finished) finish(new Error('Codex exited before returning plan usage'));
      settle();
    });
    send({ id: 1, method: 'initialize', params: {
      clientInfo: { name: 'game_night_plan_usage', title: 'Game Night Plan Usage', version: '1.0.0' },
    } });
  });
}
