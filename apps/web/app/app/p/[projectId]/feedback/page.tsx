import { getTranslations } from 'next-intl/server';
import { AutoRefresh } from '@/components/app/auto-refresh';
import { FeedbackDetailPanel } from '@/components/app/feedback/feedback-detail';
import { FeedbackFilters } from '@/components/app/feedback/feedback-filters';
import { FeedbackList } from '@/components/app/feedback/feedback-list';
import { UsageBar } from '@/components/app/usage-bar';
import { requireUser } from '@/lib/auth/session';
import {
  decodeCursor,
  encodeCursor,
  getFeedback,
  hiddenFeedbackCount,
  listFeedback,
  screenshotUrl,
  usage,
  type FeedbackStatus,
} from '@/lib/dashboard/feedback';
import { getDeps } from '@/lib/deps';

const TYPES = ['bug', 'idea', 'general'] as const;
const STATUSES = ['new', 'resolved', 'archived'] as const;

export default async function FeedbackPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  const { projectId } = await params;
  const query = await searchParams;
  const deps = await getDeps();
  const t = await getTranslations('feedback');

  const type = TYPES.find((v) => v === query.type);
  const status: FeedbackStatus = STATUSES.find((v) => v === query.status) ?? 'new';
  const cursor = decodeCursor(query.before);
  const base = `/app/p/${projectId}/feedback`;
  const keep = (extra: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    if (type) next.set('type', type);
    next.set('status', status);
    if (query.before) next.set('before', query.before);
    for (const [k, v] of Object.entries(extra)) v === undefined ? next.delete(k) : next.set(k, v);
    return `${base}?${next.toString()}`;
  };

  const [{ items, nextCursor }, hidden, plan] = await Promise.all([
    listFeedback(deps, user.id, { projectId, type, status, cursor }),
    hiddenFeedbackCount(deps, user.id, projectId),
    usage(deps, user.id),
  ]);
  const selectedRaw = query.f ? await getFeedback(deps, user.id, query.f) : null;
  // getFeedback scopes by owner (RLS), not by project: a feedback id from a different
  // project of the same owner would otherwise open here and be actionable. Treat a
  // cross-project id as not found.
  const selected = selectedRaw && selectedRaw.project_id === projectId ? selectedRaw : null;
  const screenshot = selected?.has_screenshot
    ? await screenshotUrl(deps, user.id, selected.id)
    : null;

  return (
    <div className="flex min-h-full">
      <section className="min-w-0 flex-1">
        <header className="flex flex-col gap-3 border-b p-4">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl font-semibold">{t('title')}</h1>
            <AutoRefresh intervalMs={30_000} />
          </div>
          <FeedbackFilters base={base} type={type} status={status} />
          <UsageBar used={plan.used} limit={plan.limit} />
        </header>
        <FeedbackList
          items={items}
          hidden={status === 'new' && !type && !cursor ? hidden : 0}
          selectedId={selected?.id}
          hrefFor={(id) => keep({ f: id })}
          loadMoreHref={
            nextCursor ? keep({ before: encodeCursor(nextCursor), f: undefined }) : null
          }
        />
      </section>
      {selected && (
        <FeedbackDetailPanel
          feedback={selected}
          screenshot={screenshot}
          closeHref={keep({ f: undefined })}
        />
      )}
    </div>
  );
}
