// An analysis export, kept by the host and never exposed to player MCP tools.
// Initial state plus concrete deltas preserve random outcomes and concealed IDs.
import { gameDeckSnapshot, decksForGame, gameSegments } from '../shared/replay.mjs';
import { turnLabel, turnNumberLabel, turnCountSummary } from '../shared/table-language.mjs';

const clone = value => structuredClone(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const stateFields = ['revision', 'players', 'turn', 'notes', 'result', 'preparation', 'series'];

function snapshot(state) {
  const { events, ...rest } = state;
  return clone(rest);
}

export function createRecording(state, setup = {}, references = []) {
  return {
    format: 'game-night-playtest-log', version: 1,
    visibility: 'Host export: includes private hands and library order.',
    started_at: state.created_at, title: state.title,
    setup: clone(setup), references: clone(references),
    ...(state.preparation?.status === 'complete' && state.preparation.decks
      ? { constructedDecks: clone(state.preparation.decks) } : {}),
    ...(state.series?.status === 'playing' && state.preparation?.status !== 'selecting' ? { gameDecks: [gameDeckSnapshot(state)] } : {}),
    initial: snapshot(state), frames: [],
  };
}

export function appendRecording(recording, previous, next) {
  const delta = {};
  for (const key of stateFields) if (!same(previous[key], next[key])) delta[key] = clone(next[key]);
  for (const key of ['cards', 'zones']) {
    const set = {};
    const removed = [];
    for (const [id, value] of Object.entries(next[key])) {
      if (!same(previous[key][id], value)) set[id] = clone(value);
    }
    for (const id of Object.keys(previous[key])) if (!Object.hasOwn(next[key], id)) removed.push(id);
    if (Object.keys(set).length || removed.length) delta[key] = { set, removed };
  }
  return {
    ...recording,
    ...(!recording.constructedDecks && next.preparation?.status === 'complete' && next.preparation.decks
      ? { constructedDecks: clone(next.preparation.decks) } : {}),
    ...(next.series && next.series.status === 'playing' && next.preparation?.status !== 'selecting'
      && !recording.gameDecks?.some(game => game.gameNumber === next.series.gameNumber)
      ? { gameDecks: [...(recording.gameDecks || []), gameDeckSnapshot(next)] } : {}),
    frames: [...recording.frames, { event: clone(next.events.at(-1)), delta }],
  };
}

export function applyFrame(state, frame) {
  const next = clone(state);
  for (const key of stateFields) if (Object.hasOwn(frame.delta, key)) next[key] = clone(frame.delta[key]);
  for (const key of ['cards', 'zones']) {
    if (!frame.delta[key]) continue;
    for (const id of frame.delta[key].removed) delete next[key][id];
    Object.assign(next[key], clone(frame.delta[key].set));
  }
  return next;
}

function describeAction(op, state, actor, outcome, canInfer = true) {
  const card = id => outcome?.cards?.[0] || state.cards[id]?.definition?.name || id || 'card';
  const seat = id => state.players.find(p => p.id === id)?.name || id;
  switch (op.type) {
    case 'draw': {
      const source = op.from || `${actor}:library`;
      if (!outcome && !canInfer) return `Draw ${op.count ?? 1} card(s) from ${source}; identities were not captured for this legacy batch.`;
      const cards = outcome ? (outcome.cards || []) : (state.zones[source]?.cards || []).slice(0, op.count ?? 1).map(card);
      return `Draw from ${source}: ${cards.join(', ') || '(empty)'}.`;
    }
    case 'move': return `Move ${card(op.card)} to ${op.to} (${op.position || 'bottom'}).`;
    case 'card': return `${card(op.card)}: ${JSON.stringify(outcome?.set || op.set)}.`;
    case 'player': return `${seat(op.player || actor)}: ${JSON.stringify(op.set)}.`;
    case 'turn': return `Turn markers: ${JSON.stringify(op.set)}.`;
    case 'pass': return `Pass priority to ${seat(op.next)}.`;
    case 'pass_turn': return `Pass the turn to ${seat(op.next)} (${turnNumberLabel(outcome?.set || { number: op.number ?? state.turn.number + 1 }, op.next)}, ${outcome?.set?.phase ?? op.phase ?? 'Untap'}).`;
    case 'select_packets': return `Select Jumpstart packets: ${(op.packetIds || []).map(id => state.preparation?.packets.find(packet => packet.id === id)?.name || id).join(' + ')}.`;
    case 'sideboard': return 'Adjust the main-deck and sideboard allocation; complete inventories are preserved in the JSON log.';
    case 'ready_next_game': return `Ready for the next game${op.starting_player ? '; starting player: ' + seat(op.starting_player) : ''}.`;
    case 'say': return 'Speak to the table.';
    case 'shuffle': return `Shuffle ${op.zone || `${actor}:library`}; resulting order preserved in the JSON log.`;
    case 'peek': return `Look at ${op.count ?? 1} card(s) in ${op.zone}${outcome?.cards?.length ? ': ' + outcome.cards.join(', ') : ''}.`;
    case 'reveal': return `Reveal ${card(op.card)} to ${op.to?.map(seat).join(', ') || 'the table'}.`;
    case 'token': return `Create ${op.count ?? 1} ${op.definition?.name || 'token'} in ${op.to || 'battlefield'}.`;
    case 'stack_item': return `Put ${op.definition?.name || 'ability'} on the stack.`;
    case 'remove_token': case 'remove_stack_item': return `Remove ${card(op.card)}.`;
    case 'note': return `Table note: ${op.text}`;
    case 'result': return `Reported result: ${op.winners?.map(seat).join(', ') || 'draw'}. ${op.explanation || ''}`;
    default: return `${op.type}: ${JSON.stringify(op)}`;
  }
}

export function recordingMarkdown(recording) {
  let state = clone(recording.initial);
  const lines = [
    `# ${recording.title}`, '', `Started: ${recording.started_at}`, '',
    'This host log includes private game information. Players receive only their own permitted views during play.',
    'Actions and results are player reports; the tabletop does not adjudicate rules.', '',
    '## Players and starting decks', '',
  ];
  for (const deck of decksForGame(recording, state.series?.gameNumber || 1)) {
    const p = state.players.find(player => player.id === deck.id);
    lines.push(`### ${deck.name}`, '', `Starting life: ${p.life}`, '');
    if (deck.note) lines.push(deck.note, '');
    for (const { definition, count } of deck.cards) lines.push(`- ${count} ${definition.name}`);
    if (deck.sideboardTotal) {
      lines.push('', `Sideboard (${deck.sideboardTotal}):`, '');
      for (const { definition, count } of deck.sideboard) lines.push(`- ${count} ${definition.name}`);
    }
    lines.push('');
  }
  if (recording.references.length) {
    lines.push('## Format references', '');
    for (const ref of recording.references) {
      lines.push(`### ${ref.path}`, '', ref.text, '');
    }
  }
  if (state.series) {
    lines.push('## Match games and decks', '');
    for (const game of gameSegments(recording)) {
      lines.push(`### Game ${game.gameNumber}`, '', `Starts at revision ${game.revision}.`, '', turnCountSummary(game.turn, game.players), '');
      for (const deck of decksForGame(recording, game.gameNumber)) {
        lines.push(`**${deck.name} — main deck (${deck.total})**`, '');
        for (const row of deck.cards) lines.push(`- ${row.count} ${row.definition.name}`);
        lines.push('', `**Sideboard (${deck.sideboardTotal})**`, '');
        for (const row of deck.sideboard) lines.push(`- ${row.count} ${row.definition.name}`);
        lines.push('');
      }
    }
  }
  lines.push('## Game actions', '');
  if (!recording.frames.length) lines.push('No game actions have been recorded.', '');
  for (const frame of recording.frames) {
    const { event } = frame;
    const player = state.players.find(p => p.id === event.actor)?.name || event.actor;
    lines.push(`### Action ${event.revision} · ${player}`, '', `${event.at}${state.series ? ' · Game ' + state.series.gameNumber : ''} · ${turnLabel(state.turn, state.players)} · ${state.turn.phase}`, '');
    for (const [i, op] of (event.actions || []).entries()) {
      lines.push(`- ${describeAction(op, state, event.actor, event.outcomes?.[i], event.actions.length === 1)}`);
      const speech = op.type === 'say' ? op.text : ['pass', 'pass_turn', 'select_packets', 'ready_next_game'].includes(op.type) ? op.message : undefined;
      if (speech !== undefined) {
        lines.push('', `> ${player}: ${speech.replace(/\r?\n/g, '\n> ')}`, '');
      }
    }
    if (event.reason) lines.push('', `Reason: ${event.reason}`);
    state = applyFrame(state, frame);
    lines.push('', `Life: ${state.players.map(p => `${p.name} ${p.life}`).join(' · ')}`, '');
  }
  lines.push('## Final saved position', '', `Revision: ${state.revision}`, '', turnCountSummary(state.turn, state.players), '',
    state.result ? `Reported outcome: ${state.result.explanation || JSON.stringify(state.result.winners)}` : 'No result has been reported.', '');
  if (state.series) {
    lines.push('## Match outcome', '', `Status: ${state.series.status}. Score: ${state.players.map(player => `${player.name} ${state.series.scores[player.id] || 0}`).join(' · ')}.`, '',
      state.series.result ? `Reported match outcome: ${state.series.result.explanation || JSON.stringify(state.series.result.winners)}` : 'The match is not complete.', '');
  }
  if (recording.postgame) {
    const survey = recording.postgame;
    lines.push(survey.series ? '## Post-match player feedback' : '## Post-game player feedback', '', `Questionnaire version: ${survey.version}. Status: ${survey.status}.`, '',
      'Independent participant assessments, not verified findings. AI enjoyment ratings estimate likely human enjoyment. A limited playtest cannot establish overall balance.', '');
    for (const player of survey.players) {
      lines.push(`### ${player.name}${player.ai ? ' (AI)' : ' (human)'}`, '');
      const response = survey.responses[player.id];
      if (!response) { lines.push('Response pending.', ''); continue; }
      const answers = response.answers;
      lines.push(`Submitted: ${response.submittedAt}. Confidence: ${answers.confidence}.`, '');
      for (const question of survey.schema.ratings) {
        const answer = answers.ratings[question.id];
        lines.push(`- ${question.label}: ${answer.score === null ? 'Not enough evidence' : answer.score + '/10'}. ${answer.reason}`);
      }
      lines.push('');
      for (const question of survey.schema.textQuestions) lines.push(`**${question.label}**`, '', answers[question.id] || 'No additional comment.', '');
      lines.push(`Rules observations: ${answers.rules_observation}.`, '');
      for (const incident of answers.rules_incidents) lines.push(`- ${incident.description} (${incident.status}; ${incident.impact} impact${incident.revision === null ? '' : '; revision ' + incident.revision}).`);
      lines.push('');
    }
  }
  return lines.join('\n');
}
