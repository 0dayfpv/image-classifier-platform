import * as tf from '@tensorflow/tfjs';
import type { ExportArtifacts } from '../types/ml';

export const DEFAULT_FILE_NAME_PREFIX = 'model';
export const DEFAULT_MODEL_JSON_FILENAME = 'model.json';
export const DEFAULT_MODEL_WEIGHTS_FILENAME = 'model.weights.bin';
export const DOWNLOAD_STAGGER_MS = 150;
export const OBJECT_URL_REVOKE_DELAY_MS = 10_000;

export interface ExportModelOptions {
  /**
   * When true, triggers staggered browser Blob downloads:
   * 1) model.json, await 150ms, 2) model.weights.bin (revoking object URLs after 10000ms).
   * Defaults to false.
   */
  triggerDownload?: boolean;
  /**
   * Optional ordered class label names (matching output head indices)
   * stored under `userDefinedMetadata.labels` in `model.json`.
   */
  labelNames?: readonly string[];
  /**
   * Optional base file name prefix (defaults to 'model', producing 'model.json' and 'model.weights.bin').
   */
  fileNamePrefix?: string;
  /**
   * Delay in ms between triggering model.json and model.weights.bin downloads (default: 150).
   */
  downloadDelayMs?: number;
  /**
   * Delay in ms before calling URL.revokeObjectURL on created Blob URLs (default: 10000).
   */
  revokeDelayMs?: number;
}

function sanitizePrefix(prefix?: string): string {
  if (!prefix || typeof prefix !== 'string') {
    return DEFAULT_FILE_NAME_PREFIX;
  }
  const cleaned = prefix
    .trim()
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned.length > 0 ? cleaned : DEFAULT_FILE_NAME_PREFIX;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isArrayBufferLike(value: unknown): value is ArrayBuffer {
  return (
    value instanceof ArrayBuffer ||
    Object.prototype.toString.call(value) === '[object ArrayBuffer]'
  );
}

export function normalizeWeightBuffer(weightData?: tf.io.WeightData): ArrayBuffer {
  if (!weightData) {
    return new ArrayBuffer(0);
  }

  if (isArrayBufferLike(weightData)) {
    return weightData.slice(0);
  }

  if (Array.isArray(weightData)) {
    let totalBytes = 0;
    for (const shard of weightData) {
      totalBytes += shard.byteLength;
    }
    const merged = new Uint8Array(totalBytes);
    let offset = 0;
    for (const shard of weightData) {
      merged.set(new Uint8Array(shard), offset);
      offset += shard.byteLength;
    }
    return merged.buffer;
  }

  if (ArrayBuffer.isView(weightData)) {
    const view = weightData as ArrayBufferView;
    const copy = new Uint8Array(view.byteLength);
    copy.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
    return copy.buffer;
  }

  throw new Error('Unsupported weightData format returned by TensorFlow.js.');
}

export function buildExportedModelJson(
  artifacts: tf.io.ModelArtifacts,
  weightsFileName: string,
  labelNames?: readonly string[]
): tf.io.ModelJSON {
  if (
    artifacts.modelTopology == null ||
    isArrayBufferLike(artifacts.modelTopology)
  ) {
    throw new Error('Exported model topology is missing or non-JSON.');
  }

  const modelJson: tf.io.ModelJSON = {
    modelTopology: artifacts.modelTopology,
    format: artifacts.format ?? 'layers-model',
    generatedBy: artifacts.generatedBy ?? 'TensorFlow.js',
    convertedBy: artifacts.convertedBy ?? null,
    weightsManifest: [
      {
        paths: [weightsFileName],
        weights: artifacts.weightSpecs ?? [],
      },
    ],
  };

  if (labelNames !== undefined || artifacts.userDefinedMetadata != null) {
    modelJson.userDefinedMetadata = {
      ...(artifacts.userDefinedMetadata ?? {}),
      ...(labelNames !== undefined ? { labels: [...labelNames] } : {}),
    };
  }

  if (artifacts.signature != null) {
    modelJson.signature = artifacts.signature;
  }

  return modelJson;
}

function triggerBlobDownload(
  blob: Blob,
  fileName: string,
  revokeDelayMs: number
): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => {
      if (typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(url);
      }
    }, revokeDelayMs);
  }
}

export async function exportLayersModel(
  model: tf.LayersModel,
  options?: ExportModelOptions
): Promise<ExportArtifacts> {
  const prefix = sanitizePrefix(options?.fileNamePrefix);
  const jsonFileName =
    prefix === DEFAULT_FILE_NAME_PREFIX
      ? DEFAULT_MODEL_JSON_FILENAME
      : `${prefix}.json`;
  const weightsFileName =
    prefix === DEFAULT_FILE_NAME_PREFIX
      ? DEFAULT_MODEL_WEIGHTS_FILENAME
      : `${prefix}.weights.bin`;
  const downloadDelayMs = options?.downloadDelayMs ?? DOWNLOAD_STAGGER_MS;
  const revokeDelayMs = options?.revokeDelayMs ?? OBJECT_URL_REVOKE_DELAY_MS;

  let capturedArtifacts: ExportArtifacts | null = null;

  const saveHandler = tf.io.withSaveHandler(async (artifacts) => {
    const modelJson = buildExportedModelJson(
      artifacts,
      weightsFileName,
      options?.labelNames
    );
    const modelJsonText = JSON.stringify(modelJson);
    const weightsBuffer = normalizeWeightBuffer(artifacts.weightData);

    capturedArtifacts = {
      modelJsonText,
      weightsBuffer,
      fileNames: {
        json: jsonFileName,
        weights: weightsFileName,
      },
    };

    return {
      modelArtifactsInfo: tf.io.getModelArtifactsInfoForJSON(artifacts),
    };
  });

  await model.save(saveHandler);

  if (!capturedArtifacts) {
    throw new Error('Model save handler did not produce export artifacts.');
  }

  const result: ExportArtifacts = capturedArtifacts;

  if (options?.triggerDownload === true) {
    if (
      typeof document === 'undefined' ||
      typeof URL === 'undefined' ||
      typeof URL.createObjectURL !== 'function'
    ) {
      throw new Error(
        'Browser Blob download APIs are unavailable in this environment.'
      );
    }

    const jsonBlob = new Blob([result.modelJsonText], {
      type: 'application/json',
    });
    triggerBlobDownload(jsonBlob, result.fileNames.json, revokeDelayMs);

    await sleep(downloadDelayMs);

    const weightsBlob = new Blob([result.weightsBuffer], {
      type: 'application/octet-stream',
    });
    triggerBlobDownload(weightsBlob, result.fileNames.weights, revokeDelayMs);
  }

  return result;
}
