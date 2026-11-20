import { describe, it, expect } from 'vitest';
import type { LabelBucketRecord, SampleRecord } from '../../src/types/domain';
import {
  MIN_RECOMMENDED_SAMPLES_PER_CLASS,
  MIN_CLASSES_TO_TRAIN,
  IMBALANCE_RATIO_THRESHOLD,
  IMBALANCE_MIN_MAJORITY_COUNT,
  countSamplesByLabel,
  isLowSampleCount,
  validateDataset,
  summarizeDataset,
  getBlockingReasonTranslationKey,
  getDatasetReadinessTranslationKey,
} from '../../src/ml/datasetValidation';
import { tr } from '../../src/i18n/locales/tr';
import { en } from '../../src/i18n/locales/en';

function makeLabel(
  id: string,
  overrides: Partial<LabelBucketRecord> = {}
): LabelBucketRecord {
  return {
    id,
    projectId: 'proj-1',
    name: `Label ${id}`,
    color: '#3b82f6',
    order: 0,
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

function makeSamples(
  labelId: string,
  count: number,
  startIndex = 0
): SampleRecord[] {
  return Array.from({ length: count }, (_, idx) => ({
    id: `${labelId}-sample-${startIndex + idx}`,
    projectId: 'proj-1',
    labelId,
    dataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
    mimeType: 'image/jpeg',
    width: 224,
    height: 224,
    source: 'drawing',
    createdAt: 1_700_000_000_000 + startIndex + idx,
  }));
}

describe('datasetValidation constants', () => {
  it('defines expected thresholds aligned with R3 and E2E requirements', () => {
    expect(MIN_CLASSES_TO_TRAIN).toBe(2);
    expect(MIN_RECOMMENDED_SAMPLES_PER_CLASS).toBe(5);
    expect(IMBALANCE_RATIO_THRESHOLD).toBe(3);
    expect(IMBALANCE_MIN_MAJORITY_COUNT).toBe(10);
  });
});

describe('countSamplesByLabel', () => {
  it('initializes zero counts for empty labels and counts matching samples', () => {
    const labels = [makeLabel('a'), makeLabel('b'), makeLabel('c')];
    const samples = [...makeSamples('a', 3), ...makeSamples('b', 1)];

    expect(countSamplesByLabel(labels, samples)).toEqual({
      a: 3,
      b: 1,
      c: 0,
    });
  });

  it('safely ignores orphaned sample IDs that do not match any label', () => {
    const labels = [makeLabel('a'), makeLabel('b')];
    const samples = [
      ...makeSamples('a', 2),
      ...makeSamples('deleted-label', 5),
      ...makeSamples('ghost', 3),
    ];

    const counts = countSamplesByLabel(labels, samples);
    expect(counts).toEqual({ a: 2, b: 0 });
    expect('deleted-label' in counts).toBe(false);
    expect('ghost' in counts).toBe(false);
  });
});

describe('validateDataset — blocking rules', () => {
  it('blocks with NO_LABELS when labels array is empty', () => {
    const result = validateDataset([], []);

    expect(result).toEqual({
      isValidToTrain: false,
      totalClasses: 0,
      nonEmptyClasses: 0,
      totalSamples: 0,
      emptyLabelIds: [],
      lowSampleLabelIds: [],
      imbalancedLabelIds: [],
      blockingReason: 'NO_LABELS',
    });
  });

  it('blocks with FEWER_THAN_TWO_CLASSES when only 1 label exists (even with >= 5 samples)', () => {
    const labels = [makeLabel('a')];
    const samples = makeSamples('a', 6);

    const result = validateDataset(labels, samples);

    expect(result.isValidToTrain).toBe(false);
    expect(result.blockingReason).toBe('FEWER_THAN_TWO_CLASSES');
    expect(result.totalClasses).toBe(1);
    expect(result.nonEmptyClasses).toBe(1);
    expect(result.totalSamples).toBe(6);
    expect(result.emptyLabelIds).toEqual([]);
    expect(result.lowSampleLabelIds).toEqual([]);
    expect(result.imbalancedLabelIds).toEqual([]);
  });

  it('blocks with FEWER_THAN_TWO_CLASSES and records empty/lowSample when single label has 0 or <5 samples', () => {
    const emptySingle = validateDataset([makeLabel('a')], []);
    expect(emptySingle.isValidToTrain).toBe(false);
    expect(emptySingle.blockingReason).toBe('FEWER_THAN_TWO_CLASSES');
    expect(emptySingle.emptyLabelIds).toEqual(['a']);
    expect(emptySingle.lowSampleLabelIds).toEqual([]);

    const lowSingle = validateDataset([makeLabel('a')], makeSamples('a', 2));
    expect(lowSingle.isValidToTrain).toBe(false);
    expect(lowSingle.blockingReason).toBe('FEWER_THAN_TWO_CLASSES');
    expect(lowSingle.emptyLabelIds).toEqual([]);
    expect(lowSingle.lowSampleLabelIds).toEqual(['a']);
  });

  it('blocks with EMPTY_CLASSES_PRESENT when >= 2 labels exist and at least one has 0 samples', () => {
    const labels = [makeLabel('a'), makeLabel('b'), makeLabel('c')];
    const samples = [...makeSamples('a', 5), ...makeSamples('b', 4)];

    const result = validateDataset(labels, samples);

    expect(result.isValidToTrain).toBe(false);
    expect(result.blockingReason).toBe('EMPTY_CLASSES_PRESENT');
    expect(result.totalClasses).toBe(3);
    expect(result.nonEmptyClasses).toBe(2);
    expect(result.totalSamples).toBe(9);
    expect(result.emptyLabelIds).toEqual(['c']);
    expect(result.lowSampleLabelIds).toEqual(['b']);
  });

  it('blocks with EMPTY_CLASSES_PRESENT when >= 2 labels all have 0 samples', () => {
    const result = validateDataset([makeLabel('a'), makeLabel('b')], []);

    expect(result.isValidToTrain).toBe(false);
    expect(result.blockingReason).toBe('EMPTY_CLASSES_PRESENT');
    expect(result.emptyLabelIds).toEqual(['a', 'b']);
    expect(result.lowSampleLabelIds).toEqual([]);
    expect(result.imbalancedLabelIds).toEqual([]);
  });
});

describe('validateDataset — low-sample (< 5) boundary & E2E trainability', () => {
  it('treats 0, 1, 4, 5 boundaries accurately via isLowSampleCount', () => {
    expect(isLowSampleCount(0)).toBe(false);
    expect(isLowSampleCount(1)).toBe(true);
    expect(isLowSampleCount(4)).toBe(true);
    expect(isLowSampleCount(5)).toBe(false);
  });

  it('allows training (isValidToTrain: true) with 1 sample per class while flagging lowSampleLabelIds', () => {
    const labels = [makeLabel('cat'), makeLabel('dog')];
    const samples = [...makeSamples('cat', 1), ...makeSamples('dog', 1)];

    const result = validateDataset(labels, samples);

    expect(result.isValidToTrain).toBe(true);
    expect(result.blockingReason).toBeUndefined();
    expect(result.emptyLabelIds).toEqual([]);
    expect(result.lowSampleLabelIds).toEqual(['cat', 'dog']);
    expect(result.imbalancedLabelIds).toEqual([]);
  });

  it('flags 4 samples as low-sample and 5 samples as sufficient without blocking training', () => {
    const labels = [makeLabel('a'), makeLabel('b')];
    const samples = [...makeSamples('a', 4), ...makeSamples('b', 5)];

    const result = validateDataset(labels, samples);

    expect(result.isValidToTrain).toBe(true);
    expect(result.blockingReason).toBeUndefined();
    expect(result.lowSampleLabelIds).toEqual(['a']);
    expect(result.imbalancedLabelIds).toEqual([]);
  });

  it('produces zero warnings when all classes have >= 5 balanced samples', () => {
    const labels = [makeLabel('a'), makeLabel('b')];
    const samples = [...makeSamples('a', 5), ...makeSamples('b', 5)];

    const result = validateDataset(labels, samples);

    expect(result).toEqual({
      isValidToTrain: true,
      totalClasses: 2,
      nonEmptyClasses: 2,
      totalSamples: 10,
      emptyLabelIds: [],
      lowSampleLabelIds: [],
      imbalancedLabelIds: [],
    });
  });
});

describe('validateDataset — severe imbalance detection', () => {
  it('does not flag imbalance for small synthetic datasets below maxCount >= 10 (e.g., 1 vs 9, 3 vs 9)', () => {
    const labels = [makeLabel('a'), makeLabel('b')];

    expect(
      validateDataset(labels, [...makeSamples('a', 1), ...makeSamples('b', 9)])
        .imbalancedLabelIds
    ).toEqual([]);

    expect(
      validateDataset(labels, [...makeSamples('a', 3), ...makeSamples('b', 9)])
        .imbalancedLabelIds
    ).toEqual([]);
  });

  it('does not flag imbalance when ratio is strictly below 3x even if maxCount >= 10 (e.g., 5 vs 14)', () => {
    const labels = [makeLabel('a'), makeLabel('b')];
    const samples = [...makeSamples('a', 5), ...makeSamples('b', 14)];

    const result = validateDataset(labels, samples);
    expect(result.isValidToTrain).toBe(true);
    expect(result.imbalancedLabelIds).toEqual([]);
  });

  it('flags exact imbalance threshold boundaries (3 vs 10 and 5 vs 15) without blocking training', () => {
    const labels = [makeLabel('a'), makeLabel('b')];

    const res3v10 = validateDataset(labels, [
      ...makeSamples('a', 3),
      ...makeSamples('b', 10),
    ]);
    expect(res3v10.isValidToTrain).toBe(true);
    expect(res3v10.lowSampleLabelIds).toEqual(['a']);
    expect(res3v10.imbalancedLabelIds).toEqual(['a', 'b']);

    const res5v15 = validateDataset(labels, [
      ...makeSamples('a', 5),
      ...makeSamples('b', 15),
    ]);
    expect(res5v15.isValidToTrain).toBe(true);
    expect(res5v15.lowSampleLabelIds).toEqual([]);
    expect(res5v15.imbalancedLabelIds).toEqual(['a', 'b']);
  });

  it('identifies extreme minority and majority labels in 3-class datasets while excluding balanced middle class', () => {
    const labels = [makeLabel('a'), makeLabel('b'), makeLabel('c')];
    const samples = [
      ...makeSamples('a', 5),
      ...makeSamples('b', 10),
      ...makeSamples('c', 15),
    ];

    const result = validateDataset(labels, samples);
    expect(result.isValidToTrain).toBe(true);
    expect(result.imbalancedLabelIds).toEqual(['a', 'c']);
  });

  it('does not flag imbalance when fewer than 2 non-empty classes exist (e.g., 15 vs 0)', () => {
    const labels = [makeLabel('a'), makeLabel('b')];
    const samples = makeSamples('a', 15);

    const result = validateDataset(labels, samples);
    expect(result.isValidToTrain).toBe(false);
    expect(result.blockingReason).toBe('EMPTY_CLASSES_PRESENT');
    expect(result.imbalancedLabelIds).toEqual([]);
  });

  it('flags non-empty imbalanced classes even when a 3rd class is empty', () => {
    const labels = [makeLabel('a'), makeLabel('b'), makeLabel('c')];
    const samples = [...makeSamples('a', 5), ...makeSamples('b', 15)];

    const result = validateDataset(labels, samples);
    expect(result.isValidToTrain).toBe(false);
    expect(result.blockingReason).toBe('EMPTY_CLASSES_PRESENT');
    expect(result.emptyLabelIds).toEqual(['c']);
    expect(result.imbalancedLabelIds).toEqual(['a', 'b']);
  });
});

describe('validateDataset — orphaned samples safety', () => {
  it('ignores orphaned samples when labels are empty', () => {
    const result = validateDataset([], makeSamples('orphan', 10));

    expect(result.isValidToTrain).toBe(false);
    expect(result.blockingReason).toBe('NO_LABELS');
    expect(result.totalSamples).toBe(0);
  });

  it('ignores orphaned samples so they do not inflate totalSamples or mask empty/imbalanced classes', () => {
    const labels = [makeLabel('a'), makeLabel('b')];
    const samples = [
      ...makeSamples('a', 5),
      ...makeSamples('b', 5),
      ...makeSamples('orphan-1', 50),
    ];

    const result = validateDataset(labels, samples);
    expect(result.isValidToTrain).toBe(true);
    expect(result.totalSamples).toBe(10);
    expect(result.imbalancedLabelIds).toEqual([]);
  });
});

describe('summarizeDataset & i18n key helpers', () => {
  it('sorts label summaries by order then createdAt without mutating inputs', () => {
    const labelB = makeLabel('b', { order: 1, createdAt: 200 });
    const labelA2 = makeLabel('a2', { order: 0, createdAt: 200 });
    const labelA1 = makeLabel('a1', { order: 0, createdAt: 100 });
    const labels = [labelB, labelA2, labelA1];
    const samples = [
      ...makeSamples('a1', 5),
      ...makeSamples('a2', 2),
      ...makeSamples('b', 15),
    ];

    const summary = summarizeDataset(labels, samples);

    expect(labels.map((l) => l.id)).toEqual(['b', 'a2', 'a1']);
    expect(summary.labelSummaries.map((s) => s.label.id)).toEqual([
      'a1',
      'a2',
      'b',
    ]);
    expect(summary.countsByLabelId).toEqual({ a1: 5, a2: 2, b: 15 });
    expect(summary.hasWarnings).toBe(true);
    expect(summary.labelSummaries).toEqual([
      {
        label: labelA1,
        sampleCount: 5,
        isEmpty: false,
        isLowSample: false,
        isImbalanced: true,
      },
      {
        label: labelA2,
        sampleCount: 2,
        isEmpty: false,
        isLowSample: true,
        isImbalanced: true,
      },
      {
        label: labelB,
        sampleCount: 15,
        isEmpty: false,
        isLowSample: false,
        isImbalanced: true,
      },
    ]);
  });

  it('maps blocking and readiness states to valid tr/en translation keys', () => {
    expect(getBlockingReasonTranslationKey('NO_LABELS')).toBe(
      'learn.noLabelsWarning'
    );
    expect(getBlockingReasonTranslationKey('FEWER_THAN_TWO_CLASSES')).toBe(
      'learn.needTwoClassesWarning'
    );
    expect(getBlockingReasonTranslationKey('EMPTY_CLASSES_PRESENT')).toBe(
      'learn.emptyClassWarning'
    );

    const lowSampleRes = validateDataset(
      [makeLabel('a'), makeLabel('b')],
      [...makeSamples('a', 2), ...makeSamples('b', 2)]
    );
    expect(getDatasetReadinessTranslationKey(lowSampleRes)).toBe(
      'learn.lowSampleAdvisory'
    );

    const readyRes = validateDataset(
      [makeLabel('a'), makeLabel('b')],
      [...makeSamples('a', 5), ...makeSamples('b', 5)]
    );
    expect(getDatasetReadinessTranslationKey(readyRes)).toBe(
      'learn.readyToTrainMessage'
    );

    expect(tr.learn.noLabelsWarning.length).toBeGreaterThan(0);
    expect(en.learn.noLabelsWarning.length).toBeGreaterThan(0);
    expect(tr.learn.lowSampleAdvisory.length).toBeGreaterThan(0);
    expect(en.learn.lowSampleAdvisory.length).toBeGreaterThan(0);
  });
});
