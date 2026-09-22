import type { AuthAdmin } from '../auth/admin';
import { removeScreenshots } from './cleanup';
import type { ActionResult, DashDeps } from './result';

export async function deleteAccount(
  deps: DashDeps & { authAdmin: AuthAdmin },
  user: { id: string; email: string },
  confirmEmail: string,
): Promise<ActionResult> {
  if (confirmEmail.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
    return { ok: false, error: 'account.confirmMismatch' };
  }
  const files = await deps.db.query<{ screenshot_path: string }>(
    `select f.screenshot_path from public.feedback f join public.projects p on p.id = f.project_id
     where p.owner_id = $1 and f.screenshot_path is not null`,
    [user.id],
  );
  await removeScreenshots(
    deps.storage,
    files.map((f) => f.screenshot_path),
  );
  try {
    await deps.authAdmin.deleteUser(user.id);
  } catch (error) {
    console.error('[account] delete failed', error);
    return { ok: false, error: 'errors.generic' };
  }
  return { ok: true };
}
