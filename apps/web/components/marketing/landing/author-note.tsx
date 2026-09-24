import { Quote } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { cn } from 'cn';
import { LadybugMark } from '@/components/brand/logo';
import { Reveal } from '../reveal';
import { CONTAINER } from './section';

/** A short, honest note from the developer (no testimonials until real ones exist). */
export async function AuthorNote({ hasOwnWidget }: { hasOwnWidget: boolean }) {
  const t = await getTranslations('landing.author');
  return (
    <section aria-labelledby="author-title" className={cn(CONTAINER, 'py-20')}>
      <Reveal className="mx-auto max-w-3xl">
        <figure className="relative rounded-3xl border bg-card p-6 sm:p-10">
          <Quote
            aria-hidden
            className="absolute top-6 right-6 size-10 text-primary/20 sm:top-10 sm:right-10"
          />
          <h2 id="author-title" className="text-sm font-bold tracking-wide text-primary uppercase">
            {t('title')}
          </h2>
          <blockquote className="mt-4 flex flex-col gap-4 text-lg text-pretty sm:text-xl">
            <p>{t('body1')}</p>
            <p>{t('body2')}</p>
          </blockquote>
          {hasOwnWidget ? (
            <p className="mt-4 text-pretty text-muted-foreground">{t('tryWidget')}</p>
          ) : null}
          <figcaption className="mt-8 flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-full border bg-secondary">
              <LadybugMark size={30} />
            </span>
            <span className="font-bold">{t('signature')}</span>
          </figcaption>
        </figure>
      </Reveal>
    </section>
  );
}
