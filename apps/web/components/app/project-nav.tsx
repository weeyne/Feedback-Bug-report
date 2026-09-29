'use client';

import { AppLink } from '@/components/app/link-prefetch';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useSyncExternalStore } from 'react';
import {
  Bell,
  Code2,
  LayoutDashboard,
  MessageSquare,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { cn } from 'cn';
import {
  lastOpenedProject,
  navProjectId,
  rememberedProjectCookie,
  routeProjectId,
} from '@/lib/dashboard/remembered-project';
import { ProjectSwitcher, type ShellProject } from './project-switcher';

const ITEMS: {
  key: 'overview' | 'feedback' | 'install' | 'integrations' | 'settings';
  icon: LucideIcon;
}[] = [
  { key: 'overview', icon: LayoutDashboard },
  { key: 'feedback', icon: MessageSquare },
  { key: 'install', icon: Code2 },
  { key: 'integrations', icon: Bell },
  { key: 'settings', icon: Settings },
];

export function ProjectNav({
  projects,
  newCounts,
  rememberedProjectId,
  pathname: pathnameOverride,
}: {
  projects: ShellProject[];
  newCounts: Record<string, number>;
  /** The cookie's last opened project, for a hard load of the account or billing page. */
  rememberedProjectId?: string;
  /** Overrides the current route (the landing demo renders a fixture project's feed). */
  pathname?: string;
}) {
  const t = useTranslations('nav');
  const currentPathname = usePathname();
  const pathname = pathnameOverride ?? currentPathname;
  const routeId = routeProjectId(pathname);
  const section = /^\/app\/p\/[^/]+\/([^/]+)/.exec(pathname)?.[1] ?? 'overview';
  // The last project is shared across mounts (the mobile sheet remounts on every open and the
  // layout's cookie prop is not refreshed by client navigation); the cookie covers a hard load.
  const remember = pathnameOverride === undefined;
  const lastProjectId = useSyncExternalStore(
    lastOpenedProject.subscribe,
    () => lastOpenedProject.get() ?? rememberedProjectId ?? null,
    () => rememberedProjectId ?? null,
  );
  const currentProjectId = navProjectId({
    pathname,
    remembered: lastProjectId,
    projectIds: projects.map((p) => p.id),
  });
  useEffect(() => {
    if (!remember || !routeId) return;
    lastOpenedProject.set(routeId);
    document.cookie = rememberedProjectCookie(routeId, location.protocol === 'https:');
  }, [remember, routeId]);
  const newCount = currentProjectId ? (newCounts[currentProjectId] ?? 0) : 0;
  return (
    <>
      <ProjectSwitcher projects={projects} currentProjectId={currentProjectId} />
      {currentProjectId && (
        <ul className="flex flex-col gap-0.5 text-sm">
          {ITEMS.map(({ key, icon: Icon }) => {
            const active = routeId !== null && section === key;
            return (
              <li key={key}>
                <AppLink
                  href={
                    key === 'overview'
                      ? `/app/p/${currentProjectId}`
                      : `/app/p/${currentProjectId}/${key}`
                  }
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors duration-200',
                    active
                      ? 'bg-card font-bold text-foreground shadow-sm dark:bg-accent dark:shadow-none'
                      : 'text-foreground/80 hover:bg-card/70 hover:text-foreground dark:hover:bg-accent/60',
                  )}
                  data-testid={`nav-${key}`}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  <span className="truncate">{t(key)}</span>
                  {key === 'feedback' && newCount > 0 && (
                    <span
                      className="ml-auto rounded-full bg-primary px-1.5 text-[11px] leading-[18px] font-bold text-primary-foreground tabular-nums"
                      data-testid="nav-feedback-count"
                    >
                      {newCount}
                    </span>
                  )}
                </AppLink>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
