import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { readConfig } from '../src/config.js';
import { downloadResults } from '../src/tools/downloadResults.js';
import { connect, textOf } from './helpers/mcp.js';
import { tmpDir } from './helpers/tmp.js';
import { makeZip, type ZipItem } from './helpers/zip.js';

const dir = tmpDir('dl');
const SET = '5c1e0000-0000-4000-8000-000000000001';
const GEN = '0b8e0000-0000-4000-8000-000000000001';
let base = '';
const http = createServer((_req, res) =>
  res.writeHead(200, { 'Content-Type': 'image/png' }).end('PNG!'),
);
beforeAll(
  () =>
    new Promise<void>((ok) =>
      http.listen(0, '127.0.0.1', () => {
        base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
        ok();
      }),
    ),
);
afterAll(() => {
  http.close();
  rmSync(dir, { recursive: true, force: true });
});

const IMG = 'fastlane/screenshots/en-US/01_app_store_1290x2796.png';
const manifest = {
  files: [{ path: IMG, store: 'app_store', device: 'app_store_1290x2796', position: 1 }],
  missing: [
    {
      store: 'google_play',
      device: 'google_play_1080x1920',
      position: 1,
      status: 'failed',
      errorCode: 'GENERATION_FAILED',
    },
  ],
  complete: false,
};
const zipOf = (items: ZipItem[]) =>
  vi.fn(async () => new Blob([new Uint8Array(makeZip(items))]).stream());
const good = [
  { name: IMG, data: 'IMG' },
  { name: 'manifest.json', data: JSON.stringify(manifest) },
];
const sdk = {
  screenshotSets: { get: vi.fn(async () => ({ id: SET })), archiveStream: zipOf(good) },
  generations: {
    get: vi.fn(async () => ({
      id: GEN,
      status: 'succeeded',
      store: 'app_store',
      device: 'app_store_1290x2796',
      result: { image: { url: `${base}/r.png`, contentType: 'image/png' } },
    })),
  },
};
const deps = {
  config: readConfig({
    STORESHOT_API_KEY: `ss_test_${'a'.repeat(43)}`,
    STORESHOT_BASE_URL: 'http://127.0.0.1:9/v1',
  }),
  session: { client: async () => sdk, invalidate: vi.fn(), keySource: 'env' },
  log: vi.fn(),
};

describe('download_results (spec §7.2, §9.3)', () => {
  test('a set in fastlane layout: files written, manifest returned (not written), temp zip removed', async () => {
    const { client, close } = await connect([downloadResults], deps);
    const folder = path.join(dir, 'project');
    const r = await client.callTool({
      name: 'download_results',
      arguments: { id: SET, kind: 'screenshot_set', folder, layout: 'fastlane' },
    });
    expect(sdk.screenshotSets.archiveStream).toHaveBeenCalledWith(
      SET,
      expect.objectContaining({ layout: 'fastlane' }),
    );
    const out = r.structuredContent as {
      files: { path: string; store: string }[];
      complete: boolean;
      missing: { errorCode: string }[];
    };
    expect(out.complete).toBe(false);
    expect(out.missing).toEqual([expect.objectContaining({ errorCode: 'GENERATION_FAILED' })]);
    expect(out.files[0]).toMatchObject({
      path: path.join(folder, IMG),
      store: 'app_store',
      position: 1,
    });
    expect(readFileSync(out.files[0].path, 'utf8')).toBe('IMG');
    expect(existsSync(path.join(folder, 'manifest.json'))).toBe(false);
    expect(readdirSync(folder)).toEqual(['fastlane']);
    expect(textOf(r)).toMatch(/1 images missing.*fastlane deliver/);
    const again = await client.callTool({
      name: 'download_results',
      arguments: { id: SET, kind: 'screenshot_set', folder, layout: 'fastlane' },
    });
    expect(textOf(again)).toMatch(/FILE_EXISTS/);
    sdk.screenshotSets.archiveStream = zipOf(good);
    const over = await client.callTool({
      name: 'download_results',
      arguments: { id: SET, kind: 'screenshot_set', folder, layout: 'fastlane', overwrite: true },
    });
    expect(over.isError).toBeFalsy();
    await close();
  });

  test('an unsafe archive writes nothing (and leaves no temp file)', async () => {
    sdk.screenshotSets.archiveStream = zipOf([{ name: '../evil.png', data: 'x' }]);
    const { client, close } = await connect([downloadResults], deps);
    const folder = path.join(dir, 'evil');
    const r = await client.callTool({
      name: 'download_results',
      arguments: { id: SET, kind: 'screenshot_set', folder },
    });
    expect(textOf(r)).toMatch(/UNSAFE_ARCHIVE/);
    expect(readdirSync(folder)).toEqual([]);
    expect(existsSync(path.join(dir, 'evil.png'))).toBe(false);
    await close();
  });

  test('a generation: <id>.png from the signed URL (loopback allowed because the base URL is)', async () => {
    const { client, close } = await connect([downloadResults], deps);
    const folder = path.join(dir, 'single');
    const r = await client.callTool({
      name: 'download_results',
      arguments: { id: GEN, kind: 'generation', folder },
    });
    const files = (r.structuredContent as { files: { path: string }[] }).files;
    expect(files[0].path).toBe(path.join(folder, `${GEN}.png`));
    expect(readFileSync(path.join(folder, `${GEN}.png`), 'utf8')).toBe('PNG!');
    expect(r.structuredContent).toMatchObject({ imageUrls: [`${base}/r.png`] });
    await close();
  });

  test('a generation without a result is NO_RESULT', async () => {
    sdk.generations.get.mockResolvedValueOnce({
      id: GEN,
      status: 'running',
      result: null,
    } as never);
    const { client, close } = await connect([downloadResults], deps);
    const r = await client.callTool({
      name: 'download_results',
      arguments: { id: GEN, kind: 'generation', folder: path.join(dir, 'none') },
    });
    expect(textOf(r)).toMatch(/NO_RESULT/);
    await close();
  });
});
