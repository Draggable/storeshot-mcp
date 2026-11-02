import { z } from 'zod/v4';
import { FREE } from '../credits.js';
import { DeviceView, Store } from '../schemas.js';
import { deviceView } from '../views.js';
import { defineTool } from './define.js';

export const listDevices = defineTool({
  name: 'list_devices',
  title: 'List output sizes',
  description: [
    'Lists the output sizes (device ids) Storeshot can generate for the App Store and Google Play: id, store, kind (screenshot or feature_graphic), pixel size and orientations.',
    'When to use: to pick valid `device` values for generate_screenshot or `devices` for create_screenshot_set. Use get_store_requirements to learn which sizes a store requires.',
    FREE,
    'Deprecated sizes are hidden unless includeDeprecated is true; replacedBy names their replacement.',
  ].join('\n'),
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  needsAuth: true,
  input: z.strictObject({
    store: Store.optional().describe('Only this store.'),
    kind: z.enum(['screenshot', 'feature_graphic']).optional(),
    includeDeprecated: z.boolean().default(false),
  }),
  output: z.object({ devices: z.array(DeviceView) }),
  async run(args, { client, signal }) {
    const { data } = await client.devices.list(args.store ? { store: args.store } : {}, { signal });
    const devices = data
      .map(deviceView)
      .filter(
        (d) => (args.includeDeprecated || !d.deprecated) && (!args.kind || d.kind === args.kind),
      );
    const list = devices.map((d) => `${d.id} (${d.width}×${d.height})`).join(', ');
    return { summary: `${devices.length} sizes: ${list}.`, data: { devices } };
  },
});
