import { expect, type Locator, type Page } from '@playwright/test';
import {
  drawShapeOnCanvas,
  parseConfidencePercentage,
  type CanvasShape,
} from './testHarness';

export interface ConfidenceBarResult {
  text: string;
  percentage: number;
}

export async function gotoHome(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('nav-home')).toBeVisible();
}

export async function createProject(page: Page, projectName: string): Promise<void> {
  await page.getByTestId('project-create-btn').click();
  await page.getByTestId('project-name-input').fill(projectName);
  await page.getByTestId('project-create-submit').click();
  await expect(page.getByTestId('stage-tab-train')).toBeVisible();
}

export async function openProjectFromDashboard(page: Page, projectName: string): Promise<void> {
  const card = page.getByTestId('project-card').filter({ hasText: projectName });
  await expect(card).toBeVisible();
  await card.getByTestId('project-open-btn').click();
  await expect(page.getByTestId('stage-tab-train')).toBeVisible();
}

export function getLabelBucket(page: Page, labelName: string): Locator {
  return page.getByTestId('label-bucket').filter({
    has: page.getByTestId('label-bucket-name').getByText(labelName, { exact: true }),
  });
}

export async function addLabel(page: Page, labelName: string): Promise<Locator> {
  await page.getByTestId('add-label-btn').click();
  await page.getByTestId('label-name-input').fill(labelName);
  await page.getByTestId('label-create-submit').click();
  const bucket = getLabelBucket(page, labelName);
  await expect(bucket).toBeVisible();
  return bucket;
}

export async function drawSamplesInBucket(
  page: Page,
  labelName: string,
  shape: CanvasShape,
  count: number,
  startVariant = 0
): Promise<void> {
  const bucket = getLabelBucket(page, labelName);
  await bucket.getByTestId('open-drawing-pad-btn').click();
  await expect(page.getByTestId('drawing-canvas')).toBeVisible();

  for (let i = 0; i < count; i += 1) {
    if (i > 0) {
      await page.getByTestId('drawing-clear-btn').click();
    }
    await drawShapeOnCanvas(page, shape, page.getByTestId('drawing-canvas'), startVariant + i);
    await page.getByTestId('drawing-add-sample-btn').click();
  }

  await page.getByTestId('drawing-close-btn').click();
  await expect(page.getByTestId('drawing-canvas')).toBeHidden();
}

export async function uploadFilesToBucket(
  page: Page,
  labelName: string,
  filePaths: string | string[]
): Promise<void> {
  const bucket = getLabelBucket(page, labelName);
  await expect(bucket).toBeVisible();
  await bucket.getByTestId('file-upload-input').setInputFiles(filePaths);
}

export async function ensureAdvancedSettingsExpanded(page: Page): Promise<void> {
  const epochsInput = page.getByTestId('input-epochs');
  if (!(await epochsInput.isVisible())) {
    await page.getByTestId('advanced-settings-toggle').click();
  }
  await expect(epochsInput).toBeVisible();
}

export async function configureAndTrainModel(
  page: Page,
  options: {
    epochs: number;
    batchSize?: number;
    learningRate?: number;
  }
): Promise<void> {
  await page.getByTestId('stage-tab-learn').click();
  await ensureAdvancedSettingsExpanded(page);
  await page.getByTestId('input-epochs').fill(String(options.epochs));
  if (options.batchSize !== undefined) {
    await page.getByTestId('input-batch-size').fill(String(options.batchSize));
  }
  if (options.learningRate !== undefined) {
    await page.getByTestId('input-learning-rate').fill(String(options.learningRate));
  }

  await page.getByTestId('train-model-btn').click();
  await expect(page.getByTestId('training-status')).toContainText(
    /Model Eğitildi ve Hazır|Model Trained & Ready/i,
    { timeout: 60_000 }
  );
}

export async function assertConfidenceBarsValid(
  page: Page,
  expectedClassCount: number
): Promise<ConfidenceBarResult[]> {
  const barsContainer = page.getByTestId('confidence-bars');
  await expect(barsContainer).toBeVisible();
  const bars = barsContainer.getByTestId('confidence-bar');
  await expect(bars).toHaveCount(expectedClassCount);

  const count = await bars.count();
  const results: ConfidenceBarResult[] = [];
  for (let i = 0; i < count; i += 1) {
    const text = (await bars.nth(i).innerText()).trim();
    const percentage = parseConfidencePercentage(text);
    expect(percentage).toBeGreaterThanOrEqual(0);
    expect(percentage).toBeLessThanOrEqual(100);
    results.push({ text, percentage });
  }

  // Verify sorted descending (allow 0.1 rounding tolerance)
  for (let i = 0; i < results.length - 1; i += 1) {
    expect(results[i].percentage + 0.1).toBeGreaterThanOrEqual(results[i + 1].percentage);
  }

  // Verify total confidence sums to ~100% (99.0% - 101.0%)
  const total = results.reduce((sum, item) => sum + item.percentage, 0);
  expect(total).toBeGreaterThanOrEqual(99.0);
  expect(total).toBeLessThanOrEqual(101.0);

  return results;
}

export async function assertSvgChartHasEpochPoints(
  chartLocator: Locator,
  expectedPoints: number
): Promise<void> {
  await expect(chartLocator).toBeVisible();

  const geometry = await chartLocator.evaluate((el) => {
    const svg = el.tagName.toLowerCase() === 'svg' ? el : el.querySelector('svg');
    if (!svg) {
      return { hasSvg: false, circles: 0, nonEmptyPaths: 0 };
    }
    const circles = svg.querySelectorAll('circle').length;
    const paths = Array.from(svg.querySelectorAll('path, polyline')).map(
      (node) => node.getAttribute('d') ?? node.getAttribute('points') ?? ''
    );
    const nonEmptyPaths = paths.filter((val) => val.trim().length > 0).length;
    return { hasSvg: true, circles, nonEmptyPaths };
  });

  expect(geometry.hasSvg).toBe(true);
  expect(geometry.nonEmptyPaths).toBeGreaterThan(0);
  if (geometry.circles > 0) {
    expect(geometry.circles).toBeGreaterThanOrEqual(expectedPoints);
  }
}
