import { createUser, withTx, type TestDb } from '@dymcode/db-tests/harness';
import { describe, expect, it } from 'vitest';
import { PADDLE_ENV, VALID_ENV } from '@/test/fixtures';
import type { DashDeps } from '../dashboard/result';
import { parseEnv } from '../env';
import { createMemoryStorage } from '../storage';
import { billingOverview, openPortal, startCheckout } from './checkout';

function setup(db: TestDb, opts: { disabled?: boolean; fail?: boolean } = {}) {
  const calls: Array<{ url: string; method: string; body: any }> = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    if (opts.fail) return Response.json({ error: { code: 'internal_error' } }, { status: 500 });
    if (url.includes('/customers?email=')) return Response.json({ data: [] });
    if (url.endsWith('/customers'))
      return Response.json({ data: { id: 'ctm_new' } }, { status: 201 });
    if (url.endsWith('/portal-sessions')) {
      return Response.json({
        data: { urls: { general: { overview: 'https://portal.example/o' } } },
      });
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
      await addRow(db, u, {
        plan: 'pro_lifetime',
        status: 'paid',
        txn: 'txn_l',
        customer: 'ctm_a',
      });
      expect((await billingOverview(deps, u)).state).toBe('lifetime');
      expect((await billingOverview(setup(db, { disabled: true }).deps, u)).state).toBe('disabled');
    }));
});

describe('startCheckout', () => {
  it('creates a transaction for a Free user, ensuring a Paddle customer, and reuses a known customer id', () =>
    withTx(async (db) => {
      const { deps, calls } = setup(db);
      const u = await createUser(db);
      const buyer = { id: u, email: 'u@example.com' };
      expect(await startCheckout(deps, buyer, 'monthly')).toEqual({
        ok: true,
        transactionId: 'txn_new',
      });
      // No known customer id on file: look it up, then create one, then pass it to the transaction.
      expect(calls).toHaveLength(3);
      expect(calls[0]).toMatchObject({
        method: 'GET',
        url: 'https://sandbox-api.paddle.com/customers?email=u%40example.com',
      });
      expect(calls[1]).toMatchObject({
        method: 'POST',
        url: 'https://sandbox-api.paddle.com/customers',
        body: { email: 'u@example.com' },
      });
      expect(calls[2]!.body).toEqual({
        items: [{ price_id: PADDLE_ENV.PADDLE_PRICE_MONTHLY, quantity: 1 }],
        custom_data: { user_id: u },
        customer_id: 'ctm_new',
      });

      await addRow(db, u, {
        plan: 'pro_monthly',
        status: 'canceled',
        subscription: 'sub_old',
        customer: 'ctm_known',
      });
      await startCheckout(deps, buyer, 'lifetime');
      // A known customer id on the user's rows: no /customers lookup or creation at all.
      expect(calls).toHaveLength(4);
      expect(calls[3]!.body).toMatchObject({
        items: [{ price_id: PADDLE_ENV.PADDLE_PRICE_LIFETIME, quantity: 1 }],
        customer_id: 'ctm_known',
      });
    }));

  it('enforces the purchase rules', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const monthly = await createUser(db);
      const monthlyBuyer = { id: monthly, email: 'monthly@example.com' };
      await addRow(db, monthly, { plan: 'pro_monthly', status: 'active', subscription: 'sub_m' });
      expect(await startCheckout(deps, monthlyBuyer, 'monthly')).toEqual({
        ok: false,
        error: 'billing.alreadySubscribed',
      });
      expect((await startCheckout(deps, monthlyBuyer, 'lifetime')).ok).toBe(true);
      const lifetime = await createUser(db);
      const lifetimeBuyer = { id: lifetime, email: 'lifetime@example.com' };
      await addRow(db, lifetime, { plan: 'pro_lifetime', status: 'paid', txn: 'txn_x' });
      for (const plan of ['monthly', 'lifetime'] as const) {
        expect(await startCheckout(deps, lifetimeBuyer, plan)).toEqual({
          ok: false,
          error: 'billing.alreadyLifetime',
        });
      }
    }));

  it('maps disabled billing, Paddle errors and the rate limit', () =>
    withTx(async (db) => {
      const u = await createUser(db);
      const buyer = { id: u, email: 'u@example.com' };
      expect(await startCheckout(setup(db, { disabled: true }).deps, buyer, 'monthly')).toEqual({
        ok: false,
        error: 'billing.unavailable',
      });
      expect(await startCheckout(setup(db, { fail: true }).deps, buyer, 'monthly')).toEqual({
        ok: false,
        error: 'billing.checkoutFailed',
      });
      const { deps } = setup(db);
      for (let i = 0; i < 9; i++) await startCheckout(deps, buyer, 'monthly');
      expect(await startCheckout(deps, buyer, 'monthly')).toEqual({
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
      expect(calls.at(-1)).toMatchObject({
        url: 'https://sandbox-api.paddle.com/customers/ctm_p/portal-sessions',
        body: { subscription_ids: ['sub_p'] },
      });
    }));
});
