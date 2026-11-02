import { StoreshotError, StoreshotTimeoutError } from '@draggable/storeshot-sdk';
import { describe, expect, test } from 'vitest';
import { McpToolError, toToolError } from '../src/errors.js';
import { failure, ok } from '../src/results.js';

const api = (status: number, code: string, details?: Record<string, unknown>) =>
  new StoreshotError({
    status,
    code,
    message: `${code} message`,
    requestId: 'req_1',
    docUrl: 'https://storeshot.art/docs/errors/',
    details,
  });

describe('toToolError (spec §8)', () => {
  test.each([
    [
      402,
      'INSUFFICIENT_CREDITS',
      { topUpUrl: 'https://x/top-up', requiredCredits: 9 },
      /https:\/\/x\/top-up.*STORESHOT_ENVIRONMENT=test/,
    ],
    [401, 'UNAUTHORIZED', undefined, /STORESHOT_API_KEY/],
    [403, 'FORBIDDEN', undefined, /scope/],
    [429, 'RATE_LIMITED', undefined, /Wait/],
    [429, 'CONCURRENCY_LIMITED', undefined, /get_job_status/],
    [400, 'INVALID_INPUT', { path: ['device'] }, /list_devices/],
    [422, 'NOT_A_SCREENSHOT', { path: ['inputs', 0] }, /screenshot/],
    [409, 'UPLOAD_NOT_READY', undefined, /upload the file again/i],
    [409, 'SCREENSHOT_SET_STATE_CONFLICT', { action: 'archive' }, /waitSeconds/],
    [409, 'IDEMPOTENCY_CONFLICT', undefined, /idempotencyKey/],
    [404, 'NOT_FOUND', undefined, /kind/],
    [503, 'SERVICE_UNAVAILABLE', undefined, /later/],
  ])('%s %s', (status, code, details, next) => {
    const e = toToolError(api(status, code, details), { keySource: 'env' });
    expect(e).toMatchObject({ code, status, requestId: 'req_1', message: `${code} message` });
    expect(e.next).toMatch(next);
  });

  test('a stored key that got 401 is relinked on the next call', () => {
    expect(toToolError(api(401, 'UNAUTHORIZED'), { keySource: 'stored' }).next).toMatch(/new link/);
  });

  test('details keep whitelisted keys only', () => {
    const raw = { path: ['x'], body: 'raw', images: 51 };
    const e = toToolError(api(400, 'INVALID_INPUT', raw), { keySource: null });
    expect(e.details).toEqual({ path: ['x'], images: 51 });
  });

  test('SDK and local errors; unknown errors carry no stack', () => {
    const timeout = new StoreshotTimeoutError({ code: 'TIMEOUT', message: 't' });
    expect(toToolError(timeout, { keySource: null }).next).toMatch(/STORESHOT_BASE_URL/);
    const local = new McpToolError('FILE_EXISTS', 'exists', 'Pass overwrite: true.');
    expect(toToolError(local, { keySource: null })).toMatchObject({
      code: 'FILE_EXISTS',
      status: null,
      next: 'Pass overwrite: true.',
    });
    const e = toToolError(new TypeError('bad thing'), { keySource: null });
    expect(e.code).toBe('INTERNAL_ERROR');
    expect(e.message).toMatch(/TypeError.*bad thing/);
    expect(JSON.stringify(e)).not.toMatch(/\.ts:\d+/);
  });

  test('an API key in an SDK message never survives (SDK scrubbing)', () => {
    const key = `ss_test_${'k'.repeat(43)}`;
    const e = new StoreshotError({ code: 'X', message: `bad ${key}`, secrets: [key] });
    expect(JSON.stringify(toToolError(e, { keySource: 'env' }))).not.toContain(key);
  });
});

describe('results', () => {
  test('ok: summary + JSON text blocks + structuredContent', () => {
    expect(ok('Done.', { a: 1 })).toEqual({
      content: [
        { type: 'text', text: 'Done.' },
        { type: 'text', text: '{"a":1}' },
      ],
      structuredContent: { a: 1 },
    });
  });

  test('failure: isError, readable text and an error JSON block, no structuredContent', () => {
    const e = toToolError(api(402, 'INSUFFICIENT_CREDITS', { topUpUrl: 'https://x' }), {
      keySource: 'env',
    });
    const r = failure(e);
    expect(r.isError).toBe(true);
    expect(r.structuredContent).toBeUndefined();
    const [head, body] = r.content as { text: string }[];
    expect(head.text).toMatch(/^Storeshot error INSUFFICIENT_CREDITS \(402\): /);
    expect(head.text).toMatch(/\nNext: Buy credits at https:\/\/x/);
    expect(head.text).toMatch(/Request id: req_1 · Docs: https:\/\/storeshot\.art\/docs\/errors\//);
    expect(JSON.parse(body.text).error.code).toBe('INSUFFICIENT_CREDITS');
  });
});
