'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { deleteProjectAction } from '@/app/app/actions';

export function DeleteProject({ projectId, name }: { projectId: string; name: string }) {
  const t = useTranslations();
  const [value, setValue] = useState('');
  const [pending, start] = useTransition();
  return (
    <section className="rounded-lg border border-destructive/50 p-4">
      <h2 className="font-medium text-destructive">{t('settings.danger')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('settings.deleteHint')}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={name}
          className="max-w-xs"
          data-testid="delete-project-name"
        />
        <Button
          variant="destructive"
          disabled={pending || value !== name}
          data-testid="delete-project-submit"
          onClick={() =>
            start(async () => {
              const result = await deleteProjectAction(projectId, value);
              if (result && !result.ok) toast.error(t(result.error));
            })
          }
        >
          {t('settings.deleteProject')}
        </Button>
      </div>
    </section>
  );
}
