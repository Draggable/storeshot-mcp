#!/usr/bin/env node
// storeshot-mcp: the Storeshot MCP server over stdio (SS-020). stdout carries only JSON-RPC: the
// guard below is installed before any other module is loaded (dynamic imports).
import { createLogger, guardStdout } from './stdout.js';

guardStdout();
const secrets: string[] = [];
const log = createLogger(undefined, secrets);

const { readConfig } = await import('./config.js');
const { createServer } = await import('./server.js');
const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
const { MCP_VERSION } = await import('./version.js');

const config = readConfig();
if (config.apiKey) secrets.push(config.apiKey);
for (const warning of config.warnings) log(`warning: ${warning}`);
if (config.error) {
  log(`configuration error: ${config.error} (every tool will answer INVALID_CONFIGURATION)`);
}
const keyFrom = config.apiKey
  ? 'from STORESHOT_API_KEY'
  : config.noStore
    ? 'by account link (not stored)'
    : 'stored or by account link';
log(
  `storeshot-mcp ${MCP_VERSION} on ${new URL(config.baseUrl).host}, environment ${config.environment ?? 'chosen when linking'}, key ${keyFrom}`,
);

const { server, session } = createServer({ config, log, secrets });
const transport = new StdioServerTransport();
let closing = false;
const shutdown = async () => {
  if (closing) return;
  closing = true;
  session.close();
  await server.close().catch(() => undefined);
  process.exit(0);
};
transport.onclose = () => void shutdown();
process.stdin.on('end', () => void shutdown());
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
await server.connect(transport);
