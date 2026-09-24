import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { PageEnter } from '@/components/app/page-enter';
import { requireUser } from '@/lib/auth/session';
import { getRequestProject } from '@/lib/dashboard/request-project';

export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const user = await requireUser();
  const { projectId } = await params;
  if (!(await getRequestProject(user.id, projectId))) notFound();
  return <PageEnter>{children}</PageEnter>;
}
