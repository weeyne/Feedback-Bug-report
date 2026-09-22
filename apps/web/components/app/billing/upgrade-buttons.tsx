'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export function UpgradeButtons() {
  const t = useTranslations('billing');
  const dialog = (label: string, testId: string) => (
    <Dialog key={testId}>
      <DialogTrigger render={<Button data-testid={testId} />}>{label}</DialogTrigger>
      <DialogContent data-testid="billing-coming-soon">
        <DialogHeader>
          <DialogTitle>{t('comingSoonTitle')}</DialogTitle>
          <DialogDescription>{t('comingSoonBody')}</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
  return (
    <div className="flex flex-wrap gap-3">
      {dialog(t('monthly'), 'billing-upgrade-monthly')}
      {dialog(t('lifetime'), 'billing-upgrade-lifetime')}
    </div>
  );
}
