import type { ClientMetadata, SubmitPayload, WidgetConfig } from '@bugping/shared';
import {
  HEX_COLOR_PATTERN,
  WIDGET_LOCALES,
  WIDGET_POSITIONS,
  type FeedbackType,
} from '@bugping/shared/constants';

export type SubmitResult =
  { ok: true } | { ok: false; reason: 'rate_limited' | 'invalid' | 'server' | 'network' };

/** Structural check without zod; the color is re-validated because it is injected into CSS. */
function isWidgetConfig(value: unknown): value is WidgetConfig {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.primaryColor === 'string' &&
    HEX_COLOR_PATTERN.test(c.primaryColor) &&
    typeof c.triggerText === 'string' &&
    c.triggerText.length > 0 &&
    (WIDGET_POSITIONS as readonly unknown[]).includes(c.position) &&
    typeof c.showBadge === 'boolean' &&
    (c.customCss === null || typeof c.customCss === 'string') &&
    typeof c.badgeUrl === 'string' &&
    (WIDGET_LOCALES as readonly unknown[]).includes(c.locale)
  );
}

export async function fetchConfig(
  apiOrigin: string,
  projectKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<WidgetConfig | null> {
  try {
    const url = `${apiOrigin}/api/v1/widget/config?key=${encodeURIComponent(projectKey)}`;
    const response = await fetchImpl(url, { credentials: 'omit' });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    return isWidgetConfig(body) ? body : null;
  } catch {
    return null;
  }
}

export async function submitFeedback(
  apiOrigin: string,
  payload: SubmitPayload,
  screenshot: Blob | null,
  fetchImpl: typeof fetch = fetch,
): Promise<SubmitResult> {
  const body = new FormData();
  body.append('payload', JSON.stringify(payload));
  if (screenshot) {
    body.append(
      'screenshot',
      screenshot,
      screenshot.type === 'image/webp' ? 'screenshot.webp' : 'screenshot.jpg',
    );
  }
  try {
    const response = await fetchImpl(`${apiOrigin}/api/v1/widget/submit`, {
      method: 'POST',
      body,
      credentials: 'omit',
    });
    if (response.ok) return { ok: true };
    if (response.status === 429) return { ok: false, reason: 'rate_limited' };
    if (response.status < 500) {
      console.warn('[Bugping] submission rejected:', await response.text().catch(() => ''));
      return { ok: false, reason: 'invalid' };
    }
    return { ok: false, reason: 'server' };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export function buildPayload(input: {
  projectKey: string;
  type: FeedbackType;
  message: string;
  email: string;
  metadata: ClientMetadata;
  elapsedMs: number;
  website: string;
}): SubmitPayload {
  const email = input.email.trim();
  return {
    projectKey: input.projectKey,
    type: input.type,
    message: input.message.trim(),
    ...(email ? { email } : {}),
    metadata: input.metadata,
    elapsedMs: Math.max(0, Math.round(input.elapsedMs)),
    website: input.website,
  };
}
