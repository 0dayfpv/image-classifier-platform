import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import {
  chromium,
  expect,
  test,
  type Browser,
  type BrowserContext,
  type ConsoleMessage,
  type Download,
  type Locator,
  type Page,
  type Request,
  type Response,
} from '@playwright/test';

export type CanvasShape = 'circle' | 'square' | 'triangle' | 'stroke';

export interface ZeroErrorHarnessOptions {
  /** Fail on `requestfailed` events (default: true, ignoring net::ERR_ABORTED unless in /models/). */
  failOnRequestFailed?: boolean;
  /** Optional URL regexes allowed to fail network requests (default: none). */
  allowedFailedUrlPatterns?: RegExp[];
}

export interface PageErrorCollector {
  consoleErrors: string[];
  pageErrors: string[];
  requestFailures: string[];
  detach: () => void;
}

export interface VerifiedExportDownloads {
  jsonFileName: string;
  weightsFileName: string;
  modelJson: {
    format?: string;
    modelTopology: Record<string, unknown>;
    weightsManifest: Array<{
      paths: string[];
      weights: Array<{ name: string; shape: number[]; dtype: string }>;
    }>;
  };
  weightsBuffer: Buffer;
  expectedWeightsBytes: number;
}

const collectors = new WeakMap<Page, PageErrorCollector>();

export function attachErrorCollectors(
  page: Page,
  options: ZeroErrorHarnessOptions = {}
): PageErrorCollector {
  const failOnRequestFailed = options.failOnRequestFailed ?? true;
  const allowedPatterns = options.allowedFailedUrlPatterns ?? [];

  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const requestFailures: string[] = [];

  const onConsole = (msg: ConsoleMessage): void => {
    if (msg.type() === 'error') {
      const loc = msg.location();
      const where = loc?.url ? ` (${loc.url}:${loc.lineNumber ?? 0})` : '';
      consoleErrors.push(`[console.error] ${msg.text()}${where}`);
    }
  };

  const onPageError = (err: Error): void => {
    pageErrors.push(`[pageerror] ${err.stack ?? err.message}`);
  };

  const onRequestFailed = (req: Request): void => {
    if (!failOnRequestFailed) return;
    const url = req.url();
    if (allowedPatterns.some((re) => re.test(url))) return;
    const errorText = req.failure()?.errorText ?? 'unknown';
    if (errorText === 'net::ERR_ABORTED' && !url.includes('/models/')) {
      return;
    }
    requestFailures.push(`[requestfailed] ${req.method()} ${url} -> ${errorText}`);
  };

  const onResponse = (res: Response): void => {
    if (res.status() >= 400 && res.url().includes('/models/')) {
      requestFailures.push(`[model-http-${res.status()}] ${res.url()}`);
    }
  };

  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('requestfailed', onRequestFailed);
  page.on('response', onResponse);

  const collector: PageErrorCollector = {
    consoleErrors,
    pageErrors,
    requestFailures,
    detach: () => {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
      page.off('requestfailed', onRequestFailed);
      page.off('response', onResponse);
    },
  };

  collectors.set(page, collector);
  return collector;
}

export function assertNoRecordedErrors(page: Page): void {
  const collector = collectors.get(page);
  if (!collector) return;

  const all = [
    ...collector.consoleErrors,
    ...collector.pageErrors,
    ...collector.requestFailures,
  ];
  expect(
    all,
    `Expected zero console/page/request errors, but captured:\n${all.join('\n')}`
  ).toEqual([]);
}

/**
 * Registers Playwright beforeEach/afterEach hooks on the current file/describe suite
 * so every test starts with zero-error listeners and fails in afterEach on any error.
 */
export function registerZeroErrorHarness(options: ZeroErrorHarnessOptions = {}): void {
  test.beforeEach(async ({ page }) => {
    attachErrorCollectors(page, options);
  });

  test.afterEach(async ({ page }) => {
    const collector = collectors.get(page);
    try {
      assertNoRecordedErrors(page);
    } finally {
      collector?.detach();
      collectors.delete(page);
    }
  });
}

/**
 * Creates an isolated fresh BrowserContext + Page (separate IndexedDB & localStorage)
 * with zero-error collectors attached. Caller must close via returned handle.
 */
export async function createIsolatedContext(
  browser: Browser,
  options: ZeroErrorHarnessOptions & { baseURL?: string } = {}
): Promise<{ context: BrowserContext; page: Page; dispose: () => Promise<void> }> {
  const context = await browser.newContext({
    baseURL: options.baseURL ?? 'http://127.0.0.1:4173',
  });
  const page = await context.newPage();
  const collector = attachErrorCollectors(page, options);

  return {
    context,
    page,
    dispose: async () => {
      try {
        assertNoRecordedErrors(page);
      } finally {
        collector.detach();
        collectors.delete(page);
        await context.close();
      }
    },
  };
}

/**
 * Launches a dedicated headless Chromium context with Chromium's fake camera stream
 * for testing webcam capture & burst mode cleanly without physical hardware.
 */
export async function withFakeWebcamPage<T>(
  fn: (page: Page) => Promise<T>,
  baseURL = 'http://127.0.0.1:4173'
): Promise<T> {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-webgl',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ],
  });

  const context = await browser.newContext({
    baseURL,
    permissions: ['camera'],
  });
  const page = await context.newPage();
  const collector = attachErrorCollectors(page);

  try {
    const result = await fn(page);
    assertNoRecordedErrors(page);
    return result;
  } finally {
    collector.detach();
    collectors.delete(page);
    await context.close();
    await browser.close();
  }
}

/**
 * Draws a deterministic geometric shape on the Drawing Pad `<canvas>` using real
 * `page.mouse` pointer events inside its visible bounding box.
 */
export async function drawShapeOnCanvas(
  page: Page,
  shape: CanvasShape,
  canvasLocator?: Locator,
  variantIndex = 0
): Promise<void> {
  const canvas = canvasLocator ?? page.getByTestId('drawing-canvas');
  await expect(canvas).toBeVisible();

  const box = await canvas.boundingBox();
  if (!box || box.width < 40 || box.height < 40) {
    throw new Error(`Drawing canvas bounding box is missing or too small: ${JSON.stringify(box)}`);
  }

  const minDim = Math.min(box.width, box.height);
  const offsetX = ((variantIndex % 3) - 1) * minDim * 0.03;
  const offsetY = ((Math.floor(variantIndex / 3) % 2) * 2 - 1) * minDim * 0.025;
  const scale = 0.9 + (variantIndex % 4) * 0.04;
  const cx = box.x + box.width / 2 + offsetX;
  const cy = box.y + box.height / 2 + offsetY;

  const tracePoints = async (points: Array<{ x: number; y: number }>, stepsPerSegment = 6) => {
    const first = points[0];
    await page.mouse.move(first.x, first.y);
    await page.mouse.down();
    for (let i = 1; i < points.length; i += 1) {
      await page.mouse.move(points[i].x, points[i].y, { steps: stepsPerSegment });
    }
    await page.mouse.up();
  };

  if (shape === 'stroke') {
    await tracePoints(
      [
        { x: cx - minDim * 0.25, y: cy - minDim * 0.25 },
        { x: cx + minDim * 0.25, y: cy + minDim * 0.25 },
      ],
      10
    );
  } else if (shape === 'circle') {
    const r = minDim * 0.28 * scale;
    const segments = 24;
    const pts: Array<{ x: number; y: number }> = [];
    for (let i = 0; i <= segments; i += 1) {
      const theta = (i / segments) * Math.PI * 2;
      pts.push({ x: cx + Math.cos(theta) * r, y: cy + Math.sin(theta) * r });
    }
    await tracePoints(pts, 2);
  } else if (shape === 'square') {
    const half = minDim * 0.27 * scale;
    await tracePoints(
      [
        { x: cx - half, y: cy - half },
        { x: cx + half, y: cy - half },
        { x: cx + half, y: cy + half },
        { x: cx - half, y: cy + half },
        { x: cx - half, y: cy - half },
      ],
      6
    );
    await tracePoints(
      [
        { x: cx - half * 0.65, y: cy },
        { x: cx + half * 0.65, y: cy },
      ],
      6
    );
  } else {
    // triangle
    const r = minDim * 0.30 * scale;
    const top = { x: cx, y: cy - r };
    const bottomRight = { x: cx + r * 0.9, y: cy + r * 0.72 };
    const bottomLeft = { x: cx - r * 0.9, y: cy + r * 0.72 };
    await tracePoints([top, bottomRight, bottomLeft, top], 8);
  }

  await page.waitForTimeout(40);
}

async function readDownloadBuffer(download: Download): Promise<Buffer> {
  const failure = await download.failure();
  if (failure) {
    throw new Error(`Download failed for ${download.suggestedFilename()}: ${failure}`);
  }
  const filePath = await download.path();
  if (filePath) {
    return readFile(filePath);
  }
  const stream = await download.createReadStream();
  if (!stream) {
    throw new Error(`No path or readable stream for download: ${download.suggestedFilename()}`);
  }
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Triggers model export and captures both `model.json` and `model.weights.bin` downloads
 * via predicate-filtered `Promise.all([page.waitForEvent('download', ...)])`, reading and
 * validating JSON structure + non-zero `.bin` byte count against `weightsManifest`.
 */
export async function captureModelExportDownloads(
  page: Page,
  triggerAction: () => Promise<void> = () => page.getByTestId('export-model-btn').click()
): Promise<VerifiedExportDownloads> {
  const [jsonDownload, weightsDownload] = await Promise.all([
    page.waitForEvent('download', (d) => d.suggestedFilename().toLowerCase().endsWith('.json')),
    page.waitForEvent('download', (d) => d.suggestedFilename().toLowerCase().endsWith('.bin')),
    triggerAction(),
  ]);

  const [jsonBuf, weightsBuffer] = await Promise.all([
    readDownloadBuffer(jsonDownload),
    readDownloadBuffer(weightsDownload),
  ]);

  const modelJson = JSON.parse(jsonBuf.toString('utf8')) as VerifiedExportDownloads['modelJson'];

  expect(modelJson.modelTopology).toBeTruthy();
  expect(typeof modelJson.modelTopology).toBe('object');
  expect(Array.isArray(modelJson.weightsManifest)).toBe(true);
  expect(modelJson.weightsManifest.length).toBeGreaterThan(0);

  const manifestEntry = modelJson.weightsManifest[0];
  expect(manifestEntry.paths).toContain(weightsDownload.suggestedFilename());
  expect(Array.isArray(manifestEntry.weights)).toBe(true);
  expect(manifestEntry.weights.length).toBeGreaterThan(0);

  const expectedWeightsBytes = manifestEntry.weights.reduce((sum, spec) => {
    const elems = spec.shape.reduce((acc, dim) => acc * dim, 1);
    const bytesPerElem = spec.dtype === 'bool' ? 1 : 4;
    return sum + elems * bytesPerElem;
  }, 0);

  expect(weightsBuffer.byteLength).toBeGreaterThan(0);
  expect(weightsBuffer.byteLength).toBe(expectedWeightsBytes);

  return {
    jsonFileName: jsonDownload.suggestedFilename(),
    weightsFileName: weightsDownload.suggestedFilename(),
    modelJson,
    weightsBuffer,
    expectedWeightsBytes,
  };
}

/**
 * Parses percentage strings in both Turkish (`%85.2` / `%85,2`) and English (`85.2%`) formats.
 * Anchors directly to the `%` symbol so digits inside class names (e.g. `Sınıf 1`) are never misread.
 */
export function parseConfidencePercentage(text: string): number {
  const cleaned = text.trim();
  const match = cleaned.match(/%\s*(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s*%/);
  const raw = match?.[1] ?? match?.[2];
  if (!raw) {
    throw new Error(`Could not parse confidence percentage from "${text}"`);
  }
  return Number.parseFloat(raw.replace(',', '.'));
}
