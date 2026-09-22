import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import type { FeedbackListItem } from '@/lib/dashboard/feedback';

const DOT: Record<string, string> = {
  bug: 'bg-red-500',
  idea: 'bg-green-500',
  general: 'bg-indigo-500',
};

const MAX_HIDDEN_PLACEHOLDER_ROWS = 5;

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
  if (!items.length && !hidden) {
    return (
      <p className="p-6 text-sm text-muted-foreground" data-testid="feedback-empty">
        {t('empty')}
      </p>
    );
  }
  return (
    <ul className="divide-y">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={hrefFor(item.id)}
            data-testid="feedback-row"
            data-id={item.id}
            className={`flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted ${selectedId === item.id ? 'bg-muted' : ''}`}
          >
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${DOT[item.type]}`}
              aria-label={t(`type_${item.type}`)}
            />
            <span className="min-w-0 flex-1 truncate">{item.message}</span>
            {item.has_screenshot && <span aria-hidden>🖼</span>}
            <time className="shrink-0 text-xs text-muted-foreground" dateTime={item.created_at}>
              {format.relativeTime(new Date(item.created_at))}
            </time>
          </Link>
        </li>
      ))}
      {hidden > 0 && (
        <>
          {Array.from({ length: Math.min(hidden, MAX_HIDDEN_PLACEHOLDER_ROWS) }).map((_, i) => (
            <li
              key={`hidden-${i}`}
              aria-hidden
              className="flex select-none items-center gap-3 px-4 py-3 text-sm blur-[2px]"
            >
              <span className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">████████ ████ ██████</span>
              <span className="shrink-0 text-xs text-muted-foreground">•• •• ••••</span>
            </li>
          ))}
          <li className="px-4 py-3 text-sm" data-testid="feedback-hidden">
            <Link href="/app/billing" className="underline">
              {t('hidden', { count: hidden })}
            </Link>
          </li>
        </>
      )}
      {loadMoreHref && (
        <li className="p-3 text-center">
          <Link href={loadMoreHref} className="text-sm underline">
            {t('loadMore')}
          </Link>
        </li>
      )}
    </ul>
  );
}
