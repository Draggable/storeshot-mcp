import { rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { StoreshotError } from '@draggable/storeshot-sdk';
import { afterAll, describe, expect, test } from 'vitest';
import { AuthSession } from '../src/auth/session.js';
import { CredentialStore } from '../src/auth/store.js';
import { readConfig } from '../src/config.js';
import { fakeClientFactory } from './helpers/fakeSdk.js';
import { tmpDir } from './helpers/tmp.js';

const home = tmpDir('session');
afterAll(() => rmSync(home, { recursive: true, force: true }));
const TEST_KEY = `ss_test_${'a'.repeat(43)}`;
const LIVE_KEY = `ss_live_${'b'.repeat(43)}`;
let n = 0;
const setup = (env: Record<string, string> = {}, xdg = path.join(home, String(n++))) => {
  const config = readConfig({ XDG_CONFIG_HOME: xdg, ...env }, { homedir: home });
  const lines: string[] = [];
  const log = (m: string) => lines.push(m);
  const store = config.noStore ? null : new CredentialStore(config.credentialsFile, log);
  const fake = fakeClientFactory();
  const secrets: string[] = [];
  const session = new AuthSession({
    config,
    store,
    createClient: fake.createClient as never,
    log,
    secrets,
  });
  return { config, store, fake, session, lines, secrets };
};
const flush = () => new Promise((r) => setTimeout(r, 0));
const stored = (
  environment: 'test' | 'live',
  apiKey: string,
  createdAt: string,
  keyId: string,
) => ({
  baseUrl: 'https://api.storeshot.art/v1',
  environment,
  apiKey,
  keyId,
  scopes: [],
  createdAt,
});

describe('AuthSession (spec §6, amendment A2)', () => {
  test('STORESHOT_API_KEY wins and is never stored', async () => {
    const { session, fake, config } = setup({ STORESHOT_API_KEY: LIVE_KEY });
    expect(session.status()).toMatchObject({
      status: 'linked',
      source: 'env',
      environment: 'live',
    });
    await session.client();
    expect(fake.created).toEqual([LIVE_KEY]);
    expect(fake.control.calls).toHaveLength(0);
    expect(() => statSync(config.credentialsFile)).toThrow();
  });

  test('no key, no STORESHOT_ENVIRONMENT: one flow, no environment sent, then linked + stored', async () => {
    const { session, fake, lines, config, secrets } = setup();
    const [a, b] = await Promise.allSettled([session.client(), session.client()]);
    expect(a).toMatchObject({ status: 'rejected', reason: { code: 'ACCOUNT_LINK_REQUIRED' } });
    // The concurrent call shares the flow (same link and code), reported as pending.
    expect(b).toMatchObject({ status: 'rejected', reason: { code: 'ACCOUNT_LINK_PENDING' } });
    expect(fake.control.calls).toHaveLength(1);
    const call = fake.control.calls[0];
    expect(call.clientName).toBe('Storeshot MCP');
    expect('environment' in call).toBe(false);
    expect(call.scopes).toBeUndefined();
    expect(session.status()).toMatchObject({
      status: 'pending',
      environment: null,
      userCode: 'BCDF-GHJK',
    });
    expect(lines.join('\n')).toMatch(
      /open https:\/\/console\.storeshot\.art\/device\?code=BCDF-GHJK and confirm the code BCDF-GHJK/,
    );
    await expect(session.client()).rejects.toMatchObject({ code: 'ACCOUNT_LINK_PENDING' });
    fake.control.resolve({
      apiKey: TEST_KEY,
      keyId: 'key_9',
      scopes: ['usage:read'],
      environment: 'test',
    });
    await flush();
    await session.client();
    expect(session.status()).toMatchObject({
      status: 'linked',
      source: 'device',
      keyId: 'key_9',
      environment: 'test',
    });
    expect(statSync(config.credentialsFile).mode & 0o777).toBe(0o600);
    expect(secrets).toContain(TEST_KEY);
    expect(lines.join('\n')).not.toContain(TEST_KEY);
  });

  test('STORESHOT_ENVIRONMENT set: it is sent to the device flow', async () => {
    const { session, fake } = setup({ STORESHOT_ENVIRONMENT: 'live' });
    await session.client().catch(() => undefined);
    expect(fake.control.calls[0].environment).toBe('live');
  });

  test('stored keys: with an environment the matching entry only; without, the newest', async () => {
    const xdg = path.join(home, 'shared');
    const first = setup({}, xdg);
    first.store!.write(stored('live', LIVE_KEY, '2026-11-02T10:00:00.000Z', 'key_live'));
    first.store!.write(stored('test', TEST_KEY, '2026-11-02T09:00:00.000Z', 'key_test'));
    await first.session.client();
    expect(first.session.status()).toMatchObject({
      source: 'stored',
      keyId: 'key_live',
      environment: 'live',
    });
    expect(first.fake.control.calls).toHaveLength(0);
    const test = setup({ STORESHOT_ENVIRONMENT: 'test' }, xdg);
    await test.session.client();
    expect(test.session.status()).toMatchObject({ keyId: 'key_test', environment: 'test' });
  });

  test('a key stored by another process is picked up before a new flow starts', async () => {
    const xdg = path.join(home, 'other');
    const s = setup({}, xdg);
    await s.session.client().catch(() => undefined);
    expect(s.fake.control.calls).toHaveLength(1);
    s.store!.write(stored('test', TEST_KEY, '2026-11-02T10:00:00.000Z', 'key_other'));
    await s.session.client();
    expect(s.session.status()).toMatchObject({ source: 'stored', keyId: 'key_other' });
  });

  test('expired / denied: the next call starts a new flow and says why', async () => {
    const { session, fake } = setup();
    await session.client().catch(() => undefined);
    fake.control.reject(new StoreshotError({ code: 'DEVICE_CODE_EXPIRED', message: 'expired' }));
    await flush();
    expect(session.status().status).toBe('expired');
    await expect(session.client()).rejects.toMatchObject({
      code: 'ACCOUNT_LINK_REQUIRED',
      message: expect.stringMatching(/previous code expired/),
    });
    expect(fake.control.calls).toHaveLength(2);
    fake.control.reject(new StoreshotError({ code: 'DEVICE_ACCESS_DENIED', message: 'denied' }));
    await flush();
    expect(session.status().status).toBe('denied');
  });

  test('a stored key that got 401 is forgotten; NO_STORE never writes the file', async () => {
    const { session, store, config } = setup();
    store!.write(stored('test', TEST_KEY, '2026-11-02T10:00:00.000Z', 'key_3'));
    await session.client();
    session.invalidate();
    expect(store!.read(config.baseUrl, null)).toBeNull();
    await expect(session.client()).rejects.toMatchObject({ code: 'ACCOUNT_LINK_REQUIRED' });
    const noStore = setup({ STORESHOT_MCP_NO_STORE: '1' });
    await noStore.session.client().catch(() => undefined);
    noStore.fake.control.resolve({ apiKey: TEST_KEY, keyId: 'k', scopes: [], environment: 'test' });
    await flush();
    await noStore.session.client();
    expect(() => statSync(noStore.config.credentialsFile)).toThrow();
    expect(noStore.session.status().credentialsFile).toBeNull();
  });

  test('close() aborts the background poll', async () => {
    const { session, fake } = setup();
    await session.client().catch(() => undefined);
    session.close();
    await flush();
    expect((fake.control.calls[0].signal as AbortSignal).aborted).toBe(true);
    expect(session.status().status).toBe('pending');
  });
});
