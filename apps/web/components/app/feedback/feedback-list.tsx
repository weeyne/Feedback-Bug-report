import { ChevronDown, ImageIcon, Lock } from 'lucide-react';
import { AppLink } from '@/components/app/link-prefetch';
import { getFormatter, getTranslations } from 'next-intl/server';
import { cn } from 'cn';
import { buttonVariants } from '@/components/ui/button';
import type { FeedbackListItem } from '@/lib/dashboard/feedback';
import { metaLine } from '@/lib/dashboard/feed-view';
import { TypePill } from './type-pill';

const MAX_HIDDEN_PLACEHOLDER_ROWS = 5;

/** The feed rows; the page renders an empty state instead when there is nothing to list. */
export async function FeedbackList({
  items,
  hidden,
  hrefFor,
  selectedId,
  loadMoreHref,
}: {
  items: FeedbackListItem[];
  hidden: number;
  hrefFor: (id: string) => string;
  selectedId?: string;
  loadMoreHref: string | null;
}) {
  const t = await getTranslations('feedback');
  const format = await getFormatter();
  return (
    <ul className="divide-y">
      {items.map((item) => {
        const selected = selectedId === item.id;
        const meta = metaLine(item);
        return (
          <li key={item.id}>
            <AppLink
              href={hrefFor(item.id)}
              data-testid="feedback-row"
              data-id={item.id}
              aria-current={selected ? 'true' : undefined}
              className={cn(
                'flex items-start gap-3 px-4 py-3 text-sm transition-colors duration-200 md:px-6',
                selected
                  ? 'bg-primary/5 shadow-[inset_3px_0_0_var(--primary)]'
                  : 'hover:bg-muted/70',
              )}
            >
              <TypePill type={item.type} className="mt-px" />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 leading-snug break-words">{item.message}</span>
                {meta && (
                  <span className="mt-1 block truncate text-xs text-muted-foreground">{meta}</span>
                )}
              </span>
              {item.has_screenshot && (
                <span
                  className="grid h-7 w-9 shrink-0 place-items-center rounded-md border bg-muted text-muted-foreground"
                  title={t('screenshot')}
                >
                  <ImageIcon className="size-3.5" aria-hidden />
                  <span className="sr-only">{t('screenshot')}</span>
                </span>
              )}
              <time
                className="shrink-0 pt-px text-xs whitespace-nowrap text-muted-foreground"
                dateTime={item.created_at}
              >
                {format.relativeTime(new Date(item.created_at), { style: 'short' })}
              </time>
            </AppLink>
          </li>
        );
      })}
      {hidden > 0 && (
        <>
          {Array.from({ length: Math.min(hidden, MAX_HIDDEN_PLACEHOLDER_ROWS) }).map((_, i) => (
            <li
              key={`hidden-${i}`}
              aria-hidden
              className="flex items-start gap-3 px-4 py-3 text-sm select-none md:px-6"
            >
              <span className="mt-px h-[18px] w-10 shrink-0 rounded-full bg-muted" />
              <span className="min-w-0 flex-1 blur-[3px]">
                <span className="block truncate">████████ ████ ██████ ███</span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">
                  ███ · ██████ ██
                </span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground blur-[2px]">•• ••</span>
            </li>
          ))}
          <li data-testid="feedback-hidden">
            <AppLink
              href="/app/billing"
              className="flex items-center gap-2 bg-primary/5 px-4 py-3 text-sm font-semibold text-primary transition-colors duration-200 hover:bg-primary/10 md:px-6"
            >
              <Lock className="size-4 shrink-0" aria-hidden />
              {t('hidden', { count: hidden })}
            </AppLink>
          </li>
        </>
      )}
      {loadMoreHref && (
        <li className="flex justify-center p-4">
          <AppLink
            href={loadMoreHref}
            className={cn(buttonVariants({ size: 'sm', variant: 'outline' }), 'font-semibold')}
          >
            <ChevronDown aria-hidden />
            {t('loadMore')}
          </AppLink>
        </li>
      )}
    </ul>
  );
}
