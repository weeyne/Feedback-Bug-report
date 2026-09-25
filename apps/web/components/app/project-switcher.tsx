'use client';

import { AppLink } from '@/components/app/link-prefetch';
import { useTranslations } from 'next-intl';
import { ChevronsUpDown, Plus } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface ShellProject {
  id: string;
  name: string;
  public_key: string;
}

export function ProjectSwitcher({
  projects,
  currentProjectId,
}: {
  projects: ShellProject[];
  currentProjectId: string | null;
}) {
  const t = useTranslations('nav');
  const current = projects.find((p) => p.id === currentProjectId);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex w-full items-center gap-2 rounded-xl border bg-card px-3 py-2 text-left text-sm font-semibold shadow-xs transition-colors duration-200 hover:border-input dark:bg-muted dark:shadow-none"
        data-testid="project-switcher"
      >
        <span className="min-w-0 flex-1 truncate">{current?.name ?? t('projects')}</span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        {projects.map((p) => (
          // The installed shadcn/ui generation targets Base UI, which replaces Radix's `asChild`
          // with a `render` prop: the element passed to `render` supplies the tag/attributes,
          // and this item's own children are rendered inside it.
          <DropdownMenuItem key={p.id} render={<AppLink href={`/app/p/${p.id}`} />}>
            {p.name}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<AppLink href="/app/new" />}>
          <Plus aria-hidden />
          {t('newProject')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
