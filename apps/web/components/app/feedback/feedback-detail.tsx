import { X } from 'lucide-react';
import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import type { FeedbackDetail } from '@/lib/dashboard/feedback';
import { FeedbackActions } from './feedback-actions';
import { ScreenshotViewer } from './screenshot-viewer';
import { TypePill } from './type-pill';

const HTTP_URL = /^https?:\/\//i;

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
  const link = (href: string, label: string, external = false) => (
    <a
      href={href}
      className="text-primary underline-offset-4 hover:underline"
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {label}
    </a>
  );
  const rows = (
    [
      // Only http(s) page URLs become links; the widget reports this value, so never trust a scheme.
      [t('page'), m.url && (HTTP_URL.test(m.url) ? link(m.url, m.url, true) : m.url)],
      [t('browser'), m.browser],
      [t('os'), m.os],
      [t('viewport'), m.viewport ? `${m.viewport.w}×${m.viewport.h}` : undefined],
      [t('screen'), m.screen ? `${m.screen.w}×${m.screen.h} @${m.screen.dpr}x` : undefined],
      [t('language'), m.language],
      [t('timezone'), m.timezone],
      [t('user'), m.user ? [m.user.name, m.user.id].filter(Boolean).join(' · ') : undefined],
      [t('email'), feedback.email && link(`mailto:${feedback.email}`, feedback.email)],
    ] satisfies Array<[string, ReactNode]>
  ).filter(([, value]) => value);
  const errors = m.consoleErrors ?? [];
  return (
    <aside
      data-testid="feedback-detail"
      className="animate-slide fixed inset-0 z-40 flex flex-col overflow-y-auto bg-background md:sticky md:top-0 md:z-auto md:h-screen md:w-[420px] md:shrink-0 md:self-start md:border-l"
    >
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-5">
        <header className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <TypePill type={feedback.type} />
            <time className="truncate text-xs text-muted-foreground" dateTime={feedback.created_at}>
              {format.dateTime(new Date(feedback.created_at), {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </time>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="-mr-1 text-muted-foreground"
            aria-label={t('close')}
            title={t('close')}
            data-testid="feedback-close"
            nativeButton={false}
            render={<Link href={closeHref} />}
          >
            <X aria-hidden />
          </Button>
        </header>
        {screenshot && <ScreenshotViewer src={screenshot} />}
        <p
          className="text-[15px] leading-relaxed whitespace-pre-wrap break-words"
          data-testid="feedback-message"
        >
          {feedback.message}
        </p>
        {rows.length > 0 && (
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 rounded-xl border bg-card p-3 text-xs">
            {rows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="break-all">{value}</dd>
              </div>
            ))}
          </dl>
        )}
        {errors.length > 0 && (
          <section>
            <h3 className="mb-1.5 text-xs font-bold">
              {t('consoleErrors')}{' '}
              <span className="font-medium text-muted-foreground tabular-nums">
                {errors.length}
              </span>
            </h3>
            <pre className="max-h-60 overflow-auto rounded-lg bg-zinc-950 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all text-red-300">
              {errors.map((e) => e.message).join('\n')}
            </pre>
          </section>
        )}
      </div>
      <div className="sticky bottom-0 border-t bg-background p-4 md:px-5">
        <FeedbackActions
          id={feedback.id}
          status={feedback.status}
          email={feedback.email}
          closeHref={closeHref}
        />
      </div>
    </aside>
  );
}
