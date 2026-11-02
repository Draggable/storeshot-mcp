import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { inputPath } from '../scripts/inputs.mjs';
import { CREDITS_PER_IMAGE, PAID_TOOLS, TOOL_OPERATIONS } from '../src/credits.js';

type Op = { operationId?: string; description?: string };
const spec = JSON.parse(readFileSync(inputPath('contract'), 'utf8'));
const operations = new Map<string, string>();
for (const item of Object.values(spec.paths) as Record<string, Op>[]) {
  for (const op of Object.values(item)) {
    if (op?.operationId) operations.set(op.operationId, op.description ?? '');
  }
}
const creditsOf = (id: string) =>
  /\*\*Credits\.\*\* ([^\n]*)/.exec(operations.get(id) ?? '')?.[1] ?? '';

describe('credit costs pinned to the contract (spec §7.3)', () => {
  test('every mapped operation exists and has a Credits paragraph', () => {
    for (const ids of Object.values(TOOL_OPERATIONS)) {
      for (const id of ids) {
        expect(operations.has(id), id).toBe(true);
        expect(creditsOf(id), id).not.toBe('');
      }
    }
  });

  test('a tool is paid exactly when one of its operations is not free', () => {
    for (const [tool, ids] of Object.entries(TOOL_OPERATIONS)) {
      const paid = ids.some((id) => !creditsOf(id).startsWith('Free'));
      expect(PAID_TOOLS.includes(tool), tool).toBe(paid);
    }
  });

  test('paid paragraphs state the per-image cost and that test keys are free', () => {
    expect(creditsOf('createGeneration')).toMatch(
      new RegExp(`^${CREDITS_PER_IMAGE} credit with a live key`),
    );
    expect(creditsOf('createScreenshotSet')).toMatch(
      new RegExp(`^${CREDITS_PER_IMAGE} credit per image with a live key`),
    );
    for (const id of ['createGeneration', 'createScreenshotSet']) {
      expect(creditsOf(id)).toMatch(/free with a test key/);
    }
  });
});
