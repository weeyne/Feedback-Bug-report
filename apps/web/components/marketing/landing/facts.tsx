import type { CSSProperties } from 'react';
import { getTranslations } from 'next-intl/server';
import { cn } from 'cn';
import { Reveal } from '../reveal';
import { CONTAINER } from './section';

/** Plain names only: no third-party logos. */
const PLATFORMS = ['HTML', 'React', 'Vue', 'WordPress', 'Shopify', 'Tilda'] as const;

const FACTS = [
  ['sizeValue', 'sizeLabel'],
  ['setupValue', 'setupLabel'],
  ['chatValue', 'chatLabel'],
  ['freeValue', 'freeLabel'],
] as const;

export async function Facts() {
  const t = await getTranslations('landing.facts');
  return (
    <section aria-label={t('label')} className={cn(CONTAINER, 'py-12')}>
      <Reveal stagger>
        <dl className="reveal-item grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border lg:grid-cols-4">
          {FACTS.map(([value, label]) => (
            <div key={value} className="flex flex-col-reverse justify-end gap-1 bg-card p-5 sm:p-6">
              <dt className="text-sm text-muted-foreground">{t(label)}</dt>
              <dd className="text-xl font-extrabold tracking-tight sm:text-2xl">{t(value)}</dd>
            </div>
          ))}
        </dl>
        <div
          className="reveal-item mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-center text-sm text-muted-foreground"
          style={{ '--i': 1 } as CSSProperties}
        >
          <span>{t('worksOn')}</span>
          <ul className="flex flex-wrap justify-center gap-2">
            {PLATFORMS.map((name) => (
              <li
                key={name}
                className="rounded-full border bg-card px-2.5 py-0.5 text-xs font-semibold text-foreground"
              >
                {name}
              </li>
            ))}
          </ul>
        </div>
      </Reveal>
    </section>
  );
}
