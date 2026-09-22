import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import type { FeedbackDetail } from '@/lib/dashboard/feedback';
import { FeedbackActions } from './feedback-actions';

export async function FeedbackDetailPanel({
  feedback,
  screenshot,
  closeHref,
}: {
  feedback: FeedbackDetail;
  screenshot: string | null;
  closeHref: string;
}) {
  const t = await getTranslations('feedback');
  const format = await getFormatter();
  const m = feedback.metadata;
  const rows: Array<[string, string | undefined]> = [
    [t('page'), m.url],
    [t('browser'), m.browser],
    [t('os'), m.os],
    [t('viewport'), m.viewport ? `${m.viewport.w}×${m.viewport.h}` : undefined],
    [t('screen'), m.screen ? `${m.screen.w}×${m.screen.h} @${m.screen.dpr}x` : undefined],
    [t('language'), m.language],
    [t('timezone'), m.timezone],
    [t('user'), m.user ? [m.user.name, m.user.id].filter(Boolean).join(' · ') : undefined],
  ];
  return (
    <aside
      data-testid="feedback-detail"
      className="fixed inset-0 z-40 overflow-y-auto bg-background p-4 md:static md:z-auto md:w-[420px] md:shrink-0 md:border-l"
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {t(`type_${feedback.type}`)} ·{' '}
          {format.dateTime(new Date(feedback.created_at), {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}
        </span>
        <Link href={closeHref} className="text-sm underline">
          {t('close')}
        </Link>
      </div>
      <p className="whitespace-pre-wrap break-words text-sm" data-testid="feedback-message">
        {feedback.message}
      </p>
      {feedback.email && (
        <p className="mt-2 text-sm">
          {t('email')}:{' '}
          <a href={`mailto:${feedback.email}`} className="underline">
            {feedback.email}
          </a>
        </p>
      )}
      {screenshot && (
        <a href={screenshot} target="_blank" rel="noopener noreferrer" className="mt-4 block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={screenshot} alt={t('screenshot')} className="w-full rounded-md border" />
        </a>
      )}
      <dl className="mt-4 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
        {rows
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="break-all">{value}</dd>
            </div>
          ))}
      </dl>
      {m.consoleErrors && m.consoleErrors.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-1 text-xs font-medium">{t('consoleErrors')}</h3>
          <pre className="overflow-x-auto rounded-md bg-muted p-2 text-xs">
            {m.consoleErrors.map((e) => e.message).join('\n')}
          </pre>
        </div>
      )}
      <div className="mt-4">
        <FeedbackActions id={feedback.id} status={feedback.status} closeHref={closeHref} />
      </div>
    </aside>
  );
}
