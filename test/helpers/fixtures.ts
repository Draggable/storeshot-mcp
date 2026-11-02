/** A Generation as the API returns it (test data). */
export const generation = (status: string, extra: Record<string, unknown> = {}) => ({
  id: '0b8e0000-0000-4000-8000-000000000001',
  status,
  environment: 'test',
  store: 'app_store',
  device: 'app_store_1290x2796',
  size: { width: 1290, height: 2796 },
  caption: null,
  creditsCharged: 0,
  creditsRefunded: 0,
  error: null,
  createdAt: '2026-11-02T10:00:00.000Z',
  finishedAt: status === 'succeeded' ? '2026-11-02T10:00:05.000Z' : null,
  result:
    status === 'succeeded'
      ? {
          image: { url: 'https://s/1.png', contentType: 'image/png', width: 1290, height: 2796 },
          thumbnail: { url: 'https://s/1.webp', contentType: 'image/webp' },
          urlsExpireAt: '2026-11-02T10:15:00.000Z',
          caption: 'Hi',
          palette: [],
        }
      : null,
  ...extra,
});

export const set = (status: string, extra: Record<string, unknown> = {}) => ({
  id: '5c1e0000-0000-4000-8000-000000000001',
  status,
  environment: 'live',
  images: 3,
  counts: { queued: 3, running: 0, succeeded: 0, failed: 0, canceled: 0 },
  creditsCharged: 3,
  creditsRefunded: 0,
  children: [],
  createdAt: '2026-11-02T10:00:00.000Z',
  finishedAt: null,
  ...extra,
});
