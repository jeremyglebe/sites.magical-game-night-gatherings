import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export async function connectPlayer({ seat, session, url }) {
  const client = new Client({ name: 'tabletop-driver-' + seat, version: '0.1.0' }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('./mcp.mjs', import.meta.url)), '--seat', seat, '--session', resolve(session), '--url', url],
    stderr: 'inherit',
  });
  try { await client.connect(transport); }
  catch (error) { await client.close(); throw error; }
  return {
    client,
    async tool(name, args = {}) {
      const response = await client.callTool({ name, arguments: args });
      const content = response.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
      if (response.isError) throw new Error(content);
      return JSON.parse(content);
    },
    close: () => client.close(),
  };
}
