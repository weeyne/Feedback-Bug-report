import type { ReactNode } from 'react';
import { AppShell } from '@/components/app/app-shell';
import { requireUser } from '@/lib/auth/session';
import { listProjects } from '@/lib/dashboard/projects';
import { getDeps } from '@/lib/deps';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const projects = await listProjects(await getDeps(), user.id);
  return (
    <AppShell projects={projects} email={user.email}>
      {children}
    </AppShell>
  );
}
