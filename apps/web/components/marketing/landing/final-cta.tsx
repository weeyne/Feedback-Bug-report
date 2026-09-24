import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { cn } from 'cn';
import { buttonVariants } from '@/components/ui/button';
import { Reveal } from '../reveal';
import { CONTAINER } from './section';

export async function FinalCta() {
  const t = await getTranslations('landing');
  return (
    <section
      aria-labelledby="cta-title"
      className="relative isolate overflow-clip bg-primary text-primary-foreground"
    >
      {/* The login page's dot grid, in the foreground colour, faded towards the edges. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(currentColor_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_60%_80%_at_50%_50%,#000,transparent)] bg-size-[18px_18px] opacity-20"
      />
      <Reveal className={cn(CONTAINER, 'flex flex-col items-center py-20 text-center')}>
        <h2
          id="cta-title"
          className="text-3xl font-extrabold tracking-tight text-balance sm:text-5xl"
        >
          {t('cta.title')}
        </h2>
        <p className="mt-4 max-w-xl text-lg text-pretty opacity-90">{t('cta.body')}</p>
        <Link
          href="/login"
          className={cn(
            buttonVariants({ size: 'lg' }),
            'mt-8 h-12 bg-primary-foreground px-7 text-base font-bold text-primary shadow-lg hover:bg-primary-foreground/90',
          )}
        >
          {t('startFree')}
          <ArrowRight aria-hidden data-icon="inline-end" />
        </Link>
      </Reveal>
    </section>
  );
}
