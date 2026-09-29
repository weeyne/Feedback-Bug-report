import { buildBadgeUrl, type WidgetConfig } from '@bugping/shared';
import type { Db } from '../db/types';
import type { Env } from '../env';
import { corsHeaders, json } from '../http';
import { originAllowed, parseOrigin } from './origins';
import { loadProjectByKey, markOriginBlocked, type ProjectRow } from './project';

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
  const origin = request.headers.get('origin');
  const cors = corsHeaders(origin);
  try {
    const key = new URL(request.url).searchParams.get('key') ?? '';
    const project = await loadProjectByKey(deps.db, key);
    if (!project) return json({ error: 'unknown project' }, 404, cors);

    if (origin !== null && !originAllowed(origin, project.allowed_origins)) {
      const blocked = parseOrigin(origin);
      if (blocked) {
        const record = () =>
          markOriginBlocked(deps.db, project.id, blocked).catch((error) =>
            console.error('[widget/config] blocked origin', error),
          );
        if (deps.after) deps.after(record);
        else void record();
      }
      return json({ error: 'origin not allowed' }, 403, cors);
    }

    // Only a browser on a real site sends Origin; a bare request (curl, a server) must not be able
    // to tick "widget installed" for someone else's public key. Hygiene, not a security boundary
    // (Origin is easy to forge outside a browser). Browsers omit Origin on same-origin GETs, so a
    // widget embedded on the Bugping domain itself (the demo shop) never marks its project seen.
    if (origin !== null) {
      const ping = () =>
        markWidgetSeen(deps.db, project.id).catch((error) =>
          console.error('[widget/config] seen', error),
        );
      if (deps.after) deps.after(ping);
      else void ping();
    }

    return json(toWidgetConfig(project, deps.env.NEXT_PUBLIC_APP_URL), 200, {
      ...cors,
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    });
  } catch (error) {
    console.error('[widget/config]', error);
    return json({ error: 'internal' }, 500, cors);
  }
}
