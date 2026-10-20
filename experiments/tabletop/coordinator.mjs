import { randomUUID } from 'node:crypto';

export const DEFAULT_PLAYER = Object.freeze({ model: 'gpt-6-luna', reasoning: 'high' });
export const DEFAULT_LIMITS = Object.freeze({
  maxConcurrent: 1, maxDecisions: 2000, decisionTimeoutMs: 120000,
});
const budgetMessages = {
  decisions: 'Decision limit reached. Increase the limit before resuming.',
  output: 'Output-token limit reached. Increase the limit before resuming.',
};
const clone = value => structuredClone(value);
const usageKeys = ['input_tokens', 'cached_input_tokens', 'output_tokens', 'reasoning_output_tokens'];
const emptyUsage = () => Object.fromEntries(usageKeys.map(key => [key, 0]));
function addUsage(target, source = {}) {
  for (const key of usageKeys) if (Number.isFinite(source[key]) && source[key] >= 0) target[key] += source[key];
}
function positive(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}
function validRevision(revision) {
  if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Invalid table revision');
  return revision;
}
function currentTurnHistory(history, turn) {
  const events = Array.isArray(history) ? history : history.events || [];
  let start = 0;
  const marker = {};
  for (let index = 0; index < events.length; index++) {
    for (const change of events[index].changes || []) {
      if (change.type !== 'turn' && change.type !== 'pass_turn') continue;
      const updated = { ...marker };
      for (const key of ['number', 'active']) if (change.set?.[key] !== undefined) updated[key] = change.set[key];
      if (updated.number !== marker.number || updated.active !== marker.active) start = index;
      Object.assign(marker, updated);
    }
  }
  return {
    number: turn?.number, active: turn?.active,
    events: events.slice(start).map(({ revision, actor, summary }) => ({ revision, actor, summary })),
  };
}

/**
 * Serial, explicit handoffs; this scheduler does not infer Magic priority.
 * notify records a revision, wake chooses a recipient, and handoff terminates
 * the current decision before that recipient can run. Views/events must already
 * be filtered for the supplied seat. Restored matches always begin paused.
 */
export function createCoordinator({
  players, runPlayer, getView, getEvents = () => [], getPublicEvents, onChange = () => {},
  saved = null, limits = {},
}) {
  if (!Array.isArray(players) || !players.length) throw new Error('Supply at least one player');
  if (typeof runPlayer !== 'function' || typeof getView !== 'function') throw new Error('Player runner and table view callbacks are required');
  const settings = { ...DEFAULT_LIMITS, ...limits };
  for (const key of Object.keys(DEFAULT_LIMITS)) positive(settings[key], key);
  if (settings.maxOutputTokens !== undefined) positive(settings.maxOutputTokens, 'maxOutputTokens');
  // Accept legacy saved/configured concurrency, but never run multiple players.
  settings.maxConcurrent = 1;
  const seats = new Map();
  const isSerialSave = saved?.version === 2;
  for (const input of players) {
    if (!input || typeof input.id !== 'string' || !/^[a-zA-Z0-9_-]{1,40}$/.test(input.id) || seats.has(input.id)) {
      throw new Error('Players need unique valid IDs');
    }
    const previous = saved?.players?.find(p => p.id === input.id);
    const completion = previous?.active?.completion;
    const lastCompleted = Math.max(Number.isSafeInteger(previous?.lastCompleted) ? previous.lastCompleted : -1,
      Number.isSafeInteger(completion?.revision) ? completion.revision : -1);
    seats.set(input.id, {
      config: { ...DEFAULT_PLAYER, ...input }, sessionId: previous?.sessionId || null,
      lastCompleted, decisions: previous?.decisions || 0,
      usage: { ...emptyUsage(), ...previous?.usage }, usageScope: previous?.usageScope || 'legacy',
      lastDecision: completion || previous?.lastDecision || null,
      error: previous?.error || null, active: null,
    });
  }
  const sessions = [...seats.values()].map(s => s.sessionId).filter(Boolean);
  if (new Set(sessions).size !== sessions.length) throw new Error('Different players cannot share a Codex session');
  let mode = saved?.mode === 'finished' ? 'finished' : 'paused';
  let latestRevision = Number.isSafeInteger(saved?.latestRevision) ? saved.latestRevision : -1;
  let decisions = Number.isSafeInteger(saved?.decisions) ? saved.decisions : 0;
  let issue = saved?.issue || null;
  let stepPermits = 0;
  let scheduled = false;
  let pendingRecipient = null;

  function recipient(id, revision, kind, from) {
    if (!seats.has(id)) throw new Error('Unknown recipient player');
    validRevision(revision);
    if (typeof kind !== 'string' || !kind || kind.length > 80) throw new Error('Invalid handoff kind');
    return { playerId: id, revision, kind, ...(from ? { from } : {}) };
  }
  if (isSerialSave && mode !== 'finished') {
    const pending = saved.pendingRecipient;
    if (pending) pendingRecipient = recipient(pending.playerId, pending.revision, pending.kind, pending.from);
    const interrupted = saved.players?.filter(p => p.active) || [];
    if (interrupted.length > 1) throw new Error('A serial coordinator cannot restore multiple active players');
    const previous = interrupted[0];
    if (previous && !pendingRecipient && !previous.active.completion) {
      pendingRecipient = recipient(previous.id, previous.active.revision, previous.active.wake?.kind || 'resume', previous.active.wake?.from);
    }
    if (previous?.active.completion?.handoff && !pendingRecipient) {
      const handoff = previous.active.completion.handoff;
      pendingRecipient = recipient(handoff.recipient, handoff.revision, handoff.kind, previous.id);
    }
  }
  // Version 1 broadcast backlogs are deliberately discarded. The application
  // must explicitly seed the current speaker after migrating an older match.

  const activeSeat = () => [...seats.values()].find(s => s.active);
  function recordUsage(seat, usage, metadata = {}) {
    if (metadata.scope === 'session') {
      if (!seat.sessionId || metadata.sessionId !== seat.sessionId) throw new Error('Usage belongs to a different player session');
      // exec resume reports the entire conversation. Replace rather than add;
      // this also repairs legacy totals after the next successful report.
      seat.usage = emptyUsage(); addUsage(seat.usage, usage); seat.usageScope = 'session';
    } else { addUsage(seat.usage, usage); seat.usageScope = 'turn'; }
  }
  function snapshot() {
    return {
      version: 2, mode, latestRevision, decisions, limits: clone(settings), issue,
      pendingRecipient: clone(pendingRecipient),
      players: [...seats.values()].map(s => ({
        id: s.config.id, name: s.config.name || s.config.id,
        model: s.config.model, reasoning: s.config.reasoning,
        enabled: s.config.enabled !== false, sessionId: s.sessionId,
        pending: pendingRecipient?.playerId === s.config.id ? [pendingRecipient.revision] : [],
        lastCompleted: s.lastCompleted, decisions: s.decisions,
        usage: clone(s.usage), usageScope: s.usageScope,
        lastDecision: clone(s.lastDecision), error: s.error,
        active: s.active ? {
          revision: s.active.revision, fromRevision: s.active.fromRevision,
          decisionId: s.active.id, startedAt: s.active.startedAt,
          wake: clone(s.active.wake), completion: clone(s.active.completion),
        } : null,
      })),
    };
  }
  const changed = () => onChange(snapshot());
  function status() {
    const result = snapshot();
    const active = result.players.filter(p => p.active).length;
    const queued = pendingRecipient ? 1 : 0;
    const waitingManual = !!pendingRecipient && seats.get(pendingRecipient.playerId).config.enabled === false;
    const idleRunning = mode === 'running' && !active;
    return {
      ...result, active, queued,
      state: idleRunning && waitingManual ? 'waiting_manual' : idleRunning && !queued ? 'stalled' : mode,
      message: issue || (idleRunning && waitingManual
        ? `Waiting for ${seats.get(pendingRecipient.playerId).config.name || pendingRecipient.playerId} to act and explicitly hand off.`
        : idleRunning && !queued ? 'No recipient is scheduled. Choose a player explicitly to continue.' : null),
      usage: result.players.reduce((sum, p) => { addUsage(sum, p.usage); return sum; }, emptyUsage()),
    };
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; pump(); });
  }
  function limitReached() {
    if (decisions >= settings.maxDecisions) return budgetMessages.decisions;
    const output = [...seats.values()].reduce((total, s) => total + s.usage.output_tokens, 0);
    if (settings.maxOutputTokens && output >= settings.maxOutputTokens) return budgetMessages.output;
    return null;
  }
  function pump() {
    if ((mode !== 'running' && mode !== 'stepping') || activeSeat()) return;
    const limit = limitReached();
    if (limit) { mode = 'paused'; issue = limit; stepPermits = 0; changed(); return; }
    if (!pendingRecipient) {
      if (mode === 'stepping') { mode = 'paused'; stepPermits = 0; issue = 'No pending player decisions.'; changed(); }
      return;
    }
    const seat = seats.get(pendingRecipient.playerId);
    if (seat.config.enabled === false) return;
    if (mode === 'stepping' && stepPermits <= 0) return;
    if (mode === 'stepping') stepPermits--;
    launch(seat);
  }
  function launch(seat) {
    const wake = pendingRecipient;
    pendingRecipient = null;
    const controller = new AbortController();
    const active = {
      id: randomUUID(), revision: wake.revision, fromRevision: seat.lastCompleted + 1,
      wake, startedAt: new Date().toISOString(), controller, completion: null, timedOut: false, promise: null,
    };
    seat.active = active; seat.error = null; decisions++; seat.decisions++; changed();
    let timeout;
    const job = (async () => {
      try {
        const view = await getView(seat.config.id);
        validRevision(view.revision);
        if (view.revision < wake.revision) throw new Error('Table view is older than the handoff');
        active.revision = view.revision;
        latestRevision = Math.max(latestRevision, view.revision);
        const history = await getEvents(seat.config.id, seat.lastCompleted, active.revision);
        const events = (Array.isArray(history) ? history : history.events || [])
          .filter(e => e.revision > seat.lastCompleted && e.revision <= active.revision).sort((a, b) => a.revision - b.revision);
        const turnHistory = getPublicEvents
          ? currentTurnHistory(await getPublicEvents(0, view.revision), view.turn) : undefined;
        if (controller.signal.aborted) return;
        changed();
        timeout = setTimeout(() => {
          active.timedOut = true; controller.abort(new Error('Player decision timed out'));
        }, settings.decisionTimeoutMs);
        const rememberSession = id => {
          if (typeof id !== 'string' || !id) throw new Error('Invalid Codex session ID');
          if (seat.sessionId && seat.sessionId !== id) throw new Error('Codex resumed a different player session');
          if ([...seats.values()].some(other => other !== seat && other.sessionId === id)) throw new Error('Different players cannot share a Codex session');
          seat.sessionId = id; changed();
        };
        const result = await runPlayer({
          player: clone(seat.config), sessionId: seat.sessionId,
          revision: active.revision, fromRevision: active.fromRevision, decisionId: active.id,
          wake: clone(wake), view, events, turnHistory, signal: controller.signal,
          onSession: rememberSession,
          onUsage(usage, metadata) { recordUsage(seat, usage, metadata); changed(); },
        });
        if (result?.sessionId) rememberSession(result.sessionId);
        if (result?.usage) recordUsage(seat, result.usage, result.usageMetadata);
        if (active.timedOut) throw new Error('Player decision timed out');
        if (!controller.signal.aborted && !active.completion) throw new Error('Player exited without an explicit handoff or complete_decision');
      } catch (error) {
        if (!controller.signal.aborted || active.timedOut) {
          seat.error = String(error.message || error);
          issue = `${seat.config.name || seat.config.id}: ${seat.error}`; mode = 'paused';
        }
      } finally {
        clearTimeout(timeout);
        if (active.completion) {
          seat.lastCompleted = Math.max(seat.lastCompleted, active.completion.revision);
          seat.lastDecision = active.completion;
          if (!active.completion.handoff && mode !== 'finished' && mode !== 'stopped') {
            mode = 'paused';
            issue ||= active.completion.status === 'needs_help'
              ? `${seat.config.name || seat.config.id} requested help: ${active.completion.note || 'No details provided'}`
              : `${seat.config.name || seat.config.id} completed without a handoff. Choose a recipient explicitly to continue.`;
          }
        } else if (mode !== 'finished' && !pendingRecipient) {
          pendingRecipient = { ...wake, revision: Math.max(wake.revision, latestRevision) };
        }
        seat.active = null;
        if (mode === 'stepping' && stepPermits === 0) mode = 'paused';
        changed(); schedule();
      }
    })();
    active.promise = job;
  }
  function notify(revision) {
    validRevision(revision);
    if (mode === 'finished') return status();
    latestRevision = Math.max(latestRevision, revision); changed();
    return status();
  }
  function wake(id, revision, kind = 'setup') {
    if (mode === 'finished') throw new Error('This match has finished');
    if (activeSeat()) throw new Error('Wait for the active worker to exit before choosing a recipient');
    const next = recipient(id, revision, kind);
    latestRevision = Math.max(latestRevision, revision);
    // Explicit operator/recovery choices may replace an interrupted recipient.
    pendingRecipient = next; seats.get(id).error = null; issue = null;
    changed(); schedule(); return status();
  }
  function authorizeDecision(id, decisionId) {
    const seat = seats.get(id);
    if (!seat?.active) throw new Error('No active decision for this player');
    if (decisionId !== seat.active.id || seat.active.controller.signal.aborted) throw new Error('This decision is no longer active');
    if (seat.active.completion) throw new Error('Decision already completed');
    return true;
  }
  function authorizeManual(id) {
    if (mode === 'finished') throw new Error('This match has finished');
    if (activeSeat()) throw new Error('Wait for the active worker to exit before acting');
    if (!seats.has(id) || seats.get(id).config.enabled !== false || pendingRecipient?.playerId !== id) {
      throw new Error('This manual player is not the current recipient');
    }
    return true;
  }
  function handoff(actor, next, revision, kind = 'priority') {
    if (mode === 'finished') throw new Error('This match has finished');
    const target = recipient(next, revision, kind, actor);
    const seat = seats.get(actor);
    if (!seat) throw new Error('Unknown acting player');
    if (seat.config.enabled === false) authorizeManual(actor);
    else authorizeDecision(actor, seat.active?.id);
    latestRevision = Math.max(latestRevision, revision);
    const data = { recipient: next, revision, kind };
    if (seat.active) {
      seat.active.completion = { status: 'acted', note: '', revision, handoff: data };
    } else {
      seat.lastCompleted = Math.max(seat.lastCompleted, revision);
      seat.lastDecision = { status: 'acted', note: '', revision, handoff: data };
    }
    pendingRecipient = target; issue = null;
    changed(); schedule();
    return { accepted: true, decision_completed: !!seat.active, ...data };
  }
  function complete(id, completion) {
    authorizeDecision(id, completion?.decision_id);
    const seat = seats.get(id);
    if (!['no_op', 'acted', 'needs_help'].includes(completion.status)) throw new Error('Unknown completion status');
    if (completion.note !== undefined && (typeof completion.note !== 'string' || completion.note.length > 2000)) throw new Error('Invalid completion note');
    seat.active.completion = { status: completion.status, note: completion.note || '', revision: Math.max(seat.active.revision, latestRevision) };
    changed();
    return { accepted: true, status: completion.status, decision_completed: true };
  }
  function start() {
    if (mode === 'finished') throw new Error('This match has finished');
    issue = null; for (const seat of seats.values()) seat.error = null;
    mode = 'running'; stepPermits = 0; changed(); schedule(); return status();
  }
  function cancel(nextMode) {
    mode = nextMode; stepPermits = 0;
    for (const seat of seats.values()) seat.active?.controller.abort(new Error(nextMode));
    if (nextMode === 'finished') pendingRecipient = null;
    changed(); return status();
  }
  function step() {
    if (mode === 'finished') throw new Error('This match has finished');
    if (activeSeat()) throw new Error('Wait for active decisions to stop before stepping');
    for (const seat of seats.values()) seat.error = null;
    issue = null; mode = 'stepping'; stepPermits = 1;
    changed(); schedule(); return status();
  }
  function configure(next) {
    const updated = { ...settings };
    for (const key of [...Object.keys(DEFAULT_LIMITS), 'maxOutputTokens']) {
      if (key === 'maxOutputTokens' && next[key] === null) delete updated[key];
      else if (next[key] !== undefined) updated[key] = positive(next[key], key);
    }
    if (updated.maxConcurrent !== 1) throw new Error('Only one player can run at a time; maxConcurrent must be 1');
    for (const key of Object.keys(settings)) delete settings[key];
    Object.assign(settings, updated);
    if (Object.values(budgetMessages).includes(issue)) issue = limitReached();
    changed(); return status();
  }
  return {
    notify, wake, handoff, authorizeDecision, authorizeManual, complete,
    start, step, status, snapshot, configure,
    pause: () => cancel('paused'), stop: () => cancel('stopped'), finish: () => cancel('finished'),
    async idle() { await Promise.all([...seats.values()].flatMap(s => s.active?.promise ? [s.active.promise] : [])); },
  };
}
