import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startApp as startAppWithUsage } from './app.mjs';
import { SURVEY_SCHEMA } from './survey.mjs';

const setup = ai => ({ title: 'Post-game integration', shuffle: false,
  players: ai.map((enabled, index) => ({ id: `p${index + 1}`, name: `Seat ${index + 1}`, ai: enabled,
    deck: [{ name: `Private card ${index + 1}`, count: 3 }] })),
});
const answers = marker => ({
  ratings: Object.fromEntries(SURVEY_SCHEMA.ratings.map(question => [question.id, { score: 5, reason: 'Comparable opportunities in the observed game.' }])),
  highlights: marker, balance_factors: 'One game is insufficient to distinguish deck strength from draw variance.',
  improvements: 'Repeat with seats swapped.', rules_observation: 'none_observed', rules_incidents: [], confidence: 'medium',
});
const readJSON = path => JSON.parse(readFileSync(path, 'utf8'));
const startApp = options => startAppWithUsage({ readPlanUsage: null, ...options });
async function waitFor(predicate, description, errors = []) {
  for (let i = 0; i < 400; i++) {
    if (predicate()) return;
    if (errors.length) throw errors[0];
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.fail(`Timed out waiting for ${description}`);
}
async function jsonRequest(url, body, token) {
  const response = await fetch(url, {
    ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
  });
  return { status: response.status, body: await response.json() };
}
function seatRequest(app, id, path, body) {
  const table = app.getTable();
  return jsonRequest(table.url + path, body, table.getToken(id));
}
function act(app, request, actions) {
  return seatRequest(app, request.player.id, '/api/act', {
    revision: app.getTable().getState().revision, decision_id: request.decisionId, actions, reason: 'Post-game integration fixture',
  });
}

test('result and questionnaire are durable together; independent AI feedback completes without another game action', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'game-night-postgame-ai-'));
  let app, releaseResult, resultSaved = false, workers = 0, peak = 0;
  const resultRelease = new Promise(resolve => { releaseResult = resolve; });
  const calls = [], errors = [];
  const factory = () => async request => {
    workers++; peak = Math.max(peak, workers); calls.push(request);
    const id = request.player.id;
    try {
      request.onSession(request.sessionId || `history-${id}`);
      if (request.phase === 'game') {
        const actions = calls.length === 1 ? [{ type: 'draw' }, { type: 'pass', next: 'p2' }]
          : calls.length === 2 ? [{ type: 'draw' }, { type: 'pass', next: 'p1' }]
            : [{ type: 'result', winners: ['p1'], explanation: 'Result reported by players.' }];
        const reply = await act(app, request, actions);
        assert.equal(reply.status, 200, reply.body.error);
        if (actions[0].type === 'result') {
          assert.equal(reply.body.decision_completed, true);
          assert.equal(reply.body.phase, 'survey');
          resultSaved = true;
          await resultRelease;
        }
      } else {
        assert.equal(request.sessionId, `history-${id}`);
        assert.equal(request.survey.player.id, id);
        assert.equal(request.survey.response, null);
        const read = await seatRequest(app, id, '/api/survey?playerId=p2');
        assert.equal(read.status, 200);
        assert.equal(read.body.player.id, id, 'token identity cannot be changed by query arguments');
        assert.equal(read.body.responses, undefined);
        assert(!JSON.stringify(read.body).includes('private feedback p1'));
        const blocked = await act(app, request, [{ type: 'draw' }]);
        assert.equal(blocked.status, 400);
        assert.match(blocked.body.error, /Gameplay has ended/);
        if (id === 'p1') {
          const impersonation = await seatRequest(app, 'p2', '/api/survey', { decision_id: request.decisionId, answers: answers('forged response') });
          assert.equal(impersonation.status, 400);
        }
        const submitted = await seatRequest(app, id, '/api/survey', { decision_id: request.decisionId, answers: answers(`private feedback ${id}`) });
        assert.equal(submitted.status, 200, submitted.body.error);
        assert.equal(submitted.body.decision_completed, true);
        assert.notEqual(app.getCoordinator().status().mode, 'finished', 'worker is still returning from its tool');
      }
      return { sessionId: `history-${id}` };
    } catch (error) { errors.push(error); throw error; }
    finally { workers--; }
  };
  try {
    app = await startApp({ directory, port: 0, setup: setup([true, true]), runPlayerFactory: factory });
    app.getCoordinator().start();
    await waitFor(() => resultSaved, 'durable game result', errors);
    const session = app.appState().match.session;
    const durable = readJSON(session);
    assert.equal(durable.state.revision, 3);
    assert.deepEqual(durable.state.result.winners, ['p1']);
    assert.equal(durable.recording.postgame.status, 'pending');
    assert.equal(durable.recording.postgame.resultRevision, 3);
    assert.deepEqual(durable.recording.postgame.responses, {});
    assert.equal(app.appState().match.phase, 'survey_pending');
    assert.equal(calls.length, 3, 'survey waits for the result worker to exit');
    const pendingArchive = await jsonRequest(app.url + '/api/games/' + app.appState().match.id);
    assert.equal(pendingArchive.body.game.completed, false);
    assert.equal(pendingArchive.body.game.feedback.submitted, 0);
    releaseResult();
    await waitFor(() => app.getCoordinator().status().mode === 'finished', 'all AI surveys', errors);
    assert.deepEqual(errors, []);
    assert.equal(peak, 1);
    assert.deepEqual(calls.map(call => `${call.player.id}:${call.phase}`), ['p1:game', 'p2:game', 'p1:game', 'p1:survey', 'p2:survey']);
    const saved = readJSON(session);
    assert.deepEqual(saved.state, durable.state, 'feedback never changes board state, events, or revision');
    assert.equal(saved.recording.frames.length, 3);
    assert.equal(saved.recording.postgame.status, 'completed');
    assert.deepEqual(Object.keys(saved.recording.postgame.responses).sort(), ['p1', 'p2']);
    assert.deepEqual(readJSON(session + '.game.json').postgame, saved.recording.postgame);
    assert.match(readFileSync(session + '.game.md', 'utf8'), /Post-game player feedback/);
    assert.match(readFileSync(session + '.game.md', 'utf8'), /private feedback p1/);
    const archived = await jsonRequest(app.url + '/api/games/' + app.appState().match.id);
    assert.equal(archived.body.game.completed, true);
    assert.equal(archived.body.game.feedback.status, 'completed');
    assert.equal(archived.body.game.feedback.submitted, 2);
    assert.equal(archived.body.recording.postgame.responses.p2.answers.highlights, 'private feedback p2');
    const playerRead = await seatRequest(app, 'p2', '/api/survey');
    assert.equal(playerRead.body.response.answers.highlights, 'private feedback p2');
    assert(!JSON.stringify(playerRead.body).includes('private feedback p1'));
    const repeated = await seatRequest(app, 'p2', '/api/survey', { decision_id: calls.at(-1).decisionId, answers: answers('private feedback p2') });
    assert.equal(repeated.status, 200, repeated.body.error);
    assert.equal(repeated.body.already_submitted, true);
    const changed = await seatRequest(app, 'p2', '/api/survey', { decision_id: calls.at(-1).decisionId, answers: answers('Changed after submission') });
    assert.equal(changed.status, 400);
    assert.match(changed.body.error, /already submitted/);
    assert.deepEqual(readJSON(session), saved, 'retries do not rewrite survey timestamps, state, or coordinator authority');
    assert.equal(calls.length, 5);
  } finally {
    releaseResult();
    if (app?.server.listening) await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('human survey API validates and saves independent answers while an AI is responding', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'game-night-postgame-human-'));
  let app, releaseAI, aiRequest;
  const release = new Promise(resolve => { releaseAI = resolve; });
  const errors = [];
  const factory = () => async request => {
    try {
      aiRequest = request;
      assert.equal(request.phase, 'survey');
      await release;
      const read = await seatRequest(app, 'p2', '/api/survey');
      assert(!JSON.stringify(read.body).includes('Human-only assessment'));
      const submitted = await seatRequest(app, 'p2', '/api/survey', { decision_id: request.decisionId, answers: answers('AI assessment') });
      assert.equal(submitted.status, 200, submitted.body.error);
    } catch (error) { errors.push(error); throw error; }
  };
  try {
    app = await startApp({ directory, port: 0, setup: setup([false, true]), runPlayerFactory: factory });
    const before = await jsonRequest(app.url + '/api/survey', { playerId: 'p1', answers: answers('Too early') });
    assert.equal(before.status, 400);
    const result = await seatRequest(app, 'p1', '/api/act', { revision: 0, actions: [{ type: 'result', winners: ['p1'] }], reason: 'Game result fixture' });
    assert.equal(result.status, 200, result.body.error);
    app.getCoordinator().start();
    await waitFor(() => aiRequest, 'AI survey worker', errors);
    assert.equal(aiRequest.player.id, 'p2', 'human response does not hold the AI queue');
    const aiThroughForm = await jsonRequest(app.url + '/api/survey', { playerId: 'p2', answers: answers('Impersonated AI') });
    assert.equal(aiThroughForm.status, 400);
    assert.match(aiThroughForm.body.error, /configured human player/);
    const invalid = answers('Invalid assessment'); invalid.ratings.fairness.score = 11;
    const rejected = await jsonRequest(app.url + '/api/survey', { playerId: 'p1', answers: invalid });
    assert.equal(rejected.status, 400);
    assert.deepEqual(app.getTable().getRecording().postgame.responses, {});
    const accepted = await jsonRequest(app.url + '/api/survey', { playerId: 'p1', answers: answers('Human-only assessment') });
    assert.equal(accepted.status, 200, accepted.body.error);
    assert.equal(accepted.body.postgame.responses.p1.answers.highlights, 'Human-only assessment');
    assert.equal(app.getTable().getState().revision, 1);
    assert.equal(app.getCoordinator().status().active, 1);
    assert.equal(app.getCoordinator().status().players.find(p => p.id === 'p2').active.decisionId, aiRequest.decisionId);
    releaseAI();
    await waitFor(() => app.getCoordinator().status().mode === 'finished', 'mixed survey completion', errors);
    assert.deepEqual(errors, []);
    assert.equal(app.getTable().getRecording().postgame.status, 'completed');
    assert.equal(app.getTable().getState().revision, 1);
  } finally {
    releaseAI();
    if (app?.server.listening) await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('recorded partial surveys override stale finished coordinators; legacy results remain finished', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'game-night-postgame-recovery-'));
  let app; let runs = 0;
  const factory = () => async () => { runs++; assert.fail('Manual or finished game must not launch AI'); };
  try {
    app = await startApp({ directory, port: 0, setup: setup([false, false]), runPlayerFactory: factory });
    const declared = await seatRequest(app, 'p1', '/api/act', { revision: 0, actions: [{ type: 'result', winners: [] }], reason: 'Draw fixture' });
    assert.equal(declared.status, 200, declared.body.error);
    const submitted = await jsonRequest(app.url + '/api/survey', { playerId: 'p1', answers: answers('Persisted first respondent') });
    assert.equal(submitted.status, 200, submitted.body.error);
    const id = app.appState().match.id, session = app.appState().match.session;
    const matchPath = join(directory, 'matches', id, 'match.json');
    const firstResponse = app.getTable().getRecording().postgame.responses.p1;
    await app.close();
    const stale = readJSON(matchPath);
    stale.coordinator.mode = 'finished'; stale.coordinator.phase = 'game'; stale.coordinator.pendingRecipient = null;
    writeFileSync(matchPath, JSON.stringify(stale));
    app = await startApp({ directory, port: 0, runPlayerFactory: factory });
    assert.equal(app.getCoordinator().status().mode, 'paused');
    assert.equal(app.getCoordinator().status().phase, 'survey');
    assert.deepEqual(app.getCoordinator().status().surveyPending, ['p2']);
    assert.equal(app.getCoordinator().status().pendingRecipient.playerId, 'p2');
    assert.deepEqual(app.getTable().getRecording().postgame.responses.p1, firstResponse);
    assert.equal(app.getTable().getState().revision, 1);
    const completed = await jsonRequest(app.url + '/api/survey', { playerId: 'p2', answers: answers('Second respondent after recovery') });
    assert.equal(completed.status, 200, completed.body.error);
    assert.equal(completed.body.coordinator.mode, 'finished');
    assert.equal(app.getTable().getState().revision, 1);
    await app.close();
    // A pre-survey release produced exactly this legacy recording shape.
    // Merely opening it must not invent a questionnaire or resume gameplay.
    const legacy = readJSON(session); delete legacy.recording.postgame;
    writeFileSync(session, JSON.stringify(legacy));
    app = await startApp({ directory, port: 0, runPlayerFactory: factory });
    assert.equal(app.getCoordinator().status().mode, 'finished');
    assert.equal(app.appState().postgame, null);
    assert.equal(app.getTable().getRecording().postgame, undefined);
    const archived = await jsonRequest(app.url + '/api/games/' + id);
    assert.equal(archived.body.game.completed, true);
    assert.equal(archived.body.game.feedback, null);
    assert.equal(runs, 0);
  } finally {
    if (app?.server.listening) await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
