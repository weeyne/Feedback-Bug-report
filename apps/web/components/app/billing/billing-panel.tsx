'use client';

import { useRouter } from 'next/navigation';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { billingStatusAction, openPortalAction, startCheckoutAction } from '@/app/app/actions';
import type { BillingOverview } from '@/lib/billing/checkout';
import { usePaddle } from './use-paddle';

const POLL_MS = 2000;
const POLL_LIMIT_MS = 60_000;

export function BillingPanel(props: {
  overview: BillingOverview;
  email: string;
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
    const started = Date.now();
    const timer = setInterval(async () => {
      if ((await billingStatusAction()).pro) {
        clearInterval(timer);
        setActivation('idle');
        router.refresh();
      } else if (Date.now() - started > POLL_LIMIT_MS) {
        clearInterval(timer);
        setActivation('slow');
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [activation, router]);

  const checkout = (plan: 'monthly' | 'lifetime') =>
    start(async () => {
      const result = await startCheckoutAction(plan);
      if (!result.ok) return void toast.error(t(result.error));
      if (!paddle) return void toast.error(t('billing.checkoutFailed'));
      paddle.Checkout.open({
        transactionId: result.transactionId,
        customer: { email: props.email },
        settings: { displayMode: 'overlay', locale: locale === 'ru' ? 'ru' : 'en' },
      });
    });

  const portal = () =>
    start(async () => {
      const result = await openPortalAction();
      if (result.ok) window.open(result.url, '_blank', 'noopener,noreferrer');
      else toast.error(t(result.error));
    });

  const date = (iso: string | null) =>
    iso ? format.dateTime(new Date(iso), { dateStyle: 'long' }) : '';
  const { overview } = props;

  if (activation !== 'idle') {
    return activation === 'waiting' ? (
      <p className="animate-pulse" data-testid="billing-activating">
        {t('billing.activating')}
      </p>
    ) : (
      <p data-testid="billing-activation-slow">{t('billing.activationSlow')}</p>
    );
  }

  if (overview.state === 'free') {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <section
            className="flex flex-col gap-3 rounded-lg border p-5"
            data-testid="billing-card-monthly"
          >
            <h2 className="font-semibold">{t('billing.monthly')}</h2>
            <p className="text-sm text-muted-foreground">{t('billing.features')}</p>
            <Button
              disabled={pending}
              onClick={() => checkout('monthly')}
              data-testid="billing-upgrade-monthly"
            >
              {t('billing.buyMonthly')}
            </Button>
          </section>
          <section
            className="flex flex-col gap-3 rounded-lg border p-5"
            data-testid="billing-card-lifetime"
          >
            <h2 className="font-semibold">{t('billing.lifetime')}</h2>
            <p className="text-sm text-muted-foreground">{t('billing.lifetimeNote')}</p>
            <Button
              disabled={pending}
              onClick={() => checkout('lifetime')}
              data-testid="billing-upgrade-lifetime"
            >
              {t('billing.buyLifetime')}
            </Button>
          </section>
        </div>
        <p className="text-xs text-muted-foreground">{t('billing.taxNote')}</p>
      </div>
    );
  }

  if (overview.state === 'lifetime') {
    return (
      <div className="flex flex-col items-start gap-3">
        {overview.hasCustomer && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={portal}
            data-testid="billing-manage"
          >
            {t('billing.receipts')}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-3">
      {overview.state === 'past_due' ? (
        <p className="text-sm text-destructive" data-testid="billing-past-due">
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
    </div>
  );
}
