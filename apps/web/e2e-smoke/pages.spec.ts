import { expect, test } from '@playwright/test';

test('the landing renders in English and Russian', async ({ page }) => {
  for (const [path, lang] of [
    ['/', 'en'],
    ['/ru', 'ru'],
  ] as const) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    await expect(page.locator('html'), path).toHaveAttribute('lang', lang);
    await expect(page.getByRole('heading', { level: 1 }).first(), path).toBeVisible();
  }
});

test('the public pages answer 200 without a redirect', async ({ request }) => {
  // `/ru/install` last: it sets the `locale=ru` cookie, after which English URLs redirect to `/ru/…` by design.
  for (const path of ['/install', '/privacy', '/terms', '/refund', '/ru/install']) {
    expect((await request.get(path, { maxRedirects: 0 })).status(), path).toBe(200);
  }
});

test('an unknown path renders the not-found page', async ({ page }) => {
  const response = await page.goto('/no-such-page');
  expect(response?.status()).toBe(404);
  // The app's own not-found page, not Next's built-in fallback.
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});

test('test mode is unreachable in the production build', async ({ request }) => {
  expect((await request.get('/e2e-host')).status()).toBe(404);
  const login = await request.post('/api/e2e-test/login', { data: { email: 'smoke@e2e.dev' } });
  expect(login.status()).toBe(404);
});

test('the widget bundle is served as JavaScript', async ({ request }) => {
  const response = await request.get('/w/widget.js');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toMatch(/javascript/);
});

test('the dashboard redirects a visitor to the login page', async ({ request }) => {
  const response = await request.get('/app', { maxRedirects: 0 });
  expect(response.status()).toBeGreaterThanOrEqual(300);
  expect(response.status()).toBeLessThan(400);
  expect(new URL(response.headers()['location']!, 'http://localhost').pathname).toBe('/login');
});
