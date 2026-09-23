import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  workers: 1,
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm --filter @bugping/widget build && node scripts/copy-widget.mjs && pnpm exec next dev --port ${PORT}`,
    url: `http://localhost:${PORT}/e2e-host`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // Fake values only: test mode never talks to Supabase, Telegram or Discord.
    env: {
      BUGPING_TEST_MODE: '1',
      NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'e2e-publishable-key-0000000000',
      SUPABASE_SERVICE_ROLE_KEY: 'e2e-service-role-key-000000',
      DATABASE_URL: 'postgresql://unused:unused@localhost:5432/unused',
      NEXT_PUBLIC_APP_URL: `http://localhost:${PORT}`,
      SECRETS_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
      IP_HASH_SALT: 'e2e-salt-0123456789abcdef',
      CRON_SECRET: 'e2e-cron-secret-0123456789',
      TELEGRAM_BOT_TOKEN: '123456:E2E_token',
      TELEGRAM_BOT_USERNAME: 'bugping_bot',
      TELEGRAM_WEBHOOK_SECRET: 'e2e-webhook-secret-0123',
      // Fake values only: test mode never talks to Paddle, the outbox fetch answers.
      PADDLE_API_KEY: 'pdl_sdbx_apikey_e2e0000000000000000',
      PADDLE_WEBHOOK_SECRET: 'pdl_ntfset_e2e000000000000',
      PADDLE_PRICE_MONTHLY: 'pri_e2emonthly0000000000',
      PADDLE_PRICE_LIFETIME: 'pri_e2elifetime000000000',
      NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: 'test_e2e0000000000000000',
      NEXT_PUBLIC_PADDLE_ENV: 'sandbox',
    },
  },
});
