import { getDeps } from '@/lib/deps';
import { preflight } from '@/lib/http';
import { dispatchFeedback, dispatchQuotaNotice } from '@/lib/notify/dispatch';
import { handleSubmit } from '@/lib/widget/submit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Notifications run in after(): up to two 5 s attempts per channel plus a 10 s screenshot download.
export const maxDuration = 60;

export async function POST(request: Request) {
  const deps = await getDeps();
  return handleSubmit(
    {
      ...deps,
      notify: {
        feedback: (feedbackId) => dispatchFeedback(deps, feedbackId),
        quotaNotice: (projectId) => dispatchQuotaNotice(deps, projectId),
      },
    },
    request,
  );
}

export function OPTIONS(request: Request) {
  return preflight(request);
}
