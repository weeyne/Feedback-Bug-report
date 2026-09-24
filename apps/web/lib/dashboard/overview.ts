import type { FeedbackType } from '@bugping/shared';
import { ownsProject } from './projects';
import type { DashDeps } from './result';
import { usage, type FeedbackStatus } from './feedback';

const iso = (value: Date | string) => new Date(value).toISOString();

export interface Overview {
  counts: { new: number; resolved: number; last30: number };
  usage: { used: number; limit: number | null; pro: boolean };
  series: Array<{ day: string; bug: number; idea: number; general: number }>;
  recent: Array<{
    id: string;
    /** `null` for hidden (over-quota) rows so their type never reaches the client. */
    type: FeedbackType | null;
    status: FeedbackStatus;
    message: string;
    created_at: string;
    hidden: boolean;
  }>;
  checklist: { widgetSeen: boolean; notifications: boolean; firstFeedback: boolean };
  widgetSeenAt: string | null;
  integrations: { telegram: boolean; discord: boolean };
}

export async function getOverview(
  deps: DashDeps,
  userId: string,
  projectId: string,
): Promise<Overview | null> {
  if (!(await ownsProject(deps, userId, projectId))) return null;

  const [head] = await deps.db.query<{
    new_count: number;
    resolved_count: number;
    last30: number;
    any_feedback: boolean;
    widget_seen_at: Date | string | null;
    telegram: boolean;
    discord: boolean;
  }>(
    `select
       (select count(*) from public.feedback where project_id = $1 and status = 'new')::int as new_count,
       (select count(*) from public.feedback where project_id = $1 and status = 'resolved')::int as resolved_count,
       (select count(*) from public.feedback where project_id = $1 and created_at >= now() - interval '30 days')::int as last30,
       exists(select 1 from public.feedback where project_id = $1) as any_feedback,
       p.widget_seen_at,
       exists(select 1 from public.integrations i where i.project_id = $1 and i.enabled and i.kind in ('telegram_shared','telegram_custom')) as telegram,
       exists(select 1 from public.integrations i where i.project_id = $1 and i.enabled and i.kind = 'discord') as discord
     from public.projects p where p.id = $1`,
    [projectId],
  );

  const series = await deps.db.query<{ day: string; bug: number; idea: number; general: number }>(
    `select to_char(d, 'YYYY-MM-DD') as day,
            count(f.id) filter (where f.type = 'bug')::int as bug,
            count(f.id) filter (where f.type = 'idea')::int as idea,
            count(f.id) filter (where f.type = 'general')::int as general
     from generate_series((now() at time zone 'utc')::date - 29, (now() at time zone 'utc')::date, interval '1 day') d
     left join public.feedback f
       on f.project_id = $1
      -- Sargable lower bound (UTC midnight 29 days ago) so the scan stops at the window.
      and f.created_at >= ((now() at time zone 'utc')::date - 29)::timestamp at time zone 'utc'
      and (f.created_at at time zone 'utc')::date = d::date
     group by d order by d`,
    [projectId],
  );

  const recent = await deps.db.query<{
    id: string;
    type: FeedbackType | null;
    status: FeedbackStatus;
    message: string;
    created_at: Date | string;
    hidden: boolean;
  }>(
    `select f.id,
            case when f.over_quota and not public.is_pro(p.owner_id) then null else f.type::text end as type,
            f.status::text as status,
            case when f.over_quota and not public.is_pro(p.owner_id) then '' else left(f.message, 200) end as message,
            f.created_at, (f.over_quota and not public.is_pro(p.owner_id)) as hidden
     from public.feedback f join public.projects p on p.id = f.project_id
     where f.project_id = $1 order by f.created_at desc, f.id desc limit 5`,
    [projectId],
  );

  return {
    counts: {
      new: head?.new_count ?? 0,
      resolved: head?.resolved_count ?? 0,
      last30: head?.last30 ?? 0,
    },
    usage: await usage(deps, userId),
    series,
    recent: recent.map((r) => ({ ...r, created_at: iso(r.created_at) })),
    checklist: {
      widgetSeen: head?.widget_seen_at != null,
      notifications: Boolean(head?.telegram || head?.discord),
      firstFeedback: Boolean(head?.any_feedback),
    },
    widgetSeenAt: head?.widget_seen_at != null ? iso(head.widget_seen_at) : null,
    integrations: { telegram: Boolean(head?.telegram), discord: Boolean(head?.discord) },
  };
}
