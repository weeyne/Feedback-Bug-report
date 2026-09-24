import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { cn } from 'cn';
import { buttonVariants } from '@/components/ui/button';

export interface ChecklistState {
  widgetSeen: boolean;
  notifications: boolean;
  firstFeedback: boolean;
}

export function Checklist({ projectId, state }: { projectId: string; state: ChecklistState }) {
  const t = useTranslations('overview');
  const base = `/app/p/${projectId}`;
  const steps = [
    {
      id: 'widget',
      done: state.widgetSeen,
      title: t('stepWidget'),
      hint: t('stepWidgetHint'),
      href: `${base}/install`,
      cta: t('install'),
    },
    {
      id: 'notifications',
      done: state.notifications,
      title: t('stepNotifications'),
      hint: t('stepNotificationsHint'),
      href: `${base}/integrations`,
      cta: t('connect'),
    },
    {
      id: 'feedback',
      done: state.firstFeedback,
      title: t('stepFeedback'),
      hint: t('stepFeedbackHint'),
      href: `${base}/install`,
      cta: t('sendTest'),
    },
  ];
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;

  return (
    <section className="rounded-xl border bg-card p-4" data-testid="overview-checklist">
      <h2 className="mb-3 text-sm font-extrabold">{t('checklistTitle', { done })}</h2>
      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {steps.map((step) => (
          <li
            key={step.id}
            data-testid={`checklist-${step.id}`}
            data-done={step.done}
            className={cn(
              'flex flex-col gap-2 rounded-lg border p-3',
              step.done &&
                'border-green-600/25 bg-green-600/5 dark:border-green-400/25 dark:bg-green-400/10',
            )}
          >
            <div className="flex items-start gap-2">
              {step.done ? (
                <svg
                  viewBox="0 0 24 24"
                  className="mt-0.5 size-4 shrink-0 text-green-700 dark:text-green-400"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path className="animate-draw" d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              ) : (
                <span
                  className="mt-0.5 size-4 shrink-0 rounded-full border-2 border-muted-foreground/40"
                  aria-hidden
                />
              )}
              <div className="min-w-0">
                <p className="text-sm font-bold">{step.title}</p>
                <p className="text-xs text-muted-foreground">{step.hint}</p>
              </div>
            </div>
            {!step.done && (
              <Link
                href={step.href}
                className={cn(
                  buttonVariants({ size: 'sm', variant: 'outline' }),
                  'mt-auto self-start',
                )}
              >
                {step.cta}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
