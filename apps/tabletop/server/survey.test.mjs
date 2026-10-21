import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SURVEY_SCHEMA, createSurvey, normalizeResponse, validateSurvey,
  submitSurveyResponse, surveyForPlayer, summarizeSurvey,
} from '../shared/survey.mjs';

const players = [{ id: 'p1', name: 'First', ai: true }, { id: 'p2', name: 'Second', ai: false }];
const at = '2026-10-20T21:00:00.000Z';
function answers(overrides = {}) {
  return {
    ratings: Object.fromEntries(SURVEY_SCHEMA.ratings.map(question => [question.id, { score: 5, reason: '' }])),
    highlights: 'A creature ability created a useful response window.',
    balance_factors: 'The result may reflect a missed block rather than the deck lists.',
    improvements: 'Swap seats and repeat before changing the decks.',
    rules_observation: 'none_observed', rules_incidents: [], confidence: 'medium',
    ...overrides,
  };
}

test('survey pins anchored questions and player identity without treating high complexity as good', () => {
  const survey = createSurvey(players, 24, { at });
  assert.deepEqual(survey.players, players);
  assert.equal(survey.startedAt, at);
  assert.equal(survey.status, 'pending');
  assert.equal(survey.resultRevision, 24);
  assert.deepEqual(survey.responses, {});
  assert.equal(survey.schema.ratings.find(q => q.id === 'deck_strength').anchors[5], 'Comparable strength');
  assert.equal(survey.schema.ratings.find(q => q.id === 'complexity').direction, 'descriptive');
  assert.match(survey.schema.ratings.find(q => q.id === 'enjoyment').aiQuestion, /human/);
  assert.match(survey.schema.instructions.join(' '), /win does not prove/);
  survey.schema.ratings[0].label = 'Changed only in this copy';
  assert.equal(SURVEY_SCHEMA.ratings[0].label, 'Relative deck strength');
  assert.throws(() => createSurvey([], 2), /requires players/);
  assert.throws(() => createSurvey([players[0], players[0]], 2), /unique/);
  assert.throws(() => createSurvey(players, -1), /revision/);
});

test('ratings allow explicit uncertainty and keep all narrative fields normalized and bounded', () => {
  const input = answers();
  input.ratings.deck_strength = { score: null, reason: '  Too few cards seen.  ' };
  input.highlights = '   ';
  const normalized = normalizeResponse(input, players, 24);
  assert.deepEqual(normalized.ratings.deck_strength, { score: null, reason: 'Too few cards seen.' });
  assert.equal(normalized.highlights, '');
  assert.equal(input.ratings.deck_strength.reason, '  Too few cards seen.  ');
  for (const score of [undefined, '5', 0, 11, 5.5, NaN, Infinity]) {
    const invalid = answers(); invalid.ratings.agency.score = score;
    assert.throws(() => normalizeResponse(invalid, players, 24), /agency must be/);
  }
  const unknown = answers(); unknown.ratings.agency = { score: null, reason: ' ' };
  assert.throws(() => normalizeResponse(unknown, players, 24), /reason is required/);
  const missing = answers(); delete missing.ratings.fairness;
  assert.throws(() => normalizeResponse(missing, players, 24), /fairness rating/);
  const extra = answers(); extra.ratings.luck = { score: 5, reason: '' };
  assert.throws(() => normalizeResponse(extra, players, 24), /unknown field/);
  assert.throws(() => normalizeResponse(answers({ highlights: 'x'.repeat(3001) }), players, 24), /highlights/);
  assert.throws(() => normalizeResponse(answers({ playerId: 'p2' }), players, 24), /unknown field/);
});

test('rules reports separate correction, impact and uncertainty and cite only recorded revisions', () => {
  const incident = { description: 'A second land was played and then returned to hand.', revision: 12, status: 'corrected', impact: 'minor' };
  const feedback = answers({ rules_observation: 'reported', rules_incidents: [incident] });
  assert.deepEqual(normalizeResponse(feedback, players, 24).rules_incidents, [incident]);
  assert.throws(() => normalizeResponse(answers({ rules_observation: 'reported' }), players, 24), /at least one/);
  assert.throws(() => normalizeResponse(answers({ rules_incidents: [incident] }), players, 24), /Choose reported/);
  assert.throws(() => normalizeResponse(answers({ rules_incidents: undefined }), players, 24), /array/);
  for (const invalidRevision of [-1, 25, 4.5, '12']) {
    assert.throws(() => normalizeResponse(answers({ rules_observation: 'reported', rules_incidents: [{ ...incident, revision: invalidRevision }] }), players, 24), /recorded revision/);
  }
  const unknown = normalizeResponse(answers({ rules_observation: 'reported', rules_incidents: [{ ...incident, revision: null, status: 'uncertain', impact: 'uncertain' }] }), players, 24);
  assert.equal(unknown.rules_incidents[0].revision, null);
  assert.equal(unknown.rules_incidents[0].status, 'uncertain');
  assert.equal(normalizeResponse(answers({ rules_observation: 'uncertain' }), players, 24).rules_observation, 'uncertain');
});

test('only actual per-seat submissions complete a survey, retries are idempotent and inputs stay unchanged', () => {
  const original = createSurvey(players, 24, { at });
  const first = submitSurveyResponse(original, 'p1', answers(), { at: '2026-10-20T21:01:00Z' });
  assert.equal(original.status, 'pending');
  assert.deepEqual(original.responses, {});
  assert.equal(first.status, 'pending');
  assert.equal(first.responses.p1.playerId, 'p1');
  assert.equal(first.responses.p1.submittedAt, '2026-10-20T21:01:00.000Z');
  const retry = submitSurveyResponse(first, 'p1', answers(), { at: '2026-10-20T22:00:00Z' });
  assert.deepEqual(retry, first);
  assert.notEqual(retry, first);
  assert.throws(() => submitSurveyResponse(first, 'p1', answers({ highlights: 'A different answer.' })), /already submitted/);
  assert.throws(() => submitSurveyResponse(first, 'p3', answers()), /Unknown survey player/);
  const finished = submitSurveyResponse(first, 'p2', answers(), { at: '2026-10-20T21:02:00Z' });
  assert.equal(finished.status, 'completed');
  assert.equal(finished.completedAt, '2026-10-20T21:02:00.000Z');
  assert.equal(first.status, 'pending');
  assert.equal(validateSurvey(finished), finished);
  assert.throws(() => validateSurvey({ ...first, status: 'completed' }), /completion/);
  assert.throws(() => validateSurvey({ ...finished, status: 'pending' }), /completion/);
  assert.throws(() => validateSurvey({ ...finished, responses: { ...finished.responses, p3: finished.responses.p1 } }), /unknown player/);
});

test('seat-scoped survey views never reveal another participant response', () => {
  const initial = createSurvey(players, 24, { at });
  const one = submitSurveyResponse(initial, 'p1', answers({ highlights: 'Private reflection.' }), { at });
  const view = surveyForPlayer(one, 'p2');
  assert.equal(view.response, null);
  assert.equal(view.submitted, 1);
  assert.equal(view.total, 2);
  assert.equal(JSON.stringify(view).includes('Private reflection.'), false);
  const both = submitSurveyResponse(one, 'p2', answers(), { at });
  const completedView = surveyForPlayer(both, 'p2');
  assert.equal(completedView.status, 'completed');
  assert.equal(completedView.response.playerId, 'p2');
  assert.equal(JSON.stringify(completedView).includes('Private reflection.'), false);
  completedView.schema.title = 'Changed';
  assert.notEqual(both.schema.title, 'Changed');
  assert.throws(() => surveyForPlayer(one, 'nope'), /Unknown/);
});

test('summary counts evidence and unknowns without a composite score or merging incident reports', () => {
  const initial = createSurvey(players, 24, { at });
  const blank = summarizeSurvey(initial);
  assert.deepEqual(blank.pending, ['p1', 'p2']);
  assert.equal(blank.ratings.every(r => r.mean === null && r.n === 0), true);
  const a = answers(); a.ratings.fairness.score = 8;
  const b = answers({ rules_observation: 'uncertain' });
  b.ratings.fairness = { score: null, reason: 'Not enough evidence.' };
  b.ratings.deck_strength.score = 7;
  const survey = submitSurveyResponse(submitSurveyResponse(initial, 'p1', a, { at }), 'p2', b, { at });
  const summary = summarizeSurvey(survey);
  assert.deepEqual(summary.pending, []);
  assert.equal(summary.submitted, 2);
  assert.deepEqual(summary.ratings.find(r => r.id === 'fairness'), { id: 'fairness', label: 'Matchup fairness', direction: 'higher_is_better', mean: 8, n: 1, unknown: 1 });
  assert.equal(summary.ratings.find(r => r.id === 'deck_strength').mean, 6);
  assert.deepEqual(summary.rules, { noneObserved: 1, uncertain: 1, reporting: 0, reports: 0 });
  assert.equal('overall' in summary, false);
  assert.equal('score' in summary, false);
});
