import type { Generation, ScreenshotSet } from '@draggable/storeshot-sdk';
import { z } from 'zod/v4';
import { FREE } from '../credits.js';
import { GenerationView, SetView } from '../schemas.js';
import { generationView, setView } from '../views.js';
import { defineTool } from './define.js';
import { Id, WaitSeconds } from './inputs.js';
import { fetchJob, waitForJob } from './jobs.js';

export const getJobStatus = defineTool({
  name: 'get_job_status',
  title: 'Job status',
  description: [
    'Returns the status of a generation or a screenshot set by id: status, final, image counts, credits charged and refunded, result URLs (signed, they expire after 15 minutes) and per-image errors.',
    'When to use: after generate_screenshot or create_screenshot_set, until final is true; then download_results. Pass waitSeconds to wait here (progress notifications are sent when your client asks for them).',
    FREE,
  ].join('\n'),
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  needsAuth: true,
  input: z.strictObject({
    id: Id,
    kind: z
      .enum(['generation', 'screenshot_set'])
      .optional()
      .describe('Absent: looked up as a set, then as a generation.'),
    waitSeconds: WaitSeconds,
  }),
  output: z.object({
    kind: z.enum(['generation', 'screenshot_set']),
    generation: GenerationView.optional(),
    screenshotSet: SetView.optional(),
    next: z.string(),
  }),
  async run(args, { client, signal, extra }) {
    const first = await fetchJob(client, args.id, args.kind, signal);
    const { job, waited } = await waitForJob(client, first, args.waitSeconds, extra);
    if (job.kind === 'generation') {
      const generation = generationView(job.value as Generation, waited);
      return {
        summary: `Generation ${generation.id}: ${generation.status}. ${generation.next}`,
        data: { kind: 'generation' as const, generation, next: generation.next },
      };
    }
    const screenshotSet = setView(job.value as ScreenshotSet, waited);
    const c = screenshotSet.counts;
    return {
      summary: `Screenshot set ${screenshotSet.id}: ${screenshotSet.status} (${c.succeeded}/${screenshotSet.images} succeeded, ${c.failed} failed). ${screenshotSet.next}`,
      data: { kind: 'screenshot_set' as const, screenshotSet, next: screenshotSet.next },
    };
  },
});
