import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startTable } from './server.mjs';
import { connectPlayer } from './player-client.mjs';
import { demoSetup, runDemo } from './demo.mjs';

const close = server => new Promise((ok, fail) => server.close(error => error ? fail(error) : ok()));

test('default game needs no optional references and draws actual cards from a concealed library', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'game-night-default-'));
  const session = join(dir, 'session.json');
  let table, player;
  try {
    const setup = JSON.parse(readFileSync(new URL('./precons.json', import.meta.url), 'utf8'));
    table = await startTable({ session, setup, port: 0 });
    player = await connectPlayer({ seat: 'p1', session, url: table.url });
    const references = await player.tool('read_reference');
    assert.deepEqual(references.paths, []);
    assert.match(references.note, /No optional.*ordinary Magic/);
    const initial = await player.tool('observe_table');
    assert.equal(initial.zones['p1:library'].count, 60);
    assert.equal(initial.zones['p1:library'].hidden_count, 60);
    assert.deepEqual(initial.zones['p1:library'].cards, []);
    assert.equal(initial.zones['p1:hand'].count, 0);
    const drawn = await player.tool('act', {
      revision: initial.revision, reason: 'Prepare opening hand.',
      actions: [{ type: 'draw', count: 7 }],
    });
    assert.equal(drawn.zones['p1:library'].count, 53);
    assert.equal(drawn.zones['p1:library'].hidden_count, 53);
    assert.equal(drawn.zones['p1:hand'].cards.length, 7);
    assert.equal(drawn.zones['p1:hand'].hidden_count, 0);
    const spectator = await (await fetch(table.url + '/api/table')).json();
    assert.equal(spectator.zones['p1:hand'].count, 7);
    assert.equal(spectator.zones['p1:hand'].hidden_count, 7);
    assert.deepEqual(spectator.zones['p1:hand'].cards, []);
  } finally {
    if (player) await player.close();
    if (table?.server.listening) await close(table.server);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('two real MCP processes share saved state with private views, conflict detection, and recovery', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'game-night-table-'));
  const session = join(dir, 'session.json');
  const setup = demoSetup();
  setup.references = ['formats/horde/variants/classic.md'];
  let table;
  const players = [];
  try {
    table = await startTable({ session, setup, port: 0 });
    const { url } = table;
    for (const seat of ['p1', 'p2']) players.push(await connectPlayer({ seat, session, url }));
    const [a, b] = players;
    assert.equal((await fetch(url + '/api/observe')).status, 401);
    assert.equal((await fetch(url + '/api/act', { method: 'POST', body: '{}' })).status, 401);
    assert.deepEqual((await a.client.listTools()).tools.map(t => t.name),
      ['observe_table', 'act', 'say', 'pass_priority', 'pass_turn', 'read_card', 'read_reference', 'read_events', 'read_rules', 'complete_decision']);
    const initial = await a.tool('observe_table');
    const calls = await Promise.allSettled([a, b].map(p => p.tool('act', {
      revision: initial.revision, actions: [{ type: 'draw', count: 7 }], reason: 'Private reasoning about Serra Angel.',
    })));
    assert.equal(calls.filter(c => c.status === 'fulfilled').length, 1, 'Exactly one writer wins the revision');
    assert.match(calls.find(c => c.status === 'rejected').reason.message, /Table changed/);
    for (const [i, p] of players.entries()) {
      let view = await p.tool('observe_table');
      const seat = 'p' + (i + 1);
      if (!view.zones[seat + ':hand'].count) view = await p.tool('act', { revision: view.revision, actions: [{ type: 'draw', count: 7 }], reason: 'Deal my hand.' });
      assert.equal(view.zones[seat + ':hand'].cards.length, 7);
      assert.equal(view.zones['p' + (2 - i) + ':hand'].cards.length, 0);
    }
    const view = await a.tool('observe_table');
    const handCard = view.zones['p1:hand'].cards.find(c => c.name === 'Serra Angel');
    assert.match((await a.tool('read_card', { id: handCard.id })).oracle_text, /Flying/);
    await assert.rejects(() => b.tool('read_card', { id: handCard.id }), /not available/);
    assert.deepEqual((await a.tool('read_reference')).paths, setup.references);
    const ref = await a.tool('read_reference', { path: setup.references[0], query: 'token' });
    assert.ok(ref.matches.length > 0);
    await assert.rejects(() => a.tool('read_reference', { path: 'package.json' }), /not configured/);
    const publicJSON = await (await fetch(url + '/api/table')).text();
    assert.doesNotMatch(publicJSON, /Serra Angel|Private reasoning|credentials|oracle_text/);
    const disk = JSON.parse(readFileSync(session, 'utf8'));
    for (const token of Object.values(disk.credentials)) assert.ok(!publicJSON.includes(token));
    await assert.rejects(() => startTable({ session, port: 0 }), /EEXIST/);
    for (const p of players.splice(0)) await p.close();
    await close(table.server);
    table = await startTable({ session, port: 0 });
    const recovered = await (await fetch(table.url + '/api/table')).json();
    assert.equal(recovered.revision, view.revision);
    assert.equal(recovered.zones['p1:hand'].count, 7);
    assert.equal(recovered.zones['p2:library'].count, 53);
  } finally {
    for (const p of players) await p.close();
    if (table?.server.listening) await close(table.server);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the precon demonstration completes over MCP without claiming an AI result', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'game-night-demo-'));
  const session = join(dir, 'session.json');
  let table;
  try {
    table = await startTable({ session, setup: demoSetup(), port: 0 });
    const result = await runDemo({ session, url: table.url, stepMs: 0 });
    const publicView = await (await fetch(table.url + '/api/table')).json();
    assert.equal(publicView.revision, result.revision);
    assert.equal(publicView.turn.phase, 'Demo complete');
    assert.deepEqual(publicView.players.map(p => p.life), [22, 18]);
    assert.equal(publicView.result, null);
    assert.equal(publicView.zones.battlefield.cards.length, 9);
    assert.equal(publicView.zones['p2:graveyard'].cards[0].name, 'Jungle Delver');
    assert.equal(publicView.zones.stack.count, 0);
    assert.ok(publicView.zones.battlefield.cards.some(c => c.attached_to));
    assert.ok(publicView.zones.battlefield.cards.every(c => c.image_url));
    assert.match(publicView.notes[0].text, /No AI game/);
    const disk = JSON.parse(readFileSync(session, 'utf8'));
    assert.equal(Object.values(disk.state.zones).reduce((sum, z) => sum + z.cards.length, 0), 120);
    assert.equal(disk.state.events.length, result.revision);
  } finally {
    if (table?.server.listening) await close(table.server);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('legacy card reads use pinned rulings without rewriting history or bypassing hidden-card checks', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'game-night-rulings-fallback-'));
  const session = join(dir, 'session.json');
  const precons = JSON.parse(readFileSync(new URL('./precons.json', import.meta.url), 'utf8'));
  const reference = precons.players[0].deck.find(card => card.name === 'Mentor of the Meek');
  const legacy = { ...reference, name: 'Legacy reference', count: 1 };
  delete legacy.rulings;
  delete legacy.rulings_cache;
  const pinned = { ...reference, name: 'Existing reference snapshot', count: 1, rulings: [],
    rulings_cache: { ...reference.rulings_cache, fetched_at: '2025-01-01T00:00:00.000Z' } };
  let table, player;
  try {
    table = await startTable({ session, port: 0, setup: {
      shuffle: false, players: [
        { id: 'one', deck: [legacy, pinned] },
        { id: 'two', deck: [legacy] },
      ],
    } });
    player = await connectPlayer({ seat: 'one', session, url: table.url });
    const drawn = await player.tool('act', {
      revision: 0, actions: [{ type: 'draw', count: 2 }], reason: 'Draw the test hand.',
    });
    const [legacyId, pinnedId] = drawn.zones['one:hand'].cards.map(card => card.id);
    assert.deepEqual((await player.tool('read_card', { id: legacyId })).rulings_cache, { status: 'not_fetched' });
    await player.close();
    player = null;
    await close(table.server);
    const before = readFileSync(session, 'utf8');
    const historyBefore = JSON.parse(before).state.events;
    const cardRulings = { [reference.scryfall_id]: {
      rulings: reference.rulings, rulings_cache: reference.rulings_cache,
      name: 'Cache metadata must not rename a card', id: 'not-a-card-id',
    } };
    table = await startTable({ session, port: 0, cardRulings });
    // A match owns its supplied snapshot even if the caller later refreshes a cache.
    cardRulings[reference.scryfall_id].rulings = [];
    player = await connectPlayer({ seat: 'one', session, url: table.url });
    const details = await player.tool('read_card', { id: legacyId });
    assert.equal(details.id, legacyId);
    assert.equal(details.name, legacy.name);
    assert.equal(details.oracle_text, legacy.oracle_text);
    assert.deepEqual(details.rulings, reference.rulings);
    assert.deepEqual(details.rulings_cache, reference.rulings_cache);
    const existing = await player.tool('read_card', { id: pinnedId });
    assert.deepEqual(existing.rulings, []);
    assert.deepEqual(existing.rulings_cache, pinned.rulings_cache);
    const ownHeaders = { Authorization: 'Bearer ' + table.getToken('one') };
    const otherHeaders = { Authorization: 'Bearer ' + table.getToken('two') };
    const concealedId = table.getState().zones['two:library'].cards[0];
    for (const [id, headers, path] of [
      [concealedId, ownHeaders, '/api/card'],
      [legacyId, otherHeaders, '/api/card'],
      [legacyId, {}, '/api/public-card'],
    ]) {
      const response = await fetch(table.url + path + '?id=' + id, { headers });
      assert.equal(response.status, 400);
      assert.match((await response.json()).error, /not available/);
    }
    const observed = await player.tool('observe_table');
    assert.doesNotMatch(JSON.stringify(observed), /rulings/);
    assert.doesNotMatch(JSON.stringify(await player.tool('read_events')), /rulings/);
    assert.equal(readFileSync(session, 'utf8'), before, 'Reference reads do not save a migration or rewrite game actions');
    assert.deepEqual(table.getState().events, historyBefore);
    assert.equal(table.getState().cards[legacyId].definition.rulings, undefined);
    await player.tool('act', {
      revision: 1, actions: [{ type: 'move', card: legacyId, to: 'battlefield' }], reason: 'Expose the card.',
    });
    const publicCard = await (await fetch(table.url + '/api/public-card?id=' + legacyId)).json();
    assert.deepEqual(publicCard.rulings, reference.rulings);
    assert.doesNotMatch(await (await fetch(table.url + '/api/table')).text(), /rulings/);
    await player.tool('act', {
      revision: 2, actions: [{ type: 'card', card: legacyId, set: { face_down: true } }], reason: 'Conceal the identity.',
    });
    const concealed = await fetch(table.url + '/api/public-card?id=' + legacyId);
    assert.equal(concealed.status, 400);
    assert.match((await concealed.json()).error, /concealed/);
  } finally {
    if (player) await player.close();
    if (table?.server.listening) await close(table.server);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('resume repairs derived exports and serves the recorded rules reference', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'game-night-export-recovery-'));
  const session = join(dir, 'session.json');
  const path = 'formats/horde/variants/classic.md';
  let table;
  try {
    table = await startTable({
      session, port: 0,
      setup: { players: [{ id: 'one', deck: [{ name: 'Test card' }] }], references: [path] },
    });
    await close(table.server);
    const saved = JSON.parse(readFileSync(session, 'utf8'));
    // An archived match may contain an older reference than the current source.
    saved.recording.references[0].text = '# Pinned reference\nKeep this exact original procedure.';
    writeFileSync(session, JSON.stringify(saved));
    rmSync(session + '.game.json');
    rmSync(session + '.game.md');
    const basicPath = join(dir, 'BasicRules.txt');
    writeFileSync(basicPath, '# Match-pinned basic rules\nUse this saved basic guide.');
    table = await startTable({ session, port: 0, basicPath });
    assert.equal(existsSync(session + '.game.json'), true);
    assert.match(readFileSync(session + '.game.md', 'utf8'), /Keep this exact original procedure/);
    const headers = { Authorization: 'Bearer ' + table.getToken('one') };
    const basic = await (await fetch(table.url + '/api/rules?source=basic', { headers })).json();
    assert.match(basic.text, /Use this saved basic guide/);
    const reference = await (await fetch(table.url + '/api/references?' + new URLSearchParams({ path }), { headers })).json();
    assert.equal(reference.text, saved.recording.references[0].text);
    const search = await (await fetch(table.url + '/api/references?' + new URLSearchParams({ path, query: 'exact original' }), { headers })).json();
    assert.equal(search.matches.length, 1);
    assert.equal(table.getState().revision, 0);
  } finally {
    if (table?.server.listening) await close(table.server);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a derived export failure does not reject a durable game action and is repaired on resume', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'game-night-export-failure-'));
  const session = join(dir, 'session.json');
  let table, committed = 0;
  const warnings = [];
  t.mock.method(console, 'warn', message => warnings.push(message));
  try {
    table = await startTable({
      session, port: 0, onCommit: () => committed++,
      setup: { players: [{ id: 'one', deck: [{ name: 'Test card', count: 2 }] }] },
    });
    rmSync(session + '.game.md');
    mkdirSync(session + '.game.md');
    const result = await fetch(table.url + '/api/act', {
      method: 'POST', headers: { Authorization: 'Bearer ' + table.getToken('one') },
      body: JSON.stringify({ revision: 0, actions: [{ type: 'draw' }], reason: 'Draw one' }),
    });
    assert.equal(result.status, 200);
    assert.equal((await result.json()).revision, 1);
    assert.equal(committed, 1);
    assert.equal(JSON.parse(readFileSync(session, 'utf8')).state.revision, 1);
    assert.ok(table.getExportError());
    assert.equal(warnings.length, 1);
    await close(table.server);
    rmSync(session + '.game.md', { recursive: true });
    table = await startTable({ session, port: 0 });
    assert.equal(table.getExportError(), null);
    assert.match(readFileSync(session + '.game.md', 'utf8'), /Draw from one:library: Test card/);
    assert.equal(table.getState().revision, 1);
  } finally {
    if (table?.server.listening) await close(table.server);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('action authorization must complete synchronously before any mutation', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'game-night-action-guard-'));
  let table;
  try {
    table = await startTable({
      session: join(dir, 'session.json'), port: 0,
      beforeAction: async () => {},
      setup: { players: [{ id: 'one', deck: [{ name: 'Test card' }] }] },
    });
    const result = await fetch(table.url + '/api/act', {
      method: 'POST', headers: { Authorization: 'Bearer ' + table.getToken('one') },
      body: JSON.stringify({ revision: 0, actions: [{ type: 'draw' }], reason: 'Attempt action' }),
    });
    assert.equal(result.status, 400);
    assert.match((await result.json()).error, /must be synchronous/);
    assert.equal(table.getState().revision, 0);
  } finally {
    if (table?.server.listening) await close(table.server);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('standalone MCP speech and handoffs stay explicit, public and usable without a coordinator', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'game-night-speech-'));
  const session = join(dir, 'session.json');
  let table, player;
  try {
    table = await startTable({ session, port: 0, setup: {
      shuffle: false, players: ['one', 'two'].map(id => ({ id, deck: [{ name: 'Hidden ' + id, count: 3 }] })),
    } });
    player = await connectPlayer({ seat: 'one', session, url: table.url });
    let view = await player.tool('say', { revision: 0, text: 'Hello, table.' });
    assert.equal(view.revision, 1);
    assert.equal(view.turn.priority, null);
    assert.equal(view.decision_completed, undefined);
    view = await player.tool('pass_priority', { revision: 1, next: 'two', message: 'Your response?' });
    assert.equal(view.turn.priority, 'two');
    assert.equal(view.decision_completed, undefined);
    view = await player.tool('pass_turn', { revision: 2, next: 'one', message: 'The next turn begins.' });
    assert.deepEqual(view.turn, { number: 2, active: 'one', priority: 'one', phase: 'Untap' });
    assert.equal(view.zones['one:hand'].count, 0);
    assert.equal(view.zones['one:library'].count, 3);
    assert.equal(view.decision_completed, undefined);
    await assert.rejects(() => player.tool('act', {
      revision: 3, reason: 'Private test',
      actions: [{ type: 'draw' }, { type: 'pass', next: 'two' }, { type: 'pass_turn', next: 'two' }],
    }), /only one/);
    assert.equal(table.getState().revision, 3);
    assert.equal(table.getState().zones['one:hand'].cards.length, 0);
    view = await player.tool('act', {
      revision: 3, reason: 'Keep Hidden one private',
      actions: [{ type: 'draw' }, { type: 'pass', next: 'two', message: 'Go ahead.' }],
    });
    const publicView = await (await fetch(table.url + '/api/table')).json();
    assert.equal(publicView.events[0].changes[0].text, 'Hello, table.');
    assert.equal(publicView.events[1].changes[0].message, 'Your response?');
    assert.equal(publicView.events[2].changes[0].type, 'pass_turn');
    assert.equal(publicView.events[3].changes.at(-1).message, 'Go ahead.');
    assert.doesNotMatch(JSON.stringify(publicView), /Hidden one|Keep Hidden|"reason"/);
    assert.equal(view.zones['one:hand'].cards[0].name, 'Hidden one');
    assert.equal(JSON.parse(readFileSync(session, 'utf8')).state.revision, 4);
  } finally {
    if (player) await player.close();
    if (table?.server.listening) await close(table.server);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('handoff response includes host completion metadata only after a durable commit', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'game-night-handoff-'));
  const session = join(dir, 'session.json');
  let table, player;
  const handoffs = [];
  try {
    table = await startTable({ session, port: 0,
      setup: { players: ['one', 'two'].map(id => ({ id, deck: [{ name: 'Card' }] })) },
      onCommit(state, actor) {
        assert.equal(JSON.parse(readFileSync(session, 'utf8')).state.revision, state.revision);
        const action = state.events.at(-1).actions.at(-1);
        if (!['pass', 'pass_turn'].includes(action.type)) return;
        const handoff = { actor, next: action.next, kind: action.type, revision: state.revision };
        handoffs.push(handoff);
        return { decision_completed: true, handoff };
      },
    });
    player = await connectPlayer({ seat: 'one', session, url: table.url });
    const speech = await player.tool('say', { revision: 0, text: 'A public announcement.' });
    assert.equal(speech.decision_completed, undefined);
    assert.equal(handoffs.length, 0);
    const priority = await player.tool('pass_priority', { revision: 1, next: 'two' });
    assert.equal(priority.decision_completed, true);
    assert.equal(priority.turn.priority, 'two');
    assert.equal(priority.handoff.kind, 'pass');
    const turn = await player.tool('pass_turn', { revision: 2, next: 'two', number: 5, phase: 'Upkeep' });
    assert.equal(turn.decision_completed, true);
    assert.equal(turn.turn.number, 5);
    assert.equal(turn.turn.phase, 'Upkeep');
    assert.equal(turn.handoff.kind, 'pass_turn');
    assert.equal(handoffs.length, 2);
  } finally {
    if (player) await player.close();
    if (table?.server.listening) await close(table.server);
    rmSync(dir, { recursive: true, force: true });
  }
});
