import type { WidgetLocale } from '@dymcode/shared';
import { z } from 'zod';
import { ENTITLEMENTS } from '../billing/plans';
import type { Row } from '../db/types';
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
    tx.query<ProjectDetail>(
      `select id, name, public_key, allowed_origins, primary_color, trigger_text, "position"::text as "position",
              hide_badge, custom_css, locale::text as locale
       from public.projects where id = $1`,
      [projectId],
    ),
  );
  return row ?? null;
}

export async function canCreateProject(deps: DashDeps, userId: string): Promise<boolean> {
  const [row] = await deps.db.query<{ n: number; pro: boolean }>(
    'select count(*)::int as n, public.is_pro($1) as pro from public.projects where owner_id = $1',
    [userId],
  );
  return Boolean(row?.pro) || (row?.n ?? 0) < ENTITLEMENTS.free.maxProjects;
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
  // Projects have no client INSERT policy: created with the service connection after the plan check.
  if (!(await canCreateProject(deps, userId))) return { ok: false, error: 'projects.limitReached' };
  const [row] = await deps.db.query<{ id: string }>(
    'insert into public.projects (owner_id, name, allowed_origins) values ($1, $2, $3::text[]) returning id',
    [userId, name, origins],
  );
  return { ok: true, projectId: row!.id };
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
