import { z } from 'zod';
import {
  CUSTOM_CSS_MAX_BYTES,
  HEX_COLOR_PATTERN,
  TRIGGER_TEXT_MAX_LENGTH,
  WIDGET_LOCALES,
  WIDGET_POSITIONS,
} from '../constants';

/** Response of `GET /api/v1/widget/config`. Plan gating is already applied server-side. */
export const WidgetConfigSchema = z.object({
  primaryColor: z.string().regex(HEX_COLOR_PATTERN),
  triggerText: z.string().min(1).max(TRIGGER_TEXT_MAX_LENGTH),
  position: z.enum(WIDGET_POSITIONS),
  showBadge: z.boolean(),
  // Char count approximates the byte limit; the DB enforces octet_length exactly.
  customCss: z.string().max(CUSTOM_CSS_MAX_BYTES).nullable(),
  badgeUrl: z.url(),
  locale: z.enum(WIDGET_LOCALES),
});
export type WidgetConfig = z.infer<typeof WidgetConfigSchema>;
