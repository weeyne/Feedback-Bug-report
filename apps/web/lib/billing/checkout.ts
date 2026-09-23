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
  user: { id: string; email: string },
  plan: 'monthly' | 'lifetime',
): Promise<ActionResult<{ transactionId: string }>> {
  const config = billingConfig(deps.env);
  const paddle = paddleFromDeps(deps);
  if (!config || !paddle) return { ok: false, error: 'billing.unavailable' };
  if (await rateLimited(deps, 'checkout', user.id))
    return { ok: false, error: 'errors.rateLimited' };
  const rows = await userSubscriptions(deps.db, user.id);
  if (rows.some((row) => row.plan === 'pro_lifetime' && row.status === 'paid')) {
    return { ok: false, error: 'billing.alreadyLifetime' };
  }
  if (plan === 'monthly' && rows.some(isProMonthly)) {
    return { ok: false, error: 'billing.alreadySubscribed' };
  }
  const knownCustomerId = rows.find((row) => row.paddle_customer_id)?.paddle_customer_id ?? null;
  try {
    // Never trust an email typed into the Paddle overlay for identity: always attach a
    // server-known customer id so a buyer can't attach someone else's Paddle customer to
    // their own row (and later open that other person's portal). Reuse it if we have it;
    // otherwise resolve/create it from the authenticated user's own email.
    const customerId = knownCustomerId ?? (await paddle.ensureCustomer(user.email));
    const transaction = await paddle.createTransaction({
      priceId: plan === 'monthly' ? config.priceMonthly : config.priceLifetime,
      userId: user.id,
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
