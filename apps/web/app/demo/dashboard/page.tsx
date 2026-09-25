import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getLocale, getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/app/app-shell';
import { FeedLayout } from '@/components/app/feedback/feed-layout';
import { FeedbackDetailPanel } from '@/components/app/feedback/feedback-detail';
import { FeedbackList } from '@/components/app/feedback/feedback-list';
import { LinkPrefetchProvider } from '@/components/app/link-prefetch';
import { PageEnter } from '@/components/app/page-enter';
import { DashboardBridge } from '@/components/marketing/demo/dashboard-bridge';
import {
  decodeDemoReport,
  toFeedbackDetail,
  trustedReportParam,
} from '@/components/marketing/demo/dashboard-report';
import { DEMO_PROJECT_ID } from '@/components/marketing/demo/demo-report';
import { DEMO_PROJECT_KEY, DEMO_PROJECT_NAME } from '@/components/marketing/demo/protocol';
import type { AppLocale } from '@/i18n/locale';
import { ENTITLEMENTS } from '@/lib/billing/plans';
import { describeAgent } from '@/lib/widget/user-agent';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('feedback');
  return { title: t('title'), robots: { index: false, follow: false } };
}

// Reads `?r=` and the request headers, and stamps the report with the request time.
export const dynamic = 'force-dynamic';

/**
 * Scene 1's report in a transparent 16:9 placeholder until the stage posts the real screenshot
 * (`DashboardBridge`); the aspect matches the demo store's 1280×720 frame, so nothing jumps.
 */
const SCREENSHOT_PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1280' height='720'/%3E";

const FEED_BASE = `/app/p/${DEMO_PROJECT_ID}/feedback`;

/**
 * The landing demo's scene 3: the real dashboard shell and feed components rendering the scene-1
 * report from `?r=` (see `encodeDemoReport`; invalid or missing → the fixture report) as the
 * freshly received feedback of a fixture project. `?r=` is honoured only when the landing's
 * same-origin iframe loads the page (`trustedReportParam`); a direct visit shows the fixture. No
 * session, database or API: every value comes from the query or from constants. Links keep their
 * real targets but never prefetch (`LinkPrefetchProvider`); the demo iframe is inert.
 *
 * Opened directly, the page is interactive, including the real sign-out form and the feedback
 * actions' server actions. Left as is on purpose: those actions enforce the session and project
 * ownership themselves, and the demo's fixed ids exist in no database.
 */
export default async function DemoDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const locale = (await getLocale()) as AppLocale;
  const { r } = await searchParams;
  const requestHeaders = await headers();
  const trusted = trustedReportParam(r, {
    dest: requestHeaders.get('sec-fetch-dest'),
    site: requestHeaders.get('sec-fetch-site'),
  });
  const report = decodeDemoReport(trusted, locale);
  const { item, detail } = toFeedbackDetail(report, { now: new Date(), describe: describeAgent });
  const limit = ENTITLEMENTS.free.monthlySubmissions;
  const usage = { used: 1, limit, pro: false };

  return (
    <LinkPrefetchProvider prefetch={false}>
      <AppShell
        projects={[{ id: DEMO_PROJECT_ID, name: DEMO_PROJECT_NAME, public_key: DEMO_PROJECT_KEY }]}
        email="you@example.com"
        usage={usage}
        plan="free"
        newCounts={{ [DEMO_PROJECT_ID]: 1 }}
        pathname={FEED_BASE}
      >
        <PageEnter>
          <FeedLayout
            base={FEED_BASE}
            status="new"
            counts={{ new: 1, resolved: 0, archived: 0 }}
            usage={usage}
            detail={
              <FeedbackDetailPanel
                feedback={detail}
                screenshot={SCREENSHOT_PLACEHOLDER}
                closeHref="/demo/dashboard"
              />
            }
          >
            <FeedbackList
              items={[item]}
              hidden={0}
              selectedId={item.id}
              hrefFor={(id) => `${FEED_BASE}?status=new&f=${id}`}
              loadMoreHref={null}
            />
          </FeedLayout>
        </PageEnter>
        <DashboardBridge />
      </AppShell>
    </LinkPrefetchProvider>
  );
}
