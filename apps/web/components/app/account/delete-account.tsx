'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { deleteAccountAction } from '@/app/app/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function DeleteAccount() {
  const t = useTranslations();
  const [value, setValue] = useState('');
  const [pending, start] = useTransition();
  return (
    <section className="rounded-lg border border-destructive/50 p-4">
      <h2 className="font-medium text-destructive">{t('account.deleteTitle')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('account.deleteHint')}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Input
          type="email"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="max-w-xs"
          data-testid="delete-account-email"
        />
        <Button
          variant="destructive"
          disabled={pending || !value}
          data-testid="delete-account-submit"
          onClick={() =>
            start(async () => {
              const result = await deleteAccountAction(value);
              if (result && !result.ok) toast.error(t(result.error));
            })
          }
        >
          {t('account.delete')}
        </Button>
      </div>
    </section>
  );
}
