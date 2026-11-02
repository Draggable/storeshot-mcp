import { StoreshotError } from '@draggable/storeshot-sdk';
import { describe, expect, test, vi } from 'vitest';
import { readConfig } from '../src/config.js';
import { getJobStatus } from '../src/tools/getJobStatus.js';
import { generation, set } from './helpers/fixtures.js';
import { connect, textOf } from './helpers/mcp.js';

const ID = '0b8e0000-0000-4000-8000-000000000001';
const notFound = new StoreshotError({
  status: 404,
  code: 'NOT_FOUND',
  message: 'no',
  requestId: 'req_4',
});
const sdk = {
  screenshotSets: {
    get: vi.fn(async (): Promise<unknown> => {
      throw notFound;
    }),
  },
  generations: { get: vi.fn(async (): Promise<unknown> => generation('running')) },
};
const deps = {
  config: readConfig({ STORESHOT_API_KEY: `ss_test_${'a'.repeat(43)}` }),
  session: { client: async () => sdk, invalidate: vi.fn(), keySource: 'env' },
  log: vi.fn(),
};

describe('get_job_status', () => {
  test('without kind: set first, then generation on 404', async () => {
    const { client, close } = await connect([getJobStatus], deps);
    const r = await client.callTool({ name: 'get_job_status', arguments: { id: ID } });
    expect(sdk.screenshotSets.get).toHaveBeenCalledTimes(1);
    expect(r.structuredContent).toMatchObject({
      kind: 'generation',
      generation: { id: ID, final: false },
    });
    await close();
  });

  test('a set: counts in the summary', async () => {
    sdk.screenshotSets.get.mockResolvedValueOnce(
      set('partially_failed', {
        counts: { queued: 0, running: 0, succeeded: 2, failed: 1, canceled: 0 },
      }),
    );
    const { client, close } = await connect([getJobStatus], deps);
    const r = await client.callTool({ name: 'get_job_status', arguments: { id: ID } });
    expect(r.structuredContent).toMatchObject({
      kind: 'screenshot_set',
      screenshotSet: { final: true },
    });
    expect(textOf(r)).toMatch(/2\/3 succeeded, 1 failed/);
    await close();
  });

  test('kind generation skips the set lookup; an unknown id is NOT_FOUND with its request id', async () => {
    sdk.screenshotSets.get.mockClear();
    const { client, close } = await connect([getJobStatus], deps);
    await client.callTool({ name: 'get_job_status', arguments: { id: ID, kind: 'generation' } });
    expect(sdk.screenshotSets.get).not.toHaveBeenCalled();
    sdk.generations.get.mockRejectedValueOnce(notFound);
    const r = await client.callTool({ name: 'get_job_status', arguments: { id: ID } });
    expect(textOf(r)).toMatch(/NOT_FOUND \(404\)/);
    expect(textOf(r)).toMatch(/Request id: req_4/);
    await close();
  });

  test('an id that is not 36 characters is refused by the schema', async () => {
    const { client, close } = await connect([getJobStatus], deps);
    const r = await client.callTool({ name: 'get_job_status', arguments: { id: '../../etc' } });
    expect(r.isError).toBe(true);
    await close();
  });
});
