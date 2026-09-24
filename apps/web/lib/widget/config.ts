import { buildBadgeUrl, type WidgetConfig } from '@bugping/shared';
import type { Db } from '../db/types';
import type { Env } from '../env';
import { corsHeaders, json } from '../http';
import { loadProjectByKey, type ProjectRow } from './project';

/** Records that the widget loaded on a site; writes at most once per hour per project. */
export async function markWidgetSeen(db: Db, projectId: string): Promise<void> {
  await db.query(
    `update public.projects set widget_seen_at = now()
     where id = $1 and (widget_seen_at is null or widget_seen_at < now() - interval '1 hour')`,
    [projectId],
  );
}

export function toWidgetConfig(project: ProjectRow, appUrl: string): WidgetConfig {
  return {
    primaryColor: project.primary_color,
    triggerText: project.trigger_text,
    position: project.position,
    showBadge: !(project.hide_badge && project.pro),
    customCss: project.pro ? project.custom_css : null,
    badgeUrl: buildBadgeUrl(project.public_key, appUrl),
    locale: project.locale,
  };
}

export async function handleConfig(
  deps: {
    db: Db;
    env: Pick<Env, 'NEXT_PUBLIC_APP_URL'>;
    after?: (task: () => Promise<void>) => void;
  },
  request: Request,
): Promise<Response> {
  const cors = corsHeaders(request.headers.get('origin'));
  try {
    const key = new URL(request.url).searchParams.get('key') ?? '';
    const project = await loadProjectByKey(deps.db, key);
    if (!project) return json({ error: 'unknown project' }, 404, cors);

    const ping = () =>
      markWidgetSeen(deps.db, project.id).catch((error) =>
        console.error('[widget/config] seen', error),
      );
    if (deps.after) deps.after(ping);
    else void ping();

    return json(toWidgetConfig(project, deps.env.NEXT_PUBLIC_APP_URL), 200, {
      ...cors,
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    });
  } catch (error) {
    console.error('[widget/config]', error);
    return json({ error: 'internal' }, 500, cors);
  }
}
