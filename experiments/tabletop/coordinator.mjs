import { randomUUID } from 'node:crypto';

export const DEFAULT_PLAYER = Object.freeze({ model: 'gpt-6-luna', reasoning: 'high' });
export const DEFAULT_LIMITS = Object.freeze({
  maxConcurrent: 4, maxDecisions: 2000, decisionTimeoutMs: 120000,
});

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

/**
 * A notification scheduler, not a Magic rules engine.
 * getView/getEvents must return projections for the supplied seat. onChange is a
 * synchronous persistence callback; snapshots deliberately contain no tokens or
 * private table views. A restored coordinator always begins paused.
 */
export function createCoordinator({
  players, runPlayer, getView, getEvents = () => [], onChange = () => {},
  saved = null, limits = {},
}) {
  if (!Array.isArray(players) || !players.length) throw new Error('Supply at least one player');
  if (typeof runPlayer !== 'function' || typeof getView !== 'function') throw new Error('Player runner and table view callbacks are required');
  const settings = { ...DEFAULT_LIMITS, ...limits };
  for (const key of Object.keys(DEFAULT_LIMITS)) positive(settings[key], key);
  if (settings.maxOutputTokens !== undefined) positive(settings.maxOutputTokens, 'maxOutputTokens');
  const seats = new Map();
  for (const input of players) {
    if (!input || typeof input.id !== 'string' || !/^[a-zA-Z0-9_-]{1,40}$/.test(input.id) || seats.has(input.id)) {
      throw new Error('Players need unique valid IDs');
    }
    const previous = saved?.players?.find(p => p.id === input.id);
    let lastCompleted = Number.isSafeInteger(previous?.lastCompleted) ? previous.lastCompleted : -1;
    const pending = [...(previous?.pending || [])];
    if (previous?.active?.completion) lastCompleted = Math.max(lastCompleted, previous.active.revision);
    else if (Number.isSafeInteger(previous?.active?.revision)) pending.unshift(previous.active.revision);
    seats.set(input.id, {
      config: { ...DEFAULT_PLAYER, ...input },
      sessionId: previous?.sessionId || null,
      pending: [...new Set(pending)].filter(r => Number.isSafeInteger(r) && r > lastCompleted).sort((a, b) => a - b),
      lastCompleted,
      decisions: previous?.decisions || 0,
      usage: { ...emptyUsage(), ...previous?.usage },
      lastDecision: previous?.lastDecision || null,
      error: previous?.active ? 'Previous decision was interrupted; resume to reconsider the current table.' : previous?.error || null,
      active: null,
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
  let nextSeat = 0;

  function snapshot() {
    return {
      version: 1, mode, latestRevision, decisions, limits: clone(settings), issue,
      players: [...seats.values()].map(s => ({
        id: s.config.id, name: s.config.name || s.config.id,
        model: s.config.model, reasoning: s.config.reasoning,
        enabled: s.config.enabled !== false, sessionId: s.sessionId,
        pending: [...s.pending], lastCompleted: s.lastCompleted,
        decisions: s.decisions, usage: clone(s.usage),
        lastDecision: clone(s.lastDecision), error: s.error,
        active: s.active ? {
          revision: s.active.revision, decisionId: s.active.id, startedAt: s.active.startedAt,
          completion: clone(s.active.completion),
        } : null,
      })),
    };
  }
  const changed = () => onChange(snapshot());
  function status() {
    const result = snapshot();
    const active = result.players.filter(p => p.active).length;
    const queued = result.players.reduce((sum, p) => sum + p.pending.length, 0);
    return {
      ...result, active, queued,
      state: mode === 'running' && !active && !queued ? 'stalled' : mode,
      message: mode === 'running' && !active && !queued
        ? 'All players are idle. No further calls will run until a table change or explicit intervention.'
        : issue,
      usage: result.players.reduce((sum, p) => { addUsage(sum, p.usage); return sum; }, emptyUsage()),
    };
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; pump(); });
  }
  function limitReached() {
    if (decisions >= settings.maxDecisions) return 'Decision limit reached. Increase the limit before resuming.';
    const output = [...seats.values()].reduce((total, s) => total + s.usage.output_tokens, 0);
    if (settings.maxOutputTokens && output >= settings.maxOutputTokens) return 'Output-token limit reached. Increase the limit before resuming.';
    return null;
  }
  function pump() {
    if (mode !== 'running' && mode !== 'stepping') return;
    const limit = limitReached();
    if (limit) { mode = 'paused'; issue = limit; stepPermits = 0; changed(); return; }
    const values = [...seats.values()];
    if (mode === 'stepping' && !values.some(s => s.active || (s.config.enabled !== false && s.pending.length))) {
      mode = 'paused'; stepPermits = 0; issue = 'No pending player decisions.';
      changed(); return;
    }
    let available = settings.maxConcurrent - values.filter(s => s.active).length;
    for (let scanned = 0; scanned < values.length && available > 0; scanned++) {
      if (mode === 'stepping' && stepPermits <= 0) break;
      const seat = values[nextSeat++ % values.length];
      if (seat.config.enabled === false || seat.active || !seat.pending.length || seat.error) continue;
      if (decisions >= settings.maxDecisions) break;
      if (mode === 'stepping') stepPermits--;
      available--;
      launch(seat);
    }
  }
  async function launch(seat) {
    const revision = seat.pending.shift();
    const controller = new AbortController();
    const active = {
      id: randomUUID(), revision, startedAt: new Date().toISOString(),
      controller, completion: null, timedOut: false, promise: null,
    };
    seat.active = active;
    seat.error = null;
    decisions++;
    seat.decisions++;
    changed();
    let timeout;
    const job = (async () => {
      try {
        const view = await getView(seat.config.id);
        const history = await getEvents(seat.config.id, revision - 1, revision);
        const events = (Array.isArray(history) ? history : history.events || []).filter(e => e.revision <= revision);
        if (controller.signal.aborted) return;
        timeout = setTimeout(() => {
          active.timedOut = true;
          controller.abort(new Error('Player decision timed out'));
        }, settings.decisionTimeoutMs);
        const result = await runPlayer({
          player: clone(seat.config), sessionId: seat.sessionId,
          revision, decisionId: active.id, view, events,
          signal: controller.signal,
          onSession(id) {
            if (typeof id !== 'string' || !id) throw new Error('Invalid Codex session ID');
            if (seat.sessionId && seat.sessionId !== id) throw new Error('Codex resumed a different player session');
            if ([...seats.values()].some(other => other !== seat && other.sessionId === id)) throw new Error('Different players cannot share a Codex session');
            seat.sessionId = id;
            changed();
          },
          onUsage(usage) { addUsage(seat.usage, usage); changed(); },
        });
        if (result?.sessionId) {
          if (seat.sessionId && seat.sessionId !== result.sessionId) throw new Error('Codex resumed a different player session');
          if ([...seats.values()].some(other => other !== seat && other.sessionId === result.sessionId)) throw new Error('Different players cannot share a Codex session');
          seat.sessionId = result.sessionId;
        }
        // Runners either stream usage with onUsage or return it, not both.
        if (result?.usage) addUsage(seat.usage, result.usage);
        if (active.timedOut) throw new Error('Player decision timed out');
        if (!controller.signal.aborted && !active.completion) throw new Error('Player exited without calling complete_decision');
        if (active.completion) {
          seat.lastCompleted = Math.max(seat.lastCompleted, revision);
          seat.lastDecision = active.completion;
          if (active.completion.status === 'needs_help') {
            issue = `${seat.config.name || seat.config.id} requested help: ${active.completion.note || 'No details provided'}`;
            mode = 'paused';
            for (const other of seats.values()) if (other !== seat) other.active?.controller.abort(new Error('Another player requested help'));
          }
        }
      } catch (error) {
        if (!controller.signal.aborted || active.timedOut) {
          seat.error = String(error.message || error);
          issue = `${seat.config.name || seat.config.id}: ${seat.error}`;
          mode = 'paused';
          for (const other of seats.values()) if (other !== seat) other.active?.controller.abort(new Error('Another player failed'));
        }
      } finally {
        clearTimeout(timeout);
        if (active.completion) {
          seat.lastCompleted = Math.max(seat.lastCompleted, revision);
          seat.lastDecision = active.completion;
        } else if (mode !== 'finished' && !seat.pending.includes(revision)) {
          seat.pending.unshift(revision);
        }
        seat.active = null;
        if (mode === 'stepping' && stepPermits === 0 && ![...seats.values()].some(s => s.active)) mode = 'paused';
        changed();
        schedule();
      }
    })();
    active.promise = job;
  }
  function notify(revision) {
    if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Invalid table revision');
    if (mode === 'finished') return status();
    latestRevision = Math.max(latestRevision, revision);
    for (const seat of seats.values()) {
      if (seat.config.enabled === false) continue;
      const known = seat.pending.reduce((max, r) => Math.max(max, r), Math.max(seat.lastCompleted, seat.active?.revision ?? -1));
      for (let next = known + 1; next <= revision; next++) seat.pending.push(next);
    }
    changed();
    schedule();
    return status();
  }
  function authorizeDecision(id, decisionId) {
    const seat = seats.get(id);
    if (!seat?.active) throw new Error('No active decision for this player');
    if (decisionId !== seat.active.id || seat.active.controller.signal.aborted) throw new Error('This decision is no longer active');
    if (seat.active.completion) throw new Error('Decision already completed');
    return true;
  }
  function complete(id, completion) {
    authorizeDecision(id, completion?.decision_id);
    const seat = seats.get(id);
    if (!['no_op', 'acted', 'needs_help'].includes(completion.status)) throw new Error('Unknown completion status');
    if (completion.note !== undefined && (typeof completion.note !== 'string' || completion.note.length > 2000)) throw new Error('Invalid completion note');
    seat.active.completion = { status: completion.status, note: completion.note || '', revision: seat.active.revision };
    changed();
    return { accepted: true, status: completion.status };
  }
  function start() {
    if (mode === 'finished') throw new Error('This match has finished');
    issue = null;
    for (const seat of seats.values()) seat.error = null;
    mode = 'running'; stepPermits = 0;
    changed(); schedule(); return status();
  }
  function cancel(nextMode) {
    mode = nextMode; stepPermits = 0;
    for (const seat of seats.values()) {
      seat.active?.controller.abort(new Error(nextMode));
      if (nextMode === 'finished') seat.pending = [];
    }
    changed();
    return status();
  }
  function step() {
    if (mode === 'finished') throw new Error('This match has finished');
    if ([...seats.values()].some(s => s.active)) throw new Error('Wait for active decisions to stop before stepping');
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
    for (const key of Object.keys(settings)) delete settings[key];
    Object.assign(settings, updated);
    changed();
    return status();
  }
  return {
    notify, authorizeDecision, complete, start, step, status, snapshot, configure,
    pause: () => cancel('paused'),
    stop: () => cancel('stopped'),
    finish: () => cancel('finished'),
    async idle() {
      // Intended for shutdown/tests, not a polling loop.
      await Promise.all([...seats.values()].flatMap(s => s.active?.promise ? [s.active.promise] : []));
    },
  };
}
