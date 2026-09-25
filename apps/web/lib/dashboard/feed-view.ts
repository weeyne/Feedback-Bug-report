import type { FeedbackType } from '@bugping/shared';
import type { FeedbackListItem, FeedbackStatus } from './feedback';

/** Best-effort URL path extraction for the feed's "page" column; malformed or missing URLs yield `null`. */
export function pagePath(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}

/** The feed row's meta line: `page · browser · email`, skipping missing or blank parts. */
export function metaLine(item: Pick<FeedbackListItem, 'page' | 'browser' | 'email'>): string {
  return [item.page, item.browser, item.email]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' · ');
}

export type FeedEmptyKind = 'quiet' | 'noneOfType' | 'caughtUp' | 'noneResolved' | 'noneArchived';

/** Which empty state an empty feed shows for the current project, status tab and type filter. */
export function feedEmptyKind({
  hasFeedback,
  status,
  type,
}: {
  hasFeedback: boolean;
  status: FeedbackStatus;
  type?: FeedbackType;
}): FeedEmptyKind {
  if (!hasFeedback) return 'quiet';
  if (type) return 'noneOfType';
  if (status === 'new') return 'caughtUp';
  return status === 'resolved' ? 'noneResolved' : 'noneArchived';
}

/** `mailto:` link for replying to a submitter; the address is encoded except for `@`. */
export function replyHref(email: string, subject: string): string {
  const to = encodeURIComponent(email).replaceAll('%40', '@');
  return `mailto:${to}?subject=${encodeURIComponent(subject)}`;
}
