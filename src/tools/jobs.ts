import type { Generation, ScreenshotSet, Storeshot } from '@draggable/storeshot-sdk';
import { StoreshotError } from '@draggable/storeshot-sdk';
import { startHeartbeat, type Extra } from '../progress.js';

export type Job =
  | { kind: 'generation'; value: Generation }
  | { kind: 'screenshot_set'; value: ScreenshotSet };

/** Without `kind`: a set first, then a generation on 404 (spec §7.2). */
export async function fetchJob(
  client: Storeshot,
  id: string,
  kind: Job['kind'] | undefined,
  signal: AbortSignal,
): Promise<Job> {
  if (kind !== 'generation') {
    try {
      return { kind: 'screenshot_set', value: await client.screenshotSets.get(id, { signal }) };
    } catch (error) {
      const notFound = error instanceof StoreshotError && error.status === 404;
      if (kind === 'screenshot_set' || !notFound) throw error;
    }
  }
  return { kind: 'generation', value: await client.generations.get(id, { signal }) };
}

/** Spec §7.4: the SDK waiters, bounded by `waitSeconds`; WAIT_TIMEOUT is not an error. */
export async function waitForJob(
  client: Storeshot,
  job: Job,
  waitSeconds: number,
  extra: Extra,
): Promise<{ job: Job; waited: { seconds: number; timedOut: boolean } }> {
  if (waitSeconds <= 0) return { job, waited: { seconds: 0, timedOut: false } };
  const started = Date.now();
  const label = `Waiting for ${job.kind === 'generation' ? 'generation' : 'screenshot set'} ${job.value.id}`;
  const heartbeat = startHeartbeat(extra, label, waitSeconds);
  const options = { timeoutMs: waitSeconds * 1000, signal: extra.signal };
  try {
    const done: Job =
      job.kind === 'generation'
        ? { kind: 'generation', value: await client.waitForGeneration(job.value, options) }
        : { kind: 'screenshot_set', value: await client.waitForScreenshotSet(job.value, options) };
    return {
      job: done,
      waited: { seconds: Math.round((Date.now() - started) / 1000), timedOut: false },
    };
  } catch (error) {
    if (!(error instanceof StoreshotError) || error.code !== 'WAIT_TIMEOUT') throw error;
    const latest = await fetchJob(client, job.value.id, job.kind, extra.signal);
    return { job: latest, waited: { seconds: waitSeconds, timedOut: true } };
  } finally {
    heartbeat.stop();
  }
}
