import { randomUUID } from 'node:crypto';

const copy = value => structuredClone(value);
const requireThat = (condition, message) => { if (!condition) throw new Error(message); };
const positiveInteger = value => Number.isSafeInteger(value) && value >= 1;

// Match procedures are separate from Magic's rules. A player still declares
// each game's result; this module records it and prepares the next table.
export function createSeries(config, players) {
  const requested = config.series;
  if (requested === undefined || requested === null) return null;
  requireThat(requested && typeof requested === 'object' && !Array.isArray(requested), 'Invalid match settings');
  requireThat(['single', 'best_of', 'first_to'].includes(requested.mode), 'Unknown match mode');
  requireThat(requested.sideboarding === undefined || typeof requested.sideboarding === 'boolean', 'Sideboarding must be a boolean');
  requireThat(requested.resetTo === undefined || ['game', 'preparation'].includes(requested.resetTo), 'Unknown next-game reset destination');
  if (requested.mode === 'single') return null;
  if (requested.resetTo === 'preparation') {
    requireThat(config.preparation?.kind === 'jumpstart', 'Returning to deck construction requires a configured preparation procedure');
    requireThat(!requested.sideboarding, 'Choose either rebuilding decks or sideboarding between games');
  }
  requireThat(positiveInteger(requested.winsRequired), 'Wins required must be a positive integer');
  if (requested.mode === 'best_of') requireThat(positiveInteger(requested.maxGames)
    && requested.maxGames >= requested.winsRequired, 'Maximum games must be at least the wins required');
  return {
    mode: requested.mode, winsRequired: requested.winsRequired,
    ...(requested.mode === 'best_of' ? { maxGames: requested.maxGames } : {}),
    sideboarding: requested.sideboarding === true, resetTo: requested.resetTo || 'game', status: 'playing', gameNumber: 1,
    scores: Object.fromEntries(players.map(p => [p.id, 0])), games: [],
    currentPlayer: null, ready: [], nextStartingPlayer: players[0].id,
    gameStartingPlayer: players[0].id, result: null,
    rosters: Object.fromEntries(players.map(p => [p.id, { initialLife: p.life, mainSize: 0, cards: [] }])),
  };
}

export function observeSeries(series) {
  if (!series) return null;
  const { rosters, gameStartingPlayer, ...view } = series;
  return copy(view);
}

// Pin the submitted cards once, before the first game begins. Resetting from
// live zones would retain tokens, stolen cards, or temporary game objects.
export function pinSeriesDecks(state) {
  if (!state.series) return;
  for (const p of state.players) {
    const roster = state.series.rosters[p.id];
    requireThat(roster.cards.length === 0, 'Match deck inventory is already pinned');
    const cards = new Map();
    for (const [zoneName, main] of [['library', true], ['sideboard', false]]) {
      for (const liveId of state.zones[p.id + ':' + zoneName].cards) {
        const card = state.cards[liveId];
        const key = JSON.stringify([card.definition, card.token]);
        if (!cards.has(key)) cards.set(key, {
          id: randomUUID(), definition: copy(card.definition), token: card.token, total: 0, main: 0,
        });
        const entry = cards.get(key);
        entry.total++;
        if (main) entry.main++;
      }
    }
    roster.cards = [...cards.values()];
    roster.mainSize = roster.cards.reduce((sum, card) => sum + card.main, 0);
    requireThat(roster.mainSize > 0, 'Every match player needs a starting deck');
  }
}

export function recordSeriesResult(state) {
  const series = state.series;
  if (!series) return;
  requireThat(series.status === 'playing', 'This game result was already recorded');
  series.games.push({ number: series.gameNumber, result: copy(state.result), turn: copy(state.turn), endedRevision: state.revision + 1 });
  for (const id of state.result.winners) series.scores[id]++;
  const reached = state.players.filter(p => series.scores[p.id] >= series.winsRequired).map(p => p.id);
  const capped = series.mode === 'best_of' && series.games.length >= series.maxGames;
  if (reached.length || capped) {
    let winners = reached;
    if (!winners.length) {
      const highest = Math.max(...Object.values(series.scores));
      const leaders = state.players.filter(p => series.scores[p.id] === highest).map(p => p.id);
      winners = leaders.length === 1 ? leaders : [];
    }
    series.status = 'complete';
    series.currentPlayer = null;
    series.result = {
      winners,
      explanation: reached.length ? `Reached ${series.winsRequired} win(s).`
        : `Reached the ${series.maxGames}-game limit${winners.length ? '.' : ' with a tied score.'}`,
    };
    return;
  }
  series.status = 'between_games';
  series.ready = [];
  series.currentPlayer = state.players[0].id;
  const previousStarter = state.players.findIndex(p => p.id === series.gameStartingPlayer);
  series.nextStartingPlayer = state.players[(previousStarter + 1) % state.players.length].id;
}

export function sideboardingView(state, actor) {
  requireThat(state.players.some(p => p.id === actor), 'Unknown player');
  const series = state.series;
  const available = !!(series?.status === 'between_games');
  const roster = series?.rosters[actor];
  return {
    series: observeSeries(series), available,
    mainSize: roster?.mainSize ?? 0,
    cards: (roster?.cards || []).map(({ id, definition, total, main }) => ({
      id, definition: copy(definition), total, main, sideboard: total - main,
    })),
    canEdit: !!(available && series.sideboarding && series.resetTo !== 'preparation' && series.currentPlayer === actor && !series.ready.includes(actor)),
  };
}

function requireReadyTurn(state, actor) {
  const series = state.series;
  requireThat(series?.status === 'between_games', 'There is no next game to prepare');
  requireThat(series.currentPlayer === actor && !series.ready.includes(actor), 'Wait for your between-game preparation turn');
  return series;
}

export function sideboard(state, actor, main) {
  const series = requireReadyTurn(state, actor);
  requireThat(series.sideboarding, 'Sideboarding is not enabled for this match');
  requireThat(series.resetTo !== 'preparation', 'This match rebuilds decks instead of sideboarding');
  requireThat(Array.isArray(main), 'Supply the main-deck allocation');
  const roster = series.rosters[actor];
  const allocations = new Map();
  for (const entry of main) {
    requireThat(entry && typeof entry.id === 'string' && !allocations.has(entry.id), 'Supply each pool card ID only once');
    const card = roster.cards.find(c => c.id === entry.id);
    requireThat(card, 'Card is not in your submitted deck and sideboard');
    requireThat(Number.isSafeInteger(entry.count) && entry.count >= 0 && entry.count <= card.total, 'Invalid main-deck card count');
    allocations.set(entry.id, entry.count);
  }
  requireThat([...allocations.values()].reduce((sum, count) => sum + count, 0) === roster.mainSize,
    `Keep exactly ${roster.mainSize} cards in your main deck`);
  for (const card of roster.cards) card.main = allocations.get(card.id) || 0;
}

// Returns true when every seat is ready. table.mjs then replaces the physical
// objects atomically, in this same revision, before any next-game prompt.
export function readyNextGame(state, actor, startingPlayer) {
  const series = requireReadyTurn(state, actor);
  if (startingPlayer !== undefined) {
    requireThat(series.ready.length === 0, 'Only the first player preparing the next game can choose its starting player');
    requireThat(state.players.some(p => p.id === startingPlayer), 'Unknown starting player');
    series.nextStartingPlayer = startingPlayer;
  }
  series.ready.push(actor);
  series.currentPlayer = state.players.find(p => !series.ready.includes(p.id))?.id || null;
  if (series.currentPlayer !== null) return false;
  series.status = 'playing';
  series.gameNumber++;
  series.gameStartingPlayer = series.nextStartingPlayer;
  series.ready = [];
  return true;
}
