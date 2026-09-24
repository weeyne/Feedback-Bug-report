import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { cn } from 'cn';
import { buttonVariants } from '@/components/ui/button';

export type PlanKind = 'free' | 'pro_monthly' | 'pro_lifetime';

export interface ShellUsage {
  used: number;
  limit: number | null;
  pro: boolean;
}

export async function PlanCard({ plan, usage }: { plan: PlanKind; usage: ShellUsage }) {
  const t = await getTranslations('nav');
  const name =
    plan === 'pro_lifetime'
      ? t('planLifetime')
      : plan === 'pro_monthly'
        ? t('planPro')
        : t('planFree');
  const limit = plan === 'free' ? usage.limit : null;
  const percent = limit ? Math.min(100, Math.round((usage.used / limit) * 100)) : 0;
  return (
    <div
      className="flex flex-col gap-2 rounded-xl border bg-card p-3 text-xs dark:bg-muted"
      data-testid="plan-card"
    >
      <div className="text-sm font-bold">{name}</div>
      {limit !== null ? (
        <>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-border"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={limit}
            aria-valuenow={Math.min(usage.used, limit)}
          >
            <div
              className={`h-full rounded-full ${percent >= 100 ? 'bg-destructive' : 'bg-primary'}`}
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="text-muted-foreground">{t('planUsage', { used: usage.used, limit })}</p>
          <Link
            href="/app/billing"
            data-testid="nav-billing"
            className={cn(buttonVariants({ size: 'sm' }), 'w-full font-bold')}
          >
            {t('upgrade')}
          </Link>
        </>
      ) : (
        <>
          <p className="text-muted-foreground">{t('unlimited')}</p>
          <Link
            href="/app/billing"
            data-testid="nav-billing"
            className={cn(buttonVariants({ size: 'sm', variant: 'outline' }), 'w-full')}
          >
            {t('manage')}
          </Link>
        </>
      )}
    </div>
  );
}
