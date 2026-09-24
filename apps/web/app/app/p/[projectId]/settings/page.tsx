import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/app/page-header';
import { DeleteProject } from '@/components/app/settings/delete-project';
import { SettingsForm } from '@/components/app/settings/settings-form';
import { requireUser } from '@/lib/auth/session';
import { getRequestProject } from '@/lib/dashboard/request-project';
import { isPro } from '@/lib/dashboard/settings';
import { getDeps } from '@/lib/deps';

export default async function SettingsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser();
  const { projectId } = await params;
  const deps = await getDeps();
  const [project, pro, t] = await Promise.all([
    getRequestProject(user.id, projectId),
    isPro(deps, user.id),
    getTranslations('settings'),
  ]);
  if (!project) notFound();
  // `widget_seen_at` is not a setting: leave it out of the key so a fresh "seen" timestamp
  // never resets the form while the owner is editing it.
  const { widget_seen_at: _seen, ...settings } = project;
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4 md:p-6">
      <PageHeader title={t('title')} description={t('description')} />
      <SettingsForm
        key={JSON.stringify(settings)}
        project={project}
        pro={pro}
        appUrl={deps.env.NEXT_PUBLIC_APP_URL}
      />
      <DeleteProject projectId={project.id} name={project.name} index={4} />
    </div>
  );
}
