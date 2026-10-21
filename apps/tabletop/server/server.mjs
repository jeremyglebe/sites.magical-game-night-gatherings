import { serveClient } from './client-assets.mjs';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { applyActions, cardDetails, createTable, observe, eventsSince, sideboardingView } from './table.mjs';
import { referenceLines } from './references.mjs';
import { readRules } from './rules.mjs';
import { createRecording, appendRecording, recordingMarkdown } from './game-log.mjs';
import { serveAvatar } from './avatars.mjs';
import { createSurvey, submitSurveyResponse } from '../shared/survey.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const matchFinished = state => !!state.result && (!state.series || state.series.status === 'complete');
const json = (response, status, value) => {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
};

export async function startTable({ session, setup, port = 5180, onCommit, onDecision, beforeAction,
  postgame = false, beforeSurvey, onSurvey, takeSteering, comprehensivePath, basicPath, cardRulings = {} }) {
  // The host supplies a validated, match-pinned reference cache. It augments
  // reads of legacy cards without editing the authoritative state or its log.
  cardRulings = structuredClone(cardRulings);
  session = resolve(session);
  mkdirSync(dirname(session), { recursive: true });
  const lock = session + '.lock';
  const fd = openSync(lock, 'wx', 0o600);
  closeSync(fd);
  let saved;
  let exportError = null;
  function writeExport(path, data) {
    writeFileSync(path + '.tmp', data, { mode: 0o600 });
    renameSync(path + '.tmp', path);
  }
  function refreshExports() {
    if (!saved.recording) return;
    const errors = [];
    for (const [extension, render] of [
      ['json', () => JSON.stringify(saved.recording, null, 2)],
      ['md', () => recordingMarkdown(saved.recording)],
    ]) {
      try { writeExport(session + '.game.' + extension, render()); }
      catch (error) { errors.push(`${extension}: ${error.message}`); }
    }
    exportError = errors.length ? errors.join('; ') : null;
    if (exportError) console.warn('Game state is saved, but a derived log export could not be refreshed: ' + exportError);
  }
  function persist(next) {
    const temporary = session + '.tmp';
    writeFileSync(temporary, JSON.stringify(next), { mode: 0o600 });
    renameSync(temporary, session);
    saved = next;
    // A failure writing a derived export must not turn an accepted, durable
    // action into an API error. The authoritative session includes its recording.
    refreshExports();
  }
  try {
    const resumed = existsSync(session);
    if (resumed) saved = JSON.parse(readFileSync(session, 'utf8'));
    else {
      if (!setup) throw new Error('A new session needs --setup with a deck configuration');
      const config = typeof setup === 'string' ? JSON.parse(readFileSync(setup, 'utf8')) : setup;
      const state = createTable(config);
      if (postgame) createSurvey(config.players, state.revision); // Validate participants before starting play.
      const references = (config.references || []).map(path => ({ path, text: referenceLines(path).join('\n') }));
      persist({ state, recording: createRecording(state, config, references),
        credentials: Object.fromEntries(state.players.map(p => [p.id, randomUUID()])) });
    }
    if (saved.state.version !== 1) throw new Error('Unsupported session version');
    if (resumed && postgame && !saved.state.result) createSurvey(saved.recording?.setup?.players || saved.state.players, saved.state.revision);
    if (resumed) refreshExports();
  } catch (error) { unlinkSync(lock); throw error; }

  function readCard(actor, id) {
    // Check visibility before looking up any reference data, including for
    // anonymous spectators. Existing card-local snapshots always take priority.
    const details = cardDetails(saved.state, actor, id);
    if (details.rulings_cache.status !== 'not_fetched' || !details.scryfall_id
      || !Object.hasOwn(cardRulings, details.scryfall_id)) return details;
    const cached = cardRulings[details.scryfall_id];
    if (cached?.rulings_cache?.status !== 'fetched' || !Array.isArray(cached.rulings)) return details;
    return { ...details, rulings: structuredClone(cached.rulings), rulings_cache: structuredClone(cached.rulings_cache) };
  }

  function surveyForPlayer(actor) {
    const survey = saved.recording?.postgame;
    if (!survey) return { available: false, message: 'No post-game survey has started.' };
    const player = survey.players.find(player => player.id === actor);
    if (!player) throw new Error('Unknown survey participant');
    // Players never receive other respondents' answers, even after completion.
    return structuredClone({ available: true, version: survey.version, schema: survey.schema,
      status: survey.status, resultRevision: survey.resultRevision, player,
      players: survey.players, ...(survey.series ? { series: survey.series } : {}),
      response: survey.responses[actor] || null });
  }
  function submitSurvey(actor, args) {
    if (!matchFinished(saved.state) || !saved.recording?.postgame) throw new Error('The match has not entered its post-game survey');
    if (Object.hasOwn(saved.recording.postgame.responses, actor)) {
      // A lost reply must not make a saved response look rejected. Validate an
      // exact retry under the authenticated seat without advancing twice.
      submitSurveyResponse(saved.recording.postgame, actor, args.answers);
      return { accepted: true, decision_completed: true, status: saved.recording.postgame.status, already_submitted: true };
    }
    const authorization = beforeSurvey?.(actor, args);
    if (authorization && typeof authorization.then === 'function') {
      authorization.catch?.(() => {});
      throw new Error('Survey authorization must be synchronous');
    }
    const survey = submitSurveyResponse(saved.recording.postgame, actor, args.answers);
    persist({ ...saved, recording: { ...saved.recording, postgame: survey } });
    const completion = onSurvey?.(actor, args);
    return { accepted: true, decision_completed: true, status: survey.status,
      ...(completion && typeof completion === 'object' ? completion : {}) };
  }

  function steeringReply(actor, decisionId, requestedRevision) {
    const steering = takeSteering?.(actor, decisionId, requestedRevision);
    return steering ? { steering, table: observe(saved.state, actor) } : {};
  }
  function checkSteering(actor, args) {
    const details = steeringReply(actor, args.decision_id, args.revision);
    if (details.steering) {
      const error = new Error('New human table speech needs your attention. No action was applied. Read the steering messages and current table, then reconsider before retrying.');
      error.details = details;
      throw error;
    }
  }
  function act(actor, args) {
    const authorization = beforeAction?.(actor, args);
    if (authorization && typeof authorization.then === 'function') {
      authorization.catch?.(() => {});
      throw new Error('Action authorization must be synchronous');
    }
    checkSteering(actor, args);
    return commit(actor, args);
  }
  function chat(actor, text) {
    // Only the trusted local host exposes this entry point, after validating
    // a configured human seat. It cannot bypass action ownership for moves.
    return commit(actor, { revision: saved.state.revision, actions: [{ type: 'say', text }], reason: 'Public human table speech' });
  }
  function commit(actor, args) {
    if (matchFinished(saved.state)) throw new Error('Gameplay has ended; only post-game feedback may be submitted');
    if (saved.recording?.postgame) throw new Error('Gameplay has ended; only post-game feedback may be submitted');
    // No asynchronous boundary between checking revision and saving the batch.
    const previous = saved.state;
    const state = applyActions(saved.state, actor, args.revision, args.actions, args.reason);
    const recording = appendRecording(saved.recording || createRecording(previous), previous, state);
    if (postgame && matchFinished(state) && !matchFinished(previous)) {
      recording.postgame = createSurvey(recording.setup?.players || state.players, state.revision, { series: state.series });
    }
    persist({ ...saved, state, recording });
    const completion = onCommit?.(state, actor);
    return {
      ...observe(state, actor),
      ...(completion && typeof completion === 'object' && !Array.isArray(completion) ? completion : {}),
    };
  }

  const server = createServer(async (request, response) => {
    let actor;
    let decisionId;
    try {
      const url = new URL(request.url, 'http://localhost');
      if (request.method === 'GET' && serveAvatar(url.pathname, response)) return;
      if (serveClient(request, response, url)) return;
      if (request.method === 'GET' && url.pathname === '/api/table') {
        json(response, 200, observe(saved.state));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/public-card') {
        json(response, 200, readCard(null, url.searchParams.get('id')));
        return;
      }
      const token = request.headers.authorization?.replace(/^Bearer /, '');
      actor = Object.entries(saved.credentials).find(([, value]) => value === token)?.[0];
      if (!actor) { json(response, 401, { error: 'Player connection required' }); return; }
      decisionId = request.headers['x-tabletop-decision-id'];
      const reply = value => json(response, 200, { ...value, ...steeringReply(actor, decisionId) });
      if (request.method === 'GET' && url.pathname === '/api/observe') {
        reply(observe(saved.state, actor));
      } else if (request.method === 'GET' && url.pathname === '/api/preparation') {
        const view = observe(saved.state, actor);
        reply({ revision: view.revision, preparation: view.preparation || null });
      } else if (request.method === 'GET' && url.pathname === '/api/sideboard') {
        reply({ revision: saved.state.revision, ...sideboardingView(saved.state, actor) });
      } else if (request.method === 'GET' && url.pathname === '/api/events') {
        reply(eventsSince(saved.state, actor, Number(url.searchParams.get('since') || 0)));
      } else if (request.method === 'GET' && url.pathname === '/api/rules') {
        reply(readRules(Object.fromEntries(url.searchParams), { comprehensivePath, basicPath }));
      } else if (request.method === 'GET' && url.pathname === '/api/card') {
        reply(readCard(actor, url.searchParams.get('id')));
      } else if (request.method === 'GET' && url.pathname === '/api/references') {
        const allowed = saved.state.references;
        if (!Array.isArray(allowed)) throw new Error('Invalid reference list');
        const path = url.searchParams.get('path');
        if (!path) {
          reply({
            paths: allowed,
            note: allowed.length
              ? 'Read these selected format and box rules. General Magic rules are available through read_rules.'
              : 'No optional format or box overrides are selected. Play ordinary Magic with the supplied decks, life totals, and starting player. This is not a missing configuration. Use read_rules for the quickstart and Comprehensive Rules.',
          });
          return;
        }
        if (!allowed.includes(path) || !/^(formats|rules|boxed-sets)\/.*\.md$/.test(path)) throw new Error('Reference not configured');
        const pinned = saved.recording?.references?.find(reference => reference.path === path);
        const lines = pinned ? pinned.text.split('\n') : referenceLines(path);
        const query = url.searchParams.get('query');
        if (query) {
          reply({
            path, total_lines: lines.length,
            matches: lines.map((line, i) => ({ line: i + 1, text: line }))
              .filter(line => line.text.toLowerCase().includes(query.toLowerCase())).slice(0, 30),
          });
        } else {
          const start = Math.max(1, Number(url.searchParams.get('start') || 1));
          const count = Math.min(120, Math.max(1, Number(url.searchParams.get('count') || 80)));
          if (!Number.isInteger(start) || !Number.isInteger(count)) throw new Error('Invalid line range');
          reply({ path, start, total_lines: lines.length, text: lines.slice(start - 1, start - 1 + count).join('\n') });
        }
      } else if (request.method === 'GET' && url.pathname === '/api/survey') {
        reply(surveyForPlayer(actor));
      } else if (request.method === 'POST' && ['/api/act', '/api/decision', '/api/survey'].includes(url.pathname)) {
        let body = '';
        for await (const chunk of request) {
          body += chunk;
          if (Buffer.byteLength(body) > 200000) { json(response, 413, { error: 'Request too large' }); return; }
        }
        const args = JSON.parse(body);
        if (url.pathname === '/api/survey') {
          json(response, 200, submitSurvey(actor, args));
          return;
        }
        if (url.pathname === '/api/decision') {
          if (!onDecision) throw new Error('No player coordinator is attached to this table');
          checkSteering(actor, args);
          const result = await onDecision(actor, args);
          json(response, 200, result ?? { accepted: true });
          return;
        }
        json(response, 200, act(actor, args));
      } else json(response, 404, { error: 'Unknown endpoint' });
    } catch (error) {
      json(response, 400, { error: error.message, ...(error.details || (actor ? steeringReply(actor, decisionId) : {})) });
    }
  });
  server.on('close', () => { if (existsSync(lock)) unlinkSync(lock); });
  try {
    await new Promise((ok, fail) => {
      server.once('error', fail);
      server.listen(port, '127.0.0.1', ok);
    });
  } catch (error) { if (existsSync(lock)) unlinkSync(lock); throw error; }
  return {
    server, url: 'http://127.0.0.1:' + server.address().port,
    getState: () => saved.state,
    getRecording: () => saved.recording,
    getSurvey: surveyForPlayer,
    submitSurvey, act, chat, readCard,
    getExportError: () => exportError,
    getToken: seat => saved.credentials[seat],
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: {
    session: { type: 'string', default: '.playtest/table.json' },
    setup: { type: 'string' }, port: { type: 'string', default: '5180' },
  } });
  try {
    const { server, url } = await startTable({ ...values, port: Number(values.port) });
    console.log('Spectator: ' + url);
    console.log('Session: ' + resolve(values.session));
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
