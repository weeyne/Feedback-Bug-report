'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { hasFeedbackAction } from '@/app/app/actions';
import { Button } from '@/components/ui/button';

const POLL_MS = 3000;

export function FirstFeedbackWatcher({
  projectId,
  initial,
}: {
  projectId: string;
  initial: boolean;
}) {
  const t = useTranslations('install');
  const [received, setReceived] = useState(initial);
  useEffect(() => {
    if (received) return;
    const timer = setInterval(async () => {
      if (await hasFeedbackAction(projectId)) setReceived(true);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [projectId, received]);

  if (!received) {
    return (
      <p
        className="flex items-center gap-2 text-sm text-muted-foreground"
        data-testid="install-waiting"
      >
        <span
          className="size-2 shrink-0 animate-pulse rounded-full bg-primary motion-reduce:animate-none"
          aria-hidden
        />
        {t('waiting')}
      </p>
    );
  }
  return (
    <div
      className="animate-fade flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-green-600/25 bg-green-600/5 px-3 py-2.5 text-sm dark:border-green-400/25 dark:bg-green-400/10"
      data-testid="install-received"
    >
      <span className="font-semibold text-green-800 dark:text-green-300">{t('received')}</span>
      <span className="flex flex-wrap gap-2">
        <Button
          size="sm"
          nativeButton={false}
          render={<Link href={`/app/p/${projectId}/feedback`} />}
        >
          {t('openFeedback')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          nativeButton={false}
          render={<Link href={`/app/p/${projectId}/integrations`} />}
        >
          {t('connectTelegram')}
        </Button>
      </span>
    </div>
  );
}
