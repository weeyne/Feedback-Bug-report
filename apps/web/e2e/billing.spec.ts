import { expect, test } from '@playwright/test';
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
