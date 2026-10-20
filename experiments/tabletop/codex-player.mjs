import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PLAYER } from './coordinator.mjs';

const defaultMcpPath = fileURLToPath(new URL('./mcp.mjs', import.meta.url));
const localCodex = fileURLToPath(new URL('../../node_modules/.bin/codex', import.meta.url));
const defaultCodex = process.env.TABLETOP_CODEX_BIN || (existsSync(localCodex) ? localCodex : 'codex');
const allowedReasoning = ['low', 'medium', 'high', 'xhigh', 'max'];
const tabletopTools = ['observe_table', 'act', 'say', 'pass_priority', 'pass_turn', 'read_card', 'read_reference', 'read_events', 'read_rules', 'complete_decision'];
const json = value => JSON.stringify(value);

export function playerPrompt({ player, sessionId, revision, fromRevision = revision, wake, view, events, turnHistory, quickstart = '', basicRules = '' }) {
  // Repeated on every resume so an older conversation cannot retain obsolete
  // broadcast/no-op instructions or confuse hidden card lists with empty decks.
  const tableContract = [
    'Match contract: read_reference lists optional format/box overrides. An empty paths list means no custom overrides; use ordinary casual Magic with the supplied decks and life totals. This is not a sanctioned Standard deck-legality check. During Setup, turn.active names the starting player and the players list gives turn order unless configured rules say otherwise. These supplied settings do not need operator reconfirmation.',
    'Visibility contract: zone.count is the actual number of cards; zone.cards contains only card identities currently visible to you. A hidden library with count:60 and cards:[] contains 60 real cards, not an empty or unconfigured deck. Drawing does not require card IDs or seeing the library first: use act with the current revision and an action such as {"type":"draw","count":7} to draw from your own library into your hand, only when the rules require that draw. Read the returned hand before evaluating it. Do not peek or reveal a library just to prepare an opening hand.',
    'Empty optional references and hidden library contents are not setup blockers. If an earlier decision reported needs_help for either reason alone, that misunderstanding is resolved by this contract; observe the current table and continue.',
    'Turn discipline: the normal allowance is ONE land play across the entire turn, not one per main phase or prompt. Before playing a land, check the current-turn history for a land you already played; another main phase does not reset that allowance. Additional land plays need an identified effect. A land entering through an effect is not necessarily a land play; apply the actual rule.',
    'Rules lookup order: use the supplied basic game guide in this conversation for ordinary play; its authorship, source, and version are stated inside the reference. For a card question, use read_card for its Oracle text and available cached official rulings; rulings_cache.status=fetched with rulings:[] means the cached official lookup returned none, while not_fetched or missing cache metadata means unknown, not a confirmed absence of rulings. If the basics need refreshing or a term needs explaining, query local read_rules with source basic; its included glossary can be searched by term. Only if those leave an unusual interaction or ambiguity unresolved should you make a targeted Comprehensive Rules lookup. Do not consult the Comprehensive Rules routinely on every move or read the entire document. The authored MCP tool guide explains application controls; it is separate from the supplied basic game guide.',
  ].join('\n\n');
  const handoffContract = [
    'CURRENT COORDINATION PROTOCOL (replaces any older broadcast instructions): only one player runs at a time. You were explicitly selected to continue play or answer a response window; ordinary changes and public speech do not prompt other players. This handoff does not override Magic rules or grant otherwise illegal actions. Read the current situation, do the useful work your seat can legally do, then explicitly choose who needs to respond next.',
    'Use efficient tabletop shorthand. Batch physical steps in act when no intervening opponent decision is required. Narrate the chronology and proposed shortcut publicly with say({revision,text}) or a handoff message. For example, propose moving through quiet phases, playing your one land, tapping mana, and casting a spell in one sequence, then offer the appropriate response window. Do not create a separate model handoff for every mechanical step or empty phase. Do not silently skip mandatory opponent choices, triggers, or meaningful response opportunities. Another player may object and request an earlier legal response point; communicate and correct the table explicitly together. The application does not adjudicate shortcuts or rewind automatically.',
    'End-of-turn shortcut: when your useful play is finished, the stack is clear, and no opponent choice, pending trigger, or relevant response window remains, perform required cleanup and use pass_turn directly, describing the quiet remaining phases in its public message. Do not make a separate handoff solely to confirm every empty phase or ask permission to end your turn. The recipient can request an earlier legal response point and coordinate a correction, as with other shortcuts.',
    'When another player needs to act or respond, use pass_priority({revision,next,message?}) with that exact player ID. To finish your turn and give the next player their turn, use pass_turn({revision,next,message?}); it changes turn markers only, so perform your own required cleanup first. Neither tool resolves spells, untaps cards, draws, or applies game rules. Public say messages communicate choices but do not wake anybody; a question needing an answer must be followed by a handoff to its recipient.',
    'A successful pass_priority or pass_turn is TERMINAL for this decision: it records the handoff and completes your worker decision automatically. End your response immediately afterwards. Do not call complete_decision, observe, say, or any other tool after a successful handoff. A final pass/pass_turn in a generic act batch is terminal in the same way. If the tool rejected a stale revision, observe the current state and reconsider before trying a new action.',
    'No action and passing are different. If you have priority and nothing useful to do, promptly pass_priority to the correct next player; do not use no_op to avoid handing off. complete_decision with no_op or acted without a handoff pauses for operator intervention and is exceptional. Use complete_decision status needs_help only when a real unresolved uncertainty prevents play, or acted after reporting an established game result. Do not add acknowledgments merely to consume a prompt.',
    'Priority discipline: track consecutive passes since the last game action. Casting a spell followed by pass_priority already records the caster\'s pass; count it. For example, p1 casts and passes, then p2 passes: both have passed and resolution is due, without another pass from p1. Do not say a spell will resolve only if its caster passes again after everyone already passed. Once ALL players have passed in succession, the top stack item resolves or the empty-stack step/phase ends. Do not start another identical pass round. In multiplayer, one opponent passing does not mean everyone passed. The active player coordinates the resulting manual resolution or advancement, respecting choices and triggers, and can propose a useful shortcut through quiet play before offering the next response. Players explicitly choose each next recipient; the coordinator never chooses it or applies Magic rules.',
  ].join('\n\n');
  const setupReminder = view?.turn?.phase?.toLowerCase() === 'setup'
    ? 'Begin the configured game. During Setup, priority:null means ordinary priority has not started; it does not require everyone to wait. Inspect your hand and history; prepare your own opening hand once as required and ensure all seats have completed their initial draws before the first mulligan declaration round. Coordinate each round with public messages and explicit pass_priority handoffs: keep/mulligan declarations proceed in starting-player/turn order, skipping players who already kept in an earlier round. Complete every declaration for the current round BEFORE any player takes that round\'s mulligan; then those taking mulligans perform their redraw/bottom stage under the basic guide, and only after that stage is complete begin the next declaration round. Kept players no longer participate in later mulligan rounds. Do not finish all of one player\'s mulligans before others make their first declarations. Hand off to the next seat that needs to perform the current setup stage, without revealing hidden cards or repeatedly waking kept seats. Once everyone has kept, explicitly hand back to the starting player to begin play. Inspect recorded setup choices to avoid repeating a completed draw or mulligan on a resume. These handoffs schedule setup work; they do not assert that ordinary priority exists during setup, and the application performs none of the rules automatically.'
    : '';
  const introduction = sessionId ? '' : [
    `You are ${player.name || player.id}, player ${player.id}, in a manual Magic tabletop playtest.`,
    'Your independent conversation and MCP connection belong only to this player. The MCP server filters information for your seat. Use only the tabletop MCP tools.',
    'Interpret game rules yourself: the application does not check legality, resolve spells, run turns, or decide winners. Read optional format and box overrides with read_reference; follow the rules lookup order below for other questions.',
    'The current player-visible snapshot and ordered events are supplied below. Check their current revision before writes; tool responses return an updated table. If information is stale or unclear, observe_table and reconsider. Never blindly retry a rejected move.',
    'Keep hidden cards and private strategy out of public messages. Public choices, response requests, shortcut proposals, and readiness belong in say or a handoff message.',
    quickstart ? `Authored tabletop MCP tool guide:\n${quickstart}` : '',
  ].filter(Boolean).join('\n\n') + '\n\n';
  return introduction + [
    basicRules ? `Supplied basic game guide (source/version inside; separate from the authored MCP tool guide):\n${basicRules}\nEnd of supplied basic game guide.` : '',
    `Explicit player handoff. Unseen events ${fromRevision} through ${revision} are included in order, followed by one current table snapshot. Read all changes once; do not replay actions for individual historical events.`,
    `Your player ID: ${player.id}. Handoff: ${json(wake || { kind: 'setup', revision })}.`,
    handoffContract,
    tableContract,
    `Unseen player-visible events:\n${json(events)}`,
    `Current player-visible table:\n${json(view)}`,
    turnHistory ? `Public actions in the current turn (historical context, not additional requests):\n${json(turnHistory)}` : '',
    setupReminder,
    'Continue the game efficiently. Make the appropriate moves and public communication, explicitly hand off when another player needs to respond, and end immediately after the successful handoff.',
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
  workspaceRoot, getConnection, quickstart = '', basicRules = '', codexBin = defaultCodex,
  mcpPath = defaultMcpPath, nodeBin = process.execPath, spawnImpl = spawn,
  maxTranscriptBytes = 8 * 1024 * 1024,
}) {
  if (!workspaceRoot || typeof getConnection !== 'function') throw new Error('Player workspace and connection callback are required');
  if (typeof basicRules !== 'string') throw new Error('Basic rules must be reference text');
  const basicRulesHash = basicRules ? createHash('sha256').update(basicRules).digest('hex') : null;
  const root = resolve(workspaceRoot);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  return async function runPlayer(request) {
    const { player, sessionId, decisionId, signal, onSession = () => {}, onUsage = () => {} } = request;
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(player.id)) throw new Error('Invalid player ID');
    if (signal?.aborted) throw signal.reason || new Error('Player cancelled');
    const workspace = join(root, player.id);
    mkdirSync(workspace, { recursive: true, mode: 0o700 });
    const contextPath = join(workspace, 'basic-rules-context.json');
    let previousContext = null;
    try { previousContext = JSON.parse(readFileSync(contextPath, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
    const deliverBasicRules = !!basicRulesHash && (!sessionId || previousContext?.sessionId !== sessionId || previousContext?.sha256 !== basicRulesHash);
    const connection = await getConnection(player.id);
    const invocation = codexInvocation({ player, sessionId, decisionId, workspace, connection, mcpPath, nodeBin });
    const prompt = playerPrompt({ ...request, quickstart, basicRules: deliverBasicRules ? basicRules : '' });
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
        if (deliverBasicRules) {
          // An old session receives the guide once too. Never mark a failed or
          // cancelled turn; on the next attempt it still needs the reference.
          try {
            const temporary = `${contextPath}.tmp`;
            writeFileSync(temporary, JSON.stringify({ version: 1, sessionId: discovered, sha256: basicRulesHash }) + '\n', { mode: 0o600 });
            renameSync(temporary, contextPath);
          } catch (error) { fail(new Error(`Unable to record basic rules delivery: ${error.message}`)); return; }
        }
        ok({ sessionId: discovered });
      });
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      child.stdin.end(prompt);
    });
  };
}
