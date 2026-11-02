import { createScreenshotSet } from './createScreenshotSet.js';
import type { ToolSpec } from './define.js';
import { downloadResults } from './downloadResults.js';
import { generateScreenshot } from './generateScreenshot.js';
import { getCredits } from './getCredits.js';
import { getJobStatus } from './getJobStatus.js';
import { getStoreRequirements } from './getStoreRequirements.js';
import { linkStatus } from './linkStatus.js';
import { listDevices } from './listDevices.js';
import { uploadScreenshot } from './uploadScreenshot.js';

/** Order = the typical flow (spec §7.1); pinned by test/__snapshots__/tools.json. */
export const TOOLS = [
  getStoreRequirements,
  listDevices,
  uploadScreenshot,
  generateScreenshot,
  createScreenshotSet,
  getJobStatus,
  downloadResults,
  getCredits,
  linkStatus,
] as unknown as ToolSpec[];
