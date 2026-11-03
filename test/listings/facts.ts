// SS-024 §8.2: the single place the listing tests read facts from. Nothing here is typed by hand
// except the URL allowlist and the list of listing files.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_BASE_URL } from '../../src/config.js';
import { CREDITS_PER_IMAGE, PAID_TOOLS } from '../../src/credits.js';

export const PKG_ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const readText = (rel: string) => readFileSync(path.join(PKG_ROOT, rel), 'utf8');
export const readJson = <T>(rel: string): T => JSON.parse(readText(rel)) as T;

interface SnapshotTool {
  name: string;
  title: string;
  annotations: { readOnlyHint: boolean; destructiveHint: boolean };
}
export const TOOLS = readJson<{ tools: SnapshotTool[] }>('test/__snapshots__/tools.json').tools;
export { CREDITS_PER_IMAGE, PAID_TOOLS, DEFAULT_BASE_URL };

export const PACKAGE = readJson<{ name: string; version: string; mcpName?: string }>(
  'package.json',
);
/** The SDK package of the same version (only named in links). */
export const SDK_PACKAGE = '@draggable/storeshot-sdk';

/** Variables of the README "Environment variables" table (the documented set). */
export const ENV_VARS: string[] = [
  ...readText('README.md')
    .split('## Environment variables')[1]
    .split('\n## ')[0]
    .matchAll(/^\| `([A-Z][A-Z0-9_]+)` +\|/gm),
].map((m) => m[1]);

/** The public mirror; listing files point here (pinned to mirror/allowlist.mjs by mirror.test.mjs). */
export const MIRROR_URL = 'https://github.com/Draggable/storeshot-mcp';
export const SERVER_SCHEMA_ID =
  'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json';
/** The one name of the plugin, marketplace, skill and MCP server entry. */
export const SERVER_NAME_KEY = 'storeshot';

/** Files a registry or client reads (exported to the mirror root unchanged). */
export const LISTING_FILES = [
  'server.json',
  '.mcp.json',
  '.claude-plugin/plugin.json',
  '.claude-plugin/marketplace.json',
  'skills/storeshot/SKILL.md',
  'rules/storeshot.mdc',
  'snippets/agents-section.md',
  'snippets/prompt.md',
] as const;

const EXACT_URLS = new Set([
  'https://storeshot.art/',
  'https://storeshot.art/llms.txt',
  'https://storeshot.art/brand/storeshot-mark.png',
  'https://console.storeshot.art/',
  DEFAULT_BASE_URL,
  MIRROR_URL,
  'https://github.com/Draggable/storeshot-sdk',
  `https://www.npmjs.com/package/${PACKAGE.name}`,
  `https://www.npmjs.com/package/${SDK_PACKAGE}`,
  'https://registry.npmjs.org',
  SERVER_SCHEMA_ID,
]);
/** A docs page or its Markdown twin; that the page exists is checked in the monorepo. */
export const DOCS_URL = /^https:\/\/storeshot\.art\/docs\/([a-z0-9-]+)(?:\/|\.md)(?:#[a-z0-9-]+)?$/;

export function isAllowedUrl(url: string): boolean {
  return EXACT_URLS.has(url) || DOCS_URL.test(url);
}

/** Every https URL in a text, trailing punctuation removed. */
export const urlsIn = (text: string): string[] =>
  [...text.matchAll(/https:\/\/[^\s)"'`<>\]]+/g)].map((m) => m[0].replace(/[.,;:]+$/, ''));

/** Tool-like tokens (`get_…`, `list_…`, …) in backticks. */
export const toolTokensIn = (text: string): string[] =>
  [...text.matchAll(/`((?:get|list|upload|generate|create|download|link)_[a-z_]+)`/g)].map(
    (m) => m[1],
  );

/** The shapes the tests read (only the fields they touch). */
export interface EnvVar {
  name: string;
  description: string;
  isRequired?: boolean;
  isSecret?: boolean;
  format?: string;
  choices?: string[];
  default?: string;
}
export interface ServerJson {
  $schema: string;
  name: string;
  title: string;
  description: string;
  version: string;
  websiteUrl: string;
  repository: { url: string; source: string; subfolder?: string };
  icons: { src: string; mimeType?: string; sizes?: string[] }[];
  packages: {
    registryType: string;
    registryBaseUrl?: string;
    identifier: string;
    version: string;
    runtimeHint?: string;
    fileSha256?: string;
    transport: { type: string; url?: string };
    environmentVariables: EnvVar[];
  }[];
  remotes?: unknown;
  _meta?: unknown;
}
export interface PluginJson {
  name: string;
  version: string;
  homepage: string;
  repository: string;
  license: string;
}
export interface MarketplaceJson {
  name: string;
  plugins: { name: string; source: string; version?: string }[];
}
