import type { AuthAdmin } from '../auth/admin';
import type { PaddleClient } from '../billing/paddle';
import { isProMonthly, userSubscriptions } from '../billing/subscriptions';
import { removeScreenshots } from './cleanup';
import type { ActionResult, DashDeps } from './result';

export async function deleteAccount(
  deps: DashDeps & { authAdmin: AuthAdmin; paddle?: PaddleClient | null },
  user: { id: string; email: string },
  confirmEmail: string,
): Promise<ActionResult> {
  if (confirmEmail.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
    return { ok: false, error: 'account.confirmMismatch' };
  }
  // Subscriptions that would keep billing after the account is gone.
  const billable = (await userSubscriptions(deps.db, user.id)).filter(
    (row) => isProMonthly(row) && row.paddle_subscription_id && !row.cancel_at_period_end,
  );
  if (billable.length > 0 && !deps.paddle) {
    // Billing is not configured, so the subscription cannot be cancelled: keep the account.
    console.error('[account] delete refused: active subscription and billing is disabled');
    return { ok: false, error: 'errors.generic' };
  }
  if (deps.paddle) {
    try {
      for (const row of billable) {
        await deps.paddle.cancelSubscription(row.paddle_subscription_id!, 'immediately');
      }
    } catch (error) {
      console.error(
        '[account] subscription cancel failed',
        error instanceof Error ? error.message : 'error',
      );
      return { ok: false, error: 'errors.generic' };
    }
  }
  const files = await deps.db.query<{ screenshot_path: string }>(
    `select f.screenshot_path from public.feedback f join public.projects p on p.id = f.project_id
     where p.owner_id = $1 and f.screenshot_path is not null`,
    [user.id],
  );
  try {
    await deps.authAdmin.deleteUser(user.id);
  } catch (error) {
    console.error('[account] delete failed', error);
    return { ok: false, error: 'errors.generic' };
  }
  await removeScreenshots(
    deps.storage,
    files.map((f) => f.screenshot_path),
  );
  return { ok: true };
}
