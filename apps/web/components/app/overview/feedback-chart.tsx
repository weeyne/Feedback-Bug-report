import type { CSSProperties } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { TYPE_FILL } from '@/components/app/feedback/type-pill';

export interface ChartDay {
  day: string;
  bug: number;
  idea: number;
  general: number;
}

const MAX_HEIGHT = 120;
const SEGMENTS = ['bug', 'idea', 'general'] as const;

const px = (count: number, max: number) => Math.round((count / max) * MAX_HEIGHT * 100) / 100;

export function FeedbackChart({ series }: { series: ChartDay[] }) {
  const t = useTranslations('overview');
  const format = useFormatter();
  const max = Math.max(0, ...series.map((d) => d.bug + d.idea + d.general));

  return (
    <section className="flex flex-col rounded-xl border bg-card p-4" data-testid="overview-chart">
      <h2 className="mb-3 text-sm font-extrabold">{t('chartTitle')}</h2>
      {max === 0 ? (
        <p className="grid flex-1 place-items-center py-10 text-sm text-muted-foreground">
          {t('chartEmpty')}
        </p>
      ) : (
        <>
          <div
            className="mt-auto box-content flex items-end gap-[3px] border-b"
            style={{ height: MAX_HEIGHT }}
          >
            {series.map((d, i) => {
              const label = t('chartDayTitle', {
                day: format.dateTime(new Date(`${d.day}T00:00:00Z`), {
                  month: 'short',
                  day: 'numeric',
                  timeZone: 'UTC',
                }),
                bug: d.bug,
                idea: d.idea,
                general: d.general,
              });
              return (
                <div
                  key={d.day}
                  data-day={d.day}
                  title={label}
                  role="img"
                  aria-label={label}
                  className="animate-grow flex min-w-0 flex-1 flex-col-reverse overflow-hidden rounded-t-[3px]"
                  style={{ '--i': i } as CSSProperties}
                >
                  {SEGMENTS.map((type) => (
                    <div
                      key={type}
                      className={TYPE_FILL[type]}
                      style={{ height: `${px(d[type], max)}px` }}
                    />
                  ))}
                </div>
              );
            })}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {SEGMENTS.map((type) => (
              <li key={type} className="flex items-center gap-1.5">
                <span className={`size-2 rounded-[2px] ${TYPE_FILL[type]}`} aria-hidden />
                {t(type === 'bug' ? 'legendBug' : type === 'idea' ? 'legendIdea' : 'legendGeneral')}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
