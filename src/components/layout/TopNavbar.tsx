import { useTranslation } from '../../i18n/useTranslation';
import type { ProjectRecord, StageId } from '../../types/domain';
import { StageStepper } from './StageStepper';

export interface TopNavbarProps {
  activeProject: ProjectRecord | null;
  activeStage: StageId;
  onSelectStage: (stage: StageId) => void;
  onNavigateHome: () => void;
}

export function TopNavbar({
  activeProject,
  activeStage,
  onSelectStage,
  onNavigateHome,
}: TopNavbarProps) {
  const { locale, setLocale, t } = useTranslation();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xs">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            data-testid="nav-home"
            onClick={onNavigateHome}
            className="group flex items-center gap-2.5 rounded-xl px-2 py-1 text-left transition hover:bg-slate-100"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-sm font-bold text-white shadow-xs">
              ML
            </span>
            <div>
              <div className="text-sm font-bold text-slate-900 group-hover:text-indigo-600">
                {t('nav.brandTitle')}
              </div>
              <div className="text-xs text-slate-500">
                {activeProject ? t('nav.backToDashboard') : t('nav.brandSubtitle')}
              </div>
            </div>
          </button>

          {activeProject ? (
            <div className="flex items-center gap-2">
              <span className="text-slate-300">/</span>
              <span
                data-testid="nav-project-title"
                className="max-w-xs truncate rounded-lg bg-indigo-50 px-2.5 py-1 text-sm font-semibold text-indigo-800"
              >
                {activeProject.name}
              </span>
            </div>
          ) : null}
        </div>

        {activeProject ? (
          <StageStepper activeStage={activeStage} onSelectStage={onSelectStage} />
        ) : null}

        <div className="flex items-center gap-3">
          <span className="hidden rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 sm:inline-flex">
            {t('nav.localStorageBadge')}
          </span>

          <div
            role="group"
            aria-label={t('nav.languageLabel')}
            className="flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5"
          >
            <button
              type="button"
              data-testid="lang-toggle-tr"
              aria-label={t('nav.switchToTr')}
              aria-pressed={locale === 'tr'}
              onClick={() => setLocale('tr')}
              className={`rounded-md px-2.5 py-1 text-xs font-bold transition ${
                locale === 'tr'
                  ? 'bg-white text-indigo-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('nav.langTr')}
            </button>
            <button
              type="button"
              data-testid="lang-toggle-en"
              aria-label={t('nav.switchToEn')}
              aria-pressed={locale === 'en'}
              onClick={() => setLocale('en')}
              className={`rounded-md px-2.5 py-1 text-xs font-bold transition ${
                locale === 'en'
                  ? 'bg-white text-indigo-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('nav.langEn')}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
