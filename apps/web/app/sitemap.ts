import type { MetadataRoute } from 'next';
import { LOCALES } from '@/i18n/locale';
import { localizedPath, PUBLIC_PATHS, publicAlternates } from '@/i18n/public-pages';
import { getPublicEnv } from '@/lib/public-env';

/** Every public page in every locale, each listing all its language versions; /login once. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = getPublicEnv().appUrl;
  const absolute = (path: string) => (path === '/' ? base : `${base}${path}`);
  const pages: MetadataRoute.Sitemap = PUBLIC_PATHS.flatMap((path) =>
    LOCALES.map((locale) => ({
      url: absolute(localizedPath(path, locale)),
      changeFrequency: 'monthly' as const,
      priority: path === '/' ? 1 : 0.5,
      alternates: {
        languages: Object.fromEntries(
          Object.entries(publicAlternates(path, locale).languages).map(([lang, href]) => [
            lang,
            absolute(href),
          ]),
        ),
      },
    })),
  );
  return [...pages, { url: `${base}/login`, changeFrequency: 'monthly', priority: 0.5 }];
}
