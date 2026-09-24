import type { CSSProperties } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { cn } from 'cn';
import { buttonVariants } from '@/components/ui/button';
import { Reveal } from '../reveal';
import { CARD, CONTAINER, SectionHeading } from './section';

type PlanKey = 'free' | 'pro' | 'lifetime';

const PLANS: {
  key: PlanKey;
  features: number;
  href: string;
  cta: 'startFree' | 'pricing.proCta' | 'pricing.lifetimeCta';
  featured?: boolean;
}[] = [
  { key: 'free', features: 5, href: '/login', cta: 'startFree' },
  { key: 'pro', features: 5, href: '/app/billing', cta: 'pricing.proCta', featured: true },
  { key: 'lifetime', features: 2, href: '/app/billing', cta: 'pricing.lifetimeCta' },
];

export async function Pricing() {
  const t = await getTranslations('landing');
  return (
    <section id="pricing" data-testid="landing-pricing" className={cn(CONTAINER, 'py-20')}>
      <SectionHeading title={t('pricing.title')} subtitle={t('pricing.subtitle')} />
      <Reveal stagger className="mt-12">
        <ul className="mx-auto grid max-w-md gap-4 lg:max-w-none lg:grid-cols-3 lg:items-stretch lg:gap-5">
          {PLANS.map(({ key, features, href, cta, featured }, i) => (
            <li key={key} className="reveal-item" style={{ '--i': i } as CSSProperties}>
              <div
                className={cn(
                  CARD,
                  'relative flex h-full flex-col p-6 sm:p-8',
                  featured && 'border-primary shadow-lg ring-1 ring-primary',
                )}
              >
                {featured ? (
                  <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-0.5 text-xs font-bold text-primary-foreground sm:left-8">
                    {t('pricing.popular')}
                  </span>
                ) : null}
                <h3 className="text-lg font-extrabold tracking-tight">{t(`pricing.${key}Name`)}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t(`pricing.${key}Tagline`)}</p>
                <p className="mt-6 flex items-baseline gap-1.5">
                  <span className="text-4xl font-extrabold tracking-tight">
                    {t(`pricing.${key}Price`)}
                  </span>
                  <span className="text-muted-foreground">{t(`pricing.${key}Period`)}</span>
                </p>
                <ul className="mt-6 flex flex-col gap-3 text-sm">
                  {Array.from({ length: features }, (_, n) => (
                    <li key={n} className="flex gap-2.5">
                      <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span>{t(`pricing.${key}${n + 1}`)}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-8">
                  <Link
                    href={href}
                    data-testid={featured ? 'landing-pricing-cta' : undefined}
                    className={cn(
                      buttonVariants({ size: 'lg', variant: featured ? 'default' : 'outline' }),
                      'h-11 w-full text-base font-semibold',
                    )}
                  >
                    {t(cta)}
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <p
          className="reveal-item mt-8 text-center text-sm text-balance text-muted-foreground"
          style={{ '--i': PLANS.length } as CSSProperties}
        >
          {t('pricing.note')}
        </p>
      </Reveal>
    </section>
  );
}
