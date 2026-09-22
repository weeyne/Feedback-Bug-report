'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { deleteFeedbackAction, setFeedbackStatusAction } from '@/app/app/actions';
import { Button } from '@/components/ui/button';
import type { FeedbackStatus } from '@/lib/dashboard/feedback';

export function FeedbackActions({
  id,
  status,
  closeHref,
}: {
  id: string;
  status: FeedbackStatus;
  closeHref: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      const result = await fn();
      if (!result.ok) toast.error(t(result.error ?? 'errors.generic'));
      else after?.();
      router.refresh();
    });
  return (
    <div className="flex flex-wrap gap-2">
      {status !== 'resolved' && (
        <Button
          size="sm"
          disabled={pending}
          data-testid="feedback-resolve"
          onClick={() => run(() => setFeedbackStatusAction(id, 'resolved'))}
        >
          {t('feedback.resolve')}
        </Button>
      )}
      {status !== 'archived' && (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          data-testid="feedback-archive"
          onClick={() => run(() => setFeedbackStatusAction(id, 'archived'))}
        >
          {t('feedback.archive')}
        </Button>
      )}
      {status !== 'new' && (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          data-testid="feedback-reopen"
          onClick={() => run(() => setFeedbackStatusAction(id, 'new'))}
        >
          {t('feedback.reopen')}
        </Button>
      )}
      <Button
        size="sm"
        variant="destructive"
        disabled={pending}
        data-testid="feedback-delete"
        onClick={() => {
          if (confirm(t('feedback.deleteConfirm')))
            run(
              () => deleteFeedbackAction(id),
              () => router.push(closeHref),
            );
        }}
      >
        {t('common.delete')}
      </Button>
    </div>
  );
}
