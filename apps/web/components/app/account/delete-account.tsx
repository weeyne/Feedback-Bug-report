'use client';

import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition, type CSSProperties } from 'react';
import { toast } from 'sonner';
import { deleteAccountAction } from '@/app/app/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** `index` is the stagger position for `.animate-enter`. */
export function DeleteAccount({ index = 0 }: { index?: number }) {
  const t = useTranslations();
  const [value, setValue] = useState('');
  const [pending, start] = useTransition();
  return (
    <section
      className="animate-enter flex flex-col gap-4 rounded-xl border border-destructive/40 bg-card p-5"
      style={{ '--i': index } as CSSProperties}
    >
      <div className="flex items-start gap-3">
        <span
          className="grid size-9 shrink-0 place-items-center rounded-lg bg-destructive/10 text-destructive"
          aria-hidden
        >
          <TriangleAlert className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 className="font-bold text-destructive">{t('account.deleteTitle')}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('account.deleteHint')}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input
          type="email"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="min-w-0 flex-[1_1_14rem] sm:max-w-xs"
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
