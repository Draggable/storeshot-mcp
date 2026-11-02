import { z } from 'zod/v4';
import { FREE } from '../credits.js';
import { RequirementsView, Store } from '../schemas.js';
import { requirementsView } from '../views.js';
import { defineTool } from './define.js';

export const getStoreRequirements = defineTool({
  name: 'get_store_requirements',
  title: 'Store screenshot requirements',
  description: [
    'Returns the screenshot rules of the App Store and/or Google Play: device classes (required, conditional or optional), how many screenshots each needs, accepted sizes and formats, and the Google Play feature graphic.',
    'When to use: first, before planning a listing, to know which devices a store requires. Then list_devices for exact ids and create_screenshot_set to make everything.',
    FREE,
  ].join('\n'),
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  needsAuth: true,
  input: z.strictObject({ store: Store.optional().describe('Absent: both stores.') }),
  output: z.object({ stores: z.array(RequirementsView) }),
  async run(args, { client, signal }) {
    const targets = args.store ? [args.store] : (['app_store', 'google_play'] as const);
    const stores = [];
    for (const store of targets) {
      stores.push(requirementsView(await client.stores.requirements(store, { signal })));
    }
    const text = stores
      .map((s) => {
        const required = s.deviceClasses.filter((c) => c.requirement === 'required');
        return `${s.name}: ${required.map((c) => c.label).join(', ') || 'see deviceClasses'} required`;
      })
      .join('; ');
    return { summary: `${text}.`, data: { stores } };
  },
});
