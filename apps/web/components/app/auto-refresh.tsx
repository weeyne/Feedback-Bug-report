'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useTransition } from 'react';
import { Button } from '@/components/ui/button';

export function AutoRefresh({ intervalMs }: { intervalMs: number }) {
  const router = useRouter();
  const t = useTranslations('common');
  const [pending, start] = useTransition();
  useEffect(() => {
    const timer = setInterval(() => start(() => router.refresh()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, router]);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => start(() => router.refresh())}
      data-testid="feed-refresh"
    >
      {t('refresh')}
    </Button>
  );
}
