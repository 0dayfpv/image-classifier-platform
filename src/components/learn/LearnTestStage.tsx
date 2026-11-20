import { useState } from 'react';
import {
  configToDraft,
  validateHyperparameterDraft,
  type HyperparameterDraft,
} from '../../hooks/uiHelpers';
import { useTranslation } from '../../i18n/useTranslation';
import {
  getDatasetReadinessTranslationKey,
  summarizeDataset,
} from '../../ml/datasetValidation';
import {
  DEFAULT_TRAINING_CONFIG,
  type LabelBucketRecord,
  type SampleRecord,
  type TrainingConfig,
} from '../../types/domain';
import type { TranslationKey } from '../../types/i18n';
import type {
  ClassPrediction,
  EpochTelemetry,
  ImageInputSource,
  TrainingProgress,
} from '../../types/ml';
import { AlertBanner } from '../common/AlertBanner';
import { AdvancedSettings } from './AdvancedSettings';
import { LiveTestPanel } from './LiveTestPanel';
import { TrainingMetricsChart } from './TrainingMetricsChart';

export interface LearnTestStageProps {
  labels: LabelBucketRecord[];
  samples: SampleRecord[];
  trainingConfig: TrainingConfig;
  isTrained: boolean;
  isStaleModel: boolean;
  isTraining: boolean;
  progress: TrainingProgress;
  telemetry: EpochTelemetry[];
  trainingErrorKey: TranslationKey | null;
  predictions: ClassPrediction[];
  onTrainModel: (config: TrainingConfig) => Promise<void>;
  onCancelTraining: () => void;
  onPredict: (input: ImageInputSource) => Promise<ClassPrediction[]>;
}

export function LearnTestStage({
  labels,
  samples,
  trainingConfig,
  isTrained,
  isStaleModel,
  isTraining,
  progress,
  telemetry,
  trainingErrorKey,
  predictions,
  onTrainModel,
  onCancelTraining,
  onPredict,
}: LearnTestStageProps) {
  const { t } = useTranslation();

  const [draft, setDraft] = useState<HyperparameterDraft>(() =>
    configToDraft(trainingConfig)
  );

  const datasetSummary = summarizeDataset(labels, samples);
  const { validation } = datasetSummary;
  const readinessKey = getDatasetReadinessTranslationKey(validation);
  const hyperValidation = validateHyperparameterDraft(draft);

  const canTrain =
    validation.isValidToTrain && hyperValidation.isValid && !isTraining;

  const computeProgressPercent = (): number => {
    if (progress.phase === 'completed') return 100;
    if (progress.phase === 'idle' && isTrained) return 100;
    if (progress.phase === 'loading_backbone') return 10;
    if (progress.phase === 'extracting_features') {
      const ratio =
        progress.totalSamples > 0
          ? progress.extractedCount / progress.totalSamples
          : 0;
      return Math.round(10 + ratio * 30);
    }
    if (progress.phase === 'training') {
      const ratio =
        progress.totalEpochs > 0
          ? progress.currentEpoch / progress.totalEpochs
          : 0;
      return Math.round(40 + ratio * 60);
    }
    return 0;
  };

  const renderStatusText = (): string => {
    switch (progress.phase) {
      case 'loading_backbone':
        return t('learn.statusLoadingBackbone');
      case 'extracting_features':
        return t('learn.statusExtractingFeatures', {
          done: progress.extractedCount,
          total: progress.totalSamples,
        });
      case 'training':
        return t('learn.statusTraining', {
          epoch: progress.currentEpoch,
          total: progress.totalEpochs,
        });
      case 'completed':
        return t('learn.statusCompleted');
      case 'cancelled':
        return t('learn.statusCancelled');
      case 'error':
        return trainingErrorKey ? t(trainingErrorKey) : t('learn.statusError');
      case 'idle':
      default:
        return isTrained ? t('learn.statusCompleted') : t('learn.statusIdle');
    }
  };

  const progressPercent = computeProgressPercent();

  return (
    <section className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <h2 className="text-xl font-bold text-slate-900">{t('learn.heading')}</h2>
        <p className="mt-1 text-sm text-slate-600">{t('stages.learnSubtitle')}</p>
      </div>

      {isStaleModel ? (
        <AlertBanner variant="warning" testId="stale-model-banner">
          {t('learn.staleModelBanner')}
        </AlertBanner>
      ) : null}

      <div
        data-testid="dataset-summary"
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
      >
        <h3 className="text-base font-bold text-slate-900">
          {t('learn.datasetSummaryHeading')}
        </h3>

        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5">
            <div className="text-xs font-medium text-slate-500">
              {t('learn.totalClassesLabel')}
            </div>
            <div className="mt-1 text-2xl font-bold text-slate-900">
              {validation.totalClasses}
            </div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5">
            <div className="text-xs font-medium text-slate-500">
              {t('learn.totalSamplesLabel')}
            </div>
            <div className="mt-1 text-2xl font-bold text-slate-900">
              {validation.totalSamples}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <AlertBanner
            testId="readiness-banner"
            variant={
              !validation.isValidToTrain
                ? 'warning'
                : validation.lowSampleLabelIds.length > 0
                  ? 'warning'
                  : 'success'
            }
          >
            {t(readinessKey)}
          </AlertBanner>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              data-testid="train-model-btn"
              disabled={!canTrain}
              onClick={() => onTrainModel(hyperValidation.parsedConfig)}
              className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isTrained || isStaleModel
                ? t('learn.retrainModelBtn')
                : t('learn.trainModelBtn')}
            </button>

            {isTraining ? (
              <button
                type="button"
                data-testid="cancel-training-btn"
                onClick={onCancelTraining}
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100"
              >
                {t('learn.cancelTrainingBtn')}
              </button>
            ) : null}
          </div>

          <div
            data-testid="training-status"
            className="text-sm font-semibold text-slate-700"
          >
            {renderStatusText()}
          </div>
        </div>

        <div data-testid="training-progress" className="mt-3">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              style={{ width: `${progressPercent}%` }}
              className="h-full rounded-full bg-indigo-600 transition-all duration-150"
            />
          </div>
        </div>
      </div>

      <AdvancedSettings
        draft={draft}
        validation={hyperValidation}
        disabled={isTraining}
        onChangeDraft={setDraft}
        onResetDefaults={() => setDraft(configToDraft(DEFAULT_TRAINING_CONFIG))}
      />

      <TrainingMetricsChart telemetry={telemetry} />

      <LiveTestPanel
        isTrained={isTrained}
        labels={labels}
        predictions={predictions}
        onPredict={onPredict}
      />
    </section>
  );
}
