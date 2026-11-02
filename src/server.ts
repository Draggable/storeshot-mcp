import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Storeshot } from '@draggable/storeshot-sdk';
import { AuthSession } from './auth/session.js';
import { CredentialStore } from './auth/store.js';
import type { Config } from './config.js';
import type { Logger } from './stdout.js';
import { registerTools } from './tools/define.js';
import { TOOLS } from './tools/index.js';
import { MCP_VERSION } from './version.js';

export const SERVER_NAME = 'storeshot-mcp';
export const SERVER_TITLE = 'Storeshot MCP';
export const INSTRUCTIONS = [
  'Storeshot turns raw app screenshots into App Store and Google Play marketing images.',
  'Typical flow: get_store_requirements, then upload_screenshot for each raw screenshot, then create_screenshot_set (with a live key call it with dryRun: true first to see the cost), then get_job_status with waitSeconds until final, then download_results (layout "fastlane" into the project root for fastlane projects).',
  'Test keys (ss_test_…) are free and return sample images of the exact sizes; live keys (ss_live_…) make real images and spend credits. If a tool answers ACCOUNT_LINK_REQUIRED, show the user the link and code, then call link_status.',
  'Never ask the user to paste an API key into the chat.',
].join('\n');

export interface ServerDeps {
  config: Config;
  log: Logger;
  secrets: string[];
  createClient?: (apiKey: string | null) => Storeshot;
}

export function createServer(deps: ServerDeps) {
  const { config, log, secrets } = deps;
  const createClient =
    deps.createClient ??
    ((apiKey: string | null) =>
      new Storeshot({
        apiKey,
        baseUrl: config.baseUrl,
        client: { surface: 'mcp', name: `storeshot-mcp@${MCP_VERSION}` },
      }));
  const store = config.noStore ? null : new CredentialStore(config.credentialsFile, log);
  const session = new AuthSession({ config, store, createClient, log, secrets });
  const server = new McpServer(
    { name: SERVER_NAME, title: SERVER_TITLE, version: MCP_VERSION },
    { instructions: INSTRUCTIONS },
  );
  registerTools(server, TOOLS, { config, session, log });
  return { server, session };
}
