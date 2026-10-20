import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('managed MCP uses only the supplied seat token and keeps decision acknowledgments out of act', async () => {
  const requests = [];
  const http = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    requests.push({ url: request.url, authorization: request.headers.authorization,
      decisionId: request.headers['x-tabletop-decision-id'], body: body ? JSON.parse(body) : null });
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ ok: true }));
  });
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
  const client = new Client({ name: 'tabletop-managed-test', version: '1' }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('./mcp.mjs', import.meta.url)), '--seat', 'solo',
      '--session', '/does-not-exist/table.json', '--url', `http://127.0.0.1:${http.address().port}`],
    env: { TABLETOP_PLAYER_TOKEN: 'one-seat-token', TABLETOP_DECISION_ID: 'decision-123' },
    stderr: 'pipe',
  });
  try {
    await client.connect(transport);
    const tools = (await client.listTools()).tools;
    const act = tools.find(tool => tool.name === 'act');
    assert.ok(act.inputSchema.properties.actions.items.properties.type.enum.includes('pass'));
    assert.ok(act.inputSchema.properties.actions.items.properties.type.enum.includes('pass_turn'));
    assert.ok(act.inputSchema.properties.actions.items.properties.type.enum.includes('say'));
    assert.ok(act.inputSchema.properties.actions.items.properties.next);
    const complete = tools.find(tool => tool.name === 'complete_decision');
    assert.equal(complete.inputSchema.properties.decision_id, undefined);
    await client.callTool({ name: 'complete_decision', arguments: { status: 'no_op' } });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, '/api/decision');
    assert.deepEqual(requests[0].body, { status: 'no_op', decision_id: 'decision-123' });
    await client.callTool({ name: 'act', arguments: { revision: 2, reason: 'Pass', actions: [{ type: 'pass', next: 'solo' }] } });
    assert.equal(requests[1].url, '/api/act');
    assert.equal(requests[1].body.decision_id, 'decision-123');
    await client.callTool({ name: 'read_events', arguments: { since: 12 } });
    assert.equal(requests[2].url, '/api/events?since=12');
    await client.callTool({ name: 'read_rules', arguments: { source: 'comprehensive', rule: '117.3' } });
    assert.equal(requests[3].url, '/api/rules?source=comprehensive&rule=117.3');
    for (const name of ['say', 'pass_priority', 'pass_turn']) {
      const tool = tools.find(tool => tool.name === name);
      assert.ok(tool);
      assert.equal(tool.inputSchema.properties.decision_id, undefined);
      assert.ok(tool.inputSchema.required.includes('revision'));
    }
    await client.callTool({ name: 'say', arguments: { revision: 3, text: 'I keep my hand.' } });
    assert.deepEqual(requests[4].body, {
      revision: 3, actions: [{ type: 'say', text: 'I keep my hand.' }],
      reason: 'Public table speech', decision_id: 'decision-123',
    });
    await client.callTool({ name: 'pass_priority', arguments: { revision: 4, next: 'other', message: 'Any response?' } });
    assert.deepEqual(requests[5].body, {
      revision: 4, actions: [{ type: 'pass', next: 'other', message: 'Any response?' }],
      reason: 'Explicit player handoff', decision_id: 'decision-123',
    });
    await client.callTool({ name: 'pass_turn', arguments: { revision: 5, next: 'other', number: 7, phase: 'Untap', message: 'Your turn.' } });
    assert.deepEqual(requests[6].body.actions, [{ type: 'pass_turn', next: 'other', number: 7, phase: 'Untap', message: 'Your turn.' }]);
    assert.equal(requests[6].body.decision_id, 'decision-123');
    assert.ok(requests.slice(4).every(request => request.url === '/api/act'));
    await client.callTool({ name: 'pass_turn', arguments: { revision: 6, next: 'other' } });
    assert.deepEqual(requests[7].body.actions, [{ type: 'pass_turn', next: 'other' }]);
    const submit = tools.find(tool => tool.name === 'submit_survey');
    assert.equal(submit.inputSchema.properties.playerId, undefined);
    assert.equal(submit.inputSchema.properties.decision_id, undefined);
    assert.ok(submit.inputSchema.properties.answers.required.includes('ratings'));
    await client.callTool({ name: 'read_survey', arguments: {} });
    assert.equal(requests[8].url, '/api/survey');
    await client.callTool({ name: 'submit_survey', arguments: { answers: { fixture: true }, playerId: 'other' } });
    assert.deepEqual(requests[9].body, { answers: { fixture: true }, decision_id: 'decision-123' });
    assert.equal(requests[9].url, '/api/survey');
    assert.ok(requests.every(request => request.authorization === 'Bearer one-seat-token'));
    assert.ok(requests.every(request => request.decisionId === 'decision-123'));
  } finally {
    await client.close();
    await new Promise(resolve => http.close(resolve));
  }
});

test('MCP steering errors preserve every public message and the fresh player view', async () => {
  const payload = { error: 'New human table speech needs your attention. No action was applied.',
    steering: { revision: 24, instruction: 'Reconsider before continuing.',
      messages: Array.from({ length: 20 }, (_, i) => ({ revision: i + 5, playerId: 'human', text: `Message ${i + 1}` })) },
    table: { revision: 24, zones: { 'other:hand': { count: 7, cards: [] } } } };
  const http = createServer((request, response) => {
    response.writeHead(400, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(payload));
  });
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
  const client = new Client({ name: 'steering-test', version: '1' }, { capabilities: {} });
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [fileURLToPath(new URL('./mcp.mjs', import.meta.url)), '--seat', 'ai', '--url', `http://127.0.0.1:${http.address().port}`],
    env: { TABLETOP_PLAYER_TOKEN: 'one-seat-token', TABLETOP_DECISION_ID: 'decision-123' }, stderr: 'pipe' });
  try {
    await client.connect(transport);
    const result = await client.callTool({ name: 'act', arguments: { revision: 4, reason: 'Original plan', actions: [{ type: 'draw' }] } });
    assert.equal(result.isError, true);
    assert.deepEqual(JSON.parse(result.content[0].text), payload);
  } finally {
    await client.close();
    await new Promise(resolve => http.close(resolve));
  }
});
