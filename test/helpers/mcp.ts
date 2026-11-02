import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools, type ToolDeps, type ToolSpec } from '../../src/tools/define.js';

/** An MCP client connected in memory to a server with the given tools. */
export async function connect(specs: unknown[], deps: unknown) {
  const server = new McpServer({ name: 'storeshot-mcp', version: '0.0.0-test' });
  registerTools(server, specs as ToolSpec[], deps as ToolDeps);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(b);
  return { client, close: () => client.close() };
}

export const textOf = (r: unknown, i = 0): string =>
  ((r as { content?: { text?: string }[] }).content?.[i]?.text ?? '') as string;
