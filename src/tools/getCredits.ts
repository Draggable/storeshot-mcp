import { z } from 'zod/v4';
import { FREE } from '../credits.js';
import { Environment } from '../schemas.js';
import { creditsView } from '../views.js';
import { defineTool } from './define.js';

export const getCredits = defineTool({
  name: 'get_credits',
  title: 'Credit balance',
  description: [
    'Returns the account credit balance: total and the starter, subscription and purchased parts, and the environment (test or live) of the key in use.',
    'When to use: before create_screenshot_set or generate_screenshot with a live key, or after a 402 INSUFFICIENT_CREDITS. Test keys never spend credits.',
    FREE,
  ].join('\n'),
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  needsAuth: true,
  input: z.strictObject({}),
  output: z.object({
    total: z.number().int(),
    balances: z.object({
      starter: z.number().int(),
      subscription: z.number().int(),
      purchased: z.number().int(),
    }),
    environment: Environment,
    note: z.string(),
  }),
  async run(_args, { client, signal, session }) {
    const balances = await client.credits.get({ signal });
    const data = creditsView(balances, session.status().environment ?? 'live');
    return { summary: `${data.total} credits (${data.environment} key). ${data.note}`, data };
  },
});
