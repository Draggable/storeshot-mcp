import { z } from 'zod/v4';
import { FREE } from '../credits.js';
import { readImageFile } from '../files/readImage.js';
import { UploadView } from '../schemas.js';
import { uploadView } from '../views.js';
import { defineTool } from './define.js';
import { LocalPath } from './inputs.js';

export const uploadScreenshot = defineTool({
  name: 'upload_screenshot',
  title: 'Upload a screenshot',
  description: [
    'Uploads one raw app screenshot from a local file (PNG, JPEG or WebP, at most 20 MiB) and returns its uploadId.',
    'When to use: once per raw screenshot before create_screenshot_set or generate_screenshot (both also accept { path } and upload for you). Only image files are sent; anything else is refused before upload.',
    `${FREE} Uploads count towards the account upload quota and are deleted after 30 days.`,
  ].join('\n'),
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  needsAuth: true,
  input: z.strictObject({ path: LocalPath }),
  output: UploadView,
  async run(args, { client, config, signal }) {
    const file = await readImageFile(args.path, { root: config.root });
    const upload = await client.uploads.create(
      { file: file.data, filename: file.filename, contentType: file.contentType },
      { signal },
    );
    const data = uploadView(upload, file.path);
    const size = `${data.width ?? '?'}×${data.height ?? '?'} ${file.contentType.slice(6).toUpperCase()}`;
    return {
      summary: `Uploaded ${file.filename} (${size}) as ${data.uploadId}; expires ${data.expiresAt}. Use it in generate_screenshot or create_screenshot_set.`,
      data,
    };
  },
});
