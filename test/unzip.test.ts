import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { text } from 'node:stream/consumers';
import { afterAll, describe, expect, test } from 'vitest';
import { openZip } from '../src/files/unzip.js';
import { makeZip, type ZipItem } from './helpers/zip.js';
import { tmpDir } from './helpers/tmp.js';

const dir = tmpDir('unzip');
afterAll(() => rmSync(dir, { recursive: true, force: true }));
let n = 0;
const zipFile = (items: ZipItem[]) => {
  const p = path.join(dir, `${n++}.zip`);
  writeFileSync(p, makeZip(items));
  return p;
};
const LIMITS = { maxEntries: 64, maxEntryBytes: 1024, maxTotalBytes: 4096 };

describe('openZip (spec §9.3)', () => {
  test('lists entries first, then streams them (stored and deflated, folders)', async () => {
    const zip = await openZip(
      zipFile([
        { name: 'a/', mode: 0o040755 },
        { name: 'a/01.png', data: 'one' },
        { name: 'manifest.json', data: '{"x":1}', deflate: true },
      ]),
      LIMITS,
    );
    expect(zip.entries.map((e) => [e.name, e.directory])).toEqual([
      ['a', true],
      ['a/01.png', false],
      ['manifest.json', false],
    ]);
    expect(await text(await zip.open(zip.entries[2]))).toBe('{"x":1}');
    expect(await text(await zip.open(zip.entries[1]))).toBe('one');
    zip.close();
  });

  test.each<[string, ZipItem[]]>([
    ['traversal', [{ name: '../evil.png', data: 'x' }]],
    ['absolute', [{ name: '/etc/x', data: 'x' }]],
    ['backslash', [{ name: 'a\\b.png', data: 'x' }]],
    ['hidden', [{ name: '.bashrc', data: 'x' }]],
    ['symlink entry', [{ name: 'link', data: '/etc/passwd', mode: 0o120777 }]],
    ['encrypted', [{ name: 'a.png', data: 'x', encrypted: true }]],
    ['too large', [{ name: 'a.png', data: 'x'.repeat(2000) }]],
    [
      'duplicate',
      [
        { name: 'a.png', data: 'x' },
        { name: 'a.png', data: 'y' },
      ],
    ],
    ['too many', Array.from({ length: 65 }, (_, i) => ({ name: `f${i}.png`, data: 'x' }))],
    [
      'total too large',
      Array.from({ length: 5 }, (_, i) => ({ name: `f${i}.png`, data: 'x'.repeat(1000) })),
    ],
  ])('refuses %s', async (_label, items) => {
    await expect(openZip(zipFile(items), LIMITS)).rejects.toMatchObject({ code: 'UNSAFE_ARCHIVE' });
  });

  test('not a ZIP at all', async () => {
    const p = path.join(dir, 'junk.zip');
    writeFileSync(p, 'not a zip');
    await expect(openZip(p, LIMITS)).rejects.toMatchObject({ code: 'UNSAFE_ARCHIVE' });
  });

  test('a lying size: refused at open (stored) or while inflating (deflated)', async () => {
    const stored = zipFile([{ name: 'a.png', data: 'abcdef', lieSize: 3 }]);
    await expect(openZip(stored, LIMITS)).rejects.toMatchObject({ code: 'UNSAFE_ARCHIVE' });
    const deflated = zipFile([
      { name: 'a.png', data: 'abcdef'.repeat(50), deflate: true, lieSize: 3 },
    ]);
    const zip = await openZip(deflated, LIMITS);
    await expect(text(await zip.open(zip.entries[0]))).rejects.toThrow(/too many bytes|size/);
    zip.close();
  });
});
