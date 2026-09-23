import { rateLimited } from '../dashboard/rate-limit';
import type { ActionResult, DashDeps } from '../dashboard/result';
import { billingConfig } from './config';
import { InvalidCustomerEmail, paddleFromDeps } from './paddle';
import { isProMonthly, userSubscriptions } from './subscriptions';

export type BillingState = 'disabled' | 'free' | 'monthly' | 'past_due' | 'lifetime';

export interface BillingOverview {
  state: BillingState;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasCustomer: boolean;
}

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
  try {
    // Identity comes only from the verified session email. A stored paddle_customer_id is NOT
    // trusted: it comes from webhook data, and a buyer can open a Paddle.js checkout with any
    // email, which would store someone else's customer id on the buyer's row.
    const customerId = await paddle.ensureCustomer(user.email);
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
  user: { id: string; email: string },
): Promise<ActionResult<{ url: string }>> {
  const paddle = paddleFromDeps(deps);
  if (!paddle) return { ok: false, error: 'billing.unavailable' };
  if (await rateLimited(deps, 'portal', user.id)) return { ok: false, error: 'errors.rateLimited' };
  let customerId: string | null;
  try {
    // Resolve the customer from the verified session email, never from a stored id (see above).
    customerId = await paddle.findCustomer(user.email);
  } catch (error) {
    if (error instanceof InvalidCustomerEmail) return { ok: false, error: 'billing.noCustomer' };
    console.error('[billing] portal failed', error instanceof Error ? error.message : 'error');
    return { ok: false, error: 'billing.portalFailed' };
  }
  if (!customerId) return { ok: false, error: 'billing.noCustomer' };
  // Only subscriptions that belong to that customer: a row may hold a foreign customer id.
  const subscriptionIds = (await userSubscriptions(deps.db, user.id))
    .filter(
      (row) =>
        isProMonthly(row) && row.paddle_subscription_id && row.paddle_customer_id === customerId,
    )
    .map((row) => row.paddle_subscription_id!);
  try {
    return { ok: true, url: await paddle.createPortalSession(customerId, subscriptionIds) };
  } catch (error) {
    console.error('[billing] portal failed', error instanceof Error ? error.message : 'error');
    return { ok: false, error: 'billing.portalFailed' };
  }
}
