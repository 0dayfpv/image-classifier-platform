import { expect, test } from '@playwright/test';
import {
  BLUE_SQUARE_TRAIN_PNGS,
  CORRUPTED_PNG,
  GREEN_TRIANGLE_TEST_PNG,
  INVALID_SVG,
  INVALID_TXT,
  RED_CIRCLE_JPG,
  RED_CIRCLE_TEST_PNG,
  RED_CIRCLE_TRAIN_PNGS,
} from './fixtures/fixturePaths';
import {
  drawShapeOnCanvas,
  registerZeroErrorHarness,
} from './helpers/testHarness';
import {
  addLabel,
  assertConfidenceBarsValid,
  configureAndTrainModel,
  createProject,
  ensureAdvancedSettingsExpanded,
  getLabelBucket,
  gotoHome,
  openProjectFromDashboard,
  uploadFilesToBucket,
} from './helpers/workflowActions';

registerZeroErrorHarness();

test.describe('Tier 2 — Area A: Dashboard & Persistence Boundaries', () => {
  test('T2-DASH-01: Empty & Whitespace Project Name', async ({ page }) => {
    await gotoHome(page);
    await page.getByTestId('project-create-btn').click();

    await page.getByTestId('project-name-input').fill('');
    await page.getByTestId('project-create-submit').click();
    await expect(page.getByTestId('project-name-error')).toContainText('Proje adı boş bırakılamaz.');

    await page.getByTestId('project-name-input').fill('    ');
    await page.getByTestId('project-create-submit').click();
    await expect(page.getByTestId('project-name-error')).toContainText('Proje adı boş bırakılamaz.');
    await expect(page.getByTestId('project-name-input')).toBeVisible();

    await page.keyboard.press('Escape').catch(() => undefined);
    await expect(page.getByTestId('project-card')).toHaveCount(0);
  });

  test('T2-DASH-02: Project Name Length Bounds (50 vs 51 chars)', async ({ page }) => {
    await gotoHome(page);
    await page.getByTestId('project-create-btn').click();

    await page.getByTestId('project-name-input').fill('A'.repeat(51));
    await page.getByTestId('project-create-submit').click();
    await expect(page.getByTestId('project-name-error')).toContainText(
      'Proje adı en fazla 50 karakter olabilir.'
    );

    const exact50 = 'B'.repeat(50);
    await page.getByTestId('project-name-input').fill(exact50);
    await page.getByTestId('project-create-submit').click();
    await expect(page.getByTestId('stage-tab-train')).toBeVisible();

    await page.getByTestId('nav-home').click();
    await expect(page.getByTestId('project-card').filter({ hasText: exact50 })).toHaveCount(1);
  });

  test('T2-DASH-03: Turkish Unicode & Whitespace Trimming', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, '  Çiçek & Şişe ĞÜİÖ  ');

    await page.getByTestId('nav-home').click();
    const card = page.getByTestId('project-card').first();
    await expect(card).toContainText('Çiçek & Şişe ĞÜİÖ');

    await page.reload();
    await expect(page.getByTestId('project-card').first()).toContainText('Çiçek & Şişe ĞÜİÖ');
  });

  test('T2-DASH-04: Cancel Project Deletion', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, 'İptal Edilen');
    await addLabel(page, 'Elma');
    await uploadFilesToBucket(page, 'Elma', RED_CIRCLE_TRAIN_PNGS.slice(0, 2));
    await page.getByTestId('nav-home').click();

    const card = page.getByTestId('project-card').filter({ hasText: 'İptal Edilen' });
    await card.getByTestId('project-delete-btn').click();
    await expect(page.getByTestId('confirm-dialog-cancel')).toBeVisible();
    await page.getByTestId('confirm-dialog-cancel').click();

    await expect(card).toBeVisible();
    await expect(card).toContainText('1 etiket • 2 örnek');
  });

  test('T2-DASH-05: Delete Newly Opened / Multi-Project Edge', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, 'Proje A');
    await page.getByTestId('nav-home').click();
    await createProject(page, 'Proje B');
    await page.getByTestId('nav-home').click();

    await openProjectFromDashboard(page, 'Proje A');
    await page.getByTestId('nav-home').click();

    const cardA = page.getByTestId('project-card').filter({ hasText: 'Proje A' });
    await cardA.getByTestId('project-delete-btn').click();
    await page.getByTestId('confirm-dialog-confirm').click();

    await expect(page.getByTestId('project-card').filter({ hasText: 'Proje A' })).toHaveCount(0);
    await openProjectFromDashboard(page, 'Proje B');
    await expect(page.getByTestId('train-empty-buckets')).toBeVisible();
    await expect(page.getByTestId('label-bucket')).toHaveCount(0);
  });
});

test.describe('Tier 2 — Area B: Localization & Navigation Boundaries', () => {
  test('T2-I18N-01: Toggle Language on Empty Dashboard', async ({ page }) => {
    await gotoHome(page);
    await expect(page.getByTestId('dashboard-empty-state')).toContainText('Henüz projeniz yok');

    await page.getByTestId('lang-toggle-en').click();
    await expect(page.getByTestId('dashboard-empty-state')).toContainText(
      'You have no projects yet'
    );
    await page.getByTestId('project-create-btn').click();
    await expect(page.getByText('Create New Project')).toBeVisible();
    await page.getByRole('button', { name: /Cancel|Close/i }).first().click();

    await page.getByTestId('lang-toggle-tr').click();
    await expect(page.getByTestId('dashboard-empty-state')).toContainText('Henüz projeniz yok');
  });

  test('T2-I18N-02: Toggle Language with Active Validation / Low-Sample Warning', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, 'Uyarı Çeviri');
    const bucket = await addLabel(page, 'Elma');
    await uploadFilesToBucket(page, 'Elma', RED_CIRCLE_TRAIN_PNGS[0]);
    await expect(bucket.getByTestId('low-sample-warning')).toContainText(
      'En az 5 görsel önerilir (şu an: 1)'
    );

    await page.getByTestId('add-label-btn').click();
    await page.getByTestId('label-name-input').fill('');
    await page.getByTestId('label-create-submit').click();
    await expect(page.getByTestId('label-form-error')).toContainText('Etiket adı boş bırakılamaz.');

    await page.getByTestId('lang-toggle-en').click();
    await expect(page.getByTestId('label-form-error')).toContainText('Label name cannot be empty.');
    await expect(bucket.getByTestId('low-sample-warning')).toContainText(
      'At least 5 images recommended (currently: 1)'
    );
  });

  test('T2-I18N-03: Toggle Language After Training in Stage 2', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, 'Eğitim Sonrası Dil');
    await addLabel(page, 'Kırmızı');
    await addLabel(page, 'Mavi');
    await uploadFilesToBucket(page, 'Kırmızı', RED_CIRCLE_TRAIN_PNGS.slice(0, 5));
    await uploadFilesToBucket(page, 'Mavi', BLUE_SQUARE_TRAIN_PNGS.slice(0, 5));

    await configureAndTrainModel(page, { epochs: 3, batchSize: 4 });
    await page.getByTestId('live-test-upload-tab').click();
    await page.getByTestId('live-test-file-input').setInputFiles(RED_CIRCLE_TEST_PNG);
    await page.getByTestId('live-test-predict-btn').click();

    await page.getByTestId('lang-toggle-en').click();
    await expect(page.getByTestId('training-status')).toContainText('Model Trained & Ready');
    await expect(page.getByText('Training Loss')).toBeVisible();
    await expect(page.getByText('Training Accuracy')).toBeVisible();
    await expect(page.getByTestId('confidence-bars')).toContainText('Confidence (% confidence)');
    await assertConfidenceBarsValid(page, 2);
  });

  test('T2-I18N-04: Toggle Language on Stage 3 Untrained Guard & Playground', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, 'Üçüncü Aşama Dil');
    await addLabel(page, 'Kırmızı');
    await addLabel(page, 'Mavi');
    await uploadFilesToBucket(page, 'Kırmızı', RED_CIRCLE_TRAIN_PNGS.slice(0, 5));
    await uploadFilesToBucket(page, 'Mavi', BLUE_SQUARE_TRAIN_PNGS.slice(0, 5));

    await page.getByTestId('stage-tab-make').click();
    await expect(page.getByTestId('make-untrained-guard')).toContainText('Henüz eğitilmiş bir model yok');
    await page.getByTestId('lang-toggle-en').click();
    await expect(page.getByTestId('make-untrained-guard')).toContainText('No trained model yet');

    await page.getByTestId('lang-toggle-tr').click();
    await configureAndTrainModel(page, { epochs: 3, batchSize: 4 });
    await page.getByTestId('stage-tab-make').click();

    await expect(page.getByTestId('export-model-btn')).toContainText('Modeli İndir');
    await expect(page.getByText('Ekranda Gösterilecek Mesaj').first()).toBeVisible();
    await page.getByTestId('lang-toggle-en').click();
    await expect(page.getByTestId('export-model-btn')).toContainText('Download Model');
    await expect(page.getByText('On-Screen Message').first()).toBeVisible();
    await expect(page.getByTestId('reaction-sound-select').first()).toContainText('Chime');
  });

  test('T2-I18N-05: Rapid Repeated Language Switching', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, 'Hızlı Geçiş');

    await page.getByTestId('lang-toggle-en').click();
    await page.getByTestId('lang-toggle-tr').click();
    await page.getByTestId('lang-toggle-en').click();
    await page.getByTestId('lang-toggle-tr').click();
    await page.getByTestId('lang-toggle-en').click();

    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByTestId('stage-tab-train')).toContainText('1. Train');
    await expect(page.getByTestId('add-label-btn')).toContainText('+ Add New Label');
  });
});

test.describe('Tier 2 — Area C: Stage 1 Train Boundaries', () => {
  test('T2-TRAIN-01: Empty & Whitespace Label Name (Create & Rename)', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, 'Boş Etiket');

    await page.getByTestId('add-label-btn').click();
    await page.getByTestId('label-name-input').fill('');
    await page.getByTestId('label-create-submit').click();
    await expect(page.getByTestId('label-form-error')).toContainText('Etiket adı boş bırakılamaz.');

    await page.getByTestId('label-name-input').fill('   ');
    await page.getByTestId('label-create-submit').click();
    await expect(page.getByTestId('label-form-error')).toContainText('Etiket adı boş bırakılamaz.');

    await page.getByTestId('label-name-input').fill('Geçerli');
    await page.getByTestId('label-create-submit').click();

    const bucket = getLabelBucket(page, 'Geçerli');
    await bucket.getByTestId('label-rename-btn').click();
    await bucket.getByTestId('label-rename-input').fill('   ');
    await bucket.getByTestId('label-rename-save-btn').click();
    await expect(bucket).toContainText('Etiket adı boş bırakılamaz.');
  });

  test('T2-TRAIN-02: Label Name Length Bounds (40 vs 41 chars)', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, 'Etiket Uzunluk');

    await page.getByTestId('add-label-btn').click();
    await page.getByTestId('label-name-input').fill('X'.repeat(41));
    await page.getByTestId('label-create-submit').click();
    await expect(page.getByTestId('label-form-error')).toContainText(
      'Etiket adı en fazla 40 karakter olabilir.'
    );

    const exact40 = 'Y'.repeat(40);
    await page.getByTestId('label-name-input').fill(exact40);
    await page.getByTestId('label-create-submit').click();
    await expect(getLabelBucket(page, exact40)).toBeVisible();
  });

  test('T2-TRAIN-03: Turkish Unicode Labels (Ç, Ğ, İ, Ö, Ş, Ü, ı)', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, 'Türkçe Karakterler');
    const labels = ['Çiçek', 'Şişe', 'Gözlük', 'Işık', 'Üzüm', 'Dağ'];

    for (const label of labels) {
      await addLabel(page, label);
    }

    await page.reload();
    if (await page.getByTestId('project-card').count() > 0) {
      await openProjectFromDashboard(page, 'Türkçe Karakterler');
    }

    for (const label of labels) {
      await expect(getLabelBucket(page, label)).toBeVisible();
    }
  });

  test('T2-TRAIN-04: Case-Insensitive & Turkish-Locale Duplicate Labels', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, 'Yinelenen Etiket');
    await addLabel(page, 'Elma');
    await addLabel(page, 'İnek');
    await addLabel(page, 'Işık');

    const duplicatePairs = ['elma', 'inek', 'ışık'];
    for (const dup of duplicatePairs) {
      await page.getByTestId('add-label-btn').click();
      await page.getByTestId('label-name-input').fill(dup);
      await page.getByTestId('label-create-submit').click();
      await expect(page.getByTestId('label-form-error')).toContainText(
        'Bu isimde bir etiket zaten var.'
      );
      await page.getByRole('button', { name: /İptal|Kapat|Cancel|Close/i }).first().click();
    }

    // Rename duplicate check
    const elmaBucket = getLabelBucket(page, 'Elma');
    await elmaBucket.getByTestId('label-rename-btn').click();
    await elmaBucket.getByTestId('label-rename-input').fill('inek');
    await elmaBucket.getByTestId('label-rename-save-btn').click();
    await expect(elmaBucket).toContainText('Bu isimde bir etiket zaten var.');
  });

  test('T2-TRAIN-05: Unsupported & Corrupted File Upload', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, 'Bozuk Dosya');
    const bucket = await addLabel(page, 'Test');

    await uploadFilesToBucket(page, 'Test', INVALID_TXT);
    await expect(page.getByTestId('train-error-banner')).toContainText(
      'Yalnızca JPG, PNG ve WebP görselleri desteklenir.'
    );
    await expect(bucket.getByTestId('label-sample-count')).toContainText('0 örnek');

    await uploadFilesToBucket(page, 'Test', INVALID_SVG);
    await expect(page.getByTestId('train-error-banner')).toContainText(
      'Yalnızca JPG, PNG ve WebP görselleri desteklenir.'
    );
    await expect(bucket.getByTestId('label-sample-count')).toContainText('0 örnek');

    await uploadFilesToBucket(page, 'Test', CORRUPTED_PNG);
    await expect(page.getByTestId('train-error-banner')).toContainText(
      'Görsel okunamadı veya bozuk.'
    );
    await expect(bucket.getByTestId('label-sample-count')).toContainText('0 örnek');
  });

  test('T2-TRAIN-06: Low-Sample Warning Boundary (0 vs 1..4 vs 5)', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, 'Sınır Uyarı');
    const bucket = await addLabel(page, 'Daire');

    await expect(bucket.getByTestId('low-sample-warning')).toHaveCount(0);

    for (let i = 1; i <= 4; i += 1) {
      await uploadFilesToBucket(page, 'Daire', RED_CIRCLE_TRAIN_PNGS[i - 1]);
      await expect(bucket.getByTestId('low-sample-warning')).toBeVisible();
      await expect(bucket.getByTestId('low-sample-warning')).toContainText(
        `En az 5 görsel önerilir (şu an: ${i})`
      );
    }

    await uploadFilesToBucket(page, 'Daire', RED_CIRCLE_TRAIN_PNGS[4]);
    await expect(bucket.getByTestId('label-sample-count')).toContainText('5 örnek');
    await expect(bucket.getByTestId('low-sample-warning')).toHaveCount(0);
  });

  test('T2-TRAIN-07: Imbalance Warning + Blank Canvas Guard + No-Webcam Fallback', async ({
    page,
  }) => {
    await gotoHome(page);
    await createProject(page, 'Dengesiz ve Kamera');
    await addLabel(page, 'Çoğunluk');
    await addLabel(page, 'Azınlık');

    // 10 samples vs 2 samples triggers severe imbalance (10 >= 10 && 10 >= 3 * 2)
    await uploadFilesToBucket(page, 'Çoğunluk', [
      ...RED_CIRCLE_TRAIN_PNGS,
      RED_CIRCLE_JPG,
      RED_CIRCLE_TEST_PNG,
      RED_CIRCLE_TRAIN_PNGS[0],
      RED_CIRCLE_TRAIN_PNGS[1],
    ]);
    await uploadFilesToBucket(page, 'Azınlık', BLUE_SQUARE_TRAIN_PNGS.slice(0, 2));

    await expect(page.getByTestId('imbalance-warning')).toBeVisible();
    await expect(page.getByTestId('imbalance-warning')).toContainText('Dengesiz veri seti');

    // Blank canvas guard
    const minorityBucket = getLabelBucket(page, 'Azınlık');
    await minorityBucket.getByTestId('open-drawing-pad-btn').click();
    await page.getByTestId('drawing-add-sample-btn').click();
    await expect(page.getByTestId('drawing-error-banner')).toContainText(
      'Lütfen eklemeden önce tuvale bir şeyler çizin.'
    );
    await page.getByTestId('drawing-close-btn').click();

    // Camera-less headless fallback
    await minorityBucket.getByTestId('open-webcam-btn').click();
    await expect(page.getByTestId('webcam-error-banner')).toBeVisible();
    await page.getByTestId('webcam-close-btn').click();
  });
});

test.describe('Tier 2 — Area D: Stage 2 Learn & Test Boundaries', () => {
  test('T2-LEARN-01: Hard-Block Training: 0 Labels', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, 'Sıfır Etiket');
    await page.getByTestId('stage-tab-learn').click();

    await expect(page.getByTestId('readiness-banner')).toContainText('Henüz hiç etiket yok');
    await expect(page.getByTestId('train-model-btn')).toBeDisabled();
  });

  test('T2-LEARN-02: Hard-Block Training: 1 Label', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, 'Tek Etiket');
    await addLabel(page, 'Sadece Bir');
    await uploadFilesToBucket(page, 'Sadece Bir', RED_CIRCLE_TRAIN_PNGS.slice(0, 5));

    await page.getByTestId('stage-tab-learn').click();
    await expect(page.getByTestId('readiness-banner')).toContainText('en az 2 etiket');
    await expect(page.getByTestId('train-model-btn')).toBeDisabled();
  });

  test('T2-LEARN-03: Hard-Block Training: 0-Sample Class Present', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, 'Boş Sınıf');
    await addLabel(page, 'Dolu');
    await addLabel(page, 'Boş');
    await uploadFilesToBucket(page, 'Dolu', RED_CIRCLE_TRAIN_PNGS.slice(0, 5));

    await page.getByTestId('stage-tab-learn').click();
    await expect(page.getByTestId('readiness-banner')).toContainText(
      'Bazı etiketlerde hiç örnek yok'
    );
    await expect(page.getByTestId('train-model-btn')).toBeDisabled();
  });

  test('T2-LEARN-04: Non-Blocking Low-Sample Advisory (1–4 Samples/Class)', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, 'Az Örnekli Eğitim');
    await addLabel(page, 'Kırmızı');
    await addLabel(page, 'Mavi');
    await uploadFilesToBucket(page, 'Kırmızı', RED_CIRCLE_TRAIN_PNGS.slice(0, 2));
    await uploadFilesToBucket(page, 'Mavi', BLUE_SQUARE_TRAIN_PNGS.slice(0, 2));

    await page.getByTestId('stage-tab-learn').click();
    await expect(page.getByTestId('readiness-banner')).toContainText(
      "Bazı sınıflarda 5'ten az görsel var"
    );
    await expect(page.getByTestId('train-model-btn')).toBeEnabled();

    await configureAndTrainModel(page, { epochs: 3, batchSize: 2 });
    await expect(page.getByTestId('training-status')).toContainText('Model Eğitildi ve Hazır');
  });

  test('T2-LEARN-05: Invalid Hyperparameters & Reset Defaults', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, 'Hiperparametre Sınır');
    await addLabel(page, 'Kırmızı');
    await addLabel(page, 'Mavi');
    await uploadFilesToBucket(page, 'Kırmızı', RED_CIRCLE_TRAIN_PNGS.slice(0, 5));
    await uploadFilesToBucket(page, 'Mavi', BLUE_SQUARE_TRAIN_PNGS.slice(0, 5));

    await page.getByTestId('stage-tab-learn').click();
    await ensureAdvancedSettingsExpanded(page);

    const epochsInput = page.getByTestId('input-epochs');
    const batchInput = page.getByTestId('input-batch-size');
    const lrInput = page.getByTestId('input-learning-rate');
    const errorBox = page.getByTestId('advanced-settings-error');

    await epochsInput.fill('0');
    await expect(errorBox).toContainText('Epoch sayısı 1 ile 200 arasında');
    await expect(page.getByTestId('train-model-btn')).toBeDisabled();

    await epochsInput.fill('201');
    await expect(errorBox).toContainText('Epoch sayısı 1 ile 200 arasında');

    await epochsInput.fill('20');
    await batchInput.fill('0');
    await expect(errorBox).toContainText('Batch boyutu 1 ile 128 arasında');

    await batchInput.fill('129');
    await expect(errorBox).toContainText('Batch boyutu 1 ile 128 arasında');

    await batchInput.fill('16');
    await lrInput.fill('0');
    await expect(errorBox).toContainText("Öğrenme oranı 0'dan büyük ve en fazla 1");

    await lrInput.fill('1.5');
    await expect(errorBox).toContainText("Öğrenme oranı 0'dan büyük ve en fazla 1");

    await lrInput.fill('');
    await expect(errorBox).toBeVisible();

    await page.getByTestId('reset-defaults-btn').click();
    await expect(epochsInput).toHaveValue('20');
    await expect(batchInput).toHaveValue('16');
    await expect(lrInput).toHaveValue('0.001');
    await expect(errorBox).toBeHidden();
    await expect(page.getByTestId('train-model-btn')).toBeEnabled();
  });

  test('T2-LEARN-06: Mid-Training Cancellation & Headless Webcam Test Fallback', async ({
    page,
  }) => {
    await gotoHome(page);
    await createProject(page, 'İptal ve Kamera');
    await addLabel(page, 'Kırmızı');
    await addLabel(page, 'Mavi');
    await uploadFilesToBucket(page, 'Kırmızı', RED_CIRCLE_TRAIN_PNGS.slice(0, 5));
    await uploadFilesToBucket(page, 'Mavi', BLUE_SQUARE_TRAIN_PNGS.slice(0, 5));

    await page.getByTestId('stage-tab-learn').click();
    await ensureAdvancedSettingsExpanded(page);
    await page.getByTestId('input-epochs').fill('20');
    await page.getByTestId('input-batch-size').fill('2');
    await page.getByTestId('train-model-btn').click();

    const cancelBtn = page.getByTestId('cancel-training-btn');
    await expect(cancelBtn).toBeVisible({ timeout: 15_000 });
    await cancelBtn.click();

    await expect(page.getByTestId('training-status')).toContainText('Eğitim durduruldu', {
      timeout: 15_000,
    });

    // Retrain briefly to unlock Live Test tabs, then verify headless webcam fallback
    await configureAndTrainModel(page, { epochs: 3, batchSize: 4 });
    await page.getByTestId('live-test-webcam-tab').click();
    const startLiveBtn = page.getByRole('button', { name: /Canlı Testi Başlat|Start Live Test/i });
    if (await startLiveBtn.isVisible()) {
      await startLiveBtn.click();
    }
    await expect(page.getByTestId('webcam-error-banner')).toBeVisible();

    await page.getByTestId('live-test-drawing-tab').click();
    await expect(page.getByTestId('drawing-canvas')).toBeVisible();
    await page.getByTestId('live-test-upload-tab').click();
    await expect(page.getByTestId('live-test-file-input')).toBeVisible();
  });
});

test.describe('Tier 2 — Area E: Stage 3 Make Boundaries', () => {
  test('T2-MAKE-01: Untrained Model Guard', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, 'Eğitimsiz Üret');
    await addLabel(page, 'Kırmızı');
    await addLabel(page, 'Mavi');
    await uploadFilesToBucket(page, 'Kırmızı', RED_CIRCLE_TRAIN_PNGS.slice(0, 2));
    await uploadFilesToBucket(page, 'Mavi', BLUE_SQUARE_TRAIN_PNGS.slice(0, 2));

    await page.getByTestId('stage-tab-make').click();
    await expect(page.getByTestId('make-untrained-guard')).toContainText(
      'Henüz eğitilmiş bir model yok'
    );
    const exportBtn = page.getByTestId('export-model-btn');
    if ((await exportBtn.count()) > 0 && (await exportBtn.isVisible())) {
      await expect(exportBtn).toBeDisabled();
    } else {
      await expect(exportBtn).toHaveCount(0);
    }
  });

  test('T2-MAKE-02: Trigger Threshold Filtering (99%)', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, 'Eşik Filtresi');
    await addLabel(page, 'Kırmızı');
    await addLabel(page, 'Mavi');
    await uploadFilesToBucket(page, 'Kırmızı', RED_CIRCLE_TRAIN_PNGS.slice(0, 5));
    await uploadFilesToBucket(page, 'Mavi', BLUE_SQUARE_TRAIN_PNGS.slice(0, 5));

    await configureAndTrainModel(page, { epochs: 3, batchSize: 4 });
    await page.getByTestId('stage-tab-make').click();

    await page.getByTestId('reaction-threshold-input').fill('99');
    await page.getByTestId('make-upload-tab').click();
    await page.getByTestId('make-file-input').setInputFiles(GREEN_TRIANGLE_TEST_PNG);
    await page.getByTestId('make-test-btn').click();

    await expect(page.getByTestId('make-status-banner')).toContainText(
      /eşik değerinin altında|below threshold/i
    );
    const counterTexts = await page
      .getByTestId('playground-stage')
      .getByTestId('reaction-counter-value')
      .allInnerTexts();
    for (const text of counterTexts) {
      expect(text).toMatch(/\b0\b/);
    }
  });

  test('T2-MAKE-03: Counter Toggle Disabled', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, 'Sayaç Kapalı');
    await addLabel(page, 'Kırmızı');
    await addLabel(page, 'Mavi');
    await uploadFilesToBucket(page, 'Kırmızı', RED_CIRCLE_TRAIN_PNGS.slice(0, 5));
    await uploadFilesToBucket(page, 'Mavi', BLUE_SQUARE_TRAIN_PNGS.slice(0, 5));

    await configureAndTrainModel(page, { epochs: 4, batchSize: 4 });
    await page.getByTestId('stage-tab-make').click();

    const cards = page.getByTestId('reaction-config-card');
    for (let i = 0; i < 2; i += 1) {
      const toggle = cards.nth(i).getByTestId('reaction-counter-toggle');
      if (await toggle.isChecked()) {
        await toggle.uncheck();
      }
      await cards.nth(i).getByTestId('reaction-message-input').fill(`Mesaj ${i + 1}`);
    }

    await page.getByTestId('reaction-threshold-input').fill('0');
    await page.getByTestId('make-upload-tab').click();
    await page.getByTestId('make-file-input').setInputFiles(RED_CIRCLE_TEST_PNG);
    await page.getByTestId('make-test-btn').click();

    await expect(page.getByTestId('playground-message')).toContainText(/Mesaj [12]/);
    const counterTexts = await page
      .getByTestId('playground-stage')
      .getByTestId('reaction-counter-value')
      .allInnerTexts();
    for (const text of counterTexts) {
      expect(text).toMatch(/\b0\b/);
    }
  });

  test('T2-MAKE-04: Headless Absent/Denied Webcam in Stage 3', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, 'Üçüncü Aşama Kamera');
    await addLabel(page, 'Kırmızı');
    await addLabel(page, 'Mavi');
    await uploadFilesToBucket(page, 'Kırmızı', RED_CIRCLE_TRAIN_PNGS.slice(0, 5));
    await uploadFilesToBucket(page, 'Mavi', BLUE_SQUARE_TRAIN_PNGS.slice(0, 5));

    await configureAndTrainModel(page, { epochs: 3, batchSize: 4 });
    await page.getByTestId('stage-tab-make').click();

    await page.getByTestId('make-webcam-tab').click();
    const startBtn = page.getByRole('button', {
      name: /Canlı Kontrolcüyü Başlat|Start Live Controller/i,
    });
    if (await startBtn.isVisible()) {
      await startBtn.click();
    }
    await expect(page.getByTestId('webcam-error-banner')).toBeVisible();

    await page.getByTestId('reaction-threshold-input').fill('0');
    await page.getByTestId('make-drawing-tab').click();
    await drawShapeOnCanvas(page, 'circle', page.getByTestId('drawing-canvas'), 0);
    await page.getByTestId('make-test-btn').click();
    await expect(page.getByTestId('make-status-banner')).toBeVisible();
  });

  test('T2-MAKE-05: Zero-Counter Reset & Clipboard Fallback', async ({ page }) => {
    await gotoHome(page);
    await createProject(page, 'Sıfır Sayaç Pano');
    await addLabel(page, 'Kırmızı');
    await addLabel(page, 'Mavi');
    await uploadFilesToBucket(page, 'Kırmızı', RED_CIRCLE_TRAIN_PNGS.slice(0, 5));
    await uploadFilesToBucket(page, 'Mavi', BLUE_SQUARE_TRAIN_PNGS.slice(0, 5));

    await configureAndTrainModel(page, { epochs: 3, batchSize: 4 });
    await page.getByTestId('stage-tab-make').click();

    await page.getByTestId('reset-counters-btn').click();
    const counterTexts = await page
      .getByTestId('playground-stage')
      .getByTestId('reaction-counter-value')
      .allInnerTexts();
    for (const text of counterTexts) {
      expect(text).toMatch(/\b0\b/);
    }

    await page.getByTestId('copy-snippet-btn').click();
    await expect(page.getByTestId('copy-snippet-feedback')).toContainText(/Kopyalandı!|Copied!/);
  });
});
