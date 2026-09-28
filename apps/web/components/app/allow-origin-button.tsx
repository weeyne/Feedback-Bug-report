'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { allowBlockedOriginAction } from '@/app/app/actions';
import { Button } from '@/components/ui/button';

export function AllowOriginButton({ projectId }: { projectId: string }) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      disabled={pending}
      data-testid="blocked-origin-allow"
      onClick={() =>
        start(async () => {
          const result = await allowBlockedOriginAction(projectId);
          if (!result.ok) toast.error(t(result.error));
          router.refresh();
        })
      }
    >
      {t('blockedOrigin.allow')}
    </Button>
  );
}
