import type { LabelBucketRecord, SampleRecord } from '../types/domain';
import type { TranslationKey } from '../types/i18n';
import type {
  DatasetBlockingReason,
  DatasetValidationResult,
} from '../types/ml';

export const MIN_CLASSES_TO_TRAIN = 2;
export const MIN_RECOMMENDED_SAMPLES_PER_CLASS = 5;
export const IMBALANCE_RATIO_THRESHOLD = 3;
export const IMBALANCE_MIN_MAJORITY_COUNT = 10;

export interface LabelSampleSummary {
  label: LabelBucketRecord;
  sampleCount: number;
  isEmpty: boolean;
  isLowSample: boolean;
  isImbalanced: boolean;
}

export interface DatasetSummary {
  validation: DatasetValidationResult;
  countsByLabelId: Record<string, number>;
  labelSummaries: LabelSampleSummary[];
  hasWarnings: boolean;
}

/**
 * Counts samples per known label ID.
 * Samples whose `labelId` does not correspond to any label in `labels` are safely ignored.
 */
export function countSamplesByLabel(
  labels: readonly Pick<LabelBucketRecord, 'id'>[],
  samples: readonly Pick<SampleRecord, 'labelId'>[]
): Record<string, number> {
  const countMap = new Map<string, number>();
  for (const label of labels) {
    if (!countMap.has(label.id)) {
      countMap.set(label.id, 0);
    }
  }

  for (const sample of samples) {
    const current = countMap.get(sample.labelId);
    if (current !== undefined) {
      countMap.set(sample.labelId, current + 1);
    }
  }

  const result: Record<string, number> = {};
  for (const [labelId, count] of countMap.entries()) {
    result[labelId] = count;
  }
  return result;
}

export function isLowSampleCount(count: number): boolean {
  return count > 0 && count < MIN_RECOMMENDED_SAMPLES_PER_CLASS;
}

function computeImbalancedLabelIds(
  orderedUniqueLabelIds: readonly string[],
  countMap: ReadonlyMap<string, number>
): string[] {
  const nonZeroEntries: Array<{ id: string; count: number }> = [];
  for (const id of orderedUniqueLabelIds) {
    const count = countMap.get(id) ?? 0;
    if (count > 0) {
      nonZeroEntries.push({ id, count });
    }
  }

  if (nonZeroEntries.length < MIN_CLASSES_TO_TRAIN) {
    return [];
  }

  let minNonZeroCount = Infinity;
  let maxCount = 0;
  for (const entry of nonZeroEntries) {
    if (entry.count < minNonZeroCount) {
      minNonZeroCount = entry.count;
    }
    if (entry.count > maxCount) {
      maxCount = entry.count;
    }
  }

  const hasSevereImbalance =
    maxCount >= IMBALANCE_RATIO_THRESHOLD * minNonZeroCount &&
    maxCount >= IMBALANCE_MIN_MAJORITY_COUNT;

  if (!hasSevereImbalance) {
    return [];
  }

  const imbalanced: string[] = [];
  for (const entry of nonZeroEntries) {
    const isMinorityOutlier =
      entry.count * IMBALANCE_RATIO_THRESHOLD <= maxCount;
    const isMajorityOutlier =
      entry.count >= IMBALANCE_RATIO_THRESHOLD * minNonZeroCount &&
      entry.count >= IMBALANCE_MIN_MAJORITY_COUNT;

    if (isMinorityOutlier || isMajorityOutlier) {
      imbalanced.push(entry.id);
    }
  }
  return imbalanced;
}

/**
 * Validates dataset readiness for training, low-sample advisories (< 5),
 * and severe class imbalance.
 *
 * Hard-blocks ONLY on:
 * - `NO_LABELS` (`labels.length === 0`)
 * - `FEWER_THAN_TWO_CLASSES` (`labels.length < 2`)
 * - `EMPTY_CLASSES_PRESENT` (any label has 0 samples)
 *
 * When `labels.length >= 2` and every label has `>= 1` sample, `isValidToTrain` is `true`
 * even if some labels have `1–4` samples (`lowSampleLabelIds` populated as non-blocking warning).
 */
export function validateDataset(
  labels: readonly Pick<LabelBucketRecord, 'id'>[],
  samples: readonly Pick<SampleRecord, 'labelId'>[]
): DatasetValidationResult {
  const countMap = new Map<string, number>();
  const orderedUniqueIds: string[] = [];

  for (const label of labels) {
    if (!countMap.has(label.id)) {
      countMap.set(label.id, 0);
      orderedUniqueIds.push(label.id);
    }
  }

  for (const sample of samples) {
    const current = countMap.get(sample.labelId);
    if (current !== undefined) {
      countMap.set(sample.labelId, current + 1);
    }
  }

  const emptyLabelIds: string[] = [];
  const lowSampleLabelIds: string[] = [];
  let nonEmptyClasses = 0;
  let totalSamples = 0;

  for (const id of orderedUniqueIds) {
    const count = countMap.get(id) ?? 0;
    totalSamples += count;
    if (count === 0) {
      emptyLabelIds.push(id);
    } else {
      nonEmptyClasses += 1;
      if (isLowSampleCount(count)) {
        lowSampleLabelIds.push(id);
      }
    }
  }

  const totalClasses = orderedUniqueIds.length;
  const imbalancedLabelIds = computeImbalancedLabelIds(
    orderedUniqueIds,
    countMap
  );

  let blockingReason: DatasetBlockingReason | undefined;
  if (totalClasses === 0) {
    blockingReason = 'NO_LABELS';
  } else if (totalClasses < MIN_CLASSES_TO_TRAIN) {
    blockingReason = 'FEWER_THAN_TWO_CLASSES';
  } else if (emptyLabelIds.length > 0) {
    blockingReason = 'EMPTY_CLASSES_PRESENT';
  }

  const result: DatasetValidationResult = {
    isValidToTrain: blockingReason === undefined,
    totalClasses,
    nonEmptyClasses,
    totalSamples,
    emptyLabelIds,
    lowSampleLabelIds,
    imbalancedLabelIds,
  };

  if (blockingReason !== undefined) {
    result.blockingReason = blockingReason;
  }

  return result;
}

/**
 * Returns sorted label summaries (by `order` ascending, then `createdAt` ascending)
 * paired with full `DatasetValidationResult`.
 */
export function summarizeDataset(
  labels: readonly LabelBucketRecord[],
  samples: readonly SampleRecord[]
): DatasetSummary {
  const sortedLabels = [...labels].sort(
    (a, b) => a.order - b.order || a.createdAt - b.createdAt
  );
  const countsByLabelId = countSamplesByLabel(sortedLabels, samples);
  const validation = validateDataset(sortedLabels, samples);

  const emptySet = new Set(validation.emptyLabelIds);
  const lowSampleSet = new Set(validation.lowSampleLabelIds);
  const imbalancedSet = new Set(validation.imbalancedLabelIds);

  const labelSummaries: LabelSampleSummary[] = sortedLabels.map((label) => ({
    label,
    sampleCount: countsByLabelId[label.id] ?? 0,
    isEmpty: emptySet.has(label.id),
    isLowSample: lowSampleSet.has(label.id),
    isImbalanced: imbalancedSet.has(label.id),
  }));

  return {
    validation,
    countsByLabelId,
    labelSummaries,
    hasWarnings:
      validation.lowSampleLabelIds.length > 0 ||
      validation.imbalancedLabelIds.length > 0,
  };
}

/**
 * Maps a blocking reason to its corresponding i18n dictionary key.
 */
export function getBlockingReasonTranslationKey(
  reason: DatasetBlockingReason
): TranslationKey {
  switch (reason) {
    case 'NO_LABELS':
      return 'learn.noLabelsWarning';
    case 'FEWER_THAN_TWO_CLASSES':
      return 'learn.needTwoClassesWarning';
    case 'EMPTY_CLASSES_PRESENT':
      return 'learn.emptyClassWarning';
  }
}

/**
 * Returns the primary Stage 2 dataset readiness status translation key.
 */
export function getDatasetReadinessTranslationKey(
  validation: DatasetValidationResult
): TranslationKey {
  if (validation.blockingReason !== undefined) {
    return getBlockingReasonTranslationKey(validation.blockingReason);
  }
  if (validation.lowSampleLabelIds.length > 0) {
    return 'learn.lowSampleAdvisory';
  }
  return 'learn.readyToTrainMessage';
}
