import type { WidgetLocale } from '@bugping/shared';
import { z } from 'zod';
import { ENTITLEMENTS } from '../billing/plans';
import type { Db, Row } from '../db/types';
import { withUser } from '../db/with-user';
import { normalizeOrigin } from './origins';
import { isUuid, type ActionResult, type DashDeps } from './result';

export interface ProjectSummary extends Row {
  id: string;
  name: string;
  public_key: string;
}

export interface ProjectDetail extends ProjectSummary {
  allowed_origins: string[];
  primary_color: string;
  trigger_text: string;
  position: 'bottom-right' | 'bottom-left';
  hide_badge: boolean;
  custom_css: string | null;
  locale: WidgetLocale;
  /** ISO timestamp of the last widget config request (throttled to hourly), or null if never. */
  widget_seen_at: string | null;
}

export function listProjects(deps: DashDeps, userId: string): Promise<ProjectSummary[]> {
  return withUser(deps.db, userId, (tx) =>
    tx.query<ProjectSummary>(
      'select id, name, public_key from public.projects order by created_at, id',
    ),
  );
}

export async function getProject(
  deps: DashDeps,
  userId: string,
  projectId: string,
): Promise<ProjectDetail | null> {
  if (!isUuid(projectId)) return null;
  const [row] = await withUser(deps.db, userId, (tx) =>
    tx.query<Omit<ProjectDetail, 'widget_seen_at'> & { widget_seen_at: Date | string | null }>(
      `select id, name, public_key, allowed_origins, primary_color, trigger_text, "position"::text as "position",
              hide_badge, custom_css, locale::text as locale, widget_seen_at
       from public.projects where id = $1`,
      [projectId],
    ),
  );
  if (!row) return null;
  const seen = row.widget_seen_at;
  return {
    ...row,
    widget_seen_at: seen == null ? null : new Date(seen).toISOString(),
  } as ProjectDetail;
}

/** Shared by the read-only `canCreateProject` check and `createProject`'s in-transaction re-check. */
async function countAllowsCreate(db: Db, userId: string): Promise<boolean> {
  const [row] = await db.query<{ n: number; pro: boolean }>(
    'select count(*)::int as n, public.is_pro($1) as pro from public.projects where owner_id = $1',
    [userId],
  );
  return Boolean(row?.pro) || (row?.n ?? 0) < ENTITLEMENTS.free.maxProjects;
}

export function canCreateProject(deps: DashDeps, userId: string): Promise<boolean> {
  return countAllowsCreate(deps.db, userId);
}

export async function ownsProject(
  deps: DashDeps,
  userId: string,
  projectId: string,
): Promise<boolean> {
  if (!isUuid(projectId)) return false;
  const [row] = await withUser(deps.db, userId, (tx) =>
    tx.query<{ found: boolean }>(
      'select exists(select 1 from public.projects where id = $1) as found',
      [projectId],
    ),
  );
  return Boolean(row?.found);
}

const CreateInput = z.object({
  name: z.string().trim().min(1).max(80),
  siteUrl: z.string().trim().max(2048).optional(),
});

export async function createProject(
  deps: DashDeps,
  userId: string,
  input: unknown,
): Promise<ActionResult<{ projectId: string }>> {
  const parsed = CreateInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'projects.nameInvalid' };
  const { name, siteUrl } = parsed.data;
  let origins: string[] = [];
  if (siteUrl) {
    const origin = normalizeOrigin(siteUrl);
    if (!origin) return { ok: false, error: 'projects.urlInvalid' };
    origins = [origin];
  }
  // Projects have no client INSERT policy: created with the service connection. The plan check and the
  // insert run inside one transaction, serialized per user by an advisory lock, so two concurrent
  // creates from the same Free user can't both pass the count check before either inserts.
  return deps.db.transaction(async (tx) => {
    await tx.query('select pg_advisory_xact_lock(hashtext($1))', [`create-project:${userId}`]);
    if (!(await countAllowsCreate(tx, userId)))
      return { ok: false, error: 'projects.limitReached' };
    const [row] = await tx.query<{ id: string }>(
      'insert into public.projects (owner_id, name, allowed_origins) values ($1, $2, $3::text[]) returning id',
      [userId, name, origins],
    );
    return { ok: true, projectId: row!.id };
  });
}

export async function hasFeedback(
  deps: DashDeps,
  userId: string,
  projectId: string,
): Promise<boolean> {
  if (!isUuid(projectId)) return false;
  const [row] = await withUser(deps.db, userId, (tx) =>
    tx.query<{ found: boolean }>(
      'select exists(select 1 from public.feedback where project_id = $1) as found',
      [projectId],
    ),
  );
  return Boolean(row?.found);
}
