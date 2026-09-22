# Phase 3: Public API, Notifications, Capture Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- Make widget screenshots viewport-accurate.
- Stand up `apps/web` (`@dymcode/web`) with the public widget API (`config`, `submit`), Telegram/Discord
  notifications, the shared-bot webhook and the screenshot-retention cron.
- Cover it all with PGlite-backed tests and a full widget → API → notification E2E.

**Architecture:**
- **Routes and logic.** Next.js App Router route handlers are thin. They call use-case functions in
  `apps/web/lib/`, which receive injected dependencies (`db`, `storage`, `fetch`, `after`, `env`).
- **Production dependencies.** `db` is postgres.js through the Supabase transaction pooler; `storage` is supabase-js.
- **Test dependencies.** `db` is the phase-1 PGlite harness (`@dymcode/db-tests/harness`, one rolled-back
  transaction per test); `storage` and `fetch` are in-memory fakes.
- **E2E.** Runs `next dev` in a test mode that boots an in-memory PGlite, seeds projects and records
  outbound notifications in an outbox.

**Tech Stack:** Next.js (App Router, Node runtime), React 19, postgres.js, @supabase/supabase-js, zod 4,
ua-parser-js 2, Vitest, PGlite, Playwright, modern-screenshot (widget).

**Spec:** `docs/superpowers/specs/2026-09-22-api-notifications-design.md`. Parents:
`docs/superpowers/specs/2026-09-21-dymcode-design.md` and `docs/superpowers/specs/2026-09-21-widget-design.md`.

## Global Constraints

- **Language and style:**
  - All code, comments, identifiers and docs are in English.
  - Run `pnpm format` before every commit.
  - Commit messages end with a blank line, then exactly `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Environment:**
  - Docker does not work on the dev machine: never run `supabase start` / `db:start` / `db:reset`.
  - DB tests run on PGlite by default and on real Supabase in CI (`DB_TEST_TARGET=supabase`).
  - Never print or commit secrets. `apps/web/.env.local` exists locally, holds real keys, and is git-ignored.
    Tests and E2E must not read it.
- **API behaviour:**
  - All API routes: `export const runtime = 'nodejs'` and `export const dynamic = 'force-dynamic'`.
  - Unexpected errors return 500 `{ error: 'internal' }` with details only in the server log.
    Client IPs are stored only as `sha256(ip + IP_HASH_SALT)` inside the rate-limit key.
- **Limits:**
  - body > 2.5MB → 413;
  - screenshot ≤ `SCREENSHOT_MAX_BYTES` and a type in `SCREENSHOT_MIME_TYPES`;
  - rate limit 5 per 60 s per project key + IP hash;
  - Free quota 20 submissions per month;
  - bot guard: honeypot or `elapsedMs < 2000` → 200 `{ id: null }`.
- **Notifications:**
  - 5 s timeout per outbound call; one retry on 429/5xx, waiting `min(retry_after, 3)` s;
  - Telegram 401/403/404 or "chat not found", and Discord 401/404 → disable the integration;
  - `telegram_custom` is used only when the owner is Pro.
- **Retention:** Free screenshots 30 days, Pro 365 days; batches of 200; 25 s budget per run.
- **Shared constants:** `SCREENSHOT_MAX_BYTES`, `SCREENSHOT_MIME_TYPES`, `PUBLIC_KEY_PATTERN`,
  `FEEDBACK_TYPES`, `WIDGET_LOCALES`, `buildBadgeUrl`, the zod schemas and `FeedbackMetadata` come from `@dymcode/shared`.
- **Widget bundle:** `packages/widget` `dist/widget.js` must stay ≤ 20KB gzip and `check:bundle` green.
- **Test mode:** `DYMCODE_TEST_MODE=1` must throw at startup when `NODE_ENV === 'production'`.

## File Map

| Path | Responsibility |
|---|---|
| `packages/widget/src/screenshot.ts` | Viewport-sized render, page background, `pageBackground()` |
| `packages/widget/dev/scrolled.html`, `dev/transparent.html`, `e2e/widget.spec.ts` | Capture E2E fixtures and tests |
| `supabase/tests/src/harness.ts`, `supabase/tests/package.json` | Reusable harness export `@dymcode/db-tests/harness` |
| `apps/web/package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `test/setup.ts` | Package setup |
| `apps/web/app/layout.tsx`, `app/page.tsx` | Placeholder landing |
| `apps/web/lib/env.ts` | Zod-validated env (`getEnv`, `parseEnv`) |
| `apps/web/lib/db/types.ts`, `lib/db/postgres.ts` | `Db` port + postgres.js implementation |
| `apps/web/lib/http.ts` | CORS headers, preflight, JSON responses, client IP |
| `apps/web/lib/crypto.ts` | `encryptSecret` / `decryptSecret` |
| `apps/web/lib/storage.ts` | `Storage` port, memory + Supabase implementations |
| `apps/web/lib/billing/plans.ts` | `ENTITLEMENTS` (tier limits) |
| `apps/web/lib/widget/project.ts` | `loadProjectByKey` |
| `apps/web/lib/widget/config.ts` | `toWidgetConfig`, `handleConfig` |
| `apps/web/lib/widget/submit.ts` | `handleSubmit` |
| `apps/web/lib/notify/types.ts`, `format.ts`, `telegram.ts`, `discord.ts`, `dispatch.ts` | Notifications |
| `apps/web/lib/telegram/webhook.ts` | `handleTelegramWebhook` |
| `apps/web/lib/retention.ts` | `runRetention`, `handleRetention` |
| `apps/web/lib/deps.ts` | Production (and later test-mode) dependency wiring |
| `apps/web/lib/test-mode.ts` | In-memory deps for E2E |
| `apps/web/app/api/**/route.ts` | Route handlers |
| `apps/web/scripts/copy-widget.mjs`, `scripts/set-telegram-webhook.mjs` | Tooling |
| `apps/web/vercel.json` | Cron schedule |
| `apps/web/public/__test/host.html`, `playwright.config.ts`, `e2e/api.spec.ts` | E2E |
| `turbo.json`, `.gitignore`, `.github/workflows/ci.yml`, `README.md` | Repo wiring |

---

### Task 1: Widget capture hardening

**Files:**
- Modify: `packages/widget/src/screenshot.ts`, `packages/widget/src/screenshot.test.ts`, `packages/widget/e2e/widget.spec.ts`
- Create: `packages/widget/dev/scrolled.html`, `packages/widget/dev/transparent.html`

**Interfaces:**
- Produces:
  - `export function pageBackground(): string`: the first non-transparent computed background of `body`, then `html`, else `'#ffffff'`;
  - `capture(exclude)` keeps its signature but renders only the viewport.

- [ ] **Step 1: Write the failing unit test for `pageBackground`**

Append to `packages/widget/src/screenshot.test.ts`:
```ts
import { afterEach as afterEachBg, describe as describeBg, expect as expectBg, it as itBg } from 'vitest';
import { pageBackground } from './screenshot';

describeBg('pageBackground', () => {
  afterEachBg(() => {
    document.body.style.background = '';
    document.documentElement.style.background = '';
  });

  itBg('uses the body background when set', () => {
    document.body.style.background = 'rgb(10, 20, 30)';
    expectBg(pageBackground()).toBe('rgb(10, 20, 30)');
  });

  itBg('falls back to the html background', () => {
    document.documentElement.style.background = 'rgb(1, 2, 3)';
    expectBg(pageBackground()).toBe('rgb(1, 2, 3)');
  });

  itBg('falls back to white when both are transparent', () => {
    expectBg(pageBackground()).toBe('#ffffff');
  });
});
```
(If the file already imports `describe/it/expect/afterEach` from vitest at the top, reuse those names instead of the aliases.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @dymcode/widget test`
Expected: FAIL with "pageBackground is not a function" (or a missing export).

- [ ] **Step 3: Implement the viewport-sized capture**

In `packages/widget/src/screenshot.ts`, add after `maskClonedNode`:
```ts
const TRANSPARENT = /^(transparent|rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\))$/;

/** The color a viewer should see behind the page: body, then html, else white. */
export function pageBackground(): string {
  for (const el of [document.body, document.documentElement]) {
    if (!el) continue;
    const color = getComputedStyle(el).backgroundColor;
    if (color && !TRANSPARENT.test(color.trim())) return color;
  }
  return '#ffffff';
}
```
Replace the body of `capture` with:
```ts
export async function capture(exclude: Element): Promise<Blob | null> {
  try {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const scale = Math.min(1, MAX_WIDTH / w);
    // Render only the viewport. Offsetting the cloned root with margins (not transform) keeps
    // position:fixed elements laid out against the viewport, where the user sees them.
    const canvas = await domToCanvas(document.documentElement, {
      width: w,
      height: h,
      scale,
      backgroundColor: pageBackground(),
      timeout: RESOURCE_TIMEOUT_MS,
      maximumCanvasSize: 4096,
      filter: (node) => node !== exclude,
      onCloneEachNode: maskClonedNode,
      style: { marginTop: `${-window.scrollY}px`, marginLeft: `${-window.scrollX}px` },
    });
    let blob = await toBlob(canvas, 'image/webp', 0.7);
    if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', 0.8);
    return blob && blob.size <= SCREENSHOT_MAX_BYTES ? blob : null;
  } catch {
    return null;
  }
}
```
Check the installed modern-screenshot `.d.ts` for `width`, `height`, `backgroundColor`, `maximumCanvasSize` and `style`. If a name differs, use the installed equivalent and note it in the report.

- [ ] **Step 4: Run unit tests**

Run: `pnpm --filter @dymcode/widget test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Add E2E fixtures**

`packages/widget/dev/scrolled.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Dymcode widget – scrolled page</title>
  </head>
  <body style="margin: 0; height: 6000px; background: #ffffff">
    <header
      style="position: fixed; top: 0; left: 0; right: 0; height: 60px; background: #ff00aa"
    ></header>
    <div
      id="marker"
      style="position: absolute; top: 2400px; left: 0; width: 100%; height: 200px; background: #00aaff"
    ></div>
    <script async src="/widget.js" data-project-id="pk_DevDevDevDev1234"></script>
  </body>
</html>
```

`packages/widget/dev/transparent.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Dymcode widget – no background</title>
  </head>
  <body style="margin: 0">
    <p style="margin: 40px; font: 16px sans-serif">A page without any background color.</p>
    <script async src="/widget.js" data-project-id="pk_DevDevDevDev1234"></script>
  </body>
</html>
```

- [ ] **Step 6: Write the E2E tests**

Append to `packages/widget/e2e/widget.spec.ts`:
```ts
type Rgb = [number, number, number];

const near = (actual: number[], expected: Rgb, tolerance = 16) =>
  actual.every((value, i) => Math.abs(value - expected[i]!) <= tolerance);

/** Submits feedback from the current page and returns sampled screenshot pixels. */
async function submitAndSample(
  page: import('@playwright/test').Page,
  points: Array<[number, number]>,
) {
  await page.locator('.dc-trigger').click();
  await expect(page.locator('.dc-thumb')).toHaveAttribute('data-state', 'ready', { timeout: 15_000 });
  await page.locator('.dc-message').fill('Capture check');
  await page.waitForTimeout(2100);
  await page.locator('.dc-send').click();
  await expect(page.locator('.dc-thanks')).toBeVisible();
  // points are fractions of the image size; pixels are composited over #123456 so transparency shows.
  return page.evaluate(async (pts) => {
    const res = await fetch('/__mock/last-screenshot');
    const bitmap = await createImageBitmap(await res.blob());
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#123456';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
    return {
      width: bitmap.width,
      height: bitmap.height,
      pixels: pts.map(([fx, fy]) =>
        Array.from(
          ctx
            .getImageData(Math.floor(fx * (bitmap.width - 1)), Math.floor(fy * (bitmap.height - 1)), 1, 1)
            .data.slice(0, 3),
        ),
      ),
    };
  }, points);
}

test('captures exactly the viewport of a scrolled page, including fixed elements', async ({ page }) => {
  await page.goto('/dev/scrolled.html');
  await expect(page.locator('[data-dymcode] .dc-trigger')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 2000));
  const viewport = page.viewportSize()!;
  const shot = await submitAndSample(page, [
    [0.5, 30 / viewport.height], // fixed header
    [0.25, 500 / viewport.height], // marker: document 2400px - scroll 2000px = viewport 400..600px
    [0.25, 250 / viewport.height], // plain white page
  ]);
  expect(Math.abs(shot.width / shot.height - viewport.width / viewport.height)).toBeLessThan(0.02);
  const [header, marker, white] = shot.pixels;
  expect(near(header!, [255, 0, 170])).toBe(true);
  expect(near(marker!, [0, 170, 255])).toBe(true);
  expect(near(white!, [255, 255, 255])).toBe(true);
});

test('fills a white background when the page has none', async ({ page }) => {
  await page.goto('/dev/transparent.html');
  await expect(page.locator('[data-dymcode] .dc-trigger')).toBeVisible();
  const shot = await submitAndSample(page, [[0.3, 0.8]]);
  expect(near(shot.pixels[0]!, [255, 255, 255])).toBe(true);
});
```

- [ ] **Step 7: Run the E2E suite**

Run: `pnpm --filter @dymcode/widget e2e`
Expected: all 5 tests pass (3 existing + 2 new). This includes the existing mask pixel check.

If the scrolled-page test fails (header or marker in the wrong place), **do not relax the assertions and
do not guess**. Save the captured image (`page.request.get('/__mock/last-screenshot')` → write to
`test-results/scrolled.webp`), stop, and report NEEDS_CONTEXT with the observed pixel values. The spec's
fallback approach will then be designed with that evidence.

- [ ] **Step 8: Verify size and commit**

Run: `pnpm --filter @dymcode/widget build && pnpm --filter @dymcode/widget size && pnpm --filter @dymcode/widget check:bundle`
Expected: pass.
```bash
pnpm format
git add packages/widget
git commit -m "fix(widget): capture exactly the viewport with a real background"
```

---

### Task 2: `apps/web` scaffold, env, DB port, HTTP helpers, harness export

**Files:**
- Modify: `supabase/tests/package.json`, `supabase/tests/src/db.ts`, `turbo.json`, `.gitignore`
- Create: `supabase/tests/src/harness.ts`
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.ts`, `apps/web/vitest.config.ts`, `apps/web/test/setup.ts`, `apps/web/app/layout.tsx`, `apps/web/app/page.tsx`, `apps/web/scripts/copy-widget.mjs`
- Create: `apps/web/lib/env.ts`, `apps/web/lib/db/types.ts`, `apps/web/lib/db/postgres.ts`, `apps/web/lib/http.ts`
- Test: `apps/web/lib/env.test.ts`, `apps/web/lib/http.test.ts`, `apps/web/lib/db/harness.test.ts`, fixtures `apps/web/test/fixtures.ts`

**Interfaces:**
- Produces:
  ```ts
  // @dymcode/db-tests/harness
  export { connect, disconnect, withTx, createPgliteDb, type Db as TestDb } from './db';
  export { createUser, createProject, createFeedback, grantPro } from './fixtures';
  // createPgliteDb(): Promise<{ query<T>(sql, params?): Promise<T[]>; close(): Promise<void> }>
  // apps/web/lib/db/types.ts
  type Row = Record<string, unknown>;
  interface Db { query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]> }
  // apps/web/lib/db/postgres.ts
  function createPostgresDb(url: string): Db;
  // apps/web/lib/env.ts
  type Env = { NEXT_PUBLIC_SUPABASE_URL; SUPABASE_SERVICE_ROLE_KEY; DATABASE_URL; NEXT_PUBLIC_APP_URL;
    SECRETS_ENCRYPTION_KEY; IP_HASH_SALT; CRON_SECRET; TELEGRAM_BOT_TOKEN; TELEGRAM_BOT_USERNAME;
    TELEGRAM_WEBHOOK_SECRET; DYMCODE_TEST_MODE?: '0' | '1' } // all strings
  function parseEnv(source: Record<string, string | undefined>): Env; // throws listing names only
  function getEnv(): Env; // cached parseEnv(process.env)
  // apps/web/lib/http.ts
  function corsHeaders(origin: string | null): Record<string, string>;
  function preflight(request: Request): Response;
  function json(body: unknown, status: number, headers?: Record<string, string>): Response;
  function clientIp(headers: Headers): string;
  ```
- Import alias: `@/*` → `apps/web/*` (tsconfig `paths` + Vitest `resolve.alias`).

- [ ] **Step 1: Export the DB harness**

In `supabase/tests/src/db.ts`, directly below the `openPglite` function, add:
```ts
/** Standalone in-process database with migrations applied (used by apps/web test tooling). */
export const createPgliteDb = openPglite;
```
`supabase/tests/src/harness.ts`:
```ts
// Public test harness for other workspace packages (apps/web tests).
export { connect, disconnect, withTx, createPgliteDb, type Db as TestDb } from './db';
export { createUser, createProject, createFeedback, grantPro } from './fixtures';
```
In `supabase/tests/package.json`, add at top level:
```json
  "exports": {
    "./harness": "./src/harness.ts"
  },
```

- [ ] **Step 2: Create the package**

`apps/web/package.json`:
```json
{
  "name": "@dymcode/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "copy-widget": "node scripts/copy-widget.mjs",
    "dev": "pnpm --filter @dymcode/widget build && pnpm copy-widget && next dev",
    "build": "pnpm copy-widget && next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```
Run:
```bash
pnpm --filter @dymcode/web add next react react-dom postgres @supabase/supabase-js zod ua-parser-js "@dymcode/shared@workspace:*"
pnpm --filter @dymcode/web add -D typescript @types/node@^24 @types/react @types/react-dom vitest "@dymcode/db-tests@workspace:*" "@dymcode/widget@workspace:*"
```

`apps/web/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "jsx": "preserve",
    "types": ["node"],
    "incremental": true,
    "paths": { "@/*": ["./*"] },
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", ".next", "public"]
}
```

`apps/web/next.config.ts`:
```ts
import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@dymcode/shared'],
  serverExternalPackages: ['@electric-sql/pglite'],
  // `pnpm typecheck` (tsc) is the type gate; Next's built-in checker may not support TS 7.
  typescript: { ignoreBuildErrors: true },
  async headers() {
    return [
      {
        source: '/w/widget.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=300, s-maxage=3600' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
        ],
      },
      {
        // Loaded with import() from host pages: module fetches are CORS requests.
        source: '/w/screenshot.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
        ],
      },
    ];
  },
};

export default config;
```

`apps/web/vitest.config.ts`:
```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: {
    include: ['lib/**/*.test.ts', 'app/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    // One database per file; sequential files keep the real-Supabase target free of lock contention.
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 60_000,
  },
});
```

`apps/web/test/setup.ts`:
```ts
import { connect, disconnect } from '@dymcode/db-tests/harness';
import { afterAll, beforeAll } from 'vitest';

beforeAll(connect);
afterAll(disconnect);
```

`apps/web/app/layout.tsx`:
```tsx
import type { ReactNode } from 'react';

export const metadata = { title: 'Dymcode' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

`apps/web/app/page.tsx`:
```tsx
export default function Home() {
  return (
    <main>
      <h1>Dymcode</h1>
      <p>Lightweight feedback and bug reports, delivered to Telegram and Discord.</p>
    </main>
  );
}
```

`apps/web/scripts/copy-widget.mjs`:
```js
// Copies the built widget into public/w/ so it is served from the same origin as the API.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';

const src = new URL('../../../packages/widget/dist/', import.meta.url);
const dest = new URL('../public/w/', import.meta.url);

if (!existsSync(new URL('widget.js', src))) {
  console.error('packages/widget/dist/widget.js not found. Run: pnpm --filter @dymcode/widget build');
  process.exit(1);
}
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
for (const file of ['widget.js', 'screenshot.js']) cpSync(new URL(file, src), new URL(file, dest));
console.log('Copied widget.js and screenshot.js into apps/web/public/w/');
```

Append to `.gitignore`:
```
.next/
apps/web/public/w/
```

Replace `turbo.json` with:
```json
{
  "$schema": "https://turborepo.com/schema.json",
  "tasks": {
    "typecheck": { "dependsOn": ["^typecheck"] },
    "test": { "dependsOn": ["^typecheck"] },
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".next/**", "!.next/cache/**"] },
    "@dymcode/db-tests#test": {
      "dependsOn": ["^typecheck"],
      "cache": false,
      "passThroughEnv": ["DB_TEST_TARGET", "DATABASE_URL"]
    },
    "@dymcode/web#test": {
      "dependsOn": ["^typecheck"],
      "cache": false,
      "passThroughEnv": ["DB_TEST_TARGET", "DATABASE_URL"]
    }
  }
}
```

- [ ] **Step 3: Write failing tests**

Shared test fixtures live outside `*.test.ts` files (importing a test file would register its tests twice).

`apps/web/test/fixtures.ts`:
```ts
/** A complete, valid set of fake environment variables for tests. */
export const VALID_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_0123456789abcdefghij',
  DATABASE_URL: 'postgresql://postgres.ref:pw@aws-0-eu-west-2.pooler.supabase.com:6543/postgres',
  NEXT_PUBLIC_APP_URL: 'https://dymcode.dev',
  SECRETS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  IP_HASH_SALT: '0123456789abcdef0123456789abcdef',
  CRON_SECRET: 'fedcba9876543210fedcba9876543210',
  TELEGRAM_BOT_TOKEN: '123456:ABC-def_ghi',
  TELEGRAM_BOT_USERNAME: 'dymcode_bot',
  TELEGRAM_WEBHOOK_SECRET: 'webhook-secret-0123456789',
};
```

`apps/web/lib/env.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { VALID_ENV } from '@/test/fixtures';
import { parseEnv } from './env';

describe('parseEnv', () => {
  it('accepts a complete environment', () => {
    expect(parseEnv(VALID_ENV).TELEGRAM_BOT_USERNAME).toBe('dymcode_bot');
  });

  it('lists invalid variable names without leaking values', () => {
    const bad = { ...VALID_ENV, SECRETS_ENCRYPTION_KEY: 'c2hvcnQ=', TELEGRAM_BOT_TOKEN: undefined };
    expect(() => parseEnv(bad)).toThrow(/SECRETS_ENCRYPTION_KEY/);
    expect(() => parseEnv(bad)).toThrow(/TELEGRAM_BOT_TOKEN/);
    expect(() => parseEnv(bad)).not.toThrow(/c2hvcnQ=/);
  });

  it('accepts an optional test-mode flag', () => {
    expect(parseEnv({ ...VALID_ENV, DYMCODE_TEST_MODE: '1' }).DYMCODE_TEST_MODE).toBe('1');
    expect(() => parseEnv({ ...VALID_ENV, DYMCODE_TEST_MODE: 'yes' })).toThrow(/DYMCODE_TEST_MODE/);
  });
});
```

`apps/web/lib/http.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { clientIp, corsHeaders, json, preflight } from './http';

describe('http helpers', () => {
  it('reflects the origin in CORS headers', () => {
    expect(corsHeaders('https://host.example')).toEqual({
      'Access-Control-Allow-Origin': 'https://host.example',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
      Vary: 'Origin',
    });
    expect(corsHeaders(null)['Access-Control-Allow-Origin']).toBe('*');
  });

  it('answers preflight with 204 and CORS headers', () => {
    const res = preflight(new Request('https://x.dev/api', { method: 'OPTIONS', headers: { origin: 'https://a.io' } }));
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://a.io');
  });

  it('builds JSON responses', async () => {
    const res = json({ ok: 1 }, 201, { 'X-Test': 'y' });
    expect(res.status).toBe(201);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(res.headers.get('x-test')).toBe('y');
    expect(await res.json()).toEqual({ ok: 1 });
  });

  it('takes the first x-forwarded-for address', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe('203.0.113.7');
    expect(clientIp(new Headers({ 'x-real-ip': '198.51.100.2' }))).toBe('198.51.100.2');
    expect(clientIp(new Headers())).toBe('unknown');
  });
});
```

`apps/web/lib/db/harness.test.ts`:
```ts
import { withTx } from '@dymcode/db-tests/harness';
import { describe, expect, it } from 'vitest';
import type { Db } from './types';

describe('test harness', () => {
  it('provides a Db-compatible connection with migrations applied', () =>
    withTx(async (harnessDb) => {
      const db: Db = harnessDb;
      const rows = await db.query<{ n: number }>('select count(*)::int as n from public.projects');
      expect(rows).toEqual([{ n: 0 }]);
    }));
});
```

- [ ] **Step 4: Run to verify they fail**

Run: `pnpm --filter @dymcode/web test`
Expected: FAIL with unresolved imports `./env`, `./http`, `./types`.

- [ ] **Step 5: Implement**

`apps/web/lib/env.ts`:
```ts
import { z } from 'zod';

const EnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//),
  NEXT_PUBLIC_APP_URL: z.url(),
  SECRETS_ENCRYPTION_KEY: z
    .string()
    .refine((value) => Buffer.from(value, 'base64').length === 32, 'must be 32 bytes, base64'),
  IP_HASH_SALT: z.string().min(16),
  CRON_SECRET: z.string().min(16),
  TELEGRAM_BOT_TOKEN: z.string().regex(/^\d+:[\w-]+$/),
  TELEGRAM_BOT_USERNAME: z.string().regex(/^\w{5,32}$/),
  TELEGRAM_WEBHOOK_SECRET: z.string().regex(/^[\w-]{16,256}$/),
  DYMCODE_TEST_MODE: z.enum(['0', '1']).optional(),
});

export type Env = z.infer<typeof EnvSchema>;

/** Validates the environment. Errors name the variables but never echo their values. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
    throw new Error(`Invalid environment variables: ${names.join(', ')}`);
  }
  return result.data;
}

let cached: Env | undefined;

export function getEnv(): Env {
  return (cached ??= parseEnv(process.env));
}
```

`apps/web/lib/db/types.ts`:
```ts
export type Row = Record<string, unknown>;

/** The only database surface use cases depend on: parameterized SQL returning rows. */
export interface Db {
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]>;
}
```

`apps/web/lib/db/postgres.ts`:
```ts
import postgres from 'postgres';
import type { Db, Row } from './types';

/** postgres.js through the Supabase transaction pooler (no prepared statements). */
export function createPostgresDb(url: string): Db {
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const sql = postgres(url, {
    prepare: false,
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: local ? false : 'require',
  });
  return {
    async query<T extends Row>(text: string, params: unknown[] = []) {
      const rows = await sql.unsafe(text, params as never[]);
      return rows as unknown as T[];
    },
  };
}
```

`apps/web/lib/http.ts`:
```ts
export function corsHeaders(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    Vary: 'Origin',
  };
}

export function preflight(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) });
}

export function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

/** First hop of x-forwarded-for (set by Vercel), then x-real-ip. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || headers.get('x-real-ip')?.trim() || 'unknown';
}
```

- [ ] **Step 6: Verify**

Run: `pnpm --filter @dymcode/web test && pnpm typecheck && pnpm test`
Expected: PASS.
Run: `pnpm --filter @dymcode/widget build && pnpm --filter @dymcode/web build`
Expected: the widget is copied into `public/w/` and `next build` succeeds. It must not need env vars:
nothing reads `getEnv()` at build time.

- [ ] **Step 7: Commit**

```bash
pnpm format
git add apps/web supabase/tests turbo.json .gitignore pnpm-lock.yaml
git commit -m "feat(web): scaffold Next.js app with env, DB port and HTTP helpers"
```

---

### Task 3: Secret encryption and Storage port

**Files:**
- Create: `apps/web/lib/crypto.ts`, `apps/web/lib/storage.ts`
- Test: `apps/web/lib/crypto.test.ts`, `apps/web/lib/storage.test.ts`

**Interfaces:**
- Produces:
  ```ts
  function encryptSecret(plain: string, base64Key: string): string; // "v1:<iv>:<ct>:<tag>" base64url parts
  function decryptSecret(token: string, base64Key: string): string; // throws on bad version/format/key/tamper
  interface Storage {
    upload(path: string, data: Uint8Array, contentType: string): Promise<void>; // throws on failure
    download(path: string): Promise<{ data: Uint8Array; contentType: string } | null>;
    remove(paths: string[]): Promise<string[]>; // paths actually removed; throws on failure
  }
  const SCREENSHOT_BUCKET = 'screenshots';
  interface MemoryStorage extends Storage { files: Map<string, { data: Uint8Array; contentType: string }>;
    failUploads: boolean; failRemovals: Set<string> }
  function createMemoryStorage(): MemoryStorage;
  function createSupabaseStorage(url: string, secretKey: string): Storage;
  ```

- [ ] **Step 1: Write failing tests**

`apps/web/lib/crypto.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from './crypto';

const KEY = Buffer.alloc(32, 1).toString('base64');
const OTHER_KEY = Buffer.alloc(32, 2).toString('base64');

describe('secret encryption', () => {
  it('round-trips and uses the v1 format with a fresh IV', () => {
    const a = encryptSecret('https://discord.com/api/webhooks/1/abc', KEY);
    const b = encryptSecret('https://discord.com/api/webhooks/1/abc', KEY);
    expect(a).toMatch(/^v1:[\w-]+:[\w-]+:[\w-]+$/);
    expect(a).not.toBe(b);
    expect(decryptSecret(a, KEY)).toBe('https://discord.com/api/webhooks/1/abc');
  });

  it('rejects a wrong key', () => {
    expect(() => decryptSecret(encryptSecret('x', KEY), OTHER_KEY)).toThrow();
  });

  it('rejects tampered ciphertext or tag', () => {
    const [v, iv, ct, tag] = encryptSecret('secret-token', KEY).split(':') as [string, string, string, string];
    const flip = (s: string) => (s[0] === 'A' ? 'B' : 'A') + s.slice(1);
    expect(() => decryptSecret([v, iv, flip(ct), tag].join(':'), KEY)).toThrow();
    expect(() => decryptSecret([v, iv, ct, flip(tag)].join(':'), KEY)).toThrow();
  });

  it('rejects unknown versions and malformed tokens', () => {
    const token = encryptSecret('x', KEY);
    expect(() => decryptSecret(token.replace(/^v1/, 'v2'), KEY)).toThrow(/format/);
    expect(() => decryptSecret('garbage', KEY)).toThrow(/format/);
  });

  it('requires a 32-byte key', () => {
    expect(() => encryptSecret('x', Buffer.alloc(16).toString('base64'))).toThrow(/32 bytes/);
  });
});
```

`apps/web/lib/storage.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createMemoryStorage } from './storage';

describe('memory storage', () => {
  it('uploads, downloads and removes files', async () => {
    const storage = createMemoryStorage();
    await storage.upload('p/1.webp', new Uint8Array([1, 2]), 'image/webp');
    expect(await storage.download('p/1.webp')).toEqual({ data: new Uint8Array([1, 2]), contentType: 'image/webp' });
    expect(await storage.remove(['p/1.webp', 'p/missing.webp'])).toEqual(['p/1.webp']);
    expect(await storage.download('p/1.webp')).toBeNull();
  });

  it('can simulate failures', async () => {
    const storage = createMemoryStorage();
    storage.failUploads = true;
    await expect(storage.upload('a', new Uint8Array(), 'image/png')).rejects.toThrow();
    storage.failUploads = false;
    await storage.upload('a', new Uint8Array(), 'image/png');
    await storage.upload('b', new Uint8Array(), 'image/png');
    storage.failRemovals.add('b');
    expect(await storage.remove(['a', 'b'])).toEqual(['a']);
    expect(storage.files.has('b')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @dymcode/web test`
Expected: FAIL with unresolved `./crypto`, `./storage`.

- [ ] **Step 3: Implement**

`apps/web/lib/crypto.ts`:
```ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;

function keyFrom(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== 32) throw new Error('SECRETS_ENCRYPTION_KEY must be 32 bytes');
  return key;
}

/** AES-256-GCM. Format: v1:<iv>:<ciphertext>:<tag>, each part base64url. */
export function encryptSecret(plain: string, base64Key: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(base64Key), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [VERSION, iv, ciphertext, cipher.getAuthTag()]
    .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
    .join(':');
}

export function decryptSecret(token: string, base64Key: string): string {
  const parts = token.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) throw new Error('Unsupported secret format');
  const iv = Buffer.from(parts[1]!, 'base64url');
  const ciphertext = Buffer.from(parts[2]!, 'base64url');
  const tag = Buffer.from(parts[3]!, 'base64url');
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new Error('Unsupported secret format');
  const decipher = createDecipheriv('aes-256-gcm', keyFrom(base64Key), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
```

`apps/web/lib/storage.ts`:
```ts
import { createClient } from '@supabase/supabase-js';

export const SCREENSHOT_BUCKET = 'screenshots';

export interface StoredFile {
  data: Uint8Array;
  contentType: string;
}

export interface Storage {
  /** Throws on failure. */
  upload(path: string, data: Uint8Array, contentType: string): Promise<void>;
  download(path: string): Promise<StoredFile | null>;
  /** Returns the paths that were actually removed. Throws if the request itself fails. */
  remove(paths: string[]): Promise<string[]>;
}

export interface MemoryStorage extends Storage {
  files: Map<string, StoredFile>;
  failUploads: boolean;
  failRemovals: Set<string>;
}

export function createMemoryStorage(): MemoryStorage {
  const storage: MemoryStorage = {
    files: new Map(),
    failUploads: false,
    failRemovals: new Set(),
    async upload(path, data, contentType) {
      if (storage.failUploads) throw new Error('memory storage: upload failed');
      storage.files.set(path, { data, contentType });
    },
    async download(path) {
      return storage.files.get(path) ?? null;
    },
    async remove(paths) {
      const removed: string[] = [];
      for (const path of paths) {
        if (storage.failRemovals.has(path) || !storage.files.has(path)) continue;
        storage.files.delete(path);
        removed.push(path);
      }
      return removed;
    },
  };
  return storage;
}

export function createSupabaseStorage(url: string, secretKey: string): Storage {
  const bucket = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage.from(SCREENSHOT_BUCKET);
  return {
    async upload(path, data, contentType) {
      const { error } = await bucket.upload(path, data, { contentType, upsert: false });
      if (error) throw new Error(`storage upload failed: ${error.message}`);
    },
    async download(path) {
      const { data, error } = await bucket.download(path);
      if (error || !data) return null;
      return { data: new Uint8Array(await data.arrayBuffer()), contentType: data.type };
    },
    async remove(paths) {
      if (paths.length === 0) return [];
      const { data, error } = await bucket.remove(paths);
      if (error) throw new Error(`storage remove failed: ${error.message}`);
      return (data ?? []).map((object) => object.name);
    },
  };
}
```
(`createSupabaseStorage` is exercised in production only; it must typecheck. If the installed
supabase-js types differ, e.g. `remove` result shape, adapt and note it.)

- [ ] **Step 4: Verify and commit**

Run: `pnpm --filter @dymcode/web test && pnpm typecheck`
Expected: PASS.
```bash
pnpm format
git add apps/web
git commit -m "feat(web): add secret encryption and storage port"
```

---

### Task 4: Widget config endpoint

**Files:**
- Create: `apps/web/lib/widget/project.ts`, `apps/web/lib/widget/config.ts`, `apps/web/lib/deps.ts`, `apps/web/app/api/v1/widget/config/route.ts`
- Test: `apps/web/lib/widget/config.test.ts`

**Interfaces:**
- Consumes: `Db` (Task 2), `corsHeaders`, `json`, `preflight` (Task 2), `Storage`, `createSupabaseStorage` (Task 3), `getEnv`, `Env` (Task 2), `createPostgresDb` (Task 2).
- Produces:
  ```ts
  interface ProjectRow { id: string; owner_id: string; name: string; public_key: string; allowed_origins: string[];
    primary_color: string; trigger_text: string; position: WidgetPosition; hide_badge: boolean;
    custom_css: string | null; locale: WidgetLocale; pro: boolean }
  function loadProjectByKey(db: Db, key: string): Promise<ProjectRow | null>;
  function toWidgetConfig(project: ProjectRow): WidgetConfig;
  function handleConfig(deps: { db: Db }, request: Request): Promise<Response>;
  interface AppDeps { db: Db; storage: Storage; env: Env; fetch: typeof fetch; after: (task: () => Promise<void>) => void }
  function getDeps(): Promise<AppDeps>;
  ```

- [ ] **Step 1: Write failing tests**

`apps/web/lib/widget/config.test.ts`:
```ts
import { createProject, createUser, grantPro, withTx, type TestDb } from '@dymcode/db-tests/harness';
import { WidgetConfigSchema } from '@dymcode/shared';
import { describe, expect, it } from 'vitest';
import { handleConfig } from './config';

const get = (db: TestDb, key: string) =>
  handleConfig(
    { db },
    new Request(`https://dymcode.dev/api/v1/widget/config?key=${key}`, {
      headers: { origin: 'https://host.example' },
    }),
  );

async function projectWithSettings(db: TestDb, pro: boolean) {
  const owner = await createUser(db);
  if (pro) await grantPro(db, owner);
  const project = await createProject(db, owner, 'Acme');
  await db.query(
    `update public.projects set hide_badge = true, custom_css = '.dc-trigger{border-radius:0}',
       locale = 'uk', primary_color = '#ff0066', trigger_text = 'Help' where id = $1`,
    [project.id],
  );
  return project;
}

describe('handleConfig', () => {
  it('returns 404 for malformed and unknown keys', () =>
    withTx(async (db) => {
      expect((await get(db, 'nope')).status).toBe(404);
      expect((await get(db, 'pk_AbCdEfGh12345678')).status).toBe(404);
    }));

  it('ignores Pro-only settings for Free owners', () =>
    withTx(async (db) => {
      const project = await projectWithSettings(db, false);
      const res = await get(db, project.public_key);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(WidgetConfigSchema.safeParse(body).success).toBe(true);
      expect(body).toEqual({
        primaryColor: '#ff0066',
        triggerText: 'Help',
        position: 'bottom-right',
        showBadge: true,
        customCss: null,
        badgeUrl: `https://dymcode.dev/?ref=${project.public_key}&utm_source=widget`,
        locale: 'uk',
      });
    }));

  it('applies Pro-only settings for Pro owners', () =>
    withTx(async (db) => {
      const project = await projectWithSettings(db, true);
      const body = await (await get(db, project.public_key)).json();
      expect(body.showBadge).toBe(false);
      expect(body.customCss).toBe('.dc-trigger{border-radius:0}');
    }));

  it('sends cache and CORS headers', () =>
    withTx(async (db) => {
      const project = await projectWithSettings(db, false);
      const res = await get(db, project.public_key);
      expect(res.headers.get('cache-control')).toBe('public, s-maxage=60, stale-while-revalidate=300');
      expect(res.headers.get('access-control-allow-origin')).toBe('https://host.example');
    }));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @dymcode/web test`
Expected: FAIL with unresolved `./config`.

- [ ] **Step 3: Implement**

`apps/web/lib/widget/project.ts`:
```ts
import { PUBLIC_KEY_PATTERN, type WidgetLocale, type WidgetPosition } from '@dymcode/shared';
import type { Db } from '../db/types';

export interface ProjectRow {
  id: string;
  owner_id: string;
  name: string;
  public_key: string;
  allowed_origins: string[];
  primary_color: string;
  trigger_text: string;
  position: WidgetPosition;
  hide_badge: boolean;
  custom_css: string | null;
  locale: WidgetLocale;
  pro: boolean;
}

export async function loadProjectByKey(db: Db, key: string): Promise<ProjectRow | null> {
  if (!PUBLIC_KEY_PATTERN.test(key)) return null;
  const [row] = await db.query<ProjectRow>(
    `select id, owner_id, name, public_key, allowed_origins, primary_color, trigger_text,
            position::text as position, hide_badge, custom_css, locale::text as locale,
            public.is_pro(owner_id) as pro
     from public.projects where public_key = $1`,
    [key],
  );
  return row ?? null;
}
```

`apps/web/lib/widget/config.ts`:
```ts
import { buildBadgeUrl, type WidgetConfig } from '@dymcode/shared';
import type { Db } from '../db/types';
import { corsHeaders, json } from '../http';
import { loadProjectByKey, type ProjectRow } from './project';

export function toWidgetConfig(project: ProjectRow): WidgetConfig {
  return {
    primaryColor: project.primary_color,
    triggerText: project.trigger_text,
    position: project.position,
    showBadge: !(project.hide_badge && project.pro),
    customCss: project.pro ? project.custom_css : null,
    badgeUrl: buildBadgeUrl(project.public_key),
    locale: project.locale,
  };
}

export async function handleConfig(deps: { db: Db }, request: Request): Promise<Response> {
  const cors = corsHeaders(request.headers.get('origin'));
  try {
    const key = new URL(request.url).searchParams.get('key') ?? '';
    const project = await loadProjectByKey(deps.db, key);
    if (!project) return json({ error: 'unknown project' }, 404, cors);
    return json(toWidgetConfig(project), 200, {
      ...cors,
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    });
  } catch (error) {
    console.error('[widget/config]', error);
    return json({ error: 'internal' }, 500, cors);
  }
}
```

`apps/web/lib/deps.ts`:
```ts
import { after } from 'next/server';
import { createPostgresDb } from './db/postgres';
import type { Db } from './db/types';
import { getEnv, type Env } from './env';
import { createSupabaseStorage, type Storage } from './storage';

export interface AppDeps {
  db: Db;
  storage: Storage;
  env: Env;
  fetch: typeof fetch;
  /** Runs work after the response is sent (Next.js `after`). */
  after: (task: () => Promise<void>) => void;
}

let deps: Promise<AppDeps> | undefined;

export function getDeps(): Promise<AppDeps> {
  return (deps ??= buildDeps());
}

async function buildDeps(): Promise<AppDeps> {
  const env = getEnv();
  return {
    db: createPostgresDb(env.DATABASE_URL),
    storage: createSupabaseStorage(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
    env,
    fetch: globalThis.fetch.bind(globalThis),
    after: (task) => after(task),
  };
}
```

`apps/web/app/api/v1/widget/config/route.ts`:
```ts
import { getDeps } from '@/lib/deps';
import { preflight } from '@/lib/http';
import { handleConfig } from '@/lib/widget/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return handleConfig(await getDeps(), request);
}

export function OPTIONS(request: Request) {
  return preflight(request);
}
```
Check: `@dymcode/shared` re-exports `WidgetLocale`/`WidgetPosition`/`PUBLIC_KEY_PATTERN` from its root (it does: `export * from './constants'`).

- [ ] **Step 4: Verify and commit**

Run: `pnpm --filter @dymcode/web test && pnpm typecheck`
Expected: PASS.
```bash
pnpm format
git add apps/web
git commit -m "feat(web): add widget config endpoint"
```

---

### Task 5: Submit use case

**Files:**
- Create: `apps/web/lib/billing/plans.ts`, `apps/web/lib/widget/submit.ts`
- Test: `apps/web/lib/widget/submit.test.ts`

**Interfaces:**
- Consumes: `loadProjectByKey` (Task 4), `Db`, `corsHeaders`, `json`, `clientIp` (Task 2), `Storage`, `createMemoryStorage` (Task 3), `Env` (Task 2).
- Produces:
  ```ts
  const ENTITLEMENTS = { free: { maxProjects: 1, monthlySubmissions: 20, hideBadge: false, customCss: false, customBot: false },
    pro: { maxProjects: Infinity, monthlySubmissions: Infinity, hideBadge: true, customCss: true, customBot: true } } as const;
  interface SubmitDeps {
    db: Db; storage: Storage; env: Pick<Env, 'IP_HASH_SALT'>;
    after: (task: () => Promise<void>) => void;
    notify: { feedback(feedbackId: string): Promise<void>; quotaNotice(projectId: string): Promise<void> };
  }
  function handleSubmit(deps: SubmitDeps, request: Request): Promise<Response>;
  const MAX_BODY_BYTES = 2.5 * 1024 * 1024;
  ```
  The route that wires `notify` to real dispatch is created in Task 7.

- [ ] **Step 1: Write failing tests**

`apps/web/lib/widget/submit.test.ts`:
```ts
import { createProject, createUser, grantPro, withTx, type TestDb } from '@dymcode/db-tests/harness';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryStorage } from '../storage';
import { handleSubmit, type SubmitDeps } from './submit';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';

function payload(projectKey: string, overrides: Record<string, unknown> = {}) {
  return {
    projectKey,
    type: 'bug',
    message: 'Checkout button does nothing',
    email: 'ann@example.com',
    metadata: {
      url: 'https://host.example/checkout',
      referrer: '',
      userAgent: UA,
      language: 'en-US',
      timezone: 'Europe/London',
      viewport: { w: 1280, h: 720 },
      screen: { w: 1920, h: 1080, dpr: 2 },
      consoleErrors: [],
    },
    elapsedMs: 5000,
    website: '',
    ...overrides,
  };
}

function request(
  body: object | string,
  opts: { screenshot?: Blob; origin?: string; ip?: string; headers?: Record<string, string> } = {},
) {
  const form = new FormData();
  form.append('payload', typeof body === 'string' ? body : JSON.stringify(body));
  if (opts.screenshot) form.append('screenshot', opts.screenshot, 'screenshot');
  return new Request('https://dymcode.dev/api/v1/widget/submit', {
    method: 'POST',
    body: form,
    headers: {
      origin: opts.origin ?? 'https://host.example',
      'x-forwarded-for': opts.ip ?? '203.0.113.7',
      ...opts.headers,
    },
  });
}

function setup(db: TestDb) {
  const tasks: Array<() => Promise<void>> = [];
  const storage = createMemoryStorage();
  const notify = { feedback: vi.fn(async () => {}), quotaNotice: vi.fn(async () => {}) };
  const deps: SubmitDeps = {
    db,
    storage,
    env: { IP_HASH_SALT: 'test-salt-0123456789abcdef' },
    after: (task) => tasks.push(task),
    notify,
  };
  const runAfter = async () => {
    for (const task of tasks.splice(0)) await task();
  };
  return { deps, storage, notify, runAfter };
}

async function freeProject(db: TestDb) {
  const owner = await createUser(db);
  return { owner, ...(await createProject(db, owner, 'Acme')) };
}

const feedbackRows = (db: TestDb, projectId: string) =>
  db.query<{
    id: string;
    type: string;
    message: string;
    email: string | null;
    screenshot_path: string | null;
    over_quota: boolean;
    metadata: { browser: string; os: string; url: string };
  }>(
    `select id, type::text as type, message, email, screenshot_path, over_quota, metadata
     from public.feedback where project_id = $1 order by created_at`,
    [projectId],
  );

describe('handleSubmit', () => {
  it('stores feedback with parsed browser/OS and schedules a notification', () =>
    withTx(async (db) => {
      const { deps, notify, runAfter } = setup(db);
      const project = await freeProject(db);
      const res = await handleSubmit(deps, request(payload(project.public_key)));
      expect(res.status).toBe(201);
      expect(res.headers.get('access-control-allow-origin')).toBe('https://host.example');
      const { id } = await res.json();
      const [row] = await feedbackRows(db, project.id);
      expect(row).toMatchObject({
        id,
        type: 'bug',
        message: 'Checkout button does nothing',
        email: 'ann@example.com',
        screenshot_path: null,
        over_quota: false,
      });
      expect(row!.metadata.browser).toMatch(/^Chrome 129/);
      expect(row!.metadata.os).toMatch(/^Windows/);
      expect(notify.feedback).not.toHaveBeenCalled();
      await runAfter();
      expect(notify.feedback).toHaveBeenCalledWith(id);
    }));

  it('stores the screenshot under project/feedback id', () =>
    withTx(async (db) => {
      const { deps, storage } = setup(db);
      const project = await freeProject(db);
      const shot = new Blob([new Uint8Array(2000)], { type: 'image/webp' });
      const res = await handleSubmit(deps, request(payload(project.public_key), { screenshot: shot }));
      const { id } = await res.json();
      const path = `${project.id}/${id}.webp`;
      expect(storage.files.get(path)?.contentType).toBe('image/webp');
      expect((await feedbackRows(db, project.id))[0]!.screenshot_path).toBe(path);
    }));

  it('saves feedback without a screenshot when the upload fails', () =>
    withTx(async (db) => {
      const { deps, storage } = setup(db);
      storage.failUploads = true;
      const project = await freeProject(db);
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      const shot = new Blob([new Uint8Array(10)], { type: 'image/jpeg' });
      const res = await handleSubmit(deps, request(payload(project.public_key), { screenshot: shot }));
      expect(res.status).toBe(201);
      expect((await feedbackRows(db, project.id))[0]!.screenshot_path).toBeNull();
      error.mockRestore();
    }));

  it('rejects oversized bodies with 413', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const project = await freeProject(db);
      const res = await handleSubmit(
        deps,
        request(payload(project.public_key), { headers: { 'content-length': String(3 * 1024 * 1024) } }),
      );
      expect(res.status).toBe(413);
    }));

  it('rejects malformed payloads and screenshots with 400', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const project = await freeProject(db);
      expect((await handleSubmit(deps, request('{not json'))).status).toBe(400);
      const invalid = await handleSubmit(deps, request(payload(project.public_key, { message: '   ' })));
      expect(invalid.status).toBe(400);
      expect((await invalid.json()).issues[0].path).toBe('message');
      const gif = new Blob([new Uint8Array(10)], { type: 'image/gif' });
      expect((await handleSubmit(deps, request(payload(project.public_key), { screenshot: gif }))).status).toBe(400);
    }));

  it('returns 404 for an unknown project', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      expect((await handleSubmit(deps, request(payload('pk_AbCdEfGh12345678')))).status).toBe(404);
    }));

  it('enforces allowed origins when configured', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const project = await freeProject(db);
      await db.query(`update public.projects set allowed_origins = '{https://shop.example}' where id = $1`, [
        project.id,
      ]);
      expect((await handleSubmit(deps, request(payload(project.public_key)))).status).toBe(403);
      const ok = await handleSubmit(deps, request(payload(project.public_key), { origin: 'https://shop.example' }));
      expect(ok.status).toBe(201);
    }));

  it('silently drops bot submissions', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const project = await freeProject(db);
      const honeypot = await handleSubmit(deps, request(payload(project.public_key, { website: 'http://spam' })));
      expect(honeypot.status).toBe(200);
      expect(await honeypot.json()).toEqual({ id: null });
      const fast = await handleSubmit(deps, request(payload(project.public_key, { elapsedMs: 1500 })));
      expect(await fast.json()).toEqual({ id: null });
      expect(await feedbackRows(db, project.id)).toEqual([]);
    }));

  it('rate limits 5 submissions per minute per project and IP', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const project = await freeProject(db);
      for (let i = 0; i < 5; i++) {
        expect((await handleSubmit(deps, request(payload(project.public_key)))).status).toBe(201);
      }
      expect((await handleSubmit(deps, request(payload(project.public_key)))).status).toBe(429);
      const otherIp = await handleSubmit(deps, request(payload(project.public_key), { ip: '198.51.100.9' }));
      expect(otherIp.status).toBe(201);
    }));

  it('hides submissions over the Free quota and sends one quota notice', () =>
    withTx(async (db) => {
      const { deps, notify, runAfter } = setup(db);
      const project = await freeProject(db);
      await db.query(
        `insert into public.usage_counters (owner_id, period, count)
         values ($1, date_trunc('month', now() at time zone 'utc')::date, 20)`,
        [project.owner],
      );
      await handleSubmit(deps, request(payload(project.public_key)));
      await handleSubmit(deps, request(payload(project.public_key), { ip: '198.51.100.9' }));
      await runAfter();
      const rows = await feedbackRows(db, project.id);
      expect(rows.map((r) => r.over_quota)).toEqual([true, true]);
      expect(notify.feedback).not.toHaveBeenCalled();
      expect(notify.quotaNotice).toHaveBeenCalledTimes(1);
      expect(notify.quotaNotice).toHaveBeenCalledWith(project.id);
    }));

  it('never applies the quota to Pro owners', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const project = await freeProject(db);
      await grantPro(db, project.owner);
      await db.query(
        `insert into public.usage_counters (owner_id, period, count)
         values ($1, date_trunc('month', now() at time zone 'utc')::date, 500)`,
        [project.owner],
      );
      await handleSubmit(deps, request(payload(project.public_key)));
      expect((await feedbackRows(db, project.id))[0]!.over_quota).toBe(false);
    }));
});
```
If the runtime strips a manually set `content-length` header from `Request` (the 413 test would then
fail), report it; don't delete the test. The implementation's 413 branch must still read `content-length`.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @dymcode/web test`
Expected: FAIL with unresolved `./submit`.

- [ ] **Step 3: Implement**

Run: `pnpm --filter @dymcode/web add ua-parser-js` (already added in Task 2; skip if present).

`apps/web/lib/billing/plans.ts`:
```ts
/** The only place in TypeScript where tier limits live. */
export const ENTITLEMENTS = {
  free: { maxProjects: 1, monthlySubmissions: 20, hideBadge: false, customCss: false, customBot: false },
  pro: {
    maxProjects: Infinity,
    monthlySubmissions: Infinity,
    hideBadge: true,
    customCss: true,
    customBot: true,
  },
} as const;
```

`apps/web/lib/widget/submit.ts`:
```ts
import { createHash, randomUUID } from 'node:crypto';
import {
  SCREENSHOT_MAX_BYTES,
  SCREENSHOT_MIME_TYPES,
  SubmitPayloadSchema,
  type FeedbackMetadata,
} from '@dymcode/shared';
import { UAParser } from 'ua-parser-js';
import { ENTITLEMENTS } from '../billing/plans';
import type { Db } from '../db/types';
import type { Env } from '../env';
import { clientIp, corsHeaders, json } from '../http';
import type { Storage } from '../storage';
import { loadProjectByKey } from './project';

export const MAX_BODY_BYTES = 2.5 * 1024 * 1024;
const RATE_LIMIT = { max: 5, windowSeconds: 60 } as const;
const MIN_ELAPSED_MS = 2000;
const EXTENSIONS: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };

export interface SubmitDeps {
  db: Db;
  storage: Storage;
  env: Pick<Env, 'IP_HASH_SALT'>;
  after: (task: () => Promise<void>) => void;
  notify: {
    feedback(feedbackId: string): Promise<void>;
    quotaNotice(projectId: string): Promise<void>;
  };
}

function describeAgent(userAgent: string): { browser: string; os: string } {
  const result = UAParser(userAgent);
  const join = (...parts: Array<string | undefined>) => parts.filter(Boolean).join(' ') || 'Unknown';
  return {
    browser: join(result.browser.name, result.browser.major),
    os: join(result.os.name, result.os.version),
  };
}

export async function handleSubmit(deps: SubmitDeps, request: Request): Promise<Response> {
  const origin = request.headers.get('origin');
  const cors = corsHeaders(origin);
  try {
    if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
      return json({ error: 'payload too large' }, 413, cors);
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return json({ error: 'invalid form data' }, 400, cors);
    }
    let raw: unknown;
    try {
      raw = JSON.parse(String(form.get('payload') ?? ''));
    } catch {
      return json({ error: 'payload is not JSON' }, 400, cors);
    }
    const parsed = SubmitPayloadSchema.safeParse(raw);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      return json({ error: 'invalid payload', issues }, 400, cors);
    }
    const payload = parsed.data;

    const file = form.get('screenshot');
    let screenshot: { data: Uint8Array; contentType: string } | null = null;
    if (file !== null) {
      const valid =
        file instanceof Blob &&
        (SCREENSHOT_MIME_TYPES as readonly string[]).includes(file.type) &&
        file.size <= SCREENSHOT_MAX_BYTES;
      if (!valid) return json({ error: 'invalid screenshot' }, 400, cors);
      screenshot = { data: new Uint8Array(await file.arrayBuffer()), contentType: file.type };
    }

    const ipHash = createHash('sha256')
      .update(clientIp(request.headers) + deps.env.IP_HASH_SALT)
      .digest('hex');
    const [limit] = await deps.db.query<{ limited: boolean }>(
      'select public.hit_rate_limit($1, $2, $3) as limited',
      [`submit:${payload.projectKey}:${ipHash}`, RATE_LIMIT.max, RATE_LIMIT.windowSeconds],
    );
    if (limit?.limited) return json({ error: 'rate limited' }, 429, cors);

    const project = await loadProjectByKey(deps.db, payload.projectKey);
    if (!project) return json({ error: 'unknown project' }, 404, cors);
    if (project.allowed_origins.length > 0 && !(origin && project.allowed_origins.includes(origin))) {
      return json({ error: 'origin not allowed' }, 403, cors);
    }
    if (payload.website || payload.elapsedMs < MIN_ELAPSED_MS) return json({ id: null }, 200, cors);

    const [usage] = await deps.db.query<{ count: number }>('select public.consume_quota($1) as count', [
      project.owner_id,
    ]);
    const overQuota = !project.pro && (usage?.count ?? 0) > ENTITLEMENTS.free.monthlySubmissions;

    const id = randomUUID();
    let screenshotPath: string | null = null;
    if (screenshot) {
      const path = `${project.id}/${id}.${EXTENSIONS[screenshot.contentType]}`;
      try {
        await deps.storage.upload(path, screenshot.data, screenshot.contentType);
        screenshotPath = path;
      } catch (error) {
        console.error('[widget/submit] screenshot upload failed', error);
      }
    }

    const metadata: FeedbackMetadata = { ...payload.metadata, ...describeAgent(payload.metadata.userAgent) };
    await deps.db.query(
      `insert into public.feedback
         (id, project_id, type, message, email, screenshot_path, metadata, over_quota)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
      [id, project.id, payload.type, payload.message, payload.email ?? null, screenshotPath, JSON.stringify(metadata), overQuota],
    );

    deps.after(async () => {
      try {
        if (!overQuota) {
          await deps.notify.feedback(id);
          return;
        }
        const [claim] = await deps.db.query<{ ok: boolean }>('select public.claim_quota_notice($1) as ok', [
          project.owner_id,
        ]);
        if (claim?.ok) await deps.notify.quotaNotice(project.id);
      } catch (error) {
        console.error('[widget/submit] notification failed', error);
      }
    });

    return json({ id }, 201, cors);
  } catch (error) {
    console.error('[widget/submit]', error);
    return json({ error: 'internal' }, 500, cors);
  }
}
```

- [ ] **Step 4: Verify and commit**

Run: `pnpm --filter @dymcode/web test && pnpm typecheck`
Expected: PASS, and the output is pristine (the upload-failure test spies on `console.error`).
```bash
pnpm format
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): add feedback submit use case"
```

---

### Task 6: Telegram and Discord notifiers

**Files:**
- Create: `apps/web/lib/notify/types.ts`, `apps/web/lib/notify/format.ts`, `apps/web/lib/notify/telegram.ts`, `apps/web/lib/notify/discord.ts`
- Test: `apps/web/lib/notify/format.test.ts`, `apps/web/lib/notify/telegram.test.ts`, `apps/web/lib/notify/discord.test.ts`, fixtures `apps/web/test/notify-fixtures.ts`

**Interfaces:**
- Produces:
  ```ts
  interface Attachment { data: Uint8Array; contentType: string; filename: string }
  interface FeedbackMessage { kind: 'feedback'; projectName: string; type: FeedbackType; message: string;
    email: string | null; metadata: FeedbackMetadata; dashboardUrl: string; screenshot: Attachment | null }
  interface TextNotice { kind: 'text'; text: string }
  type Notification = FeedbackMessage | TextNotice;
  type DeliveryResult = { ok: true } | { ok: false; retryable: boolean; disable: boolean; error: string; retryAfterSec?: number };
  interface Notifier { send(notification: Notification): Promise<DeliveryResult> }
  function escapeHtml(text: string): string;
  const TYPE_STYLE: Record<FeedbackType, { emoji: string; label: string; color: number }>;
  function formatTelegram(m: FeedbackMessage): { full: string; short: string }; // HTML
  function createTelegramNotifier(opts: { token: string; chatId: string; fetch: typeof fetch; timeoutMs?: number }): Notifier;
  function createDiscordNotifier(opts: { webhookUrl: string; fetch: typeof fetch; timeoutMs?: number }): Notifier;
  ```

- [ ] **Step 1: Write failing tests**

`apps/web/test/notify-fixtures.ts` (shared by the notifier tests; not a test file):
```ts
import type { FeedbackMessage } from '@/lib/notify/types';

export function sampleMessage(overrides: Partial<FeedbackMessage> = {}): FeedbackMessage {
  return {
    kind: 'feedback',
    projectName: 'Acme <Shop>',
    type: 'bug',
    message: 'Checkout <b>fails</b> & nothing happens',
    email: 'ann@example.com',
    metadata: {
      url: 'https://host.example/checkout?plan=pro',
      referrer: '',
      userAgent: 'UA',
      language: 'en-US',
      timezone: 'UTC',
      viewport: { w: 1280, h: 720 },
      screen: { w: 1920, h: 1080, dpr: 2 },
      consoleErrors: [{ message: 'TypeError: x is undefined', at: 1 }],
      browser: 'Chrome 129',
      os: 'Windows 10',
    },
    dashboardUrl: 'https://dymcode.dev/projects/p1/feedback?f=f1',
    screenshot: null,
    ...overrides,
  };
}
```

`apps/web/lib/notify/format.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { sampleMessage } from '@/test/notify-fixtures';
import { escapeHtml, formatTelegram } from './format';

describe('format', () => {
  it('escapes HTML special characters', () => {
    expect(escapeHtml(`<a href="x">&</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  });

  it('builds an escaped Telegram message with context and a dashboard link', () => {
    const { full, short } = formatTelegram(sampleMessage());
    expect(full).toContain('🐞 <b>Bug</b> · Acme &lt;Shop&gt;');
    expect(full).toContain('Checkout &lt;b&gt;fails&lt;/b&gt; &amp; nothing happens');
    expect(full).toContain('ann@example.com');
    expect(full).toContain('https://host.example/checkout?plan=pro');
    expect(full).toContain('Chrome 129 · Windows 10 · 1280×720 (screen 1920×1080 @2x)');
    expect(full).toContain('<code>TypeError: x is undefined</code>');
    expect(full).toContain('<a href="https://dymcode.dev/projects/p1/feedback?f=f1">Open in dashboard</a>');
    expect(short).toContain('🐞 <b>Bug</b> · Acme &lt;Shop&gt;');
    expect(short).toContain('Open in dashboard');
    expect(short.length).toBeLessThan(400);
  });

  it('keeps the full message within Telegram limits', () => {
    const { full } = formatTelegram(sampleMessage({ message: 'x'.repeat(5000) }));
    expect(full.length).toBeLessThanOrEqual(4096);
  });
});
```

`apps/web/lib/notify/telegram.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { sampleMessage } from '@/test/notify-fixtures';
import { createTelegramNotifier } from './telegram';

const ok = () => new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
const tgError = (status: number, description: string, retryAfter?: number) =>
  new Response(
    JSON.stringify({ ok: false, error_code: status, description, parameters: retryAfter ? { retry_after: retryAfter } : undefined }),
    { status },
  );

function notifier(fetchImpl: typeof fetch) {
  return createTelegramNotifier({ token: '123:ABC', chatId: '424242', fetch: fetchImpl });
}

describe('telegram notifier', () => {
  it('sends a text message with HTML formatting when there is no screenshot', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => ok());
    expect(await notifier(fetchImpl as typeof fetch).send(sampleMessage())).toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.telegram.org/bot123:ABC/sendMessage');
    const body = JSON.parse(String(init!.body));
    expect(body).toMatchObject({ chat_id: '424242', parse_mode: 'HTML' });
    expect(body.text).toContain('Open in dashboard');
  });

  it('sends a photo with the caption when a screenshot is attached', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => ok());
    const screenshot = { data: new Uint8Array([1, 2, 3]), contentType: 'image/webp', filename: 'screenshot.webp' };
    await notifier(fetchImpl as typeof fetch).send(sampleMessage({ screenshot }));
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.telegram.org/bot123:ABC/sendPhoto');
    const form = init!.body as FormData;
    expect(form.get('chat_id')).toBe('424242');
    expect(form.get('parse_mode')).toBe('HTML');
    expect(String(form.get('caption'))).toContain('Checkout');
    expect((form.get('photo') as File).type).toBe('image/webp');
  });

  it('splits into photo + message when the caption exceeds 1024 chars', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => ok());
    const screenshot = { data: new Uint8Array([1]), contentType: 'image/jpeg', filename: 'screenshot.jpg' };
    await notifier(fetchImpl as typeof fetch).send(sampleMessage({ screenshot, message: 'y'.repeat(1500) }));
    expect(fetchImpl.mock.calls.map(([url]) => String(url).split('/').pop())).toEqual(['sendPhoto', 'sendMessage']);
    const caption = String((fetchImpl.mock.calls[0]![1]!.body as FormData).get('caption'));
    expect(caption.length).toBeLessThanOrEqual(1024);
    expect(JSON.parse(String(fetchImpl.mock.calls[1]![1]!.body)).text).toContain('y'.repeat(100));
  });

  it('sends plain text notices without parse mode', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => ok());
    await notifier(fetchImpl as typeof fetch).send({ kind: 'text', text: 'Limit <reached>' });
    const body = JSON.parse(String(fetchImpl.mock.calls[0]![1]!.body));
    expect(body).toEqual({ chat_id: '424242', text: 'Limit <reached>', link_preview_options: { is_disabled: true } });
  });

  it('classifies failures', async () => {
    const send = (response: Response) => notifier((async () => response) as typeof fetch).send(sampleMessage());
    expect(await send(tgError(429, 'Too Many Requests', 7))).toMatchObject({
      ok: false,
      retryable: true,
      disable: false,
      retryAfterSec: 7,
    });
    expect(await send(tgError(502, 'Bad Gateway'))).toMatchObject({ retryable: true, disable: false });
    expect(await send(tgError(403, 'Forbidden: bot was kicked'))).toMatchObject({ retryable: false, disable: true });
    expect(await send(tgError(400, 'Bad Request: chat not found'))).toMatchObject({ disable: true });
    expect(await send(tgError(400, 'Bad Request: message is too long'))).toMatchObject({
      retryable: false,
      disable: false,
    });
    const offline = notifier((async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch);
    expect(await offline.send(sampleMessage())).toMatchObject({ ok: false, retryable: true, disable: false });
  });
});
```

`apps/web/lib/notify/discord.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { createDiscordNotifier } from './discord';
import { sampleMessage } from '@/test/notify-fixtures';

const WEBHOOK = 'https://discord.com/api/webhooks/1/token';

function notifier(fetchImpl: typeof fetch) {
  return createDiscordNotifier({ webhookUrl: WEBHOOK, fetch: fetchImpl });
}

describe('discord notifier', () => {
  it('posts an embed as JSON without a screenshot and disables mentions', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(null, { status: 204 }));
    expect(await notifier(fetchImpl as typeof fetch).send(sampleMessage())).toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(WEBHOOK);
    const body = JSON.parse(String(init!.body));
    expect(body.allowed_mentions).toEqual({ parse: [] });
    expect(body.embeds[0]).toMatchObject({
      title: '🐞 Bug · Acme <Shop>',
      url: 'https://dymcode.dev/projects/p1/feedback?f=f1',
      color: 0xef4444,
    });
    expect(body.embeds[0].description).toContain('Checkout');
    expect(body.embeds[0].fields.map((f: { name: string }) => f.name)).toEqual(
      expect.arrayContaining(['Email', 'Page', 'Browser', 'Console errors']),
    );
  });

  it('attaches the screenshot as a file referenced by the embed', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(null, { status: 204 }));
    const screenshot = { data: new Uint8Array([9]), contentType: 'image/webp', filename: 'screenshot.webp' };
    await notifier(fetchImpl as typeof fetch).send(sampleMessage({ screenshot }));
    const form = fetchImpl.mock.calls[0]![1]!.body as FormData;
    const payload = JSON.parse(String(form.get('payload_json')));
    expect(payload.embeds[0].image).toEqual({ url: 'attachment://screenshot.webp' });
    expect(payload.allowed_mentions).toEqual({ parse: [] });
    expect((form.get('files[0]') as File).name).toBe('screenshot.webp');
  });

  it('sends text notices as content', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(null, { status: 204 }));
    await notifier(fetchImpl as typeof fetch).send({ kind: 'text', text: 'Limit reached' });
    expect(JSON.parse(String(fetchImpl.mock.calls[0]![1]!.body))).toEqual({
      content: 'Limit reached',
      allowed_mentions: { parse: [] },
    });
  });

  it('classifies failures', async () => {
    const send = (response: Response) => notifier((async () => response) as typeof fetch).send(sampleMessage());
    expect(await send(new Response(JSON.stringify({ retry_after: 1.5 }), { status: 429 }))).toMatchObject({
      retryable: true,
      retryAfterSec: 1.5,
    });
    expect(await send(new Response('{}', { status: 404 }))).toMatchObject({ retryable: false, disable: true });
    expect(await send(new Response('{}', { status: 500 }))).toMatchObject({ retryable: true, disable: false });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @dymcode/web test`
Expected: FAIL with unresolved `./format`, `./telegram`, `./discord`.

- [ ] **Step 3: Implement**

`apps/web/lib/notify/types.ts`:
```ts
import type { FeedbackMetadata, FeedbackType } from '@dymcode/shared';

export interface Attachment {
  data: Uint8Array;
  contentType: string;
  filename: string;
}

export interface FeedbackMessage {
  kind: 'feedback';
  projectName: string;
  type: FeedbackType;
  message: string;
  email: string | null;
  metadata: FeedbackMetadata;
  dashboardUrl: string;
  screenshot: Attachment | null;
}

export interface TextNotice {
  kind: 'text';
  text: string;
}

export type Notification = FeedbackMessage | TextNotice;

export type DeliveryResult =
  | { ok: true }
  | { ok: false; retryable: boolean; disable: boolean; error: string; retryAfterSec?: number };

export interface Notifier {
  send(notification: Notification): Promise<DeliveryResult>;
}
```

`apps/web/lib/notify/format.ts`:
```ts
import type { FeedbackType } from '@dymcode/shared';
import type { FeedbackMessage } from './types';

export const TYPE_STYLE: Record<FeedbackType, { emoji: string; label: string; color: number }> = {
  bug: { emoji: '🐞', label: 'Bug', color: 0xef4444 },
  idea: { emoji: '💡', label: 'Idea', color: 0x22c55e },
  general: { emoji: '💬', label: 'Other', color: 0x6366f1 },
};

const MESSAGE_LIMIT = 3000;
const ERROR_LIMIT = 200;
const MAX_ERRORS = 3;

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export function environmentLine(m: FeedbackMessage): string {
  const { browser, os, viewport, screen } = m.metadata;
  return `${browser} · ${os} · ${viewport.w}×${viewport.h} (screen ${screen.w}×${screen.h} @${screen.dpr}x)`;
}

/** Telegram HTML. Raw fields are truncated before escaping so markup is never cut in half. */
export function formatTelegram(m: FeedbackMessage): { full: string; short: string } {
  const style = TYPE_STYLE[m.type];
  const title = `${style.emoji} <b>${style.label}</b> · ${escapeHtml(truncate(m.projectName, 100))}`;
  const link = `<a href="${escapeHtml(m.dashboardUrl)}">Open in dashboard</a>`;
  const lines = [title, '', escapeHtml(truncate(m.message, MESSAGE_LIMIT)), ''];
  if (m.email) lines.push(`✉️ ${escapeHtml(truncate(m.email, 254))}`);
  lines.push(`🔗 ${escapeHtml(truncate(m.metadata.url, 300))}`);
  lines.push(`🖥 ${escapeHtml(environmentLine(m))}`);
  const errors = m.metadata.consoleErrors.slice(-MAX_ERRORS);
  if (errors.length) {
    lines.push('⚠️ Console errors:');
    for (const error of errors) lines.push(`<code>${escapeHtml(truncate(error.message, ERROR_LIMIT))}</code>`);
  }
  lines.push('', link);
  return { full: lines.join('\n'), short: `${title}\n${link}` };
}
```

`apps/web/lib/notify/telegram.ts`:
```ts
import { formatTelegram } from './format';
import type { DeliveryResult, Notification, Notifier } from './types';

const CAPTION_LIMIT = 1024;

interface TelegramResponse {
  ok?: boolean;
  description?: string;
  parameters?: { retry_after?: number };
}

function classify(status: number, body: TelegramResponse): DeliveryResult {
  const error = body.description ?? `HTTP ${status}`;
  if (status === 429) return { ok: false, retryable: true, disable: false, error, retryAfterSec: body.parameters?.retry_after };
  if (status >= 500) return { ok: false, retryable: true, disable: false, error };
  const disable = [401, 403, 404].includes(status) || /chat not found/i.test(error);
  return { ok: false, retryable: false, disable, error };
}

export function createTelegramNotifier(opts: {
  token: string;
  chatId: string;
  fetch: typeof fetch;
  timeoutMs?: number;
}): Notifier {
  const call = async (method: string, body: BodyInit, json: boolean): Promise<DeliveryResult> => {
    try {
      const response = await opts.fetch(`https://api.telegram.org/bot${opts.token}/${method}`, {
        method: 'POST',
        body,
        headers: json ? { 'content-type': 'application/json' } : undefined,
        signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
      });
      const data = (await response.json().catch(() => ({}))) as TelegramResponse;
      return response.ok && data.ok ? { ok: true } : classify(response.status, data);
    } catch (error) {
      return { ok: false, retryable: true, disable: false, error: `network: ${(error as Error).message}` };
    }
  };
  const sendMessage = (text: string, html: boolean) =>
    call(
      'sendMessage',
      JSON.stringify({
        chat_id: opts.chatId,
        text,
        ...(html ? { parse_mode: 'HTML' } : {}),
        link_preview_options: { is_disabled: true },
      }),
      true,
    );

  return {
    async send(notification: Notification) {
      if (notification.kind === 'text') return sendMessage(notification.text, false);
      const { full, short } = formatTelegram(notification);
      if (!notification.screenshot) return sendMessage(full, true);

      const form = new FormData();
      form.append('chat_id', opts.chatId);
      form.append('parse_mode', 'HTML');
      form.append('caption', full.length <= CAPTION_LIMIT ? full : short);
      form.append(
        'photo',
        new Blob([notification.screenshot.data], { type: notification.screenshot.contentType }),
        notification.screenshot.filename,
      );
      const photo = await call('sendPhoto', form, false);
      if (!photo.ok || full.length <= CAPTION_LIMIT) return photo;
      return sendMessage(full, true);
    },
  };
}
```
Note: the plain-text notice test expects exactly `{ chat_id, text, link_preview_options }` (no `parse_mode`), which the `html ? … : {}` spread produces.

`apps/web/lib/notify/discord.ts`:
```ts
import { environmentLine, TYPE_STYLE, truncate } from './format';
import type { DeliveryResult, FeedbackMessage, Notification, Notifier } from './types';

const NO_MENTIONS = { parse: [] as string[] };

function embedFor(m: FeedbackMessage) {
  const style = TYPE_STYLE[m.type];
  const fields = [
    ...(m.email ? [{ name: 'Email', value: truncate(m.email, 254), inline: true }] : []),
    { name: 'Page', value: truncate(m.metadata.url, 1024) },
    { name: 'Browser', value: truncate(environmentLine(m), 1024) },
  ];
  const errors = m.metadata.consoleErrors.slice(-3);
  if (errors.length) {
    fields.push({ name: 'Console errors', value: truncate(errors.map((e) => `• ${e.message}`).join('\n'), 1024) });
  }
  return {
    title: truncate(`${style.emoji} ${style.label} · ${m.projectName}`, 256),
    description: truncate(m.message, 4000),
    url: m.dashboardUrl,
    color: style.color,
    fields,
  };
}

async function classify(response: Response): Promise<DeliveryResult> {
  const error = `HTTP ${response.status}`;
  if (response.status === 429) {
    const body = (await response.json().catch(() => ({}))) as { retry_after?: number };
    return { ok: false, retryable: true, disable: false, error, retryAfterSec: body.retry_after };
  }
  if (response.status >= 500) return { ok: false, retryable: true, disable: false, error };
  return { ok: false, retryable: false, disable: [401, 404].includes(response.status), error };
}

export function createDiscordNotifier(opts: { webhookUrl: string; fetch: typeof fetch; timeoutMs?: number }): Notifier {
  const post = async (body: BodyInit, json: boolean): Promise<DeliveryResult> => {
    try {
      const response = await opts.fetch(opts.webhookUrl, {
        method: 'POST',
        body,
        headers: json ? { 'content-type': 'application/json' } : undefined,
        signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
      });
      return response.ok ? { ok: true } : classify(response);
    } catch (error) {
      return { ok: false, retryable: true, disable: false, error: `network: ${(error as Error).message}` };
    }
  };

  return {
    async send(notification: Notification) {
      if (notification.kind === 'text') {
        return post(JSON.stringify({ content: truncate(notification.text, 2000), allowed_mentions: NO_MENTIONS }), true);
      }
      const embed = embedFor(notification);
      if (!notification.screenshot) {
        return post(JSON.stringify({ embeds: [embed], allowed_mentions: NO_MENTIONS }), true);
      }
      const { data, contentType, filename } = notification.screenshot;
      const form = new FormData();
      form.append(
        'payload_json',
        JSON.stringify({ embeds: [{ ...embed, image: { url: `attachment://${filename}` } }], allowed_mentions: NO_MENTIONS }),
      );
      form.append('files[0]', new Blob([data], { type: contentType }), filename);
      return post(form, false);
    },
  };
}
```

- [ ] **Step 4: Verify and commit**

Run: `pnpm --filter @dymcode/web test && pnpm typecheck`
Expected: PASS.
```bash
pnpm format
git add apps/web
git commit -m "feat(web): add Telegram and Discord notifiers"
```

---

### Task 7: Dispatch and the submit route

**Files:**
- Create: `apps/web/lib/notify/dispatch.ts`, `apps/web/app/api/v1/widget/submit/route.ts`
- Test: `apps/web/lib/notify/dispatch.test.ts`

**Interfaces:**
- Consumes: notifiers + types (Task 6), `decryptSecret`/`encryptSecret` (Task 3), `Storage`/`createMemoryStorage` (Task 3), `handleSubmit` (Task 5), `getDeps`/`AppDeps` (Task 4), `preflight` (Task 2).
- Produces:
  ```ts
  interface DispatchDeps { db: Db; storage: Storage; fetch: typeof fetch;
    env: Pick<Env, 'TELEGRAM_BOT_TOKEN' | 'SECRETS_ENCRYPTION_KEY' | 'NEXT_PUBLIC_APP_URL'>;
    sleep?: (ms: number) => Promise<void> }
  function dispatchFeedback(deps: DispatchDeps, feedbackId: string): Promise<void>;
  function dispatchQuotaNotice(deps: DispatchDeps, projectId: string): Promise<void>;
  function quotaNoticeText(appUrl: string): string;
  ```

- [ ] **Step 1: Write failing tests**

`apps/web/lib/notify/dispatch.test.ts`:
```ts
import { createFeedback, createProject, createUser, grantPro, withTx, type TestDb } from '@dymcode/db-tests/harness';
import { describe, expect, it, vi } from 'vitest';
import { encryptSecret } from '../crypto';
import { createMemoryStorage } from '../storage';
import { dispatchFeedback, dispatchQuotaNotice, type DispatchDeps } from './dispatch';

const KEY = Buffer.alloc(32, 3).toString('base64');
const SHARED_TOKEN = '111:SHARED';
const DISCORD = 'https://discord.com/api/webhooks/9/hook';
const FULL_METADATA = {
  url: 'https://host.example/',
  referrer: '',
  userAgent: 'UA',
  language: 'en',
  timezone: 'UTC',
  viewport: { w: 1280, h: 720 },
  screen: { w: 1920, h: 1080, dpr: 1 },
  consoleErrors: [],
  browser: 'Chrome 129',
  os: 'Windows 10',
};

/** The harness leaves metadata as {}; notifications need the full shape. */
async function feedback(db: TestDb, projectId: string, message = 'Something broke') {
  const id = await createFeedback(db, projectId, { message });
  await db.query('update public.feedback set metadata = $1::jsonb where id = $2', [JSON.stringify(FULL_METADATA), id]);
  return id;
}

type Route = (url: string, init?: RequestInit) => Response;

function setup(db: TestDb, route: Route = () => new Response(JSON.stringify({ ok: true }), { status: 200 })) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return route(url, init);
  });
  const storage = createMemoryStorage();
  const deps: DispatchDeps = {
    db,
    storage,
    fetch: fetchImpl as typeof fetch,
    env: { TELEGRAM_BOT_TOKEN: SHARED_TOKEN, SECRETS_ENCRYPTION_KEY: KEY, NEXT_PUBLIC_APP_URL: 'https://dymcode.dev' },
    sleep: async () => {},
  };
  return { deps, calls, storage };
}

async function projectWith(db: TestDb, opts: { pro?: boolean } = {}) {
  const owner = await createUser(db);
  if (opts.pro) await grantPro(db, owner);
  const project = await createProject(db, owner, 'Acme');
  return { owner, ...project };
}

async function addIntegration(
  db: TestDb,
  projectId: string,
  kind: 'telegram_shared' | 'telegram_custom' | 'discord',
  opts: { target?: string | null; secret?: string | null; enabled?: boolean } = {},
) {
  const [row] = await db.query<{ id: string }>(
    `insert into public.integrations (project_id, kind, target, secret_encrypted, enabled)
     values ($1, $2, $3, $4, $5) returning id`,
    [projectId, kind, opts.target ?? null, opts.secret ?? null, opts.enabled ?? true],
  );
  return row!.id;
}

const integration = (db: TestDb, id: string) =>
  db.query<{ enabled: boolean; last_error: string | null; delivered: boolean }>(
    `select enabled, last_error, last_delivered_at is not null as delivered from public.integrations where id = $1`,
    [id],
  ).then((rows) => rows[0]!);

describe('dispatchFeedback', () => {
  it('delivers to the shared bot and records success', () =>
    withTx(async (db) => {
      const { deps, calls } = setup(db);
      const project = await projectWith(db);
      const tg = await addIntegration(db, project.id, 'telegram_shared', { target: '4242' });
      const feedbackId = await feedback(db, project.id, 'Broken checkout');
      await dispatchFeedback(deps, feedbackId);
      expect(calls).toHaveLength(1);
      expect(calls[0]!.url).toBe(`https://api.telegram.org/bot${SHARED_TOKEN}/sendMessage`);
      const body = JSON.parse(String(calls[0]!.init!.body));
      expect(body.chat_id).toBe('4242');
      expect(body.text).toContain('Broken checkout');
      expect(body.text).toContain(`https://dymcode.dev/projects/${project.id}/feedback?f=${feedbackId}`);
      expect(await integration(db, tg)).toEqual({ enabled: true, last_error: null, delivered: true });
    }));

  it('attaches the stored screenshot', () =>
    withTx(async (db) => {
      const { deps, calls, storage } = setup(db);
      const project = await projectWith(db);
      await addIntegration(db, project.id, 'telegram_shared', { target: '4242' });
      const feedbackId = await feedback(db, project.id);
      const path = `${project.id}/${feedbackId}.webp`;
      await storage.upload(path, new Uint8Array([1, 2, 3]), 'image/webp');
      await db.query('update public.feedback set screenshot_path = $1 where id = $2', [path, feedbackId]);
      await dispatchFeedback(deps, feedbackId);
      expect(calls[0]!.url).toMatch(/\/sendPhoto$/);
      expect(((calls[0]!.init!.body as FormData).get('photo') as File).name).toBe('screenshot.webp');
    }));

  it('uses a custom bot only for Pro owners', () =>
    withTx(async (db) => {
      const secret = encryptSecret('222:CUSTOM', KEY);
      const free = setup(db);
      const freeProject = await projectWith(db);
      const freeBot = await addIntegration(db, freeProject.id, 'telegram_custom', { target: '1', secret });
      await dispatchFeedback(free.deps, await feedback(db, freeProject.id));
      expect(free.calls).toHaveLength(0);
      expect(await integration(db, freeBot)).toEqual({ enabled: true, last_error: null, delivered: false });

      const pro = setup(db);
      const proProject = await projectWith(db, { pro: true });
      await addIntegration(db, proProject.id, 'telegram_custom', { target: '1', secret });
      await dispatchFeedback(pro.deps, await feedback(db, proProject.id));
      expect(pro.calls[0]!.url).toBe('https://api.telegram.org/bot222:CUSTOM/sendMessage');
    }));

  it('disables Discord on 404 and isolates unreadable secrets', () =>
    withTx(async (db) => {
      const { deps, calls } = setup(db, (url) =>
        url.startsWith('https://discord.com') ? new Response('{}', { status: 404 }) : new Response(JSON.stringify({ ok: true })),
      );
      const project = await projectWith(db);
      const discord = await addIntegration(db, project.id, 'discord', { secret: encryptSecret(DISCORD, KEY) });
      const shared = await addIntegration(db, project.id, 'telegram_shared', { target: '4242' });
      const broken = await addIntegration(db, project.id, 'telegram_custom', { target: '5', secret: 'v1:broken' });
      await grantPro(db, project.owner);
      await dispatchFeedback(deps, await feedback(db, project.id));
      expect(await integration(db, discord)).toMatchObject({ enabled: false, last_error: 'HTTP 404' });
      expect(await integration(db, shared)).toMatchObject({ enabled: true, delivered: true });
      expect(await integration(db, broken)).toMatchObject({ enabled: true, last_error: 'secret unreadable' });
      expect(calls.map((c) => new URL(c.url).hostname).sort()).toEqual(['api.telegram.org', 'discord.com']);
    }));

  it('retries once after a rate limit and ignores disabled integrations', () =>
    withTx(async (db) => {
      let attempts = 0;
      const { deps, calls } = setup(db, () =>
        ++attempts === 1
          ? new Response(JSON.stringify({ ok: false, description: 'Too Many Requests', parameters: { retry_after: 9 } }), {
              status: 429,
            })
          : new Response(JSON.stringify({ ok: true })),
      );
      const sleep = vi.fn(async () => {});
      deps.sleep = sleep;
      const project = await projectWith(db);
      const tg = await addIntegration(db, project.id, 'telegram_shared', { target: '4242' });
      await addIntegration(db, project.id, 'discord', { secret: encryptSecret(DISCORD, KEY), enabled: false });
      await dispatchFeedback(deps, await feedback(db, project.id));
      expect(calls).toHaveLength(2);
      expect(sleep).toHaveBeenCalledWith(3000);
      expect(await integration(db, tg)).toMatchObject({ delivered: true, last_error: null });
    }));
});

describe('dispatchQuotaNotice', () => {
  it('sends the limit notice to every enabled channel', () =>
    withTx(async (db) => {
      const { deps, calls } = setup(db, (url) =>
        url.startsWith('https://discord.com') ? new Response(null, { status: 204 }) : new Response(JSON.stringify({ ok: true })),
      );
      const project = await projectWith(db);
      await addIntegration(db, project.id, 'telegram_shared', { target: '4242' });
      await addIntegration(db, project.id, 'discord', { secret: encryptSecret(DISCORD, KEY) });
      await dispatchQuotaNotice(deps, project.id);
      expect(calls).toHaveLength(2);
      for (const call of calls) expect(String(call.init!.body)).toContain('free limit of 20 submissions');
    }));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @dymcode/web test`
Expected: FAIL with unresolved `./dispatch`.

- [ ] **Step 3: Implement**

`apps/web/lib/notify/dispatch.ts`:
```ts
import type { FeedbackMetadata, FeedbackType } from '@dymcode/shared';
import { ENTITLEMENTS } from '../billing/plans';
import { decryptSecret } from '../crypto';
import type { Db } from '../db/types';
import type { Env } from '../env';
import type { Storage } from '../storage';
import { createDiscordNotifier } from './discord';
import { createTelegramNotifier } from './telegram';
import type { Attachment, DeliveryResult, Notification, Notifier } from './types';

const MAX_RETRY_WAIT_SEC = 3;
const EXTENSION_TYPES: Record<string, string> = { webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png' };

export interface DispatchDeps {
  db: Db;
  storage: Storage;
  fetch: typeof fetch;
  env: Pick<Env, 'TELEGRAM_BOT_TOKEN' | 'SECRETS_ENCRYPTION_KEY' | 'NEXT_PUBLIC_APP_URL'>;
  sleep?: (ms: number) => Promise<void>;
}

interface IntegrationRow {
  id: string;
  kind: 'telegram_shared' | 'telegram_custom' | 'discord';
  target: string | null;
  secret_encrypted: string | null;
}

export const quotaNoticeText = (appUrl: string) =>
  `Your free limit of ${ENTITLEMENTS.free.monthlySubmissions} submissions this month is reached. ` +
  `New feedback is saved; upgrade to Pro to see it: ${appUrl}/billing`;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** null = skip silently; string = configuration error recorded on the integration. */
function buildNotifier(deps: DispatchDeps, row: IntegrationRow, pro: boolean): Notifier | string | null {
  const secret = () => decryptSecret(row.secret_encrypted ?? '', deps.env.SECRETS_ENCRYPTION_KEY);
  try {
    switch (row.kind) {
      case 'telegram_shared':
        if (!row.target) return 'missing chat id';
        return createTelegramNotifier({ token: deps.env.TELEGRAM_BOT_TOKEN, chatId: row.target, fetch: deps.fetch });
      case 'telegram_custom':
        if (!pro) return null;
        if (!row.target) return 'missing chat id';
        return createTelegramNotifier({ token: secret(), chatId: row.target, fetch: deps.fetch });
      case 'discord':
        return createDiscordNotifier({ webhookUrl: secret(), fetch: deps.fetch });
    }
  } catch {
    return 'secret unreadable';
  }
}

async function deliver(deps: DispatchDeps, notifier: Notifier, notification: Notification): Promise<DeliveryResult> {
  const first = await notifier.send(notification);
  if (first.ok || !first.retryable) return first;
  const waitSec = Math.min(first.retryAfterSec ?? 1, MAX_RETRY_WAIT_SEC);
  await (deps.sleep ?? defaultSleep)(waitSec * 1000);
  return notifier.send(notification);
}

async function record(db: Db, id: string, result: DeliveryResult | { ok: false; disable: false; error: string }) {
  if (result.ok) {
    await db.query('update public.integrations set last_delivered_at = now(), last_error = null where id = $1', [id]);
  } else if (result.disable) {
    await db.query('update public.integrations set enabled = false, last_error = $2 where id = $1', [id, result.error.slice(0, 500)]);
  } else {
    await db.query('update public.integrations set last_error = $2 where id = $1', [id, result.error.slice(0, 500)]);
  }
}

async function fanOut(deps: DispatchDeps, projectId: string, pro: boolean, notification: Notification) {
  const rows = await deps.db.query<IntegrationRow>(
    `select id, kind::text as kind, target, secret_encrypted
     from public.integrations where project_id = $1 and enabled order by created_at`,
    [projectId],
  );
  await Promise.allSettled(
    rows.map(async (row) => {
      const notifier = buildNotifier(deps, row, pro);
      if (notifier === null) return;
      if (typeof notifier === 'string') return record(deps.db, row.id, { ok: false, disable: false, error: notifier });
      return record(deps.db, row.id, await deliver(deps, notifier, notification));
    }),
  );
}

export async function dispatchFeedback(deps: DispatchDeps, feedbackId: string): Promise<void> {
  const [row] = await deps.db.query<{
    project_id: string;
    project_name: string;
    type: FeedbackType;
    message: string;
    email: string | null;
    screenshot_path: string | null;
    metadata: FeedbackMetadata;
    pro: boolean;
  }>(
    `select f.project_id, p.name as project_name, f.type::text as type, f.message, f.email,
            f.screenshot_path, f.metadata, public.is_pro(p.owner_id) as pro
     from public.feedback f join public.projects p on p.id = f.project_id
     where f.id = $1`,
    [feedbackId],
  );
  if (!row) return;

  let screenshot: Attachment | null = null;
  if (row.screenshot_path) {
    const file = await deps.storage.download(row.screenshot_path).catch(() => null);
    const extension = row.screenshot_path.split('.').pop() ?? 'webp';
    if (file) {
      screenshot = {
        data: file.data,
        contentType: EXTENSION_TYPES[extension] ?? file.contentType,
        filename: `screenshot.${extension}`,
      };
    }
  }

  await fanOut(deps, row.project_id, row.pro, {
    kind: 'feedback',
    projectName: row.project_name,
    type: row.type,
    message: row.message,
    email: row.email,
    metadata: row.metadata,
    dashboardUrl: `${deps.env.NEXT_PUBLIC_APP_URL}/projects/${row.project_id}/feedback?f=${feedbackId}`,
    screenshot,
  });
}

export async function dispatchQuotaNotice(deps: DispatchDeps, projectId: string): Promise<void> {
  const [row] = await deps.db.query<{ pro: boolean }>(
    'select public.is_pro(owner_id) as pro from public.projects where id = $1',
    [projectId],
  );
  if (!row) return;
  await fanOut(deps, projectId, row.pro, { kind: 'text', text: quotaNoticeText(deps.env.NEXT_PUBLIC_APP_URL) });
}
```
`apps/web/app/api/v1/widget/submit/route.ts`:
```ts
import { getDeps } from '@/lib/deps';
import { preflight } from '@/lib/http';
import { dispatchFeedback, dispatchQuotaNotice } from '@/lib/notify/dispatch';
import { handleSubmit } from '@/lib/widget/submit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const deps = await getDeps();
  return handleSubmit(
    {
      ...deps,
      notify: {
        feedback: (feedbackId) => dispatchFeedback(deps, feedbackId),
        quotaNotice: (projectId) => dispatchQuotaNotice(deps, projectId),
      },
    },
    request,
  );
}

export function OPTIONS(request: Request) {
  return preflight(request);
}
```

- [ ] **Step 4: Verify and commit**

Run: `pnpm --filter @dymcode/web test && pnpm typecheck`
Expected: PASS.
```bash
pnpm format
git add apps/web
git commit -m "feat(web): dispatch notifications and expose the submit route"
```

---

### Task 8: Shared bot webhook

**Files:**
- Create: `apps/web/lib/telegram/webhook.ts`, `apps/web/app/api/telegram/webhook/route.ts`, `apps/web/scripts/set-telegram-webhook.mjs`
- Modify: `apps/web/package.json` (script `telegram:set-webhook`)
- Test: `apps/web/lib/telegram/webhook.test.ts`

**Interfaces:**
- Consumes: `Db`, `Env`, `getDeps`.
- Produces:
  ```ts
  interface WebhookDeps { db: Db; fetch: typeof fetch;
    env: Pick<Env, 'TELEGRAM_WEBHOOK_SECRET' | 'TELEGRAM_BOT_TOKEN' | 'TELEGRAM_BOT_USERNAME'> }
  function handleTelegramWebhook(deps: WebhookDeps, request: Request): Promise<Response>;
  const EXPIRED_TEXT: string; const HELP_TEXT: string;
  ```

- [ ] **Step 1: Write failing tests**

`apps/web/lib/telegram/webhook.test.ts`:
```ts
import { createProject, createUser, withTx, type TestDb } from '@dymcode/db-tests/harness';
import { describe, expect, it, vi } from 'vitest';
import { EXPIRED_TEXT, HELP_TEXT, handleTelegramWebhook, type WebhookDeps } from './webhook';

const SECRET = 'webhook-secret-0123456789';

function setup(db: TestDb) {
  const sent: Array<{ chat_id: number | string; text: string }> = [];
  const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    sent.push(JSON.parse(String(init!.body)));
    return new Response(JSON.stringify({ ok: true }));
  });
  const deps: WebhookDeps = {
    db,
    fetch: fetchImpl as typeof fetch,
    env: { TELEGRAM_WEBHOOK_SECRET: SECRET, TELEGRAM_BOT_TOKEN: '111:BOT', TELEGRAM_BOT_USERNAME: 'dymcode_bot' },
  };
  return { deps, sent, fetchImpl };
}

const update = (text: string, chat: { id: number; type: string } = { id: 777, type: 'private' }, secret = SECRET) =>
  new Request('https://dymcode.dev/api/telegram/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': secret },
    body: JSON.stringify({ update_id: 1, message: { message_id: 1, text, chat } }),
  });

async function projectWithCode(db: TestDb, expired = false) {
  const owner = await createUser(db);
  const project = await createProject(db, owner, 'Acme Shop');
  const [row] = await db.query<{ code: string }>(
    `insert into public.telegram_link_codes (project_id, expires_at)
     values ($1, now() + ($2 || ' minutes')::interval) returning code`,
    [project.id, expired ? '-1' : '15'],
  );
  return { project, code: row!.code };
}

const integrationFor = (db: TestDb, projectId: string) =>
  db.query<{ target: string; enabled: boolean; last_error: string | null }>(
    `select target, enabled, last_error from public.integrations where project_id = $1 and kind = 'telegram_shared'`,
    [projectId],
  );

describe('handleTelegramWebhook', () => {
  it('rejects requests without the secret', () =>
    withTx(async (db) => {
      const { deps, fetchImpl } = setup(db);
      expect((await handleTelegramWebhook(deps, update('/start x', undefined, 'wrong'))).status).toBe(401);
      expect(fetchImpl).not.toHaveBeenCalled();
    }));

  it('links a private chat with a valid code', () =>
    withTx(async (db) => {
      const { deps, sent } = setup(db);
      const { project, code } = await projectWithCode(db);
      const res = await handleTelegramWebhook(deps, update(`/start ${code}`));
      expect(res.status).toBe(200);
      expect(await integrationFor(db, project.id)).toEqual([{ target: '777', enabled: true, last_error: null }]);
      expect(await db.query('select 1 from public.telegram_link_codes where code = $1', [code])).toEqual([]);
      expect(sent).toEqual([{ chat_id: 777, text: '✅ Connected to Acme Shop' }]);
    }));

  it('accepts the group form addressed to the bot and re-enables an existing integration', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const { project, code } = await projectWithCode(db);
      await db.query(
        `insert into public.integrations (project_id, kind, target, enabled, last_error)
         values ($1, 'telegram_shared', '1', false, 'Forbidden')`,
        [project.id],
      );
      await handleTelegramWebhook(deps, update(`/start@Dymcode_Bot ${code}`, { id: -100123, type: 'supergroup' }));
      expect(await integrationFor(db, project.id)).toEqual([{ target: '-100123', enabled: true, last_error: null }]);
    }));

  it('replies with an expiry notice for expired or unknown codes', () =>
    withTx(async (db) => {
      const { deps, sent } = setup(db);
      const { project, code } = await projectWithCode(db, true);
      await handleTelegramWebhook(deps, update(`/start ${code}`));
      await handleTelegramWebhook(deps, update('/start AAAAAAAAAAAA'));
      expect(await integrationFor(db, project.id)).toEqual([]);
      expect(sent.map((s) => s.text)).toEqual([EXPIRED_TEXT, EXPIRED_TEXT]);
    }));

  it('helps in private chats and stays silent in groups', () =>
    withTx(async (db) => {
      const { deps, sent } = setup(db);
      await handleTelegramWebhook(deps, update('hello'));
      await handleTelegramWebhook(deps, update('hello', { id: -5, type: 'group' }));
      await handleTelegramWebhook(deps, update('/start@other_bot AAAAAAAAAAAA', { id: -5, type: 'group' }));
      expect(sent.map((s) => s.text)).toEqual([HELP_TEXT]);
    }));

  it('always answers 200 to Telegram after the secret check', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      const bad = new Request('https://dymcode.dev/api/telegram/webhook', {
        method: 'POST',
        headers: { 'x-telegram-bot-api-secret-token': SECRET },
        body: '{not json',
      });
      expect((await handleTelegramWebhook(deps, bad)).status).toBe(200);
      error.mockRestore();
    }));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @dymcode/web test`
Expected: FAIL with unresolved `./webhook`.

- [ ] **Step 3: Implement**

`apps/web/lib/telegram/webhook.ts`:
```ts
import type { Db } from '../db/types';
import type { Env } from '../env';

export const EXPIRED_TEXT = 'This link has expired. Create a new one in your Dymcode dashboard.';
export const HELP_TEXT =
  'Hi! I deliver feedback from your Dymcode widget. Connect a project in your dashboard: Integrations → Telegram.';

export interface WebhookDeps {
  db: Db;
  fetch: typeof fetch;
  env: Pick<Env, 'TELEGRAM_WEBHOOK_SECRET' | 'TELEGRAM_BOT_TOKEN' | 'TELEGRAM_BOT_USERNAME'>;
}

interface Update {
  message?: { text?: string; chat?: { id: number; type: string } };
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Atomically claims an unexpired code and links the chat. Returns the project name, or null. */
async function linkChat(db: Db, code: string, chatId: string): Promise<string | null> {
  const [row] = await db.query<{ name: string }>(
    `with claimed as (
       delete from public.telegram_link_codes where code = $1 and expires_at > now() returning project_id
     ), linked as (
       insert into public.integrations (project_id, kind, target, enabled, last_error)
       select project_id, 'telegram_shared', $2, true, null from claimed
       on conflict (project_id, kind)
       do update set target = excluded.target, enabled = true, last_error = null
       returning project_id
     )
     select p.name from linked join public.projects p on p.id = linked.project_id`,
    [code, chatId],
  );
  return row?.name ?? null;
}

async function reply(deps: WebhookDeps, chatId: number, text: string) {
  await deps.fetch(`https://api.telegram.org/bot${deps.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
    signal: AbortSignal.timeout(5000),
  });
}

export async function handleTelegramWebhook(deps: WebhookDeps, request: Request): Promise<Response> {
  if (request.headers.get('x-telegram-bot-api-secret-token') !== deps.env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response('unauthorized', { status: 401 });
  }
  try {
    const update = (await request.json()) as Update;
    const text = update.message?.text?.trim();
    const chat = update.message?.chat;
    if (!text || !chat) return new Response('ok');

    const start = new RegExp(`^/start(?:@${escapeRegex(deps.env.TELEGRAM_BOT_USERNAME)})?\\s+([0-9A-Za-z]{12})$`, 'i');
    const match = start.exec(text);
    if (match) {
      const projectName = await linkChat(deps.db, match[1]!, String(chat.id));
      await reply(deps, chat.id, projectName ? `✅ Connected to ${projectName}` : EXPIRED_TEXT);
    } else if (chat.type === 'private') {
      await reply(deps, chat.id, HELP_TEXT);
    }
  } catch (error) {
    // Telegram retries non-2xx responses; log and acknowledge instead.
    console.error('[telegram/webhook]', error);
  }
  return new Response('ok');
}
```
Note: the `i` flag makes the bot-name match case-insensitive. Codes are generated in base62 by the
database, but links are sent in the exact case, so case-insensitive code matching is harmless: the SQL
comparison stays exact.

`apps/web/app/api/telegram/webhook/route.ts`:
```ts
import { getDeps } from '@/lib/deps';
import { handleTelegramWebhook } from '@/lib/telegram/webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return handleTelegramWebhook(await getDeps(), request);
}
```

`apps/web/scripts/set-telegram-webhook.mjs`:
```js
// Registers the shared bot webhook. Usage:
//   pnpm --filter @dymcode/web telegram:set-webhook https://your-domain/api/telegram/webhook
// Reads TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET from the environment or apps/web/.env.local.
// Never prints secrets.
import { existsSync, readFileSync } from 'node:fs';

const url = process.argv[2];
if (!url || !url.startsWith('https://')) {
  console.error('Usage: pnpm --filter @dymcode/web telegram:set-webhook https://<domain>/api/telegram/webhook');
  process.exit(1);
}

const file = new URL('../.env.local', import.meta.url);
const fromFile = existsSync(file)
  ? Object.fromEntries(
      readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .filter((line) => /^[A-Z_]+=/.test(line))
        .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim()]),
    )
  : {};
const env = { ...fromFile, ...process.env };
if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET) {
  console.error('TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET are required');
  process.exit(1);
}

const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    url,
    secret_token: env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ['message'],
    drop_pending_updates: true,
  }),
});
const data = await response.json();
console.log(data.ok ? `Webhook set to ${url}` : `Failed: ${data.description}`);
process.exit(data.ok ? 0 : 1);
```
Add to `apps/web/package.json` scripts: `"telegram:set-webhook": "node scripts/set-telegram-webhook.mjs"`.
Do **not** run it (there is no public URL yet).

- [ ] **Step 4: Verify and commit**

Run: `pnpm --filter @dymcode/web test && pnpm typecheck`
Expected: PASS.
```bash
pnpm format
git add apps/web
git commit -m "feat(web): link Telegram chats through the shared bot webhook"
```

---

### Task 9: Screenshot retention cron

**Files:**
- Create: `apps/web/lib/retention.ts`, `apps/web/app/api/cron/retention/route.ts`, `apps/web/vercel.json`
- Test: `apps/web/lib/retention.test.ts`

**Interfaces:**
- Consumes: `Db`, `Storage`, `createMemoryStorage`, `Env`, `json`, `getDeps`.
- Produces:
  ```ts
  const RETENTION_DAYS = { free: 30, pro: 365 } as const;
  interface RetentionDeps { db: Db; storage: Storage; env: Pick<Env, 'CRON_SECRET'>; clock?: () => number;
    batchSize?: number; budgetMs?: number }
  function runRetention(deps: RetentionDeps): Promise<{ removed: number; remaining: number }>;
  function handleRetention(deps: RetentionDeps, request: Request): Promise<Response>;
  ```

- [ ] **Step 1: Write failing tests**

`apps/web/lib/retention.test.ts`:
```ts
import { createProject, createUser, grantPro, withTx, type TestDb } from '@dymcode/db-tests/harness';
import { describe, expect, it } from 'vitest';
import { createMemoryStorage } from './storage';
import { handleRetention, runRetention, type RetentionDeps } from './retention';

async function screenshotFeedback(db: TestDb, projectId: string, ageDays: number, storage: ReturnType<typeof createMemoryStorage>) {
  const [row] = await db.query<{ id: string }>(
    `insert into public.feedback (project_id, type, message, created_at)
     values ($1, 'bug', 'x', now() - ($2 || ' days')::interval) returning id`,
    [projectId, String(ageDays)],
  );
  const path = `${projectId}/${row!.id}.webp`;
  await db.query('update public.feedback set screenshot_path = $1 where id = $2', [path, row!.id]);
  await storage.upload(path, new Uint8Array([1]), 'image/webp');
  return { id: row!.id, path };
}

async function project(db: TestDb, pro: boolean) {
  const owner = await createUser(db);
  if (pro) await grantPro(db, owner);
  return createProject(db, owner);
}

const pathOf = (db: TestDb, id: string) =>
  db.query<{ p: string | null }>('select screenshot_path as p from public.feedback where id = $1', [id]).then((r) => r[0]!.p);

describe('runRetention', () => {
  it('removes screenshots past the tier retention and keeps the rest', () =>
    withTx(async (db) => {
      const storage = createMemoryStorage();
      const free = await project(db, false);
      const pro = await project(db, true);
      const freeOld = await screenshotFeedback(db, free.id, 31, storage);
      const freeNew = await screenshotFeedback(db, free.id, 29, storage);
      const proMid = await screenshotFeedback(db, pro.id, 200, storage);
      const proOld = await screenshotFeedback(db, pro.id, 400, storage);
      const result = await runRetention({ db, storage, env: { CRON_SECRET: 'x'.repeat(16) } });
      expect(result).toEqual({ removed: 2, remaining: 0 });
      expect(await pathOf(db, freeOld.id)).toBeNull();
      expect(await pathOf(db, proOld.id)).toBeNull();
      expect(await pathOf(db, freeNew.id)).toBe(freeNew.path);
      expect(await pathOf(db, proMid.id)).toBe(proMid.path);
      expect([...storage.files.keys()].sort()).toEqual([freeNew.path, proMid.path].sort());
    }));

  it('keeps paths whose files Storage failed to remove, and works in batches', () =>
    withTx(async (db) => {
      const storage = createMemoryStorage();
      const free = await project(db, false);
      const items = [];
      for (let i = 0; i < 5; i++) items.push(await screenshotFeedback(db, free.id, 40 + i, storage));
      storage.failRemovals.add(items[0]!.path);
      const result = await runRetention({ db, storage, env: { CRON_SECRET: 'x'.repeat(16) }, batchSize: 2 });
      expect(result).toEqual({ removed: 4, remaining: 1 });
      expect(await pathOf(db, items[0]!.id)).toBe(items[0]!.path);
    }));
});

describe('handleRetention', () => {
  it('requires the cron secret', () =>
    withTx(async (db) => {
      const deps: RetentionDeps = { db, storage: createMemoryStorage(), env: { CRON_SECRET: 's'.repeat(20) } };
      const denied = await handleRetention(deps, new Request('https://dymcode.dev/api/cron/retention'));
      expect(denied.status).toBe(401);
      const ok = await handleRetention(
        deps,
        new Request('https://dymcode.dev/api/cron/retention', { headers: { authorization: `Bearer ${'s'.repeat(20)}` } }),
      );
      expect(ok.status).toBe(200);
      expect(await ok.json()).toEqual({ removed: 0, remaining: 0 });
    }));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @dymcode/web test`
Expected: FAIL with unresolved `./retention`.

- [ ] **Step 3: Implement**

`apps/web/lib/retention.ts`:
```ts
import type { Db } from './db/types';
import type { Env } from './env';
import { json } from './http';
import type { Storage } from './storage';

export const RETENTION_DAYS = { free: 30, pro: 365 } as const;

export interface RetentionDeps {
  db: Db;
  storage: Storage;
  env: Pick<Env, 'CRON_SECRET'>;
  clock?: () => number;
  batchSize?: number;
  budgetMs?: number;
}

const EXPIRED = `f.screenshot_path is not null
  and f.created_at < now() - make_interval(days => case when public.is_pro(p.owner_id) then $1::int else $2::int end)`;

/** Deletes expired screenshots in batches; rows keep their path if Storage did not remove the file. */
export async function runRetention(deps: RetentionDeps): Promise<{ removed: number; remaining: number }> {
  const clock = deps.clock ?? Date.now;
  const started = clock();
  const batchSize = deps.batchSize ?? 200;
  const budgetMs = deps.budgetMs ?? 25_000;
  const attempted: string[] = [];
  let removed = 0;

  while (clock() - started < budgetMs) {
    const rows = await deps.db.query<{ id: string; screenshot_path: string }>(
      `select f.id, f.screenshot_path from public.feedback f join public.projects p on p.id = f.project_id
       where ${EXPIRED} and not (f.id = any($3::uuid[]))
       order by f.created_at limit $4`,
      [RETENTION_DAYS.pro, RETENTION_DAYS.free, attempted, batchSize],
    );
    if (rows.length === 0) break;
    attempted.push(...rows.map((row) => row.id));

    let gone: string[];
    try {
      gone = await deps.storage.remove(rows.map((row) => row.screenshot_path));
    } catch (error) {
      console.error('[retention] storage remove failed', error);
      break;
    }
    if (gone.length > 0) {
      await deps.db.query('update public.feedback set screenshot_path = null where screenshot_path = any($1::text[])', [gone]);
      removed += gone.length;
    }
  }

  const [left] = await deps.db.query<{ n: number }>(
    `select count(*)::int as n from public.feedback f join public.projects p on p.id = f.project_id where ${EXPIRED}`,
    [RETENTION_DAYS.pro, RETENTION_DAYS.free],
  );
  return { removed, remaining: left?.n ?? 0 };
}

export async function handleRetention(deps: RetentionDeps, request: Request): Promise<Response> {
  if (request.headers.get('authorization') !== `Bearer ${deps.env.CRON_SECRET}`) {
    return json({ error: 'unauthorized' }, 401);
  }
  try {
    return json(await runRetention(deps), 200);
  } catch (error) {
    console.error('[retention]', error);
    return json({ error: 'internal' }, 500);
  }
}
```

`apps/web/app/api/cron/retention/route.ts`:
```ts
import { getDeps } from '@/lib/deps';
import { handleRetention } from '@/lib/retention';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: Request) {
  return handleRetention(await getDeps(), request);
}
```

`apps/web/vercel.json`:
```json
{
  "crons": [{ "path": "/api/cron/retention", "schedule": "0 3 * * *" }]
}
```

- [ ] **Step 4: Verify and commit**

Run: `pnpm --filter @dymcode/web test && pnpm typecheck`
Expected: PASS.
```bash
pnpm format
git add apps/web
git commit -m "feat(web): add daily screenshot retention cron"
```

---

### Task 10: Test mode, end-to-end tests, CI and docs

**Files:**
- Create: `apps/web/lib/test-mode.ts`, `apps/web/app/api/__test/outbox/route.ts`, `apps/web/app/api/__test/usage/route.ts`, `apps/web/public/__test/host.html`, `apps/web/playwright.config.ts`, `apps/web/e2e/api.spec.ts`
- Modify: `apps/web/lib/deps.ts`, `apps/web/package.json`, `.github/workflows/ci.yml`, `README.md`
- Test: `apps/web/lib/test-mode.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces:
  ```ts
  const E2E_PROJECT_KEY = 'pk_E2eE2eE2eE2e1234';  // Free, telegram_shared chat 424242 + discord
  const E2E_ORIGIN_PROJECT_KEY = 'pk_E2eE2eE2eOrig5678'; // allowed_origins = {https://allowed.example}
  const E2E_DISCORD_WEBHOOK = 'https://discord.com/api/webhooks/1/e2e';
  interface OutboxEntry { url: string; body: unknown }  // JSON bodies parsed; FormData → { fields, files }
  interface TestModeDeps extends AppDeps { outbox: OutboxEntry[]; ownerId: string }
  function createTestModeDeps(env: Env): Promise<TestModeDeps>;
  function assertTestModeAllowed(env: Env, nodeEnv: string | undefined): void; // throws in production
  ```
  `getDeps()` returns `TestModeDeps` when `DYMCODE_TEST_MODE=1`.

- [ ] **Step 1: Write the failing guard test**

`apps/web/lib/test-mode.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { VALID_ENV } from '@/test/fixtures';
import { parseEnv } from './env';
import { assertTestModeAllowed, createTestModeDeps, E2E_PROJECT_KEY } from './test-mode';

describe('test mode', () => {
  it('refuses to run in production', () => {
    const env = parseEnv({ ...VALID_ENV, DYMCODE_TEST_MODE: '1' });
    expect(() => assertTestModeAllowed(env, 'production')).toThrow(/production/);
    expect(() => assertTestModeAllowed(env, 'development')).not.toThrow();
  });

  it('boots an in-memory database with seeded projects and records outbound calls', async () => {
    const deps = await createTestModeDeps(parseEnv({ ...VALID_ENV, DYMCODE_TEST_MODE: '1' }));
    const [project] = await deps.db.query<{ name: string }>('select name from public.projects where public_key = $1', [
      E2E_PROJECT_KEY,
    ]);
    expect(project?.name).toBe('E2E Shop');
    await deps.fetch('https://api.telegram.org/botX/sendMessage', { method: 'POST', body: JSON.stringify({ text: 'hi' }) });
    expect(deps.outbox).toEqual([{ url: 'https://api.telegram.org/botX/sendMessage', body: { text: 'hi' } }]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @dymcode/web test`
Expected: FAIL with unresolved `./test-mode`.

- [ ] **Step 3: Implement test mode**

Run: `pnpm --filter @dymcode/web add -D @electric-sql/pglite @playwright/test`

`apps/web/lib/test-mode.ts`:
```ts
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { encryptSecret } from './crypto';
import type { Db, Row } from './db/types';
import type { AppDeps } from './deps';
import type { Env } from './env';
import { createMemoryStorage } from './storage';

export const E2E_PROJECT_KEY = 'pk_E2eE2eE2eE2e1234';
export const E2E_ORIGIN_PROJECT_KEY = 'pk_E2eE2eE2eOrig5678';
export const E2E_DISCORD_WEBHOOK = 'https://discord.com/api/webhooks/1/e2e';

export interface OutboxEntry {
  url: string;
  body: unknown;
}

export interface TestModeDeps extends AppDeps {
  outbox: OutboxEntry[];
  ownerId: string;
}

export function assertTestModeAllowed(env: Env, nodeEnv: string | undefined): void {
  if (env.DYMCODE_TEST_MODE === '1' && nodeEnv === 'production') {
    throw new Error('DYMCODE_TEST_MODE must never be enabled in production');
  }
}

/** Repo paths are resolved from the app directory (next dev and vitest both run in apps/web). */
async function openDatabase(): Promise<Db> {
  const root = join(process.cwd(), '..', '..', 'supabase');
  const db = new PGlite({ extensions: { pgcrypto }, parsers: { 20: (value: string) => value } });
  await db.exec(await readFile(join(root, 'tests', 'src', 'pglite-bootstrap.sql'), 'utf8'));
  const migrations = (await readdir(join(root, 'migrations'))).filter((f) => f.endsWith('.sql')).sort();
  for (const file of migrations) await db.exec(await readFile(join(root, 'migrations', file), 'utf8'));
  return { query: async <T extends Row>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows };
}

async function describeBody(body: BodyInit | null | undefined): Promise<unknown> {
  if (body instanceof FormData) {
    const fields: Record<string, string> = {};
    const files: Record<string, { name: string; type: string; size: number }> = {};
    for (const [key, value] of body.entries()) {
      if (typeof value === 'string') fields[key] = value;
      else files[key] = { name: value.name, type: value.type, size: value.size };
    }
    return { fields, files };
  }
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }
  return null;
}

export async function createTestModeDeps(env: Env): Promise<TestModeDeps> {
  const db = await openDatabase();
  const [owner] = await db.query<{ id: string }>(
    `insert into auth.users (id, instance_id, aud, role, email)
     values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'e2e@test.dev')
     returning id`,
  );
  const [project] = await db.query<{ id: string }>(
    `insert into public.projects (owner_id, name, public_key) values ($1, 'E2E Shop', $2) returning id`,
    [owner!.id, E2E_PROJECT_KEY],
  );
  await db.query(
    `insert into public.projects (owner_id, name, public_key, allowed_origins)
     values ($1, 'E2E Locked', $2, '{https://allowed.example}')`,
    [owner!.id, E2E_ORIGIN_PROJECT_KEY],
  );
  await db.query(
    `insert into public.integrations (project_id, kind, target, secret_encrypted) values
       ($1, 'telegram_shared', '424242', null),
       ($1, 'discord', null, $2)`,
    [project!.id, encryptSecret(E2E_DISCORD_WEBHOOK, env.SECRETS_ENCRYPTION_KEY)],
  );

  const outbox: OutboxEntry[] = [];
  const outboxFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    outbox.push({ url: String(input), body: await describeBody(init?.body) });
    return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
  }) as typeof fetch;

  return {
    db,
    storage: createMemoryStorage(),
    env,
    fetch: outboxFetch,
    after: (task) => {
      void task();
    },
    outbox,
    ownerId: owner!.id,
  };
}
```
(In test mode `after` runs the task immediately without awaiting: the response is not delayed, and the
E2E polls the outbox.)

Modify `apps/web/lib/deps.ts`. At the top of `buildDeps()`, after `const env = getEnv();`, insert:
```ts
  if (env.DYMCODE_TEST_MODE === '1') {
    const { assertTestModeAllowed, createTestModeDeps } = await import('./test-mode');
    assertTestModeAllowed(env, process.env.NODE_ENV);
    return createTestModeDeps(env);
  }
```

`apps/web/app/api/__test/outbox/route.ts`:
```ts
import { getDeps } from '@/lib/deps';
import { getEnv } from '@/lib/env';
import { json } from '@/lib/http';
import type { TestModeDeps } from '@/lib/test-mode';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function testDeps(): Promise<TestModeDeps | null> {
  if (getEnv().DYMCODE_TEST_MODE !== '1') return null;
  return (await getDeps()) as TestModeDeps;
}

/** E2E only: recorded outbound notifications plus stored feedback rows. */
export async function GET() {
  const deps = await testDeps();
  if (!deps) return json({ error: 'not found' }, 404);
  const feedback = await deps.db.query(
    `select f.id, p.public_key, f.message, f.screenshot_path, f.over_quota
     from public.feedback f join public.projects p on p.id = f.project_id order by f.created_at`,
  );
  return json({ outbox: deps.outbox, feedback }, 200);
}

export async function DELETE() {
  const deps = await testDeps();
  if (!deps) return json({ error: 'not found' }, 404);
  deps.outbox.length = 0;
  return json({ ok: true }, 200);
}
```

`apps/web/app/api/__test/usage/route.ts`:
```ts
import { getDeps } from '@/lib/deps';
import { getEnv } from '@/lib/env';
import { json } from '@/lib/http';
import type { TestModeDeps } from '@/lib/test-mode';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** E2E only: sets this month's submission count for the seeded owner. */
export async function POST(request: Request) {
  if (getEnv().DYMCODE_TEST_MODE !== '1') return json({ error: 'not found' }, 404);
  const deps = (await getDeps()) as TestModeDeps;
  const { count } = (await request.json()) as { count: number };
  await deps.db.query(
    `insert into public.usage_counters (owner_id, period, count)
     values ($1, date_trunc('month', now() at time zone 'utc')::date, $2)
     on conflict (owner_id, period) do update set count = excluded.count, quota_notice_sent = false`,
    [deps.ownerId, count],
  );
  return json({ ok: true }, 200);
}
```

`apps/web/public/__test/host.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Dymcode E2E host</title>
  </head>
  <body style="margin: 0; background: #fff">
    <h1 style="margin: 40px; font: 20px sans-serif">E2E host page</h1>
    <script>
      const key = new URLSearchParams(location.search).get('key') || 'pk_E2eE2eE2eE2e1234';
      const script = document.createElement('script');
      script.async = true;
      script.src = '/w/widget.js';
      script.dataset.projectId = key;
      document.head.append(script);
    </script>
  </body>
</html>
```

- [ ] **Step 4: Run the guard test**

Run: `pnpm --filter @dymcode/web test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Write the E2E tests**

Add to `apps/web/package.json` scripts: `"e2e": "playwright test"`.

`apps/web/playwright.config.ts`:
```ts
import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  workers: 1,
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm --filter @dymcode/widget build && node scripts/copy-widget.mjs && pnpm exec next dev --port ${PORT}`,
    url: `http://localhost:${PORT}/__test/host.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // Fake values only: test mode never talks to Supabase, Telegram or Discord.
    env: {
      DYMCODE_TEST_MODE: '1',
      NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
      SUPABASE_SERVICE_ROLE_KEY: 'e2e-service-role-key-000000',
      DATABASE_URL: 'postgresql://unused:unused@localhost:5432/unused',
      NEXT_PUBLIC_APP_URL: `http://localhost:${PORT}`,
      SECRETS_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
      IP_HASH_SALT: 'e2e-salt-0123456789abcdef',
      CRON_SECRET: 'e2e-cron-secret-0123456789',
      TELEGRAM_BOT_TOKEN: '123456:E2E_token',
      TELEGRAM_BOT_USERNAME: 'dymcode_bot',
      TELEGRAM_WEBHOOK_SECRET: 'e2e-webhook-secret-0123',
    },
  },
});
```
Make sure `next dev` does not load `apps/web/.env.local`, which holds real keys: the `env` block above
overrides every variable the app reads. Next.js gives `process.env` precedence over `.env.local`.

`apps/web/e2e/api.spec.ts`:
```ts
import { expect, test, type Page } from '@playwright/test';

interface State {
  outbox: Array<{ url: string; body: any }>;
  feedback: Array<{ id: string; public_key: string; message: string; screenshot_path: string | null; over_quota: boolean }>;
}

const state = async (page: Page): Promise<State> => (await page.request.get('/api/__test/outbox')).json();

async function submitFromWidget(page: Page, key: string, message: string) {
  await page.goto(`/__test/host.html?key=${key}`);
  await page.locator('[data-dymcode] .dc-trigger').click();
  await expect(page.locator('.dc-thumb')).toHaveAttribute('data-state', /ready|unavailable/, { timeout: 15_000 });
  await page.locator('.dc-message').fill(message);
  await page.waitForTimeout(2100); // bot guard
  await page.locator('.dc-send').click();
}

test.beforeEach(async ({ page }) => {
  await page.request.delete('/api/__test/outbox');
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

  const discord = outbox.find((entry) => entry.url.startsWith('https://discord.com/api/webhooks/1/e2e'))!;
  expect(JSON.parse(discord.body.fields.payload_json).embeds[0].description).toContain('E2E: checkout is broken');
  expect(discord.body.files['files[0]'].size).toBeGreaterThan(1000);

  const row = feedback.find((f) => f.message === 'E2E: checkout is broken')!;
  expect(row.over_quota).toBe(false);
  expect(row.screenshot_path).toMatch(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(webp|jpg)$/);
});

test('the 21st Free submission is hidden and triggers one quota notice per channel', async ({ page }) => {
  await page.request.post('/api/__test/usage', { data: { count: 20 } });
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
  await submitFromWidget(page, 'pk_E2eE2eE2eOrig5678', 'E2E: wrong origin');
  await expect(page.locator('.dc-status')).toHaveText("Couldn't send. Try again later.");
  await page.waitForTimeout(1000);
  const { outbox, feedback } = await state(page);
  expect(outbox).toEqual([]);
  expect(feedback.find((f) => f.message === 'E2E: wrong origin')).toBeUndefined();
});
```

- [ ] **Step 6: Run the E2E suite**

Run: `pnpm --filter @dymcode/web exec playwright install chromium`
Run: `pnpm --filter @dymcode/web e2e`
Expected: 3 passed. Make sure no server is left running afterwards.

If `next dev` fails to load PGlite (WASM) through bundling, confirm `serverExternalPackages` contains
`@electric-sql/pglite` (Task 2). If it still fails, report the exact error (NEEDS_CONTEXT). Do not
switch the E2E to mocks.

- [ ] **Step 7: Update CI**

In `.github/workflows/ci.yml`:
- `check` job: after the existing `pnpm --filter @dymcode/widget check:bundle` step, add
  ```yaml
      - run: pnpm --filter @dymcode/web build
  ```
- `db-supabase` job: after the existing `pnpm db:test` step (which has `DB_TEST_TARGET: supabase`), add
  ```yaml
      - run: pnpm --filter @dymcode/web test
        env:
          DB_TEST_TARGET: supabase
  ```
- `e2e` job: after the widget E2E step, add
  ```yaml
      - run: pnpm --filter @dymcode/web exec playwright install --with-deps chromium
      - run: pnpm --filter @dymcode/web e2e
  ```
  and extend the existing failure artifact upload `path:` with `apps/web/playwright-report` and `apps/web/test-results`.

(`pnpm test` in the `check` job already runs `@dymcode/web` unit tests on PGlite via turbo.)

- [ ] **Step 8: Update the README**

Add a section after "Widget":
````markdown
## Web app and API (`apps/web`)

Next.js app serving the public widget API, notifications, the Telegram webhook and the retention cron.

```bash
pnpm --filter @dymcode/web dev     # builds the widget, copies it to public/w/, starts next dev (needs apps/web/.env.local)
pnpm --filter @dymcode/web test    # unit + DB tests on PGlite (no Docker, no .env.local needed)
pnpm --filter @dymcode/web e2e     # widget → API → notification E2E in test mode (fake env, in-memory DB)
```

Endpoints: `GET /api/v1/widget/config`, `POST /api/v1/widget/submit`, `POST /api/telegram/webhook`,
`GET /api/cron/retention` (Vercel Cron, `Authorization: Bearer $CRON_SECRET`).

After deploying, register the shared bot webhook:

```bash
pnpm --filter @dymcode/web telegram:set-webhook https://<your-domain>/api/telegram/webhook
```
````
Also add `apps/web` to the "Layout" list.

- [ ] **Step 9: Verify and commit**

Run: `pnpm format && pnpm format:check && pnpm typecheck && pnpm test`
Expected: PASS.
```bash
git add apps/web .github README.md pnpm-lock.yaml
git commit -m "test(web): add test mode, end-to-end tests, CI jobs and docs"
```
