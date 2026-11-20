import * as tf from '@tensorflow/tfjs';
import { loadImageElement } from '../media/imageProcessor';
import type { LabelBucketRecord, SampleRecord, TrainingConfig } from '../types/domain';
import type {
  BackendName,
  ClassPrediction,
  DatasetBlockingReason,
  DatasetValidationResult,
  ExportArtifacts,
  FeatureExtractor,
  ImageInputSource,
  TrainingCallbacks,
  TrainingProgress,
} from '../types/ml';
import { validateDataset } from './datasetValidation';
import { buildFeatureCacheKey } from './featureCache';
import { exportLayersModel } from './modelExporter';

export const CLASSIFIER_HEAD_IDB_PREFIX = 'classifier-head-';

export type TransferClassifierErrorCode =
  | 'DATASET_INVALID'
  | 'INVALID_CONFIG'
  | 'TRAINING_ABORTED'
  | 'NAN_LOSS'
  | 'IMAGE_DECODE_FAILED'
  | 'MODEL_NOT_TRAINED'
  | 'PREDICTION_FAILED';

export interface TransferClassifierErrorOptions extends ErrorOptions {
  blockingReason?: DatasetBlockingReason;
  validation?: DatasetValidationResult;
}

export class TransferClassifierError extends Error {
  readonly code: TransferClassifierErrorCode;
  readonly blockingReason?: DatasetBlockingReason;
  readonly validation?: DatasetValidationResult;

  constructor(
    code: TransferClassifierErrorCode,
    message: string,
    options?: TransferClassifierErrorOptions
  ) {
    super(message, options);
    this.name = 'TransferClassifierError';
    this.code = code;
    if (options?.blockingReason !== undefined) {
      this.blockingReason = options.blockingReason;
    }
    if (options?.validation !== undefined) {
      this.validation = options.validation;
    }
  }
}

export interface FeatureCacheLike {
  get(key: string): Float32Array | undefined;
  set(key: string, embedding: Float32Array): void;
}

export interface TransferClassifierOptions {
  decodeSample?: (sample: SampleRecord) => Promise<ImageInputSource>;
}

export function getHeadStorageKey(projectId: string): string {
  return `indexeddb://${CLASSIFIER_HEAD_IDB_PREFIX}${projectId}`;
}

export async function removeSavedClassifierHead(projectId: string): Promise<void> {
  if (!projectId) {
    return;
  }
  const key = getHeadStorageKey(projectId);
  try {
    const models = await tf.io.listModels();
    if (Object.prototype.hasOwnProperty.call(models, key)) {
      await tf.io.removeModel(key);
    }
  } catch {
    // Gracefully ignore when IndexedDB or TFJS browser storage is unavailable
  }
}

export function sortLabelsDeterministically(
  labels: readonly LabelBucketRecord[]
): LabelBucketRecord[] {
  return [...labels].sort(
    (a, b) =>
      a.order - b.order ||
      a.createdAt - b.createdAt ||
      a.id.localeCompare(b.id)
  );
}

export function computeAdaptiveValidationSplit(
  numSamples: number,
  numClasses: number
): number {
  return numSamples >= 10 && Math.floor(numSamples * 0.2) >= numClasses ? 0.2 : 0;
}

function getActiveBackendName(): BackendName | null {
  try {
    const current = tf.getBackend();
    if (current === 'webgl' || current === 'cpu') {
      return current;
    }
    return null;
  } catch {
    return null;
  }
}

function yieldToEventLoop(): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

function validateTrainingConfig(config: TrainingConfig): {
  epochs: number;
  batchSize: number;
  learningRate: number;
} {
  if (!config || typeof config !== 'object') {
    throw new TransferClassifierError(
      'INVALID_CONFIG',
      'Training configuration is required.'
    );
  }
  const { epochs, batchSize, learningRate } = config;
  if (!Number.isInteger(epochs) || epochs < 1) {
    throw new TransferClassifierError(
      'INVALID_CONFIG',
      `Invalid epochs value: ${epochs}`
    );
  }
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new TransferClassifierError(
      'INVALID_CONFIG',
      `Invalid batchSize value: ${batchSize}`
    );
  }
  if (!Number.isFinite(learningRate) || learningRate <= 0) {
    throw new TransferClassifierError(
      'INVALID_CONFIG',
      `Invalid learningRate value: ${learningRate}`
    );
  }
  return { epochs, batchSize, learningRate };
}

export class TransferClassifier {
  private readonly extractor: FeatureExtractor;
  private readonly featureCache?: FeatureCacheLike;
  private readonly decodeSample: (sample: SampleRecord) => Promise<ImageInputSource>;
  private headModel: tf.LayersModel | null = null;
  private trainedLabels: LabelBucketRecord[] = [];

  constructor(
    extractor: FeatureExtractor,
    featureCache?: FeatureCacheLike,
    options?: TransferClassifierOptions
  ) {
    this.extractor = extractor;
    this.featureCache = featureCache;
    this.decodeSample =
      options?.decodeSample ?? ((sample) => loadImageElement(sample.dataUrl));
  }

  isTrained(): boolean {
    return this.headModel !== null && this.trainedLabels.length >= 2;
  }

  getTrainedLabels(): LabelBucketRecord[] {
    return this.trainedLabels.map((label) => ({ ...label }));
  }

  getHeadModel(): tf.LayersModel | null {
    return this.headModel;
  }

  dispose(): void {
    if (this.headModel) {
      this.headModel.dispose();
      this.headModel = null;
    }
    this.trainedLabels = [];
  }

  async train(
    labels: readonly LabelBucketRecord[],
    samples: readonly SampleRecord[],
    config: TrainingConfig,
    callbacks: TrainingCallbacks = {},
    abortSignal?: AbortSignal
  ): Promise<void> {
    const validation = validateDataset(labels, samples);
    if (!validation.isValidToTrain) {
      throw new TransferClassifierError(
        'DATASET_INVALID',
        `Dataset is not ready for training (${validation.blockingReason ?? 'UNKNOWN'}).`,
        {
          blockingReason: validation.blockingReason,
          validation,
        }
      );
    }

    const { epochs, batchSize, learningRate } = validateTrainingConfig(config);
    const embeddingDim = this.extractor.embeddingDim;
    if (!Number.isInteger(embeddingDim) || embeddingDim < 1) {
      throw new TransferClassifierError(
        'INVALID_CONFIG',
        `Invalid extractor embeddingDim: ${embeddingDim}`
      );
    }

    const sortedLabels = sortLabelsDeterministically(labels);
    const numClasses = sortedLabels.length;
    const labelIndexById = new Map<string, number>();
    sortedLabels.forEach((label, index) => {
      labelIndexById.set(label.id, index);
    });

    const validSamples = samples.filter((sample) =>
      labelIndexById.has(sample.labelId)
    );
    const numSamples = validSamples.length;
    const backend = getActiveBackendName();

    const emitProgress = (
      partial: Omit<TrainingProgress, 'totalSamples' | 'totalEpochs' | 'backend'>
    ) => {
      callbacks.onProgress?.({
        ...partial,
        totalSamples: numSamples,
        totalEpochs: epochs,
        backend,
      });
    };

    if (abortSignal?.aborted) {
      emitProgress({
        phase: 'cancelled',
        extractedCount: 0,
        currentEpoch: 0,
      });
      throw new TransferClassifierError(
        'TRAINING_ABORTED',
        'Training was cancelled before starting.'
      );
    }

    emitProgress({
      phase: 'extracting_features',
      extractedCount: 0,
      currentEpoch: 0,
    });

    const extractedPairs: Array<{ embedding: Float32Array; classIndex: number }> = [];

    for (let i = 0; i < numSamples; i++) {
      if (abortSignal?.aborted) {
        emitProgress({
          phase: 'cancelled',
          extractedCount: i,
          currentEpoch: 0,
        });
        throw new TransferClassifierError(
          'TRAINING_ABORTED',
          'Training was cancelled during feature extraction.'
        );
      }

      const sample = validSamples[i];
      const classIndex = labelIndexById.get(sample.labelId)!;
      const cacheKey = buildFeatureCacheKey(sample);
      let embedding = this.featureCache?.get(cacheKey);

      if (!embedding || embedding.length !== embeddingDim) {
        let input: ImageInputSource;
        try {
          input = await this.decodeSample(sample);
        } catch (err) {
          emitProgress({
            phase: 'error',
            extractedCount: i,
            currentEpoch: 0,
          });
          throw new TransferClassifierError(
            'IMAGE_DECODE_FAILED',
            `Failed to decode sample "${sample.id}".`,
            { cause: err }
          );
        }

        if (abortSignal?.aborted) {
          emitProgress({
            phase: 'cancelled',
            extractedCount: i,
            currentEpoch: 0,
          });
          throw new TransferClassifierError(
            'TRAINING_ABORTED',
            'Training was cancelled during feature extraction.'
          );
        }

        let embTensor: tf.Tensor2D | null = null;
        try {
          embTensor = this.extractor.extractEmbedding(input);
          const rawData = await embTensor.data();
          embedding = new Float32Array(rawData);
        } catch (err) {
          emitProgress({
            phase: 'error',
            extractedCount: i,
            currentEpoch: 0,
          });
          throw err;
        } finally {
          embTensor?.dispose();
        }
        this.featureCache?.set(cacheKey, embedding);
      }

      extractedPairs.push({ embedding, classIndex });

      const extractedCount = i + 1;
      emitProgress({
        phase: 'extracting_features',
        extractedCount,
        currentEpoch: 0,
      });

      if (extractedCount % 4 === 0 && extractedCount < numSamples) {
        await yieldToEventLoop();
      }
    }

    if (abortSignal?.aborted) {
      emitProgress({
        phase: 'cancelled',
        extractedCount: numSamples,
        currentEpoch: 0,
      });
      throw new TransferClassifierError(
        'TRAINING_ABORTED',
        'Training was cancelled before model fitting.'
      );
    }

    // Fisher-Yates shuffle before building xs/ys so validationSplit tail slice is class-balanced
    for (let i = extractedPairs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = extractedPairs[i];
      extractedPairs[i] = extractedPairs[j];
      extractedPairs[j] = tmp;
    }

    const flatEmbeddings = new Float32Array(numSamples * embeddingDim);
    const classIndices = new Int32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      flatEmbeddings.set(extractedPairs[i].embedding, i * embeddingDim);
      classIndices[i] = extractedPairs[i].classIndex;
    }

    const validationSplit = computeAdaptiveValidationSplit(numSamples, numClasses);
    const trainSampleCount =
      validationSplit > 0
        ? Math.floor(numSamples * (1 - validationSplit))
        : numSamples;
    const effectiveBatchSize = Math.max(
      1,
      Math.min(batchSize, trainSampleCount)
    );

    let xs: tf.Tensor2D | null = null;
    let ys: tf.Tensor2D | null = null;
    let head: tf.Sequential | null = null;
    let optimizer: tf.Optimizer | null = null;
    let aborted = false;
    let nanDetected = false;
    let onAbort: (() => void) | null = null;

    try {
      xs = tf.tensor2d(flatEmbeddings, [numSamples, embeddingDim]);
      ys = tf.tidy(() => {
        const idxTensor = tf.tensor1d(classIndices, 'int32');
        return tf.oneHot(idxTensor, numClasses) as tf.Tensor2D;
      });

      head = tf.sequential({
        layers: [
          tf.layers.dense({
            inputShape: [embeddingDim],
            units: 100,
            activation: 'relu',
            kernelInitializer: 'varianceScaling',
            useBias: true,
          }),
          tf.layers.dropout({ rate: 0.25 }),
          tf.layers.dense({
            units: numClasses,
            activation: 'softmax',
            kernelInitializer: 'varianceScaling',
          }),
        ],
      });

      optimizer = tf.train.adam(learningRate);
      head.compile({
        optimizer,
        loss: 'categoricalCrossentropy',
        metrics: ['accuracy'],
      });

      onAbort = () => {
        aborted = true;
        if (head) {
          head.stopTraining = true;
        }
      };
      abortSignal?.addEventListener('abort', onAbort, { once: true });

      emitProgress({
        phase: 'training',
        extractedCount: numSamples,
        currentEpoch: 0,
      });

      await head.fit(xs, ys, {
        epochs,
        batchSize: effectiveBatchSize,
        validationSplit,
        shuffle: true,
        verbose: 0,
        callbacks: {
          onEpochBegin: () => {
            if (abortSignal?.aborted && head) {
              aborted = true;
              head.stopTraining = true;
            }
          },
          onBatchEnd: () => {
            if (abortSignal?.aborted && head) {
              aborted = true;
              head.stopTraining = true;
            }
          },
          onEpochEnd: async (epoch, logs) => {
            if (abortSignal?.aborted) {
              aborted = true;
              if (head) {
                head.stopTraining = true;
              }
              return;
            }

            const loss = Number(logs?.loss ?? Number.NaN);
            if (!Number.isFinite(loss)) {
              nanDetected = true;
              if (head) {
                head.stopTraining = true;
              }
              return;
            }

            const accuracy = Number(logs?.acc ?? logs?.accuracy ?? 0);
            const rawValLoss = logs?.val_loss;
            const rawValAcc = logs?.val_acc ?? logs?.val_accuracy;
            const valLoss =
              rawValLoss !== undefined && Number.isFinite(Number(rawValLoss))
                ? Number(rawValLoss)
                : undefined;
            const valAccuracy =
              rawValAcc !== undefined && Number.isFinite(Number(rawValAcc))
                ? Number(rawValAcc)
                : undefined;

            const epochNumber = epoch + 1;
            callbacks.onEpochEnd?.({
              epoch: epochNumber,
              totalEpochs: epochs,
              loss,
              accuracy,
              ...(valLoss !== undefined ? { valLoss } : {}),
              ...(valAccuracy !== undefined ? { valAccuracy } : {}),
            });

            emitProgress({
              phase: 'training',
              extractedCount: numSamples,
              currentEpoch: epochNumber,
            });

            if (epochs >= 20 && !abortSignal?.aborted) {
              await new Promise<void>((resolve) => {
                setTimeout(resolve, 35);
              });
            }

            if (abortSignal?.aborted) {
              aborted = true;
              if (head) {
                head.stopTraining = true;
              }
            }
          },
        },
      });
    } catch (err) {
      head?.dispose();
      head = null;
      emitProgress({
        phase: 'error',
        extractedCount: numSamples,
        currentEpoch: 0,
      });
      throw err;
    } finally {
      if (onAbort) {
        abortSignal?.removeEventListener('abort', onAbort);
      }
      xs?.dispose();
      ys?.dispose();
      // compile({ optimizer }) sets isOptimizerOwned = false, so optimizer tensors must be disposed explicitly
      optimizer?.dispose();
    }

    if (nanDetected) {
      head.dispose();
      emitProgress({
        phase: 'error',
        extractedCount: numSamples,
        currentEpoch: 0,
      });
      throw new TransferClassifierError(
        'NAN_LOSS',
        'Training loss became NaN or non-finite.'
      );
    }

    if (aborted || abortSignal?.aborted) {
      head.dispose();
      emitProgress({
        phase: 'cancelled',
        extractedCount: numSamples,
        currentEpoch: 0,
      });
      throw new TransferClassifierError(
        'TRAINING_ABORTED',
        'Training was cancelled.'
      );
    }

    if (this.headModel) {
      this.headModel.dispose();
    }
    this.headModel = head;
    this.trainedLabels = sortedLabels.map((label) => ({ ...label }));

    emitProgress({
      phase: 'completed',
      extractedCount: numSamples,
      currentEpoch: epochs,
    });
  }

  async predict(input: ImageInputSource): Promise<ClassPrediction[]> {
    if (!this.headModel || this.trainedLabels.length === 0) {
      throw new TransferClassifierError(
        'MODEL_NOT_TRAINED',
        'Cannot predict before the classifier head is trained.'
      );
    }

    const head = this.headModel;
    let probsTensor: tf.Tensor2D;
    try {
      probsTensor = tf.tidy(() => {
        const emb = this.extractor.extractEmbedding(input);
        const output = head.predict(emb);
        return (Array.isArray(output) ? outOrFirst(output) : output) as tf.Tensor2D;
      });
    } catch (err) {
      throw new TransferClassifierError(
        'PREDICTION_FAILED',
        'Failed to run inference on input image.',
        { cause: err }
      );
    }

    let probs: Float32Array | Int32Array | Uint8Array;
    try {
      probs = await probsTensor.data();
    } finally {
      probsTensor.dispose();
    }

    const predictions: ClassPrediction[] = this.trainedLabels.map((label, idx) => {
      const raw = probs[idx] ?? 0;
      const probability = Number.isFinite(raw) ? raw : 0;
      return {
        labelId: label.id,
        labelName: label.name,
        probability,
        percentage: probability * 100,
      };
    });

    predictions.sort((a, b) => b.probability - a.probability);
    return predictions;
  }

  async exportModel(triggerDownload = true): Promise<ExportArtifacts> {
    if (!this.headModel) {
      throw new TransferClassifierError(
        'MODEL_NOT_TRAINED',
        'Cannot export before the classifier head is trained.'
      );
    }
    return exportLayersModel(this.headModel, {
      triggerDownload,
      labelNames: this.trainedLabels.map((label) => label.name),
    });
  }

  async saveToIndexedDB(projectId: string): Promise<boolean> {
    if (!projectId || !this.headModel) {
      return false;
    }
    try {
      await this.headModel.save(getHeadStorageKey(projectId));
      return true;
    } catch {
      return false;
    }
  }

  async loadFromIndexedDB(
    projectId: string,
    currentLabels: readonly LabelBucketRecord[],
    trainedLabelOrder?: readonly string[]
  ): Promise<boolean> {
    if (!projectId || !trainedLabelOrder || trainedLabelOrder.length < 2) {
      return false;
    }

    const sortedLabels = sortLabelsDeterministically(currentLabels);
    if (sortedLabels.length !== trainedLabelOrder.length) {
      return false;
    }
    for (let i = 0; i < sortedLabels.length; i++) {
      if (sortedLabels[i].id !== trainedLabelOrder[i]) {
        return false;
      }
    }

    let loadedModel: tf.LayersModel;
    try {
      loadedModel = await tf.loadLayersModel(getHeadStorageKey(projectId));
    } catch {
      return false;
    }

    const inputDim = loadedModel.inputs[0]?.shape?.[1];
    const outputDim = loadedModel.outputs[0]?.shape?.[1];
    if (
      inputDim !== this.extractor.embeddingDim ||
      outputDim !== trainedLabelOrder.length
    ) {
      loadedModel.dispose();
      return false;
    }

    if (this.headModel) {
      this.headModel.dispose();
    }
    this.headModel = loadedModel;
    this.trainedLabels = sortedLabels.map((label) => ({ ...label }));
    return true;
  }
}

function outOrFirst(output: tf.Tensor[]): tf.Tensor {
  return output[0];
}
