// SS-024 spec §8.1–8.2: every listing file against its registry's schema (vendored, sha256-pinned)
// or a strict schema written from the published docs where no official one exists.
import { createHash } from 'node:crypto';
import { Ajv } from 'ajv';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, test } from 'vitest';
import {
  type MarketplaceJson,
  PACKAGE,
  type PluginJson,
  SERVER_SCHEMA_ID,
  type ServerJson,
  readJson,
  readText,
} from './facts.js';
import { readFrontmatter } from './frontmatter.js';

const SCHEMAS = 'test/listings/schemas/';
type Schema = Record<string, unknown> & { $id?: string; definitions?: Record<string, Definition> };
interface Definition {
  properties?: Record<string, unknown>;
  allOf?: { $ref?: string; properties?: Record<string, unknown> }[];
}
const schema = (file: string) => readJson<Schema>(SCHEMAS + file);
const uri = { validate: (s: string) => URL.canParse(s) };

/** Vendored draft-07 schemas. The official one uses the annotation `example`, and Ajv's
 * strictRequired trips on its own `valueHint` alternatives: strict about unknown keywords only.
 * Advisory (community) schemas: no strictness, no formats. */
function draft07(advisory = false) {
  const ajv = new Ajv({
    allErrors: true,
    strict: false,
    strictSchema: !advisory,
    validateFormats: !advisory,
  });
  ajv.addKeyword('example');
  ajv.addFormat('uri', uri);
  return ajv;
}
/** Our hand-written schemas: fully strict 2020-12. */
function strict2020() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  ajv.addFormat('uri', uri);
  return ajv;
}

describe('vendored schemas are the recorded bytes (SOURCES.md)', () => {
  test.each([
    'server.schema.json',
    'schemastore-claude-code-plugin-manifest.json',
    'schemastore-claude-code-marketplace.json',
  ])('%s', (file) => {
    const sha = createHash('sha256')
      .update(readText(SCHEMAS + file))
      .digest('hex');
    const row = readText(SCHEMAS + 'SOURCES.md')
      .split('\n')
      .find((l) => l.startsWith(`| \`${file}\``));
    expect(row, file).toContain(`\`${sha}\``);
  });
});

describe('server.json (MCP Registry, spec §4)', () => {
  const official = schema('server.schema.json');
  const validate = draft07().compile(official);
  const server = readJson<ServerJson>('server.json');

  test('valid against the official schema 2025-12-11', () => {
    expect(official.$id).toBe(SERVER_SCHEMA_ID);
    expect(validate(server), JSON.stringify(validate.errors)).toBe(true);
  });

  test('the validator rejects (description over 100 characters, no version)', () => {
    expect(validate({ ...server, description: 'x'.repeat(101) })).toBe(false);
    const noVersion: Partial<ServerJson> = { ...server };
    delete noVersion.version;
    expect(validate(noVersion)).toBe(false);
  });

  test('closed world: every key exists in the official schema (it is open: typos would pass)', () => {
    const defs = official.definitions!;
    const props = (name: string): string[] => {
      const def = defs[name];
      return [
        ...Object.keys(def.properties ?? {}),
        ...(def.allOf ?? []).flatMap((part) =>
          part.$ref ? props(part.$ref.split('/').pop()!) : Object.keys(part.properties ?? {}),
        ),
      ];
    };
    const only = (value: object, def: string, at: string) => {
      for (const key of Object.keys(value)) expect(props(def), `${at}.${key}`).toContain(key);
    };
    only(server, 'ServerDetail', 'server');
    only(server.repository, 'Repository', 'repository');
    server.icons.forEach((icon, i) => only(icon, 'Icon', `icons[${i}]`));
    server.packages.forEach((pkg, i) => {
      only(pkg, 'Package', `packages[${i}]`);
      only(pkg.transport, 'StdioTransport', `packages[${i}].transport`);
      pkg.environmentVariables.forEach((v, j) =>
        only(v, 'KeyValueInput', `packages[${i}].environmentVariables[${j}]`),
      );
    });
    expect(() => only({ ...server, websiteURL: 'x' }, 'ServerDetail', 'server')).toThrow();
  });

  test('official registry rules R1–R8 (spec §4.2)', () => {
    expect(server.$schema).toBe(SERVER_SCHEMA_ID); // R1
    expect(server.name).toMatch(
      /^[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]\/[a-zA-Z0-9][a-zA-Z0-9._-]*[a-zA-Z0-9]$/,
    ); // R2
    expect(server.packages).toHaveLength(1);
    const [pkg] = server.packages;
    expect(server.version).toMatch(/^\d+\.\d+\.\d+$/); // R3
    expect(pkg.version).toBe(server.version);
    expect(pkg).toMatchObject({
      registryType: 'npm',
      registryBaseUrl: 'https://registry.npmjs.org',
      transport: { type: 'stdio' },
    }); // R4
    expect(pkg.fileSha256).toBeUndefined();
    expect(pkg.transport.url).toBeUndefined();
    expect(PACKAGE.mcpName).toBe(server.name); // R5, offline half (spec F3)
    expect(server.repository).toEqual({
      url: expect.stringMatching(/^https?:\/\/(www\.)?github\.com\/[\w.-]+\/[\w.-]+\/?$/),
      source: 'github',
    }); // R6
    for (const url of [server.websiteUrl, ...server.icons.map((i) => i.src)]) {
      expect(url).toMatch(/^https:\/\//); // R7
    }
    for (const icon of server.icons) {
      expect(icon.src.length).toBeLessThanOrEqual(255);
      expect(['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp']).toContain(
        icon.mimeType,
      );
    }
    expect(server._meta).toBeUndefined(); // R8
    expect(server.remotes).toBeUndefined();
  });
});

describe('Claude Code plugin files (spec §5)', () => {
  const cases = [
    [
      '.claude-plugin/plugin.json',
      'claude-plugin.schema.json',
      'schemastore-claude-code-plugin-manifest.json',
    ],
    [
      '.claude-plugin/marketplace.json',
      'claude-marketplace.schema.json',
      'schemastore-claude-code-marketplace.json',
    ],
    ['.mcp.json', 'mcp-config.schema.json', null],
  ] as const;

  test.each(cases)('%s: strict schema and community schema', (file, own, community) => {
    const doc = readJson<object>(file);
    const v = strict2020().compile(schema(own));
    expect(v(doc), JSON.stringify(v.errors)).toBe(true);
    if (community) {
      const c = draft07(true).compile(schema(community));
      expect(c(doc), JSON.stringify(c.errors)).toBe(true);
    }
  });

  test('the strict schemas reject reserved names, unknown keys and a parent-relative source', () => {
    const plugin = strict2020().compile(schema('claude-plugin.schema.json'));
    const base = readJson<PluginJson>('.claude-plugin/plugin.json');
    for (const name of [
      'claude-tools',
      'anthropic-helper',
      'claude',
      'my-claude-kit',
      'Store shot',
    ]) {
      expect(plugin({ ...base, name }), name).toBe(false);
    }
    expect(plugin({ ...base, mcpServer: {} })).toBe(false);
    const market = strict2020().compile(schema('claude-marketplace.schema.json'));
    const m = readJson<MarketplaceJson>('.claude-plugin/marketplace.json');
    expect(market({ ...m, name: 'claude-plugins-official' })).toBe(false);
    expect(market({ ...m, plugins: [{ ...m.plugins[0], source: '../x' }] })).toBe(false);
    expect(market({ ...m, plugins: [{ ...m.plugins[0], version: '1.0.0' }] })).toBe(false);
    const mcp = strict2020().compile(schema('mcp-config.schema.json'));
    expect(mcp({ mcpServers: { s: { command: 'npx' } } })).toBe(false);
  });
});

describe('SKILL.md frontmatter (spec §6.1)', () => {
  const v = strict2020().compile(schema('skill-frontmatter.schema.json'));
  const { data } = readFrontmatter(readText('skills/storeshot/SKILL.md'), 'SKILL.md');

  test('valid', () => expect(v(data), JSON.stringify(v.errors)).toBe(true));

  test('the schema rejects reserved words, XML, long text and extra keys', () => {
    for (const bad of [
      { ...data, name: 'claude-helper' },
      { ...data, name: 'Storeshot' },
      { ...data, name: 'store--shot' },
      { ...data, description: 'Use <b>it</b>' },
      { ...data, description: 'x'.repeat(1025) },
      { ...data, compatibility: 'x'.repeat(501) },
      { ...data, model: 'opus' },
    ]) {
      expect(v(bad), JSON.stringify(bad).slice(0, 60)).toBe(false);
    }
  });
});

describe('Cursor rule frontmatter (spec §6.2)', () => {
  const v = strict2020().compile(schema('cursor-rule.schema.json'));
  const { data, body } = readFrontmatter(readText('rules/storeshot.mdc'), 'storeshot.mdc');

  test('Apply Intelligently, and short', () => {
    expect(v(data), JSON.stringify(v.errors)).toBe(true);
    expect(body.split('\n').length).toBeLessThanOrEqual(40);
  });

  test('the schema rejects globs and always-apply', () => {
    expect(v({ ...data, globs: '**/*.swift' })).toBe(false);
    expect(v({ ...data, alwaysApply: true })).toBe(false);
  });
});
