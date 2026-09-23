import { getTranslations } from 'next-intl/server';
import { CopyButton } from '@/components/app/copy-button';
import { FirstFeedbackWatcher } from '@/components/app/first-feedback-watcher';
import { requireUser } from '@/lib/auth/session';
import { getProject, hasFeedback } from '@/lib/dashboard/projects';
import { getDeps } from '@/lib/deps';

export default async function InstallPage({ params }: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser();
  const { projectId } = await params;
  const deps = await getDeps();
  const project = (await getProject(deps, user.id, projectId))!;
  const t = await getTranslations('install');
  const src = `${deps.env.NEXT_PUBLIC_APP_URL}/w/widget.js`;
  const snippet = `<script async src="${src}" data-project-id="${project.public_key}"></script>`;
  const nextSnippet = `import Script from 'next/script';\n\n<Script src="${src}" data-project-id="${project.public_key}" strategy="afterInteractive" />`;
  const Block = ({ code, testId }: { code: string; testId?: string }) => (
    <div className="relative rounded-md border bg-muted p-3">
      <pre className="overflow-x-auto pr-20 text-xs" data-testid={testId}>
        {code}
      </pre>
      <div className="absolute right-2 top-2">
        <CopyButton text={code} />
      </div>
    </div>
  );
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p>{t('intro')}</p>
      <Block code={snippet} testId="install-snippet" />
      <FirstFeedbackWatcher
        projectId={project.id}
        initial={await hasFeedback(deps, user.id, project.id)}
      />
      <section className="flex flex-col gap-2">
        <h2 className="font-medium">{t('nextjsTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('nextjsHint')}</p>
        <Block code={nextSnippet} />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="font-medium">{t('customTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('customHint')}</p>
        <Block
          code={`<script async src="${src}" data-project-id="${project.public_key}" data-hide-trigger></script>\n<button onclick="Bugping.open('bug')">Report a bug</button>`}
        />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="font-medium">{t('identifyTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('identifyHint')}</p>
        <Block code={`Bugping.identify({ email: user.email, id: user.id, name: user.name });`} />
      </section>
    </div>
  );
}
