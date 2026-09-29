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
async function submitFeedback(
  context: BrowserContext,
  key: string,
  message: string,
  email?: string,
) {
  const host = await context.newPage();
  await host.goto(`/e2e-host?key=${key}`);
  await host.locator('[data-bugping] .bp-trigger').click();
  await host.locator('.bp-card[data-type="bug"]').click();
  await expect(host.locator('.bp-thumb')).toHaveAttribute('data-state', /ready|unavailable/, {
    timeout: 15_000,
  });
  await host.locator('.bp-message').fill(message);
  if (email) await host.locator('.bp-email').fill(email);
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
  // The only new report is gone from the list, so the panel closes.
  await expect(page.getByTestId('feedback-empty')).toBeVisible();
  await expect(page.getByTestId('feedback-detail')).toBeHidden();
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

  // A browser on the customer's site sends Origin; only such requests count as "widget seen".
  const config = await page.request.get(`/api/v1/widget/config?key=${key}`, {
    headers: { origin: 'https://shop.example' },
  });
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
  await expect(page.getByTestId('feedback-detail')).toBeHidden();
  await expect(page.getByTestId('status-tab-new')).not.toContainText('1');

  await page.getByTestId('status-tab-resolved').click();
  await expect(page).toHaveURL(/status=resolved/);
  await expect(page.getByTestId('feedback-row')).toHaveCount(1);
  await expect(page.getByTestId('feedback-row')).toContainText('the export button is broken');
});

test('small text gets a little word spacing but code blocks keep theirs', async ({ page }) => {
  await login(page);
  await createProject(page, 'E2E Spacing');
  const spacing = (selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((el) => getComputedStyle(el).wordSpacing);
  expect(await spacing('[data-testid="install-snippet"]')).toMatch(/^(normal|0px)$/);
  expect(await spacing('.text-xs:not(pre, pre *, .font-mono, .font-mono *)')).toBe('0.36px');
});

test('feedback actions read as actions in Russian and fit a phone', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const { key, projectId } = await createProject(page, 'E2E Actions');
  await submitFeedback(context, key, 'E2E: the label check', 'visitor@example.com');
  await page.goto('/app/account');
  await page.getByTestId('locale-switcher').selectOption('ru');
  await expect(page.getByRole('heading', { name: 'Аккаунт', exact: true })).toBeVisible();
  await page.goto(`/app/p/${projectId}/feedback`);
  await page.getByTestId('feedback-row').click();
  const resolve = page.getByTestId('feedback-resolve');
  await expect(resolve).toHaveText('Отметить решённым');
  await resolve.click();
  await expect(page.getByTestId('feedback-detail')).toBeHidden();
  await page.goto(`/app/p/${projectId}/feedback?status=resolved`);
  await page.getByTestId('feedback-row').click();
  await expect(page.getByTestId('feedback-reopen')).toHaveText('Вернуть в новые');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('triage: resolving or archiving opens the next report; the last one closes the panel', async ({
  page,
  context,
}) => {
  await login(page);
  const { key, projectId } = await createProject(page, 'E2E Triage');
  await submitFeedback(context, key, 'E2E: triage first');
  await submitFeedback(context, key, 'E2E: triage second');

  await page.goto(`/app/p/${projectId}/feedback`);
  const rows = page.getByTestId('feedback-row');
  await expect(rows).toHaveCount(2);
  // Newest first: "second" is on top, "first" below it.
  await rows.first().click();
  await expect(page.getByTestId('feedback-message')).toHaveText('E2E: triage second');

  await page.getByTestId('feedback-resolve').click();
  await expect(page.getByTestId('feedback-message')).toHaveText('E2E: triage first');
  await expect(page).toHaveURL(/status=new&f=[0-9a-f-]+$/);
  await expect(rows).toHaveCount(1);

  await page.getByTestId('feedback-archive').click();
  await expect(page.getByTestId('feedback-detail')).toBeHidden();
  await expect(page.getByTestId('feedback-empty')).toBeVisible();
  await expect(page).not.toHaveURL(/[?&]f=/);
});

test('delete: an in-app dialog confirms first, focuses Cancel, and then opens the next report', async ({
  page,
  context,
}) => {
  await login(page);
  const { key, projectId } = await createProject(page, 'E2E Delete');
  await submitFeedback(context, key, 'E2E: delete first');
  await submitFeedback(context, key, 'E2E: delete second');

  await page.goto(`/app/p/${projectId}/feedback`);
  const rows = page.getByTestId('feedback-row');
  await rows.first().click();
  await expect(page.getByTestId('feedback-message')).toHaveText('E2E: delete second');

  const dialog = page.getByTestId('feedback-delete-dialog');
  await page.getByTestId('feedback-delete').click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('This can’t be undone.');
  await expect(page.getByTestId('feedback-delete-cancel')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(rows).toHaveCount(2);

  await page.getByTestId('feedback-delete').click();
  await page.getByTestId('feedback-delete-confirm').click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('feedback-message')).toHaveText('E2E: delete first');
  await expect(rows).toHaveCount(1);
});

test('account and billing keep the last project nav and mark Account as current', async ({
  page,
}) => {
  await login(page);
  const { projectId } = await createProject(page, 'E2E Account Nav');
  await page.goto(`/app/p/${projectId}`);
  const nav = page.locator('aside');

  // Client navigation: the shell remembers the project.
  await nav.getByTestId('nav-account').click();
  await expect(page).toHaveURL(/\/app\/account$/);
  await expect(nav.getByTestId('nav-feedback')).toBeVisible();
  await expect(nav.getByTestId('project-switcher')).toContainText('E2E Account Nav');
  await expect(nav.getByTestId('nav-account')).toHaveAttribute('aria-current', 'page');
  await expect(nav.getByTestId('nav-overview')).not.toHaveAttribute('aria-current', 'page');

  // A hard load reads the cookie instead.
  await page.goto('/app/account');
  await expect(nav.getByTestId('nav-feedback')).toBeVisible();
  await page.goto('/app/billing');
  await expect(nav.getByTestId('nav-feedback')).toBeVisible();
  await expect(nav.getByTestId('nav-account')).not.toHaveAttribute('aria-current', 'page');
});

test('settings: unsaved changes show an indicator and warn before leaving the page', async ({
  page,
}) => {
  await login(page);
  const { projectId } = await createProject(page, 'E2E Dirty');
  await page.goto(`/app/p/${projectId}/settings`);
  const indicator = page.getByTestId('settings-unsaved');
  const warnsOnUnload = () =>
    page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
  await expect(indicator).toBeEmpty();
  expect(await warnsOnUnload()).toBe(false);

  await page.getByTestId('settings-name').fill('E2E Dirty renamed');
  await expect(indicator).toHaveText('Unsaved changes');
  expect(await warnsOnUnload()).toBe(true);

  await page.getByTestId('settings-save').click();
  await expect(indicator).toBeEmpty();
  expect(await warnsOnUnload()).toBe(false);
});

test('integrations: a Free owner gets an upgrade link next to the own-bot inputs', async ({
  page,
}) => {
  await login(page);
  const { projectId } = await createProject(page, 'E2E Own Bot');
  await page.goto(`/app/p/${projectId}/integrations`);
  await expect(page.getByTestId('custom-token')).toBeDisabled();
  await expect(page.getByTestId('custom-upgrade')).toHaveAttribute('href', '/app/billing');
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
  // The action is a real link styled with buttonVariants, so it keeps the "link" role.
  const cta = empty.getByRole('link', { name: 'Install the widget' });
  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute('href', `/app/p/${projectId}/install`);
});

test('a refused site shows a notice that allows it in one click', async ({ page, context }) => {
  await login(page);
  await page.goto('/app');
  await expect(page).toHaveURL(/\/app\/new$/);
  await page.getByTestId('project-name').fill('E2E Blocked');
  await page.getByTestId('project-site').fill('allowed.example');
  await page.getByTestId('project-create').click();
  await expect(page).toHaveURL(/\/app\/p\/[0-9a-f-]+\/install$/);
  const snippet = await page.getByTestId('install-snippet').textContent();
  const key = /data-project-id="(pk_[A-Za-z0-9]{16})"/.exec(snippet ?? '')![1]!;

  const host = await context.newPage();
  await host.goto(`/e2e-host?key=${key}`);
  await host.locator('[data-bugping] .bp-trigger').click();
  await host.locator('.bp-card[data-type="general"]').click();
  await host.locator('.bp-message').fill('E2E: from a refused site');
  await host.waitForTimeout(900); // bot guard
  await host.locator('.bp-send').click();
  await expect(host.locator('.bp-status')).toHaveText("Couldn't send. Try again later.");
  await host.close();

  const notice = page.getByTestId('blocked-origin-notice');
  await expect
    .poll(
      async () => {
        await page.reload();
        return notice.count();
      },
      { timeout: 10_000 },
    )
    .toBe(1);
  await expect(notice).toContainText(new URL(page.url()).origin);
  await page.getByTestId('blocked-origin-allow').click();
  await expect(notice).toHaveCount(0);

  await submitFeedback(context, key, 'E2E: allowed now');
  await expect(page.getByTestId('install-received')).toBeVisible({ timeout: 15_000 });
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

  test('the mobile menu on Account shows the nav of the project opened by client navigation', async ({
    page,
    context,
  }) => {
    await login(page);
    const { projectId } = await createProject(page, 'E2E Mobile Account');
    // A hard load with no cookie yet: the layout's prop is empty, so only shared state can help.
    await context.clearCookies({ name: 'bp_project' });
    await page.goto(`/app/p/${projectId}`);
    await page.getByRole('button', { name: 'Menu' }).click();
    const sheet = page.locator('[data-slot="sheet-content"]');
    await sheet.getByTestId('nav-account').click();
    await expect(page).toHaveURL(/\/app\/account$/);

    await page.getByRole('button', { name: 'Menu' }).click();
    await expect(sheet.getByTestId('nav-feedback')).toBeVisible();
    await expect(sheet.getByTestId('nav-feedback')).toHaveAttribute(
      'href',
      new RegExp(`/app/p/${projectId}/feedback`),
    );
  });
});

test('project switcher shows a freshly created project without a reload', async ({ page }) => {
  await login(page);
  await createProject(page, 'E2E Switcher');
  await expect(page.getByTestId('project-switcher').first()).toContainText('E2E Switcher');
});

test.describe('viewer time zone', () => {
  test.use({ timezoneId: 'Asia/Tokyo' });

  test('the tz cookie follows the browser and dates render in that zone', async ({
    page,
    context,
  }) => {
    await login(page);
    const { key, projectId } = await createProject(page, 'E2E Time Zone');
    await submitFeedback(context, key, 'E2E: what time is it in Tokyo');

    await page.goto(`/app/p/${projectId}/feedback`);
    await expect
      .poll(async () => (await context.cookies()).find((c) => c.name === 'tz')?.value)
      .toBe('Asia/Tokyo');

    await page.getByTestId('feedback-row').filter({ hasText: 'what time is it in Tokyo' }).click();
    const time = page.getByTestId('feedback-detail').locator('time');
    const iso = await time.getAttribute('datetime');
    expect(iso).toBeTruthy();
    const expected = new Intl.DateTimeFormat('en', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Tokyo',
    }).format(new Date(iso!));
    const flat = (s: string) => s.replace(/\s/g, ' ');
    await expect.poll(async () => flat((await time.textContent()) ?? '')).toBe(flat(expected));
  });
});
