export const LOCALES = ['en', 'ru'] as const;
export type AppLocale = (typeof LOCALES)[number];
export const LOCALE_COOKIE = 'locale';

const isLocale = (value: string | undefined): value is AppLocale =>
  LOCALES.includes(value as AppLocale);

/** Cookie wins; otherwise the first Accept-Language entry we support; otherwise English. */
export function pickLocale(cookie: string | undefined, acceptLanguage: string | null): AppLocale {
  if (isLocale(cookie)) return cookie;
  for (const part of acceptLanguage?.split(',') ?? []) {
    const primary = part.trim().split(/[-;]/)[0]?.toLowerCase();
    if (isLocale(primary)) return primary;
  }
  return 'en';
}
