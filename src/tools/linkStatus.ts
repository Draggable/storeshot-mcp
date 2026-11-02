import { z } from 'zod/v4';
import { FREE } from '../credits.js';
import { Environment } from '../schemas.js';
import { defineTool } from './define.js';

const NEXT: Record<string, string> = {
  linked:
    'Storeshot is linked: call any tool. To unlink, revoke the key in the console and delete the credentials file.',
  pending: 'Show the link and code to the user; call link_status again after they approve.',
  expired: 'The code expired: call any other tool to get a new one.',
  denied: 'The user denied the request: call any other tool to start again if they want to.',
  failed: 'Linking failed: check STORESHOT_BASE_URL and the network, or set STORESHOT_API_KEY.',
  not_started: 'Not linked yet: call any other tool (for example get_credits) to start linking.',
};

export const linkStatus = defineTool({
  name: 'link_status',
  title: 'Account link status',
  description: [
    'Reports whether this server has a Storeshot API key: linked (and where it came from), pending (with the link and code to show the user), expired, denied, failed or not started.',
    'When to use: after another tool answered ACCOUNT_LINK_REQUIRED or ACCOUNT_LINK_PENDING, to check whether the user approved. It never starts linking itself and needs no key.',
    FREE,
  ].join('\n'),
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  needsAuth: false,
  input: z.strictObject({}),
  output: z.object({
    status: z.enum(['linked', 'pending', 'expired', 'denied', 'failed', 'not_started']),
    source: z.enum(['env', 'stored', 'device']).nullable(),
    environment: Environment.nullable(),
    keyId: z.string().nullable(),
    scopes: z.array(z.string()),
    verificationUri: z.string().nullable(),
    verificationUriComplete: z.string().nullable(),
    userCode: z.string().nullable(),
    expiresAt: z.string().nullable(),
    credentialsFile: z.string().nullable(),
    next: z.string(),
  }),
  async run(_args, { session }) {
    const { reason: _reason, ...status } = session.status();
    const data = { ...status, next: NEXT[status.status] };
    const summary =
      status.status === 'pending'
        ? `Waiting for approval: open ${status.verificationUriComplete} and confirm the code ${status.userCode}.`
        : `Link status: ${status.status}${status.source ? ` (${status.source} key)` : ''}. ${data.next}`;
    return { summary, data };
  },
});
