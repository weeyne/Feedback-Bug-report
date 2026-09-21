import { randomUUID } from 'node:crypto';
import type { Db } from './db';

export async function createUser(db: Db, email = `${randomUUID()}@test.dev`): Promise<string> {
  const id = randomUUID();
  await db.query(
    `insert into auth.users (id, instance_id, aud, role, email)
     values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2)`,
    [id, email],
  );
  return id;
}

export async function createProject(
  db: Db,
  ownerId: string,
  name = 'Test project',
): Promise<{ id: string; public_key: string }> {
  const [row] = await db.query<{ id: string; public_key: string }>(
    'insert into public.projects (owner_id, name) values ($1, $2) returning id, public_key',
    [ownerId, name],
  );
  if (!row) throw new Error('Project insert returned no row');
  return row;
}

export async function createFeedback(
  db: Db,
  projectId: string,
  opts: { overQuota?: boolean; message?: string } = {},
): Promise<string> {
  const [row] = await db.query<{ id: string }>(
    `insert into public.feedback (project_id, type, message, over_quota)
     values ($1, 'bug', $2, $3) returning id`,
    [projectId, opts.message ?? 'Something broke', opts.overQuota ?? false],
  );
  if (!row) throw new Error('Feedback insert returned no row');
  return row.id;
}

export async function grantPro(
  db: Db,
  userId: string,
  opts: { plan?: 'pro_monthly' | 'pro_lifetime'; status?: string; periodEnd?: string | null } = {},
): Promise<void> {
  await db.query(
    `insert into public.subscriptions (user_id, plan, status, current_period_end)
     values ($1, $2, $3, case when $4::text is null then null else now() + $4::interval end)`,
    [userId, opts.plan ?? 'pro_lifetime', opts.status ?? 'paid', opts.periodEnd ?? null],
  );
}
