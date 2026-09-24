import Link from 'next/link';
import { ArrowDown, ArrowRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { cn } from 'cn';
import { buttonVariants } from '@/components/ui/button';
import { DemoStage } from '../demo/demo-stage';
import { CONTAINER } from './section';

export async function Hero({ appUrl }: { appUrl: string }) {
  const t = await getTranslations('landing');
  return (
    <section id="top" className="relative isolate overflow-clip">
      {/* Decoration only: the login page's dot grid, faded out, under a soft coral glow. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[46rem] bg-[radial-gradient(var(--input)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_70%_75%_at_50%_0%,#000_35%,transparent_100%)] bg-size-[18px_18px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[40rem] bg-[radial-gradient(ellipse_55%_60%_at_50%_0%,color-mix(in_oklab,var(--primary)_16%,transparent),transparent_75%)]"
      />
      <div
        className={cn(
          CONTAINER,
          'flex flex-col items-center pt-14 pb-12 text-center sm:pt-24 sm:pb-16',
        )}
      >
        <a
          href="#features"
          className="animate-fade inline-flex max-w-full items-center gap-2 rounded-full border bg-card/80 py-1 pr-3 pl-1 text-sm font-medium shadow-sm transition-colors duration-200 hover:border-primary/40"
        >
          <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
            {t('hero.badgeNew')}
          </span>
          <span className="truncate">{t('hero.badge')}</span>
          <ArrowRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        </a>
        <h1 className="mt-6 max-w-4xl text-4xl font-extrabold tracking-tight text-balance sm:text-6xl">
          {t.rich('hero.title', {
            em: (chunks) => <em className="text-primary not-italic">{chunks}</em>,
          })}
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-pretty text-muted-foreground sm:text-xl">
          {t('hero.subtitle')}
        </p>
        <div className="mt-8 flex w-full flex-col items-stretch justify-center gap-3 sm:w-auto sm:flex-row sm:items-center">
          <Link
            href="/login"
            data-testid="landing-cta"
            className={cn(buttonVariants({ size: 'lg' }), 'h-11 px-6 text-base font-semibold')}
          >
            {t('startFree')}
            <ArrowRight aria-hidden data-icon="inline-end" />
          </Link>
          <a
            href="#demo"
            className={cn(
              buttonVariants({ size: 'lg', variant: 'outline' }),
              'h-11 px-6 text-base font-semibold',
            )}
          >
            {t('hero.seeHow')}
            <ArrowDown aria-hidden data-icon="inline-end" />
          </a>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">{t('hero.note')}</p>
      </div>
      <div className={cn(CONTAINER, 'pb-8')}>
        <DemoStage appUrl={appUrl} />
      </div>
    </section>
  );
}
