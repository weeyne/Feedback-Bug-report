import { PUBLIC_KEY_PATTERN, type WidgetLocale, type WidgetPosition } from '@dymcode/shared';
import type { Db, Row } from '../db/types';

export interface ProjectRow extends Row {
  id: string;
  owner_id: string;
  name: string;
  public_key: string;
  allowed_origins: string[];
  primary_color: string;
  trigger_text: string;
  position: WidgetPosition;
  hide_badge: boolean;
  custom_css: string | null;
  locale: WidgetLocale;
  pro: boolean;
}

export async function loadProjectByKey(db: Db, key: string): Promise<ProjectRow | null> {
  if (!PUBLIC_KEY_PATTERN.test(key)) return null;
  const [row] = await db.query<ProjectRow>(
    `select id, owner_id, name, public_key, allowed_origins, primary_color, trigger_text,
            position::text as position, hide_badge, custom_css, locale::text as locale,
            public.is_pro(owner_id) as pro
     from public.projects where public_key = $1`,
    [key],
  );
  return row ?? null;
}
