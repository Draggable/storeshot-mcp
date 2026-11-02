// SS-020 §12.2: the built bin over stdio with the MCP SDK client (the scripted stand-in for MCP
// Inspector, Done-when 1) and raw JSON-RPC (stdout purity). Runs on Node 24 and Node 18.
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { after, describe, test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { BIN, DEVICE_CODE, PKG, SNAPSHOT, fakeApi, rawSession, tmp } from './helpers.mjs';

const home = tmp('bin');
after(() => rmSync(home, { recursive: true, force: true }));
const baseEnv = (extra = {}) => ({ HOME: home, XDG_CONFIG_HOME: `${home}/config`, ...extra });
const INIT = {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: { name: 'raw', version: '0' },
};

describe(`storeshot-mcp (built, ${BIN})`, { timeout: 60_000 }, () => {
  test('initialize + tools/list equal the snapshot (name, title, stamped version)', async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [BIN],
      env: baseEnv({ STORESHOT_API_KEY: `ss_test_${'a'.repeat(43)}` }),
      stderr: 'pipe',
    });
    const client = new Client({ name: 'bin-test', version: '0' });
    await client.connect(transport);
    const info = client.getServerVersion();
    assert.equal(info.name, 'storeshot-mcp');
    assert.equal(info.title, 'Storeshot MCP');
    assert.equal(info.version, PKG.version);
    assert.equal(client.getInstructions(), SNAPSHOT.instructions);
    const { tools } = await client.listTools();
    assert.deepEqual(JSON.parse(JSON.stringify(tools)), SNAPSHOT.tools);
    await client.close();
  });

  test('no key: get_credits starts the device flow (no environment sent); link on stderr only; stdout is pure JSON-RPC', async () => {
    const api = await fakeApi();
    try {
      const s = rawSession(baseEnv({ STORESHOT_BASE_URL: `${api.url}/v1` }));
      const init = await s.request('initialize', INIT);
      assert.equal(init.result.serverInfo.name, 'storeshot-mcp');
      s.notify('notifications/initialized', {});
      await s.request('tools/list', {});
      const r = await s.request('tools/call', { name: 'get_credits', arguments: {} });
      assert.equal(r.result.isError, true);
      assert.match(r.result.content[0].text, /ACCOUNT_LINK_REQUIRED/);
      assert.match(
        r.result.content[0].text,
        /https:\/\/console\.storeshot\.art\/device\?code=BCDF-GHJK/,
      );
      const start = api.requests.find((q) => q.url === '/v1/auth/device');
      assert.deepEqual(JSON.parse(start.body), { client_name: 'Storeshot MCP' });
      const status = await s.request('tools/call', { name: 'link_status', arguments: {} });
      assert.equal(status.result.structuredContent.status, 'pending');
      const bad = await s.request('tools/call', {
        name: 'get_job_status',
        arguments: { id: 'nope' },
      });
      assert.equal(bad.result.isError, true);
      const { stdout, stderr } = await s.end();
      const lines = stdout.split('\n').filter(Boolean);
      assert.ok(lines.length >= 5);
      for (const line of lines) assert.equal(JSON.parse(line).jsonrpc, '2.0', line);
      assert.doesNotMatch(stdout, /\[storeshot-mcp\]/);
      assert.match(
        stderr,
        /\[storeshot-mcp\] Link Storeshot: open https:\/\/console\.storeshot\.art\/device\?code=BCDF-GHJK/,
      );
      assert.equal(stderr.includes(DEVICE_CODE), false, 'the device code never appears');
    } finally {
      await api.close();
    }
  });

  test('STORESHOT_ENVIRONMENT=live is sent to the device flow', async () => {
    const api = await fakeApi();
    try {
      const s = rawSession(
        baseEnv({ STORESHOT_BASE_URL: `${api.url}/v1`, STORESHOT_ENVIRONMENT: 'live' }),
      );
      await s.request('initialize', INIT);
      await s.request('tools/call', { name: 'get_credits', arguments: {} });
      await s.end();
      const start = api.requests.find((q) => q.url === '/v1/auth/device');
      assert.deepEqual(JSON.parse(start.body), {
        client_name: 'Storeshot MCP',
        environment: 'live',
      });
    } finally {
      await api.close();
    }
  });

  test('an invalid STORESHOT_ENVIRONMENT: a clear startup error, then INVALID_CONFIGURATION', async () => {
    const s = rawSession(baseEnv({ STORESHOT_ENVIRONMENT: 'prod' }));
    await s.request('initialize', INIT);
    const r = await s.request('tools/call', { name: 'get_credits', arguments: {} });
    assert.match(r.result.content[0].text, /INVALID_CONFIGURATION/);
    const { stderr } = await s.end();
    assert.match(stderr, /configuration error: STORESHOT_ENVIRONMENT must be "test" or "live"/);
  });
});
