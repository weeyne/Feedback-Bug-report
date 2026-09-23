import { createUser, withTx, type TestDb } from '@bugping/db-tests/harness';
import { describe, expect, it, vi } from 'vitest';
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
  // Write calls (POST) only; transaction reads are recorded separately in `reads`.
  const calls: Array<{ url: string; body: unknown }> = [];
  const reads: string[] = [];
  // Amount left on a transaction after approved refunds (Paddle `details.adjusted_totals.total`).
  // Unlisted transactions are fully refunded ('0').
  const remaining = new Map<string, string>();
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if ((init?.method ?? 'GET') === 'GET' && url.includes('/transactions/')) {
      reads.push(url);
      if (opts.paddleFails) {
        return Response.json({ error: { code: 'internal_error' } }, { status: 500 });
      }
      const id = decodeURIComponent(url.split('/transactions/')[1]!);
      return Response.json({
        data: { id, details: { adjusted_totals: { total: remaining.get(id) ?? '0' } } },
      });
    }
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
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
  return { calls, reads, remaining, send, pro, row };
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

  it('revokes Lifetime only once the refunds cover the whole payment, whatever their type', () =>
    withTx(async (db) => {
      const { send, pro, reads, remaining } = setup(db);
      const user = await createUser(db);
      await send(
        transactionCompleted({
          userId: user,
          priceId: LIFETIME,
          transactionId: 'txn_split',
          occurredAt: '2026-09-10T00:00:00Z',
        }),
      );
      // $1 of $49 refunded: Pro stays.
      remaining.set('txn_split', '4800');
      await send(
        adjustmentEvent({
          transactionId: 'txn_split',
          action: 'refund',
          type: 'partial',
          status: 'approved',
          occurredAt: '2026-09-11T00:00:00Z',
        }),
      );
      expect(await pro(user)).toBe(true);
      expect(reads).toEqual(['https://sandbox-api.paddle.com/transactions/txn_split']);
      // The remaining $48 refunded as another "partial" adjustment: nothing is left, Pro goes.
      remaining.set('txn_split', '0');
      await send(
        adjustmentEvent({
          transactionId: 'txn_split',
          action: 'refund',
          type: 'partial',
          status: 'approved',
          occurredAt: '2026-09-12T00:00:00Z',
        }),
      );
      expect(await pro(user)).toBe(false);
    }));

  it('revokes Lifetime on a full refund or chargeback but not on a partial refund', () =>
    withTx(async (db) => {
      const { send, pro, remaining } = setup(db);
      const user = await createUser(db);
      await send(
        transactionCompleted({
          userId: user,
          priceId: LIFETIME,
          transactionId: 'txn_ref',
          occurredAt: '2026-09-10T00:00:00Z',
        }),
      );
      remaining.set('txn_ref', '4800');
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
      remaining.set('txn_ref', '0');
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

  it('cancels a monthly subscription created after a paid Lifetime', () =>
    withTx(async (db) => {
      const { send, calls, pro } = setup(db);
      const user = await createUser(db);
      await send(
        transactionCompleted({
          userId: user,
          priceId: LIFETIME,
          transactionId: 'txn_dup_life',
          occurredAt: '2026-09-01T00:00:00Z',
        }),
      );
      expect(calls).toEqual([]);
      const res = await send(
        subscriptionEvent({
          type: 'subscription.created',
          userId: user,
          status: 'active',
          priceId: MONTHLY,
          subscriptionId: 'sub_after_life',
          occurredAt: '2026-09-02T00:00:00Z',
        }),
      );
      expect(res.status).toBe(200);
      expect(calls).toEqual([
        {
          url: 'https://sandbox-api.paddle.com/subscriptions/sub_after_life/cancel',
          body: { effective_from: 'next_billing_period' },
        },
      ]);
      expect(await pro(user)).toBe(true);
      // Paddle's follow-up event (cancel scheduled) triggers no second call.
      await send(
        subscriptionEvent({
          type: 'subscription.updated',
          userId: user,
          status: 'active',
          priceId: MONTHLY,
          subscriptionId: 'sub_after_life',
          scheduledCancel: true,
          occurredAt: '2026-09-02T00:00:05Z',
        }),
      );
      expect(calls).toHaveLength(1);
    }));

  it('cancels only the second of two monthly subscriptions', () =>
    withTx(async (db) => {
      const { send, calls } = setup(db);
      const user = await createUser(db);
      const monthly = { userId: user, priceId: MONTHLY, type: 'subscription.created' };
      await send(
        subscriptionEvent({
          ...monthly,
          status: 'active',
          subscriptionId: 'sub_first',
          occurredAt: '2026-09-01T00:00:00Z',
        }),
      );
      expect(calls).toEqual([]);
      await send(
        subscriptionEvent({
          ...monthly,
          status: 'active',
          subscriptionId: 'sub_second',
          occurredAt: '2026-09-05T00:00:00Z',
        }),
      );
      expect(calls).toEqual([
        {
          url: 'https://sandbox-api.paddle.com/subscriptions/sub_second/cancel',
          body: { effective_from: 'next_billing_period' },
        },
      ]);
      // Once the second one is scheduled to cancel, events for the first cancel nothing.
      await send(
        subscriptionEvent({
          ...monthly,
          type: 'subscription.updated',
          status: 'active',
          subscriptionId: 'sub_second',
          scheduledCancel: true,
          occurredAt: '2026-09-05T00:00:05Z',
        }),
      );
      await send(
        subscriptionEvent({
          ...monthly,
          type: 'subscription.updated',
          status: 'active',
          subscriptionId: 'sub_first',
          occurredAt: '2026-10-01T00:00:00Z',
        }),
      );
      expect(calls).toHaveLength(1);
    }));

  it('cancels a past_due duplicate immediately and returns 500 when that fails', () =>
    withTx(async (db) => {
      const { send, calls } = setup(db);
      const user = await createUser(db);
      await send(
        transactionCompleted({
          userId: user,
          priceId: LIFETIME,
          transactionId: 'txn_pd_life',
          occurredAt: '2026-09-01T00:00:00Z',
        }),
      );
      const pastDue = subscriptionEvent({
        type: 'subscription.past_due',
        userId: user,
        status: 'past_due',
        priceId: MONTHLY,
        subscriptionId: 'sub_pd_dup',
        occurredAt: '2026-09-02T00:00:00Z',
      });
      expect((await send(pastDue)).status).toBe(200);
      expect(calls).toEqual([
        {
          url: 'https://sandbox-api.paddle.com/subscriptions/sub_pd_dup/cancel',
          body: { effective_from: 'immediately' },
        },
      ]);
      const failing = setup(db, { paddleFails: true });
      expect((await failing.send({ ...pastDue, event_id: 'evt_pd_retry' })).status).toBe(500);
    }));

  it('cancels a past_due monthly subscription immediately on a Lifetime purchase', () =>
    withTx(async (db) => {
      const { send, calls } = setup(db);
      const user = await createUser(db);
      await send(
        subscriptionEvent({
          type: 'subscription.past_due',
          userId: user,
          status: 'past_due',
          priceId: MONTHLY,
          subscriptionId: 'sub_pd_up',
          occurredAt: '2026-09-01T00:00:00Z',
        }),
      );
      await send(
        transactionCompleted({
          userId: user,
          priceId: LIFETIME,
          transactionId: 'txn_pd_up',
          occurredAt: '2026-09-10T00:00:00Z',
        }),
      );
      expect(calls).toEqual([
        {
          url: 'https://sandbox-api.paddle.com/subscriptions/sub_pd_up/cancel',
          body: { effective_from: 'immediately' },
        },
      ]);
    }));

  it('cancels a monthly subscription immediately on a full refund or chargeback', () =>
    withTx(async (db) => {
      const { send, calls, remaining } = setup(db);
      const user = await createUser(db);
      await send(
        subscriptionEvent({
          type: 'subscription.created',
          userId: user,
          status: 'active',
          priceId: MONTHLY,
          subscriptionId: 'sub_refund',
          occurredAt: '2026-09-01T00:00:00Z',
        }),
      );
      const adjustment = {
        transactionId: 'txn_monthly_1',
        subscriptionId: 'sub_refund',
        occurredAt: '2026-09-03T00:00:00Z',
      };
      // A partial refund leaves money on the transaction: nothing happens.
      remaining.set('txn_monthly_1', '450');
      await send(
        adjustmentEvent({ ...adjustment, action: 'refund', type: 'partial', status: 'approved' }),
      );
      await send(
        adjustmentEvent({
          ...adjustment,
          action: 'refund',
          type: 'full',
          status: 'pending_approval',
        }),
      );
      expect(calls).toEqual([]);
      // Paddle marks a whole-transaction refund made from line items as top-level `type: "partial"`
      // (seen in the sandbox on 2026-09-23): only the remaining amount decides.
      remaining.set('txn_monthly_1', '0');
      const res = await send(
        adjustmentEvent({ ...adjustment, action: 'refund', type: 'partial', status: 'approved' }),
      );
      expect(res.status).toBe(200);
      expect(calls).toEqual([
        {
          url: 'https://sandbox-api.paddle.com/subscriptions/sub_refund/cancel',
          body: { effective_from: 'immediately' },
        },
      ]);
      await send(
        adjustmentEvent({ ...adjustment, action: 'chargeback', type: 'full', status: 'approved' }),
      );
      expect(calls).toHaveLength(2);
      // An unknown subscription (another product) is ignored.
      const unknown = await send(
        adjustmentEvent({
          ...adjustment,
          subscriptionId: 'sub_elsewhere',
          action: 'refund',
          type: 'full',
          status: 'approved',
        }),
      );
      expect(unknown.status).toBe(200);
      expect(calls).toHaveLength(2);
      const failing = setup(db, { paddleFails: true });
      const failed = await failing.send(
        adjustmentEvent({ ...adjustment, action: 'chargeback', type: 'full', status: 'approved' }),
      );
      expect(failed.status).toBe(500);
      // A refund whose transaction cannot be read is retried (500), and nothing is cancelled.
      const unreadable = await failing.send(
        adjustmentEvent({ ...adjustment, action: 'refund', type: 'full', status: 'approved' }),
      );
      expect(unreadable.status).toBe(500);
      expect(failing.calls).toHaveLength(1);
    }));

  it('returns 500 for a revoking adjustment that arrives before its Lifetime row', () =>
    withTx(async (db) => {
      const { send, pro } = setup(db);
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const user = await createUser(db);
        const refund = adjustmentEvent({
          transactionId: 'txn_early',
          action: 'refund',
          type: 'full',
          status: 'approved',
          occurredAt: '2026-09-12T00:00:00Z',
        });
        expect((await send(refund)).status).toBe(500);
        expect(errors).toHaveBeenCalledWith(
          '[billing/webhook] failed',
          refund.event_id,
          'no Lifetime row for adjustment',
          'txn_early',
        );
        await send(
          transactionCompleted({
            userId: user,
            priceId: LIFETIME,
            transactionId: 'txn_early',
            occurredAt: '2026-09-10T00:00:00Z',
          }),
        );
        expect(await pro(user)).toBe(true);
        // Paddle's retry now finds the row.
        expect((await send(refund)).status).toBe(200);
        expect(await pro(user)).toBe(false);
        // The ordering guard still ignores an older adjustment for an existing row (no 500).
        const older = adjustmentEvent({
          transactionId: 'txn_early',
          action: 'chargeback',
          type: 'full',
          status: 'approved',
          occurredAt: '2026-09-11T00:00:00Z',
        });
        expect((await send(older)).status).toBe(200);
      } finally {
        errors.mockRestore();
      }
    }));

  it('treats an invalid custom_data user_id as absent', () =>
    withTx(async (db) => {
      const { send, row } = setup(db);
      const user = await createUser(db);
      await send(
        subscriptionEvent({
          type: 'subscription.created',
          userId: user,
          status: 'active',
          priceId: MONTHLY,
          subscriptionId: 'sub_soft',
          customerId: 'ctm_soft',
          occurredAt: '2026-09-01T00:00:00Z',
        }),
      );
      for (const [i, customData] of [{ user_id: 'not-a-uuid' }, 'garbage', 42].entries()) {
        const event = subscriptionEvent({
          type: 'subscription.updated',
          status: 'past_due',
          priceId: MONTHLY,
          subscriptionId: 'sub_soft',
          customerId: 'ctm_soft',
          occurredAt: `2026-09-0${i + 2}T00:00:00Z`,
        });
        (event.data as Record<string, unknown>).custom_data = customData;
        expect((await send(event)).status).toBe(200);
      }
      expect(await row('paddle_subscription_id', 'sub_soft')).toMatchObject({
        user_id: user,
        status: 'past_due',
      });
    }));

  it('ignores other prices before validating the rest of the payload', () =>
    withTx(async (db) => {
      const { send } = setup(db);
      const event = subscriptionEvent({
        type: 'subscription.created',
        status: 'active',
        priceId: 'pri_other_product',
        subscriptionId: 'sub_malformed',
        occurredAt: '2026-09-01T00:00:00Z',
      });
      (event.data as Record<string, unknown>).status = 42;
      expect((await send(event)).status).toBe(200);
      const txn = transactionCompleted({
        priceId: 'pri_other_product',
        occurredAt: '2026-09-01T00:00:00Z',
      });
      (txn.data as Record<string, unknown>).customer_id = { nested: true };
      expect((await send(txn)).status).toBe(200);
    }));

  it('accepts events for a known subscription whose price id changed', () =>
    withTx(async (db) => {
      const { send, row } = setup(db);
      const user = await createUser(db);
      await send(
        subscriptionEvent({
          type: 'subscription.created',
          userId: user,
          status: 'active',
          priceId: MONTHLY,
          subscriptionId: 'sub_repriced',
          occurredAt: '2026-09-01T00:00:00Z',
        }),
      );
      await send(
        subscriptionEvent({
          type: 'subscription.canceled',
          userId: user,
          status: 'canceled',
          priceId: 'pri_monthly_v2',
          subscriptionId: 'sub_repriced',
          occurredAt: '2026-10-01T00:00:00Z',
        }),
      );
      expect(await row('paddle_subscription_id', 'sub_repriced')).toMatchObject({
        status: 'canceled',
      });
    }));

  it('cancels a Pro-granting subscription of a deleted profile immediately', () =>
    withTx(async (db) => {
      const { send, calls } = setup(db);
      const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const ghost = '00000000-0000-4000-8000-00000000abcd';
        const event = subscriptionEvent({
          type: 'subscription.activated',
          userId: ghost,
          status: 'active',
          priceId: MONTHLY,
          subscriptionId: 'sub_ghost_active',
          occurredAt: '2026-09-01T00:00:00Z',
        });
        expect((await send(event)).status).toBe(200);
        expect(calls).toEqual([
          {
            url: 'https://sandbox-api.paddle.com/subscriptions/sub_ghost_active/cancel',
            body: { effective_from: 'immediately' },
          },
        ]);
        expect(warnings).toHaveBeenCalledWith(
          '[billing/webhook] profile deleted',
          event.event_id,
          'subscription.activated',
          'sub_ghost_active',
        );
        expect(JSON.stringify(warnings.mock.calls)).not.toContain(ghost);
        // Already scheduled to cancel, or no longer Pro-granting: nothing to cancel.
        for (const extra of [{ scheduledCancel: true, status: 'active' }, { status: 'canceled' }]) {
          await send(
            subscriptionEvent({
              type: 'subscription.updated',
              userId: ghost,
              priceId: MONTHLY,
              subscriptionId: 'sub_ghost_active',
              occurredAt: '2026-09-02T00:00:00Z',
              ...extra,
            }),
          );
        }
        expect(calls).toHaveLength(1);
        const failing = setup(db, { paddleFails: true });
        expect((await failing.send({ ...event, event_id: 'evt_ghost_retry' })).status).toBe(500);
      } finally {
        warnings.mockRestore();
      }
    }));

  it('rejects invalid timestamps with 400 without logging them', () =>
    withTx(async (db) => {
      const { send, row } = setup(db);
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const user = await createUser(db);
        const base = {
          type: 'subscription.created',
          userId: user,
          status: 'active',
          priceId: MONTHLY,
          subscriptionId: 'sub_time',
        };
        const badOccurred = subscriptionEvent({ ...base, occurredAt: 'yesterday-ish' });
        expect((await send(badOccurred)).status).toBe(400);
        const noOffset = subscriptionEvent({ ...base, occurredAt: '2026-09-01T00:00:00' });
        expect((await send(noOffset)).status).toBe(400);
        const badEnds = subscriptionEvent({
          ...base,
          occurredAt: '2026-09-01T00:00:00Z',
          endsAt: 'soon-SECRET-VALUE',
        });
        expect((await send(badEnds)).status).toBe(400);
        expect(JSON.stringify(errors.mock.calls)).not.toContain('SECRET-VALUE');
        expect(await row('paddle_subscription_id', 'sub_time')).toBeUndefined();
        // Paddle's real format (microseconds, Z) is accepted.
        const good = subscriptionEvent({
          ...base,
          occurredAt: '2026-09-01T00:00:00.123456Z',
          endsAt: '2026-10-01T00:00:00.654321Z',
        });
        expect((await send(good)).status).toBe(200);
      } finally {
        errors.mockRestore();
      }
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
