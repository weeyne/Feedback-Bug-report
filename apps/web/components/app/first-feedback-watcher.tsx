'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { hasFeedbackAction } from '@/app/app/actions';

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
      <p className="animate-pulse text-muted-foreground" data-testid="install-waiting">
        {t('waiting')}
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3" data-testid="install-received">
      <span className="font-medium">{t('received')}</span>
      <Link href={`/app/p/${projectId}/feedback`} className="underline">
        {t('openFeedback')}
      </Link>
      <Link href={`/app/p/${projectId}/integrations`} className="underline">
        {t('connectTelegram')}
      </Link>
    </div>
  );
}
