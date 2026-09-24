import type { CSSProperties, ReactNode } from 'react';
import {
  Feather,
  LayoutList,
  type LucideIcon,
  MessageSquareText,
  Palette,
  ScanSearch,
  SquareDashedMousePointer,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { cn } from 'cn';
import { Reveal } from '../reveal';
import { BrandArt, ChatArt, ContextArt, DashboardArt, ShotArt, SizeArt } from './feature-art';
import { CARD, CONTAINER, SectionHeading } from './section';

function Tile({
  icon: Icon,
  title,
  body,
  art,
  index,
  large = false,
  className,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  art: ReactNode;
  index: number;
  large?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('reveal-item', className)} style={{ '--i': index } as CSSProperties}>
      <article className={cn(CARD, 'flex h-full flex-col gap-6 p-6', large && 'sm:p-8')}>
        <div className="flex flex-col gap-2">
          <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <Icon aria-hidden className="size-5" />
          </span>
          <h3 className={cn('mt-2 font-extrabold tracking-tight', large ? 'text-2xl' : 'text-lg')}>
            {title}
          </h3>
          <p className={cn('text-pretty text-muted-foreground', large && 'max-w-xl sm:text-lg')}>
            {body}
          </p>
        </div>
        <div className={cn('flex flex-1 flex-col', large ? 'justify-center' : 'justify-end')}>
          {art}
        </div>
      </article>
    </div>
  );
}

export async function Features() {
  const [t, facts, f] = await Promise.all([
    getTranslations('landing.features'),
    getTranslations('landing.facts'),
    getTranslations('feedback'),
  ]);
  return (
    <section id="features" aria-labelledby="features-title" className={cn(CONTAINER, 'py-20')}>
      <SectionHeading id="features-title" title={t('title')} subtitle={t('subtitle')} />
      <Reveal stagger className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
        <Tile
          index={0}
          large
          className="sm:col-span-2 lg:row-span-2"
          icon={SquareDashedMousePointer}
          title={t('shot.title')}
          body={t('shot.body')}
          art={<ShotArt />}
        />
        <Tile
          index={1}
          icon={MessageSquareText}
          title={t('chat.title')}
          body={t('chat.body')}
          art={<ChatArt />}
        />
        <Tile
          index={2}
          icon={ScanSearch}
          title={t('context.title')}
          body={t('context.body')}
          art={<ContextArt labels={{ page: f('page'), browser: f('browser'), os: f('os') }} />}
        />
        <Tile
          index={3}
          icon={LayoutList}
          title={t('dashboard.title')}
          body={t('dashboard.body')}
          art={
            <DashboardArt
              statuses={[f('status_new'), f('status_resolved'), f('status_archived')]}
              types={[f('type_bug'), f('type_idea')]}
            />
          }
        />
        <Tile
          index={4}
          icon={Feather}
          title={t('light.title')}
          body={t('light.body')}
          art={<SizeArt size={facts('sizeValue')} onDemand={t('light.onDemand')} />}
        />
        <Tile
          index={5}
          className="sm:col-span-2 lg:col-span-1"
          icon={Palette}
          title={t('brand.title')}
          body={t('brand.body')}
          art={<BrandArt trigger={t('brand.trigger')} />}
        />
      </Reveal>
    </section>
  );
}
