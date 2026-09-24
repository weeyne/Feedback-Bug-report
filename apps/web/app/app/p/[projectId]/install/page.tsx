import { notFound } from 'next/navigation';
import type { CSSProperties, ReactNode } from 'react';
import { getFormatter, getTranslations } from 'next-intl/server';
import { cn } from 'cn';
import { CopyButton } from '@/components/app/copy-button';
import { FirstFeedbackWatcher } from '@/components/app/first-feedback-watcher';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { requireUser } from '@/lib/auth/session';
import { hasFeedback } from '@/lib/dashboard/projects';
import { getRequestProject } from '@/lib/dashboard/request-project';
import { getDeps } from '@/lib/deps';

/** Code sample in a dark block (dark in both themes on purpose) with a copy button. */
function CodeBlock({ code, label, testId }: { code: string; label: string; testId?: string }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg bg-zinc-950 font-mono text-zinc-100">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 py-1 pr-1 pl-3">
        <span className="text-[11px] tracking-wide text-zinc-400 uppercase">{label}</span>
        <CopyButton text={code} />
      </div>
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed" data-testid={testId}>
        {code}
      </pre>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: ReactNode; children: ReactNode }) {
  return (
    <li
      className="animate-enter flex min-w-0 gap-3"
      style={{ '--i': n } as CSSProperties}
      data-testid={`install-step-${n}`}
    >
      <span
        className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-extrabold text-primary-foreground"
        aria-hidden
      >
        {n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
        <h3 className="text-sm font-bold">{title}</h3>
        {children}
      </div>
    </li>
  );
}

export default async function InstallPage({ params }: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser();
  const { projectId } = await params;
  const deps = await getDeps();
  const project = await getRequestProject(user.id, projectId);
  if (!project) notFound();
  const [t, format, received] = await Promise.all([
    getTranslations('install'),
    getFormatter(),
    hasFeedback(deps, user.id, project.id),
  ]);
  const src = `${deps.env.NEXT_PUBLIC_APP_URL}/w/widget.js`;
  const snippet = `<script async src="${src}" data-project-id="${project.public_key}"></script>`;
  const nextSnippet = `import Script from 'next/script';\n\n<Script src="${src}" data-project-id="${project.public_key}" strategy="afterInteractive" />`;
  const seenAt = project.widget_seen_at;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 md:p-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        aside={
          <p
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
              seenAt
                ? 'border-green-600/25 bg-green-600/5 text-green-700 dark:border-green-400/25 dark:bg-green-400/10 dark:text-green-400'
                : 'bg-card text-muted-foreground',
            )}
            data-testid="install-widget-status"
            data-seen={seenAt !== null}
          >
            <span
              className={cn(
                'size-1.5 shrink-0 rounded-full',
                seenAt ? 'bg-green-600 dark:bg-green-400' : 'border border-muted-foreground/60',
              )}
              aria-hidden
            />
            {seenAt ? t('seen', { time: format.relativeTime(new Date(seenAt)) }) : t('notSeen')}
          </p>
        }
      />

      <SectionCard index={0}>
        <ol className="flex flex-col gap-6">
          <Step n={1} title={t('step1Title')}>
            <CodeBlock code={snippet} label="HTML" testId="install-snippet" />
          </Step>
          <Step n={2} title={t('step2Title')}>
            <p className="text-sm text-muted-foreground">{t('step2Hint')}</p>
          </Step>
          <Step n={3} title={t('step3Title')}>
            <p className="text-sm text-muted-foreground">{t('step3Hint')}</p>
            <FirstFeedbackWatcher projectId={project.id} initial={received} />
          </Step>
        </ol>
      </SectionCard>

      <SectionCard index={1} title={t('nextjsTitle')} description={t('nextjsHint')}>
        <CodeBlock code={nextSnippet} label="Next.js" />
      </SectionCard>
      <SectionCard index={2} title={t('customTitle')} description={t('customHint')}>
        <CodeBlock
          label="HTML"
          code={`<script async src="${src}" data-project-id="${project.public_key}" data-hide-trigger></script>\n<button onclick="Bugping.open('bug')">Report a bug</button>`}
        />
      </SectionCard>
      <SectionCard index={3} title={t('identifyTitle')} description={t('identifyHint')}>
        <CodeBlock
          label="JavaScript"
          code={`Bugping.identify({ email: user.email, id: user.id, name: user.name });`}
        />
      </SectionCard>
    </div>
  );
}
