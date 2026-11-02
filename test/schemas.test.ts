import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Ajv } from 'ajv';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, test } from 'vitest';
import { readConfig } from '../src/config.js';
import { INSTRUCTIONS, SERVER_NAME, SERVER_TITLE, createServer } from '../src/server.js';

/** Keywords whose meaning is the same in JSON Schema draft-07 and 2020-12 (spec §12.1). */
const ALLOWED = new Set([
  '$schema',
  'type',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'enum',
  'const',
  'anyOf',
  'minimum',
  'maximum',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'pattern',
  'format',
  'default',
  'description',
  'title',
  'propertyNames',
]);

function keywords(schema: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(schema)) schema.forEach((s) => keywords(s, out));
  else if (schema && typeof schema === 'object') {
    for (const [k, v] of Object.entries(schema)) {
      out.add(k);
      if (k === 'properties') Object.values(v as object).forEach((s) => keywords(s, out));
      else if (
        !['enum', 'const', 'default', 'required', 'description', 'title', 'pattern'].includes(k)
      ) {
        keywords(v, out);
      }
    }
  }
  return out;
}

async function listTools() {
  const { server } = createServer({
    config: readConfig({ STORESHOT_API_KEY: `ss_test_${'a'.repeat(43)}` }),
    log: () => {},
    secrets: [],
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: 'schema-test', version: '0' });
  await client.connect(b);
  const { tools } = await client.listTools();
  const info = client.getServerVersion();
  const instructions = client.getInstructions();
  await client.close();
  return { tools, info, instructions };
}

describe('the tool list (spec §7, §12.1; Done-when 1)', () => {
  test('server name/title and the committed snapshot', async () => {
    const { tools, info, instructions } = await listTools();
    expect(info).toMatchObject({ name: SERVER_NAME, title: SERVER_TITLE });
    expect([SERVER_NAME, SERVER_TITLE]).toEqual(['storeshot-mcp', 'Storeshot MCP']);
    expect(instructions).toBe(INSTRUCTIONS);
    await expect(`${JSON.stringify({ instructions, tools }, null, 2)}\n`).toMatchFileSnapshot(
      './__snapshots__/tools.json',
    );
  });

  test('nine tools with a title, all four annotations, When to use and Credits', async () => {
    const { tools } = await listTools();
    expect(tools.map((t) => t.name)).toEqual([
      'get_store_requirements',
      'list_devices',
      'upload_screenshot',
      'generate_screenshot',
      'create_screenshot_set',
      'get_job_status',
      'download_results',
      'get_credits',
      'link_status',
    ]);
    for (const t of tools) {
      expect(t.title, t.name).toBeTruthy();
      const hints = t.annotations as Record<string, unknown>;
      for (const hint of ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint']) {
        expect(typeof hints[hint], `${t.name} ${hint}`).toBe('boolean');
      }
      expect(hints.openWorldHint, t.name).toBe(false);
      expect(t.description, t.name).toMatch(/\nWhen to use: /);
      expect(t.description, t.name).toMatch(/\nCredits: /);
      expect(t.description!.length, t.name).toBeLessThanOrEqual(1200);
      expect(t.outputSchema, t.name).toBeTruthy();
    }
    const paid = tools.filter((t) => /Credits: 1 credit/.test(t.description!));
    expect(paid.map((t) => t.name)).toEqual(['generate_screenshot', 'create_screenshot_set']);
    for (const t of paid) {
      expect(t.annotations?.readOnlyHint).toBe(false);
      expect(t.description).toMatch(/Test keys \(ss_test_…\) never spend credits/);
    }
    const readOnly = tools.filter((t) => t.annotations?.readOnlyHint).map((t) => t.name);
    expect(readOnly).toEqual([
      'get_store_requirements',
      'list_devices',
      'get_job_status',
      'get_credits',
      'link_status',
    ]);
    const destructive = tools.filter((t) => t.annotations?.destructiveHint).map((t) => t.name);
    expect(destructive).toEqual(['download_results']);
  });

  test('every schema: valid draft-07 as emitted, valid 2020-12 (strict) without $schema', async () => {
    const { tools } = await listTools();
    const draft7 = new Ajv({ strict: true, allErrors: true, validateFormats: false });
    const v2020 = new Ajv2020({ strict: true, allErrors: true, validateFormats: false });
    for (const t of tools) {
      for (const [which, schema] of [
        ['input', t.inputSchema],
        ['output', t.outputSchema],
      ] as const) {
        expect(() => draft7.compile(schema!), `${t.name} ${which} draft-07`).not.toThrow();
        const { $schema: _dialect, ...rest } = schema as Record<string, unknown>;
        expect(() => v2020.compile(rest), `${t.name} ${which} 2020-12`).not.toThrow();
        for (const k of keywords(schema)) {
          expect(ALLOWED.has(k), `${t.name} ${which}: keyword ${k}`).toBe(true);
        }
        if (which === 'input')
          expect((schema as { additionalProperties?: unknown }).additionalProperties).toBe(false);
      }
    }
  });
});
