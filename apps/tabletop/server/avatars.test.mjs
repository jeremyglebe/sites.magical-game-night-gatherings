import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assignAvatars, avatarIds } from './avatars.mjs';
import { startApp, normalizeSetup } from './app.mjs';

const seats = count => Array.from({ length: count }, (_, i) => ({
  id: `p${i + 1}`, ai: true, deck: [{ name: 'Plains', count: 1 }],
}));

test('avatar assignment preserves identities, avoids duplicates and keeps arbitrary seat counts', () => {
  const input = seats(avatarIds.length + 4);
  input[0].ai = false;
  input[3].avatar = 'robot-wizard';
  input[4].avatar = 'robot-wizard';
  input[5].avatar = '../../secret';
  const assigned = assignAvatars(input);
  assert.equal(assigned.length, input.length);
  assert.equal(assigned[0].avatar, null, 'human seats do not consume a random portrait');
  assert.equal(assigned[3].avatar, 'robot-wizard', 'a saved identity survives earlier missing seats');
  assert.notEqual(assigned[4].avatar, 'robot-wizard');
  const selected = assigned.map(player => player.avatar).filter(Boolean);
  assert.equal(selected.length, avatarIds.length);
  assert.equal(new Set(selected).size, selected.length);
  assert.deepEqual(new Set(selected), new Set(avatarIds));
  assert.equal(assigned.filter(player => player.ai && !player.avatar).length, 3);
  assert.deepEqual(assignAvatars(assigned), assigned, 'reload does not reshuffle saved choices');
  assert.equal(input[1].avatar, undefined, 'the caller input is not mutated');
  const normalized = normalizeSetup({ players: seats(6) }).players;
  assert.equal(new Set(normalized.map(player => player.avatar)).size, 6);
});

test('a legacy match receives saved portraits without changing game state or launching players', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'game-night-avatars-'));
  let app, calls = 0;
  const options = {
    directory, port: 0, readPlanUsage: null,
    runPlayerFactory: () => async () => { calls++; },
  };
  try {
    app = await startApp({ ...options, setup: { players: seats(6) } });
    const { id, session } = app.appState().match;
    const matchFile = join(directory, 'matches', id, 'match.json');
    await app.close();
    const saved = JSON.parse(readFileSync(matchFile, 'utf8'));
    for (const player of saved.config.players) delete player.avatar;
    saved.config.players[4].avatar = 'robot-orc';
    writeFileSync(matchFile, JSON.stringify(saved));
    const tableBefore = readFileSync(session, 'utf8');
    app = await startApp(options);
    const after = app.appState().match.players.map(player => player.avatar);
    assert.equal(after[4], 'robot-orc');
    assert.equal(new Set(after).size, 6);
    assert.deepEqual(JSON.parse(readFileSync(matchFile, 'utf8')).config.players.map(p => p.avatar), after);
    assert.equal(readFileSync(session, 'utf8'), tableBefore);
    await app.close();
    app = await startApp(options);
    assert.deepEqual(app.appState().match.players.map(player => player.avatar), after);
    const response = await (await fetch(app.url + '/api/app')).json();
    assert.deepEqual(response.match.players.map(player => player.avatar), after);
    assert.equal(calls, 0);
    for (const url of [app.url, app.getTable().url]) {
      for (const path of ['/avatars/unknown.png', '/avatars/prompts.json', '/avatars/robot-orc.png/extra', '/avatars/%2e%2e%2fapp.mjs']) {
        const invalid = await fetch(url + path);
        assert.equal(invalid.status, 404, path);
        assert.equal(await invalid.text(), 'Avatar not found');
      }
    }
  } finally {
    if (app?.server.listening) await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('pack images are served publicly by the app and table without exposing other files', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'game-night-avatar-assets-'));
  let app;
  try {
    app = await startApp({ directory, port: 0, readPlanUsage: null,
      setup: { players: seats(1) }, runPlayerFactory: () => async () => {},
    });
    for (const url of [app.url, app.getTable().url]) {
      for (const id of avatarIds) {
        const response = await fetch(`${url}/avatars/${id}.png`);
        assert.equal(response.status, 200, id);
        assert.equal(response.headers.get('content-type'), 'image/png');
        assert.match(response.headers.get('cache-control'), /max-age/);
        assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
        const data = Buffer.from(await response.arrayBuffer());
        assert.deepEqual(data.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      }
    }
  } finally {
    if (app?.server.listening) await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
