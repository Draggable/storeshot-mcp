import { mkdirSync, mkdtempSync } from 'node:fs';
import path from 'node:path';

/** A fresh directory under packages/mcp-server/.tmp/ (git-ignored); callers remove it. */
export function tmpDir(prefix: string): string {
  const root = path.resolve(__dirname, '../../.tmp');
  mkdirSync(root, { recursive: true });
  return mkdtempSync(path.join(root, `${prefix}-`));
}
