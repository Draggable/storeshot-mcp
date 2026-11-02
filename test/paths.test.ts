import { mkdirSync, rmSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import { isInside, resolveUserPath, safeRelativeName } from '../src/files/paths.js';
import { tmpDir } from './helpers/tmp.js';

const base = tmpDir('paths');
const root = path.join(base, 'root');
mkdirSync(path.join(root, 'shots'), { recursive: true });
mkdirSync(path.join(base, 'outside'));
symlinkSync(path.join(base, 'outside'), path.join(root, 'escape'));
afterAll(() => rmSync(base, { recursive: true, force: true }));

describe('resolveUserPath (spec §9.1)', () => {
  test('absolute paths without a root', () => {
    const p = path.join(base, 'outside');
    expect(resolveUserPath(p, { root: null })).toBe(p);
  });

  test('relative paths need a root and resolve against it', () => {
    expect(() => resolveUserPath('shots', { root: null })).toThrow(/absolute path/);
    expect(resolveUserPath('shots', { root })).toBe(path.join(root, 'shots'));
  });

  test.each(['', 'a\0b', '\\\\?\\C:\\x', '\\\\server\\share', '//server/share'])(
    'refuses %j',
    (bad) => {
      expect(() => resolveUserPath(bad, { root: null })).toThrow();
    },
  );

  test('inside the root by real path; a folder not yet created is fine', () => {
    const outside = /STORESHOT_MCP_ROOT/;
    expect(() => resolveUserPath(path.join(root, 'escape'), { root })).toThrow(outside);
    expect(() => resolveUserPath(path.join(root, '..', 'outside'), { root })).toThrow(outside);
    expect(resolveUserPath(path.join(root, 'new', 'deep'), { root })).toBe(
      path.join(root, 'new', 'deep'),
    );
    expect(() => resolveUserPath(path.join(root, 'escape', 'new'), { root })).toThrow(outside);
  });
});

describe('safeRelativeName (spec §9.3)', () => {
  test.each([
    'app_store/app_store_1290x2796/01.png',
    'fastlane/metadata/android/en-US/images/phoneScreenshots/01.png',
    'featureGraphic.jpg',
  ])('accepts %s', (name) => {
    expect(safeRelativeName(name)).toEqual(name.split('/'));
  });

  test.each([
    '../x.png',
    '/etc/passwd',
    'a\\b.png',
    'C:x.png',
    'a//b.png',
    './a.png',
    'a/../b.png',
    '.hidden',
    'a\0b',
    'a/b/c/d/e/f/g/h/i.png',
    'x'.repeat(129),
  ])('refuses %j', (name) => {
    expect(() => safeRelativeName(name)).toThrow(/unsafe file name/);
  });

  test('isInside compares segments, not prefixes', () => {
    expect(isInside('/a/b', '/a/b/c')).toBe(true);
    expect(isInside('/a/b', '/a/b')).toBe(true);
    expect(isInside('/a/b', '/a/bc')).toBe(false);
    expect(isInside('/a/b', '/a')).toBe(false);
  });
});
