// SDK objects → the structured outputs of src/schemas.ts (explicit field picks; spec §7.2).
import type {
  CreditBalances,
  Generation,
  Schemas,
  ScreenshotSet,
  ScreenshotSetQuote,
  StoreRequirements,
  Upload,
} from '@draggable/storeshot-sdk';
import type { z } from 'zod/v4';
import type { Environment } from './config.js';
import type {
  DeviceView,
  GenerationView,
  QuoteView,
  RequirementsView,
  SetView,
  UploadView,
  Waited,
} from './schemas.js';

const GENERATION_FINAL = ['succeeded', 'failed', 'canceled'];
const SET_FINAL = ['succeeded', 'partially_failed', 'failed', 'canceled'];
type W = z.infer<typeof Waited>;
type JsonObject = Record<string, unknown>;

export function generationView(g: Generation, waited: W): z.infer<typeof GenerationView> {
  const final = GENERATION_FINAL.includes(g.status);
  const next = !final
    ? `Call get_job_status with id ${g.id} and waitSeconds 50 until final is true.`
    : g.status === 'succeeded'
      ? `Call download_results with id ${g.id} and a folder to save the image.`
      : 'The image did not succeed (refunded with a live key): try generate_screenshot again.';
  return {
    kind: 'generation',
    id: g.id,
    status: g.status,
    final,
    environment: g.environment,
    store: g.store,
    device: g.device,
    width: g.size.width,
    height: g.size.height,
    caption: g.caption ?? null,
    creditsCharged: g.creditsCharged,
    creditsRefunded: g.creditsRefunded,
    imageUrl: g.result?.image.url ?? null,
    thumbnailUrl: g.result?.thumbnail?.url ?? null,
    urlsExpireAt: g.result?.urlsExpireAt ?? null,
    error: g.error ? { code: g.error.code, message: g.error.message } : null,
    screenshotSetId: g.screenshotSet?.id ?? null,
    createdAt: g.createdAt,
    finishedAt: g.finishedAt ?? null,
    waited,
    next,
  };
}

export function setView(s: ScreenshotSet, waited: W): z.infer<typeof SetView> {
  const final = SET_FINAL.includes(s.status);
  const next = !final
    ? `Call get_job_status with id ${s.id} and waitSeconds 50 until final is true.`
    : s.counts.succeeded > 0
      ? `Call download_results with id ${s.id}, a folder and layout "fastlane" (project root) or "store".`
      : 'No image succeeded (refunded with a live key): fix the inputs and create the set again.';
  return {
    kind: 'screenshot_set',
    id: s.id,
    status: s.status,
    final,
    environment: s.environment,
    images: s.images,
    counts: {
      queued: s.counts.queued,
      running: s.counts.running,
      succeeded: s.counts.succeeded,
      failed: s.counts.failed,
      canceled: s.counts.canceled,
    },
    creditsCharged: s.creditsCharged,
    creditsRefunded: s.creditsRefunded,
    children: s.children.map((c) => ({
      position: c.position,
      store: c.store,
      device: c.device,
      featureGraphic: c.featureGraphic,
      generationId: c.generationId,
      status: c.status,
      errorCode: c.error?.code ?? null,
    })),
    previewUrl: s.preview?.thumbnail.url ?? null,
    createdAt: s.createdAt,
    finishedAt: s.finishedAt ?? null,
    waited,
    next,
  };
}

export const quoteView = (q: ScreenshotSetQuote): z.infer<typeof QuoteView> => ({
  environment: q.environment,
  images: q.images,
  credits: q.credits,
  availableCredits: q.availableCredits,
  sufficient: q.sufficient,
  breakdown: q.breakdown.map((b) => ({
    store: b.store,
    device: b.device,
    width: b.size.width,
    height: b.size.height,
    orientation: b.orientation,
    images: b.images,
    defaulted: b.defaulted,
  })),
});

export const uploadView = (u: Upload, path: string): z.infer<typeof UploadView> => ({
  uploadId: u.id,
  status: u.status,
  environment: u.environment,
  contentType: u.contentType,
  bytes: u.bytes,
  width: u.width ?? null,
  height: u.height ?? null,
  orientation: u.orientation ?? null,
  sha256: u.sha256 ?? null,
  expiresAt: u.expiresAt,
  path,
});

export const deviceView = (d: Schemas['Device']): z.infer<typeof DeviceView> => ({
  id: d.id,
  store: d.store,
  kind: d.kind,
  label: d.label,
  deviceHint: d.deviceHint,
  width: d.width,
  height: d.height,
  orientations: [...d.orientations],
  deprecated: d.deprecated ?? false,
  replacedBy: d.replacedBy ?? null,
});

export const requirementsView = (r: StoreRequirements): z.infer<typeof RequirementsView> => ({
  store: r.store,
  name: r.name,
  screenshots: r.screenshots as JsonObject,
  deviceClasses: r.deviceClasses.map((c) => ({
    id: c.id,
    family: c.family,
    label: c.label,
    requirement: c.requirement,
    count: c.count as JsonObject,
    maxFileBytes: c.maxFileBytes ?? null,
    acceptedSizes: (c.acceptedSizes as JsonObject[] | null) ?? null,
    devices: c.devices.map((d) => ({
      id: d.id,
      compliant: d.compliant,
      deprecated: d.deprecated ?? false,
    })),
  })),
  requiredGroups: r.requiredGroups as JsonObject[],
  featureGraphic: (r.featureGraphic as JsonObject | null) ?? null,
  docsUrl: 'https://storeshot.art/docs/api/',
});

export const creditsView = (c: CreditBalances, environment: Environment) => ({
  total: c.total,
  balances: {
    starter: c.balances.starter,
    subscription: c.balances.subscription,
    purchased: c.balances.purchased,
  },
  environment,
  note:
    environment === 'test'
      ? 'Test key: images never spend credits; these are the account balances live keys use.'
      : 'Live key: 1 credit per image.',
});
