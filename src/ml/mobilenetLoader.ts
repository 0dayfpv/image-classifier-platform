import * as tf from '@tensorflow/tfjs';
import * as mobilenet from '@tensorflow-models/mobilenet';
import type { FeatureExtractor, ImageInputSource } from '../types/ml';
import { initTfBackend } from './backend';

export const MOBILENET_RELATIVE_MODEL_PATH = 'models/mobilenet_v2_1.0_224/model.json';
export const REMOTE_MOBILENET_MODEL_URL =
  'https://storage.googleapis.com/tfjs-models/savedmodel/mobilenet_v2_1.0_224/model.json';

export type MobileNetLoadErrorCode = 'MODEL_LOAD_FAILED' | 'INVALID_EMBEDDING_SHAPE';

export class MobileNetLoadError extends Error {
  readonly code: MobileNetLoadErrorCode;

  constructor(code: MobileNetLoadErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'MobileNetLoadError';
    this.code = code;
  }
}

let extractorPromise: Promise<FeatureExtractor> | null = null;
let cachedExtractor: FeatureExtractor | null = null;

export function getLocalMobileNetUrl(): string {
  const metaEnv = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env;
  const rawBase = metaEnv?.BASE_URL ?? '/';
  const normalizedBase = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;
  return `${normalizedBase}${MOBILENET_RELATIVE_MODEL_PATH}`;
}

export function isValidMobileNetModelJson(json: unknown): boolean {
  if (typeof json !== 'object' || json === null) {
    return false;
  }
  const candidate = json as {
    modelTopology?: { node?: unknown };
    weightsManifest?: unknown;
  };
  return (
    Array.isArray(candidate.modelTopology?.node) &&
    candidate.modelTopology.node.length > 0 &&
    Array.isArray(candidate.weightsManifest) &&
    candidate.weightsManifest.length > 0
  );
}

export async function resolveMobileNetModelUrl(): Promise<string> {
  const localUrl = getLocalMobileNetUrl();
  if (typeof fetch !== 'function') {
    return REMOTE_MOBILENET_MODEL_URL;
  }

  try {
    const response = await fetch(localUrl, { method: 'GET' });
    if (!response.ok) {
      return REMOTE_MOBILENET_MODEL_URL;
    }
    const json: unknown = await response.json();
    return isValidMobileNetModelJson(json) ? localUrl : REMOTE_MOBILENET_MODEL_URL;
  } catch {
    return REMOTE_MOBILENET_MODEL_URL;
  }
}

function probeEmbeddingDim(model: mobilenet.MobileNet): number {
  return tf.tidy(() => {
    const dummy = tf.zeros([224, 224, 3]);
    const embedding = model.infer(dummy, true);
    const dim = embedding.shape[1];
    if (
      embedding.rank !== 2 ||
      typeof dim !== 'number' ||
      !Number.isInteger(dim) ||
      dim <= 0
    ) {
      throw new MobileNetLoadError(
        'INVALID_EMBEDDING_SHAPE',
        `Expected 2D embedding [1, D], got shape [${embedding.shape.join(', ')}].`
      );
    }
    return dim;
  });
}

export function loadMobileNetExtractor(): Promise<FeatureExtractor> {
  if (cachedExtractor) {
    return Promise.resolve(cachedExtractor);
  }
  if (extractorPromise) {
    return extractorPromise;
  }

  extractorPromise = (async (): Promise<FeatureExtractor> => {
    await initTfBackend();
    const modelUrl = await resolveMobileNetModelUrl();
    const model = await mobilenet.load({
      version: 2,
      alpha: 1.0,
      modelUrl,
      inputRange: [0, 1],
    });

    const embeddingDim = probeEmbeddingDim(model);
    const extractor: FeatureExtractor = {
      embeddingDim,
      extractEmbedding(input: ImageInputSource): tf.Tensor2D {
        return tf.tidy(() => {
          const tensor = model.infer(input, true);
          if (tensor.rank !== 2 || tensor.shape[1] !== embeddingDim) {
            return tensor.reshape([1, embeddingDim]) as tf.Tensor2D;
          }
          return tensor as tf.Tensor2D;
        });
      },
    };

    cachedExtractor = extractor;
    return extractor;
  })().catch((error: unknown) => {
    extractorPromise = null;
    cachedExtractor = null;
    if (error instanceof MobileNetLoadError) {
      throw error;
    }
    throw new MobileNetLoadError(
      'MODEL_LOAD_FAILED',
      error instanceof Error ? error.message : 'Failed to load MobileNetV2 model.',
      { cause: error }
    );
  });

  return extractorPromise;
}

export function resetMobileNetLoaderForTests(): void {
  extractorPromise = null;
  cachedExtractor = null;
}
