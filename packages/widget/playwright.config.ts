import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:5173' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // `--configLoader runner` is required: the default bundle loader fails on @bugping/shared.
    command: 'pnpm build && pnpm exec vite --configLoader runner --config vite.dev.config.ts',
    url: 'http://localhost:5173/dev/built.html',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
