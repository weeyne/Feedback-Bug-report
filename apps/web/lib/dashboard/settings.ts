import {
  CUSTOM_CSS_MAX_BYTES,
  HEX_COLOR_PATTERN,
  TRIGGER_TEXT_MAX_LENGTH,
  WIDGET_LOCALES,
  WIDGET_POSITIONS,
  type WidgetLocale,
} from '@bugping/shared';
import { z } from 'zod';
import { withUser } from '../db/with-user';
import { utf8ByteLength } from './bytes';
import { removeScreenshots } from './cleanup';
import { normalizeOrigin } from './origins';
import { getProject } from './projects';
import { isUuid, type ActionResult, type DashDeps } from './result';

export const MAX_ORIGINS = 20;
// Mirrors the DB check `octet_length(array_to_string(allowed_origins, ',')) <= 4096`.
export const MAX_ORIGINS_BYTES = 4096;

export interface SettingsInput {
  name: string;
  primaryColor: string;
  triggerText: string;
  position: 'bottom-right' | 'bottom-left';
  locale: WidgetLocale;
  allowedOrigins: string[];
  hideBadge: boolean;
  customCss: string;
}

// Each field carries the i18n key of its error; the first failing field wins.
const Settings = z.object({
  name: z.string().trim().min(1, 'projects.nameInvalid').max(80, 'projects.nameInvalid'),
  primaryColor: z.string().regex(HEX_COLOR_PATTERN, 'settings.colorInvalid'),
  triggerText: z
    .string()
    .trim()
    .min(1, 'settings.triggerInvalid')
    .max(TRIGGER_TEXT_MAX_LENGTH, 'settings.triggerInvalid'),
  position: z.enum(WIDGET_POSITIONS),
  locale: z.enum(WIDGET_LOCALES),
  allowedOrigins: z.array(z.string().max(2048)).max(200),
  hideBadge: z.boolean(),
  customCss: z
    .string()
    .refine((css) => utf8ByteLength(css) <= CUSTOM_CSS_MAX_BYTES, 'settings.cssTooLarge'),
});

export async function isPro(deps: DashDeps, userId: string): Promise<boolean> {
  const [row] = await deps.db.query<{ pro: boolean }>('select public.is_pro($1) as pro', [userId]);
  return Boolean(row?.pro);
}

function normalizeOrigins(inputs: string[]): string[] | string {
  const origins: string[] = [];
  for (const raw of inputs) {
    if (!raw.trim()) continue;
    const origin = normalizeOrigin(raw);
    if (!origin) return 'settings.originInvalid';
    if (!origins.includes(origin)) origins.push(origin);
  }
  if (origins.length > MAX_ORIGINS) return 'settings.tooManyOrigins';
  if (utf8ByteLength(origins.join(',')) > MAX_ORIGINS_BYTES) return 'settings.originsTooLong';
  return origins;
}

export async function updateProjectSettings(
  deps: DashDeps,
  userId: string,
  projectId: string,
  input: unknown,
): Promise<ActionResult> {
  if (!isUuid(projectId)) return { ok: false, error: 'errors.notFound' };
  const parsed = Settings.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? '';
    return { ok: false, error: /^[a-z]+\.[A-Za-z]+$/.test(message) ? message : 'errors.generic' };
  }
  const origins = normalizeOrigins(parsed.data.allowedOrigins);
  if (typeof origins === 'string') return { ok: false, error: origins };
  const pro = await isPro(deps, userId);
  const s = parsed.data;
  const css = s.customCss.trim() ? s.customCss : null;
  const rows = await withUser(deps.db, userId, (tx) =>
    tx.query(
      `update public.projects set
         name = $2, primary_color = $3, trigger_text = $4, "position" = $5::widget_position,
         locale = $6::widget_locale, allowed_origins = $7::text[],
         hide_badge = case when $8 then $9 else hide_badge end,
         custom_css = case when $8 then $10 else custom_css end
       where id = $1 returning id`,
      [
        projectId,
        s.name,
        s.primaryColor,
        s.triggerText,
        s.position,
        s.locale,
        origins,
        pro,
        s.hideBadge,
        css,
      ],
    ),
  );
  return rows.length ? { ok: true } : { ok: false, error: 'errors.notFound' };
}

export async function deleteProject(
  deps: DashDeps,
  userId: string,
  input: { projectId: string; confirmName: string },
): Promise<ActionResult> {
  const project = await getProject(deps, userId, input.projectId);
  if (!project) return { ok: false, error: 'errors.notFound' };
  if (input.confirmName !== project.name) return { ok: false, error: 'settings.confirmMismatch' };
  // Service query: hidden (over-quota) rows are invisible through RLS but their files must go too.
  const files = await deps.db.query<{ screenshot_path: string }>(
    'select screenshot_path from public.feedback where project_id = $1 and screenshot_path is not null',
    [project.id],
  );
  await removeScreenshots(
    deps.storage,
    files.map((f) => f.screenshot_path),
  );
  await withUser(deps.db, userId, (tx) =>
    tx.query('delete from public.projects where id = $1', [project.id]),
  );
  return { ok: true };
}
