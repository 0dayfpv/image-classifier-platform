import { useTranslation } from '../../i18n/useTranslation';
import type { LabelBucketRecord } from '../../types/domain';
import type { ClassPrediction } from '../../types/ml';

export interface ConfidenceBarsProps {
  predictions: ClassPrediction[];
  labels: LabelBucketRecord[];
}

export function ConfidenceBars({ predictions, labels }: ConfidenceBarsProps) {
  const { t } = useTranslation();

  if (predictions.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-400">
        {t('learn.noPredictionYet')}
      </div>
    );
  }

  const labelById = new Map(labels.map((l) => [l.id, l]));
  const topPrediction = predictions[0];
  const topLabelName =
    labelById.get(topPrediction.labelId)?.name ?? topPrediction.labelName;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3.5">
        <div className="text-xs font-medium text-indigo-700">
          {t('learn.predictedClassLabel')}
        </div>
        <div
          data-testid="predicted-class"
          className="mt-0.5 text-lg font-bold text-indigo-950"
        >
          {topLabelName}
        </div>
      </div>

      <div data-testid="confidence-bars" className="space-y-3">
        <h4 className="text-xs font-bold tracking-wide text-slate-600 uppercase">
          {t('learn.confidenceHeader')}
        </h4>

        {predictions.map((pred) => {
          const currentLabel = labelById.get(pred.labelId);
          const displayName = currentLabel?.name ?? pred.labelName;
          const barColor = currentLabel?.color ?? '#4f46e5';
          const clampedPct = Math.max(0, Math.min(100, pred.percentage));

          return (
            <div
              key={pred.labelId}
              data-testid="confidence-bar"
              className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs"
            >
              <div className="flex items-center justify-between text-sm font-semibold text-slate-800">
                <span>{displayName}</span>
                <span>
                  {t('learn.confidencePercent', {
                    value: clampedPct.toFixed(1),
                  })}
                </span>
              </div>
              <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  style={{
                    width: `${clampedPct.toFixed(1)}%`,
                    backgroundColor: barColor,
                  }}
                  className="h-full rounded-full transition-all duration-150"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
