import { expect, test } from '@playwright/test';
import {
  BLUE_SQUARE_TRAIN_PNGS,
  BLUE_SQUARE_WEBP,
  GREEN_TRIANGLE_TRAIN_PNGS,
  RED_CIRCLE_TEST_PNG,
  RED_CIRCLE_TRAIN_PNGS,
} from './fixtures/fixturePaths';
import {
  captureModelExportDownloads,
  drawShapeOnCanvas,
  registerZeroErrorHarness,
} from './helpers/testHarness';
import {
  addLabel,
  assertConfidenceBarsValid,
  configureAndTrainModel,
  createProject,
  drawSamplesInBucket,
  getLabelBucket,
  gotoHome,
  openProjectFromDashboard,
  uploadFilesToBucket,
} from './helpers/workflowActions';

registerZeroErrorHarness();

test.describe('Tier 3 — Cross-Feature Pairwise Combinations', () => {
  test('T3-COMB-01: TR/EN Toggle + Workspace State + Reload Persistence', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, 'Bilingual Test');
    await addLabel(page, 'Elma');
    await addLabel(page, 'Armut');
    await drawSamplesInBucket(page, 'Elma', 'circle', 3, 0);
    await uploadFilesToBucket(page, 'Armut', BLUE_SQUARE_TRAIN_PNGS.slice(0, 3));

    await page.getByTestId('lang-toggle-en').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(getLabelBucket(page, 'Elma').getByTestId('low-sample-warning')).toContainText(
      'At least 5 images recommended (currently: 3)'
    );

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    if ((await page.getByTestId('project-card').count()) > 0) {
      const card = page.getByTestId('project-card').filter({ hasText: 'Bilingual Test' });
      await expect(card).toContainText('2 labels • 6 samples');
      await openProjectFromDashboard(page, 'Bilingual Test');
    }

    await expect(getLabelBucket(page, 'Elma').getByTestId('label-sample-count')).toContainText(
      '3 samples'
    );
    await expect(getLabelBucket(page, 'Armut').getByTestId('label-sample-count')).toContainText(
      '3 samples'
    );
    await expect(getLabelBucket(page, 'Armut').getByTestId('low-sample-warning')).toContainText(
      'At least 5 images recommended (currently: 3)'
    );
  });

  test('T3-COMB-02: Drawing Pad + File Upload Mixed Buckets -> Train -> Cross-Mode Inference', async ({
    page,
  }) => {
    await gotoHome(page);
    await createProject(page, 'Karma Veri');
    await addLabel(page, 'Kırmızı');
    await addLabel(page, 'Mavi');

    await drawSamplesInBucket(page, 'Kırmızı', 'circle', 2, 0);
    await uploadFilesToBucket(page, 'Kırmızı', RED_CIRCLE_TRAIN_PNGS.slice(0, 3));

    await uploadFilesToBucket(page, 'Mavi', [
      BLUE_SQUARE_TRAIN_PNGS[0],
      BLUE_SQUARE_TRAIN_PNGS[1],
      BLUE_SQUARE_WEBP,
    ]);
    await drawSamplesInBucket(page, 'Mavi', 'square', 2, 0);

    await expect(getLabelBucket(page, 'Kırmızı').getByTestId('label-sample-count')).toContainText(
      '5 örnek'
    );
    await expect(getLabelBucket(page, 'Mavi').getByTestId('label-sample-count')).toContainText(
      '5 örnek'
    );

    await configureAndTrainModel(page, { epochs: 4, batchSize: 4 });

    await page.getByTestId('live-test-upload-tab').click();
    await page.getByTestId('live-test-file-input').setInputFiles(RED_CIRCLE_TEST_PNG);
    await page.getByTestId('live-test-predict-btn').click();
    await assertConfidenceBarsValid(page, 2);

    await page.getByTestId('live-test-drawing-tab').click();
    await drawShapeOnCanvas(page, 'square', page.getByTestId('drawing-canvas'), 1);
    await page.getByTestId('live-test-predict-btn').click();
    await assertConfidenceBarsValid(page, 2);
  });

  test('T3-COMB-03: Train 2 Classes -> Add 3rd Class -> Stale Banner -> Retrain', async ({
    page,
  }) => {
    await gotoHome(page);
    await createProject(page, 'Üçüncü Sınıf Ekleme');
    await addLabel(page, 'Daire');
    await addLabel(page, 'Kare');
    await uploadFilesToBucket(page, 'Daire', RED_CIRCLE_TRAIN_PNGS.slice(0, 5));
    await uploadFilesToBucket(page, 'Kare', BLUE_SQUARE_TRAIN_PNGS.slice(0, 5));

    await configureAndTrainModel(page, { epochs: 3, batchSize: 4 });

    await page.getByTestId('stage-tab-train').click();
    await addLabel(page, 'Üçgen');
    await uploadFilesToBucket(page, 'Üçgen', GREEN_TRIANGLE_TRAIN_PNGS.slice(0, 4));

    await page.getByTestId('stage-tab-learn').click();
    await expect(page.getByTestId('dataset-summary')).toContainText('3');
    await expect(page.getByTestId('stale-model-banner')).toBeVisible();
    await expect(page.getByTestId('train-model-btn')).toContainText('Modeli Yeniden Eğit');

    await configureAndTrainModel(page, { epochs: 4, batchSize: 4 });

    await page.getByTestId('live-test-upload-tab').click();
    await page.getByTestId('live-test-file-input').setInputFiles(RED_CIRCLE_TEST_PNG);
    await page.getByTestId('live-test-predict-btn').click();

    const bars = await assertConfidenceBarsValid(page, 3);
    const allText = bars.map((b) => b.text).join(' ');
    expect(allText).toContain('Daire');
    expect(allText).toContain('Kare');
    expect(allText).toContain('Üçgen');
  });

  test('T3-COMB-04: Train 3 Classes -> Delete Samples & Delete Label -> Retrain -> Stage 3 Sync', async ({
    page,
  }) => {
    await gotoHome(page);
    await createProject(page, 'Sınıf Silme Senkron');
    await addLabel(page, 'Kırmızı');
    await addLabel(page, 'Mavi');
    await addLabel(page, 'Yeşil');
    await uploadFilesToBucket(page, 'Kırmızı', RED_CIRCLE_TRAIN_PNGS.slice(0, 5));
    await uploadFilesToBucket(page, 'Mavi', BLUE_SQUARE_TRAIN_PNGS.slice(0, 5));
    await uploadFilesToBucket(page, 'Yeşil', GREEN_TRIANGLE_TRAIN_PNGS.slice(0, 5));

    await configureAndTrainModel(page, { epochs: 3, batchSize: 4 });

    await page.getByTestId('stage-tab-train').click();
    await getLabelBucket(page, 'Kırmızı').getByTestId('delete-sample-btn').first().click();
    await expect(getLabelBucket(page, 'Kırmızı').getByTestId('label-sample-count')).toContainText(
      '4 örnek'
    );

    await getLabelBucket(page, 'Yeşil').getByTestId('label-delete-btn').click();
    await page.getByTestId('confirm-dialog-confirm').click();
    await expect(getLabelBucket(page, 'Yeşil')).toHaveCount(0);

    await configureAndTrainModel(page, { epochs: 3, batchSize: 4 });
    await page.getByTestId('stage-tab-make').click();

    const cards = page.getByTestId('reaction-config-card');
    await expect(cards).toHaveCount(2);
    await expect(cards.filter({ hasText: 'Kırmızı' })).toHaveCount(1);
    await expect(cards.filter({ hasText: 'Mavi' })).toHaveCount(1);
    await expect(cards.filter({ hasText: 'Yeşil' })).toHaveCount(0);
  });

  test('T3-COMB-05: Custom Hyperparameters + Make Reactions + Threshold + Reset + Export', async ({
    page,
  }) => {
    await gotoHome(page);
    await createProject(page, 'Tam Akış Kombinasyon');
    await addLabel(page, 'Kırmızı');
    await addLabel(page, 'Mavi');
    await uploadFilesToBucket(page, 'Kırmızı', RED_CIRCLE_TRAIN_PNGS.slice(0, 5));
    await uploadFilesToBucket(page, 'Mavi', BLUE_SQUARE_TRAIN_PNGS.slice(0, 5));

    await configureAndTrainModel(page, { epochs: 4, batchSize: 4, learningRate: 0.002 });
    await page.getByTestId('stage-tab-make').click();

    const redCard = page.getByTestId('reaction-config-card').filter({ hasText: 'Kırmızı' });
    await redCard.getByTestId('reaction-message-input').fill('Kırmızı Tetiklendi');
    await redCard.getByTestId('reaction-color-input').fill('#ef4444');
    await redCard.getByTestId('reaction-sound-select').selectOption('success');
    if (!(await redCard.getByTestId('reaction-counter-toggle').isChecked())) {
      await redCard.getByTestId('reaction-counter-toggle').check();
    }

    const blueCard = page.getByTestId('reaction-config-card').filter({ hasText: 'Mavi' });
    await blueCard.getByTestId('reaction-message-input').fill('Mavi Tetiklendi');
    await blueCard.getByTestId('reaction-color-input').fill('#3b82f6');
    await blueCard.getByTestId('reaction-sound-select').selectOption('beep');
    if (!(await blueCard.getByTestId('reaction-counter-toggle').isChecked())) {
      await blueCard.getByTestId('reaction-counter-toggle').check();
    }

    await page.getByTestId('reaction-threshold-input').fill('50');
    await page.getByTestId('make-upload-tab').click();
    await page.getByTestId('make-file-input').setInputFiles(RED_CIRCLE_TEST_PNG);
    await page.getByTestId('make-test-btn').click();
    await page.getByTestId('make-test-btn').click();

    const counters = page.getByTestId('playground-stage').getByTestId('reaction-counter-value');
    const textsBeforeReset = await counters.allInnerTexts();
    expect(textsBeforeReset.some((t) => /\b2\b/.test(t))).toBe(true);

    await page.getByTestId('reset-counters-btn').click();
    for (const t of await counters.allInnerTexts()) {
      expect(t).toMatch(/\b0\b/);
    }

    const exported = await captureModelExportDownloads(page);
    expect(exported.weightsBuffer.byteLength).toBeGreaterThan(0);

    const snippet = await page.getByTestId('export-snippet-code').innerText();
    expect(snippet).toContain('Kırmızı');
    expect(snippet).toContain('Mavi');
  });

  test('T3-COMB-06: Multi-Project IndexedDB Isolation', async ({ page }) => {
    await gotoHome(page);

    await createProject(page, 'Şekiller');
    await addLabel(page, 'Daire');
    await addLabel(page, 'Kare');
    await uploadFilesToBucket(page, 'Daire', RED_CIRCLE_TRAIN_PNGS.slice(0, 2));
    await uploadFilesToBucket(page, 'Kare', BLUE_SQUARE_TRAIN_PNGS.slice(0, 2));
    await page.getByTestId('nav-home').click();

    await createProject(page, 'Renkler');
    await addLabel(page, 'Kırmızı');
    await addLabel(page, 'Mavi');
    await addLabel(page, 'Yeşil');
    await uploadFilesToBucket(page, 'Kırmızı', RED_CIRCLE_TRAIN_PNGS.slice(0, 2));
    await uploadFilesToBucket(page, 'Mavi', BLUE_SQUARE_TRAIN_PNGS.slice(0, 2));
    await uploadFilesToBucket(page, 'Yeşil', GREEN_TRIANGLE_TRAIN_PNGS.slice(0, 2));
    await page.getByTestId('nav-home').click();

    const shapesCard = page.getByTestId('project-card').filter({ hasText: 'Şekiller' });
    await shapesCard.getByTestId('project-delete-btn').click();
    await page.getByTestId('confirm-dialog-confirm').click();

    await page.reload();
    await expect(page.getByTestId('project-card').filter({ hasText: 'Şekiller' })).toHaveCount(0);
    const colorsCard = page.getByTestId('project-card').filter({ hasText: 'Renkler' });
    await expect(colorsCard).toContainText('3 etiket • 6 örnek');

    await openProjectFromDashboard(page, 'Renkler');
    await expect(getLabelBucket(page, 'Kırmızı').getByTestId('label-sample-count')).toContainText(
      '2 örnek'
    );
    await expect(getLabelBucket(page, 'Mavi').getByTestId('label-sample-count')).toContainText(
      '2 örnek'
    );
    await expect(getLabelBucket(page, 'Yeşil').getByTestId('label-sample-count')).toContainText(
      '2 örnek'
    );
  });
});
