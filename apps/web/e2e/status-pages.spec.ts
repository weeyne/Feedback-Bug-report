import { expect, test } from '@playwright/test';

test('an unknown URL returns 404 with the branded page', async ({ page }) => {
  const response = await page.goto('/definitely-missing');
  expect(response?.status()).toBe(404);
  await expect(page).toHaveTitle('Page not found · Bugping');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
  await expect(page.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/app');
});

test('the 404 page follows the locale cookie', async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: 'locale', value: 'ru', url: baseURL! }]);
  await page.goto('/definitely-missing');
  await expect(page.getByRole('heading', { name: 'Страница не найдена' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'На главную' })).toHaveAttribute('href', '/');
});

test('an unknown project shows the same 404 page inside the dashboard', async ({ page }) => {
  const email = `owner-${Date.now()}@e2e.dev`;
  const login = await page.request.post('/api/e2e-test/login', { data: { email } });
  expect(login.ok()).toBe(true);
  const response = await page.goto('/app/p/00000000-0000-4000-8000-000000000000');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
});
