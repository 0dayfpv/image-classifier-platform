import { useState } from 'react';
import { useTranslation } from '../../i18n/useTranslation';
import { generateInferenceSnippet } from '../../ml/snippetGenerator';
import type { LabelBucketRecord } from '../../types/domain';

export interface ModelExportPanelProps {
  labels: LabelBucketRecord[];
  onExportModel: () => Promise<void>;
}

async function copyTextWithFallback(text: string): Promise<boolean> {
  try {
    if (
      typeof navigator !== 'undefined' &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === 'function'
    ) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall back to execCommand below
  }

  try {
    if (typeof document === 'undefined') return false;
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    if (typeof document.execCommand === 'function') {
      document.execCommand('copy');
    }
    textarea.remove();
    return true;
  } catch {
    return false;
  }
}

export function ModelExportPanel({
  labels,
  onExportModel,
}: ModelExportPanelProps) {
  const { locale, t } = useTranslation();
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [copied, setCopied] = useState(false);

  const snippet = generateInferenceSnippet(
    labels.map((l) => l.name),
    locale
  );

  const handleExportClick = async () => {
    setIsExporting(true);
    setExportSuccess(false);
    try {
      await onExportModel();
      setExportSuccess(true);
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyClick = async () => {
    await copyTextWithFallback(snippet);
    setCopied(true);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-base font-bold text-slate-900">
            {t('make.exportHeading')}
          </h3>
          <p className="mt-1 text-xs text-slate-600">
            {t('make.exportDescription')}
          </p>
        </div>

        <button
          type="button"
          data-testid="export-model-btn"
          disabled={isExporting}
          onClick={handleExportClick}
          className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-700 disabled:opacity-50"
        >
          {isExporting ? t('make.downloadingModel') : t('make.downloadModelBtn')}
        </button>
      </div>

      {exportSuccess ? (
        <div
          data-testid="export-status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800"
        >
          {t('make.downloadSuccess')}
        </div>
      ) : null}

      <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4">
        <h4 className="text-xs font-bold tracking-wide text-indigo-900 uppercase">
          {t('make.exportGuideHeading')}
        </h4>
        <ol className="mt-2 space-y-1.5 text-xs leading-relaxed text-indigo-950/90">
          <li>{t('make.exportStep1')}</li>
          <li>{t('make.exportStep2')}</li>
          <li>{t('make.exportStep3')}</li>
        </ol>
      </div>

      <div className="space-y-2 border-t border-slate-100 pt-4">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-bold text-slate-900">
            {t('make.snippetHeading')}
          </h4>
          <div className="flex items-center gap-2">
            {copied ? (
              <span
                data-testid="copy-snippet-feedback"
                className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"
              >
                {t('make.copiedFeedback')}
              </span>
            ) : null}
            <button
              type="button"
              data-testid="copy-snippet-btn"
              onClick={handleCopyClick}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              {t('make.copySnippetBtn')}
            </button>
          </div>
        </div>

        <pre
          data-testid="export-snippet-code"
          className="max-h-72 overflow-auto rounded-xl border border-slate-800 bg-slate-900 p-4 text-xs leading-relaxed text-slate-100"
        >
          <code>{snippet}</code>
        </pre>
      </div>
    </div>
  );
}
