import type { CSSProperties } from 'react';
import { ChevronDown } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { cn } from 'cn';
import { Reveal } from '../reveal';
import { CONTAINER, SectionHeading } from './section';

const QUESTIONS = [1, 2, 3, 4, 5, 6, 7] as const;

/** Native `<details>` accordion: works without JS; only the chevron animates. */
export async function Faq({ hasOwnWidget }: { hasOwnWidget: boolean }) {
  const t = await getTranslations('landing.faq');
  return (
    <section
      id="faq"
      aria-labelledby="faq-title"
      data-testid="landing-faq"
      className={cn(CONTAINER, 'py-20')}
    >
      <div className="grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-16">
        <SectionHeading
          id="faq-title"
          align="start"
          className="lg:sticky lg:top-24 lg:self-start"
          title={t('title')}
          subtitle={hasOwnWidget ? t('subtitle') : t('subtitleNoWidget')}
        />
        <Reveal stagger className="flex flex-col gap-3">
          {QUESTIONS.map((n, i) => (
            <details
              key={n}
              className="reveal-item group rounded-2xl border bg-card open:shadow-sm"
              style={{ '--i': i } as CSSProperties}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-5 py-4 text-left font-bold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                {t(`q${n}`)}
                <ChevronDown
                  aria-hidden
                  className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
                />
              </summary>
              <p className="px-5 pb-5 text-pretty text-muted-foreground">{t(`a${n}`)}</p>
            </details>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
