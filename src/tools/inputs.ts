import type { Storeshot } from '@draggable/storeshot-sdk';
import { z } from 'zod/v4';
import { readImageFile } from '../files/readImage.js';

export const Id = z
  .string()
  .regex(/^[0-9a-fA-F-]{36}$/, 'a Storeshot id (36 characters)')
  .describe('A Storeshot id.');
export const LocalPath = z
  .string()
  .min(1)
  .max(4096)
  .describe('Absolute path of a local PNG, JPEG or WebP file.');
export const ImageRef = z.union([
  z.strictObject({ uploadId: Id.describe('An upload_screenshot result.') }),
  z.strictObject({ path: LocalPath }),
]);
export const WaitSeconds = z
  .number()
  .int()
  .min(0)
  .max(300)
  .default(0)
  .describe(
    'Wait up to this many seconds for the job to finish (0 = return at once). Most clients time out a tool call after about 60 s unless they reset on progress: prefer 50 or less and call get_job_status again.',
  );
export const IdempotencyKey = z
  .string()
  .regex(/^[\x21-\x7e]{1,255}$/)
  .describe(
    'Optional: repeating a call with the same key and arguments returns the first job instead of creating another.',
  );
export const Palette = z
  .array(
    z.strictObject({
      hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
      name: z.string().min(1).max(40),
    }),
  )
  .min(1)
  .max(8);
export const App = z.strictObject({
  name: z.string().min(1).max(100),
  description: z.string().max(2000).optional(),
});
export const Orientation = z.enum(['portrait', 'landscape']);

/** `{ path }` → uploaded first (one createUpload); `{ uploadId }` passes through. */
export async function resolveImageRef(
  ref: z.infer<typeof ImageRef>,
  client: Storeshot,
  root: string | null,
  signal: AbortSignal,
): Promise<string> {
  if ('uploadId' in ref) return ref.uploadId;
  const file = await readImageFile(ref.path, { root });
  const upload = await client.uploads.create(
    { file: file.data, filename: file.filename, contentType: file.contentType },
    { signal },
  );
  return upload.id;
}

/** Drops undefined keys (the API bodies are `additionalProperties: false`). */
export const compact = <T extends Record<string, unknown>>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
