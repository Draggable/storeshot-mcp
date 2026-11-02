import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import { readConfig } from '../src/config.js';
import { tmpDir } from './helpers/tmp.js';

const home = tmpDir('config');
afterAll(() => rmSync(home, { recursive: true, force: true }));
const read = (env: Record<string, string>) => readConfig(env, { homedir: home });
const LIVE = `ss_live_${'a'.repeat(43)}`;

describe('readConfig (spec §5, amendment A2)', () => {
  test('defaults: no environment, production base URL, no root, stored keys on', () => {
    expect(read({})).toMatchObject({
      apiKey: null,
      environment: null,
      baseUrl: 'https://api.storeshot.art/v1',
      root: null,
      noStore: false,
      debug: false,
      credentialsFile: path.join(home, '.config/storeshot/mcp-credentials.json'),
      warnings: [],
      error: null,
    });
  });

  test('STORESHOT_ENVIRONMENT test|live is taken as given', () => {
    expect(read({ STORESHOT_ENVIRONMENT: 'test' }).environment).toBe('test');
    expect(read({ STORESHOT_ENVIRONMENT: 'live' }).environment).toBe('live');
  });

  test('a bare origin gets /v1; the SDK form is kept; trailing slashes go', () => {
    expect(read({ STORESHOT_BASE_URL: 'https://api.storeshot.art' }).baseUrl).toBe(
      'https://api.storeshot.art/v1',
    );
    expect(read({ STORESHOT_BASE_URL: 'http://127.0.0.1:4010/v1/' }).baseUrl).toBe(
      'http://127.0.0.1:4010/v1',
    );
  });

  test('invalid values become a config error (never a throw)', () => {
    expect(read({ STORESHOT_BASE_URL: 'http://example.com' }).error).toMatch(/https/);
    expect(read({ STORESHOT_ENVIRONMENT: 'prod' }).error).toMatch(
      /STORESHOT_ENVIRONMENT must be "test" or "live" \(got "prod"\)/,
    );
    expect(read({ STORESHOT_MCP_ROOT: 'relative/dir' }).error).toMatch(/absolute/);
    const bad = read({ STORESHOT_API_KEY: 'not a key' });
    expect(bad.error).toMatch(/STORESHOT_API_KEY/);
    expect(bad.apiKey).toBeNull();
  });

  test('the env key decides the environment; a different STORESHOT_ENVIRONMENT warns', () => {
    const c = read({ STORESHOT_API_KEY: LIVE, STORESHOT_ENVIRONMENT: 'test' });
    expect(c.environment).toBe('live');
    expect(c.warnings.join()).toMatch(/STORESHOT_ENVIRONMENT=test is ignored/);
    expect(read({ STORESHOT_API_KEY: LIVE }).warnings).toEqual([]);
  });

  test('XDG_CONFIG_HOME, NO_STORE, DEBUG and a real root', () => {
    const root = path.join(home, 'project');
    mkdirSync(root, { recursive: true });
    writeFileSync(path.join(home, 'file'), 'x');
    const c = read({
      XDG_CONFIG_HOME: path.join(home, 'xdg'),
      STORESHOT_MCP_NO_STORE: '1',
      STORESHOT_MCP_DEBUG: '1',
      STORESHOT_MCP_ROOT: root,
    });
    expect(c.credentialsFile).toBe(path.join(home, 'xdg/storeshot/mcp-credentials.json'));
    expect(c).toMatchObject({ noStore: true, debug: true, root });
    expect(read({ STORESHOT_MCP_ROOT: path.join(home, 'file') }).error).toMatch(/directory/);
  });
});
