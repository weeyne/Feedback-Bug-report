import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { alt as ogAlt, contentType as ogType, size as ogSize } from '@/app/opengraph-image';
import type { AppLocale } from './locale';
import { OG_LOCALE, publicAlternates, type PublicPath } from './public-pages';
import { routing } from './routing';

/** The `[locale]` param of a public page; an invalid one (the layout 404s it) reads as English. */
export async function pageLocale(params: Promise<{ locale: string }>): Promise<AppLocale> {
  const { locale } = await params;
  return hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
}

/**
 * A public page's metadata: its title/description (the root layout's defaults otherwise), the
 * canonical + hreflang alternates, and OpenGraph in the page's locale pointing at its own URL.
 */
export async function publicPageMetadata(
  path: PublicPath,
  locale: AppLocale,
  page: { title?: string; description?: string } = {},
): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'meta' });
  const alternates = publicAlternates(path, locale);
  return {
    ...(page.title ? { title: page.title } : {}),
    ...(page.description ? { description: page.description } : {}),
    alternates,
    openGraph: {
      title: page.title ?? t('title'),
      description: page.description ?? t('description'),
      siteName: 'Bugping',
      type: 'website',
      locale: OG_LOCALE[locale],
      alternateLocale: routing.locales.filter((l) => l !== locale).map((l) => OG_LOCALE[l]),
      url: alternates.canonical,
      // A page-level `openGraph` replaces the inherited one, file-based image included; Twitter's
      // card falls back to these images.
      images: [{ url: '/opengraph-image', alt: ogAlt, type: ogType, ...ogSize }],
    },
  };
}
