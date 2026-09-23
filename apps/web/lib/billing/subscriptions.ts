import type { Db, Row } from '../db/types';

export const PRO_MONTHLY_STATUSES = ['active', 'trialing', 'past_due'] as const;

export const isProMonthlyStatus = (status: string) =>
  (PRO_MONTHLY_STATUSES as readonly string[]).includes(status);

/** A `pro_monthly` row whose status grants Pro (mirrors SQL `public.is_pro`). */
export const isProMonthly = (row: { plan: string; status: string }) =>
  row.plan === 'pro_monthly' && isProMonthlyStatus(row.status);

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
