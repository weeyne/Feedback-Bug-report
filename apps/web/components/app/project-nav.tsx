'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ProjectSwitcher, type ShellProject } from './project-switcher';

const SECTIONS = ['feedback', 'install', 'settings', 'integrations'] as const;

export function ProjectNav({ projects }: { projects: ShellProject[] }) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const match = /^\/app\/p\/([^/]+)(?:\/([^/]+))?/.exec(pathname);
  const currentProjectId = match?.[1] ?? null;
  const section = match?.[2];
  return (
    <>
      <ProjectSwitcher projects={projects} currentProjectId={currentProjectId} />
      {currentProjectId && (
        <ul className="flex flex-col gap-1 text-sm">
          {SECTIONS.map((key) => (
            <li key={key}>
              <Link
                href={`/app/p/${currentProjectId}/${key}`}
                className={`block rounded-md px-3 py-2 hover:bg-muted ${section === key ? 'bg-muted font-medium' : ''}`}
                data-testid={`nav-${key}`}
              >
                {t(key)}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
