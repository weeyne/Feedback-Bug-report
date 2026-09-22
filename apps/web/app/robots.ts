import type { MetadataRoute } from 'next';
import { getEnv } from '@/lib/env';

export default function robots(): MetadataRoute.Robots {
  const base = getEnv().NEXT_PUBLIC_APP_URL;
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/app', '/api', '/auth'] },
    sitemap: `${base}/sitemap.xml`,
  };
}
