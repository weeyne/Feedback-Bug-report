import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Checklist } from '@/components/app/overview/checklist';
import { Connections } from '@/components/app/overview/connections';
import { FeedbackChart } from '@/components/app/overview/feedback-chart';
import { RecentFeedback } from '@/components/app/overview/recent-feedback';
import { StatCards } from '@/components/app/overview/stat-cards';
import { requireUser } from '@/lib/auth/session';
import { getOverview } from '@/lib/dashboard/overview';
import { getRequestProject } from '@/lib/dashboard/request-project';
import { getDeps } from '@/lib/deps';

export default async function OverviewPage({ params }: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser();
  const { projectId } = await params;
  const deps = await getDeps();
  const t = await getTranslations('overview');

  const [overview, project] = await Promise.all([
    getOverview(deps, user.id, projectId),
    getRequestProject(user.id, projectId),
  ]);
  if (!overview || !project) notFound();

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight">{t('title')}</h1>
        <p className="truncate text-sm text-muted-foreground">{project.name}</p>
      </header>
      <Checklist projectId={projectId} state={overview.checklist} />
      <StatCards counts={overview.counts} usage={overview.usage} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <FeedbackChart series={overview.series} />
        <RecentFeedback
          projectId={projectId}
          items={overview.recent}
          widgetSeen={overview.checklist.widgetSeen}
        />
      </div>
      <Connections
        projectId={projectId}
        widgetSeenAt={overview.widgetSeenAt}
        integrations={overview.integrations}
      />
    </div>
  );
}
