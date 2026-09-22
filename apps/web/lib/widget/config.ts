import { buildBadgeUrl, type WidgetConfig } from '@dymcode/shared';
import type { Db } from '../db/types';
import { corsHeaders, json } from '../http';
import { loadProjectByKey, type ProjectRow } from './project';

export function toWidgetConfig(project: ProjectRow): WidgetConfig {
  return {
    primaryColor: project.primary_color,
    triggerText: project.trigger_text,
    position: project.position,
    showBadge: !(project.hide_badge && project.pro),
    customCss: project.pro ? project.custom_css : null,
    badgeUrl: buildBadgeUrl(project.public_key),
    locale: project.locale,
  };
}

export async function handleConfig(deps: { db: Db }, request: Request): Promise<Response> {
  const cors = corsHeaders(request.headers.get('origin'));
  try {
    const key = new URL(request.url).searchParams.get('key') ?? '';
    const project = await loadProjectByKey(deps.db, key);
    if (!project) return json({ error: 'unknown project' }, 404, cors);
    return json(toWidgetConfig(project), 200, {
      ...cors,
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    });
  } catch (error) {
    console.error('[widget/config]', error);
    return json({ error: 'internal' }, 500, cors);
  }
}
