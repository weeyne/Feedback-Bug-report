import Link from 'next/link';
import { Inbox } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { EmptyState } from '@/components/app/empty-state';
import { TypePill } from '@/components/app/feedback/type-pill';
import type { Overview } from '@/lib/dashboard/overview';

export function RecentFeedback({
  projectId,
  items,
  widgetSeen,
}: {
  projectId: string;
  items: Overview['recent'];
  widgetSeen: boolean;
}) {
  const t = useTranslations('overview');
  const tEmpty = useTranslations('empty');
  const format = useFormatter();
  const base = `/app/p/${projectId}`;

  return (
    <section className="flex flex-col rounded-xl border bg-card p-4" data-testid="overview-recent">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-extrabold">{t('recentTitle')}</h2>
        <Link
          href={`${base}/feedback`}
          className="text-xs font-semibold text-primary underline-offset-4 hover:underline"
        >
          {t('allFeedback')} →
        </Link>
      </div>
      {items.length === 0 ? (
        <EmptyState
          icon={<Inbox />}
          title={tEmpty('quietTitle')}
          body={tEmpty('quietBody')}
          action={widgetSeen ? undefined : { href: `${base}/install`, label: tEmpty('installCta') }}
        />
      ) : (
        <ul className="-mx-2 flex flex-col">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={
                  item.hidden
                    ? '/app/billing'
                    : `${base}/feedback?status=${item.status}&f=${item.id}`
                }
                data-id={item.id}
                title={item.hidden ? t('hiddenRow') : undefined}
                className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors duration-200 hover:bg-muted"
              >
                {item.type ? (
                  <TypePill type={item.type} />
                ) : (
                  <span aria-hidden className="h-[18px] w-10 shrink-0 rounded-full bg-muted" />
                )}
                {item.hidden ? (
                  <span className="min-w-0 flex-1">
                    <span aria-hidden className="block select-none truncate blur-[3px]">
                      ████████ ████ ██████
                    </span>
                    <span className="sr-only">{t('hiddenRow')}</span>
                  </span>
                ) : (
                  <span className="min-w-0 flex-1 truncate">{item.message}</span>
                )}
                <time className="shrink-0 text-xs text-muted-foreground" dateTime={item.created_at}>
                  {format.relativeTime(new Date(item.created_at))}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
