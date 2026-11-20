import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type {
  I18nContextValue,
  Locale,
  TranslationDictionary,
  TranslationKey,
  TranslationParams,
} from '../types/i18n';
import { tr } from './locales/tr';
import { en } from './locales/en';
import { I18nContext } from './useTranslation';

const LANGUAGE_STORAGE_KEY = 'app_language';
const DEFAULT_LOCALE: Locale = 'tr';

const DICTIONARIES: Record<Locale, TranslationDictionary> = { tr, en };

function isLocale(value: unknown): value is Locale {
  return value === 'tr' || value === 'en';
}

function readStoredLocale(): Locale {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return DEFAULT_LOCALE;
    }
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isLocale(stored) ? stored : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

function writeStoredLocale(locale: Locale): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, locale);
    }
  } catch {
    // Ignore storage quota or security errors silently
  }
}

function resolveNestedKey(dict: TranslationDictionary, key: string): string | undefined {
  const parts = key.split('.');
  let current: unknown = dict;
  for (const part of parts) {
    if (current !== null && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof current === 'string' ? current : undefined;
}

function interpolateTemplate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_match, paramName: string) => {
    const value = params[paramName];
    return value !== undefined ? String(value) : `{{${paramName}}}`;
  });
}

function translateKey(
  locale: Locale,
  key: TranslationKey,
  params?: TranslationParams,
): string {
  const template =
    resolveNestedKey(DICTIONARIES[locale], key) ??
    resolveNestedKey(DICTIONARIES.en, key) ??
    key;
  return interpolateTemplate(template, params);
}

export interface I18nProviderProps {
  children: ReactNode;
  initialLocale?: Locale;
}

export function I18nProvider({ children, initialLocale }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(() => initialLocale ?? readStoredLocale());

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale);
    writeStoredLocale(nextLocale);
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const t = useCallback(
    (key: TranslationKey, params?: TranslationParams) => translateKey(locale, key, params),
    [locale],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
