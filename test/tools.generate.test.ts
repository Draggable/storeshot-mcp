import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { StoreshotTimeoutError } from '@draggable/storeshot-sdk';
import { afterAll, describe, expect, test, vi } from 'vitest';
import { readConfig } from '../src/config.js';
import { generateScreenshot } from '../src/tools/generateScreenshot.js';
import { uploadScreenshot } from '../src/tools/uploadScreenshot.js';
import { generation } from './helpers/fixtures.js';
import { connect, textOf } from './helpers/mcp.js';
import { tmpDir } from './helpers/tmp.js';

const dir = tmpDir('gen');
const png = path.join(dir, 'home.png');
writeFileSync(png, Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const UP = '6f1c1f0e-8a5e-4b8e-9a51-0f0e1d2c3b4a';
const upload = {
  id: UP,
  status: 'ready',
  source: 'multipart',
  environment: 'test',
  contentType: 'image/png',
  bytes: 11,
  width: 1179,
  height: 2556,
  orientation: 'portrait',
  sha256: 'ab',
  sourceUrl: null,
  expiresAt: '2026-12-02T10:00:00.000Z',
  createdAt: '2026-11-02T10:00:00.000Z',
};
const sdk = {
  uploads: { create: vi.fn(async () => upload) },
  generations: {
    create: vi.fn(async () => generation('queued')),
    get: vi.fn(async () => generation('running')),
  },
  waitForGeneration: vi.fn(async () => generation('succeeded')),
};
const deps = {
  config: readConfig({ STORESHOT_API_KEY: `ss_test_${'a'.repeat(43)}` }),
  session: { client: async () => sdk, invalidate: vi.fn(), keySource: 'env' },
  log: vi.fn(),
};
const base = { store: 'app_store', device: 'app_store_1290x2796', app: { name: 'Trailmate' } };

describe('upload_screenshot / generate_screenshot', () => {
  test('upload reads the local file and returns the upload id and real path', async () => {
    const { client, close } = await connect([uploadScreenshot], deps);
    const r = await client.callTool({ name: 'upload_screenshot', arguments: { path: png } });
    expect(r.structuredContent).toMatchObject({ uploadId: UP, path: png, environment: 'test' });
    expect(sdk.uploads.create).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'home.png', contentType: 'image/png' }),
      expect.anything(),
    );
    expect(textOf(r)).toMatch(/Uploaded home\.png \(1179×2556 PNG\)/);
    await close();
  });

  test('a non-image path is refused before anything is uploaded', async () => {
    const txt = path.join(dir, 'notes.txt');
    writeFileSync(txt, 'secret notes');
    sdk.uploads.create.mockClear();
    const { client, close } = await connect([uploadScreenshot], deps);
    const r = await client.callTool({ name: 'upload_screenshot', arguments: { path: txt } });
    expect(textOf(r)).toMatch(/UNSUPPORTED_FILE_TYPE/);
    expect(sdk.uploads.create).not.toHaveBeenCalled();
    await close();
  });

  test('generate with a path uploads first and returns the job at once (waitSeconds 0)', async () => {
    const { client, close } = await connect([generateScreenshot], deps);
    const r = await client.callTool({
      name: 'generate_screenshot',
      arguments: { ...base, screenshot: { path: png }, caption: 'Hi' },
    });
    expect(sdk.generations.create).toHaveBeenCalledWith(
      { inputs: [{ uploadId: UP }], ...base, caption: 'Hi' },
      expect.objectContaining({ idempotencyKey: undefined }),
    );
    expect(sdk.waitForGeneration).not.toHaveBeenCalled();
    expect(r.structuredContent).toMatchObject({
      status: 'queued',
      final: false,
      waited: { seconds: 0, timedOut: false },
    });
    expect(textOf(r)).toMatch(/Test key: sample images, no credits spent\./);
    await close();
  });

  test('waitSeconds: progress notifications and the final result; a wait timeout is not an error', async () => {
    const { client, close } = await connect([generateScreenshot], deps);
    const progress: { progress: number; total?: number }[] = [];
    sdk.waitForGeneration.mockImplementationOnce(async () => {
      await new Promise((r) => setTimeout(r, 5300));
      return generation('succeeded');
    });
    const r = await client.callTool(
      {
        name: 'generate_screenshot',
        arguments: { ...base, screenshot: { uploadId: UP }, waitSeconds: 30 },
      },
      undefined,
      { onprogress: (p) => progress.push(p), timeout: 20_000 },
    );
    expect(progress.length).toBeGreaterThanOrEqual(1);
    expect(progress[0]).toMatchObject({ total: 30 });
    expect(r.structuredContent).toMatchObject({
      status: 'succeeded',
      final: true,
      imageUrl: 'https://s/1.png',
    });
    sdk.waitForGeneration.mockRejectedValueOnce(
      new StoreshotTimeoutError({ code: 'WAIT_TIMEOUT', message: 'still running' }),
    );
    const t = await client.callTool({
      name: 'generate_screenshot',
      arguments: { ...base, screenshot: { uploadId: UP }, waitSeconds: 5 },
    });
    expect(t.isError).toBeFalsy();
    expect(t.structuredContent).toMatchObject({
      status: 'running',
      final: false,
      waited: { seconds: 5, timedOut: true },
    });
    await close();
  }, 20_000);

  test('a live result says what was charged', async () => {
    sdk.generations.create.mockResolvedValueOnce(
      generation('queued', { environment: 'live', creditsCharged: 1 }) as never,
    );
    const { client, close } = await connect([generateScreenshot], deps);
    const r = await client.callTool({
      name: 'generate_screenshot',
      arguments: { ...base, screenshot: { uploadId: UP } },
    });
    expect(textOf(r)).toMatch(/1 credit\(s\) charged/);
    await close();
  });
});
