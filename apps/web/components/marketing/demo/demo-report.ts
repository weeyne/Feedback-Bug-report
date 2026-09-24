import type { SubmitPayload } from '@bugping/shared';
import type { AppLocale } from '@/i18n/locale';
import { formatTelegram } from '@/lib/notify/format';
import type { FeedbackMessage } from '@/lib/notify/types';
import { getPublicEnv } from '@/lib/public-env';
import { DEMO_CONSOLE_ERROR, DEMO_PROJECT_KEY, DEMO_PROJECT_NAME, DEMO_TEXT } from './protocol';

/** `describeAgent` from `lib/widget/user-agent.ts`, injected so callers can load it lazily. */
export type DescribeAgent = (userAgent: string) => { browser: string; os: string };

/** Fake ids for the demo report's dashboard link; the demo never touches the database. */
export const DEMO_PROJECT_ID = '00000000-0000-4000-8000-00000000d3e0';
export const DEMO_FEEDBACK_ID = '00000000-0000-4000-8000-00000000f00d';

/** Same shape as the link in real notifications (`lib/notify/dispatch.ts`). */
export function demoDashboardUrl(appUrl: string = getPublicEnv().appUrl): string {
  return `${appUrl}/app/p/${DEMO_PROJECT_ID}/feedback?f=${DEMO_FEEDBACK_ID}`;
}

/**
 * The notification the real pipeline would build for the scene-1 submission: the submit handler
 * adds `browser`/`os` to the client metadata, dispatch adds the project name and dashboard link.
 * The screenshot travels separately (the scene-1 blob), so it is `null` here.
 */
export function buildDemoMessage({
  payload,
  dashboardUrl = demoDashboardUrl(),
  describe,
}: {
  payload: Pick<SubmitPayload, 'type' | 'message' | 'email' | 'metadata'>;
  dashboardUrl?: string;
  describe: DescribeAgent;
}): FeedbackMessage {
  return {
    kind: 'feedback',
    projectName: DEMO_PROJECT_NAME,
    type: payload.type,
    message: payload.message,
    email: payload.email ? payload.email : null,
    metadata: { ...payload.metadata, ...describe(payload.metadata.userAgent) },
    dashboardUrl,
    screenshot: null,
  };
}

/** The Telegram caption (HTML) the real bot sends for `m`. */
export const demoCaption = (m: FeedbackMessage): string => formatTelegram(m).full;

/** A desktop Chrome on macOS, as `navigator.userAgent` reports it (the OS part is frozen). */
export const FIXTURE_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

/** Fixed "now" of the fixture (2026-09-24 14:32 UTC), so static frames are deterministic. */
const FIXTURE_AT = Date.UTC(2026, 8, 24, 14, 32, 0);

/**
 * A realistic scene-1 submission for `locale`, for static frames and the demo dashboard's
 * fallback when no live report is available. A function (not a module-level constant) so that
 * importing this module never reads the environment.
 */
export function fixtureReport(
  locale: AppLocale,
  appUrl: string = getPublicEnv().appUrl,
): SubmitPayload {
  return {
    projectKey: DEMO_PROJECT_KEY,
    type: 'bug',
    message: DEMO_TEXT[locale],
    metadata: {
      url: `${appUrl}/demo/shop`,
      referrer: '',
      userAgent: FIXTURE_USER_AGENT,
      language: locale === 'ru' ? 'ru-RU' : 'en-US',
      timezone: locale === 'ru' ? 'Europe/Moscow' : 'Europe/London',
      viewport: { w: 1280, h: 720 },
      screen: { w: 1512, h: 982, dpr: 2 },
      consoleErrors: [{ message: DEMO_CONSOLE_ERROR, at: FIXTURE_AT - 4_000 }],
    },
    elapsedMs: 9_000,
    website: '',
  };
}
