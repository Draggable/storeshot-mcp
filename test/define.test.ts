import { StoreshotError } from '@draggable/storeshot-sdk';
import { describe, expect, test, vi } from 'vitest';
import { z } from 'zod/v4';
import { readConfig } from '../src/config.js';
import { defineTool, type ToolDeps } from '../src/tools/define.js';
import { connect, textOf } from './helpers/mcp.js';

const echo = defineTool({
  name: 'echo',
  title: 'Echo',
  description: 'When to use: tests. Credits: free.',
  needsAuth: true,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  input: z.strictObject({ fail: z.enum(['none', 'api401', 'boom']).default('none') }),
  output: z.object({ ok: z.boolean() }),
  async run(args) {
    if (args.fail === 'api401') {
      throw new StoreshotError({
        status: 401,
        code: 'UNAUTHORIZED',
        message: 'revoked',
        requestId: 'req_9',
      });
    }
    if (args.fail === 'boom') throw new Error('kaput');
    return { summary: 'Echoed.', data: { ok: true } };
  },
});
const deps = (env: Record<string, string> = { STORESHOT_API_KEY: `ss_test_${'a'.repeat(43)}` }) =>
  ({
    config: readConfig(env),
    session: { client: vi.fn(async () => ({})), invalidate: vi.fn(), keySource: 'stored' },
    log: vi.fn(),
  }) as unknown as ToolDeps;

describe('runTool (spec §4, §8)', () => {
  test('ok result: two text blocks + structuredContent, validated by the client', async () => {
    const { client, close } = await connect([echo], deps());
    const r = await client.callTool({ name: 'echo', arguments: {} });
    expect(r.structuredContent).toEqual({ ok: true });
    expect(r.content).toHaveLength(2);
    expect(textOf(r)).toBe('Echoed.');
    await close();
  });

  test('unknown argument keys are refused by the input schema', async () => {
    const { client, close } = await connect([echo], deps());
    const r = await client.callTool({ name: 'echo', arguments: { nope: 1 } });
    expect(r.isError).toBe(true);
    await close();
  });

  test('a 401 invalidates a stored key; errors are isError text without stack', async () => {
    const d = deps();
    const { client, close } = await connect([echo], d);
    const r = await client.callTool({ name: 'echo', arguments: { fail: 'api401' } });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toMatch(/UNAUTHORIZED \(401\).*\nNext: The stored key was revoked/);
    expect(d.session.invalidate).toHaveBeenCalled();
    expect(d.log).toHaveBeenCalledWith('tool=echo code=UNAUTHORIZED request=req_9');
    const boom = await client.callTool({ name: 'echo', arguments: { fail: 'boom' } });
    expect(JSON.stringify(boom)).toMatch(/INTERNAL_ERROR/);
    expect(JSON.stringify(boom)).not.toMatch(/define\.test\.ts:\d+/);
    await close();
  });

  test('a config error answers INVALID_CONFIGURATION without touching the session', async () => {
    const d = deps({ STORESHOT_ENVIRONMENT: 'prod' });
    const { client, close } = await connect([echo], d);
    const r = await client.callTool({ name: 'echo', arguments: {} });
    expect(textOf(r)).toMatch(/INVALID_CONFIGURATION/);
    expect(d.session.client).not.toHaveBeenCalled();
    await close();
  });
});
