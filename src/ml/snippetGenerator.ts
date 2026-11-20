import type { Locale } from '../types/i18n';

interface SnippetStrings {
  htmlLang: Locale;
  title: string;
  heading: string;
  subtitle: string;
  loadingModels: string;
  ready: string;
  selectImage: string;
  startWebcam: string;
  stopWebcam: string;
  webcamError: string;
  confidenceHeading: string;
  fileProtocolHint: string;
  selectModelFilesLabel: string;
  selectModelFilesMismatch: string;
  loadError: string;
  predictError: string;
  classFallbackPrefix: string;
}

const SNIPPET_STRINGS: Record<Locale, SnippetStrings> = {
  tr: {
    htmlLang: 'tr',
    title: 'Görsel Sınıflandırıcı — Örnek Kullanım',
    heading: 'Eğitilmiş Görsel Sınıflandırma Modeli',
    subtitle:
      'model.json ve model.weights.bin dosyalarını bu HTML dosyasıyla aynı klasöre koyun (veya aşağıdan seçin).',
    loadingModels: 'Modeller yükleniyor (MobileNetV2 + model.json)...',
    ready: 'Modeller hazır. Canlı kamerayı başlatın veya test etmek için bir görsel seçin.',
    selectImage: 'Görsel Seç (JPG, PNG, WebP)',
    startWebcam: 'Canlı Kamerayı Başlat',
    stopWebcam: 'Kamerayı Durdur',
    webcamError: 'Kamera başlatılamadı veya izin verilmedi: ',
    confidenceHeading: 'Sınıf Güven Oranları (% confidence)',
    fileProtocolHint:
      'Modelinizi yüklemek için lütfen indirdiğiniz model.json ve model.weights.bin dosyalarını aşağıdan birlikte seçin:',
    selectModelFilesLabel: '1. Adım: model.json ve model.weights.bin dosyalarını birlikte seçin',
    selectModelFilesMismatch:
      'Lütfen hem model.json hem de model.weights.bin (.bin) dosyasını aynı anda (Ctrl veya Shift basılı tutarak) seçin.',
    loadError: 'Model yüklenemedi: ',
    predictError: 'Tahmin hatası: ',
    classFallbackPrefix: 'Sınıf',
  },
  en: {
    htmlLang: 'en',
    title: 'Image Classifier — Inference Example',
    heading: 'Trained Image Classification Model',
    subtitle:
      'Place model.json and model.weights.bin in the same folder as this HTML file (or select them below).',
    loadingModels: 'Loading models (MobileNetV2 + model.json)...',
    ready: 'Models ready. Start live webcam or choose an image to classify.',
    selectImage: 'Choose Image (JPG, PNG, WebP)',
    startWebcam: 'Start Live Webcam',
    stopWebcam: 'Stop Webcam',
    webcamError: 'Could not start webcam or permission denied: ',
    confidenceHeading: 'Class Confidence (% confidence)',
    fileProtocolHint:
      'To load your model, please select both your downloaded model.json and model.weights.bin files below:',
    selectModelFilesLabel: 'Step 1: Select both model.json and model.weights.bin together',
    selectModelFilesMismatch:
      'Please select both model.json and model.weights.bin (.bin) at the same time (hold Ctrl or Shift).',
    loadError: 'Failed to load models: ',
    predictError: 'Prediction error: ',
    classFallbackPrefix: 'Class',
  },
};

export function serializeLabelsForScript(labelNames: readonly string[]): string {
  return JSON.stringify([...labelNames])
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function serializeStringForScript(value: string): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function generateInferenceSnippet(
  labelNames: readonly string[],
  locale: Locale = 'tr'
): string {
  const strings = SNIPPET_STRINGS[locale] ?? SNIPPET_STRINGS.tr;
  const serializedLabels = serializeLabelsForScript(labelNames);

  return `<!DOCTYPE html>
<html lang="${strings.htmlLang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(strings.title)}</title>
  <script src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1/dist/mobilenet.min.js"></script>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: #f8fafc;
      color: #0f172a;
      margin: 0;
      padding: 2rem 1rem;
    }
    .card {
      max-width: 560px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 1.5rem;
      box-shadow: 0 4px 20px rgba(15, 23, 42, 0.06);
    }
    h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
    p { font-size: 0.9rem; color: #475569; margin: 0 0 1rem; }
    .status {
      padding: 0.75rem 1rem;
      border-radius: 10px;
      background: #eff6ff;
      color: #1e40af;
      font-size: 0.9rem;
      margin-bottom: 1rem;
    }
    .file-fallback {
      padding: 0.9rem 1rem;
      border-radius: 10px;
      background: #fffbeb;
      border: 1px solid #fde68a;
      color: #92400e;
      font-size: 0.875rem;
      margin-bottom: 1rem;
      display: none;
    }
    .error {
      padding: 0.75rem 1rem;
      border-radius: 10px;
      background: #fef2f2;
      color: #b91c1c;
      font-size: 0.9rem;
      margin-bottom: 1rem;
      display: none;
    }
    .controls {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1rem;
    }
    .btn {
      appearance: none;
      border: none;
      border-radius: 10px;
      background: #4f46e5;
      color: #ffffff;
      font-weight: 600;
      font-size: 0.875rem;
      padding: 0.6rem 1rem;
      cursor: pointer;
      transition: background 150ms ease;
    }
    .btn:hover:not(:disabled) { background: #4338ca; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-active { background: #d97706; }
    .btn-active:hover:not(:disabled) { background: #b45309; }
    .picker { display: block; font-weight: 600; font-size: 0.875rem; }
    #preview, #webcam {
      width: 100%;
      max-height: 280px;
      object-fit: contain;
      border-radius: 10px;
      border: 1px solid #e2e8f0;
      background: #0f172a;
      display: none;
      margin-bottom: 1rem;
    }
    .result-row { margin-bottom: 0.65rem; }
    .result-meta {
      display: flex;
      justify-content: space-between;
      font-size: 0.875rem;
      font-weight: 600;
      margin-bottom: 0.25rem;
    }
    .bar-track {
      height: 10px;
      background: #e2e8f0;
      border-radius: 999px;
      overflow: hidden;
    }
    .bar-fill {
      height: 100%;
      background: #2563eb;
      border-radius: 999px;
      transition: width 150ms ease;
    }
  </style>
</head>
<body>
  <main class="card">
    <h1>${escapeHtml(strings.heading)}</h1>
    <p>${escapeHtml(strings.subtitle)}</p>

    <div id="status" class="status">${escapeHtml(strings.loadingModels)}</div>
    <div id="file-fallback" class="file-fallback">
      <div id="file-fallback-hint" style="margin-bottom: 0.5rem;"></div>
      <label style="font-weight: 600; display: block;">
        ${escapeHtml(strings.selectModelFilesLabel)}
        <input type="file" id="model-files-input" multiple accept=".json,.bin,application/json,application/octet-stream" style="display: block; margin-top: 0.35rem;" />
      </label>
    </div>
    <div id="error" class="error"></div>

    <div class="controls">
      <button type="button" id="webcam-btn" class="btn" disabled>${escapeHtml(strings.startWebcam)}</button>
      <label class="picker">
        ${escapeHtml(strings.selectImage)}
        <input type="file" id="image-input" accept="image/jpeg,image/png,image/webp,image/*" disabled />
      </label>
    </div>

    <video id="webcam" autoplay playsinline muted></video>
    <img id="preview" alt="Preview" />

    <section>
      <h2 style="font-size: 1rem; margin: 0 0 0.75rem;">${escapeHtml(strings.confidenceHeading)}</h2>
      <div id="results"></div>
    </section>
  </main>

  <script>
    const LABELS = ${serializedLabels};
    const MOBILENET_URL =
      'https://storage.googleapis.com/tfjs-models/savedmodel/mobilenet_v2_1.0_224/model.json';
    const TEXT = {
      ready: ${serializeStringForScript(strings.ready)},
      startWebcam: ${serializeStringForScript(strings.startWebcam)},
      stopWebcam: ${serializeStringForScript(strings.stopWebcam)},
      webcamError: ${serializeStringForScript(strings.webcamError)},
      fileProtocolHint: ${serializeStringForScript(strings.fileProtocolHint)},
      selectModelFilesMismatch: ${serializeStringForScript(strings.selectModelFilesMismatch)},
      loadError: ${serializeStringForScript(strings.loadError)},
      predictError: ${serializeStringForScript(strings.predictError)},
      classFallbackPrefix: ${serializeStringForScript(strings.classFallbackPrefix)}
    };

    const statusEl = document.getElementById('status');
    const fallbackEl = document.getElementById('file-fallback');
    const fallbackHintEl = document.getElementById('file-fallback-hint');
    const modelFilesInputEl = document.getElementById('model-files-input');
    const errorEl = document.getElementById('error');
    const webcamBtnEl = document.getElementById('webcam-btn');
    const webcamEl = document.getElementById('webcam');
    const inputEl = document.getElementById('image-input');
    const previewEl = document.getElementById('preview');
    const resultsEl = document.getElementById('results');

    let mobilenetModel = null;
    let headModel = null;
    let webcamStream = null;
    let webcamTimer = null;
    let isPredictingFrame = false;

    function showError(message) {
      errorEl.textContent = message;
      errorEl.style.display = 'block';
    }

    function clearError() {
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    }

    function enableControls() {
      statusEl.textContent = TEXT.ready;
      inputEl.disabled = false;
      webcamBtnEl.disabled = false;
    }

    function renderPredictions(predictions) {
      resultsEl.textContent = '';
      for (const item of predictions) {
        const row = document.createElement('div');
        row.className = 'result-row';

        const meta = document.createElement('div');
        meta.className = 'result-meta';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = item.label;

        const pctSpan = document.createElement('span');
        pctSpan.textContent = item.confidence.toFixed(1) + '%';

        meta.appendChild(nameSpan);
        meta.appendChild(pctSpan);

        const track = document.createElement('div');
        track.className = 'bar-track';

        const fill = document.createElement('div');
        fill.className = 'bar-fill';
        fill.style.width = Math.max(0, Math.min(100, item.confidence)).toFixed(1) + '%';

        track.appendChild(fill);
        row.appendChild(meta);
        row.appendChild(track);
        resultsEl.appendChild(row);
      }
    }

    async function ensureBackboneLoaded() {
      if (mobilenetModel) return mobilenetModel;
      mobilenetModel = await mobilenet.load({
        version: 2,
        alpha: 1.0,
        modelUrl: MOBILENET_URL,
        inputRange: [0, 1],
      });
      return mobilenetModel;
    }

    async function initModels() {
      try {
        await ensureBackboneLoaded();
      } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        showError(TEXT.loadError + msg);
        return;
      }

      if (window.location.protocol === 'file:') {
        fallbackHintEl.textContent = TEXT.fileProtocolHint;
        fallbackEl.style.display = 'block';
        return;
      }

      try {
        headModel = await tf.loadLayersModel('./model.json');
        enableControls();
      } catch (err) {
        fallbackHintEl.textContent = TEXT.fileProtocolHint;
        fallbackEl.style.display = 'block';
      }
    }

    modelFilesInputEl.addEventListener('change', async (event) => {
      const files = Array.from((event.target && event.target.files) || []);
      const jsonFile = files.find((f) => f.name.toLowerCase().endsWith('.json'));
      const binFile = files.find((f) => f.name.toLowerCase().endsWith('.bin'));
      if (!jsonFile || !binFile) {
        showError(TEXT.selectModelFilesMismatch);
        return;
      }
      clearError();
      try {
        await ensureBackboneLoaded();
        headModel = await tf.loadLayersModel(tf.io.browserFiles([jsonFile, binFile]));
        fallbackEl.style.display = 'none';
        enableControls();
      } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        showError(TEXT.loadError + msg);
      }
    });

    async function classifyImage(sourceEl) {
      if (!mobilenetModel || !headModel) {
        return;
      }
      const probsTensor = tf.tidy(() => {
        const emb = mobilenetModel.infer(sourceEl, true);
        return headModel.predict(emb);
      });
      try {
        const probs = await probsTensor.data();
        const names =
          LABELS.length > 0
            ? LABELS
            : Array.from({ length: probs.length }, (_, i) => TEXT.classFallbackPrefix + ' ' + (i + 1));
        const predictions = names.map((label, index) => ({
          label,
          confidence: (probs[index] ?? 0) * 100,
        }));
        predictions.sort((a, b) => b.confidence - a.confidence);
        renderPredictions(predictions);
      } finally {
        probsTensor.dispose();
      }
    }

    function stopWebcam() {
      if (webcamTimer !== null) {
        clearInterval(webcamTimer);
        webcamTimer = null;
      }
      if (webcamStream) {
        const tracks = webcamStream.getTracks ? webcamStream.getTracks() : [];
        for (const track of tracks) {
          track.stop();
        }
        webcamStream = null;
      }
      webcamEl.srcObject = null;
      webcamEl.style.display = 'none';
      webcamBtnEl.textContent = TEXT.startWebcam;
      webcamBtnEl.classList.remove('btn-active');
    }

    async function toggleWebcam() {
      if (webcamStream) {
        stopWebcam();
        return;
      }
      clearError();
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('getUserMedia API unavailable');
        }
        webcamStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        previewEl.style.display = 'none';
        webcamEl.srcObject = webcamStream;
        webcamEl.style.display = 'block';
        await webcamEl.play();
        webcamBtnEl.textContent = TEXT.stopWebcam;
        webcamBtnEl.classList.add('btn-active');

        webcamTimer = setInterval(async () => {
          if (
            !webcamStream ||
            isPredictingFrame ||
            webcamEl.readyState < 2 ||
            webcamEl.videoWidth <= 0
          ) {
            return;
          }
          isPredictingFrame = true;
          try {
            await classifyImage(webcamEl);
          } catch (err) {
            // Ignore transient frame inference error
          } finally {
            isPredictingFrame = false;
          }
        }, 250);
      } catch (err) {
        stopWebcam();
        const msg = err && err.message ? err.message : String(err);
        showError(TEXT.webcamError + msg);
      }
    }

    webcamBtnEl.addEventListener('click', () => {
      toggleWebcam();
    });

    inputEl.addEventListener('change', (event) => {
      const target = event.target;
      const file = target && target.files && target.files[0];
      if (!file) {
        return;
      }
      stopWebcam();
      clearError();
      const objectUrl = URL.createObjectURL(file);
      previewEl.onload = async () => {
        URL.revokeObjectURL(objectUrl);
        previewEl.style.display = 'block';
        try {
          await classifyImage(previewEl);
        } catch (err) {
          const msg = err && err.message ? err.message : String(err);
          showError(TEXT.predictError + msg);
        }
      };
      previewEl.onerror = () => {
        URL.revokeObjectURL(objectUrl);
      };
      previewEl.src = objectUrl;
    });

    initModels();
  </script>
</body>
</html>`;
}
