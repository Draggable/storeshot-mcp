// zod (v4 API) output schemas shared by the views and the tools (spec §7.2). Emitted objects are
// closed (additionalProperties: false), so views pick exactly these fields.
import { z } from 'zod/v4';

export const Store = z.enum(['app_store', 'google_play']);
export const Environment = z.enum(['test', 'live']);
export const Json = z.record(z.string(), z.unknown());
const isoOrNull = z.string().nullable();

export const Waited = z.object({ seconds: z.number().int().min(0), timedOut: z.boolean() });

export const GenerationView = z.object({
  kind: z.literal('generation'),
  id: z.string(),
  status: z.string(),
  final: z.boolean(),
  environment: Environment,
  store: Store,
  device: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  caption: z.string().nullable(),
  creditsCharged: z.number().int(),
  creditsRefunded: z.number().int(),
  imageUrl: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  urlsExpireAt: isoOrNull,
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
  screenshotSetId: z.string().nullable(),
  createdAt: z.string(),
  finishedAt: isoOrNull,
  waited: Waited,
  next: z.string(),
});

export const SetView = z.object({
  kind: z.literal('screenshot_set'),
  id: z.string(),
  status: z.string(),
  final: z.boolean(),
  environment: Environment,
  images: z.number().int(),
  counts: z.object({
    queued: z.number().int(),
    running: z.number().int(),
    succeeded: z.number().int(),
    failed: z.number().int(),
    canceled: z.number().int(),
  }),
  creditsCharged: z.number().int(),
  creditsRefunded: z.number().int(),
  children: z.array(
    z.object({
      position: z.number().int(),
      store: Store,
      device: z.string(),
      featureGraphic: z.boolean(),
      generationId: z.string(),
      status: z.string(),
      errorCode: z.string().nullable(),
    }),
  ),
  previewUrl: z.string().nullable(),
  createdAt: z.string(),
  finishedAt: isoOrNull,
  waited: Waited,
  next: z.string(),
});

export const QuoteView = z.object({
  environment: Environment,
  images: z.number().int(),
  credits: z.number().int(),
  availableCredits: z.number().int(),
  sufficient: z.boolean(),
  breakdown: z.array(
    z.object({
      store: Store,
      device: z.string(),
      width: z.number().int(),
      height: z.number().int(),
      orientation: z.string(),
      images: z.number().int(),
      defaulted: z.boolean(),
    }),
  ),
});

export const UploadView = z.object({
  uploadId: z.string(),
  status: z.string(),
  environment: Environment,
  contentType: z.string(),
  bytes: z.number().int(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  orientation: z.string().nullable(),
  sha256: z.string().nullable(),
  expiresAt: z.string(),
  path: z.string(),
});

export const DeviceView = z.object({
  id: z.string(),
  store: Store,
  kind: z.string(),
  label: z.string(),
  deviceHint: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  orientations: z.array(z.string()),
  deprecated: z.boolean(),
  replacedBy: z.string().nullable(),
});

export const RequirementsView = z.object({
  store: Store,
  name: z.string(),
  screenshots: Json,
  deviceClasses: z.array(
    z.object({
      id: z.string(),
      family: z.string(),
      label: z.string(),
      requirement: z.string(),
      count: Json,
      maxFileBytes: z.number().int().nullable(),
      acceptedSizes: z.array(Json).nullable(),
      devices: z.array(
        z.object({ id: z.string(), compliant: z.boolean(), deprecated: z.boolean() }),
      ),
    }),
  ),
  requiredGroups: z.array(Json),
  featureGraphic: Json.nullable(),
  docsUrl: z.string(),
});

export const DownloadedFile = z.object({
  path: z.string(),
  relativePath: z.string(),
  bytes: z.number().int(),
  sha256: z.string(),
  store: Store.nullable(),
  device: z.string().nullable(),
  position: z.number().int().nullable(),
});

export const MissingImage = z.object({
  store: Store.nullable(),
  device: z.string().nullable(),
  position: z.number().int().nullable(),
  status: z.string(),
  errorCode: z.string().nullable(),
});
