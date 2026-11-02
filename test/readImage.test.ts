import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import { MAX_UPLOAD_BYTES, readImageFile } from '../src/files/readImage.js';
import { tmpDir } from './helpers/tmp.js';

const dir = tmpDir('read');
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const file = (name: string, bytes: Uint8Array | string) => {
  const p = path.join(dir, name);
  writeFileSync(p, bytes);
  return p;
};
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]);
const WEBP = new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ');
const HEIC = Uint8Array.from([0, 0, 0, 24, ...new TextEncoder().encode('ftypheic')]);

describe('readImageFile (spec §9.2)', () => {
  test.each([
    ['a.png', PNG, 'image/png'],
    ['b.jpg', JPEG, 'image/jpeg'],
    ['c.webp', WEBP, 'image/webp'],
  ] as const)('reads %s', async (name, bytes, type) => {
    const r = await readImageFile(file(name, bytes), { root: null });
    expect(r).toMatchObject({ filename: name, contentType: type, bytes: bytes.byteLength });
    expect(Buffer.from(r.data).equals(Buffer.from(bytes))).toBe(true);
  });

  test('a private key, a .env or HEIC is refused before any upload', async () => {
    // Built from parts so the mirror leak check (which rejects key headers) stays meaningful.
    const key = file('id_ed25519', `-----BEGIN OPENSSH ${'PRIVATE'} KEY-----\n`);
    await expect(readImageFile(key, { root: null })).rejects.toMatchObject({
      code: 'UNSUPPORTED_FILE_TYPE',
    });
    await expect(readImageFile(file('.env', 'A=1'), { root: null })).rejects.toMatchObject({
      code: 'UNSUPPORTED_FILE_TYPE',
    });
    await expect(readImageFile(file('x.heic', HEIC), { root: null })).rejects.toThrow(
      /convert it to PNG/,
    );
  });

  test('missing, directories, empty and oversized files', async () => {
    await expect(readImageFile(path.join(dir, 'nope.png'), { root: null })).rejects.toMatchObject({
      code: 'NOT_A_FILE',
    });
    mkdirSync(path.join(dir, 'd'));
    await expect(readImageFile(path.join(dir, 'd'), { root: null })).rejects.toMatchObject({
      code: 'NOT_A_FILE',
    });
    await expect(readImageFile(file('empty.png', ''), { root: null })).rejects.toMatchObject({
      code: 'NOT_A_FILE',
    });
    const big = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    big.set(PNG);
    await expect(readImageFile(file('big.png', big), { root: null })).rejects.toMatchObject({
      code: 'FILE_TOO_LARGE',
    });
  });

  test('a symlink is read through its real path, which must be inside the root', async () => {
    const real = file('real.png', PNG);
    const sub = path.join(dir, 'root');
    mkdirSync(sub);
    symlinkSync(real, path.join(sub, 'link.png'));
    const link = path.join(sub, 'link.png');
    await expect(readImageFile(link, { root: sub })).rejects.toMatchObject({
      code: 'PATH_NOT_ALLOWED',
    });
    await expect(readImageFile(link, { root: null })).resolves.toMatchObject({ path: real });
  });
});
