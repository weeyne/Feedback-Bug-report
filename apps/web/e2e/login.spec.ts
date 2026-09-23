import { expect, test } from '@playwright/test';

test('login page links back to the site', async ({ page }) => {
  await page.goto('/login');
  await page.getByTestId('login-back').click();
  await expect(page).toHaveURL(/\/$/);
});

test('email sign-in shows the sent state and can start over', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByTestId('login-github')).toBeVisible();
  await page.getByTestId('login-email').fill('someone@example.com');
  await page.getByTestId('login-submit').click();
  const sent = page.getByTestId('login-sent');
  await expect(sent).toBeVisible();
  await expect(sent).toContainText('someone@example.com');
  await page.getByTestId('login-different-email').click();
  await expect(page.getByTestId('login-email')).toBeVisible();
  await expect(page.getByTestId('login-email')).toHaveValue('');
});

test('a failed callback shows an alert', async ({ page }) => {
  await page.goto('/login?error=callback');
  // Scoped to `main`: `getByRole('alert')` alone also matches Next's route announcer
  // (`<div role="alert" id="__next-route-announcer__">` in an open shadow root under
  // `<body>`), which only appears after hydration — an unscoped locator is strict-mode-safe
  // before hydration but fails after it. Scoping to `main` excludes the announcer in both cases.
  const alert = page.getByRole('main').getByRole('alert');
  await expect(alert).toBeVisible();
  await expect(alert).not.toBeEmpty();
});

test('a failed callback alert does not reappear after switching email', async ({ page }) => {
  await page.goto('/login?error=callback');
  const alert = page.getByRole('main').getByRole('alert');
  await expect(alert).toBeVisible();
  await page.getByTestId('login-email').fill('someone@example.com');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-sent')).toBeVisible();
  await page.getByTestId('login-different-email').click();
  await expect(page.getByTestId('login-email')).toBeVisible();
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
});
