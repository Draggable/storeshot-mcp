import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { createLogger, guardStdout } from '../src/stdout.js';

describe('stdout guard (spec §11)', () => {
  test('console.log/info/debug/warn go to the error stream', () => {
    const lines: string[] = [];
    const fake = { log() {}, info() {}, debug() {}, warn() {}, error() {} } as unknown as Console;
    guardStdout(fake, (text) => lines.push(text));
    fake.log('a', 1);
    fake.info('b');
    fake.debug('c');
    fake.warn('d');
    expect(lines).toEqual(['a 1\n', 'b\n', 'c\n', 'd\n']);
  });

  test('logger: one prefixed line, newlines flattened, secrets scrubbed (live list)', () => {
    const lines: string[] = [];
    const secrets: string[] = [];
    const log = createLogger((t) => lines.push(t), secrets);
    secrets.push('ss_test_SECRETSECRET');
    log('linked\nkey ss_test_SECRETSECRET');
    expect(lines).toEqual(['[storeshot-mcp] linked key ss_test_…\n']);
  });

  test('no file in src/ writes to process.stdout or calls console.log/info/debug', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (full.endsWith('.ts') && !full.endsWith('stdout.ts')) files.push(full);
      }
    };
    walk(path.resolve(__dirname, '../src'));
    expect(files.length).toBeGreaterThan(20);
    for (const file of files) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(
        /process\.stdout|console\.(log|info|debug)\(/,
      );
    }
  });
});
