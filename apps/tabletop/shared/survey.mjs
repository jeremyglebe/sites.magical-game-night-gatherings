// Pinned with each recording. This module is also safe to import in a browser.
// Feedback is a participant's assessment, never an adjudication of the game.
const clone = value => structuredClone(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const requireThat = (condition, message) => { if (!condition) throw new Error(message); };
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(value)
  && !['__proto__', 'constructor', 'prototype'].includes(value);
function freeze(value) {
  for (const child of Object.values(value)) if (object(child) || Array.isArray(child)) freeze(child);
  return Object.freeze(value);
}

export const SURVEY_SCHEMA = freeze({
  version: 1,
  title: 'Post-game playtest survey',
  introduction: 'Assess this game from your own seat. Specific observations and uncertainty are more useful than a confident score alone.',
  instructions: [
    'Answer independently, using only what you knew during play. Do not inspect opponents’ hidden cards or their survey responses to complete this survey.',
    'A win does not prove a stronger deck, and a loss does not prove an unfair matchup. Separate deck and format effects from draw luck, seat order, player decisions, and multiplayer choices.',
    'Rate the observed experience, not the idea of the format. Choose Not enough evidence when appropriate and explain why. One game is evidence for another test, not a definitive balance verdict.',
    'Keep reasons short and concrete. Cite a recorded revision when known; do not invent one. Distinguish confirmed mistakes from unresolved rules questions and say whether a correction was made.',
    'For AI players, enjoyment is an estimate of how enjoyable the decisions and interaction would be for a human at this table; it is not a claim of personal feelings.',
    'Do not change the game, argue with other players, or seek agreement during this survey. Responses are recorded separately from table actions.',
  ],
  ratings: [
    {
      id: 'deck_strength', label: 'Relative deck strength', direction: 'comparative',
      question: 'How strong did your deck appear relative to the opposing decks in this game?',
      help: 'Use 5 for comparable strength. Consider resources, threats, answers, and consistency rather than the result alone. In multiplayer compare with the opposing field overall; describe uneven individual matchups below. There is no requirement for the scores to average 5.',
      anchors: { 1: 'Much weaker', 5: 'Comparable strength', 10: 'Much stronger' },
    },
    {
      id: 'fairness', label: 'Matchup fairness', direction: 'higher_is_better',
      question: 'Did every player appear to have a plausible route to winning through ordinary play?',
      help: 'Assess opportunity, including format rules and seating, rather than whether everyone won equally often or drew equally well.',
      anchors: { 1: 'Some seats had little realistic chance', 5: 'Meaningful but uneven chances', 10: 'Comparable, credible chances for all' },
    },
    {
      id: 'rules_adherence', label: 'Rules adherence', direction: 'higher_is_better',
      question: 'How reliably did the players follow the applicable rules during this game?',
      help: 'Include your own mistakes. A corrected error is still useful QA evidence. This is your observation, not proof that no errors occurred; use Not enough evidence if you could not assess it.',
      anchors: { 1: 'Repeated major errors undermined play', 5: 'Several errors or substantial corrections', 10: 'No rules errors observed' },
    },
    {
      id: 'agency', label: 'Meaningful choices', direction: 'higher_is_better',
      question: 'How much opportunity did you have to make meaningful choices or respond to other players?',
      help: 'Consider whether decisions mattered, alternative lines were viable, and interaction was possible—not simply how many actions you took.',
      anchors: { 1: 'Mostly forced or unable to participate', 5: 'Some consequential decisions', 10: 'Frequent, varied consequential decisions' },
    },
    {
      id: 'enjoyment', label: 'Enjoyment', aiLabel: 'Expected human enjoyment', direction: 'higher_is_better',
      question: 'How enjoyable was the play experience, considering its decisions, interaction, and variety?',
      aiQuestion: 'How enjoyable would these decisions, interactions, and variety likely be for a human playing your seat?',
      help: 'Keep winning or losing separate from the quality of the experience. AI players assess likely human experience, not personal feelings.',
      anchors: { 1: 'Frustrating or tedious', 5: 'Mixed or ordinary', 10: 'Engaging and worth replaying' },
    },
    {
      id: 'complexity', label: 'Complexity', direction: 'descriptive',
      question: 'How demanding was this game to understand and manage?',
      help: 'Higher means more demanding, not better. Consider rules interactions, tracking, and decision load. Mention specific friction below; separate model response time from game complexity.',
      anchors: { 1: 'Very simple', 5: 'Moderate tracking and decisions', 10: 'Very demanding or difficult to follow' },
    },
  ],
  textQuestions: [
    {
      id: 'highlights', label: 'Noteworthy play',
      question: 'Which strategies, combinations, interactions, or turning points stood out? What made them matter?',
      help: 'Name the cards or decisions when known. Include opponents’ play as well as your own. Leave blank if nothing stood out.',
    },
    {
      id: 'balance_factors', label: 'What shaped the result?',
      question: 'What most affected this game: deck composition, format rules, draw variance, seat order, player decisions, or multiplayer politics?',
      help: 'Separate observed evidence from speculation. Identify a disadvantaged deck or seat if relevant. Do not attribute an unlucky draw or misplay to deck balance without further evidence.',
    },
    {
      id: 'improvements', label: 'Next test or change',
      question: 'What is the most useful next test or small change, and what would it help determine?',
      help: 'A repeat game, seat swap, targeted deck adjustment, clearer rule, or tool improvement may be useful. Separate game-design issues from application or AI issues. No change is a valid recommendation.',
    },
  ],
  rulesObservationOptions: [
    { value: 'none_observed', label: 'No mistakes observed' },
    { value: 'reported', label: 'Mistakes or disputed interactions to report' },
    { value: 'uncertain', label: 'Unable to assess reliably' },
  ],
  incidentStatusOptions: [
    { value: 'corrected', label: 'Corrected during the game' },
    { value: 'uncorrected', label: 'Not corrected' },
    { value: 'uncertain', label: 'Uncertain or disputed' },
  ],
  incidentImpactOptions: [
    { value: 'minor', label: 'Minor / unlikely to affect the outcome' },
    { value: 'major', label: 'Major / may have affected the outcome' },
    { value: 'uncertain', label: 'Impact uncertain' },
  ],
  confidenceOptions: [
    { value: 'low', label: 'Low — limited evidence or substantial uncertainty' },
    { value: 'medium', label: 'Medium — useful observations, some uncertainty' },
    { value: 'high', label: 'High — specific evidence supports my assessment' },
  ],
  limits: { ratingReason: 1200, textAnswer: 3000, incidents: 20, incidentDescription: 2000 },
});

const ratingIds = SURVEY_SCHEMA.ratings.map(question => question.id);
const textIds = SURVEY_SCHEMA.textQuestions.map(question => question.id);
const choiceValues = name => SURVEY_SCHEMA[name].map(option => option.value);
export const SURVEY_ANSWERS_SCHEMA = freeze({
  type: 'object', additionalProperties: false,
  required: ['ratings', ...textIds, 'rules_observation', 'rules_incidents', 'confidence'],
  properties: {
    ratings: {
      type: 'object', additionalProperties: false, required: ratingIds,
      properties: Object.fromEntries(SURVEY_SCHEMA.ratings.map(question => [question.id, {
        type: 'object', additionalProperties: false, required: ['score', 'reason'],
        description: `${question.question} Anchors: 1 = ${question.anchors[1]}; 5 = ${question.anchors[5]}; 10 = ${question.anchors[10]}. ${question.help}`,
        properties: {
          score: { type: ['integer', 'null'], minimum: 1, maximum: 10, description: 'Use null for Not enough evidence, with a nonempty reason.' },
          reason: { type: 'string', maxLength: SURVEY_SCHEMA.limits.ratingReason, description: 'Brief evidence or uncertainty. Required to be nonblank when score is null.' },
        },
      }])),
    },
    ...Object.fromEntries(SURVEY_SCHEMA.textQuestions.map(question => [question.id, {
      type: 'string', maxLength: SURVEY_SCHEMA.limits.textAnswer, description: `${question.question} ${question.help}`,
    }])),
    rules_observation: { type: 'string', enum: choiceValues('rulesObservationOptions'), description: 'Use reported when supplying any incidents; none_observed or uncertain requires an empty incident list.' },
    rules_incidents: {
      type: 'array', maxItems: SURVEY_SCHEMA.limits.incidents,
      description: 'Supply [] explicitly if no incidents are reported. The reported observation requires at least one incident.',
      items: {
        type: 'object', additionalProperties: false, required: ['description', 'status', 'impact'],
        properties: {
          description: { type: 'string', minLength: 1, maxLength: SURVEY_SCHEMA.limits.incidentDescription },
          revision: { type: ['integer', 'null'], minimum: 0, description: 'Optional exact recorded revision, at or before the game result. Use null when not known; never invent evidence.' },
          status: { type: 'string', enum: choiceValues('incidentStatusOptions') },
          impact: { type: 'string', enum: choiceValues('incidentImpactOptions') },
        },
      },
    },
    confidence: { type: 'string', enum: choiceValues('confidenceOptions'), description: 'Overall confidence in these observations, not confidence that the deck is strong.' },
  },
});
function text(value, label, maximum, required = false) {
  requireThat(typeof value === 'string' && value.length <= maximum, `${label} must be text of at most ${maximum} characters`);
  const normalized = value.trim();
  requireThat(!required || normalized.length > 0, `${label} is required`);
  return normalized;
}
function choice(value, name, label) {
  requireThat(choiceValues(name).includes(value), `Choose a valid ${label}`);
  return value;
}
function revision(value) {
  requireThat(Number.isSafeInteger(value) && value >= 0, 'Result revision must be a nonnegative integer');
  return value;
}
function timestamp(at = new Date().toISOString()) {
  requireThat(typeof at === 'string' && Number.isFinite(Date.parse(at)), 'Survey timestamp is invalid');
  return new Date(at).toISOString();
}
function participantList(players) {
  requireThat(Array.isArray(players) && players.length > 0, 'A survey requires players');
  const ids = new Set();
  return players.map(player => {
    requireThat(object(player) && validId(player.id) && !ids.has(player.id), 'Survey players need unique valid IDs');
    ids.add(player.id);
    return { id: player.id, name: typeof player.name === 'string' && player.name.trim() ? player.name : player.id, ai: player.ai !== false };
  });
}
function onlyKeys(value, keys, label) {
  requireThat(Object.keys(value).every(key => keys.includes(key)), `${label} contains an unknown field`);
}

export function createSurvey(players, resultRevision, { at } = {}) {
  return {
    version: 1, schema: clone(SURVEY_SCHEMA), status: 'pending',
    resultRevision: revision(resultRevision), players: participantList(players),
    responses: {}, startedAt: timestamp(at), completedAt: null,
  };
}

/** Normalize only submitted feedback; never accept caller-supplied identity or time. */
export function normalizeResponse(answers, players, resultRevision) {
  if (players !== undefined) participantList(players);
  revision(resultRevision);
  requireThat(object(answers), 'Survey answers must be an object');
  onlyKeys(answers, ['ratings', ...textIds, 'rules_observation', 'rules_incidents', 'confidence'], 'Survey answers');
  requireThat(object(answers.ratings), 'Answer each rating, using Not enough evidence when appropriate');
  onlyKeys(answers.ratings, ratingIds, 'Survey ratings');
  const ratings = {};
  for (const id of ratingIds) {
    const answer = answers.ratings[id];
    requireThat(object(answer), `Answer the ${id} rating`);
    onlyKeys(answer, ['score', 'reason'], `${id} rating`);
    requireThat(answer.score === null || (Number.isSafeInteger(answer.score) && answer.score >= 1 && answer.score <= 10), `${id} must be 1–10 or null for Not enough evidence`);
    ratings[id] = { score: answer.score, reason: text(answer.reason, `${id} reason`, SURVEY_SCHEMA.limits.ratingReason, answer.score === null) };
  }
  const normalized = { ratings };
  for (const id of textIds) normalized[id] = text(answers[id], id, SURVEY_SCHEMA.limits.textAnswer);
  normalized.rules_observation = choice(answers.rules_observation, 'rulesObservationOptions', 'rules observation');
  requireThat(Array.isArray(answers.rules_incidents) && answers.rules_incidents.length <= SURVEY_SCHEMA.limits.incidents, 'Supply rules_incidents as an array of at most 20 incidents; use [] when none are reported');
  normalized.rules_incidents = answers.rules_incidents.map((incident, index) => {
    requireThat(object(incident), `Rules incident ${index + 1} must be an object`);
    onlyKeys(incident, ['description', 'revision', 'status', 'impact'], `Rules incident ${index + 1}`);
    const atRevision = incident.revision ?? null;
    requireThat(atRevision === null || (Number.isSafeInteger(atRevision) && atRevision >= 0 && atRevision <= resultRevision), `Rules incident ${index + 1} must cite a recorded revision from 0 through ${resultRevision}, or null`);
    return {
      description: text(incident.description, `Rules incident ${index + 1} description`, SURVEY_SCHEMA.limits.incidentDescription, true),
      revision: atRevision,
      status: choice(incident.status, 'incidentStatusOptions', `correction status for incident ${index + 1}`),
      impact: choice(incident.impact, 'incidentImpactOptions', `impact for incident ${index + 1}`),
    };
  });
  requireThat(normalized.rules_observation !== 'reported' || normalized.rules_incidents.length > 0, 'Describe at least one incident when reporting rules mistakes or disputed interactions');
  requireThat(normalized.rules_observation === 'reported' || normalized.rules_incidents.length === 0, 'Choose reported when supplying rules incidents');
  normalized.confidence = choice(answers.confidence, 'confidenceOptions', 'confidence level');
  return normalized;
}

export const validateResponse = normalizeResponse;

export function validateSurvey(survey) {
  requireThat(object(survey) && survey.version === 1 && survey.schema?.version === 1, 'Unsupported post-game survey version');
  const players = participantList(survey.players);
  revision(survey.resultRevision);
  requireThat(typeof survey.startedAt === 'string', 'Survey start time is missing');
  timestamp(survey.startedAt);
  requireThat(['pending', 'completed'].includes(survey.status) && object(survey.responses), 'Invalid post-game survey state');
  for (const [id, response] of Object.entries(survey.responses)) {
    requireThat(players.some(player => player.id === id) && object(response) && response.playerId === id, 'Survey response belongs to an unknown player');
    requireThat(typeof response.submittedAt === 'string', 'Survey submission time is missing');
    timestamp(response.submittedAt);
    normalizeResponse(response.answers, players, survey.resultRevision);
  }
  const complete = players.every(player => Object.hasOwn(survey.responses, player.id));
  requireThat((survey.status === 'completed') === complete, 'Survey completion does not match its responses');
  if (complete) {
    requireThat(typeof survey.completedAt === 'string', 'Survey completion time is missing');
    timestamp(survey.completedAt);
  }
  else requireThat(survey.completedAt === null, 'Pending survey cannot have a completion time');
  return survey;
}

export function submitSurveyResponse(survey, playerId, answers, { at } = {}) {
  validateSurvey(survey);
  requireThat(survey.players.some(player => player.id === playerId), 'Unknown survey player');
  const normalized = normalizeResponse(answers, survey.players, survey.resultRevision);
  const existing = Object.hasOwn(survey.responses, playerId) ? survey.responses[playerId] : null;
  if (existing) {
    requireThat(JSON.stringify(normalizeResponse(existing.answers, survey.players, survey.resultRevision)) === JSON.stringify(normalized), 'This player has already submitted the survey');
    return clone(survey); // Retrying the same durable submission is safe.
  }
  const next = clone(survey);
  const submittedAt = timestamp(at);
  next.responses[playerId] = { playerId, submittedAt, answers: normalized };
  if (next.players.every(player => Object.hasOwn(next.responses, player.id))) {
    next.status = 'completed';
    next.completedAt = submittedAt;
  }
  return next;
}

/** A player's endpoint never supplies another player's feedback, even after completion. */
export function surveyForPlayer(survey, playerId) {
  validateSurvey(survey);
  const player = survey.players.find(player => player.id === playerId);
  requireThat(player, 'Unknown survey player');
  return {
    version: survey.version, schema: clone(survey.schema), status: survey.status,
    resultRevision: survey.resultRevision, player: clone(player),
    submitted: Object.keys(survey.responses).length, total: survey.players.length,
    response: Object.hasOwn(survey.responses, playerId) ? clone(survey.responses[playerId]) : null,
  };
}

/** Keep unlike measures separate. A descriptive/relative rating is not a quality score. */
export function summarizeSurvey(survey) {
  validateSurvey(survey);
  const responses = Object.values(survey.responses);
  return {
    status: survey.status, submitted: responses.length, total: survey.players.length,
    pending: survey.players.filter(player => !Object.hasOwn(survey.responses, player.id)).map(player => player.id),
    ratings: SURVEY_SCHEMA.ratings.map(question => {
      const values = responses.map(response => response.answers.ratings[question.id].score).filter(score => score !== null);
      return {
        id: question.id, label: question.label, direction: question.direction,
        mean: values.length ? Math.round(values.reduce((sum, score) => sum + score, 0) / values.length * 100) / 100 : null,
        n: values.length, unknown: responses.length - values.length,
      };
    }),
    rules: {
      noneObserved: responses.filter(response => response.answers.rules_observation === 'none_observed').length,
      uncertain: responses.filter(response => response.answers.rules_observation === 'uncertain').length,
      reporting: responses.filter(response => response.answers.rules_observation === 'reported').length,
      // Reports can describe the same incident. They are not deduplicated facts.
      reports: responses.reduce((sum, response) => sum + response.answers.rules_incidents.length, 0),
    },
  };
}
