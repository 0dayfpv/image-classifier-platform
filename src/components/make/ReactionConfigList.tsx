import { buildDefaultReaction } from '../../hooks/uiHelpers';
import { useTranslation } from '../../i18n/useTranslation';
import { playSound } from '../../media/soundSynth';
import type {
  LabelBucketRecord,
  ReactionConfig,
  SynthSoundId,
} from '../../types/domain';

export interface ReactionConfigListProps {
  labels: LabelBucketRecord[];
  reactions: Record<string, ReactionConfig>;
  onUpdateReaction: (labelId: string, next: ReactionConfig) => void;
}

export function ReactionConfigList({
  labels,
  reactions,
  onUpdateReaction,
}: ReactionConfigListProps) {
  const { t } = useTranslation();

  const soundOptions: Array<{ value: SynthSoundId; label: string }> = [
    { value: 'none', label: t('make.soundNone') },
    { value: 'chime', label: t('make.soundChime') },
    { value: 'beep', label: t('make.soundBeep') },
    { value: 'success', label: t('make.soundSuccess') },
    { value: 'alert', label: t('make.soundAlert') },
    { value: 'pop', label: t('make.soundPop') },
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
      <h3 className="text-base font-bold text-slate-900">
        {t('make.reactionConfigHeading')}
      </h3>

      <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {labels.map((label) => {
          const reaction = reactions[label.id] ?? buildDefaultReaction(label);
          const colorValue = /^#[0-9a-f]{6}$/i.test(reaction.backgroundColor)
            ? reaction.backgroundColor.toLowerCase()
            : '#2563eb';

          return (
            <div
              key={label.id}
              data-testid="reaction-config-card"
              className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4"
            >
              <div className="flex items-center gap-2 border-b border-slate-200 pb-2.5">
                <span
                  style={{ backgroundColor: colorValue }}
                  className="h-3.5 w-3.5 rounded-full"
                />
                <h4 className="font-bold text-slate-900">{label.name}</h4>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  {t('make.customMessageLabel')}
                </label>
                <input
                  type="text"
                  data-testid="reaction-message-input"
                  value={reaction.message}
                  placeholder={t('make.customMessagePlaceholder', {
                    label: label.name,
                  })}
                  onChange={(e) =>
                    onUpdateReaction(label.id, {
                      ...reaction,
                      message: e.target.value,
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <label className="text-xs font-semibold text-slate-700">
                  {t('make.backgroundColorLabel')}
                </label>
                <input
                  type="color"
                  data-testid="reaction-color-input"
                  value={colorValue}
                  onChange={(e) => {
                    const nextColor = e.target.value.toLowerCase();
                    onUpdateReaction(label.id, {
                      ...reaction,
                      backgroundColor: nextColor,
                      accentColor: nextColor,
                    });
                  }}
                  className="h-8 w-14 cursor-pointer rounded-md border border-slate-300 bg-white p-0.5"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  {t('make.soundEffectLabel')}
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <select
                    data-testid="reaction-sound-select"
                    value={reaction.sound}
                    onChange={(e) =>
                      onUpdateReaction(label.id, {
                        ...reaction,
                        sound: e.target.value as SynthSoundId,
                      })
                    }
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-hidden"
                  >
                    {soundOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => playSound(reaction.sound)}
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    {t('make.testSoundBtn')}
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2 pt-1 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  data-testid="reaction-counter-toggle"
                  checked={reaction.enableCounter}
                  onChange={(e) =>
                    onUpdateReaction(label.id, {
                      ...reaction,
                      enableCounter: e.target.checked,
                    })
                  }
                  className="rounded-sm border-slate-300 text-indigo-600"
                />
                {t('make.enableCounterLabel')}
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}
