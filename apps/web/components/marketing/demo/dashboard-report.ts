import {
  ClientMetadataSchema,
  EMAIL_MAX_LENGTH,
  FEEDBACK_TYPES,
  MESSAGE_MAX_LENGTH,
  type FeedbackMetadata,
  type SubmitPayload,
} from '@bugping/shared';
import { z } from 'zod';
import type { AppLocale } from '@/i18n/locale';
import { pagePath } from '@/lib/dashboard/feed-view';
import type { FeedbackDetail, FeedbackListItem } from '@/lib/dashboard/feedback';
import {
  DEMO_FEEDBACK_ID,
  DEMO_PROJECT_ID,
  fixtureReport,
  type DescribeAgent,
} from './demo-report';

/** The part of the scene-1 submission the demo dashboard shows (what the real row stores). */
export type DemoReport = Pick<SubmitPayload, 'type' | 'message' | 'email' | 'metadata'>;

/**
 * Upper bound for the encoded `?r=` value. A live scene-1 report is well under 2 KB; anything
 * larger is not ours and falls back to the fixture instead of being parsed.
 */
export const DEMO_REPORT_MAX_CHARS = 8 * 1024;

/** Same limits as `SubmitPayloadSchema` for the fields the dashboard shows. */
const DemoReportSchema = z.object({
  type: z.enum(FEEDBACK_TYPES),
  message: z.string().trim().min(1).max(MESSAGE_MAX_LENGTH),
  email: z
    .email()
    .max(EMAIL_MAX_LENGTH)
    .nullish()
    .transform((value) => value ?? undefined),
  metadata: ClientMetadataSchema,
});

const BASE64URL = /^[A-Za-z0-9_-]+$/;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

const pick = (report: DemoReport): DemoReport => ({
  type: report.type,
  message: report.message,
  ...(report.email ? { email: report.email } : {}),
  metadata: report.metadata,
});

/**
 * The `?r=` value of `/demo/dashboard` for a scene-1 submission: base64url of the UTF-8 JSON of
 * `type`, `message`, `email` and `metadata` (everything else in the payload is dropped).
 * Works in the browser and in Node.
 */
export function encodeDemoReport(
  payload: Pick<SubmitPayload, 'type' | 'message' | 'email' | 'metadata'>,
): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(pick(payload))));
}

/**
 * The `?r=` value the page may honour, or `undefined` (→ the fixture). The demo stage loads
 * /demo/dashboard in a same-origin iframe; anyone else (a shared link, a cross-site frame, a
 * crawler) must not get arbitrary text rendered as a Bugping dashboard on the brand's domain, so
 * `r` counts only for a same-origin iframe navigation, as the browser's `Sec-Fetch-Dest` and
 * `Sec-Fetch-Site` request headers report it (a page cannot forge them).
 */
export function trustedReportParam(
  r: string | string[] | undefined,
  fetch: { dest: string | null; site: string | null },
): string | undefined {
  if (typeof r !== 'string') return undefined;
  return fetch.dest === 'iframe' && fetch.site === 'same-origin' ? r : undefined;
}

/**
 * Decodes and validates a `?r=` value; a missing, oversized, malformed or invalid value yields
 * the built-in fixture report for `locale`.
 */
export function decodeDemoReport(raw: string | undefined, locale: AppLocale): DemoReport {
  const fallback = pick(fixtureReport(locale));
  if (!raw || raw.length > DEMO_REPORT_MAX_CHARS || !BASE64URL.test(raw)) return fallback;
  try {
    const json = new TextDecoder('utf-8', { fatal: true }).decode(fromBase64Url(raw));
    const parsed = DemoReportSchema.safeParse(JSON.parse(json));
    return parsed.success ? pick(parsed.data) : fallback;
  } catch {
    return fallback;
  }
}

/** Postgres `left(message, 200)`: the feed query's preview counts characters (code points). */
const LIST_MESSAGE_CHARS = 200;

/**
 * The feed row and the detail of `report` exactly as `listFeedback` / `getFeedback` would return
 * them right after the real submit handler stored it: status `new`, a screenshot, `browser`/`os`
 * parsed from the user agent into the metadata, and the page path derived from the page URL.
 */
export function toFeedbackDetail(
  report: DemoReport,
  { now, describe }: { now: Date; describe: DescribeAgent },
): { item: FeedbackListItem; detail: FeedbackDetail } {
  const metadata: FeedbackMetadata = {
    ...report.metadata,
    ...describe(report.metadata.userAgent),
  };
  const item: FeedbackListItem = {
    id: DEMO_FEEDBACK_ID,
    type: report.type,
    message: [...report.message].slice(0, LIST_MESSAGE_CHARS).join(''),
    status: 'new',
    created_at: now.toISOString(),
    has_screenshot: true,
    page: pagePath(metadata.url),
    browser: metadata.browser,
    email: report.email ? report.email : null,
  };
  return {
    item,
    detail: { ...item, project_id: DEMO_PROJECT_ID, message: report.message, metadata },
  };
}
