import { expect, test } from '@playwright/test';
import {
  BLUE_SQUARE_TRAIN_PNGS,
  BLUE_SQUARE_WEBP,
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

test.describe('Tier 1 — Area A: Project Dashboard & IndexedDB Persistence', () => {
  test('T1-DASH-01: Empty Dashboard State', async ({ page }) => {
    await gotoHome(page);

    await expect(page.getByTestId('dashboard-empty-state')).toBeVisible();
    await expect(page.getByText('Henüz projeniz yok')).toBeVisible();
    await expect(page.getByText('Başlamak için ilk projenizi oluşturun!')).toBeVisible();
    await expect(page.getByTestId('project-card')).toHaveCount(0);

    const createBtn = page.getByTestId('project-create-btn');
    await expect(createBtn).toBeVisible();
    await expect(createBtn).toBeEnabled();
  });

  test('T1-DASH-02: Create Project via Modal', async ({ page }) => {
    await gotoHome(page);

    await createProject(page, 'Meyve Tanıyıcı');
    await expect(page.getByTestId('nav-project-title')).toContainText('Meyve Tanıyıcı');

    await page.getByTestId('nav-home').click();
    const cards = page.getByTestId('project-card');
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText('Meyve Tanıyıcı');
    await expect(cards.first()).toContainText('0 etiket • 0 örnek');
    await expect(cards.first()).toContainText('Henüz Eğitilmedi');
  });

  test('T1-DASH-03: Multiple Projects Listing', async ({ page }) => {
    await gotoHome(page);

    await createProject(page, 'Proje Bir');
    await addLabel(page, 'Sınıf A');
    await page.getByTestId('nav-home').click();

    await createProject(page, 'Proje İki');
    await page.getByTestId('nav-home').click();

    const cards = page.getByTestId('project-card');
    await expect(cards).toHaveCount(2);

    const cardOne = cards.filter({ hasText: 'Proje Bir' });
    const cardTwo = cards.filter({ hasText: 'Proje İki' });
    await expect(cardOne).toContainText('1 etiket • 0 örnek');
    await expect(cardTwo).toContainText('0 etiket • 0 örnek');
  });

  test('T1-DASH-04: Open Project & Navigate Home', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, 'Meyve Tanıyıcı');
    await page.getByTestId('nav-home').click();

    await openProjectFromDashboard(page, 'Meyve Tanıyıcı');
    await expect(page.getByTestId('nav-project-title')).toContainText('Meyve Tanıyıcı');
    await expect(page.getByTestId('stage-tab-train')).toBeVisible();
    await expect(page.getByTestId('stage-tab-learn')).toBeVisible();
    await expect(page.getByTestId('stage-tab-make')).toBeVisible();

    await page.getByTestId('nav-home').click();
    await expect(page.getByTestId('project-card').filter({ hasText: 'Meyve Tanıyıcı' })).toBeVisible();
  });

  test('T1-DASH-05: Delete Project with Confirmation', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, 'Silinecek Proje');
    await page.getByTestId('nav-home').click();

    const card = page.getByTestId('project-card').filter({ hasText: 'Silinecek Proje' });
    await expect(card).toBeVisible();
    await card.getByTestId('project-delete-btn').click();

    await expect(page.getByTestId('confirm-dialog-confirm')).toBeVisible();
    await expect(page.getByText(/Silinecek Proje/)).toBeVisible();
    await page.getByTestId('confirm-dialog-confirm').click();

    await expect(page.getByTestId('project-card')).toHaveCount(0);
    await expect(page.getByTestId('dashboard-empty-state')).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('project-card')).toHaveCount(0);
    await expect(page.getByTestId('dashboard-empty-state')).toBeVisible();
  });

  test('T1-DASH-06: Full IndexedDB Persistence Across Reload', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, 'Kalıcı Proje');
    await addLabel(page, 'Elma');
    await addLabel(page, 'Armut');
    await drawSamplesInBucket(page, 'Elma', 'circle', 2, 0);
    await drawSamplesInBucket(page, 'Armut', 'square', 2, 0);

    await page.reload();

    if (await page.getByTestId('project-card').count() > 0) {
      const card = page.getByTestId('project-card').filter({ hasText: 'Kalıcı Proje' });
      await expect(card).toContainText('2 etiket • 4 örnek');
      await openProjectFromDashboard(page, 'Kalıcı Proje');
    } else {
      await page.getByTestId('nav-home').click();
      await expect(page.getByTestId('project-card').filter({ hasText: 'Kalıcı Proje' })).toContainText(
        '2 etiket • 4 örnek'
      );
      await openProjectFromDashboard(page, 'Kalıcı Proje');
    }

    const elmaBucket = getLabelBucket(page, 'Elma');
    const armutBucket = getLabelBucket(page, 'Armut');
    await expect(elmaBucket.getByTestId('label-sample-count')).toContainText('2 örnek');
    await expect(elmaBucket.getByTestId('sample-thumbnail')).toHaveCount(2);
    await expect(armutBucket.getByTestId('label-sample-count')).toContainText('2 örnek');
    await expect(armutBucket.getByTestId('sample-thumbnail')).toHaveCount(2);
  });
});

test.describe('Tier 1 — Area B: TR/EN Localization & Navigation', () => {
  test('T1-I18N-01: Turkish Default UI', async ({ page }) => {
    await gotoHome(page);

    await expect(page.locator('html')).toHaveAttribute('lang', 'tr');
    await expect(page.getByText('Görsel Sınıflandırıcı Stüdyosu')).toBeVisible();
    await expect(page.getByText('Makine Öğrenimi Projeleriniz')).toBeVisible();
    await expect(page.getByTestId('project-create-btn')).toContainText('+ Yeni Proje Oluştur');
    await expect(page.getByText('Yerel Depolama (IndexedDB)')).toBeVisible();
  });

  test('T1-I18N-02: Toggle TR -> EN on Dashboard', async ({ page }) => {
    await gotoHome(page);
    await page.getByTestId('lang-toggle-en').click();

    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByText('Image Classifier Studio')).toBeVisible();
    await expect(page.getByText('Your Machine Learning Projects')).toBeVisible();
    await expect(page.getByTestId('project-create-btn')).toContainText('+ Create New Project');
    await expect(page.getByText('You have no projects yet')).toBeVisible();
  });

  test('T1-I18N-03: Toggle TR <-> EN Across All 3 Stages', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, 'Dil Testi');
    await addLabel(page, 'Kırmızı');
    await addLabel(page, 'Mavi');
    await uploadFilesToBucket(page, 'Kırmızı', RED_CIRCLE_TRAIN_PNGS.slice(0, 5));
    await uploadFilesToBucket(page, 'Mavi', BLUE_SQUARE_TRAIN_PNGS.slice(0, 5));

    await configureAndTrainModel(page, { epochs: 3, batchSize: 4 });

    // Stage 1 TR <-> EN
    await page.getByTestId('stage-tab-train').click();
    await expect(page.getByTestId('stage-tab-train')).toContainText('1. Eğit');
    await expect(page.getByTestId('add-label-btn')).toContainText('+ Yeni Etiket Ekle');
    await page.getByTestId('lang-toggle-en').click();
    await expect(page.getByTestId('stage-tab-train')).toContainText('1. Train');
    await expect(page.getByTestId('add-label-btn')).toContainText('+ Add New Label');

    // Stage 2 EN <-> TR
    await page.getByTestId('stage-tab-learn').click();
    await expect(page.getByTestId('stage-tab-learn')).toContainText('2. Learn & Test');
    await expect(page.getByTestId('train-model-btn')).toContainText(/Train Model|Retrain Model/);
    await page.getByTestId('lang-toggle-tr').click();
    await expect(page.getByTestId('stage-tab-learn')).toContainText('2. Öğren ve Test Et');
    await expect(page.getByTestId('train-model-btn')).toContainText(/Modeli Eğit|Modeli Yeniden Eğit/);

    // Stage 3 TR <-> EN
    await page.getByTestId('stage-tab-make').click();
    await expect(page.getByTestId('stage-tab-make')).toContainText('3. Üret');
    await expect(page.getByTestId('export-model-btn')).toContainText('Modeli İndir');
    await page.getByTestId('lang-toggle-en').click();
    await expect(page.getByTestId('stage-tab-make')).toContainText('3. Make');
    await expect(page.getByTestId('export-model-btn')).toContainText('Download Model');
  });

  test('T1-I18N-04: Language Choice Persists in localStorage', async ({ page }) => {
    await gotoHome(page);
    await page.getByTestId('lang-toggle-en').click();
    await expect(page.getByText('Your Machine Learning Projects')).toBeVisible();

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByText('Your Machine Learning Projects')).toBeVisible();
  });

  test('T1-I18N-05: 3-Stage Stepper Navigation', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, 'Aşama Gezintisi');

    await page.getByTestId('stage-tab-learn').click();
    await expect(page.getByRole('heading', { name: /2\. Öğren ve Test Et/ })).toBeVisible();

    await page.getByTestId('stage-tab-make').click();
    await expect(page.getByRole('heading', { name: /3\. Üret/ })).toBeVisible();

    await page.getByTestId('stage-tab-train').click();
    await expect(page.getByRole('heading', { name: /1\. Eğit/ })).toBeVisible();
  });
});

test.describe('Tier 1 — Area C: Stage 1 — Train (Data Collection)', () => {
  test('T1-TRAIN-01: Create Unlimited Label Buckets', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, 'Hayvanlar');
    await expect(page.getByTestId('train-empty-buckets')).toBeVisible();

    await addLabel(page, 'Kedi');
    await addLabel(page, 'Köpek');
    await addLabel(page, 'Kuş');

    await expect(page.getByTestId('train-empty-buckets')).toBeHidden();
    await expect(page.getByTestId('label-bucket')).toHaveCount(3);
    await expect(getLabelBucket(page, 'Kedi')).toBeVisible();
    await expect(getLabelBucket(page, 'Köpek')).toBeVisible();
    await expect(getLabelBucket(page, 'Kuş')).toBeVisible();
  });

  test('T1-TRAIN-02: Rename Label Bucket', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, 'Yeniden Adlandır');
    const bucket = await addLabel(page, 'Eski Ad');

    await bucket.getByTestId('label-rename-btn').click();
    await bucket.getByTestId('label-rename-input').fill('Yeni Ad');
    await bucket.getByTestId('label-rename-save-btn').click();

    await expect(getLabelBucket(page, 'Yeni Ad')).toBeVisible();
    await expect(getLabelBucket(page, 'Eski Ad')).toHaveCount(0);

    await page.reload();
    if (await page.getByTestId('project-card').count() > 0) {
      await openProjectFromDashboard(page, 'Yeniden Adlandır');
    }
    await expect(getLabelBucket(page, 'Yeni Ad')).toBeVisible();
  });

  test('T1-TRAIN-03: Delete Label Bucket with Confirm', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, 'Etiket Silme');
    const bucket = await addLabel(page, 'Silinecek Etiket');
    await uploadFilesToBucket(page, 'Silinecek Etiket', RED_CIRCLE_TRAIN_PNGS.slice(0, 2));
    await expect(bucket.getByTestId('label-sample-count')).toContainText('2 örnek');

    await bucket.getByTestId('label-delete-btn').click();
    await page.getByTestId('confirm-dialog-confirm').click();

    await expect(getLabelBucket(page, 'Silinecek Etiket')).toHaveCount(0);
    await page.getByTestId('nav-home').click();
    await expect(page.getByTestId('project-card').filter({ hasText: 'Etiket Silme' })).toContainText(
      '0 etiket • 0 örnek'
    );
  });

  test('T1-TRAIN-04: Drawing Pad Capture & Clear', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, 'Çizim Testi');
    const bucket = await addLabel(page, 'Daire');

    await bucket.getByTestId('open-drawing-pad-btn').click();
    await drawShapeOnCanvas(page, 'stroke');
    await page.getByTestId('drawing-clear-btn').click();
    await drawShapeOnCanvas(page, 'circle');
    await page.getByTestId('drawing-add-sample-btn').click();
    await page.getByTestId('drawing-close-btn').click();

    await expect(bucket.getByTestId('label-sample-count')).toContainText('1 örnek');
    await expect(bucket.getByTestId('sample-thumbnail')).toHaveCount(1);
  });

  test('T1-TRAIN-05: Multi-File Upload (JPG, PNG, WebP)', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, 'Çoklu Dosya');
    const bucket = await addLabel(page, 'Meyve');

    await uploadFilesToBucket(page, 'Meyve', [
      RED_CIRCLE_TRAIN_PNGS[0],
      RED_CIRCLE_JPG,
      BLUE_SQUARE_WEBP,
    ]);

    await expect(bucket.getByTestId('label-sample-count')).toContainText('3 örnek');
    const thumbs = bucket.getByTestId('sample-thumbnail');
    await expect(thumbs).toHaveCount(3);
    for (let i = 0; i < 3; i += 1) {
      await expect(thumbs.nth(i)).toHaveAttribute('src', /^data:image\//);
    }
  });

  test('T1-TRAIN-06: Individual Sample Deletion', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, 'Örnek Silme');
    const bucket = await addLabel(page, 'Daire');
    await uploadFilesToBucket(page, 'Daire', RED_CIRCLE_TRAIN_PNGS.slice(0, 3));
    await expect(bucket.getByTestId('label-sample-count')).toContainText('3 örnek');

    await bucket.getByTestId('delete-sample-btn').nth(1).click();
    await expect(bucket.getByTestId('label-sample-count')).toContainText('2 örnek');
    await expect(bucket.getByTestId('sample-thumbnail')).toHaveCount(2);

    await page.reload();
    if (await page.getByTestId('project-card').count() > 0) {
      await openProjectFromDashboard(page, 'Örnek Silme');
    }
    const reloadedBucket = getLabelBucket(page, 'Daire');
    await expect(reloadedBucket.getByTestId('label-sample-count')).toContainText('2 örnek');
    await expect(reloadedBucket.getByTestId('sample-thumbnail')).toHaveCount(2);
  });

  test('T1-TRAIN-07: Webcam Capture & Burst Mode (Fake Camera Context)', async () => {
    await withFakeWebcamPage(async (page) => {
      await gotoHome(page);
      await createProject(page, 'Kamera Projesi');
      const bucket = await addLabel(page, 'Kamera Sınıfı');

      await bucket.getByTestId('open-webcam-btn').click();
      const captureBtn = page.getByTestId('webcam-capture-btn');
      const burstBtn = page.getByTestId('webcam-burst-btn');
      await expect(captureBtn).toBeEnabled({ timeout: 15_000 });

      // Wait until video stream renders active frames
      await page.waitForFunction(() => {
        const video = document.querySelector('video');
        return Boolean(video && video.readyState >= 2 && video.videoWidth > 0);
      });

      await captureBtn.click();
      await expect(bucket.getByTestId('label-sample-count')).toContainText('1 örnek');

      const box = await burstBtn.boundingBox();
      if (!box) throw new Error('webcam-burst-btn boundingBox missing');
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(650);
      await page.mouse.up();

      await page.getByTestId('webcam-close-btn').click();

      const countText = await bucket.getByTestId('label-sample-count').innerText();
      const totalCount = Number.parseInt(countText.match(/\d+/)?.[0] ?? '0', 10);
      expect(totalCount).toBeGreaterThanOrEqual(3);
    });
  });
});

test.describe('Tier 1 — Area D: Stage 2 — Learn & Test (Training & Inference)', () => {
  test('T1-LEARN-01: Dataset Readiness Summary', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, 'Hazır Veri');
    await addLabel(page, 'Kırmızı');
    await addLabel(page, 'Mavi');
    await uploadFilesToBucket(page, 'Kırmızı', RED_CIRCLE_TRAIN_PNGS.slice(0, 5));
    await uploadFilesToBucket(page, 'Mavi', BLUE_SQUARE_TRAIN_PNGS.slice(0, 5));

    await page.getByTestId('stage-tab-learn').click();
    const summary = page.getByTestId('dataset-summary');
    await expect(summary).toContainText('2');
    await expect(summary).toContainText('10');
    await expect(page.getByTestId('readiness-banner')).toContainText('Veri setiniz eğitime hazır');
    await expect(page.getByTestId('train-model-btn')).toBeEnabled();
    await expect(page.getByTestId('train-model-btn')).toContainText('Modeli Eğit');
  });

  test('T1-LEARN-02: Collapsible Advanced Settings & Defaults', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, 'Gelişmiş Ayarlar');
    await page.getByTestId('stage-tab-learn').click();

    await expect(page.getByTestId('input-epochs')).toBeHidden();
    await page.getByTestId('advanced-settings-toggle').click();

    await expect(page.getByTestId('input-epochs')).toHaveValue('20');
    await expect(page.getByTestId('input-batch-size')).toHaveValue('16');
    await expect(page.getByTestId('input-learning-rate')).toHaveValue('0.001');

    await page.getByTestId('advanced-settings-toggle').click();
    await expect(page.getByTestId('input-epochs')).toBeHidden();
  });

  test('T1-LEARN-03: Train Model with Custom Hyperparameters', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, 'Özel Eğitim');
    await addLabel(page, 'Kırmızı');
    await addLabel(page, 'Mavi');
    await uploadFilesToBucket(page, 'Kırmızı', RED_CIRCLE_TRAIN_PNGS.slice(0, 5));
    await uploadFilesToBucket(page, 'Mavi', BLUE_SQUARE_TRAIN_PNGS.slice(0, 5));

    await configureAndTrainModel(page, { epochs: 4, batchSize: 4, learningRate: 0.002 });
    await expect(page.getByTestId('training-status')).toContainText('Model Eğitildi ve Hazır');
    await expect(page.getByTestId('training-progress')).toBeVisible();
  });

  test('T1-LEARN-04: Real-Time Loss & Accuracy Telemetry Charts', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, 'Grafik Telemetri');
    await addLabel(page, 'Kırmızı');
    await addLabel(page, 'Mavi');
    await uploadFilesToBucket(page, 'Kırmızı', RED_CIRCLE_TRAIN_PNGS.slice(0, 5));
    await uploadFilesToBucket(page, 'Mavi', BLUE_SQUARE_TRAIN_PNGS.slice(0, 5));

    await configureAndTrainModel(page, { epochs: 4, batchSize: 4 });

    await assertSvgChartHasEpochPoints(page.getByTestId('loss-chart'), 4);
    await assertSvgChartHasEpochPoints(page.getByTestId('accuracy-chart'), 4);
    await expect(page.getByTestId('latest-loss')).toContainText(/\d+\.\d+/);
    await expect(page.getByTestId('latest-accuracy')).toContainText(/%\s*\d+|\d+\s*%/);
  });

  test('T1-LEARN-05: Live Inference via Drawing Pad', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, 'Çizim Tahmini');
    await addLabel(page, 'Daire');
    await addLabel(page, 'Kare');
    await drawSamplesInBucket(page, 'Daire', 'circle', 5, 0);
    await drawSamplesInBucket(page, 'Kare', 'square', 5, 0);

    await configureAndTrainModel(page, { epochs: 4, batchSize: 4 });

    await page.getByTestId('live-test-drawing-tab').click();
    await drawShapeOnCanvas(page, 'circle', page.getByTestId('drawing-canvas'), 2);
    await page.getByTestId('live-test-predict-btn').click();

    await expect(page.getByTestId('predicted-class')).toContainText(/Daire|Kare/);
    await assertConfidenceBarsValid(page, 2);
  });

  test('T1-LEARN-06: Live Inference via File Upload', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, 'Dosya Tahmini');
    await addLabel(page, 'Kırmızı');
    await addLabel(page, 'Mavi');
    await uploadFilesToBucket(page, 'Kırmızı', RED_CIRCLE_TRAIN_PNGS.slice(0, 5));
    await uploadFilesToBucket(page, 'Mavi', BLUE_SQUARE_TRAIN_PNGS.slice(0, 5));

    await configureAndTrainModel(page, { epochs: 4, batchSize: 4 });

    await page.getByTestId('live-test-upload-tab').click();
    await page.getByTestId('live-test-file-input').setInputFiles(RED_CIRCLE_TEST_PNG);
    await page.getByTestId('live-test-predict-btn').click();

    await expect(page.getByTestId('predicted-class')).toContainText('Kırmızı');
    const bars = await assertConfidenceBarsValid(page, 2);
    expect(bars[0].text).toContain('Kırmızı');
  });
});

test.describe('Tier 1 — Area E: Stage 3 — Make (Playground & Model Export)', () => {
  test('T1-MAKE-01: Reaction Configurator Cards', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, 'Tepki Kartları');
    await addLabel(page, 'Kedi');
    await addLabel(page, 'Köpek');
    await uploadFilesToBucket(page, 'Kedi', RED_CIRCLE_TRAIN_PNGS.slice(0, 5));
    await uploadFilesToBucket(page, 'Köpek', BLUE_SQUARE_TRAIN_PNGS.slice(0, 5));

    await configureAndTrainModel(page, { epochs: 3, batchSize: 4 });
    await page.getByTestId('stage-tab-make').click();

    const cards = page.getByTestId('reaction-config-card');
    await expect(cards).toHaveCount(2);
    for (let i = 0; i < 2; i += 1) {
      await expect(cards.nth(i).getByTestId('reaction-message-input')).toBeVisible();
      await expect(cards.nth(i).getByTestId('reaction-color-input')).toBeVisible();
      await expect(cards.nth(i).getByTestId('reaction-sound-select')).toBeVisible();
      await expect(cards.nth(i).getByTestId('reaction-counter-toggle')).toBeVisible();
    }
  });

  test('T1-MAKE-02: Custom Message & Color Reaction Trigger', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, 'Özel Tepki');
    await addLabel(page, 'Daire');
    await addLabel(page, 'Kare');
    await uploadFilesToBucket(page, 'Daire', RED_CIRCLE_TRAIN_PNGS.slice(0, 5));
    await uploadFilesToBucket(page, 'Kare', BLUE_SQUARE_TRAIN_PNGS.slice(0, 5));

    await configureAndTrainModel(page, { epochs: 4, batchSize: 4 });
    await page.getByTestId('stage-tab-make').click();

    const daireCard = page.getByTestId('reaction-config-card').filter({ hasText: 'Daire' });
    await daireCard.getByTestId('reaction-message-input').fill('Harika Daire!');
    await daireCard.getByTestId('reaction-color-input').fill('#10b981');

    await page.getByTestId('reaction-threshold-input').fill('0');
    await page.getByTestId('make-upload-tab').click();
    await page.getByTestId('make-file-input').setInputFiles(RED_CIRCLE_TEST_PNG);
    await page.getByTestId('make-test-btn').click();

    await expect(page.getByTestId('playground-message')).toContainText('Harika Daire!');
    const stageStyle = await page.getByTestId('playground-stage').evaluate((el) => {
      const cs = getComputedStyle(el);
      return `${el.getAttribute('style') ?? ''} | ${cs.backgroundColor} | ${cs.borderColor}`;
    });
    expect(stageStyle.toLowerCase()).toMatch(/rgb\(16,\s*185,\s*129\)|#10b981/);
  });

  test('T1-MAKE-03: Sound Effect Reaction Configuration', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, 'Ses Efekti');
    await addLabel(page, 'Kırmızı');
    await addLabel(page, 'Mavi');
    await uploadFilesToBucket(page, 'Kırmızı', RED_CIRCLE_TRAIN_PNGS.slice(0, 5));
    await uploadFilesToBucket(page, 'Mavi', BLUE_SQUARE_TRAIN_PNGS.slice(0, 5));

    await configureAndTrainModel(page, { epochs: 3, batchSize: 4 });
    await page.getByTestId('stage-tab-make').click();

    const redCard = page.getByTestId('reaction-config-card').filter({ hasText: 'Kırmızı' });
    await redCard.getByTestId('reaction-sound-select').selectOption('chime');
    await redCard.getByRole('button', { name: /Sesi Dene|Test Sound/i }).click();

    await page.getByTestId('reaction-threshold-input').fill('0');
    await page.getByTestId('make-upload-tab').click();
    await page.getByTestId('make-file-input').setInputFiles(RED_CIRCLE_TEST_PNG);
    await page.getByTestId('make-test-btn').click();

    await expect(page.getByTestId('make-status-banner')).toBeVisible();
  });

  test('T1-MAKE-04: Counter Increment & Reset', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, 'Sayaç Testi');
    await addLabel(page, 'Kırmızı');
    await addLabel(page, 'Mavi');
    await uploadFilesToBucket(page, 'Kırmızı', RED_CIRCLE_TRAIN_PNGS.slice(0, 5));
    await uploadFilesToBucket(page, 'Mavi', BLUE_SQUARE_TRAIN_PNGS.slice(0, 5));

    await configureAndTrainModel(page, { epochs: 4, batchSize: 4 });
    await page.getByTestId('stage-tab-make').click();

    const redCard = page.getByTestId('reaction-config-card').filter({ hasText: 'Kırmızı' });
    const counterToggle = redCard.getByTestId('reaction-counter-toggle');
    if (!(await counterToggle.isChecked())) {
      await counterToggle.check();
    }

    await page.getByTestId('reaction-threshold-input').fill('0');
    await page.getByTestId('make-upload-tab').click();
    await page.getByTestId('make-file-input').setInputFiles(RED_CIRCLE_TEST_PNG);

    await page.getByTestId('make-test-btn').click();
    await page.getByTestId('make-test-btn').click();

    const counters = page.getByTestId('playground-stage').getByTestId('reaction-counter-value');
    const countTexts = await counters.allInnerTexts();
    expect(countTexts.some((t) => /\b2\b/.test(t))).toBe(true);

    await page.getByTestId('reset-counters-btn').click();
    const resetTexts = await counters.allInnerTexts();
    for (const text of resetTexts) {
      expect(text).toMatch(/\b0\b/);
    }
  });

  test('T1-MAKE-05: One-Click Model Export (model.json + .bin)', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, 'Model İndirme');
    await addLabel(page, 'Kırmızı');
    await addLabel(page, 'Mavi');
    await uploadFilesToBucket(page, 'Kırmızı', RED_CIRCLE_TRAIN_PNGS.slice(0, 5));
    await uploadFilesToBucket(page, 'Mavi', BLUE_SQUARE_TRAIN_PNGS.slice(0, 5));

    await configureAndTrainModel(page, { epochs: 3, batchSize: 4 });
    await page.getByTestId('stage-tab-make').click();

    const exported = await captureModelExportDownloads(page);
    expect(exported.jsonFileName).toMatch(/\.json$/i);
    expect(exported.weightsFileName).toMatch(/\.bin$/i);
    expect(exported.weightsBuffer.byteLength).toBeGreaterThan(0);
    await expect(page.getByTestId('export-status')).toContainText(
      /model\.json ve model\.weights\.bin indirildi|Downloaded model\.json and model\.weights\.bin/i
    );
  });

  test('T1-MAKE-06: Sample JS/HTML Code Snippet & Copy', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, 'Kod Parçacığı');
    await addLabel(page, 'Kırmızı');
    await addLabel(page, 'Mavi');
    await uploadFilesToBucket(page, 'Kırmızı', RED_CIRCLE_TRAIN_PNGS.slice(0, 5));
    await uploadFilesToBucket(page, 'Mavi', BLUE_SQUARE_TRAIN_PNGS.slice(0, 5));

    await configureAndTrainModel(page, { epochs: 3, batchSize: 4 });
    await page.getByTestId('stage-tab-make').click();

    const snippetEl = page.getByTestId('export-snippet-code');
    await expect(snippetEl).toBeVisible();
    const snippetText = await snippetEl.innerText();
    expect(snippetText.trim().length).toBeGreaterThan(40);
    expect(snippetText).toContain('tf.loadLayersModel');
    expect(snippetText).toMatch(/mobilenet/i);
    expect(snippetText).toContain('Kırmızı');
    expect(snippetText).toContain('Mavi');

    await page.getByTestId('copy-snippet-btn').click();
    await expect(page.getByTestId('copy-snippet-feedback')).toContainText(/Kopyalandı!|Copied!/);
  });
});
