import { describe, expect, test, vi } from 'vitest';
import { readConfig } from '../src/config.js';
import { createScreenshotSet } from '../src/tools/createScreenshotSet.js';
import { set } from './helpers/fixtures.js';
import { connect, textOf } from './helpers/mcp.js';

const UP = '6f1c1f0e-8a5e-4b8e-9a51-0f0e1d2c3b4a';
const quote = {
  dryRun: true,
  environment: 'live',
  images: 3,
  credits: 3,
  availableCredits: 4,
  sufficient: true,
  screens: 1,
  breakdown: [
    {
      store: 'google_play',
      device: 'google_play_1080x1920',
      size: { width: 1080, height: 1920 },
      orientation: 'portrait',
      images: 1,
      defaulted: true,
    },
  ],
};
const sdk = {
  screenshotSets: { create: vi.fn(async () => set('queued')), quote: vi.fn(async () => quote) },
  uploads: { create: vi.fn() },
};
const deps = {
  config: readConfig({ STORESHOT_API_KEY: `ss_live_${'a'.repeat(43)}` }),
  session: { client: async () => sdk, invalidate: vi.fn(), keySource: 'env' },
  log: vi.fn(),
};
const args = {
  app: { name: 'Trailmate' },
  screens: [{ screenshot: { uploadId: UP }, caption: 'Find every trail' }],
  stores: [{ store: 'google_play', featureGraphic: true }],
};

describe('create_screenshot_set', () => {
  test('dryRun quotes for free and creates nothing', async () => {
    const { client, close } = await connect([createScreenshotSet], deps);
    const r = await client.callTool({
      name: 'create_screenshot_set',
      arguments: { ...args, dryRun: true },
    });
    expect(sdk.screenshotSets.create).not.toHaveBeenCalled();
    expect(r.structuredContent).toMatchObject({
      mode: 'quote',
      quote: { credits: 3, sufficient: true },
    });
    expect(textOf(r)).toMatch(/would cost 3 credits \(live key; 4 available\)/);
    await close();
  });

  test('create maps screens and stores to the API body and returns the set', async () => {
    const { client, close } = await connect([createScreenshotSet], deps);
    const r = await client.callTool({
      name: 'create_screenshot_set',
      arguments: { ...args, idempotencyKey: 'release-2.4' },
    });
    expect(sdk.screenshotSets.create).toHaveBeenCalledWith(
      {
        app: { name: 'Trailmate' },
        screens: [{ input: { uploadId: UP }, caption: 'Find every trail' }],
        stores: [{ store: 'google_play', featureGraphic: true }],
      },
      expect.objectContaining({ idempotencyKey: 'release-2.4' }),
    );
    expect(r.structuredContent).toMatchObject({
      mode: 'set',
      set: { id: '5c1e0000-0000-4000-8000-000000000001', creditsCharged: 3, final: false },
    });
    expect(textOf(r)).toMatch(/3 credits charged/);
    await close();
  });

  test('more than 10 screens or 2 stores are refused by the schema', async () => {
    const { client, close } = await connect([createScreenshotSet], deps);
    const many = Array.from({ length: 11 }, () => args.screens[0]);
    const r = await client.callTool({
      name: 'create_screenshot_set',
      arguments: { ...args, screens: many },
    });
    expect(r.isError).toBe(true);
    await close();
  });
});
