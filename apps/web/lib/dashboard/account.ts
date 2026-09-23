import type { AuthAdmin } from '../auth/admin';
import type { PaddleClient } from '../billing/paddle';
import { PRO_MONTHLY_STATUSES, userSubscriptions } from '../billing/subscriptions';
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
  if (deps.paddle) {
    const rows = await userSubscriptions(deps.db, user.id);
    try {
      for (const row of rows) {
        if (
          row.plan === 'pro_monthly' &&
          row.paddle_subscription_id &&
          !row.cancel_at_period_end &&
          (PRO_MONTHLY_STATUSES as readonly string[]).includes(row.status)
        ) {
          await deps.paddle.cancelSubscription(row.paddle_subscription_id, 'immediately');
        }
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
