import type { Storeshot } from '@draggable/storeshot-sdk';
import { StoreshotError } from '@draggable/storeshot-sdk';
import type { Config, Environment } from '../config.js';
import { McpToolError, type KeySource } from '../errors.js';
import type { Logger } from '../stdout.js';
import type { CredentialStore } from './store.js';

export type LinkState = 'not_started' | 'pending' | 'linked' | 'expired' | 'denied' | 'failed';
export interface LinkStatus {
  status: LinkState;
  source: KeySource | null;
  /** The key's environment once linked; before that STORESHOT_ENVIRONMENT (or null). */
  environment: Environment | null;
  keyId: string | null;
  scopes: string[];
  verificationUri: string | null;
  verificationUriComplete: string | null;
  userCode: string | null;
  expiresAt: string | null;
  credentialsFile: string | null;
  reason: string | null;
}
interface Pending {
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresAt: string;
}
export interface SessionDeps {
  config: Config;
  store: CredentialStore | null;
  log: Logger;
  createClient: (apiKey: string | null) => Storeshot;
  /** Live list the logger scrubs: every key is pushed once known. */
  secrets?: string[];
  now?: () => number;
}

/** The device-flow `client_name` (shown to the approving human as an unverified label). */
export const CLIENT_NAME = 'Storeshot MCP';
const hhmm = (iso: string) => `${iso.slice(11, 16)} UTC`;
const environmentOf = (apiKey: string): Environment =>
  apiKey.startsWith('ss_live_') ? 'live' : 'test';

/** Spec §6: env key → stored key → one shared SS-019 device flow, polled in the background. */
export class AuthSession {
  private keyed: Storeshot | null = null;
  private source: KeySource | null = null;
  private keyEnvironment: Environment | null = null;
  private keyId: string | null = null;
  private scopes: string[] = [];
  private state: LinkState = 'not_started';
  private pending: Pending | null = null;
  private reason: string | null = null;
  private codeReady: Promise<void> | null = null;
  private readonly abort = new AbortController();

  constructor(private readonly deps: SessionDeps) {}

  get keySource(): KeySource | null {
    return this.source;
  }

  private useKey(apiKey: string, source: KeySource, keyId: string | null, scopes: string[]) {
    this.keyed = this.deps.createClient(apiKey);
    this.deps.secrets?.push(apiKey);
    this.source = source;
    this.keyEnvironment = environmentOf(apiKey);
    this.keyId = keyId;
    this.scopes = scopes;
    this.state = 'linked';
    this.pending = null;
  }

  /** The keyed SDK client, or a throw telling the agent what to show its human. */
  async client(): Promise<Storeshot> {
    const { config, store } = this.deps;
    if (this.keyed) return this.keyed;
    if (config.apiKey) {
      this.useKey(config.apiKey, 'env', null, []);
      return this.keyed!;
    }
    // Re-read every time: another MCP process may have linked meanwhile.
    const stored = store?.read(config.baseUrl, config.environment);
    if (stored) {
      this.useKey(stored.apiKey, 'stored', stored.keyId, stored.scopes);
      return this.keyed!;
    }
    if (this.state === 'pending' && this.pending) throw this.linkError('ACCOUNT_LINK_PENDING');
    await this.startFlow();
    if (this.keyed) return this.keyed;
    throw this.linkError('ACCOUNT_LINK_REQUIRED');
  }

  private startFlow(): Promise<void> {
    if (this.codeReady && this.state === 'pending') return this.codeReady;
    const previous = ['expired', 'denied', 'failed'].includes(this.state) ? this.state : null;
    this.state = 'pending';
    this.pending = null;
    let shown!: () => void;
    this.codeReady = new Promise<void>((ok) => (shown = ok));
    const { config, log } = this.deps;
    this.deps
      .createClient(null)
      .auth.linkAccount({
        clientName: CLIENT_NAME,
        // Amendment A2: only an explicit STORESHOT_ENVIRONMENT is sent; else the approver decides.
        ...(config.environment ? { environment: config.environment } : {}),
        signal: this.abort.signal,
        onCode: (code) => {
          const now = this.deps.now?.() ?? Date.now();
          const expiresAt = new Date(now + code.expiresIn * 1000).toISOString();
          this.pending = {
            userCode: code.userCode,
            verificationUri: code.verificationUri,
            verificationUriComplete: code.verificationUriComplete,
            expiresAt,
          };
          this.reason = previous
            ? `The previous code ${previous === 'expired' ? 'expired' : previous === 'denied' ? 'was denied' : 'failed'}.`
            : null;
          log(
            `Link Storeshot: open ${code.verificationUriComplete} and confirm the code ${code.userCode} (expires ${hhmm(expiresAt)}).`,
          );
          shown();
        },
      })
      .then((linked) => {
        this.useKey(linked.apiKey, 'device', linked.keyId, linked.scopes);
        const store = this.deps.store;
        store?.write({
          baseUrl: config.baseUrl,
          environment: linked.environment,
          apiKey: linked.apiKey,
          keyId: linked.keyId,
          scopes: linked.scopes,
          createdAt: new Date(this.deps.now?.() ?? Date.now()).toISOString(),
        });
        log(
          `Linked (${linked.environment} key ${linked.keyId})${store ? `; stored in ${store.file}` : ' (not stored)'}.`,
        );
      })
      .catch((error: unknown) => {
        if (this.abort.signal.aborted) return;
        const code = error instanceof StoreshotError ? error.code : '';
        this.state =
          code === 'DEVICE_CODE_EXPIRED'
            ? 'expired'
            : code === 'DEVICE_ACCESS_DENIED'
              ? 'denied'
              : 'failed';
        this.reason = error instanceof Error ? error.message : String(error);
        this.codeReady = null;
        shown();
        log(`Account link ${this.state}: ${this.reason}`);
      });
    return this.codeReady;
  }

  private linkError(code: 'ACCOUNT_LINK_REQUIRED' | 'ACCOUNT_LINK_PENDING'): McpToolError {
    const p = this.pending;
    if (!p) {
      return new McpToolError(
        code,
        `Account linking could not start: ${this.reason ?? 'unknown error'}.`,
        'Check STORESHOT_BASE_URL and the network, then retry; or set STORESHOT_API_KEY.',
      );
    }
    const why = code === 'ACCOUNT_LINK_REQUIRED' && this.reason ? `${this.reason} ` : '';
    return new McpToolError(
      code,
      `${why}Storeshot is not linked yet. Ask the user to open ${p.verificationUriComplete} and confirm the code ${p.userCode} (expires ${hhmm(p.expiresAt)}).`,
      'Show this link and code to the user. When they have approved, call link_status or retry this tool.',
      {
        verificationUri: p.verificationUri,
        verificationUriComplete: p.verificationUriComplete,
        userCode: p.userCode,
        expiresAt: p.expiresAt,
      },
    );
  }

  /** A stored key was rejected (401): forget it so the next call links again (spec §6 step 3). */
  invalidate(): void {
    if (this.source !== 'stored' || !this.keyEnvironment) return;
    this.deps.store?.remove(this.deps.config.baseUrl, this.keyEnvironment);
    this.keyed = null;
    this.source = null;
    this.keyEnvironment = null;
    this.keyId = null;
    this.scopes = [];
    this.state = 'not_started';
  }

  status(): LinkStatus {
    const { config, store } = this.deps;
    const envKey = config.apiKey !== null;
    const p = this.pending;
    return {
      status: envKey ? 'linked' : this.state,
      source: envKey ? 'env' : this.source,
      environment: this.keyEnvironment ?? config.environment,
      keyId: this.keyId,
      scopes: this.scopes,
      verificationUri: p?.verificationUri ?? null,
      verificationUriComplete: p?.verificationUriComplete ?? null,
      userCode: p?.userCode ?? null,
      expiresAt: p?.expiresAt ?? null,
      credentialsFile: store && !envKey ? store.file : null,
      reason: this.reason,
    };
  }

  close(): void {
    this.abort.abort();
  }
}
