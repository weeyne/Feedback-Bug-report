'use server';

import { requireUser } from '@/lib/auth/session';
import { createProject, hasFeedback } from '@/lib/dashboard/projects';
import type { ActionResult } from '@/lib/dashboard/result';
import { getDeps } from '@/lib/deps';

export async function createProjectAction(input: {
  name: string;
  siteUrl?: string;
}): Promise<ActionResult<{ projectId: string }>> {
  const user = await requireUser();
  return createProject(await getDeps(), user.id, input);
}

export async function hasFeedbackAction(projectId: string): Promise<boolean> {
  const user = await requireUser();
  return hasFeedback(await getDeps(), user.id, projectId);
}
