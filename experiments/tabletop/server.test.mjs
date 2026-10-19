import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startTable } from './server.mjs';
import { connectPlayer } from './player-client.mjs';
import { demoSetup, runDemo } from './demo.mjs';

const close = server => new Promise((ok, fail) => server.close(error => error ? fail(error) : ok()));

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
    assert.deepEqual((await a.client.listTools()).tools.map(t => t.name), ['observe_table', 'act', 'read_card', 'read_reference']);
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
