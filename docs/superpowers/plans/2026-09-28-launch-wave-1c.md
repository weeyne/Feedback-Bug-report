# Launch wave 1c Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the Paddle billing webhook and configuration before going live.

**Architecture:** All changes are in `apps/web/lib/billing/` (webhook, config) plus docs. The webhook dispatch moves
into one DB transaction with a per-user advisory lock; small guards (body cap, key/env consistency) and one new
adjustment action are added.

**Tech Stack:** Next.js 16 route handler, Postgres (PGlite in tests), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-28-launch-wave-1c-design.md`

## Global Constraints

- English code/comments/commits/docs. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- No new dependencies, no migrations. Existing billing tests stay green.
- Never create, read, print or commit `.env*` files; never run `supabase` CLI commands.
- Logs never contain key values, emails or payload bodies (event ids, event types and Paddle ids only).
- Commands from the repo root: single file `pnpm --filter @bugping/web exec vitest run <path relative to apps/web>`;
  before committing `pnpm typecheck`, `pnpm --filter @bugping/web test`, `pnpm format:check`.

---

### Task 1: Body cap, key/environment consistency, chargeback_reverse

**Files:**
- Modify: `apps/web/lib/billing/webhook.ts`, `apps/web/lib/billing/config.ts`, `apps/web/test/paddle-fixtures.ts`
  (`adjustmentEvent` action type)
- Test: `apps/web/lib/billing/webhook.test.ts`, `apps/web/lib/billing/config.test.ts`

**Interfaces:**
- Produces: `MAX_WEBHOOK_BYTES = 64 * 1024` (exported from `webhook.ts`); `billingConfig(env)` unchanged signature.

- [ ] **Step 1: Failing tests.**

`config.test.ts` — fix the existing production case to use a live API key
(`PADDLE_API_KEY: 'pdl_live_apikey_0123456789abcdefghij'`), then add:

```ts
  it('disables billing when the keys do not match the environment, without logging values', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const cases = [
      { NEXT_PUBLIC_PADDLE_ENV: 'sandbox', PADDLE_API_KEY: 'pdl_live_apikey_0123456789abcdefghij' },
      {
        NEXT_PUBLIC_PADDLE_ENV: 'production',
        NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: 'live_0123456789abcdef0123',
        PADDLE_API_KEY: 'pdl_sdbx_apikey_0123456789abcdefghij',
      },
      { NEXT_PUBLIC_PADDLE_ENV: 'production', PADDLE_API_KEY: 'pdl_live_apikey_0123456789abcdefghij' },
      { NEXT_PUBLIC_PADDLE_ENV: 'sandbox', NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: 'live_0123456789abcdef0123' },
    ];
    for (const overrides of cases) {
      expect(billingConfig(parseEnv({ ...VALID_ENV, ...PADDLE_ENV, ...overrides }))).toBeNull();
    }
    const logged = error.mock.calls.flat().join(' ');
    expect(logged).toContain('billing is disabled');
    expect(logged).not.toMatch(/pdl_|live_0123|test_0123/);
    error.mockRestore();
  });

  it('does not judge an API key without a known prefix', () => {
    expect(
      billingConfig(parseEnv({ ...VALID_ENV, ...PADDLE_ENV, PADDLE_API_KEY: '0123456789abcdef0123456789' })),
    ).not.toBeNull();
  });
```

(the third case is the test-token + production mismatch: `PADDLE_ENV`'s token is `test_…`.) Import `vi` from vitest.

`webhook.test.ts` — add inside `describe('billing webhook')`:

```ts
  it('rejects oversized bodies before checking the signature', () =>
    withTx(async (db) => {
      const big = { event_id: 'evt_big', event_type: 'x', occurred_at: '2026-09-01T00:00:00Z',
        data: { pad: 'x'.repeat(MAX_WEBHOOK_BYTES) } };
      const byLength = await handleBillingWebhook({ db, env, fetch }, signedRequest(big, SECRET));
      expect(byLength.status).toBe(413);
      const byHeader = await handleBillingWebhook(
        { db, env, fetch },
        new Request('https://bugping.app/api/billing/webhook', {
          method: 'POST',
          body: '{}',
          headers: { 'content-length': String(MAX_WEBHOOK_BYTES + 1) },
        }),
      );
      expect(byHeader.status).toBe(413);
    }));

  describe('chargeback_reverse', () => {
    it('restores a refunded Lifetime and ignores an older event', () =>
      withTx(async (db) => {
        const { send, pro } = setup(db);
        const user = await createUser(db);
        await send(transactionCompleted({ userId: user, priceId: LIFETIME, transactionId: 'txn_cb',
          occurredAt: '2026-09-01T00:00:00Z' }));
        await send(adjustmentEvent({ transactionId: 'txn_cb', action: 'chargeback', type: 'full',
          status: 'approved', occurredAt: '2026-09-02T00:00:00Z' }));
        expect(await pro(user)).toBe(false);
        await send(adjustmentEvent({ transactionId: 'txn_cb', action: 'chargeback_reverse', type: 'full',
          status: 'approved', occurredAt: '2026-09-01T12:00:00Z' }));
        expect(await pro(user)).toBe(false);
        await send(adjustmentEvent({ transactionId: 'txn_cb', action: 'chargeback_reverse', type: 'full',
          status: 'approved', occurredAt: '2026-09-03T00:00:00Z' }));
        expect(await pro(user)).toBe(true);
      }));

    it('retries when the Lifetime row does not exist yet', () =>
      withTx(async (db) => {
        const { send } = setup(db);
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const res = await send(adjustmentEvent({ transactionId: 'txn_missing', action: 'chargeback_reverse',
          type: 'full', status: 'approved', occurredAt: '2026-09-03T00:00:00Z' }));
        expect(res.status).toBe(500);
        error.mockRestore();
      }));

    it('only warns for a subscription payment', () =>
      withTx(async (db) => {
        const { send, calls } = setup(db);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const res = await send(adjustmentEvent({ transactionId: 'txn_sub', subscriptionId: 'sub_cb',
          action: 'chargeback_reverse', type: 'full', status: 'approved', occurredAt: '2026-09-03T00:00:00Z' }));
        expect(res.status).toBe(200);
        expect(calls).toEqual([]);
        expect(warn.mock.calls.flat().join(' ')).toContain('sub_cb');
        warn.mockRestore();
      }));
  });
```

Adapt the `transactionCompleted(...)` arguments to that helper's real signature in `apps/web/test/paddle-fixtures.ts`
(keep the intent). Widen `adjustmentEvent`'s `action` type to include `'chargeback_reverse'`. Import
`MAX_WEBHOOK_BYTES` from `./webhook`.

- [ ] **Step 2: Run to verify they fail** — `pnpm --filter @bugping/web exec vitest run lib/billing/config.test.ts lib/billing/webhook.test.ts`.

- [ ] **Step 3: Implement.**

`config.ts`:

```ts
let mismatchLogged = false;

/** A key whose prefix names the other environment (unprefixed keys are not judged). */
function keysMismatch(env: Env): boolean {
  const sandbox = env.NEXT_PUBLIC_PADDLE_ENV === 'sandbox';
  const key = env.PADDLE_API_KEY ?? '';
  const token = env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? '';
  if (key.startsWith(sandbox ? 'pdl_live_' : 'pdl_sdbx_')) return true;
  return token.startsWith(sandbox ? 'live_' : 'test_');
}
```

and in `billingConfig`, after the all-present check:

```ts
  if (keysMismatch(env)) {
    if (!mismatchLogged) {
      mismatchLogged = true;
      console.error(
        `[billing] Paddle keys do not match NEXT_PUBLIC_PADDLE_ENV=${env.NEXT_PUBLIC_PADDLE_ENV}; billing is disabled`,
      );
    }
    return null;
  }
```

(The once-per-process flag means the config test must assert on the first mismatching case's log; if the flag makes
the test order-dependent, export `resetBillingConfigWarning()` for tests only, named as such.)

`webhook.ts`:
- `export const MAX_WEBHOOK_BYTES = 64 * 1024;`
- at the top of `handleBillingWebhook`, after the config check:

```ts
  if (Number(request.headers.get('content-length') ?? 0) > MAX_WEBHOOK_BYTES) {
    return json({ error: 'payload too large' }, 413);
  }
  const raw = await request.text();
  if (raw.length > MAX_WEBHOOK_BYTES) return json({ error: 'payload too large' }, 413);
```

- in `onAdjustment`, accept `'chargeback_reverse'` next to `chargeback`/`refund` and handle it before the refund
  logic:

```ts
  if (adj.action === 'chargeback_reverse') {
    if (adj.subscription_id) {
      console.warn(
        '[billing/webhook] chargeback reversed for a cancelled subscription',
        ctx.eventId,
        adj.subscription_id,
      );
      return;
    }
    const restored = await ctx.db.query(
      `update public.subscriptions set status = 'paid', paddle_occurred_at = $2::timestamptz,
         updated_at = now()
       where paddle_transaction_id = $1 and plan = 'pro_lifetime'
         and (paddle_occurred_at is null or paddle_occurred_at < $2::timestamptz)
       returning id`,
      [adj.transaction_id, ctx.occurredAt],
    );
    if (restored.length > 0) return;
    const [existing] = await ctx.db.query(
      `select 1 from public.subscriptions where paddle_transaction_id = $1 and plan = 'pro_lifetime'`,
      [adj.transaction_id],
    );
    if (!existing) {
      throw new RetryLater([ctx.eventId, 'no Lifetime row for adjustment', adj.transaction_id]);
    }
    return;
  }
```

The "no row → retry" tail duplicates the refund path's; extract a small `lifetimeRowExists(ctx, transactionId)`
helper and use it in both places.

- [ ] **Step 4: Run the tests** (Step 2 command). Expected: PASS. Then full checks.

- [ ] **Step 5: Commit** — `fix(web): cap billing webhook bodies, catch mismatched Paddle keys, handle chargeback_reverse`.

---

### Task 2: One transaction per event with a per-user lock; mark duplicates as cancelling

**Files:**
- Modify: `apps/web/lib/billing/webhook.ts`
- Test: `apps/web/lib/billing/webhook.test.ts`

**Interfaces:**
- Consumes: Task 1's `webhook.ts` as committed.
- Produces: no new exports.

- [ ] **Step 1: Failing tests** — add to `webhook.test.ts`:

```ts
  it('serialises each user: the dispatch runs in a transaction and locks billing:<user>', () =>
    withTx(async (db) => {
      const sqls: Array<{ sql: string; params: unknown[]; inTx: boolean }> = [];
      const record = (inner: Db, inTx: boolean): Db => ({
        query: (sql, params = []) => {
          sqls.push({ sql, params, inTx });
          return inner.query(sql, params);
        },
        transaction: (fn) => inner.transaction((tx) => fn(record(tx, true))),
      });
      const user = await createUser(db);
      const res = await handleBillingWebhook(
        { db: record(db, false), env, fetch },
        signedRequest(subscriptionEvent({ userId: user, priceId: MONTHLY, subscriptionId: 'sub_lock',
          type: 'subscription.created', status: 'active', occurredAt: '2026-09-01T00:00:00Z' }), SECRET),
      );
      expect(res.status).toBe(200);
      const lock = sqls.find((s) => s.sql.includes('pg_advisory_xact_lock'));
      expect(lock).toMatchObject({ params: [`billing:${user}`], inTx: true });
      const insert = sqls.findIndex((s) => s.sql.includes('insert into public.subscriptions'));
      expect(sqls.indexOf(lock!)).toBeLessThan(insert);
      expect(sqls.every((s) => s.inTx)).toBe(true);
    }));

  it('marks a monthly duplicate cancelled at period end as cancelling', () =>
    withTx(async (db) => {
      const { send, row } = setup(db);
      const user = await createUser(db);
      for (const [id, at] of [['sub_a', '2026-09-01T00:00:00Z'], ['sub_b', '2026-09-02T00:00:00Z']] as const) {
        await send(subscriptionEvent({ userId: user, priceId: MONTHLY, subscriptionId: id,
          type: 'subscription.created', status: 'active', occurredAt: at }));
      }
      expect(await row('paddle_subscription_id', 'sub_b')).toMatchObject({ cancel_at_period_end: true });
      expect(await row('paddle_subscription_id', 'sub_a')).toMatchObject({ cancel_at_period_end: false });
    }));

  it('marks monthly subscriptions as cancelling after a Lifetime purchase', () =>
    withTx(async (db) => {
      const { send, row } = setup(db);
      const user = await createUser(db);
      await send(subscriptionEvent({ userId: user, priceId: MONTHLY, subscriptionId: 'sub_before',
        type: 'subscription.created', status: 'active', occurredAt: '2026-09-01T00:00:00Z' }));
      await send(transactionCompleted({ userId: user, priceId: LIFETIME, transactionId: 'txn_life2',
        occurredAt: '2026-09-02T00:00:00Z' }));
      expect(await row('paddle_subscription_id', 'sub_before')).toMatchObject({ cancel_at_period_end: true });
    }));
```

Import `type Db` from `'../db/types'`. Adapt helper arguments to the fixtures' real signatures, keeping the intent.
If an existing test asserts `cancel_at_period_end: false` after a next-period duplicate cancel, update it to the new
behaviour and say so in the report.

- [ ] **Step 2: Run to verify they fail** — `pnpm --filter @bugping/web exec vitest run lib/billing/webhook.test.ts`.

- [ ] **Step 3: Implement.**

```ts
/** Serialises events for one user until the surrounding transaction ends. */
async function lockUser(ctx: Ctx, userId: string): Promise<void> {
  await ctx.db.query('select pg_advisory_xact_lock(hashtext($1))', [`billing:${userId}`]);
}

/** Next-period cancel in Paddle, then mark the row so later events do not treat it as an active duplicate. */
async function cancelAtPeriodEnd(ctx: Ctx, subscriptionId: string): Promise<void> {
  await ctx.paddle.cancelSubscription(subscriptionId, 'next_billing_period');
  await ctx.db.query(
    'update public.subscriptions set cancel_at_period_end = true, updated_at = now() where paddle_subscription_id = $1',
    [subscriptionId],
  );
}
```

- Call `await lockUser(ctx, userId)` right after each `resolveUser(...)` in `onSubscription` and in both branches of
  `onTransactionCompleted`.
- In `cancelIfDuplicate` and the Lifetime loop, replace a `'next_billing_period'` cancel with `cancelAtPeriodEnd`;
  keep `cancelSubscription(id, 'immediately')` for `past_due` as is.
- In `handleBillingWebhook`, run the dispatch inside the transaction:

```ts
  try {
    await deps.db.transaction(async (tx) => {
      const ctx: Ctx = { db: tx, config, paddle: createPaddleClient(config, deps.fetch),
        eventId: event_id, eventType: event_type, occurredAt: occurred_at };
      if (event_type.startsWith('subscription.')) await onSubscription(ctx, data);
      else if (event_type === 'transaction.completed') await onTransactionCompleted(ctx, data);
      else if (event_type === 'adjustment.created' || event_type === 'adjustment.updated') {
        await onAdjustment(ctx, data);
      }
    });
    return json({ ok: true }, 200);
  } catch (error) { /* unchanged */ }
```

No handler may call `transaction` or `withUser` (nesting throws in production) — check `userSubscriptions` and any
helper it calls.

- [ ] **Step 4: Run the tests** (Step 2 command), then full checks.

- [ ] **Step 5: Commit** — `fix(web): serialise billing webhooks per user and mark cancelling duplicates`.

---

### Task 3: Documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-09-23-billing-paddle-design.md` (append "Amendments (2026-09-28)")
- Modify: `docs/superpowers/followups/2026-09-23-billing-followups.md`
- Modify: `docs/deploy.md` (§5 Billing)

- [ ] **Step 1:** Write the three doc changes exactly as spec §6 describes (English; keep each file's existing style;
  no promises the code does not keep — read `apps/web/lib/billing/checkout.ts`, `webhook.ts` and
  `apps/web/lib/dashboard/account.ts` to state the amendments accurately).
- [ ] **Step 2:** `pnpm format:check` (fix with `pnpm exec prettier --write <files>`).
- [ ] **Step 3: Commit** — `docs: billing amendments, deferred follow-ups and the past_due sandbox check`.
