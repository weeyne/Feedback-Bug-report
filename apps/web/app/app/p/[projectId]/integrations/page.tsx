import { getTranslations } from 'next-intl/server';
import { IntegrationsPanel } from '@/components/app/integrations/integrations-panel';
import { requireUser } from '@/lib/auth/session';
import { integrationStatus } from '@/lib/dashboard/integrations';
import { isPro } from '@/lib/dashboard/settings';
import { getDeps } from '@/lib/deps';

export default async function IntegrationsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const user = await requireUser();
  const { projectId } = await params;
  const deps = await getDeps();
  const t = await getTranslations('integrations');
  const [initial, pro] = await Promise.all([
    integrationStatus(deps, user.id, projectId),
    isPro(deps, user.id),
  ]);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <IntegrationsPanel
        projectId={projectId}
        bot={deps.env.TELEGRAM_BOT_USERNAME}
        pro={pro}
        initial={initial ?? []}
      />
    </div>
  );
}
