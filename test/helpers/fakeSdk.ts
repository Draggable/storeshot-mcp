import { vi } from 'vitest';

export interface Linked {
  apiKey: string;
  keyId: string;
  scopes: string[];
  environment: 'test' | 'live';
}
export interface LinkControl {
  resolve(value: Linked): void;
  reject(error: Error): void;
  calls: Record<string, unknown>[];
}

/** createClient(apiKey) for AuthSession: key-less clients link through `control`. */
export function fakeClientFactory() {
  const control: LinkControl = { resolve: () => {}, reject: () => {}, calls: [] };
  const created: (string | null)[] = [];
  const createClient = vi.fn((apiKey: string | null) => {
    created.push(apiKey);
    if (apiKey !== null) return { apiKeyForTests: apiKey };
    return {
      auth: {
        linkAccount: (options: { onCode: (c: unknown) => void; signal?: AbortSignal }) => {
          control.calls.push(options as Record<string, unknown>);
          options.onCode({
            userCode: 'BCDF-GHJK',
            verificationUri: 'https://console.storeshot.art/device',
            verificationUriComplete: 'https://console.storeshot.art/device?code=BCDF-GHJK',
            expiresIn: 600,
          });
          return new Promise((resolve, reject) => {
            control.resolve = resolve;
            control.reject = reject;
            options.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          });
        },
      },
    };
  });
  return { createClient, control, created };
}
