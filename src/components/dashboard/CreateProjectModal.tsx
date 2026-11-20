import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from '../../i18n/useTranslation';
import {
  MAX_PROJECT_NAME_LENGTH,
  sanitizeDisplayName,
} from '../../storage/projectRepository';
import type { TranslationKey } from '../../types/i18n';

export interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
}

export function CreateProjectModal({
  isOpen,
  onClose,
  onCreate,
}: CreateProjectModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClose = () => {
    setName('');
    setErrorKey(null);
    setIsSubmitting(false);
    onClose();
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setName('');
        setErrorKey(null);
        setIsSubmitting(false);
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = sanitizeDisplayName(name);
    if (!trimmed) {
      setErrorKey('validation.projectNameRequired');
      return;
    }
    if (trimmed.length > MAX_PROJECT_NAME_LENGTH) {
      setErrorKey('validation.projectNameTooLong');
      return;
    }

    setErrorKey(null);
    setIsSubmitting(true);
    try {
      await onCreate(trimmed);
      handleClose();
    } catch {
      setErrorKey('errors.storageUnavailable');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-project-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 id="create-project-modal-title" className="text-lg font-bold text-slate-900">
            {t('dashboard.modalTitle')}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label={t('common.close')}
            className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4" noValidate>
          <div>
            <label
              htmlFor="project-name-input"
              className="block text-sm font-medium text-slate-700"
            >
              {t('dashboard.projectNameLabel')}
            </label>
            <input
              id="project-name-input"
              type="text"
              data-testid="project-name-input"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errorKey) setErrorKey(null);
              }}
              placeholder={t('dashboard.projectNamePlaceholder')}
              autoFocus
              className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-hidden"
            />
            {errorKey ? (
              <p
                data-testid="project-name-error"
                role="alert"
                className="mt-1.5 text-xs font-medium text-red-600"
              >
                {t(errorKey)}
              </p>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              data-testid="project-create-submit"
              disabled={isSubmitting}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {t('dashboard.createSubmit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
