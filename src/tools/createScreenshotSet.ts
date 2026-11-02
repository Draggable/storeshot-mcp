import type { CreateScreenshotSetRequest, ScreenshotSet } from '@draggable/storeshot-sdk';
import { z } from 'zod/v4';
import { SET_COST, TEST_KEY_NOTE } from '../credits.js';
import { QuoteView, SetView, Store } from '../schemas.js';
import { quoteView, setView } from '../views.js';
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

export const createScreenshotSet = defineTool({
  name: 'create_screenshot_set',
  title: 'Create a screenshot set',
  description: [
    'Makes a whole store listing in one job: every screen (1–10 raw screenshots, one caption each) on every device of one or both stores, plus an optional Google Play feature graphic, with one palette and logo for all. Without devices a store gets the sizes it requires.',
    'When to use: to produce or refresh App Store / Google Play screenshots. With a live key call it first with dryRun: true to see the cost. Then get_job_status and download_results (layout "fastlane" for fastlane projects).',
    SET_COST,
    'At most 50 images per set. Screens accept { uploadId } or { path } (uploaded first, also for dryRun).',
  ].join('\n'),
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  needsAuth: true,
  input: z.strictObject({
    app: App,
    screens: z
      .array(z.strictObject({ screenshot: ImageRef, caption: z.string().min(1).max(1000) }))
      .min(1)
      .max(10),
    stores: z
      .array(
        z.strictObject({
          store: Store,
          devices: z
            .array(z.string().min(1).max(64))
            .min(1)
            .max(5)
            .optional()
            .describe(
              'list_devices ids of this store, at most one per device class. Absent: the store defaults.',
            ),
          featureGraphic: z
            .union([
              z.boolean(),
              z.strictObject({
                screen: z.number().int().min(1).max(10),
                caption: z.string().min(1).max(1000).optional(),
              }),
            ])
            .optional()
            .describe('Google Play only.'),
        }),
      )
      .min(1)
      .max(2),
    orientation: Orientation.optional(),
    palette: Palette.optional(),
    logo: ImageRef.optional(),
    projectId: Id.optional(),
    dryRun: z
      .boolean()
      .default(false)
      .describe('Quote only: validates and returns the cost; nothing is created or charged.'),
    idempotencyKey: IdempotencyKey.optional(),
    waitSeconds: WaitSeconds,
  }),
  output: z.object({
    mode: z.enum(['quote', 'set']),
    quote: QuoteView.optional(),
    set: SetView.optional(),
    next: z.string(),
  }),
  async run(args, { client, config, signal, extra }) {
    const screens = [];
    for (const s of args.screens) {
      const uploadId = await resolveImageRef(s.screenshot, client, config.root, signal);
      screens.push({ input: { uploadId }, caption: s.caption });
    }
    const logo = args.logo
      ? { uploadId: await resolveImageRef(args.logo, client, config.root, signal) }
      : undefined;
    const body = compact({
      app: args.app,
      screens,
      stores: args.stores.map((s) => compact({ ...s })),
      orientation: args.orientation,
      palette: args.palette,
      logo,
      projectId: args.projectId,
    }) as CreateScreenshotSetRequest;
    if (args.dryRun) {
      const quote = quoteView(await client.screenshotSets.quote(body, { signal }));
      const next = quote.sufficient
        ? 'Call create_screenshot_set again with the same arguments and dryRun false to create it.'
        : 'Not enough credits: buy credits in the console, or use a test key (free).';
      return {
        summary: `This set has ${quote.images} images and would cost ${quote.credits} credits (${quote.environment} key; ${quote.availableCredits} available). ${next}`,
        data: { mode: 'quote' as const, quote, next },
      };
    }
    const created = await client.screenshotSets.create(body, {
      idempotencyKey: args.idempotencyKey,
      signal,
    });
    const job = { kind: 'screenshot_set' as const, value: created };
    const { job: done, waited } = await waitForJob(client, job, args.waitSeconds, extra);
    const set = setView(done.value as ScreenshotSet, waited);
    const cost =
      set.environment === 'test' ? TEST_KEY_NOTE : `${set.creditsCharged} credits charged.`;
    return {
      summary: `Screenshot set ${set.id}: ${set.images} images, ${set.status}. ${cost} ${set.next}`,
      data: { mode: 'set' as const, set, next: set.next },
    };
  },
});
