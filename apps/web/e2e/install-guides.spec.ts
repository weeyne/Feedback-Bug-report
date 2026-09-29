import { expect, test, type Page } from '@playwright/test';

const PLATFORMS = ['html', 'wordpress', 'shopify', 'tilda', 'nextjs'] as const;

let counter = 0;
async function login(page: Page) {
  const email = `guides-${Date.now()}-${counter++}@e2e.dev`;
  const response = await page.request.post('/api/e2e-test/login', { data: { email } });
  expect(response.ok()).toBe(true);
}

test('the public install page lists the five guides with the HTML one open', async ({ page }) => {
  const response = await page.goto('/install');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Install Bugping on your site');
  await expect(page.getByTestId('install-guides')).toBeVisible();
  for (const id of PLATFORMS) await expect(page.getByTestId(`install-guide-${id}`)).toBeVisible();

  await expect(page.getByTestId('install-guide-html')).toHaveAttribute('open', '');
  await expect(page.getByTestId('install-guide-html-code')).toContainText('pk_your_project_key');
  await expect(page.getByTestId('install-guide-tilda')).not.toHaveAttribute('open', '');

  await page.getByTestId('install-guide-tilda').locator('summary').click();
  await expect(page.getByTestId('install-guide-tilda')).toHaveAttribute('open', '');
  await expect(page.getByTestId('install-guide-tilda').locator('ol li')).toHaveCount(3);
  await expect(page.getByTestId('install-guide-tilda')).toContainText('Publish all pages');
  await expect(page.getByTestId('install-guide-tilda-code')).toContainText('pk_your_project_key');

  await page.getByTestId('install-guide-nextjs').locator('summary').click();
  await expect(page.getByTestId('install-guide-nextjs-code')).toContainText('next/script');

  await expect(
    page.getByTestId('install-guide-page').getByRole('link', { name: 'Start free' }),
  ).toHaveAttribute('href', '/login');
  await expect(page.getByRole('link', { name: 'Install guides' })).toHaveAttribute(
    'href',
    '/install',
  );
});

test('the Russian install page is localized', async ({ page }) => {
  await page.goto('/ru/install');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Установка Bugping на ваш сайт');
  await page.getByTestId('install-guide-tilda').locator('summary').click();
  await expect(page.getByTestId('install-guide-tilda')).toContainText('Опубликовать все страницы');
  await expect(page.getByTestId('install-guide-html')).toContainText('</body>');
});

test('the dashboard Install page shows the guides with the real project key', async ({ page }) => {
  await login(page);
  await page.goto('/app');
  await expect(page).toHaveURL(/\/app\/new$/);
  await page.getByTestId('project-name').fill('E2E Guides');
  await page.getByTestId('project-create').click();
  await expect(page).toHaveURL(/\/app\/p\/[0-9a-f-]+\/install$/);

  const snippet = await page.getByTestId('install-snippet').textContent();
  const key = /data-project-id="(pk_[A-Za-z0-9]{16})"/.exec(snippet ?? '')?.[1];
  expect(key).toBeTruthy();

  await expect(page.getByTestId('install-guides')).toBeVisible();
  await page.getByTestId('install-guide-wordpress').locator('summary').click();
  await expect(page.getByTestId('install-guide-wordpress-code')).toContainText(key!);
  await expect(page.getByTestId('install-guide-wordpress-code')).not.toContainText(
    'pk_your_project_key',
  );
  await page.getByTestId('install-guide-nextjs').locator('summary').click();
  await expect(page.getByTestId('install-guide-nextjs-code')).toContainText(key!);
  await expect(page.getByTestId('install-waiting')).toBeVisible();
});
