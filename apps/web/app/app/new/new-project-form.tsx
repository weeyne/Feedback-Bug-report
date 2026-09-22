'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createProjectAction } from '../actions';

export function NewProjectForm() {
  const t = useTranslations();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-4"
      action={(form) =>
        start(async () => {
          const result = await createProjectAction({
            name: String(form.get('name') ?? ''),
            siteUrl: String(form.get('siteUrl') ?? '') || undefined,
          });
          if (result.ok) router.push(`/app/p/${result.projectId}/install`);
          else setError(result.error);
        })
      }
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">{t('projects.name')}</Label>
        <Input id="name" name="name" required maxLength={80} data-testid="project-name" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="siteUrl">{t('projects.siteUrl')}</Label>
        <Input
          id="siteUrl"
          name="siteUrl"
          placeholder="https://example.com"
          data-testid="project-site"
        />
        <p className="text-xs text-muted-foreground">{t('projects.siteUrlHint')}</p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t(error)}
        </p>
      )}
      <Button type="submit" disabled={pending} data-testid="project-create">
        {t('projects.create')}
      </Button>
    </form>
  );
}
