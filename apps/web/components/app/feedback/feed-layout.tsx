import type { FeedbackType } from '@bugping/shared';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { UsageBar } from '@/components/app/usage-bar';
import type { FeedbackStatus } from '@/lib/dashboard/feedback';
import { StatusTabs, TypeChips } from './feedback-filters';

/**
 * The feed page's frame: the header (title, status tabs, type chips, usage) above `children`
 * (the list or an empty state), with the detail panel beside it. Shared by the real feed page
 * and the landing demo's /demo/dashboard so the two cannot drift apart.
 */
export async function FeedLayout({
  base,
  type,
  status,
  counts,
  usage,
  refresh,
  detail,
  children,
}: {
  base: string;
  type?: FeedbackType;
  status: FeedbackStatus;
  counts: Record<FeedbackStatus, number>;
  usage: { used: number; limit: number | null };
  /** Shown next to the title (the real page's `AutoRefresh`). */
  refresh?: ReactNode;
  /** The selected feedback's `FeedbackDetailPanel`, if any. */
  detail?: ReactNode;
  children: ReactNode;
}) {
  const t = await getTranslations('feedback');
  return (
    <div className="flex min-h-full">
      <section className="min-w-0 flex-1">
        <header className="flex flex-col gap-3 border-b px-4 pt-4 pb-3 md:px-6 md:pt-6">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight">{t('title')}</h1>
            {refresh}
          </div>
          <StatusTabs base={base} type={type} status={status} counts={counts} />
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <TypeChips base={base} type={type} status={status} />
            <UsageBar used={usage.used} limit={usage.limit} />
          </div>
        </header>
        {children}
      </section>
      {detail}
    </div>
  );
}
