import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startApp } from './app.mjs';
import { applyActions } from './table.mjs';
import { appendRecording } from './game-log.mjs';
import { SURVEY_SCHEMA } from '../shared/survey.mjs';

const setup = (ai = false) => ({ title: 'Series fixture', shuffle: false,
  series: { mode: 'best_of', winsRequired: 2, maxGames: 3, sideboarding: true },
  players: ['p1', 'p2'].map((id, index) => ({ id, ai, life: 20,
    deck: [{ name: index ? 'Forest' : 'Plains', count: 4 }],
    sideboard: [{ name: index ? 'Giant Growth' : 'Disenchant', count: 1 }],
  })),
});
const answers = () => ({
  ratings: Object.fromEntries(SURVEY_SCHEMA.ratings.map(question => [question.id, { score: null, reason: 'Synthetic fixture has no gameplay evidence.' }])),
  highlights: '', balance_factors: '', improvements: '', rules_observation: 'uncertain', rules_incidents: [], confidence: 'low',
});
const start = options => startApp({ port: 0, readPlanUsage: null,
  runPlayerFactory: () => async () => { throw new Error('Real models are not used in this test'); }, ...options });
async function post(app, path, body) {
  const response = await fetch(app.url + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
const act = (app, playerId, actions) => post(app, '/api/human/act', {
  matchId: app.appState().match.id, playerId, revision: app.getTable().getState().revision, actions,
});

test('humans sideboard privately between games, restore the table, and review only the complete match', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'tabletop-series-human-'));
  let app;
  try {
    app = await start({ directory, setup: setup() });
    const matchId = app.appState().match.id;
    assert.ok(app.appState().match.players.every(p => !('deck' in p) && !('sideboard' in p)));
    const initialCards = Object.keys(app.getTable().getState().cards);
    assert.equal((await act(app, 'p1', [
      { type: 'draw', from: 'p1:library', to: 'p1:hand', count: 1 },
      { type: 'result', winners: ['p1'], explanation: 'Fixture first game' },
    ])).status, 200);
    assert.equal(app.appState().match.phase, 'between_games');
    assert.equal(app.getTable().getRecording().postgame, undefined);
    const player = await (await fetch(app.url + `/api/human?matchId=${matchId}&playerId=p1`)).json();
    assert.equal(player.canAct, true);
    assert.equal(player.canChat, true);
    const view = await (await fetch(app.url + `/api/human/sideboard?matchId=${matchId}&playerId=p1`)).json();
    assert.equal(view.canEdit, true);
    assert.deepEqual(view.cards.map(c => c.definition.name).sort(), ['Disenchant', 'Plains']);
    assert.ok(!JSON.stringify(view).includes('Giant Growth'));
    const publicView = await (await fetch(app.url + '/api/table')).json();
    assert.equal(publicView.series.rosters, undefined);
    assert.equal((await act(app, 'p1', [{ type: 'draw', from: 'p1:library', to: 'p1:hand', count: 1 }])).status, 400);
    assert.equal((await act(app, 'p2', [{ type: 'ready_next_game' }])).status, 400);
    const main = view.cards.map(card => ({ id: card.id, count: card.definition.name === 'Plains' ? 3 : 1 }));
    assert.equal((await act(app, 'p1', [{ type: 'sideboard', main }, { type: 'ready_next_game', starting_player: 'p2' }])).status, 200);
    await app.close();
    app = await start({ directory });
    assert.equal(app.appState().match.id, matchId);
    assert.equal(app.getCoordinator().status().pendingRecipient.playerId, 'p2');
    assert.equal(app.getCoordinator().status().pendingRecipient.kind, 'between_games');
    assert.equal((await act(app, 'p2', [{ type: 'ready_next_game' }])).status, 200);
    const state = app.getTable().getState();
    assert.equal(state.series.gameNumber, 2);
    assert.equal(state.result, null);
    assert.equal(state.turn.active, 'p2');
    assert.equal(state.turn.phase, 'Setup');
    assert.ok(Object.keys(state.cards).every(id => !initialCards.includes(id)));
    assert.equal(state.zones['p1:hand'].cards.length, 0);
    assert.equal(state.zones['p1:library'].cards.length, 4);
    assert.equal(state.zones['p1:sideboard'].cards.length, 1);
    assert.equal(state.cards[state.zones['p1:sideboard'].cards[0]].definition.name, 'Plains');
    assert.equal(app.getCoordinator().status().pendingRecipient.kind, 'setup');
    assert.equal((await act(app, 'p2', [{ type: 'result', winners: ['p1'], explanation: 'Fixture second game' }])).status, 200);
    assert.equal(app.getTable().getState().series.status, 'complete');
    assert.equal(app.appState().match.phase, 'survey_pending');
    assert.equal(app.getTable().getRecording().postgame.series.games.length, 2);
    assert.equal((await act(app, 'p1', [{ type: 'ready_next_game' }])).status, 400);
    app.getTable().submitSurvey('p1', { answers: answers() });
    app.getTable().submitSurvey('p2', { answers: answers() });
    assert.equal(app.getCoordinator().status().mode, 'finished');
    const recorded = JSON.parse(readFileSync(app.appState().match.session + '.game.json', 'utf8'));
    assert.equal(recorded.postgame.status, 'completed');
    assert.equal(recorded.gameDecks.length, 2);
  } finally { if (app?.server.listening) await app.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('AI sessions persist across games, all work remains serial, and surveys run once at the end', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'tabletop-series-ai-'));
  let app, active = 0, maximum = 0;
  const jobs = [];
  try {
    app = await start({ directory, setup: setup(true), runPlayerFactory: ({ getConnection }) => async job => {
      active++; maximum = Math.max(maximum, active);
      try {
        jobs.push({ player: job.player.id, phase: job.phase, game: job.view.series.gameNumber, session: job.sessionId });
        if (job.sessionId) assert.equal(job.sessionId, `series-${job.player.id}`);
        job.onSession(`series-${job.player.id}`);
        const connection = getConnection(job.player.id);
        const survey = job.phase === 'survey';
        const actions = job.phase === 'between_games' ? [{ type: 'ready_next_game' }]
          : [{ type: 'result', winners: ['p1'], explanation: `Fixture game ${job.view.series.gameNumber}` }];
        if (job.phase === 'game' && job.view.series.gameNumber === 2) {
          assert.ok(job.turnHistory.events.every(event => event.revision >= 3), 'turn history excludes previous game');
        }
        const response = await fetch(connection.url + (survey ? '/api/survey' : '/api/act'), {
          method: 'POST', headers: { Authorization: `Bearer ${connection.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(survey ? { decision_id: job.decisionId, answers: answers() }
            : { revision: job.revision, decision_id: job.decisionId, actions, reason: 'Serial multi-game fixture' }),
        });
        const result = await response.json();
        assert.equal(response.status, 200, JSON.stringify(result));
        assert.equal(result.decision_completed, true);
        if (survey) assert.equal(job.survey.series.games.length, 2);
        return { sessionId: `series-${job.player.id}` };
      } finally { active--; }
    } });
    app.getCoordinator().start();
    for (let i = 0; i < 1000 && app.getCoordinator().status().mode !== 'finished'; i++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(app.getCoordinator().status().mode, 'finished', app.getCoordinator().status().message);
    assert.equal(maximum, 1);
    assert.deepEqual(jobs.map(({ player, phase, game }) => [player, phase, game]), [
      ['p1', 'game', 1], ['p1', 'between_games', 1], ['p2', 'between_games', 1],
      ['p2', 'game', 2], ['p1', 'survey', 2], ['p2', 'survey', 2],
    ]);
    assert.equal(jobs.filter(job => job.player === 'p1' && job.session === 'series-p1').length, 2);
    assert.equal(jobs.filter(job => job.player === 'p2' && job.session === 'series-p2').length, 2);
    assert.equal(app.getTable().getRecording().postgame.status, 'completed');
  } finally { if (app?.server.listening) await app.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('recover a result or next-game reset saved before the coordinator handoff', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'tabletop-series-recovery-'));
  let app;
  try {
    app = await start({ directory, setup: setup() });
    const session = app.appState().match.session;
    await app.close();
    function crashCommit(actor, actions) {
      const saved = JSON.parse(readFileSync(session, 'utf8'));
      const next = applyActions(saved.state, actor, saved.state.revision, actions, 'Simulate commit before coordinator save');
      saved.recording = appendRecording(saved.recording, saved.state, next);
      saved.state = next;
      writeFileSync(session, JSON.stringify(saved));
    }
    crashCommit('p1', [{ type: 'result', winners: [] }]);
    app = await start({ directory });
    assert.equal(app.getCoordinator().status().pendingRecipient.kind, 'between_games');
    assert.equal(app.getTable().getRecording().postgame, undefined);
    assert.equal((await act(app, 'p1', [{ type: 'ready_next_game' }])).status, 200);
    await app.close();
    crashCommit('p2', [{ type: 'ready_next_game' }]);
    app = await start({ directory });
    assert.equal(app.getCoordinator().status().pendingRecipient.kind, 'setup');
    assert.equal(app.getCoordinator().status().pendingRecipient.playerId, 'p2');
    assert.equal(app.getTable().getState().series.gameNumber, 2);
    assert.equal(app.getTable().getState().series.games.length, 1);
    assert.equal((await act(app, 'p2', [{ type: 'ready_next_game' }])).status, 400, 'cannot reset twice');
  } finally { if (app?.server.listening) await app.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('a match can return to Jumpstart selection without losing its score or starting-player choice', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'tabletop-series-reselect-'));
  let app;
  try {
    app = await start({ directory, setup: {
      title: 'Repeated pack selection',
      series: { mode: 'first_to', winsRequired: 2, resetTo: 'preparation' },
      preparation: { kind: 'jumpstart', source: 'zombies-vs-plants-v0.1' },
      players: [{ id: 'p1', ai: false, faction: 'plants' }, { id: 'p2', ai: false, faction: 'zombies' }],
    } });
    assert.equal((await act(app, 'p1', [{ type: 'select_packets', packetIds: ['ZP-P1', 'ZP-P2'] }])).status, 200);
    assert.equal((await act(app, 'p2', [{ type: 'select_packets', packetIds: ['ZP-Z1', 'ZP-Z2'] }])).status, 200);
    assert.equal(app.getTable().getRecording().gameDecks.length, 1);
    assert.equal((await act(app, 'p1', [{ type: 'result', winners: ['p1'] }])).status, 200);
    assert.equal((await act(app, 'p1', [{ type: 'ready_next_game', starting_player: 'p2' }])).status, 200);
    assert.equal((await act(app, 'p2', [{ type: 'ready_next_game' }])).status, 200);
    assert.equal(app.appState().match.phase, 'preparation');
    assert.equal(app.getCoordinator().status().pendingRecipient.kind, 'preparation');
    assert.equal(app.getCoordinator().status().pendingRecipient.playerId, 'p1');
    let state = app.getTable().getState();
    assert.equal(state.series.gameNumber, 2);
    assert.deepEqual(state.series.scores, { p1: 1, p2: 0 });
    assert.equal(state.preparation.status, 'selecting');
    assert.ok(state.preparation.players.every(p => !p.ready && p.selectedPacketIds.length === 0));
    assert.equal(state.zones['p1:library'].cards.length, 0);
    assert.equal(app.getTable().getRecording().gameDecks.length, 1, 'do not save an empty unfinished deck');
    await app.close();
    app = await start({ directory });
    assert.equal(app.getCoordinator().status().pendingRecipient.kind, 'preparation');
    assert.equal((await act(app, 'p1', [{ type: 'select_packets', packetIds: ['ZP-P3', 'ZP-P4'] }])).status, 200);
    assert.equal((await act(app, 'p2', [{ type: 'select_packets', packetIds: ['ZP-Z3', 'ZP-Z4'] }])).status, 200);
    state = app.getTable().getState();
    assert.equal(state.turn.active, 'p2');
    assert.equal(state.turn.priority, 'p2');
    assert.equal(state.turn.phase, 'Setup');
    assert.equal(app.getCoordinator().status().pendingRecipient.playerId, 'p2');
    assert.equal(app.getCoordinator().status().pendingRecipient.kind, 'setup');
    assert.equal(state.zones['p1:library'].cards.length, 40);
    assert.equal(state.series.rosters.p1.mainSize, 40);
    assert.equal(app.getTable().getRecording().postgame, undefined);
    const decks = app.getTable().getRecording().gameDecks;
    assert.equal(decks.length, 2);
    assert.notDeepEqual(decks[0].players[0].cards, decks[1].players[0].cards);
  } finally { if (app?.server.listening) await app.close(); rmSync(directory, { recursive: true, force: true }); }
});
