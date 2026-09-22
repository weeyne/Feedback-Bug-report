'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
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
        className="w-full truncate rounded-md border px-3 py-2 text-left text-sm"
        data-testid="project-switcher"
      >
        {current?.name ?? t('projects')}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        {projects.map((p) => (
          // The installed shadcn/ui generation targets Base UI, which replaces Radix's `asChild`
          // with a `render` prop: the element passed to `render` supplies the tag/attributes,
          // and this item's own children are rendered inside it.
          <DropdownMenuItem key={p.id} render={<Link href={`/app/p/${p.id}/feedback`} />}>
            {p.name}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/app/new" />}>{t('newProject')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
