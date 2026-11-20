import type { WebcamErrorCode } from '../media/webcamService';
import {
  DEFAULT_TRAINING_CONFIG,
  TRAINING_CONFIG_BOUNDS,
  type LabelBucketRecord,
  type ReactionConfig,
  type TrainingConfig,
} from '../types/domain';
import type { TranslationKey } from '../types/i18n';

export interface HyperparameterDraft {
  epochs: string;
  batchSize: string;
  learningRate: string;
}

export interface HyperparameterValidation {
  isValid: boolean;
  errorKey: TranslationKey | null;
  parsedConfig: TrainingConfig;
}

export function configToDraft(config: TrainingConfig): HyperparameterDraft {
  return {
    epochs: String(config.epochs),
    batchSize: String(config.batchSize),
    learningRate: String(config.learningRate),
  };
}

export function validateHyperparameterDraft(
  draft: HyperparameterDraft
): HyperparameterValidation {
  const epochsTrimmed = draft.epochs.trim();
  const batchTrimmed = draft.batchSize.trim();
  const lrTrimmed = draft.learningRate.trim();

  const epochsNum = Number(epochsTrimmed);
  if (
    !epochsTrimmed ||
    !/^-?\d+$/.test(epochsTrimmed) ||
    !Number.isInteger(epochsNum) ||
    epochsNum < TRAINING_CONFIG_BOUNDS.epochs.min ||
    epochsNum > TRAINING_CONFIG_BOUNDS.epochs.max
  ) {
    return {
      isValid: false,
      errorKey: 'validation.invalidEpochs',
      parsedConfig: DEFAULT_TRAINING_CONFIG,
    };
  }

  const batchNum = Number(batchTrimmed);
  if (
    !batchTrimmed ||
    !/^-?\d+$/.test(batchTrimmed) ||
    !Number.isInteger(batchNum) ||
    batchNum < TRAINING_CONFIG_BOUNDS.batchSize.min ||
    batchNum > TRAINING_CONFIG_BOUNDS.batchSize.max
  ) {
    return {
      isValid: false,
      errorKey: 'validation.invalidBatchSize',
      parsedConfig: DEFAULT_TRAINING_CONFIG,
    };
  }

  const lrNum = Number(lrTrimmed);
  if (
    !lrTrimmed ||
    !Number.isFinite(lrNum) ||
    lrNum <= 0 ||
    lrNum > TRAINING_CONFIG_BOUNDS.learningRate.max
  ) {
    return {
      isValid: false,
      errorKey: 'validation.invalidLearningRate',
      parsedConfig: DEFAULT_TRAINING_CONFIG,
    };
  }

  return {
    isValid: true,
    errorKey: null,
    parsedConfig: {
      epochs: epochsNum,
      batchSize: batchNum,
      learningRate: lrNum,
    },
  };
}

export function buildDefaultReaction(label: LabelBucketRecord): ReactionConfig {
  const color = (label.color || '#2563eb').toLowerCase();
  return {
    labelId: label.id,
    message: '',
    backgroundColor: color,
    accentColor: color,
    sound: 'none',
    enableCounter: true,
  };
}

export function mapWebcamErrorCodeToKey(code: WebcamErrorCode): TranslationKey {
  switch (code) {
    case 'PERMISSION_DENIED':
      return 'errors.webcamPermissionDenied';
    case 'NO_CAMERA':
      return 'errors.webcamNotFound';
    case 'DEVICE_IN_USE':
      return 'errors.webcamInUse';
    case 'UNSUPPORTED_CONTEXT':
      return 'errors.webcamUnsupported';
    case 'UNKNOWN':
      return 'errors.webcamNotFound';
  }
}
