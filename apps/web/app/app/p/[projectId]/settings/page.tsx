import { getTranslations } from 'next-intl/server';
import { DeleteProject } from '@/components/app/settings/delete-project';
import { SettingsForm } from '@/components/app/settings/settings-form';
import { requireUser } from '@/lib/auth/session';
import { getProject } from '@/lib/dashboard/projects';
import { isPro } from '@/lib/dashboard/settings';
import { getDeps } from '@/lib/deps';

export default async function SettingsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser();
  const { projectId } = await params;
  const deps = await getDeps();
  const project = (await getProject(deps, user.id, projectId))!;
  const t = await getTranslations('settings');
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 p-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <SettingsForm
        key={JSON.stringify(project)}
        project={project}
        pro={await isPro(deps, user.id)}
        appUrl={deps.env.NEXT_PUBLIC_APP_URL}
      />
      <DeleteProject projectId={project.id} name={project.name} />
    </div>
  );
}
