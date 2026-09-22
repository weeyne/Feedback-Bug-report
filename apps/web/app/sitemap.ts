import type { MetadataRoute } from 'next';
import { getEnv } from '@/lib/env';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getEnv().NEXT_PUBLIC_APP_URL;
  return ['', '/privacy', '/terms', '/login'].map((path) => ({
    url: `${base}${path}`,
    changeFrequency: 'monthly',
    priority: path === '' ? 1 : 0.5,
  }));
}
