import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { OwnWidget } from '@/components/marketing/own-widget';
import { Button } from '@/components/ui/button';

export default async function LandingPage() {
  const t = await getTranslations('landing');
  const section = 'mx-auto max-w-5xl px-6 py-16';
  return (
    <>
      <section className={`${section} text-center`}>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
          {t('heroTitle')}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">{t('heroBody')}</p>
        <div className="mt-8 flex justify-center gap-3">
          <Button
            size="lg"
            data-testid="landing-cta"
            nativeButton={false}
            render={<Link href="/login" />}
          >
            {t('startFree')}
          </Button>
          <Button size="lg" variant="outline" nativeButton={false} render={<a href="#how" />}>
            {t('howItWorks')}
          </Button>
        </div>
      </section>

      <section id="how" className={section}>
        <h2 className="text-2xl font-semibold">{t('stepsTitle')}</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-3">
          {(['step1', 'step2', 'step3'] as const).map((key, i) => (
            <li key={key} className="rounded-lg border p-4">
              <span className="text-sm font-semibold text-primary">{i + 1}</span>
              <p className="mt-2">{t(key)}</p>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm text-muted-foreground">{t('tryIt')}</p>
      </section>

      <section className={section}>
        <h2 className="text-2xl font-semibold">{t('whyTitle')}</h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {(['whySize', 'whyInstant', 'whyPrivacy', 'whyPrice'] as const).map((key) => (
            <li key={key} className="rounded-lg border p-4">
              {t(key)}
            </li>
          ))}
        </ul>
      </section>

      <section className={section} data-testid="landing-pricing">
        <h2 className="text-2xl font-semibold">{t('pricingTitle')}</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {(
            [
              ['planFree', 'planFreeBody'],
              ['planPro', 'planProBody'],
              ['planLifetime', 'planLifetimeBody'],
            ] as const
          ).map(([title, body]) => (
            <div key={title} className="flex flex-col gap-2 rounded-lg border p-5">
              <h3 className="font-semibold">{t(title)}</h3>
              <p className="text-sm text-muted-foreground">{t(body)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={section}>
        <h2 className="text-2xl font-semibold">{t('faqTitle')}</h2>
        <dl className="mt-6 flex flex-col gap-4">
          {(['faq1', 'faq2', 'faq3'] as const).map((key) => (
            <div key={key}>
              <dt className="font-medium">{t(`${key}q`)}</dt>
              <dd className="text-muted-foreground">{t(`${key}a`)}</dd>
            </div>
          ))}
        </dl>
      </section>
      <OwnWidget />
    </>
  );
}
