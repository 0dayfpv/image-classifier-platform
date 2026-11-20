import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from 'vitest';
import * as tf from '@tensorflow/tfjs';
import type { LabelBucketRecord, SampleRecord, TrainingConfig } from '../../src/types/domain';
import type {
  EpochTelemetry,
  FeatureExtractor,
  ImageInputSource,
  TrainingProgress,
} from '../../src/types/ml';
import { FeatureCache, buildFeatureCacheKey } from '../../src/ml/featureCache';
import {
  TransferClassifier,
  TransferClassifierError,
  getHeadStorageKey,
  removeSavedClassifierHead,
} from '../../src/ml/transferClassifier';

const EMBEDDING_DIM = 16;

function makeLabel(
  id: string,
  name: string,
  order: number,
  createdAt = 1000 + order
): LabelBucketRecord {
  return {
    id,
    projectId: 'proj-1',
    name,
    color: '#2563EB',
    order,
    createdAt,
  };
}

function makeSample(
  id: string,
  labelId: string,
  tag: 'class-a' | 'class-b' | 'class-c' | 'nan' | 'broken',
  createdAt = 2000
): SampleRecord {
  return {
    id,
    projectId: 'proj-1',
    labelId,
    dataUrl: `data:image/png;base64,${tag}:${id}`,
    mimeType: 'image/png',
    width: 64,
    height: 64,
    source: 'drawing',
    createdAt,
  };
}

function createMockImageStub() {
  return class MockImage {
    onload: (() => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;
    private _src = '';

    get src(): string {
      return this._src;
    }

    set src(value: string) {
      this._src = value;
      queueMicrotask(() => {
        if (value.includes('broken')) {
          this.onerror?.(new Event('error'));
        } else {
          this.onload?.();
        }
      });
    }
  };
}

function createDeterministicExtractor(
  dim = EMBEDDING_DIM
): FeatureExtractor & { extractCalls: number } {
  const extractor = {
    embeddingDim: dim,
    extractCalls: 0,
    extractEmbedding(input: ImageInputSource): tf.Tensor2D {
      extractor.extractCalls += 1;
      const vec = new Float32Array(dim);
      const src =
        typeof (input as HTMLImageElement).src === 'string'
          ? (input as HTMLImageElement).src
          : '';

      if (src.includes('nan')) {
        vec.fill(Number.NaN);
      } else if (src.includes('class-a')) {
        vec[0] = 2.0;
        vec[1] = 2.0;
        vec[2] = 2.0;
        vec[3] = 2.0;
      } else if (src.includes('class-b')) {
        vec[4] = 2.0;
        vec[5] = 2.0;
        vec[6] = 2.0;
        vec[7] = 2.0;
      } else if (src.includes('class-c')) {
        vec[8] = 2.0;
        vec[9] = 2.0;
        vec[10] = 2.0;
        vec[11] = 2.0;
      } else if ('data' in input && input.data instanceof Uint8ClampedArray) {
        const r = input.data[0] ?? 0;
        const g = input.data[1] ?? 0;
        const b = input.data[2] ?? 0;
        if (r >= g && r >= b) {
          vec[0] = 2.0;
          vec[1] = 2.0;
          vec[2] = 2.0;
          vec[3] = 2.0;
        } else if (g >= r && g >= b) {
          vec[4] = 2.0;
          vec[5] = 2.0;
          vec[6] = 2.0;
          vec[7] = 2.0;
        } else {
          vec[8] = 2.0;
          vec[9] = 2.0;
          vec[10] = 2.0;
          vec[11] = 2.0;
        }
      }
      return tf.tensor2d(Array.from(vec), [1, dim]);
    },
  };
  return extractor;
}

const FAST_CONFIG: TrainingConfig = {
  epochs: 12,
  batchSize: 4,
  learningRate: 0.02,
};

describe('TransferClassifier', () => {
  beforeAll(async () => {
    await tf.setBackend('cpu');
    await tf.ready();
  });

  beforeEach(() => {
    vi.stubGlobal('Image', createMockImageStub());
  });

  afterEach(async () => {
    await removeSavedClassifierHead('proj-1');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('blocks invalid datasets and invalid training configs without leaking tensors', async () => {
    const baselineTensors = tf.memory().numTensors;
    const extractor = createDeterministicExtractor();
    const classifier = new TransferClassifier(extractor);

    try {
      await expect(classifier.train([], [], FAST_CONFIG)).rejects.toMatchObject({
        name: 'TransferClassifierError',
        code: 'DATASET_INVALID',
        blockingReason: 'NO_LABELS',
      });

      const oneLabel = [makeLabel('l1', 'Elma', 0)];
      await expect(
        classifier.train(oneLabel, [makeSample('s1', 'l1', 'class-a')], FAST_CONFIG)
      ).rejects.toMatchObject({
        code: 'DATASET_INVALID',
        blockingReason: 'FEWER_THAN_TWO_CLASSES',
      });

      const twoLabels = [makeLabel('l1', 'Elma', 0), makeLabel('l2', 'Armut', 1)];
      await expect(
        classifier.train(twoLabels, [makeSample('s1', 'l1', 'class-a')], FAST_CONFIG)
      ).rejects.toMatchObject({
        code: 'DATASET_INVALID',
        blockingReason: 'EMPTY_CLASSES_PRESENT',
      });

      const validSamples = [
        makeSample('s1', 'l1', 'class-a'),
        makeSample('s2', 'l2', 'class-b'),
      ];
      await expect(
        classifier.train(twoLabels, validSamples, {
          epochs: 0,
          batchSize: 4,
          learningRate: 0.01,
        })
      ).rejects.toMatchObject({ code: 'INVALID_CONFIG' });

      await expect(
        classifier.train(twoLabels, validSamples, {
          epochs: 5,
          batchSize: 0,
          learningRate: 0.01,
        })
      ).rejects.toMatchObject({ code: 'INVALID_CONFIG' });

      await expect(
        classifier.train(twoLabels, validSamples, {
          epochs: 5,
          batchSize: 4,
          learningRate: -0.1,
        })
      ).rejects.toMatchObject({ code: 'INVALID_CONFIG' });

      expect(classifier.isTrained()).toBe(false);
    } finally {
      classifier.dispose();
    }

    expect(tf.memory().numTensors).toBe(baselineTensors);
  });

  it('sorts labels deterministically, emits full progress/telemetry, and converges cleanly', async () => {
    const baselineTensors = tf.memory().numTensors;
    const extractor = createDeterministicExtractor();
    const classifier = new TransferClassifier(extractor);

    const labels = [
      makeLabel('l-b', 'Armut', 2),
      makeLabel('l-a', 'Elma', 0),
    ];
    const samples = [
      makeSample('a1', 'l-a', 'class-a'),
      makeSample('a2', 'l-a', 'class-a'),
      makeSample('a3', 'l-a', 'class-a'),
      makeSample('a4', 'l-a', 'class-a'),
      makeSample('b1', 'l-b', 'class-b'),
      makeSample('b2', 'l-b', 'class-b'),
      makeSample('b3', 'l-b', 'class-b'),
      makeSample('b4', 'l-b', 'class-b'),
    ];

    const progressEvents: TrainingProgress[] = [];
    const telemetryEvents: EpochTelemetry[] = [];

    try {
      await classifier.train(labels, samples, FAST_CONFIG, {
        onProgress: (p) => progressEvents.push(p),
        onEpochEnd: (t) => telemetryEvents.push(t),
      });

      expect(classifier.isTrained()).toBe(true);
      expect(classifier.getHeadModel()).not.toBeNull();
      expect(classifier.getTrainedLabels().map((l) => l.id)).toEqual([
        'l-a',
        'l-b',
      ]);

      expect(progressEvents.some((p) => p.phase === 'extracting_features')).toBe(true);
      expect(progressEvents.some((p) => p.phase === 'training')).toBe(true);
      expect(progressEvents[progressEvents.length - 1]?.phase).toBe('completed');

      expect(telemetryEvents).toHaveLength(FAST_CONFIG.epochs);
      expect(telemetryEvents[0]?.epoch).toBe(1);
      expect(telemetryEvents[telemetryEvents.length - 1]?.epoch).toBe(
        FAST_CONFIG.epochs
      );
      expect(telemetryEvents[telemetryEvents.length - 1]!.loss).toBeLessThan(
        telemetryEvents[0]!.loss
      );
      expect(telemetryEvents[telemetryEvents.length - 1]!.accuracy).toBeGreaterThanOrEqual(
        0.85
      );
    } finally {
      classifier.dispose();
    }

    expect(tf.memory().numTensors).toBe(baselineTensors);
  });

  it('computes adaptive validationSplit and clamps oversized batchSize safely', async () => {
    const baselineTensors = tf.memory().numTensors;
    const extractor = createDeterministicExtractor();
    const classifier = new TransferClassifier(extractor);

    const labels2 = [makeLabel('l1', 'Elma', 0), makeLabel('l2', 'Armut', 1)];
    const smallSamples = [
      makeSample('a1', 'l1', 'class-a'),
      makeSample('a2', 'l1', 'class-a'),
      makeSample('a3', 'l1', 'class-a'),
      makeSample('b1', 'l2', 'class-b'),
      makeSample('b2', 'l2', 'class-b'),
      makeSample('b3', 'l2', 'class-b'),
    ];

    try {
      const smallTelemetry: EpochTelemetry[] = [];
      await classifier.train(
        labels2,
        smallSamples,
        { epochs: 3, batchSize: 64, learningRate: 0.01 },
        { onEpochEnd: (t) => smallTelemetry.push(t) }
      );
      expect(smallTelemetry).toHaveLength(3);
      expect(smallTelemetry[0]?.valLoss).toBeUndefined();

      // >= 10 samples with floor(0.2 * 12) = 2 >= 2 classes -> validationSplit = 0.2
      const largeSamples = [
        ...smallSamples,
        makeSample('a4', 'l1', 'class-a'),
        makeSample('a5', 'l1', 'class-a'),
        makeSample('a6', 'l1', 'class-a'),
        makeSample('b4', 'l2', 'class-b'),
        makeSample('b5', 'l2', 'class-b'),
        makeSample('b6', 'l2', 'class-b'),
      ];
      const largeTelemetry: EpochTelemetry[] = [];
      await classifier.train(
        labels2,
        largeSamples,
        { epochs: 3, batchSize: 4, learningRate: 0.01 },
        { onEpochEnd: (t) => largeTelemetry.push(t) }
      );
      expect(largeTelemetry).toHaveLength(3);
      expect(Number.isFinite(largeTelemetry[0]?.valLoss)).toBe(true);
      expect(Number.isFinite(largeTelemetry[0]?.valAccuracy)).toBe(true);

      // 10 samples with 3 classes -> floor(0.2 * 10) = 2 < 3 -> validationSplit = 0
      const labels3 = [
        makeLabel('l1', 'Elma', 0),
        makeLabel('l2', 'Armut', 1),
        makeLabel('l3', 'Muz', 2),
      ];
      const tenThreeClassSamples = [
        makeSample('a1', 'l1', 'class-a'),
        makeSample('a2', 'l1', 'class-a'),
        makeSample('a3', 'l1', 'class-a'),
        makeSample('a4', 'l1', 'class-a'),
        makeSample('b1', 'l2', 'class-b'),
        makeSample('b2', 'l2', 'class-b'),
        makeSample('b3', 'l2', 'class-b'),
        makeSample('c1', 'l3', 'class-c'),
        makeSample('c2', 'l3', 'class-c'),
        makeSample('c3', 'l3', 'class-c'),
      ];
      const threeClassTelemetry: EpochTelemetry[] = [];
      await classifier.train(
        labels3,
        tenThreeClassSamples,
        { epochs: 3, batchSize: 4, learningRate: 0.01 },
        { onEpochEnd: (t) => threeClassTelemetry.push(t) }
      );
      expect(threeClassTelemetry[0]?.valLoss).toBeUndefined();
    } finally {
      classifier.dispose();
    }

    expect(tf.memory().numTensors).toBe(baselineTensors);
  });

  it('reuses FeatureCache embeddings on subsequent training runs without leaking tensors', async () => {
    const baselineTensors = tf.memory().numTensors;
    const extractor = createDeterministicExtractor();
    const cache = new FeatureCache();
    const classifier = new TransferClassifier(extractor, cache);

    const labels = [makeLabel('l1', 'Elma', 0), makeLabel('l2', 'Armut', 1)];
    const samples = [
      makeSample('a1', 'l1', 'class-a', 100),
      makeSample('a2', 'l1', 'class-a', 101),
      makeSample('b1', 'l2', 'class-b', 102),
      makeSample('b2', 'l2', 'class-b', 103),
    ];

    try {
      await classifier.train(labels, samples, {
        epochs: 2,
        batchSize: 2,
        learningRate: 0.01,
      });
      expect(extractor.extractCalls).toBe(4);
      expect(cache.size).toBe(4);
      expect(cache.has(buildFeatureCacheKey(samples[0]))).toBe(true);

      await classifier.train(labels, samples, {
        epochs: 2,
        batchSize: 2,
        learningRate: 0.01,
      });
      expect(extractor.extractCalls).toBe(4);
    } finally {
      classifier.dispose();
    }

    expect(tf.memory().numTensors).toBe(baselineTensors);
  });

  it('handles AbortSignal pre-abort and mid-training abort cleanly with zero tensor leaks', async () => {
    const baselineTensors = tf.memory().numTensors;
    const extractor = createDeterministicExtractor();
    const classifier = new TransferClassifier(extractor);

    const labels = [makeLabel('l1', 'Elma', 0), makeLabel('l2', 'Armut', 1)];
    const samples = [
      makeSample('a1', 'l1', 'class-a'),
      makeSample('a2', 'l1', 'class-a'),
      makeSample('b1', 'l2', 'class-b'),
      makeSample('b2', 'l2', 'class-b'),
    ];

    try {
      // Pre-aborted
      const preAborted = new AbortController();
      preAborted.abort();
      await expect(
        classifier.train(labels, samples, FAST_CONFIG, {}, preAborted.signal)
      ).rejects.toMatchObject({ code: 'TRAINING_ABORTED' });
      expect(extractor.extractCalls).toBe(0);

      // Mid-training abort at epoch 2
      const midController = new AbortController();
      const telemetry: EpochTelemetry[] = [];
      const phases: string[] = [];

      await expect(
        classifier.train(
          labels,
          samples,
          { epochs: 10, batchSize: 2, learningRate: 0.01 },
          {
            onProgress: (p) => phases.push(p.phase),
            onEpochEnd: (t) => {
              telemetry.push(t);
              if (t.epoch === 2) {
                midController.abort();
              }
            },
          },
          midController.signal
        )
      ).rejects.toMatchObject({ code: 'TRAINING_ABORTED' });

      expect(telemetry.length).toBeLessThan(10);
      expect(phases[phases.length - 1]).toBe('cancelled');
      expect(classifier.isTrained()).toBe(false);
    } finally {
      classifier.dispose();
    }

    expect(tf.memory().numTensors).toBe(baselineTensors);
  });

  it('aborts cleanly on NaN loss and rejects with NAN_LOSS with zero tensor leaks', async () => {
    const baselineTensors = tf.memory().numTensors;
    const extractor = createDeterministicExtractor();
    const classifier = new TransferClassifier(extractor);

    const labels = [makeLabel('l1', 'Elma', 0), makeLabel('l2', 'Armut', 1)];
    const samples = [
      makeSample('a1', 'l1', 'nan'),
      makeSample('b1', 'l2', 'class-b'),
    ];
    const phases: string[] = [];

    try {
      await expect(
        classifier.train(
          labels,
          samples,
          { epochs: 5, batchSize: 2, learningRate: 0.01 },
          { onProgress: (p) => phases.push(p.phase) }
        )
      ).rejects.toMatchObject({ code: 'NAN_LOSS' });

      expect(phases[phases.length - 1]).toBe('error');
      expect(classifier.isTrained()).toBe(false);
    } finally {
      classifier.dispose();
    }

    expect(tf.memory().numTensors).toBe(baselineTensors);
  });

  it('throws IMAGE_DECODE_FAILED when a sample image fails to decode', async () => {
    const baselineTensors = tf.memory().numTensors;
    const extractor = createDeterministicExtractor();
    const classifier = new TransferClassifier(extractor);

    const labels = [makeLabel('l1', 'Elma', 0), makeLabel('l2', 'Armut', 1)];
    const samples = [
      makeSample('a1', 'l1', 'broken'),
      makeSample('b1', 'l2', 'class-b'),
    ];

    try {
      await expect(
        classifier.train(labels, samples, FAST_CONFIG)
      ).rejects.toMatchObject({ code: 'IMAGE_DECODE_FAILED' });
    } finally {
      classifier.dispose();
    }

    expect(tf.memory().numTensors).toBe(baselineTensors);
  });

  it('predicts sorted class probabilities summing to ~100% and maintains strict tensor hygiene across 20 predictions and retrain', async () => {
    const baselineTensors = tf.memory().numTensors;
    const extractor = createDeterministicExtractor();
    const classifier = new TransferClassifier(extractor);

    const labels = [makeLabel('l1', 'Elma', 0), makeLabel('l2', 'Armut', 1)];
    const samples = [
      makeSample('a1', 'l1', 'class-a'),
      makeSample('a2', 'l1', 'class-a'),
      makeSample('a3', 'l1', 'class-a'),
      makeSample('b1', 'l2', 'class-b'),
      makeSample('b2', 'l2', 'class-b'),
      makeSample('b3', 'l2', 'class-b'),
    ];

    try {
      await expect(
        classifier.predict({ data: new Uint8ClampedArray([255, 0, 0, 255]) } as unknown as ImageData)
      ).rejects.toThrow(TransferClassifierError);

      await classifier.train(labels, samples, FAST_CONFIG);

      const postTrainTensors = tf.memory().numTensors;

      const redInput = {
        data: new Uint8ClampedArray([255, 0, 0, 255]),
        width: 1,
        height: 1,
      } as unknown as ImageData;
      const greenInput = {
        data: new Uint8ClampedArray([0, 255, 0, 255]),
        width: 1,
        height: 1,
      } as unknown as ImageData;

      const predA = await classifier.predict(redInput);
      expect(predA[0]?.labelId).toBe('l1');
      expect(predA[0]!.probability).toBeGreaterThan(predA[1]!.probability);
      expect(predA[0]?.percentage).toBeCloseTo(predA[0]!.probability * 100, 5);
      const sumProb = predA.reduce((acc, p) => acc + p.probability, 0);
      const sumPct = predA.reduce((acc, p) => acc + p.percentage, 0);
      expect(sumProb).toBeCloseTo(1, 4);
      expect(sumPct).toBeCloseTo(100, 2);

      const predB = await classifier.predict(greenInput);
      expect(predB[0]?.labelId).toBe('l2');

      // 20x steady-state tensor check
      for (let i = 0; i < 20; i++) {
        await classifier.predict(i % 2 === 0 ? redInput : greenInput);
        expect(tf.memory().numTensors).toBe(postTrainTensors);
      }

      // Retrain must dispose previous headModel tensors
      await classifier.train(labels, samples, FAST_CONFIG);
      expect(tf.memory().numTensors).toBe(postTrainTensors);

      const exported = await classifier.exportModel(false);
      const parsed = JSON.parse(exported.modelJsonText) as {
        userDefinedMetadata?: { labels?: string[] };
      };
      expect(parsed.userDefinedMetadata?.labels).toEqual(['Elma', 'Armut']);

      classifier.dispose();
      expect(classifier.isTrained()).toBe(false);
      await expect(classifier.predict(redInput)).rejects.toMatchObject({
        code: 'MODEL_NOT_TRAINED',
      });
    } finally {
      classifier.dispose();
    }

    expect(tf.memory().numTensors).toBe(baselineTensors);
  });

  it('persists and rehydrates via IndexedDB while rejecting stale label orders, deleted labels, or embeddingDim mismatches', async () => {
    const baselineTensors = tf.memory().numTensors;
    const extractor = createDeterministicExtractor(EMBEDDING_DIM);
    const classifier = new TransferClassifier(extractor);

    const labels = [
      makeLabel('l1', 'Elma', 0),
      makeLabel('l2', 'Armut', 1),
      makeLabel('l3', 'Muz', 2),
    ];
    const samples = [
      makeSample('a1', 'l1', 'class-a'),
      makeSample('a2', 'l1', 'class-a'),
      makeSample('b1', 'l2', 'class-b'),
      makeSample('b2', 'l2', 'class-b'),
      makeSample('c1', 'l3', 'class-c'),
      makeSample('c2', 'l3', 'class-c'),
    ];

    try {
      await classifier.train(labels, samples, FAST_CONFIG);
      const saved = await classifier.saveToIndexedDB('proj-1');
      expect(saved).toBe(true);

      const models = await tf.io.listModels();
      expect(Object.keys(models)).toContain(getHeadStorageKey('proj-1'));

      // Rehydrate into fresh classifier with renamed label
      const renamedLabels = [
        makeLabel('l1', 'Yeşil Elma', 0),
        makeLabel('l2', 'Armut', 1),
        makeLabel('l3', 'Muz', 2),
      ];
      const restored = new TransferClassifier(extractor);
      try {
        const loaded = await restored.loadFromIndexedDB(
          'proj-1',
          renamedLabels,
          ['l1', 'l2', 'l3']
        );
        expect(loaded).toBe(true);
        expect(restored.isTrained()).toBe(true);
        expect(restored.getTrainedLabels().map((l) => l.name)).toEqual([
          'Yeşil Elma',
          'Armut',
          'Muz',
        ]);

        const pred = await restored.predict({
          data: new Uint8ClampedArray([255, 0, 0, 255]),
        } as unknown as ImageData);
        expect(pred[0]?.labelName).toBe('Yeşil Elma');

        // Reject mismatched order
        expect(
          await restored.loadFromIndexedDB('proj-1', renamedLabels, [
            'l2',
            'l1',
            'l3',
          ])
        ).toBe(false);

        // Critical edge case: deleteLabel shrinks trainedLabelOrder to 2 while saved head outputDim is still 3
        expect(
          await restored.loadFromIndexedDB(
            'proj-1',
            renamedLabels.slice(0, 2),
            ['l1', 'l2']
          )
        ).toBe(false);
      } finally {
        restored.dispose();
      }

      // Reject embeddingDim mismatch
      const mismatchedExtractor = createDeterministicExtractor(32);
      const mismatched = new TransferClassifier(mismatchedExtractor);
      try {
        expect(
          await mismatched.loadFromIndexedDB(
            'proj-1',
            labels,
            ['l1', 'l2', 'l3']
          )
        ).toBe(false);
      } finally {
        mismatched.dispose();
      }

      await removeSavedClassifierHead('proj-1');
      const modelsAfterRemove = await tf.io.listModels();
      expect(Object.keys(modelsAfterRemove)).not.toContain(
        getHeadStorageKey('proj-1')
      );
    } finally {
      classifier.dispose();
    }

    expect(tf.memory().numTensors).toBe(baselineTensors);
  });
});
