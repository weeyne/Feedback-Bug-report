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
  await expect(page.getByRole('alert')).toBeVisible();
});
