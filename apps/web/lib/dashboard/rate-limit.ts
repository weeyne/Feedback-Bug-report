import type { DashDeps } from './result';

export const DASHBOARD_RATE_LIMIT = 10;

/** 10 calls per minute per user per action, via SQL hit_rate_limit. */
export async function rateLimited(
  deps: Pick<DashDeps, 'db'>,
  action: string,
  userId: string,
): Promise<boolean> {
  const [row] = await deps.db.query<{ limited: boolean }>(
    'select public.hit_rate_limit($1, $2, 60) as limited',
    [`dashboard:${action}:${userId}`, DASHBOARD_RATE_LIMIT],
  );
  return Boolean(row?.limited);
}
