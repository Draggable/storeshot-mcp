// Credit costs shown in tool descriptions (spec §7.3). The single number is pinned to the
// contract's **Credits.** paragraphs (test/credits.test.ts) and, in the monorepo, to the price list
// (test/monorepo/pricing.test.ts); descriptions are built from these strings only.
export const CREDITS_PER_IMAGE = 1;

export const FREE = 'Credits: free, no credits.';
export const TEST_KEYS =
  'Test keys (ss_test_…) never spend credits and return sample images of the exact size.';
/** Added to the summary of results made with a test key (amendment A2: no default implied). */
export const TEST_KEY_NOTE = 'Test key: sample images, no credits spent.';
export const GENERATION_COST = `Credits: ${CREDITS_PER_IMAGE} credit with a live key (ss_live_…), charged when the job is created and refunded automatically if it fails or is canceled before it starts. ${TEST_KEYS}`;
export const SET_COST = `Credits: ${CREDITS_PER_IMAGE} credit per image with a live key: screens × devices, +1 per feature graphic, all charged at create or none (INSUFFICIENT_CREDITS). dryRun: true quotes for free. Failed or canceled images are refunded. ${TEST_KEYS}`;

/** The contract operations behind each tool. */
export const TOOL_OPERATIONS = {
  get_store_requirements: ['listStores', 'getStoreRequirements'],
  list_devices: ['listDevices'],
  upload_screenshot: ['createUpload'],
  generate_screenshot: ['createUpload', 'createGeneration', 'getGeneration'],
  create_screenshot_set: ['createUpload', 'createScreenshotSet', 'getScreenshotSet'],
  get_job_status: ['getScreenshotSet', 'getGeneration'],
  download_results: ['getScreenshotSetArchive', 'getGeneration'],
  get_credits: ['getCredits'],
  link_status: ['createDeviceAuthorization', 'createDeviceToken'],
} as const;

export const PAID_TOOLS: readonly string[] = ['generate_screenshot', 'create_screenshot_set'];
