// SS-024 spec §8.2: the listing files repeat facts that live elsewhere (tool snapshot, credit
// costs, README environment table, package.json). Each is pinned to its source here.
import { describe, expect, test } from 'vitest';
import {
  CREDITS_PER_IMAGE,
  ENV_VARS,
  LISTING_FILES,
  PAID_TOOLS,
  type MarketplaceJson,
  MIRROR_URL,
  PACKAGE,
  type PluginJson,
  SERVER_NAME_KEY,
  type ServerJson,
  TOOLS,
  isAllowedUrl,
  readJson,
  readText,
  toolTokensIn,
  urlsIn,
} from './facts.js';
import { readFrontmatter } from './frontmatter.js';

describe('listing facts (spec §8.2)', () => {
  test('come from the snapshot, the README and package.json', () => {
    expect(TOOLS.map((t) => t.name)).toEqual([
      'get_store_requirements',
      'list_devices',
      'upload_screenshot',
      'generate_screenshot',
      'create_screenshot_set',
      'get_job_status',
      'download_results',
      'get_credits',
      'link_status',
    ]);
    expect(ENV_VARS).toContain('STORESHOT_API_KEY');
    expect(ENV_VARS).toContain('XDG_CONFIG_HOME');
    expect(PACKAGE.name).toBe('@draggable/storeshot-mcp');
    expect(isAllowedUrl('https://storeshot.art/docs/mcp/')).toBe(true);
    expect(isAllowedUrl('https://storeshot.art/docs/agents-quickstart.md')).toBe(true);
    expect(isAllowedUrl('https://www.npmjs.com/package/@draggable/storeshot-mcp')).toBe(true);
    expect(isAllowedUrl('https://storeshot.art/docs/Nope/')).toBe(false);
    expect(isAllowedUrl('https://evil.example/')).toBe(false);
  });
});

describe('server.json pins (spec §4)', () => {
  const server = readJson<ServerJson>('server.json');
  const [pkg] = server.packages;
  const env = Object.fromEntries(pkg.environmentVariables.map((v) => [v.name, v]));

  test('names, version, repository, website', () => {
    expect(server.name).toBe(PACKAGE.mcpName);
    expect(pkg.identifier).toBe(PACKAGE.name);
    expect(server.version).toBe(PACKAGE.version);
    expect(pkg.version).toBe(PACKAGE.version);
    expect(server.repository.url).toBe(MIRROR_URL);
    expect(server.websiteUrl).toBe('https://storeshot.art/docs/mcp/');
    expect(pkg.runtimeHint).toBe('npx');
  });

  test('environment variables: documented, secret key, no default environment (A2), none required', () => {
    expect(Object.keys(env)).toEqual([
      'STORESHOT_API_KEY',
      'STORESHOT_ENVIRONMENT',
      'STORESHOT_MCP_ROOT',
      'STORESHOT_MCP_NO_STORE',
    ]);
    for (const name of Object.keys(env)) expect(ENV_VARS).toContain(name);
    expect(env.STORESHOT_API_KEY.isSecret).toBe(true);
    expect(env.STORESHOT_ENVIRONMENT.choices).toEqual(['test', 'live']);
    expect(env.STORESHOT_ENVIRONMENT.default).toBeUndefined();
    expect(env.STORESHOT_MCP_ROOT.format).toBe('filepath');
    for (const v of Object.values(env)) expect(v.isRequired).toBe(false);
  });

  test('descriptions are the README table text', () => {
    const readme = readText('README.md');
    for (const v of pkg.environmentVariables) {
      const row = readme.split('\n').find((l) => l.startsWith(`| \`${v.name}\``))!;
      const meaning = row.split('|')[3].trim().replace(/`/g, '');
      expect(v.description, v.name).toBe(meaning);
    }
  });
});

describe('plugin, marketplace and .mcp.json pins (spec §5)', () => {
  const plugin = readJson<PluginJson>('.claude-plugin/plugin.json');
  const market = readJson<MarketplaceJson>('.claude-plugin/marketplace.json');

  test('one name everywhere, the package version, the mirror, the docs page', () => {
    expect(plugin.name).toBe(SERVER_NAME_KEY);
    expect(market.name).toBe(SERVER_NAME_KEY);
    expect(market.plugins.map((p) => p.name)).toEqual([SERVER_NAME_KEY]);
    expect(market.plugins[0].source).toBe('./');
    expect(plugin.version).toBe(PACKAGE.version);
    expect(plugin.repository).toBe(MIRROR_URL);
    expect(plugin.homepage).toBe('https://storeshot.art/docs/mcp/');
    expect(plugin.license).toBe('Apache-2.0');
  });

  test('.mcp.json starts the published package exactly like the README snippets', () => {
    expect(readJson('.mcp.json')).toEqual({
      mcpServers: { [SERVER_NAME_KEY]: { command: 'npx', args: ['-y', PACKAGE.name] } },
    });
  });
});

describe('SKILL.md pins (spec §6.1)', () => {
  const { data, body } = readFrontmatter(readText('skills/storeshot/SKILL.md'), 'SKILL.md');

  test('name = folder = storeshot; body within the size budget', () => {
    expect(data.name).toBe(SERVER_NAME_KEY);
    expect(data.license).toBe('Apache-2.0');
    expect(body.split('\n').length).toBeLessThanOrEqual(150);
  });

  test('the tool table lists the nine tools in snapshot order with credits and read-only columns', () => {
    const rows = [...body.matchAll(/^\| `([a-z_]+)` +\| ([^|]+)\| ([^|]+)\| (yes|no) +\|$/gm)];
    expect(rows.map((r) => r[1])).toEqual(TOOLS.map((t) => t.name));
    for (const [, name, , credits, readOnly] of rows) {
      const tool = TOOLS.find((t) => t.name === name)!;
      expect(readOnly, name).toBe(tool.annotations.readOnlyHint ? 'yes' : 'no');
      expect(credits.trim() !== 'free', name).toBe(PAID_TOOLS.includes(name));
    }
  });

  test('the flow, the money rule, the install line and the REST fallback', () => {
    expect(body).toMatch(/dryRun: true/);
    expect(body).toMatch(/ask (the user|your human) before/i);
    expect(body).toMatch(/layout: "fastlane"/);
    expect(body).toContain('ACCOUNT_LINK_REQUIRED');
    expect(body).toContain(`npx -y ${PACKAGE.name}`);
    expect(body).toContain('https://storeshot.art/docs/mcp/');
    expect(body).toContain('https://storeshot.art/docs/agents-quickstart.md');
  });
});

describe('every listing file (spec §8.2)', () => {
  test.each(LISTING_FILES)('%s', (file) => {
    const text = readText(file);
    for (const tool of toolTokensIn(text)) {
      expect(
        TOOLS.map((t) => t.name),
        `${file}: ${tool}`,
      ).toContain(tool);
    }
    for (const m of text.matchAll(/(\d+) credits?\b/gi)) {
      expect(Number(m[1]), `${file}: "${m[0]}"`).toBe(CREDITS_PER_IMAGE);
    }
    if (/credit/i.test(text)) expect(text, file).toMatch(/test keys?[^.\n]*(?:free|never spend)/i);
    expect(text, file).not.toMatch(/test (?:mode )?by default|defaults? to test/i);
    for (const name of text.match(/\bSTORESHOT_[A-Z_]+\b/g) ?? []) {
      expect(ENV_VARS, `${file}: ${name}`).toContain(name);
    }
    for (const url of urlsIn(text)) expect(isAllowedUrl(url), `${file}: ${url}`).toBe(true);
    expect(text, file).not.toMatch(/ss_(?:live|test)_[A-Za-z0-9]{20,}/);
    expect(text, file).not.toMatch(/[A-Z_]*(?:KEY|TOKEN|SECRET)=[^\s=]/);
    expect(text, file).not.toMatch(/paste (?:your|the) (?:api )?key/i);
    expect(text, file).not.toMatch(/not (?:yet )?published|not on npm|unpublished|once published/i);
  });

  test('the rule, section and prompt name the flow tools, the money rule and the links', () => {
    for (const file of [
      'rules/storeshot.mdc',
      'snippets/agents-section.md',
      'snippets/prompt.md',
    ]) {
      const text = readText(file);
      for (const tool of [
        'upload_screenshot',
        'create_screenshot_set',
        'get_job_status',
        'download_results',
      ]) {
        expect(text, `${file}: ${tool}`).toContain(`\`${tool}\``);
      }
      expect(text, file).toMatch(/dryRun: true/);
      expect(text, file).toMatch(/ask (?:the user|me|your human) before/i);
      expect(text, file).toContain('https://storeshot.art/docs/mcp/');
      expect(text, file).toContain('https://storeshot.art/docs/agents-quickstart.md');
    }
  });

  // The title must not name the instruction files: this test file is exported and leak-checked.
  test('only the section file names agent instruction files (the leak check exempts exactly it)', () => {
    for (const file of LISTING_FILES) {
      const names = /\b(?:CLAUDE|AGENTS)\.md\b|(?:^|[\s"'`(/])\.claude\//m.test(readText(file));
      expect(names, file).toBe(file === 'snippets/agents-section.md');
    }
  });
});
