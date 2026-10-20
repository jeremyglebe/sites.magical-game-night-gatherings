import { createServer } from 'node:http';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { startTable } from './server.mjs';
import { observe, eventsSince } from './table.mjs';
import { recordingMarkdown } from './game-log.mjs';
import { createCoordinator } from './coordinator.mjs';
import { createCodexRunner } from './codex-player.mjs';
import { readRules, defaultBasicRulesPath } from './rules.mjs';
import { readCodexPlanUsage } from './plan-usage.mjs';
import { recordPlanUsage, planUsageView } from './usage-tracking.mjs';
import { assignAvatars, serveAvatar, avatarNames } from './avatars.mjs';
import { createArchive } from './archive.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const precons = JSON.parse(readFileSync(join(here, 'precons.json'), 'utf8'));
export const defaults = { model: 'gpt-6-luna', reasoning: 'high', speed: 'standard' };
export const presets = precons.players.map((p, i) => ({
  id: i === 0 ? 'white' : 'green', name: p.name, cards: p.deck.reduce((sum, c) => sum + (c.count ?? 1), 0),
}));
const json = (response, status, value) => {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
};
function save(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path + '.tmp', JSON.stringify(value, null, 2), { mode: 0o600 });
  renameSync(path + '.tmp', path);
}
async function bodyJSON(request) {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new Error('Use application/json');
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 4_000_000) throw new Error('Match setup is too large');
  }
  return JSON.parse(body);
}
const closeServer = server => new Promise((ok, fail) => server.close(error => error ? fail(error) : ok()));

export function normalizeSetup(input) {
  if (!input || !Array.isArray(input.players) || input.players.length < 1) throw new Error('Add at least one player');
  const players = input.players.map((p, i) => {
    const choice = p.deck ?? p.deckPreset ?? (i % 2 ? 'green' : 'white');
    const preset = typeof choice === 'string' ? presets.findIndex(item => item.id === choice) : -1;
    if (!Array.isArray(choice) && preset < 0) throw new Error('Unknown deck preset');
    const model = p.model || defaults.model;
    const reasoning = p.reasoning || defaults.reasoning;
    if (!/^[\w.-]{1,120}$/.test(model)) throw new Error('Invalid model');
    if (!['low', 'medium', 'high', 'xhigh', 'max'].includes(reasoning)) throw new Error('Invalid reasoning setting');
    return {
      ...p, id: p.id || `p${i + 1}`, name: p.name || `Player ${i + 1}`,
      deck: structuredClone(preset >= 0 ? precons.players[preset].deck : choice),
      deckPreset: preset >= 0 ? presets[preset].id : null,
      model, reasoning, ai: p.ai !== false,
    };
  });
  return {
    ...input, title: input.title || 'Local playtest', players: assignAvatars(players),
    layout: input.layout === 'emperor' ? 'emperor' : 'table',
    references: input.references || [],
  };
}

export async function startApp({
  directory = '.playtest', port = 5180, setup, resume = true,
  runPlayerFactory = createCodexRunner, comprehensivePath, basicRulesPath = defaultBasicRulesPath,
  readPlanUsage = readCodexPlanUsage, usageRefreshMs = 60_000,
} = {}) {
  const root = resolve(directory);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const currentFile = join(root, 'current.json');
  let match = null;
  let table = null;
  let coordinator = null;
  let creating = false;
  let activeRulesPath;
  let activeBasicPath;
  let usageRequest = null;
  let usageError = null;
  let lastUsageAttempt = 0;
  let closing = false;
  let controlVersion = 0;
  const configuredRulesPath = comprehensivePath || process.env.TABLETOP_COMPREHENSIVE_RULES
    || resolve(here, '../../.playtest/rules/ComprehensiveRules.txt');

  function appState() {
    return {
      match: match ? {
        id: match.id, title: match.config.title, layout: match.config.layout,
        phase: coordinator?.status().state || 'paused',
        session: match.session, players: match.config.players.map(({ deck, ...p }) => p),
      } : null,
      coordinator: coordinator?.status() || null, presets, defaults, avatars: avatarNames, archive: true,
      planUsage: planUsageView(match?.planUsage, { error: usageError, refreshing: !!usageRequest }),
      rules: readRules({}, { comprehensivePath: activeRulesPath || configuredRulesPath, basicPath: activeBasicPath || basicRulesPath }),
    };
  }
  function saveMatch() {
    if (match) save(join(root, 'matches', match.id, 'match.json'), {
      id: match.id, config: match.config, coordinator: coordinator?.snapshot() || match.savedCoordinator,
      planUsage: match.planUsage,
    });
  }
  async function refreshPlanUsage({ force = false } = {}) {
    if (usageRequest) return usageRequest;
    if (!match || !readPlanUsage || !match.config.players.some(p => p.ai)) return appState().planUsage;
    // The browser can poll local state freely; quota reads are cached separately.
    if (Date.now() - lastUsageAttempt < (force ? 5_000 : usageRefreshMs)) return appState().planUsage;
    lastUsageAttempt = Date.now();
    const target = match;
    const decisionsAtStart = coordinator.status().decisions;
    usageRequest = (async () => {
      try {
        const sample = await Promise.resolve().then(() => readPlanUsage());
        if (match === target) {
          target.planUsage = recordPlanUsage(target.planUsage, sample, decisionsAtStart);
          usageError = null;
          saveMatch();
        }
      } catch {
        if (match === target) usageError = 'Could not refresh your Codex allowance. Last successful reading is shown when available.';
      } finally { usageRequest = null; }
      return appState().planUsage;
    })();
    return usageRequest;
  }
  async function unload() {
    if (coordinator) {
      if (coordinator.status().mode !== 'finished') coordinator.pause();
      await coordinator.idle();
      saveMatch();
    }
    if (table) await closeServer(table.server);
    table = null;
    coordinator = null;
    match = null;
    activeRulesPath = undefined;
    activeBasicPath = undefined;
  }
  async function loadMatch(id, config, savedCoordinator, savedPlanUsage) {
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Invalid saved match');
    config = { ...config, players: assignAvatars(config.players) };
    const folder = join(root, 'matches', id);
    const session = join(folder, 'session.json');
    const rulesPath = join(folder, 'ComprehensiveRules.txt');
    const basicPath = join(folder, 'BasicRules.txt');
    const rulingsPath = join(folder, 'CardRulings.json');
    mkdirSync(folder, { recursive: true, mode: 0o700 });
    if (!existsSync(rulesPath) && existsSync(configuredRulesPath)) copyFileSync(configuredRulesPath, rulesPath);
    if (!existsSync(basicPath) && basicRulesPath && existsSync(basicRulesPath)) copyFileSync(basicRulesPath, basicPath);
    if (!existsSync(rulingsPath)) save(rulingsPath, Object.fromEntries(precons.players.flatMap(p => p.deck)
      .filter(card => card.scryfall_id && card.rulings_cache?.status === 'fetched')
      .map(({ scryfall_id, rulings, rulings_cache }) => [scryfall_id, { rulings, rulings_cache }])));
    const cardRulings = JSON.parse(readFileSync(rulingsPath, 'utf8'));
    const nextMatch = { id, config, session, savedCoordinator, planUsage: savedPlanUsage };
    let nextTable;
    let nextCoordinator;
    try {
      nextTable = await startTable({
        session, setup: config, port: 0, comprehensivePath: rulesPath, basicPath, cardRulings,
        onCommit: (state, actor) => {
          const action = state.events.at(-1)?.actions?.at(-1);
          let handoff;
          if (action?.type === 'pass' || action?.type === 'pass_turn') {
            handoff = nextCoordinator?.handoff(actor, action.next, state.revision, action.type === 'pass_turn' ? 'turn' : 'priority');
          } else nextCoordinator?.notify(state.revision);
          if (state.result) nextCoordinator?.finish();
          return handoff;
        },
        onDecision: (seat, decision) => nextCoordinator?.complete(seat, decision),
        beforeAction: (seat, args) => {
          if (config.players.find(p => p.id === seat)?.ai) nextCoordinator.authorizeDecision(seat, args.decision_id);
          else nextCoordinator.authorizeManual(seat);
        },
      });
      const runPlayer = runPlayerFactory({
        workspaceRoot: join(folder, 'players'),
        getConnection: seat => ({ url: nextTable.url, token: nextTable.getToken(seat), seat }),
        quickstart: readRules({ source: 'quickstart', start: 1, count: 120 }, { comprehensivePath: rulesPath }).text,
        basicRules: existsSync(basicPath) ? readFileSync(basicPath, 'utf8') : '',
      });
      nextCoordinator = createCoordinator({
        players: config.players.map(p => ({ ...p, enabled: p.ai })), runPlayer, saved: savedCoordinator,
        limits: { ...config.limits, ...savedCoordinator?.limits },
        getView: seat => observe(nextTable.getState(), seat),
        getEvents: (seat, after, through) => eventsSince(nextTable.getState(), seat, Math.max(0, after)).events.filter(e => e.revision <= through),
        getPublicEvents: (after, through) => eventsSince(nextTable.getState(), null, Math.max(0, after)).events.filter(e => e.revision <= through),
        onChange: snapshot => {
          const wasActive = nextMatch.savedCoordinator?.players?.some(p => p.active);
          nextMatch.savedCoordinator = snapshot;
          save(join(folder, 'match.json'), { id, config, coordinator: snapshot, planUsage: nextMatch.planUsage });
          if (match === nextMatch && !closing && !creating) {
            const becameIdle = wasActive && !snapshot.players.some(p => p.active);
            void refreshPlanUsage({ force: becameIdle && !['running', 'stepping'].includes(snapshot.mode) });
          }
        },
      });
      if (nextTable.getState().result) nextCoordinator.finish();
      else {
        const state = nextTable.getState();
        nextCoordinator.notify(state.revision);
        if (!savedCoordinator || (savedCoordinator.version ?? 1) < 2) {
          // New matches start with setup; old broadcast queues migrate to one
          // explicit owner inferred from their existing physical turn marker.
          nextCoordinator.wake(state.turn.priority || state.turn.active, state.revision,
            state.turn.phase.toLowerCase() === 'setup' ? 'setup' : 'resume');
        } else if (state.revision > (savedCoordinator.latestRevision ?? -1)) {
          // A table commit can survive a crash just before coordinator save.
          // Recover the last explicit handoff, never broadcast ordinary actions.
          const action = state.events.at(-1)?.actions?.at(-1);
          if (action?.type === 'pass' || action?.type === 'pass_turn') {
            nextCoordinator.wake(action.next, state.revision, action.type === 'pass_turn' ? 'turn' : 'priority');
          }
        }
      }
      save(join(folder, 'match.json'), { id, config, coordinator: nextCoordinator.snapshot(), planUsage: nextMatch.planUsage });
      // Fully construct and persist the replacement before releasing the current match.
      await usageRequest;
      await unload();
      match = nextMatch;
      table = nextTable;
      coordinator = nextCoordinator;
      activeRulesPath = rulesPath;
      activeBasicPath = basicPath;
      usageError = null;
      lastUsageAttempt = 0;
      save(currentFile, { id });
      return appState();
    } catch (error) {
      if (nextCoordinator) {
        if (nextCoordinator.status().mode !== 'finished') nextCoordinator.stop();
        await nextCoordinator.idle();
      }
      if (nextTable?.server.listening) await closeServer(nextTable.server);
      if (table === nextTable) {
        match = null; table = null; coordinator = null; activeRulesPath = undefined; activeBasicPath = undefined;
      }
      throw error;
    }
  }

  async function createMatch(input) {
    if (creating) throw new Error('A match is already being created');
    creating = true;
    try {
      const config = normalizeSetup(input);
      // Validate the new setup before closing a prior match.
      const { createTable } = await import('./table.mjs');
      createTable({ ...config, shuffle: false });
      if (['running', 'stepping'].includes(coordinator?.status().mode)) {
        throw new Error('Pause the current match before creating another');
      }
      controlVersion++;
      const result = await loadMatch(randomUUID(), config);
      void refreshPlanUsage();
      return result;
    } finally { creating = false; }
  }

  if (setup) await createMatch(typeof setup === 'string' ? JSON.parse(readFileSync(resolve(setup), 'utf8')) : setup);
  else if (resume && existsSync(currentFile)) {
    const { id } = JSON.parse(readFileSync(currentFile, 'utf8'));
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Invalid saved match');
    const saved = JSON.parse(readFileSync(join(root, 'matches', id, 'match.json'), 'utf8'));
    await loadMatch(id, saved.config, saved.coordinator, saved.planUsage);
  }

  const archive = createArchive({ directory: root, getCurrent: id => match?.id === id
    ? { id: match.id, config: match.config, recording: table?.getRecording() } : null });
  const server = createServer(async (request, response) => {
    try {
      const host = request.headers.host;
      const expectedPort = server.address().port;
      if (![ `127.0.0.1:${expectedPort}`, `localhost:${expectedPort}` ].includes(host)) {
        json(response, 403, { error: 'Local application requests only' }); return;
      }
      if (request.headers.origin && ![`http://127.0.0.1:${expectedPort}`, `http://localhost:${expectedPort}`].includes(request.headers.origin)) {
        json(response, 403, { error: 'Cross-origin application requests are disabled' }); return;
      }
      const url = new URL(request.url, `http://${host}`);
      if (request.method === 'GET' && serveAvatar(url.pathname, response)) return;
      if (archive.handle(request, response, url)) return;
      if (request.method === 'GET' && url.pathname === '/') {
        response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store',
          'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' https://cards.scryfall.io data:; connect-src 'self'; frame-ancestors 'none'" });
        response.end(readFileSync(join(here, 'index.html'))); return;
      }
      if (request.method === 'GET' && url.pathname === '/api/app') { json(response, 200, appState()); return; }
      if (request.method === 'POST' && url.pathname === '/api/usage/refresh') {
        json(response, 200, await refreshPlanUsage({ force: true })); return;
      }
      if (request.method === 'POST' && url.pathname === '/api/match') {
        json(response, 201, await createMatch(await bodyJSON(request))); return;
      }
      if (!match) { json(response, 404, { error: 'Create a match first' }); return; }
      if (request.method === 'GET' && url.pathname === '/api/history') {
        const since = Number(url.searchParams.get('since') || 0);
        json(response, 200, eventsSince(table.getState(), null, since)); return;
      }
      if (request.method === 'GET' && ['/api/table', '/api/public-card'].includes(url.pathname)) {
        const result = await fetch(table.url + url.pathname + url.search);
        response.writeHead(result.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        response.end(await result.text()); return;
      }
      if (request.method === 'GET' && url.pathname === '/api/control/status') {
        json(response, 200, coordinator.status()); return;
      }
      if (request.method === 'POST' && url.pathname === '/api/control') {
        const { action, limits, player } = await bodyJSON(request);
        if (!['start', 'pause', 'step', 'stop', 'configure', 'wake'].includes(action)) throw new Error('Unknown match control');
        const target = coordinator;
        const version = ++controlVersion;
        if (action === 'configure') {
          if (!limits || typeof limits !== 'object' || Array.isArray(limits)) throw new Error('Supply run limits');
          coordinator.configure(limits);
          match.config.limits = coordinator.snapshot().limits;
        } else if (action === 'wake') {
          if (coordinator.status().mode !== 'paused' && coordinator.status().state !== 'stalled') throw new Error('Pause the match before giving control');
          coordinator.pause();
          coordinator.wake(player, table.getState().revision, 'resume');
        } else {
          if (action === 'start' || action === 'step') await refreshPlanUsage({ force: true });
          if (closing || version !== controlVersion || target !== coordinator) throw new Error('This control was superseded by a newer match control.');
          await coordinator[action]();
        }
        saveMatch();
        json(response, 200, coordinator.status()); return;
      }
      if (request.method === 'GET' && url.pathname === '/api/log') {
        const recording = table.getRecording();
        if (!recording) throw new Error('This legacy session has no exported recording');
        const markdown = url.searchParams.get('format') !== 'json';
        response.writeHead(200, {
          'Content-Type': markdown ? 'text/markdown; charset=utf-8' : 'application/json',
          'Content-Disposition': `attachment; filename="game-log.${markdown ? 'md' : 'json'}"`,
          'Cache-Control': 'no-store',
        });
        response.end(markdown ? recordingMarkdown(recording) : JSON.stringify(recording, null, 2)); return;
      }
      json(response, 404, { error: 'Unknown endpoint' });
    } catch (error) { json(response, 400, { error: error.message }); }
  });
  try {
    await new Promise((ok, fail) => { server.once('error', fail); server.listen(port, '127.0.0.1', ok); });
  } catch (error) {
    await unload();
    throw error;
  }
  void refreshPlanUsage();
  const usageTimer = setInterval(() => {
    if (['running', 'stepping'].includes(coordinator?.status().mode)) void refreshPlanUsage();
  }, usageRefreshMs);
  usageTimer.unref();
  return {
    server, url: `http://127.0.0.1:${server.address().port}`, createMatch, appState,
    refreshPlanUsage,
    getTable: () => table, getCoordinator: () => coordinator,
    async close() {
      closing = true;
      controlVersion++;
      clearInterval(usageTimer);
      if (coordinator && coordinator.status().mode !== 'finished') coordinator.pause();
      await coordinator?.idle();
      await refreshPlanUsage({ force: true });
      await unload();
      await closeServer(server);
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: {
    directory: { type: 'string', default: '.playtest' },
    setup: { type: 'string' }, port: { type: 'string', default: '5180' },
    headless: { type: 'boolean', default: false }, run: { type: 'boolean', default: false },
    'comprehensive-rules': { type: 'string' },
  } });
  let app;
  try {
    app = await startApp({
      directory: values.directory, setup: values.setup, port: Number(values.port),
      comprehensivePath: values['comprehensive-rules'] || process.env.TABLETOP_COMPREHENSIVE_RULES,
    });
    console.log(values.headless ? 'Headless match host ready. The viewer is optional.' : `Local playtester: ${app.url}`);
    let shuttingDown = false;
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
      shuttingDown = true;
      await app.close(); process.exit(0);
    });
    if (values.run) {
      if (!app.getCoordinator()) {
        await app.close();
        throw new Error('--run requires a setup or an existing saved match');
      }
      await app.refreshPlanUsage({ force: true });
      if (!shuttingDown) app.getCoordinator().start();
    }
  } catch (error) {
    if (app?.server.listening) await app.close();
    console.error(error.message);
    process.exitCode = 1;
  }
}
