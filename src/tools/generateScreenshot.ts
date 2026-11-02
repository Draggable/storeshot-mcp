import type { CreateGenerationRequest, Generation } from '@draggable/storeshot-sdk';
import { z } from 'zod/v4';
import { GENERATION_COST, TEST_KEY_NOTE } from '../credits.js';
import { GenerationView, Store } from '../schemas.js';
import { generationView } from '../views.js';
import { defineTool } from './define.js';
import {
  App,
  IdempotencyKey,
  Id,
  ImageRef,
  Orientation,
  Palette,
  WaitSeconds,
  compact,
  resolveImageRef,
} from './inputs.js';
import { waitForJob } from './jobs.js';

export const generateScreenshot = defineTool({
  name: 'generate_screenshot',
  title: 'Generate one store image',
  description: [
    'Turns one raw screenshot into one marketing image for one store size (a list_devices id), with an optional caption, palette and logo.',
    'When to use: for a single image or a quick try. For a whole listing (every screen on every required device, one charge) use create_screenshot_set instead.',
    GENERATION_COST,
    'Returns the job id at once; pass waitSeconds to wait, or follow it with get_job_status, then download_results.',
  ].join('\n'),
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  needsAuth: true,
  input: z.strictObject({
    screenshot: ImageRef,
    store: Store,
    device: z.string().min(1).max(64).describe('A list_devices id of the same store.'),
    app: App,
    caption: z.string().max(1000).optional(),
    orientation: Orientation.optional(),
    palette: Palette.optional(),
    logo: ImageRef.optional(),
    projectId: Id.optional(),
    idempotencyKey: IdempotencyKey.optional(),
    waitSeconds: WaitSeconds,
  }),
  output: GenerationView,
  async run(args, { client, config, signal, extra }) {
    const uploadId = await resolveImageRef(args.screenshot, client, config.root, signal);
    const logo = args.logo
      ? { uploadId: await resolveImageRef(args.logo, client, config.root, signal) }
      : undefined;
    const body = compact({
      inputs: [{ uploadId }],
      store: args.store,
      device: args.device,
      app: args.app,
      caption: args.caption,
      orientation: args.orientation,
      palette: args.palette,
      logo,
      projectId: args.projectId,
    }) as CreateGenerationRequest;
    const created = await client.generations.create(body, {
      idempotencyKey: args.idempotencyKey,
      signal,
    });
    const job = { kind: 'generation' as const, value: created };
    const { job: done, waited } = await waitForJob(client, job, args.waitSeconds, extra);
    const data = generationView(done.value as Generation, waited);
    const cost =
      data.environment === 'test' ? TEST_KEY_NOTE : `${data.creditsCharged} credit(s) charged.`;
    return { summary: `Generation ${data.id} is ${data.status}. ${cost} ${data.next}`, data };
  },
});
