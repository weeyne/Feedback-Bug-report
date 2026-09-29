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

/**
 * The public pages' `[locale]` segment wins when it names a supported locale; every other route
 * (dashboard, login, demo, 404) keeps the cookie / Accept-Language rule.
 */
export function resolveLocale({
  requested,
  cookie,
  acceptLanguage,
}: {
  requested: string | undefined;
  cookie: string | undefined;
  acceptLanguage: string | null;
}): AppLocale {
  return isLocale(requested) ? requested : pickLocale(cookie, acceptLanguage);
}
