import type { CSSProperties, ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { cn } from 'cn';
import { CopyButton } from '@/components/app/copy-button';
import { installSnippet } from '@/lib/widget/snippet';
import { Reveal } from '../reveal';
import { CARD, CONTAINER, SectionHeading } from './section';

/** The placeholder key shown in the landing's snippet (the real one is on the Install page). */
export const PLACEHOLDER_KEY = 'pk_your_project_key';

function Step({
  n,
  title,
  body,
  children,
}: {
  n: number;
  title: string;
  body: ReactNode;
  children?: ReactNode;
}) {
  return (
    <li className="reveal-item min-w-0" style={{ '--i': n - 1 } as CSSProperties}>
      <div className={cn(CARD, 'flex h-full flex-col gap-3 p-6')}>
        <span
          aria-hidden
          className="grid size-9 place-items-center rounded-full bg-primary text-sm font-extrabold text-primary-foreground"
        >
          {n}
        </span>
        <h3 className="mt-1 text-lg font-extrabold tracking-tight">{title}</h3>
        <p className="text-pretty text-muted-foreground">{body}</p>
        {children}
      </div>
    </li>
  );
}

export async function HowItWorks({ appUrl }: { appUrl: string }) {
  const t = await getTranslations('landing.how');
  const snippet = installSnippet(appUrl, PLACEHOLDER_KEY);
  return (
    <section id="how" aria-labelledby="how-title" className="border-y bg-muted/40">
      <div className={cn(CONTAINER, 'py-20')}>
        <SectionHeading id="how-title" title={t('title')} subtitle={t('subtitle')} />
        <Reveal stagger className="mt-12">
          <ol className="grid gap-4 lg:grid-cols-3 lg:gap-5">
            <Step n={1} title={t('step1Title')} body={t('step1Body')} />
            <Step n={2} title={t('step2Title')} body={t('step2Body')}>
              <div className="mt-2 min-w-0 overflow-hidden rounded-xl bg-zinc-950 font-mono text-zinc-100 dark:ring-1 dark:ring-white/10">
                <div className="flex items-center justify-between gap-3 border-b border-white/10 py-1 pr-1 pl-3">
                  <span className="text-[11px] tracking-wide text-zinc-400 uppercase">HTML</span>
                  <CopyButton text={snippet} testId="landing-snippet-copy" />
                </div>
                <pre
                  data-testid="landing-snippet"
                  className="p-3 text-xs leading-relaxed break-all whitespace-pre-wrap"
                >
                  {snippet}
                </pre>
              </div>
            </Step>
            <Step n={3} title={t('step3Title')} body={t('step3Body')} />
          </ol>
        </Reveal>
      </div>
    </section>
  );
}
