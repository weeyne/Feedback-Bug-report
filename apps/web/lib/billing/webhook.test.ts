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
      Record<string, unknown> | undefined;
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
