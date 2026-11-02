import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolError } from './errors.js';

/** A successful result: a summary, the serialized JSON and `structuredContent` (spec §7.2). */
export function ok<T extends Record<string, unknown>>(summary: string, data: T): CallToolResult {
  return {
    content: [
      { type: 'text', text: summary },
      { type: 'text', text: JSON.stringify(data) },
    ],
    structuredContent: data,
  };
}

/** A failure: `isError`, readable text and an `{ error }` JSON block, never a stack (spec §8). */
export function failure(e: ToolError): CallToolResult {
  const lines = [
    `Storeshot error ${e.code}${e.status ? ` (${e.status})` : ''}: ${e.message}`,
    `Next: ${e.next}`,
  ];
  const meta = [e.requestId && `Request id: ${e.requestId}`, e.docUrl && `Docs: ${e.docUrl}`];
  if (meta.some(Boolean)) lines.push(meta.filter(Boolean).join(' · '));
  return {
    isError: true,
    content: [
      { type: 'text', text: lines.join('\n') },
      { type: 'text', text: JSON.stringify({ error: e }) },
    ],
  };
}
