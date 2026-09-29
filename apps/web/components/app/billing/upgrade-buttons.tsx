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
  const pricing = useTranslations('landing.pricing');
  const dialog = (label: string, testId: string, featured: boolean) => (
    <Dialog key={testId}>
      <DialogTrigger
        render={
          <Button
            variant={featured ? 'default' : 'outline'}
            className={featured ? 'shadow-lg ring-1 ring-primary' : undefined}
            data-testid={testId}
          />
        }
      >
        {label}
      </DialogTrigger>
      <DialogContent data-testid="billing-coming-soon">
        <DialogHeader>
          <DialogTitle>{t('comingSoonTitle')}</DialogTitle>
          <DialogDescription>{t('comingSoonBody')}</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
  return (
    <div className="flex flex-wrap items-center gap-3 pt-3">
      <div className="relative">
        <span
          className="absolute -top-3 left-2 z-10 rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold text-primary-foreground"
          data-testid="billing-popular"
        >
          {pricing('popular')}
        </span>
        {dialog(t('monthly'), 'billing-upgrade-monthly', true)}
      </div>
      {dialog(t('lifetime'), 'billing-upgrade-lifetime', false)}
    </div>
  );
}
