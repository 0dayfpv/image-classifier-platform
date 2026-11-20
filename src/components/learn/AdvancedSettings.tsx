import { useState } from 'react';
import type {
  HyperparameterDraft,
  HyperparameterValidation,
} from '../../hooks/uiHelpers';
import { useTranslation } from '../../i18n/useTranslation';

export interface AdvancedSettingsProps {
  draft: HyperparameterDraft;
  validation: HyperparameterValidation;
  disabled?: boolean;
  onChangeDraft: (next: HyperparameterDraft) => void;
  onResetDefaults: () => void;
}

export function AdvancedSettings({
  draft,
  validation,
  disabled = false,
  onChangeDraft,
  onResetDefaults,
}: AdvancedSettingsProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="flex items-center justify-between">
        <button
          type="button"
          data-testid="advanced-settings-toggle"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((prev) => !prev)}
          className="flex items-center gap-2 text-sm font-bold text-slate-800 transition hover:text-indigo-600"
        >
          <span>{isOpen ? '▾' : '▸'}</span>
          <span>{t('learn.advancedSettingsToggle')}</span>
        </button>

        {isOpen ? (
          <button
            type="button"
            data-testid="reset-defaults-btn"
            disabled={disabled}
            onClick={onResetDefaults}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {t('learn.resetDefaultsBtn')}
          </button>
        ) : null}
      </div>

      {isOpen ? (
        <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label
                htmlFor="input-epochs"
                className="block text-xs font-semibold text-slate-700"
              >
                {t('learn.epochsLabel')}
              </label>
              <input
                id="input-epochs"
                type="text"
                inputMode="numeric"
                data-testid="input-epochs"
                disabled={disabled}
                value={draft.epochs}
                onChange={(e) =>
                  onChangeDraft({ ...draft, epochs: e.target.value })
                }
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-hidden"
              />
              <p className="mt-1 text-[11px] text-slate-500">{t('learn.epochsHelp')}</p>
            </div>

            <div>
              <label
                htmlFor="input-batch-size"
                className="block text-xs font-semibold text-slate-700"
              >
                {t('learn.batchSizeLabel')}
              </label>
              <input
                id="input-batch-size"
                type="text"
                inputMode="numeric"
                data-testid="input-batch-size"
                disabled={disabled}
                value={draft.batchSize}
                onChange={(e) =>
                  onChangeDraft({ ...draft, batchSize: e.target.value })
                }
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-hidden"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                {t('learn.batchSizeHelp')}
              </p>
            </div>

            <div>
              <label
                htmlFor="input-learning-rate"
                className="block text-xs font-semibold text-slate-700"
              >
                {t('learn.learningRateLabel')}
              </label>
              <input
                id="input-learning-rate"
                type="text"
                inputMode="decimal"
                data-testid="input-learning-rate"
                disabled={disabled}
                value={draft.learningRate}
                onChange={(e) =>
                  onChangeDraft({ ...draft, learningRate: e.target.value })
                }
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-hidden"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                {t('learn.learningRateHelp')}
              </p>
            </div>
          </div>

          {validation.errorKey ? (
            <div
              data-testid="advanced-settings-error"
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700"
            >
              {t(validation.errorKey)}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
