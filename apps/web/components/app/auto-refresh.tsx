'use client';

import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useTransition } from 'react';
import { cn } from 'cn';
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
      variant="ghost"
      size="sm"
      disabled={pending}
      className="font-semibold text-muted-foreground"
      onClick={() => start(() => router.refresh())}
      data-testid="feed-refresh"
    >
      <RefreshCw aria-hidden className={cn(pending && 'motion-safe:animate-spin')} />
      {t('refresh')}
    </Button>
  );
}
