import { getTranslations } from 'next-intl/server';
import { UpgradeButtons } from '@/components/app/billing/upgrade-buttons';
import { requireUser } from '@/lib/auth/session';
import { usage } from '@/lib/dashboard/feedback';
import { getDeps } from '@/lib/deps';

export default async function BillingPage() {
  const user = await requireUser();
  const plan = await usage(await getDeps(), user.id);
  const t = await getTranslations('billing');
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p data-testid="billing-plan">{t('current', { plan: plan.pro ? t('pro') : t('free') })}</p>
      <p className="text-sm text-muted-foreground">
        {plan.limit === null
          ? t('usageUnlimited', { used: plan.used })
          : t('usage', { used: plan.used, limit: plan.limit })}
      </p>
      {!plan.pro && <UpgradeButtons />}
    </div>
  );
}
