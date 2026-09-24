import Link from 'next/link';
import type { CSSProperties } from 'react';
import { Lock } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { LadybugMark } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { requireUser } from '@/lib/auth/session';
import { canCreateProject, listProjects } from '@/lib/dashboard/projects';
import { getDeps } from '@/lib/deps';
import { NewProjectForm } from './new-project-form';

export default async function NewProjectPage() {
  const user = await requireUser();
  const deps = await getDeps();
  const [t, allowed, projects] = await Promise.all([
    getTranslations('projects'),
    canCreateProject(deps, user.id),
    listProjects(deps, user.id),
  ]);
  const first = projects.length === 0;
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 p-4 md:p-6">
      {first ? (
        <header
          className="animate-enter flex flex-col items-center gap-3 pt-4 text-center md:pt-8"
          style={{ '--i': 0 } as CSSProperties}
          data-testid="new-project-welcome"
        >
          <span className="grid size-16 place-items-center rounded-2xl bg-primary/10 text-foreground">
            <LadybugMark size={40} />
          </span>
          <h1 className="text-2xl font-extrabold tracking-tight">{t('firstTitle')}</h1>
          <p className="max-w-sm text-sm text-muted-foreground">{t('welcome')}</p>
        </header>
      ) : (
        <PageHeader title={t('newTitle')} description={t('newDescription')} />
      )}
      {allowed ? (
        <SectionCard index={1}>
          <NewProjectForm />
        </SectionCard>
      ) : (
        <SectionCard index={1} data-testid="project-limit">
          <div className="flex items-start gap-3">
            <span
              className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
              aria-hidden
            >
              <Lock className="size-4" />
            </span>
            <p className="text-sm">{t('limitReached')}</p>
          </div>
          <Button
            className="self-start font-semibold"
            nativeButton={false}
            render={<Link href="/app/billing" />}
          >
            {t('upgrade')}
          </Button>
        </SectionCard>
      )}
    </div>
  );
}
