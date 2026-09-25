import { Archive, Bug, CircleCheck, CircleDashed, ListFilter } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { AutoRefresh } from '@/components/app/auto-refresh';
import { EmptyState, type EmptyStateProps } from '@/components/app/empty-state';
import { FeedbackDetailPanel } from '@/components/app/feedback/feedback-detail';
import { FeedLayout } from '@/components/app/feedback/feed-layout';
import { feedHref } from '@/components/app/feedback/feedback-filters';
import { FeedbackList } from '@/components/app/feedback/feedback-list';
import { requireUser } from '@/lib/auth/session';
import { feedEmptyKind, type FeedEmptyKind } from '@/lib/dashboard/feed-view';
import {
  decodeCursor,
  encodeCursor,
  getFeedback,
  hiddenFeedbackCount,
  listFeedback,
  screenshotUrl,
  statusCounts,
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
  const tEmpty = await getTranslations('empty');
  const locale = await getLocale();

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

  const [{ items, nextCursor }, hidden, plan, counts] = await Promise.all([
    listFeedback(deps, user.id, { projectId, type, status, cursor }),
    hiddenFeedbackCount(deps, user.id, projectId),
    usage(deps, user.id),
    statusCounts(deps, user.id, projectId),
  ]);
  const selectedRaw = query.f ? await getFeedback(deps, user.id, query.f) : null;
  // getFeedback scopes by owner (RLS), not by project: a feedback id from a different
  // project of the same owner would otherwise open here and be actionable. Treat a
  // cross-project id as not found.
  const selected = selectedRaw && selectedRaw.project_id === projectId ? selectedRaw : null;
  const screenshot = selected?.has_screenshot
    ? await screenshotUrl(deps, user.id, selected.id)
    : null;

  const shownHidden = status === 'new' && !type && !cursor ? hidden : 0;
  // statusCounts sees exactly the rows `hasFeedback` would (both run as the user under RLS),
  // so their sum answers "does this project have any feedback" without another query.
  const hasFeedback = counts.new + counts.resolved + counts.archived > 0;
  const empty: Record<FeedEmptyKind, EmptyStateProps> = {
    quiet: {
      icon: <Bug />,
      title: tEmpty('quietTitle'),
      body: tEmpty('quietBody'),
      action: { href: `/app/p/${projectId}/install`, label: tEmpty('installCta') },
    },
    caughtUp: {
      icon: <CircleCheck />,
      title: tEmpty('caughtUpTitle'),
      body: tEmpty('caughtUpBody'),
      action: {
        href: feedHref(base, 'resolved'),
        label: tEmpty('openResolved'),
        variant: 'outline',
      },
    },
    noneResolved: { icon: <CircleDashed />, title: tEmpty('noneResolved') },
    noneArchived: { icon: <Archive />, title: tEmpty('noneArchived') },
    noneOfType: {
      icon: <ListFilter />,
      title: tEmpty('noneOfType', {
        type: type ? t(`types_${type}`).toLocaleLowerCase(locale) : '',
      }),
      action: { href: feedHref(base, status), label: tEmpty('clearFilter'), variant: 'outline' },
    },
  };

  return (
    <FeedLayout
      base={base}
      type={type}
      status={status}
      counts={counts}
      usage={plan}
      refresh={<AutoRefresh intervalMs={30_000} />}
      detail={
        selected && (
          <FeedbackDetailPanel
            key={selected.id}
            feedback={selected}
            screenshot={screenshot}
            closeHref={keep({ f: undefined })}
          />
        )
      }
    >
      {items.length === 0 && shownHidden === 0 ? (
        <div data-testid="feedback-empty" className="py-8">
          <EmptyState {...empty[feedEmptyKind({ hasFeedback, status, type })]} />
        </div>
      ) : (
        <FeedbackList
          items={items}
          hidden={shownHidden}
          selectedId={selected?.id}
          hrefFor={(id) => keep({ f: id })}
          loadMoreHref={
            nextCursor ? keep({ before: encodeCursor(nextCursor), f: undefined }) : null
          }
        />
      )}
    </FeedLayout>
  );
}
