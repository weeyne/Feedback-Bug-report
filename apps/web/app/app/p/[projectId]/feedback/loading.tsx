import { getTranslations } from 'next-intl/server';
import { Skeleton } from '@/components/ui/skeleton';

// Mirrors FeedLayout: header (title, tabs, chips) above the rows, detail column from md up.
export default async function FeedbackLoading() {
  const t = await getTranslations('status');
  return (
    <div className="flex min-h-full" role="status" aria-busy="true">
      <span className="sr-only">{t('loading')}</span>
      <section aria-hidden className="min-w-0 flex-1">
        <header className="flex flex-col gap-3 border-b px-4 pt-4 pb-3 md:px-6 md:pt-6">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-9 w-72 max-w-full rounded-lg" />
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <Skeleton className="h-7 w-56 max-w-full rounded-full" />
            <Skeleton className="h-4 w-32" />
          </div>
        </header>
        <ul className="divide-y">
          {Array.from({ length: 5 }, (_, i) => (
            <li key={i} className="flex items-start gap-3 px-4 py-3 md:px-6">
              <Skeleton className="mt-px h-5 w-12 rounded-full" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-full max-w-md" />
                <Skeleton className="h-3 w-40" />
              </div>
            </li>
          ))}
        </ul>
      </section>
      <div aria-hidden className="hidden w-[420px] shrink-0 border-l md:block" />
    </div>
  );
}
