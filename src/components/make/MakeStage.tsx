import { useTranslation } from '../../i18n/useTranslation';
import type { LabelBucketRecord, ReactionConfig } from '../../types/domain';
import type { ClassPrediction, ImageInputSource } from '../../types/ml';
import { AlertBanner } from '../common/AlertBanner';
import { ModelExportPanel } from './ModelExportPanel';
import { PlaygroundStage } from './PlaygroundStage';
import { ReactionConfigList } from './ReactionConfigList';

export interface MakeStageProps {
  isTrained: boolean;
  trainedLabels: LabelBucketRecord[];
  reactions: Record<string, ReactionConfig>;
  onUpdateReaction: (labelId: string, next: ReactionConfig) => void;
  onPredict: (input: ImageInputSource) => Promise<ClassPrediction[]>;
  onExportModel: () => Promise<void>;
}

export function MakeStage({
  isTrained,
  trainedLabels,
  reactions,
  onUpdateReaction,
  onPredict,
  onExportModel,
}: MakeStageProps) {
  const { t } = useTranslation();

  return (
    <section className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <h2 className="text-xl font-bold text-slate-900">{t('make.heading')}</h2>
        <p className="mt-1 text-sm text-slate-600">{t('stages.makeSubtitle')}</p>
      </div>

      {!isTrained ? (
        <AlertBanner variant="warning" testId="make-untrained-guard">
          {t('make.untrainedGuard')}
        </AlertBanner>
      ) : (
        <>
          <ReactionConfigList
            labels={trainedLabels}
            reactions={reactions}
            onUpdateReaction={onUpdateReaction}
          />

          <PlaygroundStage
            labels={trainedLabels}
            reactions={reactions}
            onPredict={onPredict}
          />

          <ModelExportPanel
            labels={trainedLabels}
            onExportModel={onExportModel}
          />
        </>
      )}
    </section>
  );
}
