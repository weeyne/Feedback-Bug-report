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

  it('gives English to browsers that list no Russian, e.g. Ukrainian or Belarusian only', () => {
    expect(pickLocale(undefined, 'uk-UA')).toBe('en');
    expect(pickLocale(undefined, 'be-BY,be;q=0.9')).toBe('en');
    expect(pickLocale(undefined, 'kk')).toBe('en');
    expect(pickLocale(undefined, 'uk-UA,ru;q=0.8')).toBe('ru');
  });

  it('orders Accept-Language entries by q, keeping the listed order for equal q', () => {
    expect(pickLocale(undefined, 'en;q=0.5,ru;q=0.9')).toBe('ru');
    expect(pickLocale(undefined, 'de,en;q=0.7,ru;q=0.8')).toBe('ru');
    expect(pickLocale(undefined, 'en-US,ru')).toBe('en');
    expect(pickLocale(undefined, 'ru;q=0.8,en;q=0.8')).toBe('ru');
    expect(pickLocale(undefined, 'EN;Q=0.4, RU-ru ; q=0.6')).toBe('ru');
  });

  it('skips entries with q=0 (not acceptable)', () => {
    expect(pickLocale(undefined, 'ru;q=0,en;q=0.1')).toBe('en');
    expect(pickLocale(undefined, 'ru;q=0.000')).toBe('en');
  });

  it('treats a malformed q as 1 (the entry keeps its listed position among q=1 entries)', () => {
    expect(pickLocale(undefined, 'en;q=0.9,ru;q=abc')).toBe('ru');
    expect(pickLocale(undefined, 'en;q=0.9,ru;q=')).toBe('ru');
    expect(pickLocale(undefined, 'en;q=0.9,ru;q=1.5')).toBe('ru');
    expect(pickLocale(undefined, 'ru;q=oops,en')).toBe('ru');
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
