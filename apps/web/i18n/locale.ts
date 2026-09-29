export const LOCALES = ['en', 'ru'] as const;
export type AppLocale = (typeof LOCALES)[number];
export const LOCALE_COOKIE = 'locale';

const isLocale = (value: string | undefined): value is AppLocale =>
  LOCALES.includes(value as AppLocale);

/** An RFC 9110 qvalue: `0`…`1` with up to three decimals. */
const QVALUE = /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/;

/**
 * The primary language subtags of an Accept-Language header, most preferred first: sorted by `q`
 * (default 1; a malformed `q` also counts as 1), listed order kept for equal `q`, `q=0` dropped.
 */
function acceptedLanguages(acceptLanguage: string | null): string[] {
  return (acceptLanguage?.split(',') ?? [])
    .map((part, index) => {
      const [tag = '', ...params] = part.split(';');
      const raw = params
        .map((param) => param.trim())
        .find((param) => /^q=/i.test(param))
        ?.slice(2);
      const q = raw !== undefined && QVALUE.test(raw) ? Number(raw) : 1;
      return { primary: tag.trim().split('-')[0]!.toLowerCase(), q, index };
    })
    .filter((entry) => entry.primary && entry.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index)
    .map((entry) => entry.primary);
}

/**
 * Cookie wins; otherwise the most preferred Accept-Language entry we support; otherwise English.
 * Russian only when the browser lists `ru`/`ru-*`: other languages (Ukrainian, Kazakh, …) get
 * English. The proxy feeds this result to next-intl's detection so the public pages agree.
 */
export function pickLocale(cookie: string | undefined, acceptLanguage: string | null): AppLocale {
  if (isLocale(cookie)) return cookie;
  return acceptedLanguages(acceptLanguage).find(isLocale) ?? 'en';
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
