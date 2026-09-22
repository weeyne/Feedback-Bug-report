import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireUser } from '@/lib/auth/session';
import { canCreateProject } from '@/lib/dashboard/projects';
import { getDeps } from '@/lib/deps';
import { NewProjectForm } from './new-project-form';

export default async function NewProjectPage() {
  const user = await requireUser();
  const t = await getTranslations('projects');
  const allowed = await canCreateProject(await getDeps(), user.id);
  return (
    <div className="mx-auto max-w-lg p-6">
      <h1 className="mb-6 text-2xl font-semibold">{t('newTitle')}</h1>
      {allowed ? (
        <NewProjectForm />
      ) : (
        <div className="rounded-lg border p-4" data-testid="project-limit">
          <p>{t('limitReached')}</p>
          <Link href="/app/billing" className="mt-3 inline-block underline">
            {t('upgrade')}
          </Link>
        </div>
      )}
    </div>
  );
}
