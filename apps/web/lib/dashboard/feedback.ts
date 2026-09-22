import type { FeedbackMetadata, FeedbackType } from '@dymcode/shared';
import { z } from 'zod';
import { ENTITLEMENTS } from '../billing/plans';
import type { Row } from '../db/types';
import { withUser } from '../db/with-user';
import { ownsProject } from './projects';
import { isUuid, type ActionResult, type DashDeps } from './result';

export const FEEDBACK_PAGE_SIZE = 50;
export type FeedbackStatus = 'new' | 'resolved' | 'archived';

export interface FeedbackCursor {
  createdAt: string;
  id: string;
}

export interface FeedbackListItem {
  id: string;
  type: FeedbackType;
  message: string;
  status: FeedbackStatus;
  created_at: string;
  has_screenshot: boolean;
}

export interface FeedbackDetail extends FeedbackListItem {
  project_id: string;
  email: string | null;
  metadata: Partial<FeedbackMetadata>;
}

interface ListRow extends Row {
  id: string;
  type: FeedbackType;
  message: string;
  status: FeedbackStatus;
  created_at: Date | string;
  /** Microsecond-precision UTC timestamp for cursor pagination; `created_at` loses precision
   * once it round-trips through a JS `Date` (millisecond resolution), so the cursor is built
   * from this raw Postgres-formatted string instead. Never exposed on `FeedbackListItem`. */
  cursor_at: string;
  has_screenshot: boolean;
}

const iso = (value: Date | string) => new Date(value).toISOString();

export const encodeCursor = (c: FeedbackCursor) =>
  Buffer.from(JSON.stringify(c)).toString('base64url');

const CursorSchema = z.object({ createdAt: z.iso.datetime(), id: z.uuid() });

export function decodeCursor(value: string | undefined): FeedbackCursor | undefined {
  if (!value) return undefined;
  try {
    const parsed = CursorSchema.safeParse(
      JSON.parse(Buffer.from(value, 'base64url').toString('utf8')),
    );
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

const ListInput = z.object({
  projectId: z.uuid(),
  type: z.enum(['bug', 'idea', 'general']).optional(),
  status: z.enum(['new', 'resolved', 'archived']).default('new'),
  cursor: CursorSchema.optional(),
});

export async function listFeedback(
  deps: DashDeps,
  userId: string,
  input: unknown,
): Promise<{ items: FeedbackListItem[]; nextCursor: FeedbackCursor | null }> {
  const parsed = ListInput.safeParse(input);
  if (!parsed.success) return { items: [], nextCursor: null };
  const { projectId, type, status, cursor } = parsed.data;
  const rows = await withUser(deps.db, userId, (tx) =>
    tx.query<ListRow>(
      `select id, type::text as type, left(message, 200) as message, status::text as status, created_at,
              to_char(created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_at,
              screenshot_path is not null as has_screenshot
       from public.feedback
       where project_id = $1 and status = $2::feedback_status
         and ($3::text is null or type = $3::feedback_type)
         and ($4::timestamptz is null or (created_at, id) < ($4::timestamptz, $5::uuid))
       order by created_at desc, id desc
       limit $6`,
      [
        projectId,
        status,
        type ?? null,
        cursor?.createdAt ?? null,
        cursor?.id ?? null,
        FEEDBACK_PAGE_SIZE + 1,
      ],
    ),
  );
  const pageRows = rows.slice(0, FEEDBACK_PAGE_SIZE);
  const page = pageRows.map(({ cursor_at: _cursor_at, ...r }) => ({
    ...r,
    created_at: iso(r.created_at),
  }));
  const last = pageRows[pageRows.length - 1];
  return {
    items: page,
    nextCursor:
      rows.length > FEEDBACK_PAGE_SIZE && last ? { createdAt: last.cursor_at, id: last.id } : null,
  };
}

export async function getFeedback(
  deps: DashDeps,
  userId: string,
  feedbackId: string,
): Promise<FeedbackDetail | null> {
  if (!isUuid(feedbackId)) return null;
  const [row] = await withUser(deps.db, userId, (tx) =>
    tx.query<
      ListRow & { project_id: string; email: string | null; metadata: Partial<FeedbackMetadata> }
    >(
      `select id, project_id, type::text as type, message, email, status::text as status, created_at, metadata,
              screenshot_path is not null as has_screenshot
       from public.feedback where id = $1`,
      [feedbackId],
    ),
  );
  return row ? { ...row, created_at: iso(row.created_at) } : null;
}

export async function hiddenFeedbackCount(
  deps: DashDeps,
  userId: string,
  projectId: string,
): Promise<number> {
  if (!(await ownsProject(deps, userId, projectId))) return 0;
  const [row] = await deps.db.query<{ n: number }>(
    `select count(*)::int as n from public.feedback f join public.projects p on p.id = f.project_id
     where f.project_id = $1 and f.over_quota and not public.is_pro(p.owner_id)`,
    [projectId],
  );
  return row?.n ?? 0;
}

export async function usage(
  deps: DashDeps,
  userId: string,
): Promise<{ used: number; limit: number | null; pro: boolean }> {
  const [row] = await deps.db.query<{ used: number; pro: boolean }>(
    `select coalesce((select count from public.usage_counters
                      where owner_id = $1 and period = date_trunc('month', now() at time zone 'utc')::date), 0)::int as used,
            public.is_pro($1) as pro`,
    [userId],
  );
  const pro = Boolean(row?.pro);
  return { used: row?.used ?? 0, limit: pro ? null : ENTITLEMENTS.free.monthlySubmissions, pro };
}

const StatusInput = z.object({
  feedbackId: z.uuid(),
  status: z.enum(['new', 'resolved', 'archived']),
});

export async function setFeedbackStatus(
  deps: DashDeps,
  userId: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = StatusInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'errors.notFound' };
  const rows = await withUser(deps.db, userId, (tx) =>
    tx.query('update public.feedback set status = $2::feedback_status where id = $1 returning id', [
      parsed.data.feedbackId,
      parsed.data.status,
    ]),
  );
  return rows.length ? { ok: true } : { ok: false, error: 'errors.notFound' };
}

export async function deleteFeedback(
  deps: DashDeps,
  userId: string,
  feedbackId: string,
): Promise<ActionResult> {
  if (!isUuid(feedbackId)) return { ok: false, error: 'errors.notFound' };
  const rows = await withUser(deps.db, userId, (tx) =>
    tx.query<{ screenshot_path: string | null }>(
      'delete from public.feedback where id = $1 returning screenshot_path',
      [feedbackId],
    ),
  );
  if (!rows.length) return { ok: false, error: 'errors.notFound' };
  const path = rows[0]!.screenshot_path;
  if (path)
    await deps.storage
      .remove([path])
      .catch((e: unknown) => console.error('[dashboard] screenshot remove', e));
  return { ok: true };
}

export async function screenshotUrl(
  deps: DashDeps,
  userId: string,
  feedbackId: string,
): Promise<string | null> {
  if (!isUuid(feedbackId)) return null;
  const [row] = await withUser(deps.db, userId, (tx) =>
    tx.query<{ screenshot_path: string | null }>(
      'select screenshot_path from public.feedback where id = $1',
      [feedbackId],
    ),
  );
  return row?.screenshot_path ? deps.storage.signedUrl(row.screenshot_path, 300) : null;
}
