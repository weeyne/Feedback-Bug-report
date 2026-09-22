import { describe, expect, it } from 'vitest';
import { pickLocale } from './locale';

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
