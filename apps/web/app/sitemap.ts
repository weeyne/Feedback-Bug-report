import type { MetadataRoute } from 'next';
import { getPublicEnv } from '@/lib/public-env';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getPublicEnv().appUrl;
  return ['', '/privacy', '/terms', '/login'].map((path) => ({
    url: `${base}${path}`,
    changeFrequency: 'monthly',
    priority: path === '' ? 1 : 0.5,
  }));
}
