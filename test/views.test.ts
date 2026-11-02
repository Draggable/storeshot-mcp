import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { inputPath } from '../scripts/inputs.mjs';
import {
  GenerationView,
  QuoteView,
  RequirementsView,
  SetView,
  UploadView,
} from '../src/schemas.js';
import { generationView, quoteView, requirementsView, setView, uploadView } from '../src/views.js';
import { generation } from './helpers/fixtures.js';

const S = JSON.parse(readFileSync(inputPath('contract'), 'utf8')).components.schemas;
const waited = { seconds: 0, timedOut: false };

describe('views (spec §7.2)', () => {
  test('a succeeded generation: final, URLs, next = download_results', () => {
    const v = generationView(generation('succeeded') as never, waited);
    expect(GenerationView.parse(v)).toEqual(v);
    expect(v).toMatchObject({ final: true, imageUrl: 'https://s/1.png', screenshotSetId: null });
    expect(v.next).toMatch(/download_results/);
  });

  test('a failed generation of a set', () => {
    const g = generation('failed', {
      error: { code: 'GENERATION_FAILED', message: 'no' },
      screenshotSet: { id: 'set', position: 2, attempt: 1 },
    });
    const v = generationView(g as never, waited);
    expect(v).toMatchObject({
      final: true,
      error: { code: 'GENERATION_FAILED' },
      screenshotSetId: 'set',
    });
    expect(v.next).toMatch(/refunded/);
  });

  test('the contract examples: upload, quote, requirements', () => {
    const u = uploadView(S.Upload.example, '/abs/shot.png');
    expect(UploadView.parse(u)).toEqual(u);
    const quote = {
      dryRun: true,
      environment: 'live',
      images: 1,
      credits: 1,
      availableCredits: 0,
      sufficient: false,
      screens: 1,
      breakdown: [
        {
          store: 'app_store',
          device: 'd',
          size: { width: 1, height: 2 },
          orientation: 'portrait',
          images: 1,
          defaulted: true,
        },
      ],
    };
    const q = quoteView(quote as never);
    expect(QuoteView.parse(q)).toEqual(q);
    const req = {
      store: 'google_play',
      name: 'Google Play',
      screenshots: { formats: ['image/png'] },
      deviceClasses: [
        {
          id: 'phone',
          family: 'phone',
          label: 'Phone',
          requirement: 'required',
          count: { min: 2, max: 8 },
          maxFileBytes: null,
          acceptedSizes: null,
          rules: {},
          sources: [],
          devices: [{ id: 'google_play_1080x1920', compliant: true, issues: [] }],
        },
      ],
      requiredGroups: [{ id: 'phone' }],
      featureGraphic: { width: 1024, height: 500 },
      sources: [],
    };
    const r = requirementsView(req as never);
    expect(RequirementsView.parse(r)).toEqual(r);
    expect(r.deviceClasses[0].devices).toEqual([
      { id: 'google_play_1080x1920', compliant: true, deprecated: false },
    ]);
  });

  test('a running set: not final, next = get_job_status', () => {
    const set = {
      id: 's1',
      status: 'running',
      environment: 'live',
      images: 2,
      counts: { queued: 1, running: 1, succeeded: 0, failed: 0, canceled: 0 },
      creditsCharged: 2,
      creditsRefunded: 0,
      children: [
        {
          position: 1,
          store: 'app_store',
          device: 'd',
          size: { width: 1, height: 2 },
          featureGraphic: false,
          generationId: 'g',
          attempt: 1,
          status: 'running',
          error: null,
        },
      ],
      createdAt: 'c',
      finishedAt: null,
      preview: null,
    };
    const v = setView(set as never, waited);
    expect(SetView.parse(v)).toEqual(v);
    expect(v).toMatchObject({ final: false, previewUrl: null });
    expect(v.next).toMatch(/get_job_status/);
  });
});
