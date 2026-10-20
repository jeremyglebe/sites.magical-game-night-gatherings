import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PLAYER } from './coordinator.mjs';

const defaultMcpPath = fileURLToPath(new URL('./mcp.mjs', import.meta.url));
const localCodex = fileURLToPath(new URL('../../node_modules/.bin/codex', import.meta.url));
const defaultCodex = process.env.TABLETOP_CODEX_BIN || (existsSync(localCodex) ? localCodex : 'codex');
const allowedReasoning = ['low', 'medium', 'high', 'xhigh', 'max'];
const tabletopTools = ['observe_table', 'act', 'read_card', 'read_reference', 'read_events', 'read_rules', 'complete_decision'];
const json = value => JSON.stringify(value);

export function playerPrompt({ player, sessionId, revision, fromRevision = revision, view, events, turnHistory, quickstart = '' }) {
  // Repeat the contract on resumed turns: older histories may contain an
  // incorrect conclusion that hidden cards or optional references are missing.
  const tableContract = [
    'Match contract: read_reference lists optional format/box overrides. An empty paths list means no custom overrides; use ordinary casual Magic with the supplied decks and life totals. This is not a sanctioned Standard deck-legality check. During Setup, turn.active names the starting player and the players list gives turn order unless configured rules say otherwise. These supplied settings do not need operator reconfirmation.',
    'Visibility contract: zone.count is the actual number of cards; zone.cards contains only card identities currently visible to you. A hidden library with count:60 and cards:[] contains 60 real cards, not an empty or unconfigured deck. Drawing does not require card IDs or seeing the library first: use act with the current revision and an action such as {"type":"draw","count":7} to draw from your own library into your hand, only when the rules require that draw. Read the returned hand before evaluating it. Do not peek or reveal a library just to prepare an opening hand.',
    'Empty optional references and hidden library contents are not setup blockers. If an earlier decision reported needs_help for either reason alone, that misunderstanding is resolved by this contract; observe the current table and continue.',
    'Turn discipline: the normal allowance is ONE land play across the entire turn, not one per main phase or notification. Before playing a land, check the current-turn history for a land you already played; another main phase does not reset that allowance. Additional land plays need an identified effect. A land entering through an effect is not necessarily a land play; apply the actual rule.',
    'Priority discipline: track consecutive passes since the last game action. Once all players have passed in succession, the top stack item resolves or the empty-stack step/phase ends. Do not start another identical pass round. The active player coordinates the resulting manual changes and the next priority window, respecting required choices, triggers, and response opportunities. Any intervening action begins a new pass sequence. The application does not decide this for you.',
  ].join('\n\n');
  const setupReminder = view?.turn?.phase?.toLowerCase() === 'setup'
    ? 'Begin the configured game. During Setup, priority:null means ordinary priority has not started; it does not require everyone to wait. Prepare your own opening hand once according to the chosen rules, make any required mulligan choices, and record readiness publicly without revealing your cards. Inspect your hand and history first so you do not repeat completed setup. The starting player coordinates the first turn after everyone is ready. If a setup choice needs agreement, make a concrete public proposal; use needs_help if essential setup information is missing.'
    : '';
  const introduction = sessionId ? '' : [
    `You are ${player.name || player.id}, player ${player.id}, in a manual Magic tabletop playtest.`,
    'Your conversation and MCP connection belong only to this player. The MCP server filters information for your seat.',
    'Play using only the tabletop MCP tools. List optional format and box overrides with read_reference and read them when configured; otherwise use the ordinary Magic baseline below.',
    'Interpret game rules yourself: the application does not check legality, resolve spells, run turns, or decide winners.',
    'A notification is information, not permission or an obligation to act. Most updates need no action from you.',
    'When you have no legal or useful action, call complete_decision with status no_op and finish promptly. No explanation is required.',
    'Passing priority is different: use the pass table action with the next player, then complete_decision with status acted.',
    'Use current turn/priority markers, public handoffs and rules to decide who acts. Never assume another player acted just because you received a prompt.',
    'Setup is player-led. In setup, prepare your own opening hand once, follow the chosen mulligan rules, and record readiness. Coordinate publicly before beginning play.',
    'Before changing the table, observe its CURRENT state. If a write says the table changed, observe and reconsider; do not blindly retry old moves.',
    'Only batch physical changes that require no intervening response or choice. Give opponents response opportunities and keep active/priority/phase markers accurate.',
    'You may use public notes to communicate game choices, but never publish your hidden hand or private strategy. Never add a note merely to acknowledge an update.',
    'Consult exact card text or rules when needed. Ask for help through complete_decision status needs_help when an uncertainty prevents play.',
    'A reported game result must follow the chosen rules. Complete the decision once using complete_decision, then end your response.',
    quickstart,
  ].filter(Boolean).join('\n\n') + '\n\n';
  return introduction + [
    `Game updates ${fromRevision} through ${revision}. All events accumulated for this decision are included in order; the current table may already be newer. Consider the whole batch once, then decide from the current state. Do not repeat an action for each historical notification.`,
    `Your player ID: ${player.id}.`,
    tableContract,
    `Events for this notification:\n${json(events)}`,
    `Current player-visible table:\n${json(view)}`,
    turnHistory ? `Public actions in the current turn (historical context, not new notifications):\n${json(turnHistory)}` : '',
    setupReminder,
    'Consider whether the rules currently allow or require you to do anything. A quick no_op is normal. Finish with complete_decision.',
  ].filter(Boolean).join('\n\n');
}

/**
 * Build arguments without a shell. Credentials are passed through environment
 * allowlisting, never command-line arguments, prompt text, or saved config.
 */
export function codexInvocation({
  player, sessionId, workspace, connection, decisionId,
  mcpPath = defaultMcpPath, nodeBin = process.execPath, baseEnv = process.env,
}) {
  const model = player.model || DEFAULT_PLAYER.model;
  const reasoning = player.reasoning || DEFAULT_PLAYER.reasoning;
  if (!/^[a-zA-Z0-9._-]+$/.test(model)) throw new Error('Invalid model name');
  if (!allowedReasoning.includes(reasoning)) throw new Error('Unsupported reasoning effort');
  if (!connection?.token || !connection?.url) throw new Error('A seat-specific table connection is required');
  const url = new URL(connection.url);
  if (!['http:', 'https:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new Error('Managed players connect to the local table service');
  }
  const config = {
    approval_policy: 'never',
    forced_login_method: 'chatgpt',
    sandbox_mode: 'read-only',
    model_reasoning_effort: reasoning,
    service_tier: 'default',
    web_search: 'disabled',
    project_doc_max_bytes: 0,
    'features.shell_tool': false,
    'features.fast_mode': false,
    'features.ultrafast_mode': false,
    'features.shell_snapshot': false,
    'features.apps': false,
    'features.plugins': false,
    'features.remote_plugin': false,
    'features.multi_agent': false,
    'features.browser_use': false,
    'features.browser_use_external': false,
    'features.in_app_browser': false,
    'features.computer_use': false,
    'features.image_generation': false,
    'features.hooks': false,
    'features.memories': false,
    'features.workspace_dependencies': false,
    'features.skill_mcp_dependency_install': false,
    'tools.view_image': false,
    'memories.use_memories': false,
    'memories.generate_memories': false,
    'shell_environment_policy.inherit': 'none',
    'mcp_servers.tabletop.command': nodeBin,
    'mcp_servers.tabletop.args': [resolve(mcpPath), '--seat', player.id, '--url', connection.url],
    'mcp_servers.tabletop.env_vars': ['TABLETOP_PLAYER_TOKEN', 'TABLETOP_DECISION_ID'],
    // These seat-scoped game tools are the player's authorized controls. Without
    // an explicit MCP policy, noninteractive Codex rejects them under "never".
    'mcp_servers.tabletop.enabled_tools': tabletopTools,
    'mcp_servers.tabletop.default_tools_approval_mode': 'approve',
    'mcp_servers.tabletop.required': true,
    'mcp_servers.tabletop.startup_timeout_sec': 20,
    'mcp_servers.tabletop.tool_timeout_sec': 30,
  };
  const args = ['exec'];
  if (sessionId) args.push('resume', sessionId);
  args.push('--json', '--ignore-user-config', '--ignore-rules', '--skip-git-repo-check', '--model', model);
  if (!sessionId) args.push('--cd', workspace);
  for (const [key, value] of Object.entries(config)) args.push('-c', `${key}=${json(value)}`);
  args.push('-');
  const env = {};
  // Preserve login/runtime locations, but not parent Codex thread metadata or
  // unrelated API keys. This intentionally uses the user's existing CLI login.
  for (const name of ['PATH', 'HOME', 'USERPROFILE', 'CODEX_HOME', 'TMPDIR', 'TEMP', 'TMP', 'SYSTEMROOT', 'LANG', 'LC_ALL', 'SSL_CERT_FILE', 'SSL_CERT_DIR']) {
    if (baseEnv[name] !== undefined) env[name] = baseEnv[name];
  }
  env.TABLETOP_PLAYER_TOKEN = connection.token;
  env.TABLETOP_DECISION_ID = decisionId;
  return { args, env, cwd: workspace };
}

export function createCodexRunner({
  workspaceRoot, getConnection, quickstart = '', codexBin = defaultCodex,
  mcpPath = defaultMcpPath, nodeBin = process.execPath, spawnImpl = spawn,
  maxTranscriptBytes = 8 * 1024 * 1024,
}) {
  if (!workspaceRoot || typeof getConnection !== 'function') throw new Error('Player workspace and connection callback are required');
  const root = resolve(workspaceRoot);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  return async function runPlayer(request) {
    const { player, sessionId, decisionId, signal, onSession = () => {}, onUsage = () => {} } = request;
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(player.id)) throw new Error('Invalid player ID');
    if (signal?.aborted) throw signal.reason || new Error('Player cancelled');
    const workspace = join(root, player.id);
    mkdirSync(workspace, { recursive: true, mode: 0o700 });
    const connection = await getConnection(player.id);
    const invocation = codexInvocation({ player, sessionId, decisionId, workspace, connection, mcpPath, nodeBin });
    const prompt = playerPrompt({ ...request, quickstart });
    return new Promise((ok, fail) => {
      let child;
      try {
        child = spawnImpl(codexBin, invocation.args, {
          cwd: invocation.cwd, env: invocation.env, stdio: ['pipe', 'pipe', 'pipe'],
          shell: false, detached: process.platform !== 'win32',
        });
      } catch (error) { fail(error); return; }
      let buffer = '', stderr = '', bytes = 0, discovered = sessionId || null;
      let failure = null, completed = false, killTimer;
      function kill(signalName) {
        try {
          if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signalName);
          else child.kill(signalName);
        } catch { try { child.kill(signalName); } catch { /* Already exited. */ } }
      }
      function abort() {
        kill('SIGTERM');
        killTimer ||= setTimeout(() => kill('SIGKILL'), 1500);
        killTimer.unref?.();
      }
      function rejectRun(error) {
        const message = String(error?.message || error).replaceAll(connection.token, '[redacted]').replaceAll(decisionId, '[redacted]');
        failure ||= new Error(message);
        abort();
      }
      function line(text) {
        if (!text.trim()) return;
        let event;
        try { event = JSON.parse(text); } catch { rejectRun(new Error('Codex emitted invalid JSON output')); return; }
        try {
          if (event.type === 'thread.started') {
            if (sessionId && event.thread_id !== sessionId) throw new Error('Codex resumed a different player session');
            if (typeof event.thread_id !== 'string' || !event.thread_id) throw new Error('Codex did not supply a session ID');
            discovered = event.thread_id; onSession(discovered);
          }
          if (event.type === 'turn.completed') {
            completed = true;
            // exec resume reports the conversation's cumulative token usage,
            // including earlier turns. The coordinator must replace this seat's
            // session total instead of adding that history again on each turn.
            if (event.usage) onUsage(event.usage, { scope: 'session', sessionId: discovered });
          }
          if (event.type === 'turn.failed' || event.type === 'error') {
            rejectRun(new Error(event.error?.message || event.message || 'Codex player failed'));
          }
        } catch (error) { rejectRun(error); }
      }
      child.stdout.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > maxTranscriptBytes) { rejectRun(new Error('Player output exceeded its size limit')); return; }
        buffer += chunk.toString();
        let split;
        while ((split = buffer.indexOf('\n')) !== -1) {
          const current = buffer.slice(0, split); buffer = buffer.slice(split + 1); line(current);
        }
      });
      child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-4000); });
      child.once('error', error => { failure = new Error(`Unable to launch Codex: ${error.message}`); });
      child.stdin.on('error', error => { if (error.code !== 'EPIPE') rejectRun(error); });
      child.once('close', code => {
        clearTimeout(killTimer);
        signal?.removeEventListener('abort', abort);
        if (buffer.trim()) line(buffer);
        if (signal?.aborted) { fail(signal.reason || new Error('Player cancelled')); return; }
        if (failure) { fail(failure); return; }
        if (code !== 0) {
          // Never include secret environment values in error/UI output.
          const detail = stderr.replaceAll(connection.token, '[redacted]').replaceAll(decisionId, '[redacted]').trim();
          fail(new Error(`Codex player exited with code ${code}${detail ? ': ' + detail : ''}`));
          return;
        }
        if (!completed || !discovered) { fail(new Error('Codex ended without a completed turn and session ID')); return; }
        ok({ sessionId: discovered });
      });
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      child.stdin.end(prompt);
    });
  };
}
