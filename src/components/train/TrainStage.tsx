import { useState, type FormEvent } from 'react';
import { useTranslation } from '../../i18n/useTranslation';
import {
  ImageProcessingError,
  normalizeFileToImage,
  type NormalizedImageResult,
} from '../../media/imageProcessor';
import { summarizeDataset } from '../../ml/datasetValidation';
import { isStorageError } from '../../storage/db';
import {
  MAX_LABEL_NAME_LENGTH,
  sanitizeDisplayName,
} from '../../storage/projectRepository';
import type {
  CreateSampleInput,
  LabelBucketRecord,
  SampleRecord,
} from '../../types/domain';
import type { TranslationKey } from '../../types/i18n';
import { AlertBanner } from '../common/AlertBanner';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { DrawingPad } from './DrawingPad';
import { LabelBucketCard } from './LabelBucketCard';
import { WebcamCaptureModal } from './WebcamCaptureModal';

export interface TrainStageProps {
  projectId: string;
  labels: LabelBucketRecord[];
  samples: SampleRecord[];
  onCreateLabel: (name: string) => Promise<void>;
  onRenameLabel: (labelId: string, newName: string) => Promise<void>;
  onDeleteLabel: (labelId: string) => Promise<void>;
  onAddSample: (input: CreateSampleInput) => Promise<void>;
  onDeleteSample: (sampleId: string) => Promise<void>;
  onProceedToLearn: () => void;
}

export function TrainStage({
  projectId,
  labels,
  samples,
  onCreateLabel,
  onRenameLabel,
  onDeleteLabel,
  onAddSample,
  onDeleteSample,
  onProceedToLearn,
}: TrainStageProps) {
  const { t } = useTranslation();

  const [isAddLabelOpen, setIsAddLabelOpen] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [labelFormErrorKey, setLabelFormErrorKey] = useState<TranslationKey | null>(
    null
  );

  const [trainErrorKey, setTrainErrorKey] = useState<TranslationKey | null>(null);
  const [activeWebcamLabel, setActiveWebcamLabel] =
    useState<LabelBucketRecord | null>(null);
  const [activeDrawingLabel, setActiveDrawingLabel] =
    useState<LabelBucketRecord | null>(null);
  const [pendingDeleteLabel, setPendingDeleteLabel] = useState<{
    label: LabelBucketRecord;
    count: number;
  } | null>(null);

  const summary = summarizeDataset(labels, samples);
  const hasImbalance = summary.validation.imbalancedLabelIds.length > 0;

  const samplesByLabelId = new Map<string, SampleRecord[]>();
  for (const label of labels) {
    samplesByLabelId.set(label.id, []);
  }
  for (const sample of samples) {
    const bucket = samplesByLabelId.get(sample.labelId);
    if (bucket) {
      bucket.push(sample);
    }
  }

  const handleOpenAddLabel = () => {
    setNewLabelName('');
    setLabelFormErrorKey(null);
    setIsAddLabelOpen(true);
  };

  const handleCreateLabelSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = sanitizeDisplayName(newLabelName);
    if (!trimmed) {
      setLabelFormErrorKey('validation.labelNameRequired');
      return;
    }
    if (trimmed.length > MAX_LABEL_NAME_LENGTH) {
      setLabelFormErrorKey('validation.labelNameTooLong');
      return;
    }

    try {
      await onCreateLabel(trimmed);
      setNewLabelName('');
      setLabelFormErrorKey(null);
      setIsAddLabelOpen(false);
    } catch (err) {
      if (isStorageError(err) && err.code === 'DUPLICATE_NAME') {
        setLabelFormErrorKey('validation.labelDuplicate');
      } else {
        setLabelFormErrorKey('errors.storageUnavailable');
      }
    }
  };

  const handleUploadFiles = async (labelId: string, files: File[]) => {
    setTrainErrorKey(null);
    for (const file of files) {
      try {
        const normalized = await normalizeFileToImage(file);
        await onAddSample({
          projectId,
          labelId,
          dataUrl: normalized.dataUrl,
          mimeType: normalized.mimeType,
          width: normalized.width,
          height: normalized.height,
          source: 'upload',
        });
      } catch (err) {
        if (err instanceof ImageProcessingError) {
          if (err.code === 'UNSUPPORTED_FILE_TYPE') {
            setTrainErrorKey('errors.unsupportedFileType');
          } else {
            setTrainErrorKey('errors.imageLoadFailed');
          }
        } else if (isStorageError(err) && err.code === 'QUOTA_EXCEEDED') {
          setTrainErrorKey('errors.storageQuotaExceeded');
        } else {
          setTrainErrorKey('errors.imageLoadFailed');
        }
      }
    }
  };

  const handleAddNormalizedSample = async (
    labelId: string,
    source: 'webcam' | 'drawing',
    normalized: NormalizedImageResult
  ) => {
    await onAddSample({
      projectId,
      labelId,
      dataUrl: normalized.dataUrl,
      mimeType: normalized.mimeType,
      width: normalized.width,
      height: normalized.height,
      source,
    });
  };

  return (
    <section className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{t('train.heading')}</h2>
          <p className="mt-1 text-sm text-slate-600">
            {labels.length > 0
              ? t('train.recognisingSummary', {
                  labels: labels.map((l) => l.name).join(', '),
                })
              : t('stages.trainSubtitle')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            data-testid="add-label-btn"
            onClick={handleOpenAddLabel}
            className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-700"
          >
            {t('train.addLabelBtn')}
          </button>
          <button
            type="button"
            data-testid="proceed-to-learn-btn"
            onClick={onProceedToLearn}
            className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
          >
            {t('train.proceedToLearn')}
          </button>
        </div>
      </div>

      {isAddLabelOpen ? (
        <form
          onSubmit={handleCreateLabelSubmit}
          noValidate
          className="rounded-2xl border border-indigo-200 bg-white p-5 shadow-sm"
        >
          <h3 className="text-sm font-bold text-slate-900">
            {t('train.newLabelModalTitle')}
          </h3>
          <div className="mt-3 flex flex-wrap items-start gap-3">
            <div className="min-w-60 flex-1">
              <input
                type="text"
                data-testid="label-name-input"
                value={newLabelName}
                onChange={(e) => {
                  setNewLabelName(e.target.value);
                  if (labelFormErrorKey) setLabelFormErrorKey(null);
                }}
                placeholder={t('train.labelNamePlaceholder')}
                autoFocus
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-hidden"
              />
              {labelFormErrorKey ? (
                <p
                  data-testid="label-form-error"
                  role="alert"
                  className="mt-1.5 text-xs font-medium text-red-600"
                >
                  {t(labelFormErrorKey)}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                data-testid="label-create-submit"
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                {t('train.createLabelSubmit')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsAddLabelOpen(false);
                  setLabelFormErrorKey(null);
                }}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </form>
      ) : null}

      {trainErrorKey ? (
        <AlertBanner
          variant="error"
          testId="train-error-banner"
          onDismiss={() => setTrainErrorKey(null)}
        >
          {t(trainErrorKey)}
        </AlertBanner>
      ) : null}

      {hasImbalance ? (
        <AlertBanner variant="warning" testId="imbalance-warning">
          <span className="font-semibold">{t('train.imbalanceWarning')}</span> —{' '}
          {t('train.imbalanceDetail')}
        </AlertBanner>
      ) : null}

      {labels.length === 0 ? (
        <div
          data-testid="train-empty-buckets"
          className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white p-12 text-center"
        >
          <h3 className="text-base font-bold text-slate-900">
            {t('train.emptyBucketsTitle')}
          </h3>
          <p className="mt-1 max-w-md text-sm text-slate-600">
            {t('train.emptyBucketsBody')}
          </p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {labels.map((label) => (
            <LabelBucketCard
              key={label.id}
              label={label}
              samples={samplesByLabelId.get(label.id) ?? []}
              onRenameLabel={onRenameLabel}
              onRequestDeleteLabel={(target, count) =>
                setPendingDeleteLabel({ label: target, count })
              }
              onUploadFiles={handleUploadFiles}
              onOpenWebcam={(target) => setActiveWebcamLabel(target)}
              onOpenDrawingPad={(target) => setActiveDrawingLabel(target)}
              onDeleteSample={onDeleteSample}
            />
          ))}
        </div>
      )}

      {activeWebcamLabel ? (
        <WebcamCaptureModal
          isOpen={true}
          labelName={activeWebcamLabel.name}
          onCaptureSample={(img) =>
            handleAddNormalizedSample(activeWebcamLabel.id, 'webcam', img)
          }
          onClose={() => setActiveWebcamLabel(null)}
        />
      ) : null}

      {activeDrawingLabel ? (
        <DrawingPad
          mode="modal"
          labelName={activeDrawingLabel.name}
          onAddSample={(img) =>
            handleAddNormalizedSample(activeDrawingLabel.id, 'drawing', img)
          }
          onClose={() => setActiveDrawingLabel(null)}
        />
      ) : null}

      <ConfirmDialog
        isOpen={pendingDeleteLabel !== null}
        message={
          pendingDeleteLabel
            ? t('train.deleteLabelConfirm', {
                name: pendingDeleteLabel.label.name,
                count: pendingDeleteLabel.count,
              })
            : ''
        }
        onConfirm={async () => {
          if (!pendingDeleteLabel) return;
          const id = pendingDeleteLabel.label.id;
          setPendingDeleteLabel(null);
          await onDeleteLabel(id);
        }}
        onCancel={() => setPendingDeleteLabel(null)}
      />
    </section>
  );
}
