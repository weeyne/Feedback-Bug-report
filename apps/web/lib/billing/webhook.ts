import { z, ZodError } from 'zod';
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

const CustomData = z
  .object({ user_id: z.string().regex(UUID) })
  .partial()
  .nullish();
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
  const revokes = adj.action === 'chargeback' || (adj.action === 'refund' && adj.type === 'full');
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
  if (
    !verifyPaddleSignature(raw, request.headers.get('paddle-signature'), config.webhookSecret, now)
  ) {
    return json({ error: 'unauthorized' }, 401);
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'bad request' }, 400);
  }
  const parsed = Envelope.safeParse(body);
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
      console.error('[billing/webhook] failed', event_id, event_type, 'unresolved user');
    } else if (error instanceof ZodError) {
      console.error('[billing/webhook] failed', event_id, event_type, 'invalid payload');
    } else if (error instanceof Error) {
      console.error(
        '[billing/webhook] failed',
        event_id,
        event_type,
        `${error.name}: ${error.message}`,
      );
    } else {
      console.error('[billing/webhook] failed', event_id, event_type, 'unknown error');
    }
    return json({ error: 'retry' }, 500);
  }
}
