import { afterEach, describe, expect, it, vi } from 'vitest';
import { VALID_ENV } from '@/test/fixtures';

afterEach(() => vi.unstubAllEnvs());

/**
 * Blanks every var from the full fixture set except NEXT_PUBLIC_APP_URL, so a real
 * dev/CI shell environment (Supabase keys, DATABASE_URL, secrets, Telegram…) can
 * never leak into these tests. robots.ts/sitemap.ts must work with none of these set.
 */
function blankEverythingExceptAppUrl() {
  for (const key of Object.keys(VALID_ENV)) {
    if (key !== 'NEXT_PUBLIC_APP_URL') vi.stubEnv(key, '');
  }
}

async function load() {
  return {
    robots: (await import('./robots')).default,
    sitemap: (await import('./sitemap')).default,
  };
}

describe('SEO routes', () => {
  it('robots allows the site but not the dashboard or API, needing only NEXT_PUBLIC_APP_URL', async () => {
    blankEverythingExceptAppUrl();
    vi.stubEnv('NEXT_PUBLIC_APP_URL', VALID_ENV.NEXT_PUBLIC_APP_URL);
    vi.resetModules();
    const { robots } = await load();
    const result = robots();
    expect(result.rules).toEqual({
      userAgent: '*',
      allow: '/',
      disallow: ['/app', '/api', '/auth'],
    });
    expect(result.sitemap).toBe(`${VALID_ENV.NEXT_PUBLIC_APP_URL}/sitemap.xml`);
  });

  it('sitemap lists the public pages, needing only NEXT_PUBLIC_APP_URL', async () => {
    blankEverythingExceptAppUrl();
    vi.stubEnv('NEXT_PUBLIC_APP_URL', VALID_ENV.NEXT_PUBLIC_APP_URL);
    vi.resetModules();
    const { sitemap } = await load();
    expect(sitemap().map((entry) => entry.url)).toEqual(
      ['', '/privacy', '/terms', '/login'].map((path) => `${VALID_ENV.NEXT_PUBLIC_APP_URL}${path}`),
    );
  });

  it('falls back to http://localhost:3000 when NEXT_PUBLIC_APP_URL is unset, with nothing else set either', async () => {
    blankEverythingExceptAppUrl();
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    vi.resetModules();
    const { robots, sitemap } = await load();
    expect(robots().sitemap).toBe('http://localhost:3000/sitemap.xml');
    expect(sitemap().map((entry) => entry.url)).toEqual(
      ['', '/privacy', '/terms', '/login'].map((path) => `http://localhost:3000${path}`),
    );
  });

  it('strips a trailing slash from NEXT_PUBLIC_APP_URL', async () => {
    blankEverythingExceptAppUrl();
    vi.stubEnv('NEXT_PUBLIC_APP_URL', `${VALID_ENV.NEXT_PUBLIC_APP_URL}/`);
    vi.resetModules();
    const { robots } = await load();
    expect(robots().sitemap).toBe(`${VALID_ENV.NEXT_PUBLIC_APP_URL}/sitemap.xml`);
  });
});
