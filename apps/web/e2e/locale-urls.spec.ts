import { expect, test } from '@playwright/test';

const REF_KEY = 'pk_AbCdEfGh12345678';
const RU_BROWSER = { 'accept-language': 'ru-RU,ru;q=0.9,en;q=0.8' };

test.describe('public pages', () => {
  test('/ru pages render in Russian with <html lang="ru">', async ({ page }) => {
    await page.goto('/ru');
    await expect(page).toHaveURL(/\/ru$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Узнавайте о багах');

    await page.goto('/ru/install');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Установка Bugping на ваш сайт',
    );

    await page.goto('/ru/privacy');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    await expect(page).toHaveTitle(/Политика конфиденциальности/);
  });

  test('unprefixed pages render in English with <html lang="en">', async ({ page }) => {
    for (const path of ['/', '/install', '/terms']) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      expect(new URL(page.url()).pathname, path).toBe(path);
      await expect(page.locator('html'), path).toHaveAttribute('lang', 'en');
    }
    await expect(page.getByTestId('legal-operator')).toContainText('Dymko Artem Ruslanovych');
  });

  test('/en URLs redirect to the unprefixed English page', async ({ page }) => {
    await page.goto('/en/install');
    expect(new URL(page.url()).pathname).toBe('/install');
    await expect(page.getByTestId('install-guide-page')).toBeVisible();
  });

  test('unknown first segments are a 404, not a page with that locale', async ({ page }) => {
    for (const path of ['/de', '/de/install', '/ru/app', '/ru/login']) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
      await expect(page.getByRole('heading', { name: 'Page not found' }), path).toBeVisible();
    }
  });

  test('metadata routes are not captured by the locale segment', async ({ request }) => {
    for (const path of ['/sitemap.xml', '/robots.txt', '/icon.svg']) {
      expect((await request.get(path)).status(), path).toBe(200);
    }
  });
});

test.describe('one-time language detection', () => {
  test.use({ locale: 'ru-RU' });

  test('a Russian browser without the cookie lands on the /ru page', async ({ page }) => {
    await page.goto('/install');
    expect(new URL(page.url()).pathname).toBe('/ru/install');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Установка Bugping на ваш сайт',
    );
  });

  test('the English cookie keeps the English page', async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: 'locale', value: 'en', url: baseURL! }]);
    await page.goto('/install');
    expect(new URL(page.url()).pathname).toBe('/install');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Install Bugping on your site',
    );
  });

  test('the referral survives the redirect', async ({ page, context }) => {
    await page.goto(`/?ref=${REF_KEY}`);
    const url = new URL(page.url());
    expect(url.pathname).toBe('/ru');
    expect(url.searchParams.get('ref')).toBe(REF_KEY);
    const ref = (await context.cookies()).find((c) => c.name === 'ref');
    expect(ref?.value).toBe(REF_KEY);
  });

  test('the dashboard, login and demo keep their URLs', async ({ page }) => {
    await page.goto('/login');
    expect(new URL(page.url()).pathname).toBe('/login');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');

    await page.goto('/demo/shop');
    expect(new URL(page.url()).pathname).toBe('/demo/shop');

    await page.goto('/app/billing');
    expect(new URL(page.url()).pathname).toBe('/login');
    const next = (await page.context().cookies()).find((c) => c.name === 'bp_next');
    expect(decodeURIComponent(next?.value ?? '')).toBe('/app/billing');
  });
});

test.describe('detection responses', () => {
  test('the redirect keeps the query string and sets the ref cookie', async ({ request }) => {
    const response = await request.get(`/?ref=${REF_KEY}`, {
      headers: RU_BROWSER,
      maxRedirects: 0,
    });
    expect([302, 307]).toContain(response.status());
    expect(new URL(response.headers()['location']!, 'http://x').pathname).toBe('/ru');
    expect(response.headers()['location']).toContain(`ref=${REF_KEY}`);
    expect(response.headers()['set-cookie']).toContain(`ref=${REF_KEY}`);
  });

  test('the locale=ru cookie redirects an English URL to /ru', async ({ request }) => {
    const response = await request.get('/terms', {
      headers: { cookie: 'locale=ru' },
      maxRedirects: 0,
    });
    expect([302, 307]).toContain(response.status());
    expect(new URL(response.headers()['location']!, 'http://x').pathname).toBe('/ru/terms');
  });

  test('opening a /ru page from an English browser stores the site-wide locale cookie', async ({
    request,
  }) => {
    const response = await request.get('/ru', {
      headers: { 'accept-language': 'en-US,en;q=0.9' },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(200);
    const cookie = response.headers()['set-cookie'] ?? '';
    expect(cookie).toMatch(/locale=ru/);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/Max-Age=31536000/);
  });

  test('crawlers without Russian in Accept-Language are never redirected', async ({ request }) => {
    const variants: Record<string, string>[] = [{}, { 'accept-language': 'en-US,en;q=0.9' }];
    for (const headers of variants) {
      const response = await request.get('/', { headers, maxRedirects: 0 });
      expect(response.status()).toBe(200);
    }
  });
});
