import { afterEach, describe, expect, it, vi } from 'vitest';
import { VALID_ENV } from '@/test/fixtures';

afterEach(() => vi.unstubAllEnvs());

async function load() {
  for (const [key, value] of Object.entries(VALID_ENV)) vi.stubEnv(key, value);
  vi.resetModules();
  return {
    robots: (await import('./robots')).default,
    sitemap: (await import('./sitemap')).default,
  };
}

describe('SEO routes', () => {
  it('robots allows the site but not the dashboard or API', async () => {
    const { robots } = await load();
    const result = robots();
    expect(result.rules).toEqual({
      userAgent: '*',
      allow: '/',
      disallow: ['/app', '/api', '/auth'],
    });
    expect(result.sitemap).toBe(`${VALID_ENV.NEXT_PUBLIC_APP_URL}/sitemap.xml`);
  });

  it('sitemap lists the public pages', async () => {
    const { sitemap } = await load();
    expect(sitemap().map((entry) => entry.url)).toEqual(
      ['', '/privacy', '/terms', '/login'].map((path) => `${VALID_ENV.NEXT_PUBLIC_APP_URL}${path}`),
    );
  });
});
