import type { ReactNode } from 'react';
import { useTranslation } from '../../i18n/useTranslation';

export type AlertVariant = 'info' | 'success' | 'warning' | 'error';

export interface AlertBannerProps {
  variant?: AlertVariant;
  title?: string;
  children: ReactNode;
  testId?: string;
  onDismiss?: () => void;
  className?: string;
}

const VARIANT_STYLES: Record<AlertVariant, string> = {
  info: 'border-blue-200 bg-blue-50 text-blue-900',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  warning: 'border-amber-300 bg-amber-50 text-amber-900',
  error: 'border-red-200 bg-red-50 text-red-900',
};

export function AlertBanner({
  variant = 'info',
  title,
  children,
  testId,
  onDismiss,
  className = '',
}: AlertBannerProps) {
  const { t } = useTranslation();

  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      data-testid={testId}
      className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${VARIANT_STYLES[variant]} ${className}`.trim()}
    >
      <div className="flex-1">
        {title ? <div className="font-semibold">{title}</div> : null}
        <div className={title ? 'mt-0.5' : ''}>{children}</div>
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t('common.dismiss')}
          className="rounded-md px-2 py-0.5 text-xs font-medium opacity-75 transition hover:opacity-100"
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}
