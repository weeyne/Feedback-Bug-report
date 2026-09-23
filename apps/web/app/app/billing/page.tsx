import { getTranslations } from 'next-intl/server';
import { BillingPanel } from '@/components/app/billing/billing-panel';
import { UpgradeButtons } from '@/components/app/billing/upgrade-buttons';
import { requireUser } from '@/lib/auth/session';
import { billingOverview } from '@/lib/billing/checkout';
import { billingConfig } from '@/lib/billing/config';
import { usage } from '@/lib/dashboard/feedback';
import { getDeps } from '@/lib/deps';

export default async function BillingPage() {
  const user = await requireUser();
  const deps = await getDeps();
  const [plan, overview] = await Promise.all([
    usage(deps, user.id),
    billingOverview(deps, user.id),
  ]);
  const config = billingConfig(deps.env);
  const t = await getTranslations('billing');
  const planName =
    overview.state === 'lifetime' ? t('proLifetime') : plan.pro ? t('pro') : t('free');
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p data-testid="billing-plan">{t('current', { plan: planName })}</p>
      <p className="text-sm text-muted-foreground">
        {plan.limit === null
          ? t('usageUnlimited', { used: plan.used })
          : t('usage', { used: plan.used, limit: plan.limit })}
      </p>
      {config ? (
        <BillingPanel
          overview={overview}
          environment={config.environment}
          clientToken={config.clientToken}
        />
      ) : (
        !plan.pro && <UpgradeButtons />
      )}
    </div>
  );
}
