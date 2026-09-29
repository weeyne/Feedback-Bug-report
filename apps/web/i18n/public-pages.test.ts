import { describe, expect, it } from 'vitest';
import { localizedPath, publicAlternates } from './public-pages';

describe('localizedPath', () => {
  it('keeps English unprefixed and puts Russian under /ru', () => {
    expect(localizedPath('/', 'en')).toBe('/');
    expect(localizedPath('/', 'ru')).toBe('/ru');
    expect(localizedPath('/install', 'en')).toBe('/install');
    expect(localizedPath('/install', 'ru')).toBe('/ru/install');
  });
});

describe('publicAlternates', () => {
  it('points the canonical at the page locale and lists every version with x-default = English', () => {
    expect(publicAlternates('/terms', 'ru')).toEqual({
      canonical: '/ru/terms',
      languages: { en: '/terms', ru: '/ru/terms', 'x-default': '/terms' },
    });
    expect(publicAlternates('/', 'en')).toEqual({
      canonical: '/',
      languages: { en: '/', ru: '/ru', 'x-default': '/' },
    });
  });
});
