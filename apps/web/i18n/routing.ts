import { defineRouting } from 'next-intl/routing';
import { LOCALE_COOKIE, LOCALES } from './locale';

/**
 * Localized URLs for the public pages only: English keeps its URLs, Russian lives under `/ru`.
 * The locale cookie is the one the rest of the app already reads (`setLocale`, `pickLocale`).
 */
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: 'en',
  localePrefix: 'as-needed',
  localeCookie: {
    name: LOCALE_COOKIE,
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
    sameSite: 'lax',
  },
  localeDetection: true,
  // The pages' metadata (`publicAlternates`) is the single source of hreflang links.
  alternateLinks: false,
});
