# Project: Image Classifier Platform

## Architecture

A 100% client-side, serverless React + TypeScript + Vite + Tailwind CSS v4 web application inspired by the "Recognising Images" 3-stage workflow on `https://machinelearningforkids.co.uk/`, with a Turkish-first (`tr`) UI, instant `TR / EN` language switching, MobileNetV2 transfer learning (`@tensorflow/tfjs` + `@tensorflow-models/mobilenet`), and browser IndexedDB persistence (`idb`).

### Architectural Pillars
1. **Clean Layered Dependency Direction**:
   - `src/types/` imports nothing (pure TypeScript contracts).
   - `src/i18n/`, `src/storage/`, `src/ml/`, and `src/media/` depend only on `src/types/` and external libraries (`@tensorflow/tfjs`, `@tensorflow-models/mobilenet`, `idb`). They NEVER import React components.
   - `src/hooks/` bridges `storage/`, `ml/`, and `media/` to React state and manages `AbortController` and `dispose()` cleanup on unmount or project switch.
   - `src/components/` renders the 3-stage UI (**Dashboard -> 1. Eğit / Train -> 2. Öğren ve Test Et / Learn & Test -> 3. Üret / Make**) and wires events via hooks.
2. **Self-Hosted Authentic MobileNetV2 (`public/models/mobilenet_v2_1.0_224/`)**:
   - Survey verified that `@tensorflow-models/mobilenet@2.1.1`'s default `tfhub.dev` URLs return HTTP 404 even online, and the command sandbox blocks external DNS.
   - Authentic Google MobileNetV2 (`1.0_224`, 299 graph nodes, `AvgPool` 1280-d embedding node, ~13.44 MiB total) is live on `storage.googleapis.com` and fetched once during setup into `public/models/mobilenet_v2_1.0_224/`.
   - Loaded locally with explicit `inputRange: [0, 1]` (mandatory because `mobilenet.load()` defaults `inputRange` to `[-1, 1]` whenever `modelUrl` is provided, whereas the TFHub/GCS graph already normalizes `[0, 1]` -> `[-1, 1]`), with fallback to `storage.googleapis.com` if local files are absent.
3. **Zero-Console-Error & WebGL Memory Discipline**:
   - `src/ml/backend.ts` quietly probes `canvas.getContext('webgl2' | 'webgl')` + `MAX_TEXTURE_SIZE` before invoking `tf.setBackend('webgl')`, falling back directly to `'cpu'` in headless browsers without GPU to prevent `console.error`.
   - All feature extraction and inference operations use `tf.tidy()` and explicit `.dispose()` in `finally` blocks, disposing prior trained `tf.LayersModel` instances on retrain/unmount.
   - Pure SVG Loss & Accuracy charts avoid third-party `ResizeObserver` console warnings.
   - Web Audio API synthesizer (`src/media/soundSynth.ts`), Webcam service (`src/media/webcamService.ts`), and Clipboard fallback handle absent hardware/permissions cleanly with zero uncaught errors.
4. **IndexedDB Persistence**:
   - `idb`-backed `image-classifier-platform-db` (`projects`, `labels`, `samples`) stores normalized `<= 320px` DataURLs (~10–25 KB/sample) and supports single-transaction atomic cascade deletes.
   - Trained classification heads can also persist/rehydrate via `indexeddb://` or IDB artifacts keyed by `projectId`, cleanly invalidated/marked stale when label counts change.

---

## Feature Inventory

Every feature from the Survey phase (`ORIGINAL_REQUEST.md`, `spec_miner_survey_1`, `explorer_survey_1`, `explorer_survey_2`) is assigned a milestone below:

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | Project Scaffolding & Tooling | Vite 8 + React 19 + TS ~5.9.3 + Tailwind v4 + Vitest 5 (`fake-indexeddb`) + Playwright Chromium (`SwiftShader` WebGL config) | M1 | explorer_survey_1 |
| F2 | Self-Hosted MobileNetV2 Assets | Download & verify authentic MobileNetV2 `1.0_224` (`model.json` + 4 shards) into `public/models/mobilenet_v2_1.0_224/` | M1 | explorer_survey_1 |
| F3 | Core Domain, ML & i18n Types | Shared TS interfaces (`ProjectRecord`, `LabelBucketRecord`, `SampleRecord`, `TrainingConfig`, `EpochTelemetry`, `ClassPrediction`, `FeatureExtractor`, `ExportArtifacts`) | M1 | explorer_survey_2 |
| F4 | TR/EN Localization System | Turkish-first (`tr`) default UI + instant `TR / EN` switcher in top navbar, `localStorage` persistence, 100% key parity enforced by unit test | M1 | R2, spec_miner_survey_1 |
| F5 | Media, Webcam & Sound Utilities | `imageProcessor` (`<= 320px` white-bg normalization, JPG/PNG/WebP MIME check), `webcamService` (single + burst, graceful `NotAllowedError`/`NotFoundError`), `soundSynth` (Web Audio zero-asset synth) | M1 | R1, R3, R5, explorer_survey_2 |
| F6 | IndexedDB Storage & Cascade CRUD | `idb` database (`projects`, `labels`, `samples`), project/label/sample/reaction CRUD, Turkish Unicode label support, duplicate check, atomic cascade deletes, `QuotaExceededError` handling | M2 | R1, R2, R3, spec_miner_survey_1 |
| F7 | Dataset Validation & Imbalance Detection | Pure validation: `< 2` classes or `0`-sample classes hard-block training; `< 5` samples triggers non-blocking low-sample warning; imbalance ratio warning | M2 | R3, R4, spec_miner_survey_1 |
| F8 | TF.js Backend & MobileNetV2 Loader | Quiet WebGL probe + CPU fallback (`backend.ts`), local-first MobileNetV2 loader with `inputRange: [0, 1]` and GCS fallback (`mobilenetLoader.ts`), embedding cache (`featureCache.ts`) | M3 | R1, explorer_survey_1, explorer_survey_2 |
| F9 | Transfer Learning Trainer & Live Predictor | `tf.Sequential` head (`Dense(100, relu) -> Dropout(0.25) -> Dense(C, softmax)`), Adam optimizer, Fisher-Yates pre-shuffle, adaptive `validationSplit`, `onEpochEnd` telemetry, `AbortSignal`, `tf.tidy()`/`.dispose()`, sorted softmax predictions (~100%) | M3 | R1, R4, explorer_survey_2 |
| F10 | TF.js Model Exporter & Code Snippet | Custom `tf.io.withSaveHandler` exporting `model.json` + `model.weights.bin` (150ms spaced) + copyable standalone JS/HTML snippet loading MobileNetV2 + exported head | M3 | R5, explorer_survey_2 |
| F11 | Top Navbar, Project Dashboard & 3-Stage Hub | Top nav (logo/home, project breadcrumb, 3-stage stepper, TR/EN toggle), Project Dashboard (list, create, open, delete with confirm, empty state) | M4 | R2, spec_miner_survey_1 |
| F12 | Stage 1 — Train (Data Collection UI) | Unlimited label buckets (`+ Yeni Etiket Ekle` / `+ Add New Label`), inline rename/delete, Webcam modal (single + press-and-hold burst), multi-file Upload/DnD (JPG/PNG/WebP), interactive Drawing Pad, counters, thumbnails, individual delete, `< 5` & imbalance warnings | M4 | R3, spec_miner_survey_1 |
| F13 | Stage 2 — Learn & Test (Training & Inference UI) | Dataset readiness summary, collapsible `Gelişmiş Ayarlar` (`Epochs=20`, `Batch Size=16`, `Learning Rate=0.001`), `Modeli Eğit` button, live progress bar, pure-SVG real-time Loss & Accuracy charts, Live Test Area (Webcam stream, File Upload, Drawing Pad) with horizontal `% confidence` bars | M4 | R4, spec_miner_survey_1 |
| F14 | Stage 3 — Make (Playground & Export UI) | Per-class reaction configurator (custom message, highlight/bg color, Web Audio sound, counter toggle), Live Action Playground (Webcam + Drawing/File fallback, confidence threshold, counter reset), Model Export (`model.json` + `.bin` download) & copyable JS/HTML snippet with Clipboard fallback | M4 | R5, spec_miner_survey_1 |
| F15 | E2E Test Suite Pass & Adversarial Hardening | Pass 100% of opaque-box Playwright E2E suite (Tiers 1–4) with zero page/console errors; complete Tier 5 adversarial coverage hardening & final verification | M5 | Acceptance Criteria |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | `M1_foundation` | Scaffolding (`package.json`, Vite/Vitest/Playwright/Tailwind configs), `npm install` + Chromium install, MobileNetV2 local asset script + verification, `src/types/`, `src/i18n/`, `src/media/`, unit tests for i18n & media | none | DONE (Iter 1: 32 unit tests, build, lint, Playwright WebGL2+MobileNet verified) |
| M2 | `M2_storage` | IndexedDB repository (`src/storage/db.ts`, `projectRepository.ts`), dataset validation (`src/ml/datasetValidation.ts`), unit tests with `fake-indexeddb` | M1 | DONE (Iter 1: 49 new tests / 81 total, real Chromium IDB reload verified) |
| M3 | `M3_ml_engine` | Quiet WebGL/CPU backend (`src/ml/backend.ts`), MobileNetV2 loader (`mobilenetLoader.ts`), feature cache (`featureCache.ts`), transfer learning & predictor (`transferClassifier.ts`), model exporter (`modelExporter.ts`), snippet generator (`snippetGenerator.ts`), TF.js unit & tensor-leak tests | M1 | DONE (Iter 1: 30 new tests / 111 total, Auditor CLEAN) |
| M4 | `M4_ui_app` | React hooks (`src/hooks/`), full TR-first + TR/EN UI (`src/components/layout/`, `dashboard/`, `train/`, `learn/`, `make/`, `App.tsx`, `main.tsx`), `npm run build` + `npm run lint` + `vitest` verification | M2, M3 | DONE (Iter 1: 0 lint/type/build errors, 111 unit tests passing) |
| M5 | `M5_final_verification` | Pass 100% E2E test suite (Tiers 1–4, 70 Playwright tests, zero console/page errors) + build & unit verification | M4 (+ TEST_READY.md) | DONE (70/70 Playwright E2E tests & 111/111 unit tests PASSED with 0 console/page errors) |

*(Parallel E2E Testing Track: `E2E_testing_track` runs concurrently to build `TEST_INFRA.md`, opaque-box Playwright Tiers 1–4 in `e2e/`, and publishes `TEST_READY.md`.)*

---

## Interface Contracts

### `src/types/domain.ts`
- `StageId = 'train' | 'learn' | 'make'`
- `SampleSource = 'webcam' | 'upload' | 'drawing'`
- `SynthSoundId = 'none' | 'chime' | 'beep' | 'success' | 'alert' | 'pop'`
- `TrainingConfig`: `{ epochs: number; batchSize: number; learningRate: number }` (defaults: `20`, `16`, `0.001`)
- `ReactionConfig`: `{ labelId: string; message: string; backgroundColor: string; accentColor: string; sound: SynthSoundId; enableCounter: boolean }`
- `ProjectRecord`: `{ id: string; name: string; createdAt: number; updatedAt: number; trainingConfig: TrainingConfig; lastTrainedAt?: number; trainedLabelOrder?: string[]; reactions: Record<string, ReactionConfig> }`
- `LabelBucketRecord`: `{ id: string; projectId: string; name: string; color: string; order: number; createdAt: number }`
- `SampleRecord`: `{ id: string; projectId: string; labelId: string; dataUrl: string; mimeType: 'image/jpeg' | 'image/png' | 'image/webp'; width: number; height: number; source: SampleSource; createdAt: number }`

### `src/types/ml.ts`
- `BackendName = 'webgl' | 'cpu'`
- `TrainingPhase = 'idle' | 'loading_backbone' | 'extracting_features' | 'training' | 'completed' | 'cancelled' | 'error'`
- `EpochTelemetry`: `{ epoch: number; totalEpochs: number; loss: number; accuracy: number; valLoss?: number; valAccuracy?: number }`
- `TrainingProgress`: `{ phase: TrainingPhase; extractedCount: number; totalSamples: number; currentEpoch: number; totalEpochs: number; backend: BackendName | null }`
- `ClassPrediction`: `{ labelId: string; labelName: string; probability: number; percentage: number }`
- `DatasetValidationResult`: `{ isValidToTrain: boolean; totalClasses: number; nonEmptyClasses: number; totalSamples: number; emptyLabelIds: string[]; lowSampleLabelIds: string[]; imbalancedLabelIds: string[]; blockingReason?: 'NO_LABELS' | 'FEWER_THAN_TWO_CLASSES' | 'EMPTY_CLASSES_PRESENT' }`
- `ImageInputSource = HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | ImageData`
- `FeatureExtractor`: `{ readonly embeddingDim: number; extractEmbedding(input: ImageInputSource): tf.Tensor2D }`
- `ExportArtifacts`: `{ modelJsonText: string; weightsBuffer: ArrayBuffer; fileNames: { json: string; weights: string } }`

### `storage` ↔ `hooks/UI`
- `projectRepository`:
  - `listProjects(): Promise<ProjectRecord[]>`
  - `getProject(id: string): Promise<ProjectRecord | undefined>`
  - `createProject(name: string): Promise<ProjectRecord>`
  - `updateProject(project: ProjectRecord): Promise<ProjectRecord>`
  - `deleteProject(projectId: string): Promise<void>` (single-tx cascade across `projects`, `labels`, `samples`)
  - `listLabels(projectId: string): Promise<LabelBucketRecord[]>`
  - `createLabel(projectId: string, name: string): Promise<LabelBucketRecord>` (rejects empty or case-insensitive duplicate)
  - `renameLabel(labelId: string, newName: string): Promise<LabelBucketRecord>`
  - `deleteLabel(labelId: string): Promise<void>` (single-tx cascade across `labels`, `samples`)
  - `listSamples(projectId: string): Promise<SampleRecord[]>`
  - `addSample(input: Omit<SampleRecord, 'id' | 'createdAt'>): Promise<SampleRecord>`
  - `deleteSample(sampleId: string): Promise<void>`

### `ml` ↔ `hooks/UI`
- `initTfBackend(): Promise<BackendName>`
- `loadMobileNetExtractor(): Promise<FeatureExtractor>`
- `TransferClassifier`:
  - `constructor(extractor: FeatureExtractor, featureCache?: FeatureCache)`
  - `train(labels: LabelBucketRecord[], samples: SampleRecord[], config: TrainingConfig, callbacks: { onProgress?: (p: TrainingProgress) => void; onEpochEnd?: (t: EpochTelemetry) => void }, abortSignal?: AbortSignal): Promise<void>`
  - `predict(input: ImageInputSource): Promise<ClassPrediction[]>`
  - `exportModel(triggerDownload?: boolean): Promise<ExportArtifacts>`
  - `getTrainedLabels(): LabelBucketRecord[]`
  - `isTrained(): boolean`
  - `dispose(): void`
- `validateDataset(labels: LabelBucketRecord[], samples: SampleRecord[]): DatasetValidationResult`
- `generateInferenceSnippet(labelNames: string[], locale: 'tr' | 'en'): string`

### UI Entry Points & `data-testid` Contract (for E2E & Accessibility)
- Default route `/` shows Dashboard (`tr` default language, `<html lang="tr">`, `localStorage['app_language']`).
- **UX Flow Invariants (Locked for M4 & E2E)**:
  1. Submitting `project-create-submit` or clicking `project-open-btn` navigates directly into **Stage 1 (`1. Eğit`)** with the Top Navbar `StageStepper` (`stage-tab-train`, `stage-tab-learn`, `stage-tab-make`) immediately mounted. Clicking `nav-home` returns to Dashboard (`/`).
  2. `data-testid="drawing-canvas"` and `data-testid="drawing-clear-btn"` are reused across Stage 1 Drawing Modal, Stage 2 `live-test-drawing-tab`, and Stage 3 `make-drawing-tab` (only one stage/pad is mounted at a time).
  3. Selecting a file via `live-test-file-input` or `make-file-input` displays a preview and keeps `live-test-predict-btn` / `make-test-btn` clickable to trigger (or re-trigger) classification/reaction deterministically.
  4. In Stage 3, `data-testid="reaction-counter-value"` renders per trained class inside `playground-stage` (alongside visible class name) so per-class counters can be scoped cleanly.
  5. `delete-sample-btn` remains mounted without `display: none` (`visibility: visible`, e.g., compact corner badge with `opacity-85 hover:opacity-100`).
  6. `imbalance-warning` renders in Stage 1 header/banner whenever `validation.imbalancedLabelIds.length > 0` (`maxCount >= 10 && maxCount >= 3 * minNonZeroCount`).
- Top Navbar:
  - `data-testid="nav-home"` (Projects link), `data-testid="nav-project-title"` (active project breadcrumb)
  - `data-testid="lang-toggle-tr"`, `data-testid="lang-toggle-en"`
  - Stage stepper tabs (when inside a project): `data-testid="stage-tab-train"`, `data-testid="stage-tab-learn"`, `data-testid="stage-tab-make"`
- Dashboard & Common Confirm Dialog:
  - `data-testid="dashboard-empty-state"`, `data-testid="project-create-btn"`, `data-testid="project-name-input"`, `data-testid="project-name-error"`, `data-testid="project-create-submit"`
  - `data-testid="project-card"`, `data-testid="project-open-btn"`, `data-testid="project-delete-btn"`, `data-testid="confirm-dialog-confirm"`, `data-testid="confirm-dialog-cancel"`
- Stage 1 (Train):
  - `data-testid="add-label-btn"`, `data-testid="label-name-input"`, `data-testid="label-form-error"`, `data-testid="label-create-submit"`, `data-testid="train-empty-buckets"`, `data-testid="train-error-banner"`, `data-testid="imbalance-warning"`, `data-testid="proceed-to-learn-btn"`
  - Per bucket (`data-testid="label-bucket"`): `data-testid="label-bucket-name"`, `data-testid="label-rename-btn"`, `data-testid="label-rename-input"`, `data-testid="label-rename-save-btn"`, `data-testid="label-rename-cancel-btn"`, `data-testid="label-delete-btn"`, `data-testid="label-sample-count"`, `data-testid="low-sample-warning"`, `data-testid="open-webcam-btn"`, `data-testid="file-upload-input"`, `data-testid="open-drawing-pad-btn"`, `data-testid="sample-thumbnail"`, `data-testid="delete-sample-btn"`
  - Drawing modal / pad: `data-testid="drawing-canvas"`, `data-testid="drawing-pen-btn"`, `data-testid="drawing-eraser-btn"`, `data-testid="drawing-clear-btn"`, `data-testid="drawing-auto-clear-toggle"`, `data-testid="drawing-add-sample-btn"`, `data-testid="drawing-error-banner"`, `data-testid="drawing-close-btn"`
  - Webcam modal: `data-testid="webcam-capture-btn"`, `data-testid="webcam-burst-btn"`, `data-testid="webcam-error-banner"`, `data-testid="webcam-close-btn"`
- Stage 2 (Learn & Test):
  - `data-testid="dataset-summary"`, `data-testid="readiness-banner"`, `data-testid="stale-model-banner"`
  - `data-testid="advanced-settings-toggle"`, `data-testid="input-epochs"`, `data-testid="input-batch-size"`, `data-testid="input-learning-rate"`, `data-testid="reset-defaults-btn"`, `data-testid="advanced-settings-error"`
  - `data-testid="train-model-btn"`, `data-testid="cancel-training-btn"`, `data-testid="training-progress"`, `data-testid="training-status"`
  - `data-testid="loss-chart"`, `data-testid="accuracy-chart"`, `data-testid="latest-loss"`, `data-testid="latest-accuracy"`
  - Live Test Area: `data-testid="live-test-webcam-tab"`, `data-testid="live-test-upload-tab"`, `data-testid="live-test-drawing-tab"`, `data-testid="live-test-file-input"`, `data-testid="live-test-predict-btn"`, `data-testid="predicted-class"`, `data-testid="confidence-bars"`, `data-testid="confidence-bar"`
- Stage 3 (Make):
  - `data-testid="make-untrained-guard"`, `data-testid="reaction-threshold-input"`, `data-testid="make-status-banner"`
  - `data-testid="reaction-config-card"`, `data-testid="reaction-message-input"`, `data-testid="reaction-color-input"`, `data-testid="reaction-sound-select"`, `data-testid="reaction-counter-toggle"`
  - `data-testid="playground-stage"`, `data-testid="playground-message"`, `data-testid="reaction-counter-value"`, `data-testid="reset-counters-btn"`
  - `data-testid="make-webcam-tab"`, `data-testid="make-drawing-tab"`, `data-testid="make-upload-tab"`, `data-testid="make-test-btn"`, `data-testid="make-file-input"`
  - `data-testid="export-model-btn"`, `data-testid="export-status"`, `data-testid="export-snippet-code"`, `data-testid="copy-snippet-btn"`, `data-testid="copy-snippet-feedback"`

---

## Code Layout

```text
image_classifier_platform/
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── vite.config.ts
├── vitest.config.ts
├── playwright.config.ts
├── eslint.config.js
├── scripts/
│   └── download-mobilenet.mjs
├── public/
│   └── models/
│       └── mobilenet_v2_1.0_224/
│           ├── model.json
│           └── group1-shard[1-4]of4
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   ├── types/
│   │   ├── domain.ts
│   │   ├── ml.ts
│   │   └── i18n.ts
│   ├── i18n/
│   │   ├── locales/
│   │   │   ├── tr.ts
│   │   │   └── en.ts
│   │   └── I18nContext.tsx
│   ├── storage/
│   │   ├── db.ts
│   │   └── projectRepository.ts
│   ├── ml/
│   │   ├── backend.ts
│   │   ├── mobilenetLoader.ts
│   │   ├── featureCache.ts
│   │   ├── transferClassifier.ts
│   │   ├── modelExporter.ts
│   │   ├── snippetGenerator.ts
│   │   └── datasetValidation.ts
│   ├── media/
│   │   ├── imageProcessor.ts
│   │   ├── webcamService.ts
│   │   └── soundSynth.ts
│   ├── hooks/
│   │   ├── useProjectWorkspace.ts
│   │   ├── useTrainingSession.ts
│   │   ├── useWebcam.ts
│   │   └── useModelRuntime.ts
│   └── components/
│       ├── common/
│       │   ├── ConfirmDialog.tsx
│       │   └── AlertBanner.tsx
│       ├── layout/
│       │   ├── TopNavbar.tsx
│       │   └── StageStepper.tsx
│       ├── dashboard/
│       │   ├── ProjectDashboard.tsx
│       │   └── CreateProjectModal.tsx
│       ├── train/
│       │   ├── TrainStage.tsx
│       │   ├── LabelBucketCard.tsx
│       │   ├── WebcamCaptureModal.tsx
│       │   ├── FileDropzone.tsx
│       │   └── DrawingPad.tsx
│       ├── learn/
│       │   ├── LearnTestStage.tsx
│       │   ├── AdvancedSettings.tsx
│       │   ├── TrainingMetricsChart.tsx
│       │   ├── LiveTestPanel.tsx
│       │   └── ConfidenceBars.tsx
│       └── make/
│           ├── MakeStage.tsx
│           ├── ReactionConfigList.tsx
│           ├── PlaygroundStage.tsx
│           └── ModelExportPanel.tsx
├── tests/
│   ├── setup.ts
│   ├── unit/
│   │   ├── i18nCompleteness.test.ts
│   │   ├── imageProcessor.test.ts
│   │   ├── projectRepository.test.ts
│   │   ├── datasetValidation.test.ts
│   │   ├── mobilenetLoader.test.ts
│   │   └── transferClassifier.test.ts
│   └── integration/
│       └── workspaceFlow.test.tsx
└── e2e/
    ├── fixtures/
    └── ...
```
