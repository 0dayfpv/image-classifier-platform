import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterEach,
} from 'vitest';
import * as tf from '@tensorflow/tfjs';
import {
  exportLayersModel,
  normalizeWeightBuffer,
} from '../../src/ml/modelExporter';
import {
  generateInferenceSnippet,
  serializeLabelsForScript,
} from '../../src/ml/snippetGenerator';

function createTestHeadModel(): tf.Sequential {
  const model = tf.sequential({
    layers: [
      tf.layers.dense({
        inputShape: [16],
        units: 100,
        activation: 'relu',
        kernelInitializer: 'varianceScaling',
      }),
      tf.layers.dropout({ rate: 0.25 }),
      tf.layers.dense({
        units: 3,
        activation: 'softmax',
        kernelInitializer: 'varianceScaling',
      }),
    ],
  });
  model.compile({
    optimizer: 'adam',
    loss: 'categoricalCrossentropy',
  });
  return model;
}

describe('modelExporter & snippetGenerator', () => {
  beforeAll(async () => {
    await tf.setBackend('cpu');
    await tf.ready();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('exports a real tf.sequential head model to valid model.json and exact-size weightsBuffer', async () => {
    const model = createTestHeadModel();
    try {
      const artifacts = await exportLayersModel(model, {
        triggerDownload: false,
        labelNames: ['Elma', 'Armut', 'Muz'],
      });

      expect(artifacts.fileNames).toEqual({
        json: 'model.json',
        weights: 'model.weights.bin',
      });

      const parsed = JSON.parse(artifacts.modelJsonText) as tf.io.ModelJSON;
      expect(parsed.modelTopology).toBeDefined();
      expect(parsed.format).toBe('layers-model');
      expect(parsed.generatedBy).toBeTruthy();
      expect(parsed.convertedBy).toBeNull();
      expect(parsed.weightsManifest).toHaveLength(1);
      expect(parsed.weightsManifest[0]?.paths).toEqual(['model.weights.bin']);
      expect(parsed.weightsManifest[0]?.weights).toHaveLength(4);
      expect(parsed.userDefinedMetadata).toEqual({
        labels: ['Elma', 'Armut', 'Muz'],
      });

      // (16*100 + 100 + 100*3 + 3) * 4 bytes = 2003 * 4 = 8012 bytes
      expect(artifacts.weightsBuffer).toBeInstanceOf(ArrayBuffer);
      expect(artifacts.weightsBuffer.byteLength).toBe(8012);
    } finally {
      model.dispose();
    }
  });

  it('round-trips exported artifacts via single-arg tf.io.fromMemory with zero console.warn and identical predictions', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const baselineTensors = tf.memory().numTensors;

    const original = createTestHeadModel();
    let loaded: tf.LayersModel | null = null;
    let sampleInput: tf.Tensor2D | null = null;
    let origOut: tf.Tensor | null = null;
    let loadedOut: tf.Tensor | null = null;

    try {
      const artifacts = await exportLayersModel(original, {
        triggerDownload: false,
        labelNames: ['Elma', 'Armut', 'Muz'],
      });

      const parsedJson = JSON.parse(artifacts.modelJsonText) as tf.io.ModelJSON;
      const modelArtifacts: tf.io.ModelArtifacts = {
        modelTopology: parsedJson.modelTopology,
        format: parsedJson.format,
        generatedBy: parsedJson.generatedBy,
        convertedBy: parsedJson.convertedBy,
        weightSpecs: parsedJson.weightsManifest.flatMap((g) => g.weights),
        weightData: artifacts.weightsBuffer,
        userDefinedMetadata: parsedJson.userDefinedMetadata,
      };

      loaded = await tf.loadLayersModel(tf.io.fromMemory(modelArtifacts));
      expect(loaded.getUserDefinedMetadata()).toEqual({
        labels: ['Elma', 'Armut', 'Muz'],
      });

      sampleInput = tf.tensor2d(
        Array.from({ length: 16 }, (_, i) => (i + 1) * 0.1),
        [1, 16]
      );
      origOut = original.predict(sampleInput) as tf.Tensor;
      loadedOut = loaded.predict(sampleInput) as tf.Tensor;

      const origData = await origOut.data();
      const loadedData = await loadedOut.data();
      expect(loadedData).toHaveLength(3);
      for (let i = 0; i < 3; i++) {
        expect(loadedData[i]).toBeCloseTo(origData[i]!, 6);
      }

      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      sampleInput?.dispose();
      origOut?.dispose();
      loadedOut?.dispose();
      loaded?.dispose();
      original.dispose();
    }

    expect(tf.memory().numTensors).toBe(baselineTensors);
  });

  it('normalizes undefined, single ArrayBuffer, sharded ArrayBuffer[], and ArrayBufferView weightData', () => {
    const empty = normalizeWeightBuffer(undefined);
    expect(empty.byteLength).toBe(0);

    const single = new Uint8Array([1, 2, 3, 4]).buffer;
    const singleCopy = normalizeWeightBuffer(single);
    expect(singleCopy).not.toBe(single);
    expect(Array.from(new Uint8Array(singleCopy))).toEqual([1, 2, 3, 4]);

    const shard1 = new Uint8Array([10, 20]).buffer;
    const shard2 = new Uint8Array([30, 40, 50]).buffer;
    const shard3 = new Uint8Array([60]).buffer;
    const merged = normalizeWeightBuffer([shard1, shard2, shard3]);
    expect(Array.from(new Uint8Array(merged))).toEqual([10, 20, 30, 40, 50, 60]);

    const backing = new Uint8Array([99, 7, 8, 9, 88]);
    const subview = backing.subarray(1, 4);
    const viewCopy = normalizeWeightBuffer(subview as unknown as tf.io.WeightData);
    expect(Array.from(new Uint8Array(viewCopy))).toEqual([7, 8, 9]);
  });

  it('stages browser Blob downloads with 150ms stagger, 10000ms URL revocation, and zero leftover anchors', async () => {
    vi.useFakeTimers();
    const model = createTestHeadModel();

    let urlCounter = 0;
    const createObjectURLSpy = vi.fn(() => `blob:mock-${++urlCounter}`);
    const revokeObjectURLSpy = vi.fn();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: createObjectURLSpy,
      revokeObjectURL: revokeObjectURLSpy,
    });

    const clickedDownloads: Array<{ download: string; href: string }> = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      clickedDownloads.push({ download: this.download, href: this.href });
    });

    try {
      const exportPromise = exportLayersModel(model, {
        triggerDownload: true,
        labelNames: ['A', 'B', 'C'],
      });

      // Wait until the first download (model.json) fires before the 150ms timer completes
      await vi.waitFor(() => {
        expect(clickedDownloads).toHaveLength(1);
      });
      expect(clickedDownloads[0]).toEqual({
        download: 'model.json',
        href: 'blob:mock-1',
      });
      expect(revokeObjectURLSpy).not.toHaveBeenCalled();

      // Advance 150ms for staggered weights download
      await vi.advanceTimersByTimeAsync(150);
      await exportPromise;

      expect(clickedDownloads).toEqual([
        { download: 'model.json', href: 'blob:mock-1' },
        { download: 'model.weights.bin', href: 'blob:mock-2' },
      ]);
      expect(document.body.querySelectorAll('a')).toHaveLength(0);
      expect(revokeObjectURLSpy).not.toHaveBeenCalled();

      // Advance 10_000ms for delayed URL revocation
      await vi.advanceTimersByTimeAsync(10_000);
      expect(revokeObjectURLSpy).toHaveBeenCalledTimes(2);
      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-1');
      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-2');
    } finally {
      model.dispose();
    }
  });

  it('supports custom fileNamePrefix and omits userDefinedMetadata when labelNames is omitted', async () => {
    const model = createTestHeadModel();
    try {
      const artifacts = await exportLayersModel(model, {
        triggerDownload: false,
        fileNamePrefix: 'meyve-model',
      });

      expect(artifacts.fileNames).toEqual({
        json: 'meyve-model.json',
        weights: 'meyve-model.weights.bin',
      });

      const parsed = JSON.parse(artifacts.modelJsonText) as tf.io.ModelJSON;
      expect(parsed.weightsManifest[0]?.paths).toEqual([
        'meyve-model.weights.bin',
      ]);
      expect(parsed.userDefinedMetadata).toBeUndefined();
    } finally {
      model.dispose();
    }
  });

  it('generates localized standalone HTML/JS snippets for tr and en with MobileNetV2 inputRange [0, 1]', () => {
    const trHtml = generateInferenceSnippet(['Elma', 'Armut'], 'tr');
    expect(trHtml.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(trHtml).toContain('<html lang="tr">');
    expect(trHtml).toContain('@tensorflow/tfjs');
    expect(trHtml).toContain('@tensorflow-models/mobilenet');
    expect(trHtml).toContain('inputRange: [0, 1]');
    expect(trHtml).toContain("tf.loadLayersModel('./model.json')");
    expect(trHtml).toContain('mobilenetModel.infer(');
    expect(trHtml).toContain('headModel.predict(');
    expect(trHtml).toContain('tf.tidy(');
    expect(trHtml).toContain('.dispose()');
    expect(trHtml).toContain('Eğitilmiş Görsel Sınıflandırma Modeli');
    expect(trHtml).toContain("'%';");

    const enHtml = generateInferenceSnippet(['Apple', 'Pear'], 'en');
    expect(enHtml).toContain('<html lang="en">');
    expect(enHtml).toContain('Trained Image Classification Model');
    expect(enHtml).toContain('Choose Image');
  });

  it('preserves Turkish Unicode labels and blocks script/HTML XSS injection in snippets', () => {
    const trickyLabels = [
      'Kırmızı Elma',
      'Şeftali & Üzüm',
      'İğne Çiçeği',
      '</script><script>window.__xss=1</script>',
      '<img src=x onerror=alert(1)>',
    ];

    const serialized = serializeLabelsForScript(trickyLabels);
    expect(serialized).not.toContain('</script>');
    expect(serialized).not.toContain('<img');
    expect(JSON.parse(serialized)).toEqual(trickyLabels);

    const html = generateInferenceSnippet(trickyLabels, 'tr');
    expect(html).toContain('Kırmızı Elma');
    expect(html).toContain('Şeftali \\u0026 Üzüm');
    expect(html).toContain('İğne Çiçeği');
    expect(html).not.toContain('</script><script>');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('innerHTML');

    const match = html.match(/const LABELS = (\[.*?\]);/);
    expect(match).not.toBeNull();
    const recovered = JSON.parse(match![1]!) as string[];
    expect(recovered).toEqual(trickyLabels);
  });
});
