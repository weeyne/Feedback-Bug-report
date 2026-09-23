import { expect, test, type Page } from '@playwright/test';

const WEBHOOK_SECRET = 'e2e-webhook-secret-0123'; // playwright.config.ts webServer.env

let counter = 0;
async function login(page: Page) {
  const email = `owner-${Date.now()}-${counter++}@e2e.dev`;
  const response = await page.request.post('/api/e2e-test/login', { data: { email } });
  expect(response.ok()).toBe(true);
  return email;
}

async function createProject(page: Page, name: string) {
  await page.goto('/app');
  await expect(page).toHaveURL(/\/app\/new$/);
  await page.getByTestId('project-name').fill(name);
  await page.getByTestId('project-create').click();
  await expect(page).toHaveURL(/\/app\/p\/[0-9a-f-]+\/install$/);
  const snippet = await page.getByTestId('install-snippet').textContent();
  const key = /data-project-id="(pk_[A-Za-z0-9]{16})"/.exec(snippet ?? '')?.[1];
  expect(key).toBeTruthy();
  const projectId = /\/app\/p\/([0-9a-f-]+)\//.exec(page.url())![1]!;
  return { key: key!, projectId };
}

test.beforeEach(async ({ page }) => {
  await page.request.delete('/api/e2e-test/outbox');
});

test('onboarding: create a project, receive the first feedback, resolve it', async ({
  page,
  context,
}) => {
  await login(page);
  const { key, projectId } = await createProject(page, 'E2E Onboarding');
  await expect(page.getByTestId('install-waiting')).toBeVisible();

  const host = await context.newPage();
  await host.goto(`/e2e-host?key=${key}`);
  await host.locator('[data-bugping] .bp-trigger').click();
  await expect(host.locator('.bp-thumb')).toHaveAttribute('data-state', /ready|unavailable/, {
    timeout: 15_000,
  });
  await host.locator('.bp-message').fill('E2E: the cart button does nothing');
  await host.waitForTimeout(2100); // bot guard
  await host.locator('.bp-send').click();
  await expect(host.locator('.bp-thanks')).toBeVisible();
  await host.close();

  await expect(page.getByTestId('install-received')).toBeVisible({ timeout: 15_000 });
  await page.goto(`/app/p/${projectId}/feedback`);
  const row = page.getByTestId('feedback-row').filter({ hasText: 'the cart button does nothing' });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByTestId('feedback-message')).toHaveText(
    'E2E: the cart button does nothing',
  );
  await page.getByTestId('feedback-resolve').click();
  await expect(page.getByTestId('feedback-reopen')).toBeVisible();
  await page.getByTestId('filter-status-new').click();
  await expect(page.getByTestId('feedback-empty')).toBeVisible();
  await page.getByTestId('filter-status-resolved').click();
  await expect(page.getByTestId('feedback-row')).toHaveCount(1);
});

test('settings: color and locale update the preview and the public config', async ({ page }) => {
  await login(page);
  const { key, projectId } = await createProject(page, 'E2E Settings');
  await page.goto(`/app/p/${projectId}/settings`);
  const preview = page.getByTestId('widget-preview');
  await expect(preview.locator('[data-bugping]')).toBeAttached({ timeout: 15_000 });

  await page.getByTestId('settings-color-hex').fill('#ff0055');
  await page.getByTestId('settings-locale').selectOption('ru');
  await expect
    .poll(() =>
      preview.locator('[data-bugping]').evaluate((host) => {
        const root = host.shadowRoot?.querySelector<HTMLElement>('.bp-root');
        return `${root?.style.getPropertyValue('--bp-accent')}|${root?.getAttribute('lang')}`;
      }),
    )
    .toBe('#ff0055|ru');

  await page.getByTestId('settings-save').click();
  await expect
    .poll(async () => {
      const config = await (await page.request.get(`/api/v1/widget/config?key=${key}`)).json();
      return `${config.primaryColor}|${config.locale}`;
    })
    .toBe('#ff0055|ru');
});

test('integrations: Telegram connects through the webhook, Discord saves after a test send', async ({
  page,
}) => {
  await login(page);
  const { projectId } = await createProject(page, 'E2E Integrations');
  await page.goto(`/app/p/${projectId}/integrations`);

  await page.getByTestId('tg-connect').click();
  const href = await page.getByTestId('tg-private-link').getAttribute('href');
  const code = /start=([0-9A-Za-z]{12})$/.exec(href ?? '')?.[1];
  expect(code).toBeTruthy();
  const webhook = await page.request.post('/api/telegram/webhook', {
    headers: { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET },
    data: { message: { text: `/start ${code}`, chat: { id: 777001, type: 'private' } } },
  });
  expect(webhook.ok()).toBe(true);
  await expect(page.getByTestId('integration-telegram_shared')).toHaveAttribute(
    'data-connected',
    'true',
    { timeout: 15_000 },
  );

  await page.getByTestId('discord-url').fill('https://discord.com/api/webhooks/42/e2e-dashboard');
  await page.getByTestId('discord-save').click();
  await expect(page.getByTestId('integration-discord')).toHaveAttribute('data-connected', 'true');
  const { outbox } = await (await page.request.get('/api/e2e-test/outbox')).json();
  expect(
    outbox.some((entry: { url: string }) =>
      entry.url.startsWith('https://discord.com/api/webhooks/42/e2e-dashboard'),
    ),
  ).toBe(true);
});

test('the dashboard renders in Russian after switching the language', async ({ page }) => {
  await login(page);
  const { projectId } = await createProject(page, 'E2E Locale');
  await page.goto('/app/account');
  await page.getByTestId('locale-switcher').selectOption('ru');
  // exact: true — the page also has an "Удалить аккаунт" (Delete account) heading, which
  // Playwright's default substring match would also match against "Аккаунт".
  await expect(page.getByRole('heading', { name: 'Аккаунт', exact: true })).toBeVisible();
  // ProjectNav only renders the feedback/install/settings/integrations links while the current
  // URL is under a project (see components/app/project-nav.tsx): on /app/account there is no
  // `nav-feedback` element to click. Go to a project page first, then follow the sidebar link,
  // to exercise the same nav-feedback element the brief's scenario targets.
  await page.goto(`/app/p/${projectId}/settings`);
  await page.getByTestId('nav-feedback').first().click();
  await expect(page.getByRole('heading', { name: 'Отзывы' })).toBeVisible();
});
