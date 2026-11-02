import { chmodSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import { CredentialStore, type StoredKey } from '../src/auth/store.js';
import { tmpDir } from './helpers/tmp.js';

const base = tmpDir('store');
afterAll(() => rmSync(base, { recursive: true, force: true }));
const PROD = 'https://api.storeshot.art/v1';
const key = (environment: 'test' | 'live', createdAt: string, keyId = 'key_1'): StoredKey => ({
  baseUrl: PROD,
  environment,
  apiKey: `ss_${environment}_${'k'.repeat(43)}`,
  keyId,
  scopes: ['usage:read'],
  createdAt,
});

describe('CredentialStore (spec §6.1, amendment A2)', () => {
  test('0600 file in a 0700 dir; one entry per (base URL, environment); other entries kept', () => {
    const file = path.join(base, 'a/storeshot/mcp-credentials.json');
    const warnings: string[] = [];
    const store = new CredentialStore(file, (m) => warnings.push(m));
    store.write(key('test', '2026-11-02T10:00:00.000Z'));
    store.write(key('live', '2026-11-02T11:00:00.000Z'));
    store.write(key('test', '2026-11-02T12:00:00.000Z', 'key_2'));
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(statSync(path.dirname(file)).mode & 0o777).toBe(0o700);
    expect(JSON.parse(readFileSync(file, 'utf8')).keys).toHaveLength(2);
    expect(store.read(PROD, 'test')?.keyId).toBe('key_2');
    expect(store.read(PROD, 'live')?.environment).toBe('live');
    expect(store.read('http://127.0.0.1:1/v1', null)).toBeNull();
    expect(warnings).toEqual([]);
  });

  test('without an environment: the most recently created entry for the base URL', () => {
    const store = new CredentialStore(path.join(base, 'b/creds.json'), () => {});
    store.write(key('live', '2026-11-02T09:00:00.000Z'));
    store.write(key('test', '2026-11-02T08:00:00.000Z'));
    expect(store.read(PROD, null)?.environment).toBe('live');
    store.write(key('test', '2026-11-03T08:00:00.000Z'));
    expect(store.read(PROD, null)?.environment).toBe('test');
    store.remove(PROD, 'test');
    expect(store.read(PROD, null)?.environment).toBe('live');
    expect(store.read(PROD, 'test')).toBeNull();
  });

  test('a group/world-readable or corrupt file is ignored with a warning; a link replaces it', () => {
    const file = path.join(base, 'c/mcp-credentials.json');
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ version: 1, keys: [key('test', 'x')] }));
    chmodSync(file, 0o644);
    const warnings: string[] = [];
    const store = new CredentialStore(file, (m) => warnings.push(m));
    expect(store.read(PROD, 'test')).toBeNull();
    expect(warnings.join()).toMatch(/chmod 600/);
    writeFileSync(file, '{not json');
    chmodSync(file, 0o600);
    expect(store.read(PROD, 'test')).toBeNull();
    expect(warnings.join()).toMatch(/not a valid credentials file/);
    store.write(key('live', 'y'));
    const keys = JSON.parse(readFileSync(file, 'utf8')).keys as StoredKey[];
    expect(keys.map((k) => k.environment)).toEqual(['live']);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(warnings.join()).not.toMatch(/ss_(test|live)_/);
  });
});
