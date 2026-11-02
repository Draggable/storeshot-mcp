import { describe, expect, test, vi } from 'vitest';
import { readConfig } from '../src/config.js';
import { getCredits } from '../src/tools/getCredits.js';
import { getStoreRequirements } from '../src/tools/getStoreRequirements.js';
import { linkStatus } from '../src/tools/linkStatus.js';
import { listDevices } from '../src/tools/listDevices.js';
import { connect, textOf } from './helpers/mcp.js';

const device = (id: string, extra = {}) => ({
  id,
  store: 'google_play',
  kind: 'screenshot',
  label: id,
  deviceHint: 'Phone',
  width: 1080,
  height: 1920,
  orientations: ['portrait'],
  ...extra,
});
const sdk = {
  devices: {
    list: vi.fn(async () => ({
      data: [
        device('google_play_1080x1920'),
        device('google_play_1080x2400', { deprecated: true, replacedBy: 'google_play_1080x2160' }),
        device('google_play_1024x500', { kind: 'feature_graphic', width: 1024, height: 500 }),
      ],
    })),
  },
  stores: {
    requirements: vi.fn(async (store: string) => ({
      store,
      name: store === 'app_store' ? 'App Store' : 'Google Play',
      screenshots: { formats: ['image/png'] },
      deviceClasses: [],
      requiredGroups: [],
      featureGraphic: null,
      sources: [],
    })),
  },
  credits: {
    get: vi.fn(async () => ({ balances: { starter: 4, subscription: 0, purchased: 0 }, total: 4 })),
  },
};
const pending = {
  status: 'pending',
  source: null,
  environment: null,
  keyId: null,
  scopes: [],
  verificationUri: 'https://console.storeshot.art/device',
  verificationUriComplete: 'https://console.storeshot.art/device?code=BCDF-GHJK',
  userCode: 'BCDF-GHJK',
  expiresAt: '2026-11-02T10:10:00.000Z',
  credentialsFile: '/h/.config/storeshot/mcp-credentials.json',
  reason: null,
};
const session = (environment: 'test' | 'live') => ({
  client: vi.fn(async () => sdk),
  invalidate: vi.fn(),
  keySource: 'env',
  status: () => ({ ...pending, status: 'linked', source: 'env', environment }),
});
const deps = (environment: 'test' | 'live' = 'test') => ({
  config: readConfig({ STORESHOT_API_KEY: `ss_${environment}_${'a'.repeat(43)}` }),
  session: session(environment),
  log: vi.fn(),
});

describe('read-only tools', () => {
  test('list_devices hides deprecated sizes unless asked, filters by kind', async () => {
    const { client, close } = await connect([listDevices], deps());
    const r = await client.callTool({ name: 'list_devices', arguments: { store: 'google_play' } });
    expect(sdk.devices.list).toHaveBeenCalledWith({ store: 'google_play' }, expect.anything());
    const ids = (r.structuredContent as { devices: { id: string }[] }).devices.map((d) => d.id);
    expect(ids).toEqual(['google_play_1080x1920', 'google_play_1024x500']);
    const all = await client.callTool({
      name: 'list_devices',
      arguments: { includeDeprecated: true },
    });
    expect((all.structuredContent as { devices: unknown[] }).devices).toHaveLength(3);
    const fg = await client.callTool({
      name: 'list_devices',
      arguments: { kind: 'feature_graphic' },
    });
    expect(textOf(fg)).toBe('1 sizes: google_play_1024x500 (1024×500).');
    await close();
  });

  test('get_store_requirements: both stores without an argument, one with', async () => {
    const { client, close } = await connect([getStoreRequirements], deps());
    const r = await client.callTool({ name: 'get_store_requirements', arguments: {} });
    const stores = (r.structuredContent as { stores: { store: string }[] }).stores;
    expect(stores.map((s) => s.store)).toEqual(['app_store', 'google_play']);
    const one = await client.callTool({
      name: 'get_store_requirements',
      arguments: { store: 'app_store' },
    });
    expect((one.structuredContent as { stores: unknown[] }).stores).toHaveLength(1);
    await close();
  });

  test('get_credits reports the key environment', async () => {
    const t = await connect([getCredits], deps('test'));
    const r = await t.client.callTool({ name: 'get_credits', arguments: {} });
    expect(r.structuredContent).toMatchObject({ total: 4, environment: 'test' });
    expect(textOf(r)).toMatch(/Test key/);
    await t.close();
    const l = await connect([getCredits], deps('live'));
    const live = await l.client.callTool({ name: 'get_credits', arguments: {} });
    expect(live.structuredContent).toMatchObject({ environment: 'live' });
    await l.close();
  });

  test('link_status needs no key and shows the pending link', async () => {
    const noKey = {
      client: vi.fn(async () => {
        throw new Error('must not be called');
      }),
      invalidate: vi.fn(),
      keySource: null,
      status: () => pending,
    };
    const { client, close } = await connect([linkStatus], {
      ...deps(),
      config: readConfig({}),
      session: noKey,
    });
    const r = await client.callTool({ name: 'link_status', arguments: {} });
    expect(noKey.client).not.toHaveBeenCalled();
    expect(r.structuredContent).toMatchObject({
      status: 'pending',
      userCode: 'BCDF-GHJK',
      environment: null,
    });
    expect(textOf(r)).toMatch(/open https:\/\/console\.storeshot\.art\/device\?code=BCDF-GHJK/);
    await close();
  });
});
