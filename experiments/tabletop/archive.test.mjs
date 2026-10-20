import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, symlinkSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { get } from 'node:http';
import { createArchive, validateRecording } from './archive.mjs';
import { startReviewServer } from './review-server.mjs';
import { startApp } from './app.mjs';
import { createTable, applyActions } from './table.mjs';
import { createRecording, appendRecording } from './game-log.mjs';

const config = {
  title: 'A saved game', shuffle: false,
  players: [{ id: 'p1', name: 'Wizard', avatar: 'robot-wizard', model: 'test-model', reasoning: 'high', ai: true,
    deck: [{ name: 'Plains', count: 3, type_line: 'Basic Land — Plains', oracle_text: '{T}: Add {W}.' }] },
  { id: 'p2', name: 'Orc', avatar: 'robot-orc', ai: false, deck: [{ name: 'Forest', count: 3 }] }],
};
function fixture(actions = []) {
  let state = createTable(config);
  state.created_at = '2026-10-20T12:00:00.000Z';
  let recording = createRecording(state, config);
  for (const batch of actions) {
    const next = applyActions(state, 'p1', state.revision, batch, 'Fixture reason');
    next.events.at(-1).at = `2026-10-20T12:00:${String(next.revision).padStart(2, '0')}.000Z`;
    recording = appendRecording(recording, state, next);
    state = next;
  }
  return { state, recording, credentials: { p1: 'secret-player-token' } };
}
function save(directory, id, session = fixture()) {
  const folder = join(directory, 'matches', id);
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, 'session.json'), JSON.stringify(session));
  writeFileSync(join(folder, 'session.json.game.json'), JSON.stringify(session.recording));
  writeFileSync(join(folder, 'match.json'), JSON.stringify({ id, config, coordinator: {
    transcript: 'secret-coordinator-transcript', players: [{ sessionId: 'secret-codex-session' }],
  } }));
  return folder;
}
const temporary = () => mkdtempSync(join(tmpdir(), 'game-night-archive-'));
const cleanup = directory => rmSync(directory, { recursive: true, force: true });

test('the library opens existing recordings immediately, with complete deck data and no session envelope', () => {
  const directory = temporary();
  try {
    save(directory, 'open-game');
    const finished = fixture([[{ type: 'draw', count: 2 }, { type: 'say', text: 'Keeping these.' }],
      [{ type: 'result', winners: ['p1'], explanation: 'A reported winner.' }]]);
    finished.recording.credentials = 'secret-extra-envelope';
    finished.recording.setup.players[0].token = 'secret-setup-token';
    save(directory, 'finished-game', finished);
    const archive = createArchive({ directory });
    const library = archive.list();
    assert.deepEqual(library.games.map(game => game.id), ['finished-game', 'open-game']);
    assert.equal(library.liveTableUrl, '/');
    const entry = archive.read('finished-game');
    assert.equal(entry.game.completed, true);
    assert.deepEqual(entry.game.result.winners, ['p1']);
    assert.equal(entry.game.revision, 2);
    assert.equal(entry.game.frameCount, 2);
    assert.deepEqual(entry.game.players[0], { id: 'p1', name: 'Wizard', avatar: 'robot-wizard', model: 'test-model', reasoning: 'high', ai: true });
    assert.equal(entry.game.players[1].ai, false);
    assert.equal(entry.recording.setup.players[0].deck[0].count, 3);
    assert.equal(entry.recording.setup.players[0].deck[0].oracle_text, '{T}: Add {W}.');
    assert.equal(Object.keys(entry.recording.initial.cards).length, 6);
    assert.ok(!JSON.stringify(entry).includes('secret-'));
    assert.ok(!Object.hasOwn(entry, 'credentials'));
  } finally { cleanup(directory); }
});

test('session recording is authoritative, and the active in-memory recording can be newer still', () => {
  const directory = temporary();
  try {
    const folder = save(directory, 'live', fixture([[{ type: 'draw' }]]));
    writeFileSync(join(folder, 'session.json.game.json'), JSON.stringify(fixture().recording));
    assert.equal(createArchive({ directory }).read('live').game.revision, 1);
    const newest = fixture([[{ type: 'draw' }], [{ type: 'say', text: 'A newer update.' }]]);
    const archive = createArchive({ directory, getCurrent: id => id === 'live' ? { id, config, recording: newest.recording } : null });
    assert.equal(archive.read('live').game.revision, 2);
    assert.equal(archive.list().games[0].revision, 2);
    assert.equal(JSON.parse(readFileSync(join(folder, 'session.json'))).state.revision, 1, 'reading never rewrites saved state');
  } finally { cleanup(directory); }
});

test('one damaged, unsupported or linked recording cannot break the other saved games', () => {
  const directory = temporary();
  const outside = temporary();
  try {
    save(directory, 'good');
    const bad = save(directory, 'broken');
    writeFileSync(join(bad, 'session.json'), '{unfinished');
    const unsupported = fixture(); unsupported.recording.version = 2;
    save(directory, 'future-version', unsupported);
    const malformed = fixture(); malformed.recording.initial.cards.bad = null;
    save(directory, 'malformed', malformed);
    const target = save(outside, 'outside-game');
    symlinkSync(target, join(directory, 'matches', 'linked-directory'));
    const linked = save(directory, 'linked-file');
    rmSync(join(linked, 'session.json'));
    symlinkSync(join(target, 'session.json'), join(linked, 'session.json'));
    const archive = createArchive({ directory });
    assert.deepEqual(archive.list().games.map(game => game.id), ['good']);
    assert.deepEqual(archive.list().warnings, ['5 saved games could not be read.']);
    assert.throws(() => archive.read('broken'));
    assert.throws(() => archive.read('future-version'));
    assert.throws(() => archive.read('linked-directory'));
    assert.throws(() => archive.read('linked-file'));
    for (const id of ['../outside-game', '..', '/', '/tmp/game', 'good/session.json', '%2e%2e', 'a\\b']) {
      assert.throws(() => archive.read(id), /Saved game unavailable/);
    }
    assert.ok(!JSON.stringify(archive.list()).includes(directory));
  } finally { cleanup(directory); cleanup(outside); }
});

test('standalone exports work if their session is absent; empty libraries remain read-only', () => {
  const directory = temporary();
  try {
    const emptyPath = join(directory, 'does-not-exist');
    assert.deepEqual(createArchive({ directory: emptyPath }).list().games, []);
    assert.equal(existsSync(emptyPath), false);
    const folder = save(directory, 'export-only');
    rmSync(join(folder, 'session.json'));
    rmSync(join(folder, 'match.json'));
    const entry = createArchive({ directory }).read('export-only');
    assert.equal(entry.game.players[0].avatar, 'robot-wizard');
    assert.equal(entry.game.players[0].model, 'test-model');
    assert.equal(entry.recording.setup.players.length, 2);
  } finally { cleanup(directory); }
});

test('recording validation rejects unsupported versions, incomplete frames, and broken ordering', () => {
  const valid = fixture([[{ type: 'draw' }], [{ type: 'say', text: 'Hello.' }]]).recording;
  assert.equal(validateRecording(valid), valid);
  const variants = [
    r => { r.format = 'a-different-format'; }, r => { r.version = 2; },
    r => { delete r.initial; }, r => { r.initial.version = 2; },
    r => { r.frames[1].event.revision = 1; }, r => { delete r.frames[0].delta.revision; },
    r => { r.frames[0].delta.revision = 99; }, r => { r.frames[0].delta.zones = { set: {}, removed: 'no' }; },
    r => { r.frames[0].delta.turn = null; }, r => { r.initial.players = []; },
  ];
  for (const change of variants) {
    const broken = structuredClone(valid); change(broken);
    assert.throws(() => validateRecording(broken), /Unsupported or incomplete recording/);
  }
});

test('the read-only review server protects archive routes and leaves a live recording untouched', async () => {
  const directory = temporary();
  let server;
  try {
    const folder = save(directory, 'playing', fixture([[{ type: 'draw' }]]));
    const snapshots = new Map(readdirSync(folder).map(name => [name, readFileSync(join(folder, name), 'utf8')]));
    server = await startReviewServer({ directory, port: 0 });
    const library = await (await fetch(server.url + '/api/games')).json();
    assert.equal(library.games[0].completed, false);
    assert.equal(library.liveTableUrl, 'http://127.0.0.1:5180/');
    const detail = await (await fetch(server.url + '/api/games/playing')).json();
    assert.equal(detail.recording.frames.length, 1);
    assert.equal(detail.liveTableUrl, 'http://127.0.0.1:5180/');
    assert.ok(!JSON.stringify(detail).includes('secret-'));
    const download = await fetch(server.url + '/api/games/playing/recording');
    assert.equal(download.status, 200);
    assert.match(download.headers.get('content-disposition'), /game-playing.json/);
    assert.equal((await download.json()).format, 'game-night-playtest-log');
    assert.equal((await fetch(server.url + '/api/games', { headers: { Origin: 'https://attacker.example' } })).status, 403);
    const badHostStatus = await new Promise((resolve, reject) => {
      get(server.url + '/api/games', { headers: { Host: 'attacker.example' } }, response => {
        response.resume(); resolve(response.statusCode);
      }).on('error', reject);
    });
    assert.equal(badHostStatus, 403);
    assert.equal((await fetch(server.url + '/api/games', { method: 'POST' })).status, 405);
    for (const path of ['/api/games/playing/session.json', '/api/games/%2fetc%2fpasswd', '/api/games/%2e%2e%2fplaying', '/review/../app.mjs', '/api/control']) {
      const response = await fetch(server.url + path);
      assert.equal(response.status, 404);
      const text = await response.text();
      assert.ok(!text.includes(directory));
      assert.ok(!text.includes('secret-'));
    }
    const redirect = await fetch(server.url + '/', { redirect: 'manual' });
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.get('location'), '/games');
    for (const [name, text] of snapshots) assert.equal(readFileSync(join(folder, name), 'utf8'), text);
    assert.deepEqual(readdirSync(directory), ['matches'], 'reviewing does not acquire a live-app lock or write settings');
  } finally { if (server) await server.close(); cleanup(directory); }
});

test('the integrated archive is available without resuming a match and has the app origin guard', async () => {
  const directory = temporary();
  let app;
  try {
    save(directory, 'old-game');
    app = await startApp({ directory, port: 0, resume: false, readPlanUsage: null, runPlayerFactory: () => async () => {
      assert.fail('Reviewing a game must not invoke any AI player');
    } });
    assert.equal(app.appState().archive, true);
    assert.equal(app.appState().match, null);
    const response = await fetch(app.url + '/api/games');
    assert.equal(response.status, 200);
    assert.equal((await response.json()).games[0].id, 'old-game');
    const detail = await fetch(app.url + '/api/games/old-game');
    assert.equal(detail.status, 200);
    assert.equal((await detail.json()).liveTableUrl, '/');
    assert.equal((await fetch(app.url + '/api/games/old-game', { headers: { Origin: 'https://attacker.example' } })).status, 403);
  } finally { if (app) await app.close(); cleanup(directory); }
});
