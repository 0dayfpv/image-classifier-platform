import { useTranslation } from '../../i18n/useTranslation';
import type { StageId } from '../../types/domain';

export interface StageStepperProps {
  activeStage: StageId;
  onSelectStage: (stage: StageId) => void;
}

export function StageStepper({ activeStage, onSelectStage }: StageStepperProps) {
  const { t } = useTranslation();

  const stages: Array<{ id: StageId; label: string; testId: string }> = [
    { id: 'train', label: t('stages.trainShort'), testId: 'stage-tab-train' },
    { id: 'learn', label: t('stages.learnShort'), testId: 'stage-tab-learn' },
    { id: 'make', label: t('stages.makeShort'), testId: 'stage-tab-make' },
  ];

  return (
    <nav
      aria-label={t('nav.stageStepperLabel')}
      className="flex flex-wrap items-center gap-1.5 rounded-xl bg-slate-100 p-1"
    >
      {stages.map((stage) => {
        const isActive = activeStage === stage.id;
        return (
          <button
            key={stage.id}
            type="button"
            data-testid={stage.testId}
            aria-current={isActive ? 'step' : undefined}
            onClick={() => onSelectStage(stage.id)}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${
              isActive
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-700 hover:bg-white hover:text-indigo-600'
            }`}
          >
            {stage.label}
          </button>
        );
      })}
    </nav>
  );
}
