'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { StatusPage } from '@/components/status-page';
import { Button, buttonVariants } from '@/components/ui/button';

/** Shared body of the `error.tsx` boundaries; never shows `error.message`, which may leak internals. */
export function ErrorScreen({
  error,
  retry,
  embedded,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  embedded?: boolean;
}) {
  const t = useTranslations('status');
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <StatusPage
      embedded={embedded}
      title={t('errorTitle')}
      body={t('errorBody')}
      note={error.digest ? t('errorCode', { digest: error.digest }) : undefined}
    >
      <Button size="lg" onClick={() => retry()}>
        {t('retry')}
      </Button>
      <Link href="/app" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
        {t('dashboard')}
      </Link>
      {!embedded && (
        <Link href="/" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
          {t('home')}
        </Link>
      )}
    </StatusPage>
  );
}
