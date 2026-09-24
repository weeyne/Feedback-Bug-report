import type { CSSProperties, ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { CountUp } from '@/components/motion/count-up';
import type { Overview } from '@/lib/dashboard/overview';

function Stat({
  id,
  index,
  label,
  children,
}: {
  id: string;
  index: number;
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      data-testid={`stat-${id}`}
      className="animate-enter flex flex-col gap-1 rounded-xl border bg-card p-4"
      style={{ '--i': index } as CSSProperties}
    >
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="flex items-baseline gap-1.5 text-2xl font-extrabold tracking-tight tabular-nums">
        {children}
      </span>
    </div>
  );
}

export function StatCards({
  counts,
  usage,
}: {
  counts: Overview['counts'];
  usage: Overview['usage'];
}) {
  const t = useTranslations('overview');
  const tNav = useTranslations('nav');
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat id="new" index={0} label={t('statNew')}>
        <CountUp value={counts.new} />
      </Stat>
      <Stat id="resolved" index={1} label={t('statResolved')}>
        <CountUp value={counts.resolved} />
      </Stat>
      <Stat id="last30" index={2} label={t('statLast30')}>
        <CountUp value={counts.last30} />
      </Stat>
      <Stat id="limit" index={3} label={t('statLimit')}>
        <span>
          <CountUp value={usage.used} />
          {usage.limit !== null && <span className="text-muted-foreground">/{usage.limit}</span>}
        </span>
        {usage.limit === null && (
          <span className="text-xs font-semibold text-muted-foreground">
            <span aria-hidden>∞ </span>
            {tNav('unlimited')}
          </span>
        )}
      </Stat>
    </div>
  );
}
