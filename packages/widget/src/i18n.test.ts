import { describe, expect, it } from 'vitest';
import { FEEDBACK_TYPES } from '@bugping/shared/constants';
import { MESSAGES, resolveLocale } from './i18n';

describe('resolveLocale', () => {
  it('returns the configured locale when not auto', () => {
    expect(resolveLocale('ru', ['en-US'])).toBe('ru');
  });

  it('matches the primary subtag of browser languages', () => {
    expect(resolveLocale('auto', ['uk-UA', 'en'])).toBe('uk');
    expect(resolveLocale('auto', ['ES'])).toBe('es');
  });

  it('skips unsupported languages', () => {
    expect(resolveLocale('auto', ['de-DE', 'ru-RU'])).toBe('ru');
  });

  it('falls back to en', () => {
    expect(resolveLocale('auto', ['de-DE'])).toBe('en');
    expect(resolveLocale('auto', [])).toBe('en');
  });
});

describe('MESSAGES', () => {
  const flatten = (m: object): Record<string, string> =>
    Object.fromEntries(
      Object.entries(m).flatMap(([k, v]) =>
        typeof v === 'string'
          ? [[k, v]]
          : Object.entries(v as Record<string, string>).map(([k2, v2]) => [`${k}.${k2}`, v2]),
      ),
    ) as Record<string, string>;

  it('has the same non-empty keys in every locale', () => {
    const reference = Object.keys(flatten(MESSAGES.en)).sort();
    for (const messages of Object.values(MESSAGES)) {
      const flat = flatten(messages);
      expect(Object.keys(flat).sort()).toEqual(reference);
      for (const value of Object.values(flat)) expect(value.trim()).not.toBe('');
    }
  });

  it('has a card, a hint and a placeholder for every feedback type', () => {
    for (const messages of Object.values(MESSAGES)) {
      for (const type of FEEDBACK_TYPES) {
        expect(messages.cards[type]).toBeTruthy();
        expect(messages.cardHints[type]).toBeTruthy();
        expect(messages.placeholders[type]).toBeTruthy();
      }
    }
  });
});
