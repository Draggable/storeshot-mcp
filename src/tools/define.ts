import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { Storeshot } from '@draggable/storeshot-sdk';
import { StoreshotError } from '@draggable/storeshot-sdk';
import type { z } from 'zod/v4';
import type { AuthSession } from '../auth/session.js';
import type { Config } from '../config.js';
import { McpToolError, toToolError } from '../errors.js';
import type { Extra } from '../progress.js';
import { failure, ok } from '../results.js';
import type { Logger } from '../stdout.js';

export interface ToolDeps {
  config: Config;
  session: AuthSession;
  log: Logger;
}
export interface ToolContext extends ToolDeps {
  extra: Extra;
  signal: AbortSignal;
  /** The keyed SDK client (tools with `needsAuth: false` must not use it). */
  client: Storeshot;
}
type Hints = 'readOnlyHint' | 'destructiveHint' | 'idempotentHint' | 'openWorldHint';

export interface ToolSpec<
  I extends z.ZodObject = z.ZodObject,
  O extends z.ZodObject = z.ZodObject,
> {
  name: string;
  title: string;
  description: string;
  input: I;
  output: O;
  annotations: Required<Pick<ToolAnnotations, Hints>>;
  needsAuth: boolean;
  run(args: z.infer<I>, ctx: ToolContext): Promise<{ summary: string; data: z.infer<O> }>;
}

export const defineTool = <I extends z.ZodObject, O extends z.ZodObject>(spec: ToolSpec<I, O>) =>
  spec;

/** Resolves the client, runs the tool and formats the result or the error (spec §4, §8). */
export async function runTool(
  spec: ToolSpec,
  args: unknown,
  extra: Extra,
  deps: ToolDeps,
): Promise<CallToolResult> {
  const { config, session, log } = deps;
  try {
    if (config.error) {
      throw new McpToolError(
        'INVALID_CONFIGURATION',
        config.error,
        'Fix the variable named above in the MCP client configuration, then restart the server.',
      );
    }
    const client = spec.needsAuth ? await session.client() : (null as unknown as Storeshot);
    const { summary, data } = await spec.run(args as never, {
      ...deps,
      extra,
      signal: extra.signal,
      client,
    });
    return ok(summary, data as Record<string, unknown>);
  } catch (error) {
    const keySource = session.keySource;
    if (error instanceof StoreshotError && error.status === 401) session.invalidate();
    const e = toToolError(error, { keySource });
    log(`tool=${spec.name} code=${e.code}${e.requestId ? ` request=${e.requestId}` : ''}`);
    const unexpected = !(error instanceof StoreshotError) && !(error instanceof McpToolError);
    if (config.debug && unexpected && error instanceof Error) log(String(error.stack));
    return failure(e);
  }
}

export function registerTools(server: McpServer, specs: ToolSpec[], deps: ToolDeps): void {
  for (const spec of specs) {
    server.registerTool(
      spec.name,
      {
        title: spec.title,
        description: spec.description,
        inputSchema: spec.input,
        outputSchema: spec.output,
        annotations: { title: spec.title, ...spec.annotations },
      },
      ((args: unknown, extra: Extra) => runTool(spec, args, extra, deps)) as never,
    );
  }
}
