import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { ServerNotification, ServerRequest } from '@modelcontextprotocol/sdk/types.js';

export type Extra = RequestHandlerExtra<ServerRequest, ServerNotification>;

/** Spec §7.4: progress every `everyMs` while waiting, only when the client sent a token. */
export function startHeartbeat(
  extra: Extra,
  label: string,
  totalSeconds: number,
  everyMs = 5000,
): { stop(): void } {
  const token = extra._meta?.progressToken;
  if (token === undefined || totalSeconds <= 0) return { stop() {} };
  const started = Date.now();
  let last = 0;
  const timer = setInterval(() => {
    const progress = Math.min(totalSeconds, Math.round((Date.now() - started) / 1000));
    if (progress <= last) return; // the spec requires an increasing value
    last = progress;
    extra
      .sendNotification({
        method: 'notifications/progress',
        params: { progressToken: token, progress, total: totalSeconds, message: label },
      })
      .catch(() => undefined);
  }, everyMs);
  timer.unref?.();
  return { stop: () => clearInterval(timer) };
}
