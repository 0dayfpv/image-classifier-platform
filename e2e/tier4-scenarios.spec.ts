import { expect, test } from '@playwright/test';
import {
  BLUE_SQUARE_TEST_PNG,
  BLUE_SQUARE_TRAIN_PNGS,
  BLUE_SQUARE_WEBP,
  GREEN_TRIANGLE_JPG,
  GREEN_TRIANGLE_TRAIN_PNGS,
  INVALID_TXT,
  OVERSIZED_CIRCLE_PNG,
  RED_CIRCLE_JPG,
  RED_CIRCLE_TEST_PNG,
  RED_CIRCLE_TRAIN_PNGS,
} from './fixtures/fixturePaths';
import {
  captureModelExportDownloads,
  drawShapeOnCanvas,
  registerZeroErrorHarness,
  withFakeWebcamPage,
} from './helpers/testHarness';
import {
  addLabel,
  assertConfidenceBarsValid,
  assertSvgChartHasEpochPoints,
  configureAndTrainModel,
  createProject,
  drawSamplesInBucket,
  getLabelBucket,
  gotoHome,
  openProjectFromDashboard,
  uploadFilesToBucket,
} from './helpers/workflowActions';

registerZeroErrorHarness();

test.describe('Tier 4 — Real-World End-to-End Application Scenarios', () => {
  test('T4-E2E-01: Geometric Shapes Classifier (Drawing Pad Workflow)', async ({ page }) => {
    await gotoHome(page);
    await expect(page.locator('html')).toHaveAttribute('lang', 'tr');

    await createProject(page, 'Geometrik Şekiller');
    const daireBucket = await addLabel(page, 'Daire');
    const kareBucket = await addLabel(page, 'Kare');

    await drawSamplesInBucket(page, 'Daire', 'circle', 3, 0);
    await drawSamplesInBucket(page, 'Kare', 'square', 3, 0);

    await expect(daireBucket.getByTestId('low-sample-warning')).toContainText('(şu an: 3)');
    await expect(kareBucket.getByTestId('low-sample-warning')).toContainText('(şu an: 3)');

    // Delete 1 sample in Daire (3 -> 2), then complete 5+5 samples
    await daireBucket.getByTestId('delete-sample-btn').first().click();
    await expect(daireBucket.getByTestId('label-sample-count')).toContainText('2 örnek');
    await expect(daireBucket.getByTestId('sample-thumbnail')).toHaveCount(2);

    await drawSamplesInBucket(page, 'Daire', 'circle', 3, 3);
    await drawSamplesInBucket(page, 'Kare', 'square', 2, 3);

    await expect(daireBucket.getByTestId('label-sample-count')).toContainText('5 örnek');
    await expect(kareBucket.getByTestId('label-sample-count')).toContainText('5 örnek');
    await expect(daireBucket.getByTestId('low-sample-warning')).toHaveCount(0);
    await expect(kareBucket.getByTestId('low-sample-warning')).toHaveCount(0);

    // Reload persistence check
    await page.reload();
    if ((await page.getByTestId('project-card').count()) > 0) {
      await expect(
        page.getByTestId('project-card').filter({ hasText: 'Geometrik Şekiller' })
      ).toContainText('2 etiket • 10 örnek');
      await openProjectFromDashboard(page, 'Geometrik Şekiller');
    }
    await expect(getLabelBucket(page, 'Daire').getByTestId('sample-thumbnail')).toHaveCount(5);
    await expect(getLabelBucket(page, 'Kare').getByTestId('sample-thumbnail')).toHaveCount(5);

    // Stage 2: Advanced settings & 5-epoch training
    await configureAndTrainModel(page, { epochs: 5, batchSize: 4 });
    await assertSvgChartHasEpochPoints(page.getByTestId('loss-chart'), 5);
    await assertSvgChartHasEpochPoints(page.getByTestId('accuracy-chart'), 5);

    // Live Test Drawing Pad for circle and square
    await page.getByTestId('live-test-drawing-tab').click();
    await drawShapeOnCanvas(page, 'circle', page.getByTestId('drawing-canvas'), 1);
    await page.getByTestId('live-test-predict-btn').click();
    await assertConfidenceBarsValid(page, 2);

    await page.getByTestId('drawing-clear-btn').click();
    await drawShapeOnCanvas(page, 'square', page.getByTestId('drawing-canvas'), 1);
    await page.getByTestId('live-test-predict-btn').click();
    await assertConfidenceBarsValid(page, 2);
  });

  test('T4-E2E-02: Fruit / Color Image Upload Classifier (Multi-Format & Warning Lifecycle)', async ({
    page,
  }) => {
    await gotoHome(page);
    await createProject(page, 'Meyve Renk Sınıflandırıcı');
    const appleBucket = await addLabel(page, 'Kırmızı Elma');
    const pearBucket = await addLabel(page, 'Yeşil Armut');

    await uploadFilesToBucket(page, 'Kırmızı Elma', [
      RED_CIRCLE_TRAIN_PNGS[0],
      RED_CIRCLE_TRAIN_PNGS[1],
      RED_CIRCLE_JPG,
    ]);
    await uploadFilesToBucket(page, 'Yeşil Armut', [
      GREEN_TRIANGLE_TRAIN_PNGS[0],
      GREEN_TRIANGLE_TRAIN_PNGS[1],
      GREEN_TRIANGLE_JPG,
    ]);

    await expect(appleBucket.getByTestId('label-sample-count')).toContainText('3 örnek');
    await expect(appleBucket.getByTestId('low-sample-warning')).toBeVisible();
    await expect(pearBucket.getByTestId('label-sample-count')).toContainText('3 örnek');
    await expect(pearBucket.getByTestId('low-sample-warning')).toBeVisible();

    // Negative upload guard
    await uploadFilesToBucket(page, 'Kırmızı Elma', INVALID_TXT);
    await expect(page.getByTestId('train-error-banner')).toContainText(
      'Yalnızca JPG, PNG ve WebP görselleri desteklenir.'
    );
    await expect(appleBucket.getByTestId('label-sample-count')).toContainText('3 örnek');

    // Add 2 more valid samples each (including oversized 640x480 normalization check)
    await uploadFilesToBucket(page, 'Kırmızı Elma', [
      RED_CIRCLE_TRAIN_PNGS[2],
      OVERSIZED_CIRCLE_PNG,
    ]);
    await uploadFilesToBucket(page, 'Yeşil Armut', [
      GREEN_TRIANGLE_TRAIN_PNGS[2],
      GREEN_TRIANGLE_TRAIN_PNGS[3],
    ]);

    await expect(appleBucket.getByTestId('label-sample-count')).toContainText('5 örnek');
    await expect(pearBucket.getByTestId('label-sample-count')).toContainText('5 örnek');
    await expect(appleBucket.getByTestId('low-sample-warning')).toHaveCount(0);
    await expect(pearBucket.getByTestId('low-sample-warning')).toHaveCount(0);

    await page.reload();
    if ((await page.getByTestId('project-card').count()) > 0) {
      await openProjectFromDashboard(page, 'Meyve Renk Sınıflandırıcı');
    }
    await expect(getLabelBucket(page, 'Kırmızı Elma').getByTestId('sample-thumbnail')).toHaveCount(5);
    await expect(getLabelBucket(page, 'Yeşil Armut').getByTestId('sample-thumbnail')).toHaveCount(5);

    await configureAndTrainModel(page, { epochs: 4, batchSize: 4 });
    await assertSvgChartHasEpochPoints(page.getByTestId('loss-chart'), 4);

    // Held-out PNG test
    await page.getByTestId('live-test-upload-tab').click();
    await page.getByTestId('live-test-file-input').setInputFiles(RED_CIRCLE_TEST_PNG);
    await page.getByTestId('live-test-predict-btn').click();
    const redBars = await assertConfidenceBarsValid(page, 2);
    expect(redBars[0].text).toContain('Kırmızı Elma');
  });

  test('T4-E2E-03: Turkish-UI Classroom Demo (Full Bilingual TR/EN Journey)', async ({ page }) => {
    await gotoHome(page);
    await expect(page.getByText('Makine Öğrenimi Projeleriniz')).toBeVisible();

    await createProject(page, 'Sınıf Nesneleri');
    await addLabel(page, 'Çiçek');
    await addLabel(page, 'Şişe');
    await addLabel(page, 'Gözlük');

    await uploadFilesToBucket(page, 'Çiçek', RED_CIRCLE_TRAIN_PNGS.slice(0, 2));
    await uploadFilesToBucket(page, 'Şişe', BLUE_SQUARE_TRAIN_PNGS.slice(0, 2));
    await uploadFilesToBucket(page, 'Gözlük', GREEN_TRIANGLE_TRAIN_PNGS.slice(0, 2));

    await expect(getLabelBucket(page, 'Çiçek').getByTestId('low-sample-warning')).toContainText(
      'En az 5 görsel önerilir (şu an: 2)'
    );

    // Switch TR -> EN across all 3 stages
    await page.getByTestId('lang-toggle-en').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByTestId('add-label-btn')).toContainText('+ Add New Label');
    await expect(getLabelBucket(page, 'Şişe').getByTestId('low-sample-warning')).toContainText(
      'At least 5 images recommended (currently: 2)'
    );

    await page.getByTestId('stage-tab-learn').click();
    await page.getByTestId('advanced-settings-toggle').click();
    await expect(page.getByTestId('advanced-settings-toggle')).toContainText('Advanced Settings');
    await expect(page.getByText('Epochs', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('Training Loss')).toBeVisible();

    await page.getByTestId('stage-tab-make').click();
    await expect(page.getByTestId('make-untrained-guard')).toContainText('No trained model yet');

    // Reload preserves EN and Turkish Unicode label names
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    if ((await page.getByTestId('project-card').count()) > 0) {
      await openProjectFromDashboard(page, 'Sınıf Nesneleri');
    }
    await page.getByTestId('stage-tab-train').click();
    await expect(getLabelBucket(page, 'Çiçek')).toBeVisible();
    await expect(getLabelBucket(page, 'Şişe')).toBeVisible();
    await expect(getLabelBucket(page, 'Gözlük')).toBeVisible();

    // Switch back EN -> TR
    await page.getByTestId('lang-toggle-tr').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'tr');
    await expect(page.getByTestId('add-label-btn')).toContainText('+ Yeni Etiket Ekle');
  });

  test('T4-E2E-04: Retrain-to-Improve Iterative ML Workflow', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, 'Gelişen Model');
    await addLabel(page, 'Sınıf A');
    await addLabel(page, 'Sınıf B');
    await uploadFilesToBucket(page, 'Sınıf A', RED_CIRCLE_TRAIN_PNGS.slice(0, 2));
    await uploadFilesToBucket(page, 'Sınıf B', BLUE_SQUARE_TRAIN_PNGS.slice(0, 2));

    await page.getByTestId('stage-tab-learn').click();
    await expect(page.getByTestId('readiness-banner')).toContainText(
      "Bazı sınıflarda 5'ten az görsel var"
    );
    await expect(page.getByTestId('train-model-btn')).toBeEnabled();

    await configureAndTrainModel(page, { epochs: 3, batchSize: 2 });
    await page.getByTestId('live-test-upload-tab').click();
    await page.getByTestId('live-test-file-input').setInputFiles(RED_CIRCLE_TEST_PNG);
    await page.getByTestId('live-test-predict-btn').click();
    await assertConfidenceBarsValid(page, 2);

    // Return to Stage 1: expand dataset and add 3rd class
    await page.getByTestId('stage-tab-train').click();
    await uploadFilesToBucket(page, 'Sınıf A', RED_CIRCLE_TRAIN_PNGS.slice(2, 5));
    await uploadFilesToBucket(page, 'Sınıf B', BLUE_SQUARE_TRAIN_PNGS.slice(2, 5));
    await addLabel(page, 'Sınıf C');
    await uploadFilesToBucket(page, 'Sınıf C', GREEN_TRIANGLE_TRAIN_PNGS.slice(0, 5));

    await page.getByTestId('stage-tab-learn').click();
    await expect(page.getByTestId('stale-model-banner')).toBeVisible();
    await expect(page.getByTestId('train-model-btn')).toContainText('Modeli Yeniden Eğit');

    await configureAndTrainModel(page, { epochs: 4, batchSize: 4 });
    await assertSvgChartHasEpochPoints(page.getByTestId('loss-chart'), 4);

    await page.getByTestId('live-test-upload-tab').click();
    await page.getByTestId('live-test-file-input').setInputFiles(BLUE_SQUARE_TEST_PNG);
    await page.getByTestId('live-test-predict-btn').click();
    await assertConfidenceBarsValid(page, 3);
  });

  test('T4-E2E-05: Interactive Sound/Color/Counter Controller & Model Export (Stage 3 Make)', async ({
    page,
  }) => {
    await gotoHome(page);
    await createProject(page, 'Etkileşimli Kontrolcü');
    await addLabel(page, 'Kırmızı');
    await addLabel(page, 'Mavi');
    await uploadFilesToBucket(page, 'Kırmızı', RED_CIRCLE_TRAIN_PNGS.slice(0, 5));
    await uploadFilesToBucket(page, 'Mavi', [
      ...BLUE_SQUARE_TRAIN_PNGS.slice(0, 4),
      BLUE_SQUARE_WEBP,
    ]);

    await configureAndTrainModel(page, { epochs: 4, batchSize: 4 });
    await page.getByTestId('stage-tab-make').click();

    const redCard = page.getByTestId('reaction-config-card').filter({ hasText: 'Kırmızı' });
    await redCard.getByTestId('reaction-message-input').fill('Kırmızı Algılandı!');
    await redCard.getByTestId('reaction-color-input').fill('#dc2626');
    await redCard.getByTestId('reaction-sound-select').selectOption('chime');
    if (!(await redCard.getByTestId('reaction-counter-toggle').isChecked())) {
      await redCard.getByTestId('reaction-counter-toggle').check();
    }

    const blueCard = page.getByTestId('reaction-config-card').filter({ hasText: 'Mavi' });
    await blueCard.getByTestId('reaction-message-input').fill('Mavi Algılandı!');
    await blueCard.getByTestId('reaction-color-input').fill('#2563eb');
    await blueCard.getByTestId('reaction-sound-select').selectOption('success');
    if (!(await blueCard.getByTestId('reaction-counter-toggle').isChecked())) {
      await blueCard.getByTestId('reaction-counter-toggle').check();
    }

    await page.getByTestId('reaction-threshold-input').fill('50');

    // Trigger via File Upload (Red & Blue)
    await page.getByTestId('make-upload-tab').click();
    await page.getByTestId('make-file-input').setInputFiles(RED_CIRCLE_TEST_PNG);
    await page.getByTestId('make-test-btn').click();
    await expect(page.getByTestId('playground-message')).toContainText('Kırmızı Algılandı!');

    await page.getByTestId('make-file-input').setInputFiles(BLUE_SQUARE_TEST_PNG);
    await page.getByTestId('make-test-btn').click();
    await expect(page.getByTestId('playground-message')).toContainText('Mavi Algılandı!');

    // Reset counters
    await page.getByTestId('reset-counters-btn').click();
    const counters = await page
      .getByTestId('playground-stage')
      .getByTestId('reaction-counter-value')
      .allInnerTexts();
    for (const text of counters) {
      expect(text).toMatch(/\b0\b/);
    }

    // Export model.json + model.weights.bin
    const exported = await captureModelExportDownloads(page);
    expect(exported.modelJson.modelTopology).toBeTruthy();
    expect(exported.weightsBuffer.byteLength).toBeGreaterThan(0);

    // Verify & copy JS/HTML snippet
    const snippet = await page.getByTestId('export-snippet-code').innerText();
    expect(snippet).toContain('tf.loadLayersModel');
    expect(snippet).toMatch(/mobilenet/i);
    expect(snippet).toContain('Kırmızı');
    expect(snippet).toContain('Mavi');

    await page.getByTestId('copy-snippet-btn').click();
    await expect(page.getByTestId('copy-snippet-feedback')).toContainText('Kopyalandı!');
  });

  test('T4-E2E-06: Hardware-Resilient Classroom & Fake-Webcam Burst Workflow', async ({ page }) => {
    // Part A: Camera-less headless context verifies fallback banners across all 3 stages
    await gotoHome(page);
    await createProject(page, 'Donanım Dayanıklılığı');
    const bucketA = await addLabel(page, 'Sınıf 1');
    await addLabel(page, 'Sınıf 2');

    await bucketA.getByTestId('open-webcam-btn').click();
    await expect(page.getByTestId('webcam-error-banner')).toBeVisible();
    await page.getByTestId('webcam-close-btn').click();

    await drawSamplesInBucket(page, 'Sınıf 1', 'circle', 5, 0);
    await uploadFilesToBucket(page, 'Sınıf 2', BLUE_SQUARE_TRAIN_PNGS.slice(0, 5));

    await configureAndTrainModel(page, { epochs: 3, batchSize: 4 });

    await page.getByTestId('live-test-webcam-tab').click();
    const startLiveTest = page.getByRole('button', {
      name: /Canlı Testi Başlat|Start Live Test/i,
    });
    if (await startLiveTest.isVisible()) {
      await startLiveTest.click();
    }
    await expect(page.getByTestId('webcam-error-banner')).toBeVisible();

    await page.getByTestId('stage-tab-make').click();
    await page.getByTestId('make-webcam-tab').click();
    const startLiveCtrl = page.getByRole('button', {
      name: /Canlı Kontrolcüyü Başlat|Start Live Controller/i,
    });
    if (await startLiveCtrl.isVisible()) {
      await startLiveCtrl.click();
    }
    await expect(page.getByTestId('webcam-error-banner')).toBeVisible();

    await page.getByTestId('make-upload-tab').click();
    await page.getByTestId('reaction-threshold-input').fill('0');
    await page.getByTestId('make-file-input').setInputFiles(BLUE_SQUARE_TEST_PNG);
    await page.getByTestId('make-test-btn').click();
    await expect(page.getByTestId('make-status-banner')).toBeVisible();

    // Part B: Fake-camera Chromium context performs single + burst capture, trains, and runs live webcam
    await withFakeWebcamPage(async (camPage) => {
      await gotoHome(camPage);
      await createProject(camPage, 'Sanal Kamera Sınıfı');
      const camBucket = await addLabel(camPage, 'Kamera');
      await addLabel(camPage, 'Kare');

      await camBucket.getByTestId('open-webcam-btn').click();
      await expect(camPage.getByTestId('webcam-capture-btn')).toBeEnabled({ timeout: 15_000 });
      await camPage.waitForFunction(() => {
        const video = document.querySelector('video');
        return Boolean(video && video.readyState >= 2 && video.videoWidth > 0);
      });

      await camPage.getByTestId('webcam-capture-btn').click();
      const burstBtn = camPage.getByTestId('webcam-burst-btn');
      const box = await burstBtn.boundingBox();
      if (!box) throw new Error('webcam-burst-btn boundingBox missing');
      await camPage.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await camPage.mouse.down();
      await camPage.waitForTimeout(650);
      await camPage.mouse.up();
      await camPage.getByTestId('webcam-close-btn').click();

      const countText = await camBucket.getByTestId('label-sample-count').innerText();
      const count = Number.parseInt(countText.match(/\d+/)?.[0] ?? '0', 10);
      expect(count).toBeGreaterThanOrEqual(3);

      await uploadFilesToBucket(camPage, 'Kare', BLUE_SQUARE_TRAIN_PNGS.slice(0, 4));
      await configureAndTrainModel(camPage, { epochs: 3, batchSize: 4 });

      await camPage.getByTestId('live-test-webcam-tab').click();
      const startCamTest = camPage.getByRole('button', {
        name: /Canlı Testi Başlat|Start Live Test/i,
      });
      if (await startCamTest.isVisible()) {
        await startCamTest.click();
      }
      await camPage.waitForTimeout(300);

      await camPage.getByTestId('stage-tab-make').click();
      await camPage.getByTestId('make-webcam-tab').click();
      const startCamMake = camPage.getByRole('button', {
        name: /Canlı Kontrolcüyü Başlat|Start Live Controller/i,
      });
      if (await startCamMake.isVisible()) {
        await startCamMake.click();
      }
      await camPage.waitForTimeout(300);
    });
  });
});
