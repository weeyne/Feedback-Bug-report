import type { MetadataRoute } from 'next';
import { getPublicEnv } from '@/lib/public-env';

export default function robots(): MetadataRoute.Robots {
  const base = getPublicEnv().appUrl;
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/app', '/api', '/auth'] },
    sitemap: `${base}/sitemap.xml`,
  };
}
