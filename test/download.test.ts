import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  anySignal,
  fetchSignedUrl,
  isLoopbackUrl,
  saveStreamCapped,
} from '../src/files/download.js';
import { tmpDir } from './helpers/tmp.js';

let base = '';
let seen: IncomingHttpHeaders = {};
const server = createServer((req, res) => {
  seen = req.headers;
  if (req.url === '/redirect') return res.writeHead(302, { Location: '/ok' }).end();
  if (req.url === '/big')
    return res.writeHead(200, { 'Content-Length': '100' }).end('x'.repeat(100));
  if (req.url === '/chunked') {
    res.writeHead(200);
    res.write('x'.repeat(8));
    return res.end('x'.repeat(8));
  }
  if (req.url === '/gone') return res.writeHead(403).end();
  res.writeHead(200, { 'Content-Type': 'image/png' }).end('PNGDATA');
});
const dir = tmpDir('download');
beforeAll(
  () =>
    new Promise<void>((ok) =>
      server.listen(0, '127.0.0.1', () => {
        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        ok();
      }),
    ),
);
afterAll(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});
const opts = { allowLoopbackHttp: true, maxBytes: 10 };

describe('fetchSignedUrl (spec §9.3)', () => {
  test('loopback http only when allowed; no Authorization header is sent', async () => {
    await expect(
      fetchSignedUrl(`${base}/ok`, { ...opts, allowLoopbackHttp: false }),
    ).rejects.toThrow(/https/);
    const bytes = await fetchSignedUrl(`${base}/ok`, opts);
    expect(Buffer.from(bytes).toString()).toBe('PNGDATA');
    expect(seen.authorization).toBeUndefined();
    expect(seen.cookie).toBeUndefined();
  });

  test('http to a non-loopback host, redirects, errors and oversize bodies are refused', async () => {
    await expect(fetchSignedUrl('http://example.com/x', opts)).rejects.toThrow(/https/);
    await expect(fetchSignedUrl('file:///etc/passwd', opts)).rejects.toThrow(/https/);
    await expect(fetchSignedUrl(`${base}/redirect`, opts)).rejects.toThrow();
    await expect(fetchSignedUrl(`${base}/gone`, opts)).rejects.toThrow(/403/);
    await expect(fetchSignedUrl(`${base}/big`, opts)).rejects.toMatchObject({
      code: 'DOWNLOAD_TOO_LARGE',
    });
    await expect(fetchSignedUrl(`${base}/chunked`, opts)).rejects.toMatchObject({
      code: 'DOWNLOAD_TOO_LARGE',
    });
  });

  test('isLoopbackUrl', () => {
    expect(isLoopbackUrl('http://127.0.0.1:3/v1')).toBe(true);
    expect(isLoopbackUrl('https://api.storeshot.art/v1')).toBe(false);
  });
});

describe('saveStreamCapped / anySignal', () => {
  test('writes until the cap, then removes the file', async () => {
    const file = path.join(dir, 'a.zip.part');
    expect(await saveStreamCapped(new Blob(['abc']).stream(), file, 10)).toBe(3);
    expect(readFileSync(file, 'utf8')).toBe('abc');
    const over = path.join(dir, 'b.zip.part');
    await expect(
      saveStreamCapped(new Blob(['x'.repeat(20)]).stream(), over, 10),
    ).rejects.toMatchObject({ code: 'DOWNLOAD_TOO_LARGE' });
    expect(existsSync(over)).toBe(false);
  });

  test('anySignal aborts when either input aborts', () => {
    const a = new AbortController();
    const b = new AbortController();
    const s = anySignal([a.signal, b.signal]);
    expect(s.aborted).toBe(false);
    b.abort();
    expect(s.aborted).toBe(true);
  });
});
