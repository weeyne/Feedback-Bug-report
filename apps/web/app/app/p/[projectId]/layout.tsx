import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { requireUser } from '@/lib/auth/session';
import { getProject } from '@/lib/dashboard/projects';
import { getDeps } from '@/lib/deps';

export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const user = await requireUser();
  const { projectId } = await params;
  if (!(await getProject(await getDeps(), user.id, projectId))) notFound();
  return <>{children}</>;
}
