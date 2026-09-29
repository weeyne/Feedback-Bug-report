import { describe, expect, it } from 'vitest';
import { pickLocale, resolveLocale } from './locale';

describe('pickLocale', () => {
  it('prefers a valid cookie', () => {
    expect(pickLocale('ru', 'en-US')).toBe('ru');
    expect(pickLocale('de', 'ru-RU,ru;q=0.9')).toBe('ru');
  });

  it('falls back to Accept-Language, then English', () => {
    expect(pickLocale(undefined, 'ru-RU,en;q=0.8')).toBe('ru');
    expect(pickLocale(undefined, 'uk-UA')).toBe('en');
    expect(pickLocale(undefined, null)).toBe('en');
  });
});

describe('resolveLocale', () => {
  it('uses the [locale] segment when it is a supported locale', () => {
    expect(resolveLocale({ requested: 'ru', cookie: 'en', acceptLanguage: 'en-US' })).toBe('ru');
    expect(resolveLocale({ requested: 'en', cookie: 'ru', acceptLanguage: 'ru-RU' })).toBe('en');
  });

  it('falls back to the cookie rule outside the segment or for an unknown segment value', () => {
    expect(resolveLocale({ requested: undefined, cookie: 'ru', acceptLanguage: 'en-US' })).toBe(
      'ru',
    );
    expect(
      resolveLocale({ requested: 'favicon.png', cookie: undefined, acceptLanguage: 'ru' }),
    ).toBe('ru');
    expect(resolveLocale({ requested: 'de', cookie: undefined, acceptLanguage: null })).toBe('en');
  });
});
