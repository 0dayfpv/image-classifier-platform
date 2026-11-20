import { useTranslation } from '../../i18n/useTranslation';
import type { EpochTelemetry } from '../../types/ml';

export interface TrainingMetricsChartProps {
  telemetry: EpochTelemetry[];
}

interface SvgSeriesProps {
  testId: string;
  title: string;
  latestTestId: string;
  latestText: string;
  emptyPrompt: string;
  points: Array<{ epoch: number; value: number }>;
  strokeColor: string;
  fillColor: string;
  minY?: number;
  maxY?: number;
}

function SvgMetricCard({
  testId,
  title,
  latestTestId,
  latestText,
  emptyPrompt,
  points,
  strokeColor,
  fillColor,
  minY,
  maxY,
}: SvgSeriesProps) {
  const width = 360;
  const height = 160;
  const padX = 28;
  const padY = 20;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;

  const values = points.map((p) => p.value);
  const rawMin = minY !== undefined ? minY : Math.min(0, ...values);
  const rawMax =
    maxY !== undefined ? maxY : Math.max(0.1, ...values, rawMin + 0.1);
  const spanY = Math.max(1e-6, rawMax - rawMin);

  const coords = points.map((pt, idx) => {
    const xRatio = points.length <= 1 ? 0.5 : idx / (points.length - 1);
    const yRatio = Math.max(0, Math.min(1, (pt.value - rawMin) / spanY));
    return {
      epoch: pt.epoch,
      value: pt.value,
      x: padX + xRatio * plotW,
      y: padY + plotH - yRatio * plotH,
    };
  });

  const pathD =
    coords.length === 0
      ? ''
      : coords.length === 1
        ? `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)} L ${(coords[0].x + 1).toFixed(1)} ${coords[0].y.toFixed(1)}`
        : coords
            .map(
              (c, idx) =>
                `${idx === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`
            )
            .join(' ');

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-bold text-slate-900">{title}</h4>
        {points.length > 0 ? (
          <span
            data-testid={latestTestId}
            className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 shadow-2xs"
          >
            {latestText}
          </span>
        ) : null}
      </div>

      <div data-testid={testId} className="mt-3">
        {points.length === 0 ? (
          <div className="flex h-36 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white px-4 text-center text-xs text-slate-400">
            {emptyPrompt}
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-40 w-full rounded-lg border border-slate-200 bg-white"
            role="img"
            aria-label={title}
          >
            <line
              x1={padX}
              y1={padY + plotH}
              x2={padX + plotW}
              y2={padY + plotH}
              stroke="#e2e8f0"
              strokeWidth="1"
            />
            <line
              x1={padX}
              y1={padY}
              x2={padX}
              y2={padY + plotH}
              stroke="#e2e8f0"
              strokeWidth="1"
            />
            <path
              d={pathD}
              fill="none"
              stroke={strokeColor}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {coords.map((c) => (
              <circle
                key={c.epoch}
                cx={c.x}
                cy={c.y}
                r="4"
                fill={fillColor}
                stroke="#ffffff"
                strokeWidth="1.5"
              />
            ))}
          </svg>
        )}
      </div>
    </div>
  );
}

export function TrainingMetricsChart({ telemetry }: TrainingMetricsChartProps) {
  const { t } = useTranslation();
  const latest = telemetry[telemetry.length - 1];

  const lossPoints = telemetry.map((item) => ({
    epoch: item.epoch,
    value: item.loss,
  }));
  const accuracyPoints = telemetry.map((item) => ({
    epoch: item.epoch,
    value: item.accuracy * 100,
  }));

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="text-xs text-slate-500">
          {t('learn.chartInterpretationTip')}
        </span>
      </div>

      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <SvgMetricCard
          testId="loss-chart"
          title={t('learn.lossChartTitle')}
          latestTestId="latest-loss"
          latestText={
            latest
              ? t('learn.latestLoss', { value: latest.loss.toFixed(4) })
              : ''
          }
          emptyPrompt={t('learn.chartEmptyPrompt')}
          points={lossPoints}
          strokeColor="#dc2626"
          fillColor="#dc2626"
          minY={0}
        />

        <SvgMetricCard
          testId="accuracy-chart"
          title={t('learn.accuracyChartTitle')}
          latestTestId="latest-accuracy"
          latestText={
            latest
              ? t('learn.latestAccuracy', {
                  value: (latest.accuracy * 100).toFixed(1),
                })
              : ''
          }
          emptyPrompt={t('learn.chartEmptyPrompt')}
          points={accuracyPoints}
          strokeColor="#16a34a"
          fillColor="#16a34a"
          minY={0}
          maxY={100}
        />
      </div>
    </div>
  );
}
