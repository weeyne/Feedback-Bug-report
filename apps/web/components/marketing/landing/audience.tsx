import type { CSSProperties } from 'react';
import { Brush, Code2, ShoppingBag } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { cn } from 'cn';
import { Reveal } from '../reveal';
import { CARD, CONTAINER, SectionHeading } from './section';

const AUDIENCES = [
  { key: 'dev', icon: Code2 },
  { key: 'shop', icon: ShoppingBag },
  { key: 'studio', icon: Brush },
] as const;

export async function Audience() {
  const t = await getTranslations('landing.audience');
  return (
    <section aria-labelledby="audience-title" className={cn(CONTAINER, 'py-20')}>
      <SectionHeading id="audience-title" title={t('title')} subtitle={t('subtitle')} />
      <Reveal stagger className="mt-12">
        <ul className="grid gap-4 md:grid-cols-3 lg:gap-5">
          {AUDIENCES.map(({ key, icon: Icon }, i) => (
            <li key={key} className="reveal-item" style={{ '--i': i } as CSSProperties}>
              <div className={cn(CARD, 'flex h-full flex-col gap-3 p-6')}>
                <span className="grid size-10 place-items-center rounded-xl bg-secondary text-foreground">
                  <Icon aria-hidden className="size-5" />
                </span>
                <h3 className="mt-2 text-lg font-extrabold tracking-tight">{t(`${key}Title`)}</h3>
                <p className="text-pretty text-muted-foreground">{t(`${key}Body`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}
