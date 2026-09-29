import type { AppLocale } from './locale';
import { routing } from './routing';

/** The pages with localized URLs: English unprefixed, every other locale under `/<locale>`. */
export const PUBLIC_PATHS = ['/', '/install', '/privacy', '/terms', '/refund'] as const;
export type PublicPath = (typeof PUBLIC_PATHS)[number];

/** `/install` → `/install` (en) or `/ru/install`; `/` → `/` or `/ru`. Same URLs as `Link`. */
export function localizedPath(path: PublicPath, locale: AppLocale): string {
  if (locale === routing.defaultLocale) return path;
  return path === '/' ? `/${locale}` : `/${locale}${path}`;
}

/**
 * A public page's `alternates` metadata: its own URL as the canonical, every locale's URL as an
 * hreflang alternate, and the English URL as `x-default`. Paths are resolved against
 * `metadataBase` by Next.
 */
export function publicAlternates(path: PublicPath, locale: AppLocale) {
  return {
    canonical: localizedPath(path, locale),
    languages: {
      en: localizedPath(path, 'en'),
      ru: localizedPath(path, 'ru'),
      'x-default': localizedPath(path, routing.defaultLocale),
    },
  };
}

/** OpenGraph locales (`language_TERRITORY`). */
export const OG_LOCALE: Record<AppLocale, string> = { en: 'en_US', ru: 'ru_RU' };
