import { useState, type FormEvent } from 'react';
import { useTranslation } from '../../i18n/useTranslation';
import { isLowSampleCount } from '../../ml/datasetValidation';
import { isStorageError } from '../../storage/db';
import {
  MAX_LABEL_NAME_LENGTH,
  sanitizeDisplayName,
} from '../../storage/projectRepository';
import type { LabelBucketRecord, SampleRecord } from '../../types/domain';
import type { TranslationKey } from '../../types/i18n';
import { FileDropzone } from './FileDropzone';

export interface LabelBucketCardProps {
  label: LabelBucketRecord;
  samples: SampleRecord[];
  onRenameLabel: (labelId: string, newName: string) => Promise<void>;
  onRequestDeleteLabel: (label: LabelBucketRecord, sampleCount: number) => void;
  onUploadFiles: (labelId: string, files: File[]) => Promise<void>;
  onOpenWebcam: (label: LabelBucketRecord) => void;
  onOpenDrawingPad: (label: LabelBucketRecord) => void;
  onDeleteSample: (sampleId: string) => Promise<void>;
}

export function LabelBucketCard({
  label,
  samples,
  onRenameLabel,
  onRequestDeleteLabel,
  onUploadFiles,
  onOpenWebcam,
  onOpenDrawingPad,
  onDeleteSample,
}: LabelBucketCardProps) {
  const { t } = useTranslation();
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(label.name);
  const [renameErrorKey, setRenameErrorKey] = useState<TranslationKey | null>(null);

  const sampleCount = samples.length;
  const showLowSampleWarning = isLowSampleCount(sampleCount);

  const handleStartRename = () => {
    setRenameValue(label.name);
    setRenameErrorKey(null);
    setIsRenaming(true);
  };

  const handleCancelRename = () => {
    setIsRenaming(false);
    setRenameErrorKey(null);
  };

  const handleRenameSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = sanitizeDisplayName(renameValue);
    if (!trimmed) {
      setRenameErrorKey('validation.labelNameRequired');
      return;
    }
    if (trimmed.length > MAX_LABEL_NAME_LENGTH) {
      setRenameErrorKey('validation.labelNameTooLong');
      return;
    }

    try {
      await onRenameLabel(label.id, trimmed);
      setIsRenaming(false);
      setRenameErrorKey(null);
    } catch (err) {
      if (isStorageError(err) && err.code === 'DUPLICATE_NAME') {
        setRenameErrorKey('validation.labelDuplicate');
      } else {
        setRenameErrorKey('errors.storageUnavailable');
      }
    }
  };

  return (
    <article
      data-testid="label-bucket"
      className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
    >
      <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            style={{ backgroundColor: label.color }}
            className="h-3.5 w-3.5 shrink-0 rounded-full"
          />
          <h3
            data-testid="label-bucket-name"
            className="truncate text-base font-bold text-slate-900"
          >
            {label.name}
          </h3>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <span
            data-testid="label-sample-count"
            className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700"
          >
            {t('train.sampleCount', { count: sampleCount })}
          </span>
          <button
            type="button"
            data-testid="label-rename-btn"
            onClick={handleStartRename}
            className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
          >
            {t('train.renameLabelBtn')}
          </button>
          <button
            type="button"
            data-testid="label-delete-btn"
            onClick={() => onRequestDeleteLabel(label, sampleCount)}
            className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 transition hover:bg-red-100"
          >
            {t('common.delete')}
          </button>
        </div>
      </div>

      {isRenaming ? (
        <form onSubmit={handleRenameSubmit} className="mt-3 space-y-2" noValidate>
          <div className="flex items-center gap-2">
            <input
              type="text"
              data-testid="label-rename-input"
              value={renameValue}
              onChange={(e) => {
                setRenameValue(e.target.value);
                if (renameErrorKey) setRenameErrorKey(null);
              }}
              autoFocus
              className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-hidden"
            />
            <button
              type="submit"
              data-testid="label-rename-save-btn"
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
            >
              {t('train.renameSaveBtn')}
            </button>
            <button
              type="button"
              data-testid="label-rename-cancel-btn"
              onClick={handleCancelRename}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              {t('common.cancel')}
            </button>
          </div>
          {renameErrorKey ? (
            <p role="alert" className="text-xs font-medium text-red-600">
              {t(renameErrorKey)}
            </p>
          ) : null}
        </form>
      ) : null}

      {showLowSampleWarning ? (
        <div
          data-testid="low-sample-warning"
          className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800"
        >
          {t('train.lowSampleWarning', { count: sampleCount })}
        </div>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          data-testid="open-webcam-btn"
          onClick={() => onOpenWebcam(label)}
          className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
        >
          {t('train.webcamBtn')}
        </button>
        <button
          type="button"
          data-testid="open-drawing-pad-btn"
          onClick={() => onOpenDrawingPad(label)}
          className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
        >
          {t('train.drawingBtn')}
        </button>
      </div>

      <div className="mt-2">
        <FileDropzone onSelectFiles={(files) => onUploadFiles(label.id, files)} />
      </div>

      <div className="mt-4 flex-1">
        {samples.length === 0 ? (
          <div className="flex h-28 items-center justify-center rounded-xl border border-slate-100 bg-slate-50 text-xs text-slate-400">
            {t('train.noSamplesYet')}
          </div>
        ) : (
          <div className="grid max-h-56 grid-cols-4 gap-2 overflow-y-auto pr-1">
            {samples.map((sample) => (
              <div
                key={sample.id}
                className="relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
              >
                <img
                  data-testid="sample-thumbnail"
                  src={sample.dataUrl}
                  alt={label.name}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  data-testid="delete-sample-btn"
                  aria-label={t('train.deleteSampleAria')}
                  onClick={() => onDeleteSample(sample.id)}
                  className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900/80 text-[10px] font-bold text-white opacity-90 transition hover:bg-red-600 hover:opacity-100"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
