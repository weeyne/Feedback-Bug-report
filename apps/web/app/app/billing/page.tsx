import { getTranslations } from 'next-intl/server';
import { cn } from 'cn';
import { BillingPanel } from '@/components/app/billing/billing-panel';
import { UpgradeButtons } from '@/components/app/billing/upgrade-buttons';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { requireUser } from '@/lib/auth/session';
import { billingOverview } from '@/lib/billing/checkout';
import { billingConfig } from '@/lib/billing/config';
import { usage } from '@/lib/dashboard/feedback';
import { getDeps } from '@/lib/deps';

export default async function BillingPage() {
  const user = await requireUser();
  const deps = await getDeps();
  const [plan, overview, t] = await Promise.all([
    usage(deps, user.id),
    billingOverview(deps, user.id),
    getTranslations('billing'),
  ]);
  const config = billingConfig(deps.env);
  const planName =
    overview.state === 'lifetime' ? t('proLifetime') : plan.pro ? t('pro') : t('free');
  const percent =
    plan.limit === null ? 0 : Math.min(100, Math.round((plan.used / plan.limit) * 100));
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 md:p-6">
      <PageHeader title={t('title')} description={t('description')} />
      <SectionCard index={0}>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-muted-foreground">{t('currentLabel')}</span>
          <p className="text-xl font-extrabold tracking-tight" data-testid="billing-plan">
            {planName}
          </p>
        </div>
        {plan.limit === null ? (
          <p className="text-sm text-muted-foreground">
            {t('usageUnlimited', { used: plan.used })}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <div
              className="h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={plan.limit}
              aria-valuenow={plan.used}
              aria-label={t('usage', { used: plan.used, limit: plan.limit })}
            >
              <div
                className={cn(
                  'h-full rounded-full',
                  percent >= 100 ? 'bg-destructive' : 'bg-primary',
                )}
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="text-sm text-muted-foreground tabular-nums">
              {t('usage', { used: plan.used, limit: plan.limit })}
            </p>
          </div>
        )}
      </SectionCard>
      {config ? (
        <BillingPanel
          overview={overview}
          environment={config.environment}
          clientToken={config.clientToken}
        />
      ) : (
        !plan.pro && (
          <SectionCard index={1}>
            <UpgradeButtons />
          </SectionCard>
        )
      )}
    </div>
  );
}
