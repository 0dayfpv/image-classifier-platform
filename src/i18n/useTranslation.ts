import { createContext, useContext } from 'react';
import type { I18nContextValue } from '../types/i18n';

export const I18nContext = createContext<I18nContextValue | null>(null);

export function useTranslation(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useTranslation must be used within an I18nProvider');
  }
  return context;
}
