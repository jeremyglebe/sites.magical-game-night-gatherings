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
    requests.push({ url: request.url, authorization: request.headers.authorization, body: body ? JSON.parse(body) : null });
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
    assert.ok(requests.every(request => request.authorization === 'Bearer one-seat-token'));
  } finally {
    await client.close();
    await new Promise(resolve => http.close(resolve));
  }
});
