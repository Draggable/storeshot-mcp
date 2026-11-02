import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, describe, expect, test } from 'vitest';
import { TreeWriter } from '../src/files/writeTree.js';
import { tmpDir } from './helpers/tmp.js';

const base = tmpDir('write');
afterAll(() => rmSync(base, { recursive: true, force: true }));
const fresh = (name: string) => path.join(base, name);

describe('TreeWriter (spec §9.3)', () => {
  test('creates the folder and nested files; returns paths, sizes and sha256', async () => {
    const w = await TreeWriter.open(fresh('a'), { root: null, overwrite: false });
    await w.preflight(['x/y/01.png']);
    const f = await w.write('x/y/01.png', Readable.from([Buffer.from('ab'), Buffer.from('c')]));
    expect(f).toMatchObject({
      path: path.join(base, 'a/x/y/01.png'),
      relativePath: 'x/y/01.png',
      bytes: 3,
      sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    });
    expect(readFileSync(f.path, 'utf8')).toBe('abc');
    expect(readdirSync(path.join(base, 'a/x/y'))).toEqual(['01.png']);
  });

  test('existing targets: FILE_EXISTS in preflight, nothing written; overwrite replaces', async () => {
    const dir = fresh('b');
    mkdirSync(dir);
    writeFileSync(path.join(dir, '01.png'), 'old');
    const w = await TreeWriter.open(dir, { root: null, overwrite: false });
    await expect(w.preflight(['01.png', '02.png'])).rejects.toMatchObject({ code: 'FILE_EXISTS' });
    expect(existsSync(path.join(dir, '02.png'))).toBe(false);
    const o = await TreeWriter.open(dir, { root: null, overwrite: true });
    await o.preflight(['01.png']);
    await o.write('01.png', Buffer.from('new'));
    expect(readFileSync(path.join(dir, '01.png'), 'utf8')).toBe('new');
    await o.rollback();
    expect(readFileSync(path.join(dir, '01.png'), 'utf8')).toBe('new');
  });

  test('a symlinked directory or file below the folder is refused, even with overwrite', async () => {
    const dir = fresh('c');
    mkdirSync(path.join(base, 'elsewhere'));
    mkdirSync(dir);
    symlinkSync(path.join(base, 'elsewhere'), path.join(dir, 'x'));
    symlinkSync(path.join(base, 'elsewhere', 'target'), path.join(dir, 'f.png'));
    const w = await TreeWriter.open(dir, { root: null, overwrite: true });
    await expect(w.preflight(['x/01.png'])).rejects.toMatchObject({ code: 'PATH_NOT_ALLOWED' });
    await expect(w.preflight(['f.png'])).rejects.toMatchObject({ code: 'PATH_NOT_ALLOWED' });
    await expect(w.write('f.png', Buffer.from('x'))).rejects.toMatchObject({
      code: 'PATH_NOT_ALLOWED',
    });
    expect(readdirSync(path.join(base, 'elsewhere'))).toEqual([]);
  });

  test('a folder outside the root is refused', async () => {
    const root = fresh('root');
    mkdirSync(root);
    await expect(
      TreeWriter.open(fresh('elsewhere-out'), { root, overwrite: false }),
    ).rejects.toMatchObject({ code: 'PATH_NOT_ALLOWED' });
  });

  test('unsafe and duplicate names; a failed write rolls back every file of the call', async () => {
    const dir = fresh('d');
    const w = await TreeWriter.open(dir, { root: null, overwrite: false });
    await expect(w.preflight(['../evil.png'])).rejects.toMatchObject({ code: 'UNSAFE_ARCHIVE' });
    await expect(w.preflight(['a.png', 'a.png'])).rejects.toMatchObject({ code: 'UNSAFE_ARCHIVE' });
    await w.preflight(['a.png', 'sub/b.png']);
    await w.write('a.png', Buffer.from('1'));
    const failing = new Readable({
      read() {
        this.destroy(new Error('stream broke'));
      },
    });
    await expect(w.write('sub/b.png', failing)).rejects.toThrow(/stream broke/);
    await w.rollback();
    expect(readdirSync(dir)).toEqual([]);
  });
});
