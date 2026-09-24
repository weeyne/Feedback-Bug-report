'use client';

import { Archive, Check, Mail, RotateCcw, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { deleteFeedbackAction, setFeedbackStatusAction } from '@/app/app/actions';
import { cn } from 'cn';
import { Button, buttonVariants } from '@/components/ui/button';
import { replyHref } from '@/lib/dashboard/feed-view';
import type { FeedbackStatus } from '@/lib/dashboard/feedback';

export function FeedbackActions({
  id,
  status,
  email,
  closeHref,
}: {
  id: string;
  status: FeedbackStatus;
  email: string | null;
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
  const setStatus = (next: FeedbackStatus) => () => run(() => setFeedbackStatusAction(id, next));
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === 'resolved' ? (
        <Button
          disabled={pending}
          className="font-semibold"
          data-testid="feedback-reopen"
          onClick={setStatus('new')}
        >
          <RotateCcw aria-hidden />
          {t('feedback.reopen')}
        </Button>
      ) : (
        <Button
          disabled={pending}
          className="font-semibold"
          data-testid="feedback-resolve"
          onClick={setStatus('resolved')}
        >
          <Check aria-hidden />
          {t('feedback.resolve')}
        </Button>
      )}
      {email && (
        <a
          href={replyHref(email, t('feedback.replySubject'))}
          data-testid="feedback-reply"
          className={cn(buttonVariants({ variant: 'outline' }), 'font-semibold')}
        >
          <Mail aria-hidden />
          {t('feedback.reply')}
        </a>
      )}
      {status === 'archived' ? (
        <Button
          variant="outline"
          disabled={pending}
          className="font-semibold"
          data-testid="feedback-reopen"
          onClick={setStatus('new')}
        >
          <RotateCcw aria-hidden />
          {t('feedback.reopen')}
        </Button>
      ) : (
        <Button
          variant="outline"
          disabled={pending}
          className="font-semibold"
          data-testid="feedback-archive"
          onClick={setStatus('archived')}
        >
          <Archive aria-hidden />
          {/* Icon-only on the narrowest phones so the action row fits on one line. */}
          <span className="max-[400px]:sr-only">{t('feedback.archive')}</span>
        </Button>
      )}
      <Button
        size="icon"
        variant="destructive"
        disabled={pending}
        className="ml-auto"
        aria-label={t('common.delete')}
        title={t('common.delete')}
        data-testid="feedback-delete"
        onClick={() => {
          if (confirm(t('feedback.deleteConfirm')))
            run(
              () => deleteFeedbackAction(id),
              () => router.push(closeHref),
            );
        }}
      >
        <Trash2 aria-hidden />
      </Button>
    </div>
  );
}
