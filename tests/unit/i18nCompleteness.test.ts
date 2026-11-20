import { createElement } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { tr } from '../../src/i18n/locales/tr';
import { en } from '../../src/i18n/locales/en';
import { I18nProvider } from '../../src/i18n/I18nContext';
import { useTranslation } from '../../src/i18n/useTranslation';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function flattenDictionary(
  obj: Record<string, unknown>,
  prefix = '',
): Array<{ key: string; value: unknown }> {
  const entries: Array<{ key: string; value: unknown }> = [];
  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const val = obj[key];
    if (isPlainObject(val)) {
      entries.push(...flattenDictionary(val, fullKey));
    } else {
      entries.push({ key: fullKey, value: val });
    }
  }
  return entries;
}

function assertDeepKeyParity(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
  path = 'root',
): void {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  expect(leftKeys, `Key mismatch at ${path}`).toEqual(rightKeys);

  for (const key of leftKeys) {
    const leftVal = left[key];
    const rightVal = right[key];
    const childPath = `${path}.${key}`;
    if (isPlainObject(leftVal) || isPlainObject(rightVal)) {
      expect(isPlainObject(leftVal), `${childPath} should be object in tr`).toBe(true);
      expect(isPlainObject(rightVal), `${childPath} should be object in en`).toBe(true);
      assertDeepKeyParity(
        leftVal as Record<string, unknown>,
        rightVal as Record<string, unknown>,
        childPath,
      );
    }
  }
}

function extractPlaceholders(text: string): string[] {
  const matches = [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
  return Array.from(new Set(matches)).sort();
}

describe('i18n completeness & parity (tr <-> en)', () => {
  it('has identical nested structure and keys in tr and en', () => {
    assertDeepKeyParity(
      tr as unknown as Record<string, unknown>,
      en as unknown as Record<string, unknown>,
    );
  });

  it('contains only non-empty string leaves in both tr and en', () => {
    const trLeaves = flattenDictionary(tr as unknown as Record<string, unknown>);
    const enLeaves = flattenDictionary(en as unknown as Record<string, unknown>);

    expect(trLeaves.length).toBeGreaterThan(0);
    expect(trLeaves.length).toBe(enLeaves.length);

    for (const { key, value } of trLeaves) {
      expect(typeof value, `tr.${key} must be a string`).toBe('string');
      expect((value as string).trim().length, `tr.${key} must not be empty`).toBeGreaterThan(0);
    }

    for (const { key, value } of enLeaves) {
      expect(typeof value, `en.${key} must be a string`).toBe('string');
      expect((value as string).trim().length, `en.${key} must not be empty`).toBeGreaterThan(0);
    }
  });

  it('preserves identical {{placeholder}} parameters across tr and en', () => {
    const trMap = new Map(
      flattenDictionary(tr as unknown as Record<string, unknown>).map((e) => [
        e.key,
        e.value as string,
      ]),
    );
    const enMap = new Map(
      flattenDictionary(en as unknown as Record<string, unknown>).map((e) => [
        e.key,
        e.value as string,
      ]),
    );

    for (const [key, trText] of trMap.entries()) {
      const enText = enMap.get(key);
      expect(enText, `Missing en key for ${key}`).toBeDefined();
      expect(extractPlaceholders(trText), `Placeholder mismatch at ${key}`).toEqual(
        extractPlaceholders(enText!),
      );
      const strippedTr = trText.replace(/\{\{\w+\}\}/g, '');
      const strippedEn = enText!.replace(/\{\{\w+\}\}/g, '');
      expect(strippedTr, `Malformed brace in tr.${key}`).not.toMatch(/[{}]/);
      expect(strippedEn, `Malformed brace in en.${key}`).not.toMatch(/[{}]/);
    }
  });

  it('includes required Turkish-first and English terminology', () => {
    expect(tr.train.addLabelBtn).toBe('+ Yeni Etiket Ekle');
    expect(en.train.addLabelBtn).toBe('+ Add New Label');
    expect(tr.learn.trainModelBtn).toBe('Modeli Eğit');
    expect(en.learn.trainModelBtn).toBe('Train Model');
    expect(tr.learn.advancedSettingsToggle).toBe('Gelişmiş Ayarlar');
    expect(en.learn.advancedSettingsToggle).toBe('Advanced Settings');
  });
});

function TestConsumer() {
  const { locale, setLocale, t } = useTranslation();
  return createElement(
    'div',
    null,
    createElement('span', { 'data-testid': 'locale' }, locale),
    createElement('span', { 'data-testid': 'cta' }, t('train.addLabelBtn')),
    createElement('span', { 'data-testid': 'warning' }, t('train.lowSampleWarning', { count: 3 })),
    createElement('button', { type: 'button', onClick: () => setLocale('en') }, 'to-en'),
    createElement('button', { type: 'button', onClick: () => setLocale('tr') }, 'to-tr'),
  );
}

describe('I18nProvider & useTranslation', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.lang = '';
  });

  afterEach(() => {
    cleanup();
  });

  it('defaults to Turkish ("tr"), updates documentElement.lang, and switches cleanly to English', () => {
    render(createElement(I18nProvider, null, createElement(TestConsumer)));

    expect(screen.getByTestId('locale').textContent).toBe('tr');
    expect(screen.getByTestId('cta').textContent).toBe('+ Yeni Etiket Ekle');
    expect(screen.getByTestId('warning').textContent).toBe('En az 5 görsel önerilir (şu an: 3)');
    expect(document.documentElement.lang).toBe('tr');

    fireEvent.click(screen.getByText('to-en'));

    expect(screen.getByTestId('locale').textContent).toBe('en');
    expect(screen.getByTestId('cta').textContent).toBe('+ Add New Label');
    expect(screen.getByTestId('warning').textContent).toBe(
      'At least 5 images recommended (currently: 3)',
    );
    expect(document.documentElement.lang).toBe('en');
    expect(window.localStorage.getItem('app_language')).toBe('en');
  });

  it('handles localStorage access errors safely without throwing', () => {
    const getSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });

    try {
      render(createElement(I18nProvider, null, createElement(TestConsumer)));

      expect(screen.getByTestId('locale').textContent).toBe('tr');
      fireEvent.click(screen.getByText('to-en'));
      expect(screen.getByTestId('locale').textContent).toBe('en');
    } finally {
      getSpy.mockRestore();
      setSpy.mockRestore();
    }
  });
});
