'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { deleteFeedback, setFeedbackStatus, type FeedbackStatus } from '@/lib/dashboard/feedback';
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

export async function setFeedbackStatusAction(
  feedbackId: string,
  status: FeedbackStatus,
): Promise<ActionResult> {
  const user = await requireUser();
  const result = await setFeedbackStatus(await getDeps(), user.id, { feedbackId, status });
  revalidatePath('/app', 'layout');
  return result;
}

export async function deleteFeedbackAction(feedbackId: string): Promise<ActionResult> {
  const user = await requireUser();
  const result = await deleteFeedback(await getDeps(), user.id, feedbackId);
  revalidatePath('/app', 'layout');
  return result;
}
