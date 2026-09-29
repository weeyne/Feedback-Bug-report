import { expect, test, type Page } from '@playwright/test';
import { signPaddle } from '../lib/billing/signature';

const SECRET = 'pdl_ntfset_e2e000000000000'; // playwright.config.ts webServer.env
const LIFETIME = 'pri_e2elifetime000000000';

test('a signed Lifetime webhook turns the account Pro and unlocks Pro settings', async ({
  page,
}) => {
  const email = `billing-${Date.now()}@e2e.dev`;
  const login = await page.request.post('/api/e2e-test/login', { data: { email } });
  const { id: userId } = (await login.json()) as { id: string };

  await page.goto('/app/billing');
  await expect(page.getByTestId('billing-card-lifetime')).toBeVisible();

  const event = {
    event_id: `evt_e2e_${Date.now()}`,
    event_type: 'transaction.completed',
    occurred_at: new Date().toISOString(),
    data: {
      id: `txn_e2e_${Date.now()}`,
      status: 'completed',
      customer_id: 'ctm_e2e',
      subscription_id: null,
      custom_data: { user_id: userId },
      items: [{ price: { id: LIFETIME } }],
    },
  };
  const body = JSON.stringify(event);
  const res = await page.request.post('/api/billing/webhook', {
    headers: {
      'content-type': 'application/json',
      'paddle-signature': signPaddle(body, SECRET, Math.floor(Date.now() / 1000)),
    },
    data: body,
  });
  expect(res.status()).toBe(200);

  await page.reload();
  await expect(page.getByTestId('billing-plan')).toContainText(/Lifetime|навсегда/);
  await expect(page.getByTestId('billing-manage')).toBeVisible();

  await page.goto('/app');
  await expect(page).toHaveURL(/\/app\/new$/);
  await page.getByTestId('project-name').fill('E2E Billing');
  await page.getByTestId('project-create').click();
  // The create action redirects client-side after an await; page.url() right after click() can
  // still show /app/new. Wait for the URL to actually change before parsing it (see dashboard.spec.ts).
  await expect(page).toHaveURL(/\/app\/p\/[0-9a-f-]+\//);
  const projectId = /\/app\/p\/([0-9a-f-]+)\//.exec(page.url())![1]!;
  await page.goto(`/app/p/${projectId}/settings`);
  await expect(page.getByTestId('settings-css')).toBeEnabled();
});

test('an unsigned billing webhook is rejected', async ({ page }) => {
  const res = await page.request.post('/api/billing/webhook', {
    headers: { 'content-type': 'application/json' },
    data: '{}',
  });
  expect(res.status()).toBe(401);
});

async function buyLifetime(page: Page, email: string) {
  const login = await page.request.post('/api/e2e-test/login', { data: { email } });
  const { id: userId } = (await login.json()) as { id: string };
  const body = JSON.stringify({
    event_id: `evt_e2e_${Date.now()}`,
    event_type: 'transaction.completed',
    occurred_at: new Date().toISOString(),
    data: {
      id: `txn_e2e_${Date.now()}`,
      status: 'completed',
      customer_id: 'ctm_e2e',
      subscription_id: null,
      custom_data: { user_id: userId },
      items: [{ price: { id: LIFETIME } }],
    },
  });
  const res = await page.request.post('/api/billing/webhook', {
    headers: {
      'content-type': 'application/json',
      'paddle-signature': signPaddle(body, SECRET, Math.floor(Date.now() / 1000)),
    },
    data: body,
  });
  expect(res.status()).toBe(200);
}

test('the billing portal opens in a tab created on click', async ({ page, context }) => {
  const PORTAL = 'https://sandbox-customer-portal.paddle.com/e2e'; // lib/test-mode.ts
  await context.route(`${PORTAL}**`, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<h1>Portal</h1>' }),
  );
  // The test-mode Paddle fake knows a customer for `portal-` emails only.
  await buyLifetime(page, `portal-${Date.now()}@e2e.dev`);
  await page.goto('/app/billing');
  const popup = page.waitForEvent('popup');
  await page.getByTestId('billing-manage').click();
  const tab = await popup;
  await expect(tab).toHaveURL(PORTAL);
  await expect(page).toHaveURL(/\/app\/billing$/);
});

test('the pending portal tab is closed when there is no Paddle customer', async ({ page }) => {
  await buyLifetime(page, `noportal-${Date.now()}@e2e.dev`);
  await page.goto('/app/billing');
  const popup = page.waitForEvent('popup');
  await page.getByTestId('billing-manage').click();
  const tab = await popup;
  await tab.waitForEvent('close');
  await expect(page.getByText(/No billing account yet|Платёжного аккаунта пока нет/)).toBeVisible();
});

test('billing highlights Pro as popular and reuses the landing plan wording', async ({ page }) => {
  await page.request.post('/api/e2e-test/login', {
    data: { email: `plans-${Date.now()}@e2e.dev` },
  });
  await page.goto('/app/billing');
  const monthly = page.getByTestId('billing-card-monthly');
  const lifetime = page.getByTestId('billing-card-lifetime');
  await expect(monthly.getByTestId('billing-popular')).toHaveText('Popular');
  await expect(lifetime.getByTestId('billing-popular')).toHaveCount(0);
  await expect(monthly).toHaveClass(/(^|\s)border-primary(\s|$)/);
  await expect(lifetime).not.toHaveClass(/(^|\s)border-primary(\s|$)/);
  await expect(monthly).toContainText('Your own Telegram bot');
  await expect(lifetime).toContainText('One payment, no subscription');
});

test('checkout names the ad blocker when Paddle.js cannot load', async ({ page }) => {
  await page.route('**://cdn.paddle.com/**', (route) => route.abort());
  await page.request.post('/api/e2e-test/login', {
    data: { email: `blocked-${Date.now()}@e2e.dev` },
  });
  await page.goto('/app/billing');
  // The failure lands asynchronously; retry the click until Paddle.js has been marked as failed.
  await expect(async () => {
    await page.getByTestId('billing-upgrade-monthly').click();
    await expect(page.getByText(/ad blocker may be blocking Paddle/)).toBeVisible({
      timeout: 1000,
    });
  }).toPass({ timeout: 15_000 });
});
