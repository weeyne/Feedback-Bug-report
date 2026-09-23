import { z, ZodError } from 'zod';
import type { Db } from '../db/types';
import type { Env } from '../env';
import { json } from '../http';
import { billingConfig, type BillingConfig } from './config';
import { createPaddleClient, type PaddleClient } from './paddle';
import { verifyPaddleSignature } from './signature';
import { isProMonthly, isProMonthlyStatus, userSubscriptions } from './subscriptions';

export interface WebhookDeps {
  db: Db;
  env: Env;
  fetch: typeof fetch;
  now?: () => number;
}

interface Ctx {
  db: Db;
  config: BillingConfig;
  paddle: PaddleClient;
  eventId: string;
  eventType: string;
  occurredAt: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Validated before a timestamp reaches Postgres: a cast error would echo the value in the logs.
const IsoDateTime = z.iso.datetime({ offset: true });

const Envelope = z.object({
  event_id: z.string(),
  event_type: z.string(),
  occurred_at: IsoDateTime,
  data: z.record(z.string(), z.unknown()),
});

// Soft: an invalid user_id (or custom_data) is treated as absent; the user is then resolved
// from stored rows.
const CustomData = z
  .object({ user_id: z.string().regex(UUID).optional().catch(undefined) })
  .nullish()
  .catch(undefined);

// Lenient and never throws: read before strict parsing so that events for other products are
// ignored even when the rest of their payload would not validate.
const Probe = z
  .object({
    id: z.string().optional().catch(undefined),
    items: z
      .array(
        z
          .object({ price: z.object({ id: z.string() }) })
          .nullable()
          .catch(null),
      )
      .catch([]),
  })
  .catch({ id: undefined, items: [] });

function probe(raw: unknown): { id: string | undefined; prices: string[] } {
  const { id, items } = Probe.parse(raw);
  return { id, prices: items.flatMap((item) => (item ? [item.price.id] : [])) };
}

const Subscription = z.object({
  id: z.string(),
  status: z.string(),
  customer_id: z.string().nullish(),
  custom_data: CustomData,
  current_billing_period: z.object({ ends_at: z.string() }).nullish(),
  scheduled_change: z.object({ action: z.string() }).nullish(),
});

const Transaction = z.object({
  id: z.string(),
  customer_id: z.string().nullish(),
  subscription_id: z.string().nullish(),
  custom_data: CustomData,
});

const Adjustment = z.object({
  action: z.string(),
  type: z.string().nullish(),
  status: z.string(),
  transaction_id: z.string(),
  subscription_id: z.string().nullish(),
});

/** Paddle retries on 500. `logArgs` holds event and Paddle ids only. */
class RetryLater extends Error {
  constructor(readonly logArgs: string[]) {
    super('retry later');
  }
}

/** A malformed timestamp: 400, and the value is never logged. */
class InvalidTimestamp extends Error {}

async function profileExists(db: Db, userId: string): Promise<boolean> {
  const [row] = await db.query<{ ok: boolean }>(
    'select exists(select 1 from public.profiles where id = $1) as ok',
    [userId],
  );
  return Boolean(row?.ok);
}

async function monthlyRowExists(db: Db, subscriptionId: string): Promise<boolean> {
  const [row] = await db.query<{ ok: boolean }>(
    `select exists(select 1 from public.subscriptions
                   where paddle_subscription_id = $1 and plan = 'pro_monthly') as ok`,
    [subscriptionId],
  );
  return Boolean(row?.ok);
}

/** custom_data.user_id → row with the same subscription id → row with the same customer id. */
async function resolveUser(
  ctx: Ctx,
  input: { customUserId?: string; subscriptionId?: string | null; customerId?: string | null },
): Promise<string> {
  if (input.customUserId) return input.customUserId;
  if (input.subscriptionId) {
    const [row] = await ctx.db.query<{ user_id: string }>(
      'select user_id from public.subscriptions where paddle_subscription_id = $1',
      [input.subscriptionId],
    );
    if (row) return row.user_id;
  }
  if (input.customerId) {
    const [row] = await ctx.db.query<{ user_id: string }>(
      'select user_id from public.subscriptions where paddle_customer_id = $1 limit 1',
      [input.customerId],
    );
    if (row) return row.user_id;
  }
  throw new RetryLater([ctx.eventId, ctx.eventType, 'unresolved user']);
}

function logDeletedProfile(ctx: Ctx, paddleId: string) {
  console.warn('[billing/webhook] profile deleted', ctx.eventId, ctx.eventType, paddleId);
}

/**
 * Cancels this subscription when it duplicates Pro: the user also has a paid Lifetime, or another
 * Pro-granting monthly subscription that is not itself scheduled to cancel. It reads the stored
 * rows, not the event, so an older or replayed event acts on the current state.
 */
async function cancelIfDuplicate(ctx: Ctx, userId: string, subscriptionId: string) {
  const rows = await userSubscriptions(ctx.db, userId);
  const self = rows.find((row) => row.paddle_subscription_id === subscriptionId);
  if (!self || !isProMonthly(self) || self.cancel_at_period_end) return;
  const duplicate = rows.some(
    (row) =>
      (row.plan === 'pro_lifetime' && row.status === 'paid') ||
      (row.paddle_subscription_id !== subscriptionId &&
        isProMonthly(row) &&
        !row.cancel_at_period_end),
  );
  if (!duplicate) return;
  await ctx.paddle.cancelSubscription(
    subscriptionId,
    self.status === 'past_due' ? 'immediately' : 'next_billing_period',
  );
}

async function onSubscription(ctx: Ctx, raw: unknown) {
  const { id, prices } = probe(raw);
  // Other products are ignored, unless the subscription is already known (the monthly price id
  // may have changed in the configuration since it was bought).
  if (!prices.includes(ctx.config.priceMonthly) && !(id && (await monthlyRowExists(ctx.db, id)))) {
    return;
  }
  const sub = Subscription.parse(raw);
  const endsAt = sub.current_billing_period?.ends_at ?? null;
  if (endsAt !== null && !IsoDateTime.safeParse(endsAt).success) throw new InvalidTimestamp();
  const scheduledCancel = sub.scheduled_change?.action === 'cancel';
  const userId = await resolveUser(ctx, {
    customUserId: sub.custom_data?.user_id,
    subscriptionId: sub.id,
    customerId: sub.customer_id,
  });
  if (!(await profileExists(ctx.db, userId))) {
    logDeletedProfile(ctx, sub.id);
    // Nobody can use this Pro any more: stop billing for it.
    if (isProMonthlyStatus(sub.status) && !scheduledCancel) {
      await ctx.paddle.cancelSubscription(sub.id, 'immediately');
    }
    return;
  }
  await ctx.db.query(
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
    [userId, sub.status, sub.customer_id ?? null, sub.id, endsAt, scheduledCancel, ctx.occurredAt],
  );
  await cancelIfDuplicate(ctx, userId, sub.id);
}

async function onTransactionCompleted(ctx: Ctx, raw: unknown) {
  const { prices } = probe(raw);
  const lifetime = prices.includes(ctx.config.priceLifetime);
  if (!lifetime && !prices.includes(ctx.config.priceMonthly)) return;
  const txn = Transaction.parse(raw);
  if (lifetime) {
    const userId = await resolveUser(ctx, {
      customUserId: txn.custom_data?.user_id,
      customerId: txn.customer_id,
    });
    if (!(await profileExists(ctx.db, userId))) return logDeletedProfile(ctx, txn.id);
    await ctx.db.query(
      `insert into public.subscriptions
         (user_id, plan, status, paddle_customer_id, paddle_transaction_id, paddle_occurred_at, updated_at)
       values ($1, 'pro_lifetime', 'paid', $2, $3, $4::timestamptz, now())
       on conflict (paddle_transaction_id) do update set
         status = 'paid',
         paddle_occurred_at = excluded.paddle_occurred_at,
         updated_at = now()
       where public.subscriptions.paddle_occurred_at is null
          or public.subscriptions.paddle_occurred_at < excluded.paddle_occurred_at`,
      [userId, txn.customer_id ?? null, txn.id, ctx.occurredAt],
    );
    for (const row of await userSubscriptions(ctx.db, userId)) {
      if (isProMonthly(row) && row.paddle_subscription_id && !row.cancel_at_period_end) {
        // A past_due subscription cannot be scheduled to cancel; it has nothing left to use.
        await ctx.paddle.cancelSubscription(
          row.paddle_subscription_id,
          row.status === 'past_due' ? 'immediately' : 'next_billing_period',
        );
      }
    }
    return;
  }
  if (txn.subscription_id) {
    const userId = await resolveUser(ctx, {
      customUserId: txn.custom_data?.user_id,
      subscriptionId: txn.subscription_id,
      customerId: txn.customer_id,
    });
    // The subscription events for a deleted profile cancel the subscription.
    if (!(await profileExists(ctx.db, userId))) return logDeletedProfile(ctx, txn.subscription_id);
    // Mapping only: a null timestamp lets any subscription event overwrite this row.
    await ctx.db.query(
      `insert into public.subscriptions
         (user_id, plan, status, paddle_customer_id, paddle_subscription_id, paddle_occurred_at, updated_at)
       values ($1, 'pro_monthly', 'active', $2, $3, null, now())
       on conflict (paddle_subscription_id) do nothing`,
      [userId, txn.customer_id ?? null, txn.subscription_id],
    );
  }
}

async function onAdjustment(ctx: Ctx, raw: unknown) {
  const adj = Adjustment.parse(raw);
  if (adj.status !== 'approved') return;
  if (adj.action !== 'chargeback' && adj.action !== 'refund') return;
  // A refund revokes only when nothing is left of the payment. Paddle's top-level `type` is not
  // reliable for this: a whole-transaction refund made from line items arrives as "partial", and
  // several partial refunds can add up to the full amount.
  if (adj.action === 'refund' && (await ctx.paddle.remainingTotal(adj.transaction_id)) > 0) return;
  if (adj.subscription_id) {
    // A monthly payment: cancelling now makes Paddle send subscription.canceled, which removes Pro.
    if (await monthlyRowExists(ctx.db, adj.subscription_id)) {
      await ctx.paddle.cancelSubscription(adj.subscription_id, 'immediately');
    }
    return;
  }
  const updated = await ctx.db.query(
    `update public.subscriptions set status = 'refunded', paddle_occurred_at = $2::timestamptz,
       updated_at = now()
     where paddle_transaction_id = $1 and plan = 'pro_lifetime'
       and (paddle_occurred_at is null or paddle_occurred_at < $2::timestamptz)
     returning id`,
    [adj.transaction_id, ctx.occurredAt],
  );
  if (updated.length > 0) return;
  const [existing] = await ctx.db.query(
    `select 1 from public.subscriptions where paddle_transaction_id = $1 and plan = 'pro_lifetime'`,
    [adj.transaction_id],
  );
  // Zero rows because of the ordering guard: an older event, nothing to do. No row at all: the
  // adjustment arrived before transaction.completed created it, so let Paddle retry.
  if (!existing) {
    throw new RetryLater([ctx.eventId, 'no Lifetime row for adjustment', adj.transaction_id]);
  }
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
  const ctx: Ctx = {
    db: deps.db,
    config,
    paddle: createPaddleClient(config, deps.fetch),
    eventId: event_id,
    eventType: event_type,
    occurredAt: occurred_at,
  };
  try {
    if (event_type.startsWith('subscription.')) {
      await onSubscription(ctx, data);
    } else if (event_type === 'transaction.completed') {
      await onTransactionCompleted(ctx, data);
    } else if (event_type === 'adjustment.created' || event_type === 'adjustment.updated') {
      await onAdjustment(ctx, data);
    }
    return json({ ok: true }, 200);
  } catch (error) {
    if (error instanceof InvalidTimestamp) {
      console.error('[billing/webhook] rejected', event_id, event_type, 'invalid timestamp');
      return json({ error: 'bad request' }, 400);
    }
    if (error instanceof RetryLater) {
      console.error('[billing/webhook] failed', ...error.logArgs);
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
