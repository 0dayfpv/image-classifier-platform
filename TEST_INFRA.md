# Test Infrastructure & E2E Architecture (`TEST_INFRA.md`)

## 1. Feature Inventory (User-Facing E2E Scope)

| Area | Feature Scope | Requirements & Milestones | Primary UI Surface |
|---|---|---|---|
| **Area A: Project Dashboard & IndexedDB Persistence** | Create, list, open, delete projects (with confirm dialog), empty state, full state persistence across `page.reload()`, multi-project isolation | R1, R2, F6, F11, AC1 | `/` (`ProjectDashboard`, `CreateProjectModal`, `ConfirmDialog`) |
| **Area B: TR/EN Localization & 3-Stage Navigation** | Turkish-first (`tr`) default UI, instant `TR ↔ EN` toggle across all stages & error states, `localStorage` persistence, `TopNavbar` & `StageStepper` | R2, F4, F11, AC3 | `TopNavbar`, `StageStepper` |
| **Area C: Stage 1 — Train (Data Collection)** | Unlimited label buckets, inline rename, delete with confirm, Drawing Pad (draw/clear/add), Multi-file Upload (JPG/PNG/WebP), Webcam capture & burst + camera-less fallback, sample counters, thumbnails, individual sample delete, `< 5` low-sample & imbalance warnings | R3, F5, F6, F12, AC2 | `TrainStage`, `LabelBucketCard`, `DrawingPad`, `FileDropzone`, `WebcamCaptureModal` |
| **Area D: Stage 2 — Learn & Test (Training & Inference)** | Dataset readiness summary & hard blocks (`0` labels, `1` label, `0`-sample class), collapsible `Gelişmiş Ayarlar` (`20`/`16`/`0.001`), fast multi-epoch MobileNetV2 transfer learning, real-time SVG Loss & Accuracy charts, cancellation, stale-model retrain, 3-mode Live Test + horizontal `% confidence` bars summing to ~100% | R1, R4, F7, F8, F9, F13, AC4, AC5 | `LearnTestStage`, `AdvancedSettings`, `TrainingMetricsChart`, `LiveTestPanel`, `ConfidenceBars` |
| **Area E: Stage 3 — Make (Playground & Model Export)** | Untrained guard, per-class reactions (message, color, Web Audio synth sound, counter), threshold filtering, counter reset, webcam + drawing/file fallback controller, dual-file TF.js export (`model.json` + `model.weights.bin`), copyable JS/HTML snippet | R5, F5, F10, F14, AC6 | `MakeStage`, `ReactionConfigList`, `PlaygroundStage`, `ModelExportPanel` |
| **Global Invariant: Zero Console & Page Errors** | Zero `console.error`, zero uncaught `pageerror`, and zero failed `/models/` requests across every test | R1, Acceptance Criteria | All routes & stages |

---

## 2. Test Architecture

### 2.1 Opaque-Box Principles & Execution Environment
- **Zero `src/` Imports:** Files under `e2e/` never import from `../src/...`. All selectors use `data-testid` contracts (`PROJECT.md § Interface Contracts`) and visible localized text (`tr` / `en`).
- **Runtime Target:** Built production preview served via `playwright.config.ts` (`http://127.0.0.1:4173`, `workers: 1`, `timeout: 90_000`, `expect.timeout: 15_000`) with Chromium SwiftShader WebGL flags and authentic self-hosted MobileNetV2 (`public/models/mobilenet_v2_1.0_224/model.json`).
- **Context Isolation:** Each Playwright `test(...)` runs in an isolated fresh `BrowserContext` (empty IndexedDB `image-classifier-platform-db` and empty `localStorage`). Reload persistence tests use `await page.reload()` inside the same test.
- **Fast Deterministic Training:** Tests first verify default hyperparameters (`Epochs = 20`, `Batch Size = 16`, `Learning Rate = 0.001`) and then set `Epochs = 3..5` (and `Batch Size = 2..4`) via `Gelişmiş Ayarlar` so genuine MobileNetV2 feature extraction + `tf.Sequential` training completes in ~3–10s while producing multi-epoch SVG chart points.
- **Hardware-Free & Fake-Webcam Modes:** Standard tests run in headless camera-less Chromium (verifying graceful `webcam-error-banner` fallback with zero `console.error`). Dedicated webcam-positive tests launch a context with `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream` and `permissions: ['camera']`.

### 2.2 Directory Layout
```text
e2e/
├── fixtures/
│   ├── generateFixtures.ts      # Pure-Node PNG encoder + Chromium JPG/WebP fixture generator
│   ├── fixturePaths.ts          # Typed absolute path registry for all E2E fixtures
│   ├── red-circle-[1-6].png     # Class A training samples (224x224 crimson circle variations)
│   ├── red-circle-test.png      # Class A held-out PNG test sample
│   ├── red-circle.jpg           # Valid JPEG sample (format coverage)
│   ├── blue-square-[1-6].png    # Class B training samples (224x224 royal blue barred square)
│   ├── blue-square-test.png     # Class B held-out PNG test sample
│   ├── blue-square.webp         # Valid WebP sample (format coverage)
│   ├── green-triangle-[1-6].png # Class C training samples (224x224 emerald triangle)
│   ├── green-triangle-test.png  # Class C held-out PNG test sample
│   ├── green-triangle.jpg       # Valid JPEG Class C sample
│   ├── oversized-circle.png     # 640x480 PNG to verify <=320px normalization
│   ├── invalid-sample.txt       # Unsupported MIME negative fixture
│   ├── invalid-icon.svg         # Unsupported SVG negative fixture
│   └── corrupted-image.png      # Corrupt bytes with .png extension (decode failure fixture)
├── helpers/
│   ├── testHarness.ts           # Zero-error harness, context isolation, drawShapeOnCanvas, captureModelExportDownloads, fake-webcam context
│   └── workflowActions.ts       # Reusable opaque-box UI flows (createProject, addLabel, uploadFixtures, trainModel, etc.)
├── tier1-features.spec.ts       # Tier 1: Core Feature Coverage (30 specified cases)
├── tier2-boundaries.spec.ts     # Tier 2: Boundary & Corner Cases (28 specified cases)
├── tier3-combinations.spec.ts   # Tier 3: Cross-Feature Pairwise Combinations (6 cases)
└── tier4-scenarios.spec.ts      # Tier 4: Real-World End-to-End Journeys (6 scenarios covering AC1–AC6)
```

### 2.3 Core Harness Modules
- **`e2e/helpers/testHarness.ts`**:
  - `registerZeroErrorHarness(options?)`: Registers `test.beforeEach` and `test.afterEach` listeners (`page.on('console')`, `page.on('pageerror')`, `page.on('requestfailed')`, `page.on('response')` for `/models/` >= 400). Fails `afterEach` if any error occurred.
  - `createIsolatedContext(browser, options?)`: Creates a fresh `BrowserContext` + `Page` with error collectors pre-attached (used for multi-context isolation).
  - `withFakeWebcamPage(fn, baseURL?)`: Launches a dedicated Chromium context with `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream` and `permissions: ['camera']` plus zero-error collectors.
  - `drawShapeOnCanvas(page, shape, canvasLocator?, variantIndex?)`: Deterministic `page.mouse.move/down/up` drawing for `'circle' | 'square' | 'triangle' | 'stroke'`.
  - `captureModelExportDownloads(page, triggerAction?)`: `Promise.all` with filename-predicated `waitForEvent('download')` for `.json` and `.bin`, parsing JSON topology/manifest and validating non-zero `.bin` byte length against manifest weight shapes.
  - `parseConfidencePercentage(text)` / `extractConfidenceBarPercentages(page)`: Handles both Turkish (`%85.2` / `%85,2`) and English (`85.2%`) formatting cleanly.
- **`e2e/helpers/workflowActions.ts`**:
  - High-level opaque-box flows (`createProject`, `addLabel`, `renameLabel`, `deleteLabel`, `drawSamplesInBucket`, `uploadSamplesToBucket`, `configureAndTrainModel`, `expectConfidenceBarsSumTo100`).
- **ESLint & TypeScript Config**:
  - `eslint.config.js` includes an override for `files: ['e2e/**/*.ts']` enabling `...globals.node` alongside `...globals.browser` and disabling `react-hooks`/`react-refresh` rules.
  - All `e2e/**/*.ts` files import Node modules via `node:` protocol (`node:fs`, `node:path`, `node:zlib`, `node:buffer`, `node:url`) and pass strict TypeScript checks.

---

## 3. 4-Tier Coverage Thresholds

| Tier | Objective | Minimum Threshold | Specified Coverage |
|---|---|---|---|
| **Tier 1: Feature Coverage** | Self-contained happy-path verification of every user-facing feature | `>= 5` tests per feature area (Areas A–E) | **30** cases (`A: 6, B: 5, C: 7, D: 6, E: 6`) in `e2e/tier1-features.spec.ts` |
| **Tier 2: Boundary & Corner Cases** | Input limits, TR-locale duplicates, `< 5` / imbalance gates, invalid hyperparameters, hardware/untrained guards | `>= 5` tests per feature area (Areas A–E) | **28** cases (`A: 5, B: 5, C: 7, D: 6, E: 5`) in `e2e/tier2-boundaries.spec.ts` |
| **Tier 3: Feature Combinations** | Pairwise cross-feature interactions (bilingual+reload, mixed drawing+upload, 2→3 class retrain, delete+retrain+Make sync, custom Make+export, multi-project isolation) | `>= 4` cross-feature combination tests | **6** combination tests in `e2e/tier3-combinations.spec.ts` |
| **Tier 4: Real-World Scenarios** | Complete end-to-end user journeys from cold start to export/reload | `>= 5` scenarios covering all 6 Acceptance Criteria (`AC1–AC6`) | **6** full scenarios in `e2e/tier4-scenarios.spec.ts` |

**Suite Acceptance Gate:**
- `npx playwright test --list` discovers all Tiers 1–4 cleanly with zero syntax/TS errors.
- `npm run lint` passes with zero errors across `src/`, `tests/`, and `e2e/`.
- `npm run test:e2e` exits `0` with **100% pass rate, zero `console.error`, and zero `pageerror`**.

---

## 4. Tier 4 Scenarios (`e2e/tier4-scenarios.spec.ts`)

| ID | Scenario | End-to-End Journey Summary | Acceptance Criteria |
|---|---|---|---|
| `T4-E2E-01` | **Geometric Shapes Classifier (Drawing Pad Workflow)** | Cold start TR -> create `"Geometrik Şekiller"` -> `"Daire"` & `"Kare"` buckets -> draw 3+3 shapes (`< 5` warning) -> delete 1 sample (`3 -> 2`) -> reach 5+5 (warning clears) -> `page.reload()` persistence -> Stage 2 `Gelişmiş Ayarlar` (`Epochs=5`) -> SVG Loss/Accuracy updates -> Live Test Drawing Pad (`~100%` bars) | AC1, AC2, AC4, AC5 |
| `T4-E2E-02` | **Fruit / Color Upload Classifier (Multi-Format & Negative Guard)** | Create `"Meyve Renk Sınıflandırıcı"` -> upload PNG/JPG/WebP red vs green fixtures (`3 örnek`, `< 5` warning) -> upload `invalid-sample.txt` (rejected cleanly) -> reach 5+5 -> reload -> Stage 2 `Epochs=4` train -> unseen PNG test predicts expected class | AC1, AC2, AC4, AC5 |
| `T4-E2E-03` | **Turkish-UI Classroom Demo (Full Bilingual TR/EN Journey)** | Verify TR default -> create `"Sınıf Nesneleri"` with `"Çiçek"`, `"Şişe"`, `"Gözlük"` -> `< 5` warnings in TR -> switch `TR → EN` across all 3 stages -> `page.reload()` preserves EN & Turkish label Unicode -> switch `EN → TR` | AC1, AC2, AC3 |
| `T4-E2E-04` | **Retrain-to-Improve Iterative ML Workflow** | Start with 2+2 samples -> verify `lowSampleAdvisory` is non-blocking -> train `Epochs=3` -> return to Stage 1, expand to 5+5 and add 3rd class `"Sınıf C"` (5 samples) -> observe `staleModelBanner` -> retrain `Epochs=4` -> Live Test outputs 3 confidence bars summing to `~100%` | AC2, AC4, AC5 |
| `T4-E2E-05` | **Interactive Controller & Model Export (Stage 3 Make)** | Train 2-class `"Kırmızı"` vs `"Mavi"` (`Epochs=4`) -> configure messages, colors, Web Audio sounds, counters -> trigger reactions via Upload & Drawing -> verify counters & reset -> export `model.json` + `model.weights.bin` (JSON + `.bin` byte validation) -> verify & copy JS/HTML snippet | AC4, AC5, AC6 |
| `T4-E2E-06` | **Hardware-Resilient Classroom & Fake-Webcam Burst Workflow** | Part A: camera-less headless context verifies friendly fallback banners in Stages 1, 2, 3 with 0 `console.error` + drawing/upload fallback. Part B: `--use-fake-device-for-media-stream` context performs single-shot + 600ms press-and-hold burst capture, trains, and runs live webcam preview cleanly | R1, R3, R4, R5 hardware resilience |
