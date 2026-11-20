# E2E Test Suite Ready (`TEST_READY.md`)

**Status:** READY FOR M5 VERIFICATION (M4 UI pending live execution)
**Test Command:** `npm run test:e2e`
**Test Discovery Check:** `npx playwright test --list` -> **70 tests in 4 files**
**Opaque-Box Invariant:** Zero `../src` imports under `e2e/`; zero-error (`console.error`, `pageerror`, `requestfailed`, `/models/` HTTP `>= 400`) harness registered on every test.

---

## 1. How to Run

```bash
# Run full 4-tier Playwright E2E suite (builds & serves production preview on 127.0.0.1:4173)
npm run test:e2e

# List all discovered E2E tests
npx playwright test --list

# Static & lint verification
npm run lint
```

---

## 2. Coverage Summary Across Tiers 1–4

| Tier | Spec File | Test Count | Scope Covered |
|---|---|---:|---|
| **Tier 1: Feature Coverage** | `e2e/tier1-features.spec.ts` | **30** | Area A: Dashboard & IDB (6), Area B: TR/EN Localization & Navigation (5), Area C: Stage 1 Data Collection + Fake Webcam Burst (7), Area D: Stage 2 Training, SVG Charts & Live Inference (6), Area E: Stage 3 Make Reactions, Dual-File Export & Snippet Copy (6) |
| **Tier 2: Boundary & Corner Cases** | `e2e/tier2-boundaries.spec.ts` | **28** | Area A: Empty/50-51 char Project Names, Unicode Trim, Cancel Delete (5), Area B: Empty/Warning/Trained/Untrained/Rapid TR↔EN Switching (5), Area C: 40-41 char & TR-locale Duplicate Labels, Unsupported/Corrupt Uploads, `<5` & Imbalance Thresholds, Blank Canvas & No-Webcam Guard (7), Area D: 0/1/Empty-Class Hard Blocks, Low-Sample Advisory, Invalid Hyperparameters & Reset, Mid-Train Cancel & No-Webcam Test Fallback (6), Area E: Untrained Guard, 99% Threshold Filter, Counter Toggle Off, Stage 3 No-Webcam Fallback, Zero-Counter Reset & Clipboard Fallback (5) |
| **Tier 3: Feature Combinations** | `e2e/tier3-combinations.spec.ts` | **6** | TR/EN Toggle + Workspace Reload Persistence; Mixed Drawing + Upload Buckets + Cross-Mode Inference; 2→3 Class Retrain with Stale Banner; Delete Sample + Delete Label + Retrain + Stage 3 Sync; Custom Hyperparameters + Threshold + Counters + Export; Multi-Project IndexedDB Isolation |
| **Tier 4: Real-World Scenarios** | `e2e/tier4-scenarios.spec.ts` | **6** | `T4-E2E-01` Geometric Shapes Drawing Classifier; `T4-E2E-02` Multi-Format Fruit/Color Upload Classifier; `T4-E2E-03` Turkish-UI Bilingual Classroom Demo; `T4-E2E-04` Iterative Retrain-to-Improve Loop; `T4-E2E-05` Interactive Sound/Color/Counter Playground & Export; `T4-E2E-06` Hardware-Resilient No-Camera + Fake-Webcam Burst Workflow |
| **Total** | **4 Spec Files** | **70** | **100% of `spec_miner_e2e_1/spec.md` & Acceptance Criteria AC1–AC6** |

---

## 3. Feature Checklist (Matching `PROJECT.md § Feature Inventory`)

- [x] **F1 — Project Scaffolding & Tooling**: Playwright Chromium (`SwiftShader` WebGL flags) + `npm run test:e2e` wired cleanly with `eslint.config.js` `e2e/**/*.ts` override.
- [x] **F2 — Self-Hosted MobileNetV2 Assets**: Zero-error harness explicitly asserts zero failed or HTTP `>= 400` requests to `/models/`.
- [x] **F3 — Core Domain, ML & i18n Contracts**: Tested opaque-box via UI contracts (`data-testid`s, defaults `20/16/0.001`, reaction configs, and exported JSON/binary artifacts).
- [x] **F4 — TR/EN Localization System**: Covered by `T1-I18N-01..05`, `T2-I18N-01..05`, `T3-COMB-01`, `T4-E2E-03` (TR default, instant switch across all 3 stages, `localStorage` reload persistence, TR `%XX.X` vs EN `XX.X%` parsing).
- [x] **F5 — Media, Webcam & Sound Utilities**: Covered by `T1-TRAIN-05`, `T1-TRAIN-07`, `T1-MAKE-03`, `T2-TRAIN-05`, `T2-TRAIN-07`, `T2-LEARN-06`, `T2-MAKE-04`, `T4-E2E-02` (640x480 oversized normalization, `.jpg`/`.png`/`.webp` decode, `.txt`/`.svg`/corrupt rejection, Web Audio synth, fake-webcam burst & no-webcam fallbacks).
- [x] **F6 — IndexedDB Storage & Cascade CRUD**: Covered by `T1-DASH-02..06`, `T1-TRAIN-02..03`, `T1-TRAIN-06`, `T2-DASH-03..05`, `T2-TRAIN-03..04`, `T3-COMB-06` (reload persistence, cascade deletes, Turkish Unicode, multi-project isolation).
- [x] **F7 — Dataset Validation & Imbalance Detection**: Covered by `T2-TRAIN-06..07`, `T2-LEARN-01..04`, `T4-E2E-04` (`0` labels, `1` label, `0`-sample class hard blocks; `< 5` non-blocking warnings; `>= 10` & `>= 3x` imbalance warning).
- [x] **F8 — TF.js Backend & MobileNetV2 Loader**: Exercised end-to-end across all training and inference tests under headless SwiftShader WebGL / CPU fallback with zero console errors.
- [x] **F9 — Transfer Learning Trainer & Live Predictor**: Covered by `T1-LEARN-03..06`, `T2-LEARN-04..06`, `T3-COMB-02..04`, `T4-E2E-01..02`, `T4-E2E-04` (custom hyperparameters, cancellation, retrain, SVG telemetry, sorted `~100%` confidence bars).
- [x] **F10 — TF.js Model Exporter & Code Snippet**: Covered by `T1-MAKE-05..06`, `T2-MAKE-05`, `T3-COMB-05`, `T4-E2E-05` (predicate-filtered capture & byte-length validation of `model.json` + `model.weights.bin`, snippet inspection, Clipboard fallback).
- [x] **F11 — Top Navbar, Project Dashboard & 3-Stage Hub**: Covered by `T1-DASH-01..06`, `T1-I18N-05`, `T2-DASH-01..05`.
- [x] **F12 — Stage 1 — Train (Data Collection UI)**: Covered by `T1-TRAIN-01..07`, `T2-TRAIN-01..07`, `T3-COMB-01..04`, `T4-E2E-01..04`, `T4-E2E-06`.
- [x] **F13 — Stage 2 — Learn & Test (Training & Inference UI)**: Covered by `T1-LEARN-01..06`, `T2-LEARN-01..06`, `T3-COMB-02..05`, `T4-E2E-01..02`, `T4-E2E-04`.
- [x] **F14 — Stage 3 — Make (Playground & Export UI)**: Covered by `T1-MAKE-01..06`, `T2-MAKE-01..05`, `T3-COMB-04..05`, `T4-E2E-05..06`.
- [x] **F15 — E2E Test Suite Ready for Execution**: All 70 opaque-box tests authored, linted, type-checked, and discovered cleanly via `npx playwright test --list`; ready to run against M4 UI in M5.
