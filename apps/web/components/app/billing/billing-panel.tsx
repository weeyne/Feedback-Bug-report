'use client';

import { Check, Infinity as InfinityIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { SectionCard } from '@/components/app/page-header';
import { Button } from '@/components/ui/button';
import { billingStatusAction, openPortalAction, startCheckoutAction } from '@/app/app/actions';
import { openPendingTab, pollActivation } from '@/lib/billing/browser';
import type { BillingOverview } from '@/lib/billing/checkout';
import { usePaddle } from './use-paddle';

const POLL_MS = 2000;
const POLL_LIMIT_MS = 60_000;

export function BillingPanel(props: {
  overview: BillingOverview;
  environment: 'sandbox' | 'production';
  clientToken: string;
}) {
  const t = useTranslations();
  const format = useFormatter();
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [activation, setActivation] = useState<'idle' | 'waiting' | 'slow'>('idle');
  const paddle = usePaddle({
    environment: props.environment,
    token: props.clientToken,
    onCompleted: () => {
      paddle?.Checkout.close();
      setActivation('waiting');
    },
  });

  useEffect(() => {
    if (activation !== 'waiting') return;
    return pollActivation({
      check: async () => (await billingStatusAction()).pro,
      onPro: () => {
        setActivation('idle');
        router.refresh();
      },
      onSlow: () => setActivation('slow'),
      intervalMs: POLL_MS,
      limitMs: POLL_LIMIT_MS,
    });
  }, [activation, router]);

  const checkout = (plan: 'monthly' | 'lifetime') =>
    start(async () => {
      if (!paddle) return void toast.error(t('billing.checkoutFailed'));
      const result = await startCheckoutAction(plan);
      if (!result.ok) return void toast.error(t(result.error));
      // The transaction already carries the server-resolved customer.
      paddle.Checkout.open({
        transactionId: result.transactionId,
        settings: { displayMode: 'overlay', locale: locale === 'ru' ? 'ru' : 'en' },
      });
    });

  const portal = () => {
    // Opened before any await, while the click still counts as a user gesture.
    const tab = openPendingTab(window);
    start(async () => {
      const result = await openPortalAction().catch(
        () => ({ ok: false, error: 'errors.generic' }) as const,
      );
      if (result.ok) {
        tab.go(result.url);
      } else {
        tab.close();
        toast.error(t(result.error));
      }
    });
  };

  const date = (iso: string | null) =>
    iso ? format.dateTime(new Date(iso), { dateStyle: 'long' }) : '';
  const { overview } = props;

  if (activation !== 'idle') {
    return (
      <SectionCard>
        {activation === 'waiting' ? (
          <p className="flex items-center gap-2 text-sm" data-testid="billing-activating">
            <span
              className="size-2 shrink-0 animate-pulse rounded-full bg-primary motion-reduce:animate-none"
              aria-hidden
            />
            {t('billing.activating')}
          </p>
        ) : (
          <p className="text-sm" data-testid="billing-activation-slow">
            {t('billing.activationSlow')}
          </p>
        )}
      </SectionCard>
    );
  }

  if (overview.state === 'free') {
    // One message, split into list items; items after the first start lowercase in the source.
    const features = t('billing.features')
      .split(' · ')
      .map((f) => f.charAt(0).toLocaleUpperCase(locale) + f.slice(1));
    return (
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <SectionCard index={1} title={t('billing.monthly')} data-testid="billing-card-monthly">
            <ul className="flex flex-1 flex-col gap-1.5 text-sm">
              {features.map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <span className="text-muted-foreground">{feature}</span>
                </li>
              ))}
            </ul>
            <Button
              size="lg"
              className="font-semibold"
              disabled={pending}
              onClick={() => checkout('monthly')}
              data-testid="billing-upgrade-monthly"
            >
              {t('billing.buyMonthly')}
            </Button>
          </SectionCard>
          <SectionCard
            index={2}
            title={t('billing.lifetime')}
            className="border-primary/40"
            data-testid="billing-card-lifetime"
          >
            <p className="flex flex-1 items-start gap-2 text-sm text-muted-foreground">
              <InfinityIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              {t('billing.lifetimeNote')}
            </p>
            <Button
              size="lg"
              className="font-semibold"
              disabled={pending}
              onClick={() => checkout('lifetime')}
              data-testid="billing-upgrade-lifetime"
            >
              {t('billing.buyLifetime')}
            </Button>
          </SectionCard>
        </div>
        <p className="text-xs text-muted-foreground">{t('billing.taxNote')}</p>
      </div>
    );
  }

  if (overview.state === 'lifetime') {
    if (!overview.hasCustomer) return null;
    return (
      <SectionCard index={1}>
        <Button
          variant="outline"
          className="self-start"
          disabled={pending}
          onClick={portal}
          data-testid="billing-manage"
        >
          {t('billing.receipts')}
        </Button>
      </SectionCard>
    );
  }

  return (
    <SectionCard index={1}>
      {overview.state === 'past_due' ? (
        <p
          className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          data-testid="billing-past-due"
        >
          {t('billing.pastDue')}
        </p>
      ) : (
        overview.periodEnd && (
          <p className="text-sm">
            {overview.cancelAtPeriodEnd
              ? t('billing.endsOn', { date: date(overview.periodEnd) })
              : t('billing.renews', { date: date(overview.periodEnd) })}
          </p>
        )
      )}
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" disabled={pending} onClick={portal} data-testid="billing-manage">
          {t('billing.manage')}
        </Button>
        {overview.state === 'monthly' && (
          <Button
            disabled={pending}
            onClick={() => checkout('lifetime')}
            data-testid="billing-switch-lifetime"
          >
            {t('billing.switchLifetime')}
          </Button>
        )}
      </div>
    </SectionCard>
  );
}
