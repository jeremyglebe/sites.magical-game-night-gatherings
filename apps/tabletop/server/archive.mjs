import { serveClient } from './client-assets.mjs';
import { defaultDataDirectory } from './paths.mjs';
import { constants, openSync, closeSync, fstatSync, readFileSync, readdirSync, lstatSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { avatarIds } from './avatars.mjs';
import { validateRecording as validateReplayRecording } from '../shared/replay.mjs';
import { validateSurvey } from '../shared/survey.mjs';

const validId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(id);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const json = (response, status, value) => {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin' });
  response.end(JSON.stringify(value));
};
const own = (value, key) => Object.hasOwn(value, key);
const pick = (value, keys) => Object.fromEntries(keys.filter(key => own(value, key)).map(key => [key, value[key]]));

function directory(path) {
  const info = lstatSync(path);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Not an archive directory');
}
function readJSON(path) {
  // Do not follow an archive entry out to an unrelated local file.
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if (!fstatSync(fd).isFile()) throw new Error('Not a recording file');
    return JSON.parse(readFileSync(fd, 'utf8'));
  } finally { closeSync(fd); }
}
function players(value) {
  return Array.isArray(value) && value.length > 0 && value.every(p => object(p) && typeof p.id === 'string' && typeof p.name === 'string');
}
function result(value) {
  return value === null || (object(value) && Array.isArray(value.winners) && value.winners.every(id => typeof id === 'string'));
}
function cards(value) {
  return object(value) && Object.values(value).every(card => object(card) && typeof card.id === 'string'
    && object(card.definition) && typeof card.definition.name === 'string');
}
function zones(value) {
  return object(value) && Object.values(value).every(zone => object(zone) && typeof zone.id === 'string'
    && Array.isArray(zone.cards) && zone.cards.every(id => typeof id === 'string'));
}
function turn(value) {
  return object(value) && Number.isSafeInteger(value.number) && typeof value.active === 'string'
    && (value.priority === null || typeof value.priority === 'string') && typeof value.phase === 'string';
}

export function validateRecording(value) {
  if (!object(value) || value.format !== 'game-night-playtest-log' || value.version !== 1
    || !object(value.initial) || value.initial.version !== 1 || !players(value.initial.players) || !cards(value.initial.cards)
    || !zones(value.initial.zones) || !turn(value.initial.turn) || !Number.isSafeInteger(value.initial.revision) || value.initial.revision < 0
    || !result(value.initial.result) || !Array.isArray(value.frames)) throw new Error('Unsupported or incomplete recording');
  let revision = value.initial.revision;
  for (const frame of value.frames) {
    if (!object(frame) || !object(frame.event) || !object(frame.delta)
      || !Number.isSafeInteger(frame.event.revision) || frame.event.revision <= revision
      || typeof frame.event.actor !== 'string' || typeof frame.event.at !== 'string'
      || !Array.isArray(frame.event.actions) || !frame.event.actions.every(action => object(action) && typeof action.type === 'string')
      || (own(frame.delta, 'players') && !players(frame.delta.players))
      || (own(frame.delta, 'result') && !result(frame.delta.result))
      || (own(frame.delta, 'turn') && !turn(frame.delta.turn))
      || frame.delta.revision !== frame.event.revision) {
      throw new Error('Unsupported or incomplete recording');
    }
    for (const key of ['cards', 'zones']) {
      if (own(frame.delta, key) && (!object(frame.delta[key]) || !(key === 'cards' ? cards : zones)(frame.delta[key].set)
        || !Array.isArray(frame.delta[key].removed) || !frame.delta[key].removed.every(id => typeof id === 'string'))) {
        throw new Error('Unsupported or incomplete recording');
      }
    }
    revision = frame.event.revision;
  }
  validateReplayRecording(value);
  if (own(value, 'postgame')) validateSurvey(value.postgame);
  return value;
}

function recordingOnly(source) {
  const recording = validateRecording(source);
  // Select the recording itself, never a session envelope or coordinator state.
  const clean = pick(recording, ['format', 'version', 'visibility', 'started_at', 'title', 'references', 'initial', 'frames', 'postgame', 'constructedDecks', 'gameDecks']);
  const setup = object(recording.setup) ? recording.setup : {};
  clean.setup = pick(setup, ['title', 'shuffle', 'layout', 'references', 'limits', 'preparation', 'series']);
  if (Array.isArray(setup.players)) clean.setup.players = setup.players.filter(object).map(p => pick(p,
    ['id', 'name', 'life', 'deck', 'sideboard', 'faction', 'deckPreset', 'model', 'reasoning', 'ai', 'avatar']));
  clean.references ??= [];
  return clean;
}

function summarize(id, recording, config) {
  let finalPlayers = recording.initial.players;
  let finalResult = recording.initial.result;
  let series = recording.initial.series;
  for (const frame of recording.frames) {
    if (frame.delta.players) finalPlayers = frame.delta.players;
    if (own(frame.delta, 'series')) series = frame.delta.series;
    if (own(frame.delta, 'result')) finalResult = frame.delta.result;
  }
  const last = recording.frames.at(-1)?.event;
  const survey = recording.postgame;
  const submitted = survey?.players?.filter(player => survey.responses?.[player.id]).length || 0;
  const feedback = survey ? { status: survey.status, submitted, total: survey.players?.length || 0 } : null;
  const configured = Array.isArray(config?.players) ? config.players : recording.setup.players || [];
  return {
    id, title: typeof recording.title === 'string' ? recording.title : 'Saved game',
    startedAt: recording.started_at || recording.initial.created_at || null,
    updatedAt: survey?.completedAt || Object.values(survey?.responses || {}).map(response => response.submittedAt).sort().at(-1)
      || last?.at || recording.started_at || recording.initial.created_at || null,
    revision: last?.revision ?? recording.initial.revision, frameCount: recording.frames.length,
    completed: (series ? series.status === 'complete' : !!finalResult) && (!survey || survey.status === 'completed'),
    result: series ? series.result : finalResult, feedback,
    ...(series ? { series: { mode: series.mode, resetTo: series.resetTo || 'game', gameNumber: series.gameNumber, status: series.status,
      winsRequired: series.winsRequired, maxGames: series.maxGames, scores: series.scores, games: series.games, result: series.result } } : {}),
    layout: config?.layout === 'emperor' || recording.setup.layout === 'emperor' ? 'emperor' : 'table',
    players: finalPlayers.map(player => {
      const details = configured.find(p => p?.id === player.id) || {};
      return { id: player.id, name: player.name,
        avatar: avatarIds.includes(details.avatar) ? details.avatar : null,
        model: typeof details.model === 'string' ? details.model : null,
        reasoning: typeof details.reasoning === 'string' ? details.reasoning : null,
        ai: details.ai !== false };
    }),
  };
}

export function createArchive({ directory: rootDirectory = defaultDataDirectory, getCurrent, liveTableUrl = '/' } = {}) {
  const root = resolve(rootDirectory);
  const matches = join(root, 'matches');
  function read(id) {
    if (!validId(id)) throw new Error('Saved game unavailable');
    directory(root); directory(matches);
    const folder = join(matches, id);
    directory(folder);
    const current = getCurrent?.(id);
    let recording, config;
    if (current?.id === id && current.recording) {
      recording = recordingOnly(current.recording);
      config = current.config;
    } else {
      try {
        const saved = readJSON(join(folder, 'session.json'));
        recording = recordingOnly(saved.recording);
      } catch (error) {
        // A missing authoritative session can still have a complete standalone
        // export. Never mask a corrupt/unsupported session with a stale export.
        if (error.code !== 'ENOENT') throw error;
        recording = recordingOnly(readJSON(join(folder, 'session.json.game.json')));
      }
      try { config = readJSON(join(folder, 'match.json')).config; }
      catch { /* Decks and player identities also live in the recording. */ }
    }
    return { game: summarize(id, recording, config), recording, liveTableUrl };
  }
  function list() {
    const games = [];
    let unreadable = 0, entries;
    try { directory(root); directory(matches); entries = readdirSync(matches, { withFileTypes: true }); }
    catch (error) {
      return { games, liveTableUrl, ...(error.code === 'ENOENT' ? {} : { warnings: ['Saved games could not be read.'] }) };
    }
    for (const entry of entries) {
      if (!validId(entry.name)) continue;
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        if (entry.isSymbolicLink()) unreadable++;
        continue;
      }
      try { games.push(read(entry.name).game); } catch { unreadable++; }
    }
    games.sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0) || a.id.localeCompare(b.id));
    return { games, liveTableUrl, ...(unreadable ? { warnings: [`${unreadable} saved game${unreadable === 1 ? '' : 's'} could not be read.`] } : {}) };
  }
  function handle(request, response, url) {
    const pathname = url.pathname;
    if (serveClient(request, response, url, { liveTableUrl, root: false })) return true;
    if (pathname !== '/api/games' && !pathname.startsWith('/api/games/')) return false;
    if (request.method !== 'GET') { json(response, 405, { error: 'Saved games are read-only.' }); return true; }
    if (pathname === '/api/games' || pathname === '/api/games/') { json(response, 200, list()); return true; }
    const match = /^\/api\/games\/([A-Za-z0-9_-]{1,120})(\/recording)?$/.exec(pathname);
    if (!match) { json(response, 404, { error: 'Saved game unavailable.' }); return true; }
    try {
      const entry = read(match[1]);
      if (match[2]) {
        response.setHeader('Content-Disposition', `attachment; filename="game-${match[1]}.json"`);
        json(response, 200, entry.recording);
      } else json(response, 200, entry);
    } catch { json(response, 404, { error: 'Saved game unavailable.' }); }
    return true;
  }
  return { list, read, handle };
}
