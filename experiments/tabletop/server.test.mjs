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
      ['observe_table', 'act', 'read_card', 'read_reference', 'read_events', 'read_rules', 'complete_decision']);
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
    table = await startTable({ session, port: 0 });
    assert.equal(existsSync(session + '.game.json'), true);
    assert.match(readFileSync(session + '.game.md', 'utf8'), /Keep this exact original procedure/);
    const headers = { Authorization: 'Bearer ' + table.getToken('one') };
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
