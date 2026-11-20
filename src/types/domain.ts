export type StageId = 'train' | 'learn' | 'make';

export type SampleSource = 'webcam' | 'upload' | 'drawing';

export type SynthSoundId = 'none' | 'chime' | 'beep' | 'success' | 'alert' | 'pop';

export type SupportedImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface TrainingConfig {
  epochs: number;
  batchSize: number;
  learningRate: number;
}

export const DEFAULT_TRAINING_CONFIG: TrainingConfig = {
  epochs: 20,
  batchSize: 16,
  learningRate: 0.001,
};

export const TRAINING_CONFIG_BOUNDS = {
  epochs: { min: 1, max: 200 },
  batchSize: { min: 1, max: 128 },
  learningRate: { min: 0.00001, max: 1 },
} as const;

export interface ReactionConfig {
  labelId: string;
  message: string;
  backgroundColor: string;
  accentColor: string;
  sound: SynthSoundId;
  enableCounter: boolean;
}

export interface ProjectRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  trainingConfig: TrainingConfig;
  lastTrainedAt?: number;
  trainedLabelOrder?: string[];
  reactions: Record<string, ReactionConfig>;
}

export interface LabelBucketRecord {
  id: string;
  projectId: string;
  name: string;
  color: string;
  order: number;
  createdAt: number;
}

export interface SampleRecord {
  id: string;
  projectId: string;
  labelId: string;
  dataUrl: string;
  mimeType: SupportedImageMimeType;
  width: number;
  height: number;
  source: SampleSource;
  createdAt: number;
}

export type CreateSampleInput = Omit<SampleRecord, 'id' | 'createdAt'>;
