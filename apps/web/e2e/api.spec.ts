import { expect, test, type Page } from '@playwright/test';

interface State {
  outbox: Array<{ url: string; body: any }>;
  feedback: Array<{
    id: string;
    public_key: string;
    message: string;
    screenshot_path: string | null;
    over_quota: boolean;
  }>;
}

const state = async (page: Page): Promise<State> =>
  (await page.request.get('/api/e2e-test/outbox')).json();

async function submitFromWidget(page: Page, key: string, message: string) {
  await page.goto(`/e2e-host?key=${key}`);
  await page.locator('[data-dymcode] .dc-trigger').click();
  await expect(page.locator('.dc-thumb')).toHaveAttribute('data-state', /ready|unavailable/, {
    timeout: 15_000,
  });
  await page.locator('.dc-message').fill(message);
  await page.waitForTimeout(2100); // bot guard
  await page.locator('.dc-send').click();
}

test.beforeEach(async ({ page }) => {
  await page.request.delete('/api/e2e-test/outbox');
});

test('a widget submission reaches Telegram and Discord with the screenshot', async ({ page }) => {
  await submitFromWidget(page, 'pk_E2eE2eE2eE2e1234', 'E2E: checkout is broken');
  await expect(page.locator('.dc-thanks')).toBeVisible();
  await expect.poll(async () => (await state(page)).outbox.length, { timeout: 15_000 }).toBe(2);
  const { outbox, feedback } = await state(page);

  const telegram = outbox.find((entry) => entry.url.includes('api.telegram.org'))!;
  expect(telegram.url).toMatch(/\/sendPhoto$/);
  expect(telegram.body.fields.chat_id).toBe('424242');
  expect(telegram.body.fields.caption).toContain('E2E: checkout is broken');
  expect(telegram.body.files.photo.size).toBeGreaterThan(1000);

  const discord = outbox.find((entry) =>
    entry.url.startsWith('https://discord.com/api/webhooks/1/e2e'),
  )!;
  expect(JSON.parse(discord.body.fields.payload_json).embeds[0].description).toContain(
    'E2E: checkout is broken',
  );
  expect(discord.body.files['files[0]'].size).toBeGreaterThan(1000);

  const row = feedback.find((f) => f.message === 'E2E: checkout is broken')!;
  expect(row.over_quota).toBe(false);
  expect(row.screenshot_path).toMatch(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(webp|jpg)$/);
});

test('the 21st Free submission is hidden and triggers one quota notice per channel', async ({
  page,
}) => {
  await page.request.post('/api/e2e-test/usage', { data: { count: 20 } });
  await submitFromWidget(page, 'pk_E2eE2eE2eE2e1234', 'E2E: over the limit');
  await expect(page.locator('.dc-thanks')).toBeVisible();
  await expect.poll(async () => (await state(page)).outbox.length, { timeout: 15_000 }).toBe(2);
  const { outbox, feedback } = await state(page);
  for (const entry of outbox) {
    expect(JSON.stringify(entry.body)).toContain('free limit of 20 submissions');
    expect(entry.url).not.toMatch(/sendPhoto/);
  }
  expect(feedback.find((f) => f.message === 'E2E: over the limit')!.over_quota).toBe(true);
});

test('a disallowed origin is rejected and nothing is sent', async ({ page }) => {
  await submitFromWidget(page, 'pk_E2eE2eE2eOrig567', 'E2E: wrong origin');
  await expect(page.locator('.dc-status')).toHaveText("Couldn't send. Try again later.");
  await page.waitForTimeout(1000);
  const { outbox, feedback } = await state(page);
  expect(outbox).toEqual([]);
  expect(feedback.find((f) => f.message === 'E2E: wrong origin')).toBeUndefined();
});
