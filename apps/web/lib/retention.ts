import { safeEqual } from './crypto';
import type { Db } from './db/types';
import type { Env } from './env';
import { json } from './http';
import type { Storage } from './storage';

export const RETENTION_DAYS = { free: 30, pro: 365 } as const;

export interface RetentionDeps {
  db: Db;
  storage: Storage;
  env: Pick<Env, 'CRON_SECRET'>;
  clock?: () => number;
  batchSize?: number;
  budgetMs?: number;
}

const EXPIRED = `f.screenshot_path is not null
  and f.created_at < now() - make_interval(days => case when public.is_pro(p.owner_id) then $1::int else $2::int end)`;

/** Deletes expired screenshots in batches; rows keep their path if Storage did not remove the file. */
export async function runRetention(
  deps: RetentionDeps,
): Promise<{ removed: number; remaining: number }> {
  const clock = deps.clock ?? Date.now;
  const started = clock();
  const batchSize = deps.batchSize ?? 200;
  const budgetMs = deps.budgetMs ?? 25_000;
  const attempted: string[] = [];
  let removed = 0;

  while (clock() - started < budgetMs) {
    const rows = await deps.db.query<{ id: string; screenshot_path: string }>(
      `select f.id, f.screenshot_path from public.feedback f join public.projects p on p.id = f.project_id
       where ${EXPIRED} and not (f.id = any($3::uuid[]))
       order by f.created_at limit $4`,
      [RETENTION_DAYS.pro, RETENTION_DAYS.free, attempted, batchSize],
    );
    if (rows.length === 0) break;
    attempted.push(...rows.map((row) => row.id));

    let gone: string[];
    try {
      gone = await deps.storage.remove(rows.map((row) => row.screenshot_path));
    } catch (error) {
      console.error('[retention] storage remove failed', error);
      break;
    }
    if (gone.length > 0) {
      await deps.db.query(
        'update public.feedback set screenshot_path = null where screenshot_path = any($1::text[])',
        [gone],
      );
      removed += gone.length;
    }
  }

  const [left] = await deps.db.query<{ n: number }>(
    `select count(*)::int as n from public.feedback f join public.projects p on p.id = f.project_id where ${EXPIRED}`,
    [RETENTION_DAYS.pro, RETENTION_DAYS.free],
  );
  return { removed, remaining: left?.n ?? 0 };
}

export async function handleRetention(deps: RetentionDeps, request: Request): Promise<Response> {
  if (!safeEqual(request.headers.get('authorization'), `Bearer ${deps.env.CRON_SECRET}`)) {
    return json({ error: 'unauthorized' }, 401);
  }
  try {
    return json(await runRetention(deps), 200);
  } catch (error) {
    console.error('[retention]', error);
    return json({ error: 'internal' }, 500);
  }
}
