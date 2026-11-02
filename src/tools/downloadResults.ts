import { randomBytes } from 'node:crypto';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { json } from 'node:stream/consumers';
import type { Generation } from '@draggable/storeshot-sdk';
import { z } from 'zod/v4';
import { FREE } from '../credits.js';
import { McpToolError } from '../errors.js';
import {
  MAX_ARCHIVE_BYTES,
  MAX_RESULT_BYTES,
  fetchSignedUrl,
  isLoopbackUrl,
  saveStreamCapped,
} from '../files/download.js';
import { ARCHIVE_LIMITS, openZip } from '../files/unzip.js';
import { TreeWriter, type WrittenFile } from '../files/writeTree.js';
import { DownloadedFile, MissingImage } from '../schemas.js';
import { defineTool, type ToolContext } from './define.js';
import { Id } from './inputs.js';
import { fetchJob } from './jobs.js';

const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};
const MAX_MANIFEST_BYTES = 1024 * 1024;
type StoreName = 'app_store' | 'google_play';
interface Manifest {
  files?: { path: string; store?: string; device?: string; position?: number }[];
  missing?: {
    store?: string;
    device?: string;
    position?: number;
    status: string;
    errorCode?: string | null;
  }[];
  complete?: boolean;
}
const asStore = (value: string | undefined): StoreName | null =>
  value === 'app_store' || value === 'google_play' ? value : null;
const unsafe = (message: string) =>
  new McpToolError('UNSAFE_ARCHIVE', message, 'Report this to support@storeshot.art.');

const Layout = z.enum(['store', 'fastlane']);
const Output = z.object({
  kind: z.enum(['generation', 'screenshot_set']),
  id: z.string(),
  folder: z.string(),
  layout: Layout,
  files: z.array(DownloadedFile),
  complete: z.boolean(),
  missing: z.array(MissingImage),
  imageUrls: z.array(z.string()),
});
type Data = z.infer<typeof Output>;

async function saveGeneration(
  g: Generation,
  writer: TreeWriter,
  ctx: ToolContext,
  layout: Data['layout'],
) {
  if (!g.result) {
    throw new McpToolError(
      'NO_RESULT',
      `Generation ${g.id} has no result (${g.status}).`,
      'Wait with get_job_status until it succeeded.',
    );
  }
  const ext = EXT[g.result.image.contentType];
  if (!ext) throw unsafe(`Unexpected content type ${g.result.image.contentType}.`);
  const name = `${g.id}.${ext}`;
  await writer.preflight([name]);
  const bytes = await fetchSignedUrl(g.result.image.url, {
    allowLoopbackHttp: isLoopbackUrl(ctx.config.baseUrl),
    maxBytes: MAX_RESULT_BYTES,
    signal: ctx.signal,
  });
  const file = await writer.write(name, bytes);
  const data: Data = {
    kind: 'generation',
    id: g.id,
    folder: writer.folder,
    layout,
    files: [
      { ...file, store: g.store, device: g.device, position: g.screenshotSet?.position ?? null },
    ],
    complete: true,
    missing: [],
    imageUrls: [g.result.image.url],
  };
  return { summary: `Saved ${file.path}.`, data };
}

async function saveSet(id: string, writer: TreeWriter, ctx: ToolContext, layout: Data['layout']) {
  const temp = path.join(writer.folder, `.storeshot-${randomBytes(6).toString('hex')}.zip.part`);
  try {
    const stream = await ctx.client.screenshotSets.archiveStream(id, {
      layout,
      signal: ctx.signal,
    });
    await saveStreamCapped(stream, temp, MAX_ARCHIVE_BYTES);
    const zip = await openZip(temp, ARCHIVE_LIMITS);
    try {
      const manifestEntry = zip.entries.find((e) => e.name === 'manifest.json');
      const entries = zip.entries.filter((e) => !e.directory && e !== manifestEntry);
      if (manifestEntry && manifestEntry.size > MAX_MANIFEST_BYTES) {
        throw unsafe('manifest.json is too large.');
      }
      const manifest = (manifestEntry ? await json(await zip.open(manifestEntry)) : {}) as Manifest;
      await writer.preflight(entries.map((e) => e.name));
      const written: WrittenFile[] = [];
      for (const entry of entries)
        written.push(await writer.write(entry.name, await zip.open(entry)));
      const meta = new Map((manifest.files ?? []).map((f) => [f.path, f]));
      const files = written.map((f) => {
        const m = meta.get(f.relativePath);
        return {
          ...f,
          store: asStore(m?.store),
          device: m?.device ?? null,
          position: m?.position ?? null,
        };
      });
      const missing = (manifest.missing ?? []).map((m) => ({
        store: asStore(m.store),
        device: m.device ?? null,
        position: m.position ?? null,
        status: m.status,
        errorCode: m.errorCode ?? null,
      }));
      const complete = manifest.complete ?? missing.length === 0;
      const tail =
        layout === 'fastlane'
          ? ' Run `fastlane deliver` / `fastlane supply` from that folder (supply replaces the screenshots of the folders it uploads).'
          : '';
      const gap = complete ? '' : ` (${missing.length} images missing)`;
      const data: Data = {
        kind: 'screenshot_set',
        id,
        folder: writer.folder,
        layout,
        files,
        complete,
        missing,
        imageUrls: [],
      };
      return { summary: `Saved ${files.length} files under ${writer.folder}${gap}.${tail}`, data };
    } finally {
      zip.close();
    }
  } finally {
    await rm(temp, { force: true });
  }
}

export const downloadResults = defineTool({
  name: 'download_results',
  title: 'Download images to a folder',
  description: [
    'Saves the finished images of a screenshot set (or of one generation) into a local folder and returns the absolute file paths. Sets: layout "store" (<store>/<device>/NN.png) or "fastlane" (fastlane/screenshots/en-US/… and fastlane/metadata/android/en-US/images/…; pass the project root as folder).',
    'When to use: once get_job_status says final (or to save what succeeded so far: complete tells you). Existing files are never replaced unless overwrite is true; files of an earlier download that this one lacks are left in place. Nothing is written outside the folder, and never through symbolic links.',
    FREE,
  ].join('\n'),
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  needsAuth: true,
  input: z.strictObject({
    id: Id,
    kind: z.enum(['generation', 'screenshot_set']).optional(),
    folder: z
      .string()
      .min(1)
      .max(4096)
      .describe('Absolute path of the folder to write into (created if missing).'),
    layout: Layout.default('store').describe('Sets only.'),
    overwrite: z.boolean().default(false),
  }),
  output: Output,
  async run(args, ctx) {
    const writer = await TreeWriter.open(args.folder, {
      root: ctx.config.root,
      overwrite: args.overwrite,
    });
    try {
      const job = await fetchJob(ctx.client, args.id, args.kind, ctx.signal);
      return job.kind === 'generation'
        ? await saveGeneration(job.value as Generation, writer, ctx, args.layout)
        : await saveSet(args.id, writer, ctx, args.layout);
    } catch (error) {
      await writer.rollback();
      throw error;
    }
  },
});
