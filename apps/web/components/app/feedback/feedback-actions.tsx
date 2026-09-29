'use client';

import { Archive, Check, Mail, RotateCcw, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { deleteFeedbackAction, setFeedbackStatusAction } from '@/app/app/actions';
import { cn } from 'cn';
import { Button, buttonVariants } from '@/components/ui/button';
import { AlertDialog, AlertDialogContent } from '@/components/ui/alert-dialog';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { replyHref } from '@/lib/dashboard/feed-view';
import type { FeedbackStatus } from '@/lib/dashboard/feedback';

export function FeedbackActions({
  id,
  status,
  email,
  closeHref,
  afterHref,
}: {
  id: string;
  status: FeedbackStatus;
  email: string | null;
  closeHref: string;
  afterHref?: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  // Navigating fetches fresh server data itself; only staying on the page needs a refresh.
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, thenGo?: string) =>
    start(async () => {
      const result = await fn();
      if (!result.ok) toast.error(t(result.error ?? 'errors.generic'));
      if (result.ok && thenGo) router.push(thenGo);
      else router.refresh();
    });
  const setStatus = (next: FeedbackStatus) => () => run(() => setFeedbackStatusAction(id, next));
  // Resolving or archiving takes the report out of the list: move on to the next one.
  const triage = (next: FeedbackStatus) => () =>
    run(() => setFeedbackStatusAction(id, next), afterHref);
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
          onClick={triage('resolved')}
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
          {/* Icon-only on the narrowest phones so the action row fits on one line. */}
          <span className="max-[400px]:sr-only">{t('feedback.reply')}</span>
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
          onClick={triage('archived')}
        >
          <Archive aria-hidden />
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
        onClick={() => setConfirmingDelete(true)}
      >
        <Trash2 aria-hidden />
      </Button>
      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent initialFocus={cancelRef} data-testid="feedback-delete-dialog">
          <DialogHeader>
            <DialogTitle>{t('feedback.deleteTitle')}</DialogTitle>
            <DialogDescription>{t('feedback.deleteWarning')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              ref={cancelRef}
              variant="outline"
              onClick={() => setConfirmingDelete(false)}
              data-testid="feedback-delete-cancel"
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              data-testid="feedback-delete-confirm"
              onClick={() => {
                setConfirmingDelete(false);
                run(() => deleteFeedbackAction(id), afterHref ?? closeHref);
              }}
            >
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
