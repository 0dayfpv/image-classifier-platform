import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getActiveBackend } from '../ml/backend';
import { FeatureCache } from '../ml/featureCache';
import {
  MobileNetLoadError,
  loadMobileNetExtractor,
} from '../ml/mobilenetLoader';
import {
  TransferClassifier,
  TransferClassifierError,
} from '../ml/transferClassifier';
import type {
  LabelBucketRecord,
  SampleRecord,
  TrainingConfig,
} from '../types/domain';
import type { TranslationKey } from '../types/i18n';
import type {
  ClassPrediction,
  EpochTelemetry,
  ImageInputSource,
  TrainingProgress,
} from '../types/ml';
import { buildDatasetSignature } from './useProjectWorkspace';

const INITIAL_PROGRESS: TrainingProgress = {
  phase: 'idle',
  extractedCount: 0,
  totalSamples: 0,
  currentEpoch: 0,
  totalEpochs: 0,
  backend: null,
};

export interface UseTrainingSessionOptions {
  projectId: string | null;
  labels: LabelBucketRecord[];
  samples: SampleRecord[];
  trainedLabelOrder?: string[];
  onTrainingSaved: (config: TrainingConfig, trainedLabelIds: string[]) => Promise<void>;
}

export function useTrainingSession({
  projectId,
  labels,
  samples,
  trainedLabelOrder,
  onTrainingSaved,
}: UseTrainingSessionOptions) {
  const classifierRef = useRef<TransferClassifier | null>(null);
  const featureCacheRef = useRef<FeatureCache>(new FeatureCache());
  const abortControllerRef = useRef<AbortController | null>(null);

  const [trackedProjectId, setTrackedProjectId] = useState<string | null>(
    projectId
  );
  const [isTrained, setIsTrained] = useState(false);
  const [rawTrainedLabels, setRawTrainedLabels] = useState<LabelBucketRecord[]>(
    []
  );
  const [trainedSignature, setTrainedSignature] = useState<string | null>(null);
  const [progress, setProgress] = useState<TrainingProgress>(INITIAL_PROGRESS);
  const [telemetry, setTelemetry] = useState<EpochTelemetry[]>([]);
  const [trainingErrorKey, setTrainingErrorKey] = useState<TranslationKey | null>(
    null
  );
  const [rawPredictions, setRawPredictions] = useState<ClassPrediction[]>([]);

  if (trackedProjectId !== projectId) {
    setTrackedProjectId(projectId);
    setIsTrained(false);
    setRawTrainedLabels([]);
    setTrainedSignature(null);
    setProgress(INITIAL_PROGRESS);
    setTelemetry([]);
    setTrainingErrorKey(null);
    setRawPredictions([]);
  }

  // Cleanup refs when projectId changes or on unmount
  useEffect(() => {
    const cache = featureCacheRef.current;
    return () => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      classifierRef.current?.dispose();
      classifierRef.current = null;
      cache.clear();
    };
  }, [projectId]);

  // Rehydrate saved model from IndexedDB if available and matching current labels
  useEffect(() => {
    if (
      !projectId ||
      isTrained ||
      !trainedLabelOrder ||
      trainedLabelOrder.length < 2 ||
      labels.length < 2
    ) {
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const extractor = await loadMobileNetExtractor();
        if (cancelled) return;
        const classifier =
          classifierRef.current ??
          new TransferClassifier(extractor, featureCacheRef.current);
        classifierRef.current = classifier;

        const restored = await classifier.loadFromIndexedDB(
          projectId,
          labels,
          trainedLabelOrder
        );
        if (cancelled) return;
        if (restored) {
          setIsTrained(true);
          setRawTrainedLabels(classifier.getTrainedLabels());
          setTrainedSignature(buildDatasetSignature(labels, samples));
        }
      } catch {
        // Ignore silent rehydration failure; user can train explicitly
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, isTrained, trainedLabelOrder, labels, samples]);

  const trainedLabels = useMemo(() => {
    if (!isTrained) return [];
    const byId = new Map(labels.map((l) => [l.id, l]));
    return rawTrainedLabels.map((item) => {
      const current = byId.get(item.id);
      return current ? { ...item, name: current.name, color: current.color } : item;
    });
  }, [isTrained, labels, rawTrainedLabels]);

  const predictions = useMemo(() => {
    const byId = new Map(labels.map((l) => [l.id, l]));
    return rawPredictions.map((pred) => {
      const current = byId.get(pred.labelId);
      return current ? { ...pred, labelName: current.name } : pred;
    });
  }, [labels, rawPredictions]);

  const currentSignature = buildDatasetSignature(labels, samples);
  const isStaleModel =
    isTrained &&
    trainedSignature !== null &&
    currentSignature !== trainedSignature;

  const isTraining =
    progress.phase === 'loading_backbone' ||
    progress.phase === 'extracting_features' ||
    progress.phase === 'training';

  const startTraining = useCallback(
    async (config: TrainingConfig) => {
      if (!projectId) return;

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setTrainingErrorKey(null);
      setTelemetry([]);
      setRawPredictions([]);
      setProgress({
        phase: 'loading_backbone',
        extractedCount: 0,
        totalSamples: samples.length,
        currentEpoch: 0,
        totalEpochs: config.epochs,
        backend: getActiveBackend(),
      });

      try {
        const extractor = await loadMobileNetExtractor();
        if (controller.signal.aborted) {
          setProgress((prev) => ({ ...prev, phase: 'cancelled' }));
          return;
        }

        if (!classifierRef.current) {
          classifierRef.current = new TransferClassifier(
            extractor,
            featureCacheRef.current
          );
        }

        const classifier = classifierRef.current;
        await classifier.train(
          labels,
          samples,
          config,
          {
            onProgress: (p) => {
              setProgress(p);
            },
            onEpochEnd: (epochTelemetry) => {
              setTelemetry((prev) => [...prev, epochTelemetry]);
            },
          },
          controller.signal
        );

        const nextTrainedLabels = classifier.getTrainedLabels();
        setIsTrained(true);
        setRawTrainedLabels(nextTrainedLabels);
        setTrainedSignature(buildDatasetSignature(labels, samples));

        await classifier.saveToIndexedDB(projectId);
        await onTrainingSaved(
          config,
          nextTrainedLabels.map((l) => l.id)
        );
      } catch (err) {
        if (
          err instanceof TransferClassifierError &&
          err.code === 'TRAINING_ABORTED'
        ) {
          setProgress((prev) => ({ ...prev, phase: 'cancelled' }));
          return;
        }
        if (err instanceof TransferClassifierError && err.code === 'NAN_LOSS') {
          setTrainingErrorKey('errors.trainingNanLoss');
          setProgress((prev) => ({ ...prev, phase: 'error' }));
          return;
        }
        if (err instanceof MobileNetLoadError) {
          setTrainingErrorKey('errors.mobilenetLoadFailed');
          setProgress((prev) => ({ ...prev, phase: 'error' }));
          return;
        }
        setTrainingErrorKey('learn.statusError');
        setProgress((prev) => ({ ...prev, phase: 'error' }));
      }
    },
    [labels, onTrainingSaved, projectId, samples]
  );

  const cancelTraining = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const predict = useCallback(
    async (input: ImageInputSource): Promise<ClassPrediction[]> => {
      const classifier = classifierRef.current;
      if (!classifier || !classifier.isTrained()) {
        return [];
      }
      const preds = await classifier.predict(input);
      const byId = new Map(labels.map((l) => [l.id, l]));
      const localizedPreds = preds.map((p) => ({
        ...p,
        labelName: byId.get(p.labelId)?.name ?? p.labelName,
      }));
      setRawPredictions(localizedPreds);
      return localizedPreds;
    },
    [labels]
  );

  const exportModel = useCallback(async () => {
    const classifier = classifierRef.current;
    if (!classifier || !classifier.isTrained()) return;
    await classifier.exportModel(true);
  }, []);

  return {
    isTrained,
    isStaleModel,
    isTraining,
    trainedLabels,
    progress,
    telemetry,
    trainingErrorKey,
    predictions,
    startTraining,
    cancelTraining,
    predict,
    exportModel,
  };
}
