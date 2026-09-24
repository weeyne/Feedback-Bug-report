import type { FeedbackType } from '@bugping/shared';
import { Bug, Lightbulb, MessageCircle } from 'lucide-react';
import { AppLink } from '@/components/app/link-prefetch';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { cn } from 'cn';
import type { FeedbackStatus } from '@/lib/dashboard/feedback';

const TYPES = ['all', 'bug', 'idea', 'general'] as const;
const STATUSES = ['new', 'resolved', 'archived'] as const;

const TYPE_ICON: Record<FeedbackType, ReactNode> = {
  bug: <Bug aria-hidden />,
  idea: <Lightbulb aria-hidden />,
  general: <MessageCircle aria-hidden />,
};

/** Feed URL for a status/type combination; switching either drops the cursor and the selection. */
export function feedHref(base: string, status: FeedbackStatus, type?: string) {
  const params = new URLSearchParams();
  if (type && type !== 'all') params.set('type', type);
  params.set('status', status);
  return `${base}?${params.toString()}`;
}

/**
 * Status tabs as a segmented control. They are plain links (the page is server-rendered per
 * query), so the active one is marked with `aria-current="page"` rather than a fake tablist.
 * `filter-status-*` stays on the label so existing selectors keep working.
 */
export async function StatusTabs({
  base,
  type,
  status,
  counts,
}: {
  base: string;
  type?: FeedbackType;
  status: FeedbackStatus;
  counts: Record<FeedbackStatus, number>;
}) {
  const t = await getTranslations('feedback');
  return (
    <nav aria-label={t('statusTabs')} className="max-w-full overflow-x-auto">
      <ul className="inline-flex gap-1 rounded-lg bg-muted p-[3px]">
        {STATUSES.map((value) => {
          const active = status === value;
          return (
            <li key={value}>
              <AppLink
                href={feedHref(base, value, type)}
                aria-current={active ? 'page' : undefined}
                data-testid={`status-tab-${value}`}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold whitespace-nowrap transition-colors duration-200',
                  active
                    ? 'bg-card text-foreground shadow-sm dark:bg-accent'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span data-testid={`filter-status-${value}`}>{t(`status_${value}`)}</span>
                {value === 'new' && counts.new > 0 && (
                  <span className="rounded-full bg-primary px-1.5 text-[11px] leading-[18px] font-bold text-primary-foreground tabular-nums">
                    {counts.new}
                  </span>
                )}
              </AppLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Type filter chips (All / Bugs / Ideas / Questions); the active chip is `aria-current`. */
export async function TypeChips({
  base,
  type,
  status,
}: {
  base: string;
  type?: FeedbackType;
  status: FeedbackStatus;
}) {
  const t = await getTranslations('feedback');
  return (
    <nav aria-label={t('typeFilter')}>
      <ul className="flex flex-wrap gap-1.5">
        {TYPES.map((value) => {
          const active = (type ?? 'all') === value;
          return (
            <li key={value}>
              <AppLink
                href={feedHref(base, status, value)}
                aria-current={active ? 'true' : undefined}
                data-testid={`filter-type-${value}`}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors duration-200 [&_svg]:size-3.5',
                  active
                    ? 'border-primary bg-primary/10 font-bold text-primary'
                    : 'font-medium text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {value !== 'all' && TYPE_ICON[value]}
                {value === 'all' ? t('typeAll') : t(`types_${value}`)}
              </AppLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
