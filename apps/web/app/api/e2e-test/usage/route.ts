import { getDeps } from '@/lib/deps';
import { getEnv } from '@/lib/env';
import { json } from '@/lib/http';
import type { TestModeDeps } from '@/lib/test-mode';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** E2E only: sets this month's submission count for the seeded owner. */
export async function POST(request: Request) {
  if (getEnv().DYMCODE_TEST_MODE !== '1') return json({ error: 'not found' }, 404);
  const deps = (await getDeps()) as TestModeDeps;
  const { count } = (await request.json()) as { count: number };
  await deps.db.query(
    `insert into public.usage_counters (owner_id, period, count)
     values ($1, date_trunc('month', now() at time zone 'utc')::date, $2)
     on conflict (owner_id, period) do update set count = excluded.count, quota_notice_sent = false`,
    [deps.ownerId, count],
  );
  return json({ ok: true }, 200);
}
