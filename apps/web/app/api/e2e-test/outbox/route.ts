import { getDeps } from '@/lib/deps';
import { getEnv } from '@/lib/env';
import { json } from '@/lib/http';
import type { TestModeDeps } from '@/lib/test-mode';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function testDeps(): Promise<TestModeDeps | null> {
  if (getEnv().DYMCODE_TEST_MODE !== '1') return null;
  return (await getDeps()) as TestModeDeps;
}

/** E2E only: recorded outbound notifications plus stored feedback rows. */
export async function GET() {
  const deps = await testDeps();
  if (!deps) return json({ error: 'not found' }, 404);
  const feedback = await deps.db.query(
    `select f.id, p.public_key, f.message, f.screenshot_path, f.over_quota
     from public.feedback f join public.projects p on p.id = f.project_id order by f.created_at`,
  );
  return json({ outbox: deps.outbox, feedback }, 200);
}

export async function DELETE() {
  const deps = await testDeps();
  if (!deps) return json({ error: 'not found' }, 404);
  deps.outbox.length = 0;
  return json({ ok: true }, 200);
}
