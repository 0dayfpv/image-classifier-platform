<div align="center">

# 🧠 Image Classifier Studio

**Browser-Based, 100% Client-Side (Serverless) Interactive Image Classification & Transfer Learning Platform**

[![Live Demo](https://img.shields.io/badge/🚀_Live_Demo-ml.hamzafpv.com.tr-4F46E5?style=for-the-badge)](https://ml.hamzafpv.com.tr)
[![Author](https://img.shields.io/badge/🌐_Website-hamzafpv.com.tr-0F172A?style=for-the-badge)](https://hamzafpv.com.tr)

[![React](https://img.shields.io/badge/React_19-20232A?style=flat-square&logo=react&logoColor=61DAFB)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript_5.9-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite_8-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![TensorFlow.js](https://img.shields.io/badge/TensorFlow.js_4.22-FF6F00?style=flat-square&logo=tensorflow&logoColor=white)](https://www.tensorflow.org/js)
[![MobileNetV2](https://img.shields.io/badge/MobileNetV2-Transfer_Learning-10B981?style=flat-square)](https://github.com/tensorflow/tfjs-models/tree/master/mobilenet)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![IndexedDB](https://img.shields.io/badge/Storage-IndexedDB_(100%25_Local)-8B5CF6?style=flat-square)](#data-persistence--privacy)
[![Unit Tests](https://img.shields.io/badge/Vitest-111%2F111_Passed-22C55E?style=flat-square&logo=vitest&logoColor=white)](#testing--verification)
[![E2E Tests](https://img.shields.io/badge/Playwright_E2E-70%2F70_Passed-2EAD33?style=flat-square&logo=playwright&logoColor=white)](#testing--verification)
[![Localization](https://img.shields.io/badge/i18n-TR_%7C_EN-F59E0B?style=flat-square)](#key-features-3-stage-workflow)
[![License: MIT](https://img.shields.io/badge/License-MIT-3B82F6?style=flat-square)](LICENSE)

</div>

---

## 📌 Overview

**Image Classifier Studio** is an interactive, educational, and production-grade web application inspired by the *"Recognising Images"* workflow on [Machine Learning for Kids](https://machinelearningforkids.co.uk/). It runs **100% in the user's browser (WebGL-accelerated)** with zero external backend servers, databases, or API keys.

Users can collect image datasets via webcam, file upload, or an interactive drawing pad, train custom image classification models in seconds using **TensorFlow.js + MobileNetV2 Transfer Learning**, monitor live **Loss & Accuracy** telemetry charts, test real-time inference, and export their trained models (`model.json` + `model.weights.bin` + standalone HTML/JS code) with a single click.

---

## ✨ Key Features (3-Stage Workflow)

### 🗂️ Project Dashboard & Localization (`TR / EN`)
- Create, open, and delete multiple image classification projects.
- Project summary cards displaying label count, total sample count, and training status.
- Instant **Turkish (`TR`) / English (`EN`)** language switcher in the top navigation bar with `localStorage` persistence.

### 1️⃣ Stage 1: Train (Data Collection)
- Create unlimited label buckets (`+ Add New Label`), rename labels inline, and delete buckets with confirmation.
- Collect image examples per class using **3 capture modalities**:
  1. 📷 **Webcam:** Single-shot photo capture and press-and-hold **Burst Mode**.
  2. 📁 **File Upload / Drag-and-Drop:** Multi-file upload supporting `JPG`, `PNG`, and `WebP` (automatically normalized to `<= 320px`).
  3. 🎨 **Drawing Pad:** Interactive canvas with pen, eraser, color palette, and brush size controls to draw shapes directly into a class bucket.
- Per-label sample counter, thumbnail grid, individual sample deletion, **low-sample warning (`< 5` images)**, and **dataset imbalance detection**.

### 2️⃣ Stage 2: Learn & Test (In-Browser Training & Live Inference)
- **Dataset Readiness Summary:** Validates class and sample counts and displays a stale-model warning whenever labels or samples change after training.
- **Collapsible Advanced Settings:** Configure `Epochs` (default: `20`), `Batch Size` (default: `16`), and `Learning Rate` (default: `0.001`) with inline validation and one-click reset.
- **Real-Time Telemetry Charts:** Live progress bar, mid-training cancellation (`AbortController`), and pure-SVG real-time **Training Loss** & **Training Accuracy** charts.
- **Live Test Area:** Run real-time inference via **Live Webcam**, **File Upload**, or **Drawing Pad** and inspect sorted horizontal **`% confidence`** bars for all classes.

### 3️⃣ Stage 3: Make (Interactive Playground & Model Export)
- **Live Action Playground:** Assign custom reactions to each trained class — **on-screen message**, **background/accent color**, **Web Audio synthesized sound effect** (`Chime`, `Beep`, `Success`, `Alert`, `Pop`), and **counter increment** — and test the model as a real-time controller with a configurable confidence threshold (`%`).
- **One-Click TensorFlow.js Model Export:**
  - Download `model.json` and `model.weights.bin` directly from the browser.
  - Copy a ready-to-run standalone HTML/JS snippet tailored to your trained classes, featuring both **Live Webcam** and **Image File** classification (compatible with both HTTP servers and direct `file://` double-click usage via `tf.io.browserFiles`).

---

## 🔒 Data Persistence & Privacy

- **100% Local Browser Storage (`IndexedDB`):** No uploaded or captured photos ever leave the user's device. All projects, label buckets, image samples, and trained classification head weights are stored locally in the browser's `image-classifier-platform-db` IndexedDB database.
- **Strict WebGL Memory Hygiene:** Every feature extraction, training, and inference operation cleans up intermediate tensors using `tf.tidy()` and explicit `.dispose()` calls in `finally` blocks, preventing WebGL texture and GPU memory leaks.

---

## 🏗️ Architecture & Project Structure

```text
image_classifier_platform/
├── public/
│   └── models/
│       └── mobilenet_v2_1.0_224/    # Self-hosted MobileNetV2 (model.json + 4 binary weight shards)
├── src/
│   ├── types/                       # Domain, ML, and i18n TypeScript interfaces
│   ├── i18n/                        # TR / EN translation dictionaries and I18nProvider
│   ├── storage/                     # IndexedDB schema (db.ts) and atomic cascade CRUD (projectRepository.ts)
│   ├── media/                       # Image normalization, webcam service, and Web Audio synthesizer
│   ├── ml/                          # WebGL/CPU backend probe, MobileNetV2 loader, TransferClassifier, Exporter
│   ├── hooks/                       # React workspace state and training session hooks
│   └── components/                  # Dashboard, Stage 1 (Train), Stage 2 (Learn & Test), Stage 3 (Make) UI
├── tests/
│   └── unit/                        # 10 unit test suites / 111 Vitest unit tests
└── e2e/                             # 4-tier / 70-scenario Playwright browser E2E test suite
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** `>= 20` and **npm**

### Local Development

```bash
# Install dependencies
npm install

# Start Vite development server (http://localhost:5173)
npm run dev
```

### Production Build

```bash
# Run TypeScript typecheck and build production bundle into dist/
npm run build

# Preview production build locally (http://127.0.0.1:4173)
npm run preview
```

---

## 🧪 Testing & Verification

```bash
# Run ESLint static analysis
npm run lint

# Run Vitest unit test suite (111 unit tests)
npm test

# Run Playwright end-to-end browser test suite (70 E2E tests with zero-console-error harness)
npm run test:e2e
```

---

## 📄 License & Copyright

The source code is licensed under the [MIT License](LICENSE). All personal content, visuals, and branding remain All Rights Reserved.

---

<div align="center">

© 2025–2026 [hamzafpv.com.tr](https://hamzafpv.com.tr) • All rights reserved.

</div>
