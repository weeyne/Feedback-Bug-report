# Phase 5: Billing with Paddle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sell Pro ($9/month subscription, $49 Lifetime) through Paddle Billing, with signed webhooks as the single source of truth for Pro status.

**Architecture:**
- **Data.** A migration renames the Lemon Squeezy columns of `subscriptions` to Paddle ones, adds an event-ordering timestamp and a scheduled-cancel flag, and rewrites `public.is_pro()`.
- **Paddle client.** A small typed Paddle API client (`lib/billing/paddle.ts`, injected `fetch`) serves three callers:
  - the checkout use case: a server-created transaction, opened in the browser by `@paddle/paddle-js`;
  - the customer-portal use case;
  - account deletion.
- **Webhook.** `/api/billing/webhook` verifies `Paddle-Signature` and applies idempotent, order-guarded upserts.
- **Configuration.** Billing is enabled only when all six Paddle env vars are set; otherwise the phase-4 "coming soon" UI stays.

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, Paddle Billing API + `@paddle/paddle-js`, postgres.js, zod 4, next-intl, Vitest + PGlite, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-23-billing-paddle-design.md` (parents: `docs/superpowers/specs/2026-09-21-dymcode-design.md`, `docs/superpowers/specs/2026-09-22-dashboard-design.md`).

## Global Constraints

- **Language and style:**
  - All code, comments, identifiers and docs are in English.
  - Every user-visible string goes through next-intl with keys in BOTH `apps/web/messages/en.json` and `apps/web/messages/ru.json`. Tests enforce identical key sets, no empty strings, and ICU validity; a literal `{`, `}` or `<` in a message must be escaped with `'…'`.
  - Run `pnpm format` before every commit.
  - Commit messages end with a blank line, then exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Next.js 16 differs from older versions.** Read the relevant guide in `apps/web/node_modules/next/dist/docs/` before writing Next-specific code.
- **UI components** in `apps/web/components/ui/` are shadcn on **Base UI**:
  - there is no `asChild`; use the `render` prop, e.g. `<DialogTrigger render={<Button />}>`;
  - a `Button` rendering a link needs `render={<Link … />}` and `nativeButton={false}`.
- **Environment and secrets:**
  - Docker does not work locally: never run `supabase start`. DB tests run on PGlite locally and on real Supabase in CI.
  - `apps/web/.env.local` holds REAL secrets: never read, print, modify or commit it. Tests and E2E must not depend on it.
  - `next build`/`next dev` may rewrite `apps/web/next-env.d.ts`; restore it with `git checkout -- apps/web/next-env.d.ts`.
- **Data access:**
  - Dashboard reads/writes of user data go through `withUser` (`apps/web/lib/db/with-user.ts`).
  - Service-role queries (plain `deps.db.query`) are allowed for: the user's own `subscriptions` rows, Pro status (`public.is_pro`), `hit_rate_limit`, and the billing webhook.
  - Never call `deps.db` or `withUser` inside a `withUser` callback: production `Db.transaction` throws on nesting.
- **Pro status** is derived ONLY by SQL `public.is_pro(uuid)`. Pro-granting rows:
  - `pro_lifetime` with status `paid`;
  - `pro_monthly` with status `active`, `trialing` or `past_due`.
- **Webhooks are the only writers of `subscriptions`.** Browser events (`checkout.completed`) never grant Pro.
- **Secrets never reach the browser or logs:**
  - `PADDLE_API_KEY` and `PADDLE_WEBHOOK_SECRET` are server-only;
  - webhook logs contain only `event_id`, `event_type` and Paddle ids, never emails or payloads.
- **Limits:**
  - checkout and portal server actions: 10 per minute per user (`hit_rate_limit('dashboard:<action>:<userId>', 10, 60)`);
  - webhook signature tolerance: 300 s;
  - activation polling: every 2 s, at most 60 s;
  - Paddle API timeout: 10 s.
- **Billing is optional configuration.**
  - Billing is enabled only when all six vars are set: `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `PADDLE_PRICE_MONTHLY`, `PADDLE_PRICE_LIFETIME`, `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`, `NEXT_PUBLIC_PADDLE_ENV`.
  - A partial set is a configuration error. No set means billing is disabled, and the phase-4 "coming soon" UI stays.
- **Test mode** (`DYMCODE_TEST_MODE=1`) stays impossible in production. E2E never loads the real Paddle.js.
- **Deviation from the spec:** Paddle webhook fixtures are TypeScript builders in `apps/web/test/paddle-fixtures.ts`, not static JSON files. They need per-test user ids and timestamps.

## File Map

| Path | Responsibility |
|---|---|
| `supabase/migrations/20260923000100_paddle_billing.sql` | Column renames, new columns, new `is_pro()` |
| `supabase/tests/src/functions.test.ts`, `core-tables.test.ts` | `is_pro()` truth table, new columns |
| `apps/web/lib/env.ts` | Optional Paddle env group |
| `apps/web/lib/billing/config.ts` | `billingConfig(env)` |
| `apps/web/lib/billing/paddle.ts` | Paddle API client |
| `apps/web/lib/billing/signature.ts` | `Paddle-Signature` verification |
| `apps/web/lib/billing/subscriptions.ts` | Reading a user's billing state (`billingOverview`) |
| `apps/web/lib/billing/webhook.ts` | Webhook handler |
| `apps/web/app/api/billing/webhook/route.ts` | Route |
| `apps/web/lib/billing/checkout.ts` | `startCheckout`, `openPortal`, `billingStatus` use cases |
| `apps/web/lib/dashboard/rate-limit.ts` | Shared `rateLimited()` helper (extracted from integrations) |
| `apps/web/lib/dashboard/account.ts` | Cancel subscription on account deletion |
| `apps/web/app/app/billing/page.tsx`, `components/app/billing/*` | Billing page UI |
| `apps/web/app/(marketing)/refund/page.tsx` + terms/privacy/footer/sitemap/landing | Legal texts and pricing links |
| `apps/web/test/paddle-fixtures.ts` | Webhook fixture builders + signer |
| `apps/web/lib/test-mode.ts`, `playwright.config.ts`, `e2e/billing.spec.ts` | E2E |
| `docs/deploy.md` | "Billing (Paddle)" setup section |

---

### Task 1: Database: Paddle columns and the new `is_pro()`

**Files:**
- Create: `supabase/migrations/20260923000100_paddle_billing.sql`
- Modify: `supabase/tests/src/functions.test.ts`
- Test: `supabase/tests/src/billing-columns.test.ts`

**Interfaces:**
- Produces (SQL): `public.subscriptions` columns:
  - `paddle_customer_id text`;
  - `paddle_subscription_id text unique`;
  - `paddle_transaction_id text unique`;
  - `paddle_occurred_at timestamptz`;
  - `cancel_at_period_end boolean not null default false`.

  `public.is_pro(uuid)` uses the new truth table (Global Constraints).
- `grantPro(db, userId, { plan?, status?, periodEnd? })` in `supabase/tests/src/fixtures.ts` is unchanged (status is free text).

- [ ] **Step 1: Write the failing tests**

In `supabase/tests/src/functions.test.ts` replace the `it.each([...])` table of `describe('is_pro')` with:
```ts
  it.each([
    ['pro_lifetime', 'paid', null, true],
    ['pro_lifetime', 'refunded', null, false],
    ['pro_monthly', 'active', '1 month', true],
    ['pro_monthly', 'trialing', '7 days', true],
    ['pro_monthly', 'past_due', '-1 day', true],
    ['pro_monthly', 'paused', '1 day', false],
    ['pro_monthly', 'canceled', '1 day', false],
    ['pro_monthly', 'canceled', '-1 day', false],
  ] as const)('%s / %s (period end %s) -> %s', (plan, status, periodEnd, expected) =>
```
(Keep the test body unchanged.)

Create `supabase/tests/src/billing-columns.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { withTx } from './db';
import { createUser } from './fixtures';

describe('subscriptions Paddle columns', () => {
  it('has the Paddle columns and no Lemon Squeezy columns', () =>
    withTx(async (db) => {
      const rows = await db.query<{ column_name: string }>(
        `select column_name from information_schema.columns
         where table_schema = 'public' and table_name = 'subscriptions' order by column_name`,
      );
      const names = rows.map((r) => r.column_name);
      for (const name of [
        'paddle_customer_id',
        'paddle_subscription_id',
        'paddle_transaction_id',
        'paddle_occurred_at',
        'cancel_at_period_end',
      ]) {
        expect(names).toContain(name);
      }
      expect(names.filter((n) => n.startsWith('ls_'))).toEqual([]);
    }));

  it('keeps Paddle ids unique and defaults cancel_at_period_end to false', () =>
    withTx(async (db) => {
      const uid = await createUser(db);
      await db.query(
        `insert into public.subscriptions (user_id, plan, status, paddle_subscription_id)
         values ($1, 'pro_monthly', 'active', 'sub_1')`,
        [uid],
      );
      const [row] = await db.query<{ cancel_at_period_end: boolean }>(
        `select cancel_at_period_end from public.subscriptions where paddle_subscription_id = 'sub_1'`,
      );
      expect(row).toEqual({ cancel_at_period_end: false });
      await expect(
        db.query(
          `insert into public.subscriptions (user_id, plan, status, paddle_subscription_id)
           values ($1, 'pro_monthly', 'active', 'sub_1')`,
          [uid],
        ),
      ).rejects.toThrow();
    }));
});
```
Note: `withTx` runs each test in a transaction that is rolled back. A failing statement inside it aborts the transaction, so keep the rejected insert as the LAST statement of its test.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm db:test`
Expected: FAIL. `trialing`/`paused`/`canceled` expectations differ, and the Paddle columns do not exist.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260923000100_paddle_billing.sql`:
```sql
-- Phase 5: Paddle replaces Lemon Squeezy (Lemon Squeezy cannot pay out to Ukraine).
-- No rows use the Lemon Squeezy columns yet, so they are renamed in place.
alter table public.subscriptions rename column ls_customer_id to paddle_customer_id;
alter table public.subscriptions rename column ls_subscription_id to paddle_subscription_id;
alter table public.subscriptions rename column ls_order_id to paddle_transaction_id;

-- occurred_at of the Paddle event that last wrote the row: older events are ignored.
alter table public.subscriptions add column paddle_occurred_at timestamptz;
-- True while a cancellation is scheduled for the end of the billing period.
alter table public.subscriptions
  add column cancel_at_period_end boolean not null default false;

create index subscriptions_paddle_customer_id_idx on public.subscriptions (paddle_customer_id);

-- Single source of truth for Pro status. Paddle keeps a cancelled subscription 'active' until the
-- period ends and only then sends 'canceled', so no date check is needed.
create or replace function public.is_pro(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.subscriptions s
    where s.user_id = p_uid
      and (
        (s.plan = 'pro_lifetime' and s.status = 'paid')
        or (s.plan = 'pro_monthly' and s.status in ('active', 'trialing', 'past_due'))
      )
  );
$$;
```
`create or replace` keeps the function's existing grants/revokes from `20260921000300_functions.sql`. Also update the comment in `20260921000200_core_tables.sql`? No: never edit applied migrations.

- [ ] **Step 4: Verify**

Run: `pnpm db:test`
Expected: PASS. Then `pnpm --filter @dymcode/web test`. Expected PASS: no web code references the old column names; if any test does, update it to the new names.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add supabase
git commit -m "feat(db): switch subscriptions to Paddle and rewrite is_pro"
```

---

### Task 2: Billing configuration and the Paddle API client

**Files:**
- Modify: `apps/web/lib/env.ts`, `apps/web/lib/env.test.ts`, `apps/web/test/fixtures.ts`
- Create: `apps/web/lib/billing/config.ts`, `apps/web/lib/billing/paddle.ts`
- Test: `apps/web/lib/billing/config.test.ts`, `apps/web/lib/billing/paddle.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // lib/env.ts: Env gains optional PADDLE_API_KEY, PADDLE_WEBHOOK_SECRET, PADDLE_PRICE_MONTHLY,
  // PADDLE_PRICE_LIFETIME, NEXT_PUBLIC_PADDLE_CLIENT_TOKEN, NEXT_PUBLIC_PADDLE_ENV ('sandbox' | 'production')
  // test/fixtures.ts
  const PADDLE_ENV: Record<string, string>; // a complete fake Paddle group (sandbox)
  // lib/billing/config.ts
  interface BillingConfig { apiKey: string; webhookSecret: string; priceMonthly: string; priceLifetime: string;
    clientToken: string; environment: 'sandbox' | 'production'; apiBase: string }
  function billingConfig(env: Env): BillingConfig | null;
  // lib/billing/paddle.ts
  class PaddleError extends Error { status: number; code: string | null }
  interface PaddleClient {
    createTransaction(input: { priceId: string; userId: string; customerId?: string | null }): Promise<{ id: string }>;
    cancelSubscription(id: string, when: 'next_billing_period' | 'immediately'): Promise<void>;
    createPortalSession(customerId: string, subscriptionIds: string[]): Promise<string>;
  }
  function createPaddleClient(config: BillingConfig, fetchFn: typeof fetch): PaddleClient;
  function paddleFromDeps(deps: { env: Env; fetch: typeof fetch }): PaddleClient | null;
  ```

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/test/fixtures.ts`:
```ts
/** A complete fake Paddle group (billing enabled, sandbox). */
export const PADDLE_ENV = {
  PADDLE_API_KEY: 'pdl_sdbx_apikey_0123456789abcdefghij',
  PADDLE_WEBHOOK_SECRET: 'pdl_ntfset_0123456789abcdef',
  PADDLE_PRICE_MONTHLY: 'pri_monthly0000000000000000',
  PADDLE_PRICE_LIFETIME: 'pri_lifetime000000000000000',
  NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: 'test_0123456789abcdef0123',
  NEXT_PUBLIC_PADDLE_ENV: 'sandbox',
};
```

Add to `apps/web/lib/env.test.ts` inside `describe('parseEnv')` (import `PADDLE_ENV` too):
```ts
  it('accepts no Paddle group or a complete one, and rejects a partial one', () => {
    expect(parseEnv(VALID_ENV).PADDLE_API_KEY).toBeUndefined();
    expect(parseEnv({ ...VALID_ENV, ...PADDLE_ENV }).NEXT_PUBLIC_PADDLE_ENV).toBe('sandbox');
    const { PADDLE_WEBHOOK_SECRET: _, ...partial } = PADDLE_ENV;
    expect(() => parseEnv({ ...VALID_ENV, ...partial })).toThrow(/PADDLE_WEBHOOK_SECRET/);
    expect(() => parseEnv({ ...VALID_ENV, ...partial })).not.toThrow(/pdl_sdbx/);
    expect(() =>
      parseEnv({ ...VALID_ENV, ...PADDLE_ENV, NEXT_PUBLIC_PADDLE_ENV: 'live' }),
    ).toThrow(/NEXT_PUBLIC_PADDLE_ENV/);
  });
```

`apps/web/lib/billing/config.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { PADDLE_ENV, VALID_ENV } from '@/test/fixtures';
import { parseEnv } from '../env';
import { billingConfig } from './config';

describe('billingConfig', () => {
  it('is null when billing is not configured', () => {
    expect(billingConfig(parseEnv(VALID_ENV))).toBeNull();
  });

  it('picks the sandbox or production API base', () => {
    expect(billingConfig(parseEnv({ ...VALID_ENV, ...PADDLE_ENV }))).toEqual({
      apiKey: PADDLE_ENV.PADDLE_API_KEY,
      webhookSecret: PADDLE_ENV.PADDLE_WEBHOOK_SECRET,
      priceMonthly: PADDLE_ENV.PADDLE_PRICE_MONTHLY,
      priceLifetime: PADDLE_ENV.PADDLE_PRICE_LIFETIME,
      clientToken: PADDLE_ENV.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN,
      environment: 'sandbox',
      apiBase: 'https://sandbox-api.paddle.com',
    });
    const live = parseEnv({
      ...VALID_ENV,
      ...PADDLE_ENV,
      NEXT_PUBLIC_PADDLE_ENV: 'production',
      NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: 'live_0123456789abcdef0123',
    });
    expect(billingConfig(live)?.apiBase).toBe('https://api.paddle.com');
  });
});
```

`apps/web/lib/billing/paddle.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { PADDLE_ENV, VALID_ENV } from '@/test/fixtures';
import { parseEnv } from '../env';
import { billingConfig } from './config';
import { createPaddleClient, PaddleError } from './paddle';

const config = billingConfig(parseEnv({ ...VALID_ENV, ...PADDLE_ENV }))!;

function fake(respond: (url: string, body: unknown) => Response) {
  const calls: Array<{ url: string; method: string; body: unknown; auth: string | null }> = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    const url = String(input);
    calls.push({
      url,
      method: init?.method ?? 'GET',
      body,
      auth: new Headers(init?.headers).get('authorization'),
    });
    return respond(url, body);
  }) as typeof fetch;
  return { calls, client: createPaddleClient(config, fetchFn) };
}

describe('Paddle client', () => {
  it('creates a transaction with the price, user id and known customer', async () => {
    const { calls, client } = fake(() => Response.json({ data: { id: 'txn_1' } }, { status: 201 }));
    expect(
      await client.createTransaction({ priceId: 'pri_x', userId: 'u1', customerId: 'ctm_1' }),
    ).toEqual({ id: 'txn_1' });
    expect(calls[0]).toEqual({
      url: 'https://sandbox-api.paddle.com/transactions',
      method: 'POST',
      body: {
        items: [{ price_id: 'pri_x', quantity: 1 }],
        custom_data: { user_id: 'u1' },
        customer_id: 'ctm_1',
      },
      auth: `Bearer ${PADDLE_ENV.PADDLE_API_KEY}`,
    });
  });

  it('omits customer_id when unknown', async () => {
    const { calls, client } = fake(() => Response.json({ data: { id: 'txn_2' } }));
    await client.createTransaction({ priceId: 'pri_x', userId: 'u1' });
    expect(calls[0]!.body).not.toHaveProperty('customer_id');
  });

  it('cancels a subscription and treats an already-cancelled one as success', async () => {
    const ok = fake(() => Response.json({ data: { id: 'sub_1' } }));
    await ok.client.cancelSubscription('sub_1', 'next_billing_period');
    expect(ok.calls[0]).toMatchObject({
      url: 'https://sandbox-api.paddle.com/subscriptions/sub_1/cancel',
      method: 'POST',
      body: { effective_from: 'next_billing_period' },
    });
    const already = fake(() =>
      Response.json(
        { error: { code: 'subscription_locked_pending_changes', detail: 'x' } },
        { status: 400 },
      ),
    );
    await expect(already.client.cancelSubscription('sub_1', 'immediately')).resolves.toBeUndefined();
    const canceled = fake(() =>
      Response.json({ error: { code: 'subscription_is_canceled', detail: 'x' } }, { status: 400 }),
    );
    await expect(canceled.client.cancelSubscription('sub_1', 'immediately')).resolves.toBeUndefined();
  });

  it('returns the portal overview URL', async () => {
    const { calls, client } = fake(() =>
      Response.json({ data: { urls: { general: { overview: 'https://portal.example/o' } } } }),
    );
    expect(await client.createPortalSession('ctm_1', ['sub_1'])).toBe('https://portal.example/o');
    expect(calls[0]).toMatchObject({
      url: 'https://sandbox-api.paddle.com/customers/ctm_1/portal-sessions',
      body: { subscription_ids: ['sub_1'] },
    });
  });

  it('throws PaddleError without leaking the API key', async () => {
    const { client } = fake(() =>
      Response.json({ error: { code: 'forbidden', detail: 'no' } }, { status: 403 }),
    );
    const error = await client.createTransaction({ priceId: 'p', userId: 'u' }).catch((e) => e);
    expect(error).toBeInstanceOf(PaddleError);
    expect(error).toMatchObject({ status: 403, code: 'forbidden' });
    expect(String(error.message)).not.toContain(PADDLE_ENV.PADDLE_API_KEY);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @dymcode/web test`
Expected: FAIL: unresolved `./config`, `./paddle`, and the env test fails.

- [ ] **Step 3: Implement**

In `apps/web/lib/env.ts`:
- Add these optional fields to `EnvSchema`:
  ```ts
  PADDLE_API_KEY: z.string().min(20).optional(),
  PADDLE_WEBHOOK_SECRET: z.string().min(16).optional(),
  PADDLE_PRICE_MONTHLY: z.string().regex(/^pri_\w+$/).optional(),
  PADDLE_PRICE_LIFETIME: z.string().regex(/^pri_\w+$/).optional(),
  NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: z.string().regex(/^(test|live)_\w+$/).optional(),
  NEXT_PUBLIC_PADDLE_ENV: z.enum(['sandbox', 'production']).optional(),
  ```
- Wrap the schema so a partial group fails, naming each missing variable:
  ```ts
  export const PADDLE_VARS = [
    'PADDLE_API_KEY',
    'PADDLE_WEBHOOK_SECRET',
    'PADDLE_PRICE_MONTHLY',
    'PADDLE_PRICE_LIFETIME',
    'NEXT_PUBLIC_PADDLE_CLIENT_TOKEN',
    'NEXT_PUBLIC_PADDLE_ENV',
  ] as const;

  const EnvSchemaWithGroups = EnvSchema.superRefine((env, ctx) => {
    const present = PADDLE_VARS.filter((name) => env[name] !== undefined);
    if (present.length === 0 || present.length === PADDLE_VARS.length) return;
    for (const name of PADDLE_VARS) {
      if (env[name] === undefined) {
        ctx.addIssue({ code: 'custom', path: [name], message: 'required when billing is configured' });
      }
    }
  });
  ```
  Use `EnvSchemaWithGroups` in `parseEnv`; `Env` stays `z.infer<typeof EnvSchema>`.
- Treat an empty string as unset for these six (Vercel sometimes stores empty values). Add a small `z.preprocess((v) => (v === '' ? undefined : v), …)` around each of the six schemas.

`apps/web/lib/billing/config.ts`:
```ts
import type { Env } from '../env';

export interface BillingConfig {
  apiKey: string;
  webhookSecret: string;
  priceMonthly: string;
  priceLifetime: string;
  clientToken: string;
  environment: 'sandbox' | 'production';
  apiBase: string;
}

/** Null when billing is not configured (parseEnv already rejected a partial group). */
export function billingConfig(env: Env): BillingConfig | null {
  if (
    !env.PADDLE_API_KEY ||
    !env.PADDLE_WEBHOOK_SECRET ||
    !env.PADDLE_PRICE_MONTHLY ||
    !env.PADDLE_PRICE_LIFETIME ||
    !env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ||
    !env.NEXT_PUBLIC_PADDLE_ENV
  ) {
    return null;
  }
  return {
    apiKey: env.PADDLE_API_KEY,
    webhookSecret: env.PADDLE_WEBHOOK_SECRET,
    priceMonthly: env.PADDLE_PRICE_MONTHLY,
    priceLifetime: env.PADDLE_PRICE_LIFETIME,
    clientToken: env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN,
    environment: env.NEXT_PUBLIC_PADDLE_ENV,
    apiBase:
      env.NEXT_PUBLIC_PADDLE_ENV === 'sandbox'
        ? 'https://sandbox-api.paddle.com'
        : 'https://api.paddle.com',
  };
}
```

`apps/web/lib/billing/paddle.ts`:
```ts
import type { Env } from '../env';
import { billingConfig, type BillingConfig } from './config';

const TIMEOUT_MS = 10_000;
// Cancelling twice is not an error for us.
const ALREADY_CANCELLED = new Set(['subscription_is_canceled', 'subscription_locked_pending_changes']);

export class PaddleError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
  ) {
    super(`Paddle API error ${status}${code ? ` (${code})` : ''}`);
    this.name = 'PaddleError';
  }
}

export interface PaddleClient {
  createTransaction(input: {
    priceId: string;
    userId: string;
    customerId?: string | null;
  }): Promise<{ id: string }>;
  cancelSubscription(id: string, when: 'next_billing_period' | 'immediately'): Promise<void>;
  createPortalSession(customerId: string, subscriptionIds: string[]): Promise<string>;
}

export function createPaddleClient(config: BillingConfig, fetchFn: typeof fetch): PaddleClient {
  async function call<T>(path: string, body: unknown): Promise<T> {
    const response = await fetchFn(`${config.apiBase}${path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const json = (await response.json().catch(() => ({}))) as {
      data?: T;
      error?: { code?: string };
    };
    if (!response.ok || !json.data) throw new PaddleError(response.status, json.error?.code ?? null);
    return json.data;
  }

  return {
    async createTransaction({ priceId, userId, customerId }) {
      const data = await call<{ id: string }>('/transactions', {
        items: [{ price_id: priceId, quantity: 1 }],
        custom_data: { user_id: userId },
        ...(customerId ? { customer_id: customerId } : {}),
      });
      return { id: data.id };
    },
    async cancelSubscription(id, when) {
      try {
        await call(`/subscriptions/${encodeURIComponent(id)}/cancel`, { effective_from: when });
      } catch (error) {
        if (error instanceof PaddleError && error.code && ALREADY_CANCELLED.has(error.code)) return;
        throw error;
      }
    },
    async createPortalSession(customerId, subscriptionIds) {
      const data = await call<{ urls: { general: { overview: string } } }>(
        `/customers/${encodeURIComponent(customerId)}/portal-sessions`,
        { subscription_ids: subscriptionIds },
      );
      return data.urls.general.overview;
    },
  };
}

export function paddleFromDeps(deps: { env: Env; fetch: typeof fetch }): PaddleClient | null {
  const config = billingConfig(deps.env);
  return config ? createPaddleClient(config, deps.fetch) : null;
}
```
Before finalizing, check the Paddle Billing API docs (developer.paddle.com) for these three endpoints: request fields, the `error.code` values for cancelling an already-cancelled subscription, and the portal-session response shape. If they differ, adapt the code and the test together and note it in the report.

- [ ] **Step 4: Verify**

Run: `pnpm --filter @dymcode/web test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add apps/web
git commit -m "feat(web): add Paddle billing config and API client"
```

---

### Task 3: Paddle webhook

**Files:**
- Create: `apps/web/lib/billing/signature.ts`, `apps/web/lib/billing/subscriptions.ts`, `apps/web/lib/billing/webhook.ts`, `apps/web/app/api/billing/webhook/route.ts`, `apps/web/test/paddle-fixtures.ts`
- Test: `apps/web/lib/billing/signature.test.ts`, `apps/web/lib/billing/webhook.test.ts`

**Interfaces:**
- Consumes: `billingConfig`, `createPaddleClient`, `PaddleClient` (Task 2); `Db`; `json` from `lib/http.ts`.
- Produces:
  ```ts
  // lib/billing/signature.ts
  function signPaddle(rawBody: string, secret: string, ts: number): string; // header value "ts=…;h1=…"
  function verifyPaddleSignature(rawBody: string, header: string | null, secret: string, nowMs: number): boolean;
  // lib/billing/subscriptions.ts
  const PRO_MONTHLY_STATUSES: readonly ['active', 'trialing', 'past_due'];
  interface SubscriptionRow { id: string; plan: 'pro_monthly' | 'pro_lifetime'; status: string;
    paddle_customer_id: string | null; paddle_subscription_id: string | null; paddle_transaction_id: string | null;
    current_period_end: string | null; cancel_at_period_end: boolean }
  function userSubscriptions(db: Db, userId: string): Promise<SubscriptionRow[]>;
  // lib/billing/webhook.ts
  interface WebhookDeps { db: Db; env: Env; fetch: typeof fetch; now?: () => number }
  function handleBillingWebhook(deps: WebhookDeps, request: Request): Promise<Response>;
  // test/paddle-fixtures.ts
  function subscriptionEvent(input: { type: string; userId?: string; subscriptionId?: string; customerId?: string;
    status: string; priceId: string; occurredAt: string; endsAt?: string | null; scheduledCancel?: boolean }): object;
  function transactionCompleted(input: { userId?: string; transactionId?: string; customerId?: string;
    priceId: string; subscriptionId?: string | null; occurredAt: string }): object;
  function adjustmentEvent(input: { transactionId: string; action: 'refund' | 'chargeback' | 'credit';
    type: 'full' | 'partial'; status: string; occurredAt: string }): object;
  function signedRequest(event: object, secret: string, nowMs?: number): Request;
  ```

- [ ] **Step 1: Fixtures and failing tests**

`apps/web/test/paddle-fixtures.ts`:
```ts
import { signPaddle } from '@/lib/billing/signature';

let seq = 0;
const nextId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(seq++).toString(36)}`;

export function subscriptionEvent(input: {
  type: string;
  userId?: string;
  subscriptionId?: string;
  customerId?: string;
  status: string;
  priceId: string;
  occurredAt: string;
  endsAt?: string | null;
  scheduledCancel?: boolean;
}) {
  return {
    event_id: nextId('evt'),
    event_type: input.type,
    occurred_at: input.occurredAt,
    data: {
      id: input.subscriptionId ?? 'sub_1',
      status: input.status,
      customer_id: input.customerId ?? 'ctm_1',
      custom_data: input.userId ? { user_id: input.userId } : null,
      items: [{ price: { id: input.priceId } }],
      current_billing_period:
        input.endsAt === null
          ? null
          : { starts_at: '2026-09-01T00:00:00Z', ends_at: input.endsAt ?? '2026-10-01T00:00:00Z' },
      scheduled_change: input.scheduledCancel
        ? { action: 'cancel', effective_at: input.endsAt ?? '2026-10-01T00:00:00Z' }
        : null,
    },
  };
}

export function transactionCompleted(input: {
  userId?: string;
  transactionId?: string;
  customerId?: string;
  priceId: string;
  subscriptionId?: string | null;
  occurredAt: string;
}) {
  return {
    event_id: nextId('evt'),
    event_type: 'transaction.completed',
    occurred_at: input.occurredAt,
    data: {
      id: input.transactionId ?? 'txn_1',
      status: 'completed',
      customer_id: input.customerId ?? 'ctm_1',
      subscription_id: input.subscriptionId ?? null,
      custom_data: input.userId ? { user_id: input.userId } : null,
      items: [{ price: { id: input.priceId } }],
    },
  };
}

export function adjustmentEvent(input: {
  transactionId: string;
  action: 'refund' | 'chargeback' | 'credit';
  type: 'full' | 'partial';
  status: string;
  occurredAt: string;
}) {
  return {
    event_id: nextId('evt'),
    event_type: 'adjustment.updated',
    occurred_at: input.occurredAt,
    data: {
      id: nextId('adj'),
      action: input.action,
      type: input.type,
      status: input.status,
      transaction_id: input.transactionId,
    },
  };
}

export function signedRequest(event: object, secret: string, nowMs = Date.now()): Request {
  const body = JSON.stringify(event);
  return new Request('https://dymcode.dev/api/billing/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'paddle-signature': signPaddle(body, secret, Math.floor(nowMs / 1000)),
    },
    body,
  });
}
```

`apps/web/lib/billing/signature.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { signPaddle, verifyPaddleSignature } from './signature';

const SECRET = 'pdl_ntfset_0123456789abcdef';
const BODY = '{"event_id":"evt_1"}';
const NOW = 1_790_000_000_000;
const TS = Math.floor(NOW / 1000);

describe('Paddle signature', () => {
  it('accepts a valid signature', () => {
    expect(verifyPaddleSignature(BODY, signPaddle(BODY, SECRET, TS), SECRET, NOW)).toBe(true);
  });

  it('accepts a header with several h1 values when one matches', () => {
    const good = signPaddle(BODY, SECRET, TS).split(';h1=')[1];
    expect(verifyPaddleSignature(BODY, `ts=${TS};h1=${'0'.repeat(64)};h1=${good}`, SECRET, NOW)).toBe(
      true,
    );
  });

  it.each([
    ['wrong secret', BODY, signPaddle(BODY, 'other-secret-0000', TS), NOW],
    ['tampered body', `${BODY} `, signPaddle(BODY, SECRET, TS), NOW],
    ['stale timestamp', BODY, signPaddle(BODY, SECRET, TS - 301), NOW],
    ['future timestamp', BODY, signPaddle(BODY, SECRET, TS + 301), NOW],
    ['missing header', BODY, null, NOW],
    ['malformed header', BODY, 'nonsense', NOW],
    ['non-hex h1', BODY, `ts=${TS};h1=zz`, NOW],
  ] as const)('rejects %s', (_label, body, header, now) => {
    expect(verifyPaddleSignature(body, header, SECRET, now)).toBe(false);
  });
});
```

`apps/web/lib/billing/webhook.test.ts`:
```ts
import { createUser, withTx, type TestDb } from '@dymcode/db-tests/harness';
import { describe, expect, it } from 'vitest';
import {
  adjustmentEvent,
  signedRequest,
  subscriptionEvent,
  transactionCompleted,
} from '@/test/paddle-fixtures';
import { PADDLE_ENV, VALID_ENV } from '@/test/fixtures';
import { parseEnv } from '../env';
import { handleBillingWebhook } from './webhook';

const env = parseEnv({ ...VALID_ENV, ...PADDLE_ENV });
const SECRET = PADDLE_ENV.PADDLE_WEBHOOK_SECRET;
const MONTHLY = PADDLE_ENV.PADDLE_PRICE_MONTHLY;
const LIFETIME = PADDLE_ENV.PADDLE_PRICE_LIFETIME;

function setup(db: TestDb, opts: { paddleFails?: boolean } = {}) {
  const calls: Array<{ url: string; body: unknown }> = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null });
    return opts.paddleFails
      ? Response.json({ error: { code: 'internal_error' } }, { status: 500 })
      : Response.json({ data: { id: 'ok' } });
  }) as typeof fetch;
  const send = (event: object) =>
    handleBillingWebhook({ db, env, fetch: fetchFn }, signedRequest(event, SECRET));
  const pro = async (userId: string) =>
    (await db.query<{ pro: boolean }>('select public.is_pro($1) as pro', [userId]))[0]!.pro;
  const row = async (where: string, value: string) =>
    (await db.query(`select * from public.subscriptions where ${where} = $1`, [value]))[0] as
      | Record<string, unknown>
      | undefined;
  return { calls, send, pro, row };
}

describe('billing webhook', () => {
  it('rejects bad signatures and 404s when billing is disabled', () =>
    withTx(async (db) => {
      const event = subscriptionEvent({
        type: 'subscription.created',
        status: 'active',
        priceId: MONTHLY,
        occurredAt: '2026-09-01T00:00:00Z',
      });
      const bad = signedRequest(event, 'wrong-secret-000000');
      expect((await handleBillingWebhook({ db, env, fetch }, bad)).status).toBe(401);
      const disabled = parseEnv(VALID_ENV);
      const res = await handleBillingWebhook(
        { db, env: disabled, fetch },
        signedRequest(event, SECRET),
      );
      expect(res.status).toBe(404);
    }));

  it('follows a monthly subscription through its lifecycle', () =>
    withTx(async (db) => {
      const { send, pro, row } = setup(db);
      const user = await createUser(db);
      const base = { userId: user, priceId: MONTHLY, subscriptionId: 'sub_life' };
      expect(
        (
          await send(
            subscriptionEvent({
              ...base,
              type: 'subscription.created',
              status: 'active',
              occurredAt: '2026-09-01T00:00:00Z',
            }),
          )
        ).status,
      ).toBe(200);
      expect(await pro(user)).toBe(true);
      await send(
        subscriptionEvent({
          ...base,
          type: 'subscription.past_due',
          status: 'past_due',
          occurredAt: '2026-09-02T00:00:00Z',
        }),
      );
      expect(await pro(user)).toBe(true);
      await send(
        subscriptionEvent({
          ...base,
          type: 'subscription.updated',
          status: 'active',
          scheduledCancel: true,
          occurredAt: '2026-09-03T00:00:00Z',
        }),
      );
      expect(await row('paddle_subscription_id', 'sub_life')).toMatchObject({
        status: 'active',
        cancel_at_period_end: true,
        paddle_customer_id: 'ctm_1',
      });
      await send(
        subscriptionEvent({
          ...base,
          type: 'subscription.canceled',
          status: 'canceled',
          occurredAt: '2026-10-01T00:00:00Z',
        }),
      );
      expect(await pro(user)).toBe(false);
      await send(
        subscriptionEvent({
          ...base,
          type: 'subscription.paused',
          status: 'paused',
          occurredAt: '2026-09-15T00:00:00Z',
        }),
      );
      expect(await row('paddle_subscription_id', 'sub_life')).toMatchObject({ status: 'canceled' });
    }));

  it('ignores replays and older events', () =>
    withTx(async (db) => {
      const { send, row } = setup(db);
      const user = await createUser(db);
      const newer = subscriptionEvent({
        type: 'subscription.updated',
        userId: user,
        status: 'past_due',
        priceId: MONTHLY,
        subscriptionId: 'sub_ord',
        occurredAt: '2026-09-05T00:00:00Z',
      });
      await send(newer);
      await send(newer);
      await send(
        subscriptionEvent({
          type: 'subscription.created',
          userId: user,
          status: 'active',
          priceId: MONTHLY,
          subscriptionId: 'sub_ord',
          occurredAt: '2026-09-01T00:00:00Z',
        }),
      );
      expect(await row('paddle_subscription_id', 'sub_ord')).toMatchObject({ status: 'past_due' });
    }));

  it('grants Lifetime and schedules cancellation of an active monthly subscription', () =>
    withTx(async (db) => {
      const { send, pro, calls } = setup(db);
      const user = await createUser(db);
      await send(
        subscriptionEvent({
          type: 'subscription.created',
          userId: user,
          status: 'active',
          priceId: MONTHLY,
          subscriptionId: 'sub_up',
          occurredAt: '2026-09-01T00:00:00Z',
        }),
      );
      const res = await send(
        transactionCompleted({
          userId: user,
          priceId: LIFETIME,
          transactionId: 'txn_life',
          occurredAt: '2026-09-10T00:00:00Z',
        }),
      );
      expect(res.status).toBe(200);
      expect(await pro(user)).toBe(true);
      expect(calls).toEqual([
        {
          url: 'https://sandbox-api.paddle.com/subscriptions/sub_up/cancel',
          body: { effective_from: 'next_billing_period' },
        },
      ]);
    }));

  it('returns 500 when cancelling the monthly subscription fails', () =>
    withTx(async (db) => {
      const { send } = setup(db, { paddleFails: true });
      const user = await createUser(db);
      await send(
        subscriptionEvent({
          type: 'subscription.created',
          userId: user,
          status: 'active',
          priceId: MONTHLY,
          subscriptionId: 'sub_fail',
          occurredAt: '2026-09-01T00:00:00Z',
        }),
      );
      const res = await send(
        transactionCompleted({
          userId: user,
          priceId: LIFETIME,
          transactionId: 'txn_fail',
          occurredAt: '2026-09-10T00:00:00Z',
        }),
      );
      expect(res.status).toBe(500);
    }));

  it('revokes Lifetime on a full refund or chargeback but not on a partial refund', () =>
    withTx(async (db) => {
      const { send, pro } = setup(db);
      const user = await createUser(db);
      await send(
        transactionCompleted({
          userId: user,
          priceId: LIFETIME,
          transactionId: 'txn_ref',
          occurredAt: '2026-09-10T00:00:00Z',
        }),
      );
      await send(
        adjustmentEvent({
          transactionId: 'txn_ref',
          action: 'refund',
          type: 'partial',
          status: 'approved',
          occurredAt: '2026-09-11T00:00:00Z',
        }),
      );
      expect(await pro(user)).toBe(true);
      await send(
        adjustmentEvent({
          transactionId: 'txn_ref',
          action: 'refund',
          type: 'full',
          status: 'pending_approval',
          occurredAt: '2026-09-12T00:00:00Z',
        }),
      );
      expect(await pro(user)).toBe(true);
      await send(
        adjustmentEvent({
          transactionId: 'txn_ref',
          action: 'refund',
          type: 'full',
          status: 'approved',
          occurredAt: '2026-09-13T00:00:00Z',
        }),
      );
      expect(await pro(user)).toBe(false);

      const other = await createUser(db);
      await send(
        transactionCompleted({
          userId: other,
          priceId: LIFETIME,
          transactionId: 'txn_cb',
          occurredAt: '2026-09-10T00:00:00Z',
        }),
      );
      await send(
        adjustmentEvent({
          transactionId: 'txn_cb',
          action: 'chargeback',
          type: 'full',
          status: 'approved',
          occurredAt: '2026-09-14T00:00:00Z',
        }),
      );
      expect(await pro(other)).toBe(false);
    }));

  it('resolves the user from the customer id and creates the monthly mapping from the first payment', () =>
    withTx(async (db) => {
      const { send, pro, row } = setup(db);
      const user = await createUser(db);
      await send(
        transactionCompleted({
          userId: user,
          priceId: MONTHLY,
          transactionId: 'txn_first',
          subscriptionId: 'sub_map',
          customerId: 'ctm_map',
          occurredAt: '2026-09-01T00:00:10Z',
        }),
      );
      expect(await row('paddle_subscription_id', 'sub_map')).toMatchObject({
        user_id: user,
        status: 'active',
        paddle_occurred_at: null,
      });
      // The subscription event (no custom_data, earlier timestamp) still applies.
      await send(
        subscriptionEvent({
          type: 'subscription.created',
          status: 'past_due',
          priceId: MONTHLY,
          subscriptionId: 'sub_map',
          customerId: 'ctm_map',
          occurredAt: '2026-09-01T00:00:00Z',
        }),
      );
      expect(await row('paddle_subscription_id', 'sub_map')).toMatchObject({ status: 'past_due' });
      expect(await pro(user)).toBe(true);
    }));

  it('returns 500 for an unresolvable user and 200 for unknown events or deleted profiles', () =>
    withTx(async (db) => {
      const { send } = setup(db);
      const orphan = subscriptionEvent({
        type: 'subscription.created',
        status: 'active',
        priceId: MONTHLY,
        subscriptionId: 'sub_orphan',
        customerId: 'ctm_orphan',
        occurredAt: '2026-09-01T00:00:00Z',
      });
      expect((await send(orphan)).status).toBe(500);
      const unknown = { ...orphan, event_type: 'customer.updated' };
      expect((await send(unknown)).status).toBe(200);
      const ghost = subscriptionEvent({
        type: 'subscription.created',
        userId: '00000000-0000-4000-8000-000000000000',
        status: 'active',
        priceId: MONTHLY,
        subscriptionId: 'sub_ghost',
        occurredAt: '2026-09-01T00:00:00Z',
      });
      expect((await send(ghost)).status).toBe(200);
    }));

  it('ignores subscriptions for other prices', () =>
    withTx(async (db) => {
      const { send, row } = setup(db);
      const user = await createUser(db);
      const res = await send(
        subscriptionEvent({
          type: 'subscription.created',
          userId: user,
          status: 'active',
          priceId: 'pri_other',
          subscriptionId: 'sub_other',
          occurredAt: '2026-09-01T00:00:00Z',
        }),
      );
      expect(res.status).toBe(200);
      expect(await row('paddle_subscription_id', 'sub_other')).toBeUndefined();
    }));
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @dymcode/web test`
Expected: FAIL with unresolved `./signature`, `./webhook`.

- [ ] **Step 3: Implement**

`apps/web/lib/billing/signature.ts`:
```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

const TOLERANCE_SEC = 300;

const hmac = (rawBody: string, secret: string, ts: string) =>
  createHmac('sha256', secret).update(`${ts}:${rawBody}`).digest('hex');

/** Builds a `Paddle-Signature` header value (tests and E2E). */
export function signPaddle(rawBody: string, secret: string, ts: number): string {
  return `ts=${ts};h1=${hmac(rawBody, secret, String(ts))}`;
}

export function verifyPaddleSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowMs: number,
): boolean {
  if (!header) return false;
  let ts: string | null = null;
  const h1: string[] = [];
  for (const part of header.split(';')) {
    const [key, value] = part.split('=', 2);
    if (key === 'ts' && value) ts = value;
    else if (key === 'h1' && value) h1.push(value);
  }
  if (!ts || !/^\d+$/.test(ts) || h1.length === 0) return false;
  if (Math.abs(nowMs / 1000 - Number(ts)) > TOLERANCE_SEC) return false;
  const expected = Buffer.from(hmac(rawBody, secret, ts), 'hex');
  return h1.some((candidate) => {
    if (!/^[0-9a-f]{64}$/i.test(candidate)) return false;
    return timingSafeEqual(Buffer.from(candidate, 'hex'), expected);
  });
}
```

`apps/web/lib/billing/subscriptions.ts`:
```ts
import type { Db, Row } from '../db/types';

export const PRO_MONTHLY_STATUSES = ['active', 'trialing', 'past_due'] as const;

export interface SubscriptionRow extends Row {
  id: string;
  plan: 'pro_monthly' | 'pro_lifetime';
  status: string;
  paddle_customer_id: string | null;
  paddle_subscription_id: string | null;
  paddle_transaction_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

/** Service-role read of the user's own rows (allowed by the data-access rules). */
export async function userSubscriptions(db: Db, userId: string): Promise<SubscriptionRow[]> {
  const rows = await db.query<SubscriptionRow & { current_period_end: Date | string | null }>(
    `select id, plan::text as plan, status, paddle_customer_id, paddle_subscription_id,
            paddle_transaction_id, current_period_end, cancel_at_period_end
     from public.subscriptions where user_id = $1 order by updated_at desc`,
    [userId],
  );
  return rows.map((r) => ({
    ...r,
    current_period_end: r.current_period_end ? new Date(r.current_period_end).toISOString() : null,
  }));
}
```

`apps/web/lib/billing/webhook.ts`:
```ts
import { z } from 'zod';
import type { Db } from '../db/types';
import type { Env } from '../env';
import { json } from '../http';
import { billingConfig, type BillingConfig } from './config';
import { createPaddleClient } from './paddle';
import { verifyPaddleSignature } from './signature';
import { PRO_MONTHLY_STATUSES, userSubscriptions } from './subscriptions';

export interface WebhookDeps {
  db: Db;
  env: Env;
  fetch: typeof fetch;
  now?: () => number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const Envelope = z.object({
  event_id: z.string(),
  event_type: z.string(),
  occurred_at: z.string(),
  data: z.record(z.string(), z.unknown()),
});

const CustomData = z.object({ user_id: z.string().regex(UUID) }).partial().nullish();
const Items = z.array(z.object({ price: z.object({ id: z.string() }) })).default([]);

const Subscription = z.object({
  id: z.string(),
  status: z.string(),
  customer_id: z.string().nullish(),
  custom_data: CustomData,
  items: Items,
  current_billing_period: z.object({ ends_at: z.string() }).nullish(),
  scheduled_change: z.object({ action: z.string() }).nullish(),
});

const Transaction = z.object({
  id: z.string(),
  customer_id: z.string().nullish(),
  subscription_id: z.string().nullish(),
  custom_data: CustomData,
  items: Items,
});

const Adjustment = z.object({
  action: z.string(),
  type: z.string().nullish(),
  status: z.string(),
  transaction_id: z.string(),
});

/** Thrown when the event cannot be attributed yet; Paddle retries on 500. */
class UnresolvedUser extends Error {}

async function profileExists(db: Db, userId: string): Promise<boolean> {
  const [row] = await db.query<{ ok: boolean }>(
    'select exists(select 1 from public.profiles where id = $1) as ok',
    [userId],
  );
  return Boolean(row?.ok);
}

/** custom_data.user_id → row with the same subscription id → row with the same customer id. */
async function resolveUser(
  db: Db,
  input: { customUserId?: string; subscriptionId?: string | null; customerId?: string | null },
): Promise<string> {
  if (input.customUserId) return input.customUserId;
  if (input.subscriptionId) {
    const [row] = await db.query<{ user_id: string }>(
      'select user_id from public.subscriptions where paddle_subscription_id = $1',
      [input.subscriptionId],
    );
    if (row) return row.user_id;
  }
  if (input.customerId) {
    const [row] = await db.query<{ user_id: string }>(
      'select user_id from public.subscriptions where paddle_customer_id = $1 limit 1',
      [input.customerId],
    );
    if (row) return row.user_id;
  }
  throw new UnresolvedUser();
}

async function onSubscription(
  deps: WebhookDeps,
  config: BillingConfig,
  occurredAt: string,
  raw: unknown,
) {
  const sub = Subscription.parse(raw);
  if (!sub.items.some((item) => item.price.id === config.priceMonthly)) return;
  const userId = await resolveUser(deps.db, {
    customUserId: sub.custom_data?.user_id,
    subscriptionId: sub.id,
    customerId: sub.customer_id,
  });
  if (!(await profileExists(deps.db, userId))) return;
  await deps.db.query(
    `insert into public.subscriptions
       (user_id, plan, status, paddle_customer_id, paddle_subscription_id, current_period_end,
        cancel_at_period_end, paddle_occurred_at, updated_at)
     values ($1, 'pro_monthly', $2, $3, $4, $5::timestamptz, $6, $7::timestamptz, now())
     on conflict (paddle_subscription_id) do update set
       status = excluded.status,
       paddle_customer_id = coalesce(excluded.paddle_customer_id, public.subscriptions.paddle_customer_id),
       current_period_end = excluded.current_period_end,
       cancel_at_period_end = excluded.cancel_at_period_end,
       paddle_occurred_at = excluded.paddle_occurred_at,
       updated_at = now()
     where public.subscriptions.paddle_occurred_at is null
        or public.subscriptions.paddle_occurred_at < excluded.paddle_occurred_at`,
    [
      userId,
      sub.status,
      sub.customer_id ?? null,
      sub.id,
      sub.current_billing_period?.ends_at ?? null,
      sub.scheduled_change?.action === 'cancel',
      occurredAt,
    ],
  );
}

async function onTransactionCompleted(
  deps: WebhookDeps,
  config: BillingConfig,
  occurredAt: string,
  raw: unknown,
) {
  const txn = Transaction.parse(raw);
  const prices = txn.items.map((item) => item.price.id);
  if (prices.includes(config.priceLifetime)) {
    const userId = await resolveUser(deps.db, {
      customUserId: txn.custom_data?.user_id,
      customerId: txn.customer_id,
    });
    if (!(await profileExists(deps.db, userId))) return;
    await deps.db.query(
      `insert into public.subscriptions
         (user_id, plan, status, paddle_customer_id, paddle_transaction_id, paddle_occurred_at, updated_at)
       values ($1, 'pro_lifetime', 'paid', $2, $3, $4::timestamptz, now())
       on conflict (paddle_transaction_id) do update set
         status = 'paid',
         paddle_occurred_at = excluded.paddle_occurred_at,
         updated_at = now()
       where public.subscriptions.paddle_occurred_at is null
          or public.subscriptions.paddle_occurred_at < excluded.paddle_occurred_at`,
      [userId, txn.customer_id ?? null, txn.id, occurredAt],
    );
    const paddle = createPaddleClient(config, deps.fetch);
    const rows = await userSubscriptions(deps.db, userId);
    for (const row of rows) {
      if (
        row.plan === 'pro_monthly' &&
        row.paddle_subscription_id &&
        !row.cancel_at_period_end &&
        (PRO_MONTHLY_STATUSES as readonly string[]).includes(row.status)
      ) {
        await paddle.cancelSubscription(row.paddle_subscription_id, 'next_billing_period');
      }
    }
    return;
  }
  if (prices.includes(config.priceMonthly) && txn.subscription_id) {
    const userId = await resolveUser(deps.db, {
      customUserId: txn.custom_data?.user_id,
      subscriptionId: txn.subscription_id,
      customerId: txn.customer_id,
    });
    if (!(await profileExists(deps.db, userId))) return;
    // Mapping only: a null timestamp lets any subscription event overwrite this row.
    await deps.db.query(
      `insert into public.subscriptions
         (user_id, plan, status, paddle_customer_id, paddle_subscription_id, paddle_occurred_at, updated_at)
       values ($1, 'pro_monthly', 'active', $2, $3, null, now())
       on conflict (paddle_subscription_id) do nothing`,
      [userId, txn.customer_id ?? null, txn.subscription_id],
    );
  }
}

async function onAdjustment(deps: WebhookDeps, occurredAt: string, raw: unknown) {
  const adj = Adjustment.parse(raw);
  if (adj.status !== 'approved') return;
  const revokes =
    adj.action === 'chargeback' || (adj.action === 'refund' && adj.type === 'full');
  if (!revokes) return;
  await deps.db.query(
    `update public.subscriptions set status = 'refunded', paddle_occurred_at = $2::timestamptz,
       updated_at = now()
     where paddle_transaction_id = $1 and plan = 'pro_lifetime'
       and (paddle_occurred_at is null or paddle_occurred_at < $2::timestamptz)`,
    [adj.transaction_id, occurredAt],
  );
}

export async function handleBillingWebhook(deps: WebhookDeps, request: Request): Promise<Response> {
  const config = billingConfig(deps.env);
  if (!config) return json({ error: 'not found' }, 404);
  const raw = await request.text();
  const now = (deps.now ?? Date.now)();
  if (!verifyPaddleSignature(raw, request.headers.get('paddle-signature'), config.webhookSecret, now)) {
    return json({ error: 'unauthorized' }, 401);
  }
  const parsed = Envelope.safeParse(JSON.parse(raw));
  if (!parsed.success) return json({ error: 'bad request' }, 400);
  const { event_id, event_type, occurred_at, data } = parsed.data;
  try {
    if (event_type.startsWith('subscription.')) {
      await onSubscription(deps, config, occurred_at, data);
    } else if (event_type === 'transaction.completed') {
      await onTransactionCompleted(deps, config, occurred_at, data);
    } else if (event_type === 'adjustment.created' || event_type === 'adjustment.updated') {
      await onAdjustment(deps, occurred_at, data);
    }
    return json({ ok: true }, 200);
  } catch (error) {
    if (error instanceof UnresolvedUser) {
      console.error('[billing/webhook] unresolved user', event_id, event_type);
    } else {
      console.error('[billing/webhook] failed', event_id, event_type, error);
    }
    return json({ error: 'retry' }, 500);
  }
}
```
Notes for the implementer:
- `JSON.parse(raw)` can throw on garbage after a valid signature: wrap it and return 400.
- Logged errors must not contain payload data: zod messages can echo field values. For a `ZodError` log only `'invalid payload'`. For any other `Error` log `error.name + ': ' + error.message` (`PaddleError` messages contain no secrets). Never log the error object itself.
- Paddle's `occurred_at` has microsecond precision; `$n::timestamptz` preserves it.

`apps/web/app/api/billing/webhook/route.ts`:
```ts
import { handleBillingWebhook } from '@/lib/billing/webhook';
import { getDeps } from '@/lib/deps';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return handleBillingWebhook(await getDeps(), request);
}
```
`apps/web/proxy.ts` already skips `/api/`, so the webhook bypasses the session proxy.

- [ ] **Step 4: Verify**

Run: `pnpm --filter @dymcode/web test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add apps/web
git commit -m "feat(web): handle Paddle billing webhooks"
```

---

### Task 4: Checkout, billing status and customer portal use cases

**Files:**
- Create: `apps/web/lib/dashboard/rate-limit.ts`, `apps/web/lib/billing/checkout.ts`
- Modify: `apps/web/lib/dashboard/integrations.ts` (use the shared `rateLimited`)
- Test: `apps/web/lib/billing/checkout.test.ts`

**Interfaces:**
- Consumes: `userSubscriptions`, `PRO_MONTHLY_STATUSES` (Task 3), `paddleFromDeps`, `PaddleClient` (Task 2), `DashDeps`, `ActionResult`, `usage` (`lib/dashboard/feedback.ts`).
- Produces:
  ```ts
  // lib/dashboard/rate-limit.ts
  const DASHBOARD_RATE_LIMIT = 10;
  function rateLimited(deps: Pick<DashDeps, 'db'>, action: string, userId: string): Promise<boolean>;
  // lib/billing/checkout.ts
  type BillingState = 'disabled' | 'free' | 'monthly' | 'past_due' | 'lifetime';
  interface BillingOverview { state: BillingState; periodEnd: string | null; cancelAtPeriodEnd: boolean;
    hasCustomer: boolean }
  function billingOverview(deps: DashDeps, userId: string): Promise<BillingOverview>;
  function startCheckout(deps: DashDeps, userId: string, plan: 'monthly' | 'lifetime'):
    Promise<ActionResult<{ transactionId: string }>>;
  function openPortal(deps: DashDeps, userId: string): Promise<ActionResult<{ url: string }>>;
  ```
- Error keys: `billing.unavailable`, `billing.alreadyLifetime`, `billing.alreadySubscribed`, `billing.checkoutFailed`, `billing.noCustomer`, `billing.portalFailed`, `errors.rateLimited`.

- [ ] **Step 1: Write the failing tests**

`apps/web/lib/billing/checkout.test.ts`:
```ts
import { createUser, withTx, type TestDb } from '@dymcode/db-tests/harness';
import { describe, expect, it } from 'vitest';
import { PADDLE_ENV, VALID_ENV } from '@/test/fixtures';
import type { DashDeps } from '../dashboard/result';
import { parseEnv } from '../env';
import { createMemoryStorage } from '../storage';
import { billingOverview, openPortal, startCheckout } from './checkout';

function setup(db: TestDb, opts: { disabled?: boolean; fail?: boolean } = {}) {
  const calls: Array<{ url: string; body: any }> = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null });
    if (opts.fail) return Response.json({ error: { code: 'internal_error' } }, { status: 500 });
    if (String(input).endsWith('/portal-sessions')) {
      return Response.json({ data: { urls: { general: { overview: 'https://portal.example/o' } } } });
    }
    return Response.json({ data: { id: 'txn_new' } });
  }) as typeof fetch;
  const env = parseEnv(opts.disabled ? VALID_ENV : { ...VALID_ENV, ...PADDLE_ENV });
  const deps: DashDeps = { db, storage: createMemoryStorage(), env, fetch: fetchFn };
  return { deps, calls };
}

async function addRow(
  db: TestDb,
  userId: string,
  row: {
    plan: 'pro_monthly' | 'pro_lifetime';
    status: string;
    subscription?: string;
    txn?: string;
    customer?: string;
    cancel?: boolean;
    end?: string;
  },
) {
  await db.query(
    `insert into public.subscriptions (user_id, plan, status, paddle_subscription_id, paddle_transaction_id,
       paddle_customer_id, cancel_at_period_end, current_period_end)
     values ($1, $2::plan_kind, $3, $4, $5, $6, $7, $8::timestamptz)`,
    [
      userId,
      row.plan,
      row.status,
      row.subscription ?? null,
      row.txn ?? null,
      row.customer ?? null,
      row.cancel ?? false,
      row.end ?? null,
    ],
  );
}

describe('billingOverview', () => {
  it('reports each state', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const u = await createUser(db);
      expect(await billingOverview(deps, u)).toEqual({
        state: 'free',
        periodEnd: null,
        cancelAtPeriodEnd: false,
        hasCustomer: false,
      });
      await addRow(db, u, {
        plan: 'pro_monthly',
        status: 'active',
        subscription: 'sub_a',
        customer: 'ctm_a',
        cancel: true,
        end: '2026-10-01T00:00:00Z',
      });
      expect(await billingOverview(deps, u)).toEqual({
        state: 'monthly',
        periodEnd: '2026-10-01T00:00:00.000Z',
        cancelAtPeriodEnd: true,
        hasCustomer: true,
      });
      const pd = await createUser(db);
      await addRow(db, pd, { plan: 'pro_monthly', status: 'past_due', subscription: 'sub_pd' });
      expect((await billingOverview(deps, pd)).state).toBe('past_due');
      await addRow(db, u, { plan: 'pro_lifetime', status: 'paid', txn: 'txn_l', customer: 'ctm_a' });
      expect((await billingOverview(deps, u)).state).toBe('lifetime');
      expect((await billingOverview(setup(db, { disabled: true }).deps, u)).state).toBe('disabled');
    }));
});

describe('startCheckout', () => {
  it('creates a transaction for a Free user and reuses a known customer id', () =>
    withTx(async (db) => {
      const { deps, calls } = setup(db);
      const u = await createUser(db);
      expect(await startCheckout(deps, u, 'monthly')).toEqual({ ok: true, transactionId: 'txn_new' });
      expect(calls[0]!.body).toEqual({
        items: [{ price_id: PADDLE_ENV.PADDLE_PRICE_MONTHLY, quantity: 1 }],
        custom_data: { user_id: u },
      });
      await addRow(db, u, {
        plan: 'pro_monthly',
        status: 'canceled',
        subscription: 'sub_old',
        customer: 'ctm_known',
      });
      await startCheckout(deps, u, 'lifetime');
      expect(calls[1]!.body).toMatchObject({
        items: [{ price_id: PADDLE_ENV.PADDLE_PRICE_LIFETIME, quantity: 1 }],
        customer_id: 'ctm_known',
      });
    }));

  it('enforces the purchase rules', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const monthly = await createUser(db);
      await addRow(db, monthly, { plan: 'pro_monthly', status: 'active', subscription: 'sub_m' });
      expect(await startCheckout(deps, monthly, 'monthly')).toEqual({
        ok: false,
        error: 'billing.alreadySubscribed',
      });
      expect((await startCheckout(deps, monthly, 'lifetime')).ok).toBe(true);
      const lifetime = await createUser(db);
      await addRow(db, lifetime, { plan: 'pro_lifetime', status: 'paid', txn: 'txn_x' });
      for (const plan of ['monthly', 'lifetime'] as const) {
        expect(await startCheckout(deps, lifetime, plan)).toEqual({
          ok: false,
          error: 'billing.alreadyLifetime',
        });
      }
    }));

  it('maps disabled billing, Paddle errors and the rate limit', () =>
    withTx(async (db) => {
      const u = await createUser(db);
      expect(await startCheckout(setup(db, { disabled: true }).deps, u, 'monthly')).toEqual({
        ok: false,
        error: 'billing.unavailable',
      });
      expect(await startCheckout(setup(db, { fail: true }).deps, u, 'monthly')).toEqual({
        ok: false,
        error: 'billing.checkoutFailed',
      });
      const { deps } = setup(db);
      for (let i = 0; i < 9; i++) await startCheckout(deps, u, 'monthly');
      expect(await startCheckout(deps, u, 'monthly')).toEqual({
        ok: false,
        error: 'errors.rateLimited',
      });
    }));
});

describe('openPortal', () => {
  it('opens a portal session for the caller’s own customer only', () =>
    withTx(async (db) => {
      const { deps, calls } = setup(db);
      const u = await createUser(db);
      expect(await openPortal(deps, u)).toEqual({ ok: false, error: 'billing.noCustomer' });
      await addRow(db, u, {
        plan: 'pro_monthly',
        status: 'active',
        subscription: 'sub_p',
        customer: 'ctm_p',
      });
      const other = await createUser(db);
      await addRow(db, other, {
        plan: 'pro_monthly',
        status: 'active',
        subscription: 'sub_q',
        customer: 'ctm_q',
      });
      expect(await openPortal(deps, u)).toEqual({ ok: true, url: 'https://portal.example/o' });
      expect(calls.at(-1)).toEqual({
        url: 'https://sandbox-api.paddle.com/customers/ctm_p/portal-sessions',
        body: { subscription_ids: ['sub_p'] },
      });
    }));
});
```
Rate-limit arithmetic: the limiter counts every call that reaches it, including failed ones. In that test the disabled call returns before the limiter; the failing call is hit 1 and the loop adds hits 2–10, so the final call is hit 11 and must be limited. Keep the limiter AFTER the "billing disabled" check and BEFORE the Paddle call.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @dymcode/web test`
Expected: FAIL with unresolved `./checkout`.

- [ ] **Step 3: Implement**

`apps/web/lib/dashboard/rate-limit.ts`:
```ts
import type { DashDeps } from './result';

export const DASHBOARD_RATE_LIMIT = 10;

/** 10 calls per minute per user per action, via SQL hit_rate_limit. */
export async function rateLimited(
  deps: Pick<DashDeps, 'db'>,
  action: string,
  userId: string,
): Promise<boolean> {
  const [row] = await deps.db.query<{ limited: boolean }>(
    'select public.hit_rate_limit($1, $2, 60) as limited',
    [`dashboard:${action}:${userId}`, DASHBOARD_RATE_LIMIT],
  );
  return Boolean(row?.limited);
}
```
In `apps/web/lib/dashboard/integrations.ts` delete the local `rateLimited` function and the local `DASHBOARD_RATE_LIMIT` constant. Import both from `./rate-limit` and re-export `DASHBOARD_RATE_LIMIT` (`export { DASHBOARD_RATE_LIMIT } from './rate-limit';`) so existing imports keep working. The integrations tests must still pass unchanged.

`apps/web/lib/billing/checkout.ts`:
```ts
import { rateLimited } from '../dashboard/rate-limit';
import type { ActionResult, DashDeps } from '../dashboard/result';
import { billingConfig } from './config';
import { paddleFromDeps } from './paddle';
import { PRO_MONTHLY_STATUSES, userSubscriptions, type SubscriptionRow } from './subscriptions';

export type BillingState = 'disabled' | 'free' | 'monthly' | 'past_due' | 'lifetime';

export interface BillingOverview {
  state: BillingState;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasCustomer: boolean;
}

const isProMonthly = (row: SubscriptionRow) =>
  row.plan === 'pro_monthly' && (PRO_MONTHLY_STATUSES as readonly string[]).includes(row.status);

export async function billingOverview(deps: DashDeps, userId: string): Promise<BillingOverview> {
  const rows = await userSubscriptions(deps.db, userId);
  const hasCustomer = rows.some((row) => row.paddle_customer_id);
  const base = { periodEnd: null, cancelAtPeriodEnd: false, hasCustomer };
  if (!billingConfig(deps.env)) return { ...base, state: 'disabled' };
  if (rows.some((row) => row.plan === 'pro_lifetime' && row.status === 'paid')) {
    return { ...base, state: 'lifetime' };
  }
  const monthly = rows.find(isProMonthly);
  if (!monthly) return { ...base, state: 'free' };
  return {
    state: monthly.status === 'past_due' ? 'past_due' : 'monthly',
    periodEnd: monthly.current_period_end,
    cancelAtPeriodEnd: monthly.cancel_at_period_end,
    hasCustomer,
  };
}

export async function startCheckout(
  deps: DashDeps,
  userId: string,
  plan: 'monthly' | 'lifetime',
): Promise<ActionResult<{ transactionId: string }>> {
  const config = billingConfig(deps.env);
  const paddle = paddleFromDeps(deps);
  if (!config || !paddle) return { ok: false, error: 'billing.unavailable' };
  if (await rateLimited(deps, 'checkout', userId)) return { ok: false, error: 'errors.rateLimited' };
  const rows = await userSubscriptions(deps.db, userId);
  if (rows.some((row) => row.plan === 'pro_lifetime' && row.status === 'paid')) {
    return { ok: false, error: 'billing.alreadyLifetime' };
  }
  if (plan === 'monthly' && rows.some(isProMonthly)) {
    return { ok: false, error: 'billing.alreadySubscribed' };
  }
  const customerId = rows.find((row) => row.paddle_customer_id)?.paddle_customer_id ?? null;
  try {
    const transaction = await paddle.createTransaction({
      priceId: plan === 'monthly' ? config.priceMonthly : config.priceLifetime,
      userId,
      customerId,
    });
    return { ok: true, transactionId: transaction.id };
  } catch (error) {
    console.error('[billing] checkout failed', error instanceof Error ? error.message : 'error');
    return { ok: false, error: 'billing.checkoutFailed' };
  }
}

export async function openPortal(
  deps: DashDeps,
  userId: string,
): Promise<ActionResult<{ url: string }>> {
  const paddle = paddleFromDeps(deps);
  if (!paddle) return { ok: false, error: 'billing.unavailable' };
  if (await rateLimited(deps, 'portal', userId)) return { ok: false, error: 'errors.rateLimited' };
  const rows = await userSubscriptions(deps.db, userId);
  const customerId = rows.find((row) => row.paddle_customer_id)?.paddle_customer_id;
  if (!customerId) return { ok: false, error: 'billing.noCustomer' };
  const subscriptionIds = rows
    .filter((row) => isProMonthly(row) && row.paddle_subscription_id)
    .map((row) => row.paddle_subscription_id!);
  try {
    return { ok: true, url: await paddle.createPortalSession(customerId, subscriptionIds) };
  } catch (error) {
    console.error('[billing] portal failed', error instanceof Error ? error.message : 'error');
    return { ok: false, error: 'billing.portalFailed' };
  }
}
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter @dymcode/web test && pnpm typecheck`
Expected: PASS (including the unchanged integrations tests).

- [ ] **Step 5: Commit**

```bash
pnpm format
git add apps/web
git commit -m "feat(web): add checkout, billing overview and portal use cases"
```

---

### Task 5: Cancel the subscription when an account is deleted

**Files:**
- Modify: `apps/web/lib/dashboard/account.ts`, `apps/web/lib/dashboard/account.test.ts`, `apps/web/app/app/actions.ts` (`deleteAccountAction`)

**Interfaces:**
- Consumes: `PaddleClient`, `paddleFromDeps` (Task 2), `userSubscriptions`, `PRO_MONTHLY_STATUSES` (Task 3).
- Produces: `deleteAccount(deps: DashDeps & { authAdmin: AuthAdmin; paddle?: PaddleClient | null }, user, confirmEmail)`. When `paddle` is set, every Pro-granting monthly subscription is cancelled `immediately` first. Any failure returns `errors.generic` and deletes nothing.

- [ ] **Step 1: Write the failing tests**

Add to `apps/web/lib/dashboard/account.test.ts` (reuse the file's existing helpers for users/storage; add imports `type PaddleClient` from `../billing/paddle`):
```ts
  it('cancels active subscriptions immediately before deleting the account', () =>
    withTx(async (db) => {
      const storage = createMemoryStorage();
      const email = 'sub@example.com';
      const owner = await createUser(db, email);
      await db.query(
        `insert into public.subscriptions (user_id, plan, status, paddle_subscription_id)
         values ($1, 'pro_monthly', 'active', 'sub_del'), ($1, 'pro_monthly', 'canceled', 'sub_old')`,
        [owner],
      );
      const cancelled: string[] = [];
      const paddle: PaddleClient = {
        createTransaction: async () => ({ id: 'x' }),
        createPortalSession: async () => 'x',
        cancelSubscription: async (id, when) => {
          cancelled.push(`${id}:${when}`);
        },
      };
      const deps = { db, storage, env: parseEnv(VALID_ENV), fetch, authAdmin: dbAdmin(db), paddle };
      expect(await deleteAccount(deps, { id: owner, email }, email)).toEqual({ ok: true });
      expect(cancelled).toEqual(['sub_del:immediately']);
    }));

  it('keeps the account when the subscription cannot be cancelled', () =>
    withTx(async (db) => {
      const email = 'keep@example.com';
      const owner = await createUser(db, email);
      await db.query(
        `insert into public.subscriptions (user_id, plan, status, paddle_subscription_id)
         values ($1, 'pro_monthly', 'active', 'sub_keep')`,
        [owner],
      );
      const paddle: PaddleClient = {
        createTransaction: async () => ({ id: 'x' }),
        createPortalSession: async () => 'x',
        cancelSubscription: async () => {
          throw new Error('paddle down');
        },
      };
      const deps = {
        db,
        storage: createMemoryStorage(),
        env: parseEnv(VALID_ENV),
        fetch,
        authAdmin: dbAdmin(db),
        paddle,
      };
      expect(await deleteAccount(deps, { id: owner, email }, email)).toEqual({
        ok: false,
        error: 'errors.generic',
      });
      expect(await db.query('select 1 from auth.users where id = $1', [owner])).toHaveLength(1);
    }));
```
(`dbAdmin` already exists in this test file; if its name differs, use the file's existing auth-admin fake.)

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @dymcode/web test`
Expected: FAIL. `cancelled` stays empty, and the second test deletes the user.

- [ ] **Step 3: Implement**

In `apps/web/lib/dashboard/account.ts`, change the deps type to `DashDeps & { authAdmin: AuthAdmin; paddle?: PaddleClient | null }`. After the email check and BEFORE selecting screenshot paths, add:
```ts
  if (deps.paddle) {
    const rows = await userSubscriptions(deps.db, user.id);
    try {
      for (const row of rows) {
        if (
          row.plan === 'pro_monthly' &&
          row.paddle_subscription_id &&
          (PRO_MONTHLY_STATUSES as readonly string[]).includes(row.status)
        ) {
          await deps.paddle.cancelSubscription(row.paddle_subscription_id, 'immediately');
        }
      }
    } catch (error) {
      console.error('[account] subscription cancel failed', error instanceof Error ? error.message : 'error');
      return { ok: false, error: 'errors.generic' };
    }
  }
```
with imports from `../billing/paddle` (type) and `../billing/subscriptions`.

In `apps/web/app/app/actions.ts` `deleteAccountAction`, pass `paddle: paddleFromDeps(deps)` in the deps object (import `paddleFromDeps` from `@/lib/billing/paddle`).

- [ ] **Step 4: Verify**

Run: `pnpm --filter @dymcode/web test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add apps/web
git commit -m "feat(web): cancel the Paddle subscription when an account is deleted"
```

---

### Task 6: Billing page UI

**Files:**
- Modify: `apps/web/app/app/billing/page.tsx`, `apps/web/app/app/actions.ts`, `apps/web/messages/en.json`, `apps/web/messages/ru.json`, `apps/web/package.json`
- Create: `apps/web/components/app/billing/billing-panel.tsx`, `apps/web/components/app/billing/use-paddle.ts`
- Keep: `apps/web/components/app/billing/upgrade-buttons.tsx` (the "coming soon" UI for disabled billing)

**Interfaces:**
- Consumes: `billingOverview`, `startCheckout`, `openPortal`, `BillingOverview` (Task 4); `billingConfig` (Task 2); `usage` (`lib/dashboard/feedback.ts`); `isPro` (`lib/dashboard/settings.ts`).
- Produces (server actions in `app/app/actions.ts`):
  ```ts
  startCheckoutAction(plan: 'monthly' | 'lifetime'): Promise<ActionResult<{ transactionId: string }>>;
  openPortalAction(): Promise<ActionResult<{ url: string }>>;
  billingStatusAction(): Promise<{ pro: boolean }>;
  ```
- Test ids:
  - `billing-plan`;
  - `billing-upgrade-monthly`, `billing-upgrade-lifetime`, `billing-coming-soon` (unchanged);
  - `billing-manage`, `billing-switch-lifetime`, `billing-past-due`, `billing-activating`, `billing-activation-slow`;
  - `billing-card-monthly`, `billing-card-lifetime`.

- [ ] **Step 1: Dependency and messages**

Run: `pnpm --filter @dymcode/web add @paddle/paddle-js`
Read its README/types in `apps/web/node_modules/@paddle/paddle-js`. You will use `initializePaddle({ environment, token, eventCallback })`, `paddle.Checkout.open({ transaction, customer, settings })` and the `checkout.completed` event name. If the installed version names these differently (e.g. `transactionId`), follow the installed types and note it in the report.

Replace the `billing` object in both message files with (EN / RU):
```json
"billing": {
  "title": "Billing" / "Тариф",
  "current": "Current plan: {plan}" / "Текущий тариф: {plan}",
  "free": "Free" / "Бесплатный",
  "pro": "Pro" / "Pro",
  "proLifetime": "Pro Lifetime" / "Pro навсегда",
  "usage": "{used} / {limit} submissions this month" / "{used} / {limit} отзывов в этом месяце",
  "usageUnlimited": "{used} submissions this month" / "{used} отзывов в этом месяце",
  "monthly": "Pro — $9/month" / "Pro — $9/мес",
  "lifetime": "Lifetime — $49" / "Навсегда — $49",
  "features": "Unlimited projects and reports · own Telegram bot · no badge · custom CSS · 1-year screenshots" / "Безлимит проектов и отзывов · свой Telegram-бот · без бейджа · свой CSS · скриншоты 1 год",
  "lifetimeNote": "Everything in Pro, paid once." / "Всё из Pro, одна оплата.",
  "buyMonthly": "Subscribe" / "Оформить подписку",
  "buyLifetime": "Buy Lifetime" / "Купить навсегда",
  "taxNote": "Tax may apply at checkout." / "При оплате может добавиться налог.",
  "renews": "Pro · next payment on {date}" / "Pro · следующее списание {date}",
  "endsOn": "Pro · active until {date}" / "Pro · действует до {date}",
  "pastDue": "We couldn’t charge your card — update your payment method." / "Не удалось списать оплату — обновите способ оплаты.",
  "manage": "Manage subscription" / "Управлять подпиской",
  "receipts": "Billing and receipts" / "Счета и оплата",
  "switchLifetime": "Switch to Lifetime — $49" / "Перейти на навсегда — $49",
  "activating": "Payment received, activating Pro…" / "Оплата прошла, активируем Pro…",
  "activationSlow": "Payment received; activation can take a couple of minutes — refresh later." / "Платёж получен; активация может занять пару минут — обновите страницу позже.",
  "comingSoonTitle": "Payments are coming soon" / "Оплата скоро появится",
  "comingSoonBody": "We are finishing payments. Pro features will be available here shortly." / "Мы заканчиваем подключение оплаты. Pro-возможности скоро будут доступны здесь.",
  "unavailable": "Payments are not available right now." / "Оплата сейчас недоступна.",
  "alreadyLifetime": "You already have Pro Lifetime." / "У вас уже есть Pro навсегда.",
  "alreadySubscribed": "You already have an active Pro subscription." / "У вас уже есть активная подписка Pro.",
  "checkoutFailed": "Could not open checkout. Try again." / "Не удалось открыть оплату. Попробуйте ещё раз.",
  "noCustomer": "No billing account yet." / "Платёжного аккаунта пока нет.",
  "portalFailed": "Could not open the billing portal. Try again." / "Не удалось открыть портал оплаты. Попробуйте ещё раз."
}
```

- [ ] **Step 2: Server actions**

Append to `apps/web/app/app/actions.ts` (imports at the top):
```ts
import { openPortal, startCheckout } from '@/lib/billing/checkout';
import { isPro } from '@/lib/dashboard/settings';

export async function startCheckoutAction(
  plan: 'monthly' | 'lifetime',
): Promise<ActionResult<{ transactionId: string }>> {
  const user = await requireUser();
  if (plan !== 'monthly' && plan !== 'lifetime') return { ok: false, error: 'errors.generic' };
  return startCheckout(await getDeps(), user.id, plan);
}

export async function openPortalAction(): Promise<ActionResult<{ url: string }>> {
  const user = await requireUser();
  return openPortal(await getDeps(), user.id);
}

export async function billingStatusAction(): Promise<{ pro: boolean }> {
  const user = await requireUser();
  return { pro: await isPro(await getDeps(), user.id) };
}
```
If `isPro` is already imported in this file, reuse the import.

- [ ] **Step 3: Client components**

`apps/web/components/app/billing/use-paddle.ts`:
```ts
'use client';

import { initializePaddle, type Paddle } from '@paddle/paddle-js';
import { useEffect, useRef, useState } from 'react';

/** Loads Paddle.js once; `onCompleted` fires on the `checkout.completed` event. */
export function usePaddle(opts: {
  environment: 'sandbox' | 'production';
  token: string;
  onCompleted: () => void;
}) {
  const [paddle, setPaddle] = useState<Paddle | null>(null);
  const onCompleted = useRef(opts.onCompleted);
  onCompleted.current = opts.onCompleted;
  useEffect(() => {
    let cancelled = false;
    void initializePaddle({
      environment: opts.environment,
      token: opts.token,
      eventCallback: (event) => {
        if (event.name === 'checkout.completed') onCompleted.current();
      },
    }).then((instance) => {
      if (!cancelled && instance) setPaddle(instance);
    });
    return () => {
      cancelled = true;
    };
  }, [opts.environment, opts.token]);
  return paddle;
}
```
(Use the event-name constant the installed package exports if one exists, e.g. `CheckoutEventNames.CHECKOUT_COMPLETED`.)

`apps/web/components/app/billing/billing-panel.tsx`:
```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { billingStatusAction, openPortalAction, startCheckoutAction } from '@/app/app/actions';
import type { BillingOverview } from '@/lib/billing/checkout';
import { usePaddle } from './use-paddle';

const POLL_MS = 2000;
const POLL_LIMIT_MS = 60_000;

export function BillingPanel(props: {
  overview: BillingOverview;
  email: string;
  environment: 'sandbox' | 'production';
  clientToken: string;
}) {
  const t = useTranslations();
  const format = useFormatter();
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [activation, setActivation] = useState<'idle' | 'waiting' | 'slow'>('idle');
  const paddle = usePaddle({
    environment: props.environment,
    token: props.clientToken,
    onCompleted: () => {
      paddle?.Checkout.close();
      setActivation('waiting');
    },
  });

  useEffect(() => {
    if (activation !== 'waiting') return;
    const started = Date.now();
    const timer = setInterval(async () => {
      if ((await billingStatusAction()).pro) {
        clearInterval(timer);
        setActivation('idle');
        router.refresh();
      } else if (Date.now() - started > POLL_LIMIT_MS) {
        clearInterval(timer);
        setActivation('slow');
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [activation, router]);

  const checkout = (plan: 'monthly' | 'lifetime') =>
    start(async () => {
      const result = await startCheckoutAction(plan);
      if (!result.ok) return void toast.error(t(result.error));
      if (!paddle) return void toast.error(t('billing.checkoutFailed'));
      paddle.Checkout.open({
        transactionId: result.transactionId,
        customer: { email: props.email },
        settings: { displayMode: 'overlay', locale: locale === 'ru' ? 'ru' : 'en' },
      });
    });

  const portal = () =>
    start(async () => {
      const result = await openPortalAction();
      if (result.ok) window.open(result.url, '_blank', 'noopener,noreferrer');
      else toast.error(t(result.error));
    });

  const date = (iso: string | null) =>
    iso ? format.dateTime(new Date(iso), { dateStyle: 'long' }) : '';
  const { overview } = props;

  if (activation !== 'idle') {
    return activation === 'waiting' ? (
      <p className="animate-pulse" data-testid="billing-activating">
        {t('billing.activating')}
      </p>
    ) : (
      <p data-testid="billing-activation-slow">{t('billing.activationSlow')}</p>
    );
  }

  if (overview.state === 'free') {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <section className="flex flex-col gap-3 rounded-lg border p-5" data-testid="billing-card-monthly">
            <h2 className="font-semibold">{t('billing.monthly')}</h2>
            <p className="text-sm text-muted-foreground">{t('billing.features')}</p>
            <Button disabled={pending} onClick={() => checkout('monthly')} data-testid="billing-upgrade-monthly">
              {t('billing.buyMonthly')}
            </Button>
          </section>
          <section className="flex flex-col gap-3 rounded-lg border p-5" data-testid="billing-card-lifetime">
            <h2 className="font-semibold">{t('billing.lifetime')}</h2>
            <p className="text-sm text-muted-foreground">{t('billing.lifetimeNote')}</p>
            <Button disabled={pending} onClick={() => checkout('lifetime')} data-testid="billing-upgrade-lifetime">
              {t('billing.buyLifetime')}
            </Button>
          </section>
        </div>
        <p className="text-xs text-muted-foreground">{t('billing.taxNote')}</p>
      </div>
    );
  }

  if (overview.state === 'lifetime') {
    return (
      <div className="flex flex-col items-start gap-3">
        {overview.hasCustomer && (
          <Button variant="outline" disabled={pending} onClick={portal} data-testid="billing-manage">
            {t('billing.receipts')}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-3">
      {overview.state === 'past_due' ? (
        <p className="text-sm text-destructive" data-testid="billing-past-due">
          {t('billing.pastDue')}
        </p>
      ) : (
        overview.periodEnd && (
          <p className="text-sm">
            {overview.cancelAtPeriodEnd
              ? t('billing.endsOn', { date: date(overview.periodEnd) })
              : t('billing.renews', { date: date(overview.periodEnd) })}
          </p>
        )
      )}
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" disabled={pending} onClick={portal} data-testid="billing-manage">
          {t('billing.manage')}
        </Button>
        {overview.state === 'monthly' && (
          <Button disabled={pending} onClick={() => checkout('lifetime')} data-testid="billing-switch-lifetime">
            {t('billing.switchLifetime')}
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Page**

Replace `apps/web/app/app/billing/page.tsx` with:
```tsx
import { getTranslations } from 'next-intl/server';
import { BillingPanel } from '@/components/app/billing/billing-panel';
import { UpgradeButtons } from '@/components/app/billing/upgrade-buttons';
import { requireUser } from '@/lib/auth/session';
import { billingOverview } from '@/lib/billing/checkout';
import { billingConfig } from '@/lib/billing/config';
import { usage } from '@/lib/dashboard/feedback';
import { getDeps } from '@/lib/deps';

export default async function BillingPage() {
  const user = await requireUser();
  const deps = await getDeps();
  const [plan, overview] = await Promise.all([usage(deps, user.id), billingOverview(deps, user.id)]);
  const config = billingConfig(deps.env);
  const t = await getTranslations('billing');
  const planName =
    overview.state === 'lifetime' ? t('proLifetime') : plan.pro ? t('pro') : t('free');
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p data-testid="billing-plan">{t('current', { plan: planName })}</p>
      <p className="text-sm text-muted-foreground">
        {plan.limit === null
          ? t('usageUnlimited', { used: plan.used })
          : t('usage', { used: plan.used, limit: plan.limit })}
      </p>
      {config ? (
        <BillingPanel
          overview={overview}
          email={user.email}
          environment={config.environment}
          clientToken={config.clientToken}
        />
      ) : (
        !plan.pro && <UpgradeButtons />
      )}
    </div>
  );
}
```
`config.clientToken` is the public client-side token (safe to send). NEVER pass `apiKey` or `webhookSecret` to a client component.

- [ ] **Step 5: Verify and commit**

Run: `pnpm --filter @dymcode/web test && pnpm typecheck && pnpm --filter @dymcode/web build`, then `git checkout -- apps/web/next-env.d.ts`.
Expected: PASS. The build must not require Paddle vars (none are set in CI).
```bash
pnpm format
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): add the Paddle billing page"
```

---

### Task 7: Legal texts, refund page and landing pricing links

**Files:**
- Create: `apps/web/app/(marketing)/refund/page.tsx`
- Modify: `apps/web/messages/en.json`, `apps/web/messages/ru.json`, `apps/web/app/(marketing)/terms/page.tsx`, `apps/web/app/(marketing)/privacy/page.tsx`, `apps/web/components/marketing/site-footer.tsx`, `apps/web/app/sitemap.ts`, `apps/web/app/seo.test.ts`, `apps/web/app/(marketing)/page.tsx`
- Test: `apps/web/app/seo.test.ts`

**Interfaces:**
- Produces: route `/refund`; footer link; sitemap entry; landing pricing links to `/app/billing` (test id `landing-pricing-cta`).

- [ ] **Step 1: Failing test**

In `apps/web/app/seo.test.ts`, change the sitemap expectation list from `['', '/privacy', '/terms', '/login']` to `['', '/privacy', '/terms', '/refund', '/login']`.

Run: `pnpm --filter @dymcode/web test`
Expected: FAIL on the sitemap test.

- [ ] **Step 2: Messages**

Add to `legal` in both files (EN / RU):
```json
"terms5": "Our order process is conducted by our online reseller Paddle.com. Paddle.com is the Merchant of Record for all our orders. Paddle provides all customer service inquiries and handles returns." / "Оформление заказов выполняет наш онлайн-реселлер Paddle.com. Paddle.com является продавцом (Merchant of Record) по всем нашим заказам. Paddle отвечает на вопросы покупателей и обрабатывает возвраты.",
"privacy7": "Payments are processed by Paddle.com; we do not see or store card details." / "Платежи обрабатывает Paddle.com; мы не видим и не храним данные карт.",
"refundTitle": "Refund Policy" / "Политика возврата",
"refund1": "You can get a full refund within 14 days of the first payment of a subscription or of a Lifetime purchase." / "Вы можете получить полный возврат в течение 14 дней после первой оплаты подписки или покупки Lifetime.",
"refund2": "After that, a monthly subscription can be cancelled at any time and stays active until the end of the paid period." / "После этого месячную подписку можно отменить в любой момент; она действует до конца оплаченного периода.",
"refund3": "To request a refund, reply to your Paddle receipt email or contact us. Refunds are processed by Paddle, our Merchant of Record." / "Чтобы запросить возврат, ответьте на письмо с чеком от Paddle или свяжитесь с нами. Возвраты обрабатывает Paddle — наш продавец (Merchant of Record)."
```
Add to `landing` in both files: `"refund": "Refunds" / "Возвраты"` and `"choosePlan": "Choose plan" / "Выбрать тариф"`.

- [ ] **Step 3: Pages and links**

- `terms/page.tsx`: extend the key list to `['terms1', 'terms2', 'terms3', 'terms4', 'terms5']`.
- `privacy/page.tsx`: extend it to include `'privacy7'`.
- `refund/page.tsx`: same structure as `terms/page.tsx`:
  - `generateMetadata` returns the title `refundTitle`;
  - an `<article>` with the h1 `refundTitle`, the `draft` banner and paragraphs `refund1`–`refund3`.
- `site-footer.tsx`: add `<Link href="/refund" className="hover:underline">{t('refund')}</Link>` after Terms.
- `sitemap.ts`: the list becomes `['', '/privacy', '/terms', '/refund', '/login']`.
- `(marketing)/page.tsx` pricing section: below the three plan cards, add
  ```tsx
  <Button size="lg" nativeButton={false} render={<Link href="/app/billing" />} data-testid="landing-pricing-cta">
    {t('choosePlan')}
  </Button>
  ```
  Use the same Base UI `render` + `nativeButton={false}` pattern the hero CTA already uses in that file. `/app/billing` requires sign-in, so the proxy redirects anonymous visitors to `/login`.

- [ ] **Step 4: Verify and commit**

Run: `pnpm --filter @dymcode/web test && pnpm typecheck && pnpm --filter @dymcode/web build`, then `git checkout -- apps/web/next-env.d.ts`.
Expected: PASS; the build lists `/refund`.
```bash
pnpm format
git add apps/web
git commit -m "feat(web): add Paddle legal texts, a refund page and pricing links"
```

---

### Task 8: E2E, test-mode Paddle fakes and the setup guide

**Files:**
- Modify: `apps/web/lib/test-mode.ts` (outbox fetch answers Paddle API calls), `apps/web/playwright.config.ts` (fake Paddle env), `docs/deploy.md`, `docs/superpowers/followups/2026-09-23-dashboard-followups.md` (only if an item is resolved)
- Create: `apps/web/e2e/billing.spec.ts`

**Interfaces:**
- Consumes: `signPaddle` (Task 3), `/api/e2e-test/login` (returns `{ id }`), billing and settings test ids (Tasks 6 and phase 4: `billing-plan`, `billing-manage`, `settings-hide-badge`, `settings-css`).

- [ ] **Step 1: Test-mode fakes and env**

In `apps/web/lib/test-mode.ts`, inside `outboxFetch`, before the default response:
```ts
    if (url.includes('paddle.com/transactions')) {
      return new Response(JSON.stringify({ data: { id: 'txn_e2e_000000000000' } }), { status: 201 });
    }
    if (url.includes('paddle.com/customers/') && url.endsWith('/portal-sessions')) {
      return new Response(
        JSON.stringify({ data: { urls: { general: { overview: 'https://sandbox-customer-portal.paddle.com/e2e' } } } }),
        { status: 201 },
      );
    }
    if (url.includes('paddle.com/subscriptions/') && url.endsWith('/cancel')) {
      return new Response(JSON.stringify({ data: { id: 'sub_e2e' } }), { status: 200 });
    }
```

In `apps/web/playwright.config.ts` `webServer.env`, add fake Paddle values. These are fake values: test mode never calls Paddle, the outbox answers.
```ts
      PADDLE_API_KEY: 'pdl_sdbx_apikey_e2e0000000000000000',
      PADDLE_WEBHOOK_SECRET: 'pdl_ntfset_e2e000000000000',
      PADDLE_PRICE_MONTHLY: 'pri_e2emonthly0000000000',
      PADDLE_PRICE_LIFETIME: 'pri_e2elifetime000000000',
      NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: 'test_e2e0000000000000000',
      NEXT_PUBLIC_PADDLE_ENV: 'sandbox',
```

- [ ] **Step 2: E2E spec**

`apps/web/e2e/billing.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { signPaddle } from '../lib/billing/signature';

const SECRET = 'pdl_ntfset_e2e000000000000'; // playwright.config.ts webServer.env
const LIFETIME = 'pri_e2elifetime000000000';

test('a signed Lifetime webhook turns the account Pro and unlocks Pro settings', async ({ page }) => {
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
```
Notes:
- `page.request.post(..., { data: body })` with a string sends it verbatim: the signed bytes must equal the sent bytes.
- If Playwright cannot import `../lib/billing/signature` (path alias or Node built-ins), inline an equivalent `signPaddle` in the spec using `node:crypto`. It is 3 lines.
- Waiting for the settings page to render with the right Pro status must use `expect(...)`, not sleeps.

- [ ] **Step 3: Run the E2E suite**

Kill any stale server on port 3100 first.
Run: `pnpm --filter @dymcode/web e2e`
Expected: all existing tests plus the 2 new billing tests PASS.

- [ ] **Step 4: Setup guide**

Add a section `## 6. Billing (Paddle)` to `docs/deploy.md`, before the smoke checklist (renumber that to 7). It has two parts.

**Sandbox:**
1. Create a sandbox account at `https://sandbox-vendors.paddle.com` (no identity verification).
2. Catalog → Products: "Dymcode Pro" with two prices: $9 monthly recurring and $49 one-time. Copy both `pri_…` ids.
3. Developer tools → Authentication: create an API key and a client-side token.
4. Developer tools → Notifications: a destination `https://<domain>/api/billing/webhook` for `subscription.*`, `transaction.completed`, `adjustment.created`, `adjustment.updated`. Copy its secret key.
5. Checkout → Checkout settings: set the default payment link to `https://<domain>/app/billing`.
6. Apply the database migration to Supabase: `supabase db push` (the owner runs it, or the agent runs it with the owner's explicit approval).
7. Add `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `PADDLE_PRICE_MONTHLY`, `PADDLE_PRICE_LIFETIME`, `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` and `NEXT_PUBLIC_PADDLE_ENV=sandbox` to Vercel (Production; the two `NEXT_PUBLIC_` ones as type Config) and to `apps/web/.env.local`, then redeploy.
8. Test with card `4242 4242 4242 4242`, any future expiry, CVC `100`:
   - monthly purchase → Pro;
   - cancel in the portal → "active until";
   - Lifetime upgrade → the monthly subscription is scheduled to cancel;
   - a refund from the sandbox dashboard → Free.

**Going live:**
- Create the live Paddle account and complete verification and domain/site approval. The site needs pricing, Terms, Privacy and Refund pages; a custom domain is likely required.
- Recreate the product, prices, keys, notification destination and default payment link in the live account.
- Replace the six variables with live values (`NEXT_PUBLIC_PADDLE_ENV=production`) and redeploy.

- [ ] **Step 5: Final verification and commit**

Run:
```bash
pnpm format:check && pnpm typecheck && pnpm test
pnpm --filter @dymcode/widget build && pnpm --filter @dymcode/web build && pnpm --filter @dymcode/web e2e
git checkout -- apps/web/next-env.d.ts
```
Expected: all PASS.
```bash
pnpm format
git add apps/web docs
git commit -m "test(web): add billing E2E and the Paddle setup guide"
```
