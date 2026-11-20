import type * as tf from '@tensorflow/tfjs';

export type BackendName = 'webgl' | 'cpu';

export type TrainingPhase =
  | 'idle'
  | 'loading_backbone'
  | 'extracting_features'
  | 'training'
  | 'completed'
  | 'cancelled'
  | 'error';

export interface EpochTelemetry {
  epoch: number;
  totalEpochs: number;
  loss: number;
  accuracy: number;
  valLoss?: number;
  valAccuracy?: number;
}

export interface TrainingProgress {
  phase: TrainingPhase;
  extractedCount: number;
  totalSamples: number;
  currentEpoch: number;
  totalEpochs: number;
  backend: BackendName | null;
}

export interface TrainingCallbacks {
  onProgress?: (progress: TrainingProgress) => void;
  onEpochEnd?: (telemetry: EpochTelemetry) => void;
}

export interface ClassPrediction {
  labelId: string;
  labelName: string;
  probability: number;
  percentage: number;
}

export type DatasetBlockingReason =
  | 'NO_LABELS'
  | 'FEWER_THAN_TWO_CLASSES'
  | 'EMPTY_CLASSES_PRESENT';

export interface DatasetValidationResult {
  isValidToTrain: boolean;
  totalClasses: number;
  nonEmptyClasses: number;
  totalSamples: number;
  emptyLabelIds: string[];
  lowSampleLabelIds: string[];
  imbalancedLabelIds: string[];
  blockingReason?: DatasetBlockingReason;
}

export type ImageInputSource =
  | HTMLImageElement
  | HTMLCanvasElement
  | HTMLVideoElement
  | ImageData;

export interface FeatureExtractor {
  readonly embeddingDim: number;
  extractEmbedding(input: ImageInputSource): tf.Tensor2D;
}

export interface ExportArtifacts {
  modelJsonText: string;
  weightsBuffer: ArrayBuffer;
  fileNames: {
    json: string;
    weights: string;
  };
}
