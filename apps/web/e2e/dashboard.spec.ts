import { expect, test, type BrowserContext, type Page } from '@playwright/test';

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

/** Submits one piece of feedback through the widget on the e2e host page, as a visitor would. */
async function submitFeedback(context: BrowserContext, key: string, message: string) {
  const host = await context.newPage();
  await host.goto(`/e2e-host?key=${key}`);
  await host.locator('[data-bugping] .bp-trigger').click();
  await host.locator('.bp-card[data-type="bug"]').click();
  await expect(host.locator('.bp-thumb')).toHaveAttribute('data-state', /ready|unavailable/, {
    timeout: 15_000,
  });
  await host.locator('.bp-message').fill(message);
  await host.waitForTimeout(2100); // bot guard
  await host.locator('.bp-send').click();
  await expect(host.locator('.bp-thanks')).toBeVisible();
  await host.close();
}

test('onboarding: create a project, receive the first feedback, resolve it', async ({
  page,
  context,
}) => {
  await login(page);
  const { key, projectId } = await createProject(page, 'E2E Onboarding');
  await expect(page.getByTestId('install-waiting')).toBeVisible();

  await submitFeedback(context, key, 'E2E: the cart button does nothing');

  await expect(page.getByTestId('install-received')).toBeVisible({ timeout: 15_000 });
  await page.goto(`/app/p/${projectId}`);
  await expect(page.getByTestId('overview-recent')).toContainText('the cart button does nothing');
  await expect(page.getByTestId('checklist-feedback')).toHaveAttribute('data-done', 'true');
  // Stat numbers animate; assert on CountUp's data-value, not on textContent.
  await expect(page.getByTestId('stat-new').locator('[data-value]')).toHaveAttribute(
    'data-value',
    '1',
  );
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

test('overview: the widget step completes and the connection shows seen after the widget pings', async ({
  page,
}) => {
  await login(page);
  const { key } = await createProject(page, 'E2E Overview Widget');

  // Since a project already exists, /app redirects straight to its Overview.
  await page.goto('/app');
  await expect(page).toHaveURL(/\/app\/p\/[0-9a-f-]+$/);
  await expect(page.getByTestId('nav-overview').first()).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('overview-checklist')).toBeVisible();
  await expect(page.getByTestId('checklist-widget')).toHaveAttribute('data-done', 'false');
  await expect(page.getByTestId('connection-widget')).toHaveAttribute('data-ok', 'false');

  const config = await page.request.get(`/api/v1/widget/config?key=${key}`);
  expect(config.ok()).toBe(true);

  // markWidgetSeen runs in an `after()` callback that fires once the response is sent, so the
  // write can land slightly after the request resolves here. A fresh project's widget_seen_at
  // is null, so the throttle (skip within 1h of an existing value) never applies to this first
  // ping — retry the reload instead of a single one to avoid a race with the callback.
  await expect(async () => {
    await page.reload();
    await expect(page.getByTestId('checklist-widget')).toHaveAttribute('data-done', 'true');
  }).toPass();

  const widgetTile = page.getByTestId('connection-widget');
  await expect(widgetTile).toHaveAttribute('data-ok', 'true');
  await expect(widgetTile).toContainText('seen');
});

test('overview: recent feedback opens the detail panel; resolving updates the new count', async ({
  page,
  context,
}) => {
  await login(page);
  const { key, projectId } = await createProject(page, 'E2E Overview Feedback');
  await submitFeedback(context, key, 'E2E: the export button is broken');

  await page.goto(`/app/p/${projectId}`);
  await expect(page.getByTestId('stat-new').locator('[data-value]')).toHaveAttribute(
    'data-value',
    '1',
  );
  const recent = page.getByTestId('overview-recent');
  await expect(recent).toContainText('the export button is broken');

  await recent.getByText('the export button is broken').click();
  await expect(page).toHaveURL(/\/feedback\?status=new&f=[0-9a-f-]+$/);
  await expect(page.getByTestId('feedback-detail')).toBeVisible();
  await expect(page.getByTestId('feedback-message')).toHaveText('E2E: the export button is broken');
  await expect(page.getByTestId('status-tab-new')).toContainText('1');

  await page.getByTestId('feedback-resolve').click();
  await expect(page.getByTestId('feedback-reopen')).toBeVisible();
  await expect(page.getByTestId('status-tab-new')).not.toContainText('1');

  await page.getByTestId('status-tab-resolved').click();
  await expect(page).toHaveURL(/status=resolved/);
  await expect(page.getByTestId('feedback-row')).toHaveCount(1);
  await expect(page.getByTestId('feedback-row')).toContainText('the export button is broken');
});

test('theme: toggling switches the html class and persists across a reload', async ({ page }) => {
  await login(page);
  await createProject(page, 'E2E Theme');
  // Desktop viewport: only the sidebar's toggle is visible (the mobile header's copy is
  // css-hidden but still in the DOM — see components/app/app-shell.tsx).
  const toggle = page.getByTestId('theme-toggle').first();
  const html = page.locator('html');
  await expect(toggle).toBeVisible();
  await expect(html).not.toHaveClass(/dark/);

  await toggle.click();
  await expect(html).toHaveClass(/dark/);
  await page.reload();
  await expect(html).toHaveClass(/dark/);

  await page.getByTestId('theme-toggle').first().click();
  await expect(html).not.toHaveClass(/dark/);
});

test('feed: a fresh project shows the empty state with the install CTA', async ({ page }) => {
  await login(page);
  const { projectId } = await createProject(page, 'E2E Empty');
  await page.goto(`/app/p/${projectId}/feedback`);
  await expect(page.getByTestId('feedback-empty')).toBeVisible();
  const empty = page.getByTestId('empty-state');
  await expect(empty).toBeVisible();
  // The action renders as an <a>, but the Button component gives it an accessible role of
  // "button" regardless of the underlying element.
  const cta = empty.getByRole('button', { name: 'Install the widget' });
  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute('href', `/app/p/${projectId}/install`);
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the mobile menu opens a sheet with the project nav and the theme toggle', async ({
    page,
  }) => {
    await login(page);
    const { projectId } = await createProject(page, 'E2E Mobile');
    await page.goto(`/app/p/${projectId}`);

    await page.getByRole('button', { name: 'Menu' }).click();
    // Scope to the sheet's popup (data-slot="sheet-content" in components/ui/sheet.tsx): the
    // sidebar's copy of the same nav/toggle stays in the DOM, just css-hidden, on mobile too.
    const sheet = page.locator('[data-slot="sheet-content"]');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId('nav-overview')).toBeVisible();
    await expect(sheet.getByTestId('nav-feedback')).toBeVisible();
    await expect(sheet.getByTestId('theme-toggle')).toBeVisible();
  });
});
