'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { signOut } from '@/app/actions/session';
import { getAuthAdmin } from '@/lib/auth/admin';
import { requireUser } from '@/lib/auth/session';
import { deleteAccount } from '@/lib/dashboard/account';
import { deleteFeedback, setFeedbackStatus, type FeedbackStatus } from '@/lib/dashboard/feedback';
import {
  createTelegramLink,
  disconnectIntegration,
  integrationStatus,
  saveCustomBot,
  saveDiscord,
  sendTest,
  type IntegrationKind,
  type IntegrationStatus,
  type TelegramLink,
} from '@/lib/dashboard/integrations';
import { createProject, hasFeedback } from '@/lib/dashboard/projects';
import type { ActionResult } from '@/lib/dashboard/result';
import { deleteProject, updateProjectSettings, type SettingsInput } from '@/lib/dashboard/settings';
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

export async function updateProjectSettingsAction(
  projectId: string,
  input: SettingsInput,
): Promise<ActionResult> {
  const user = await requireUser();
  const result = await updateProjectSettings(await getDeps(), user.id, projectId, input);
  revalidatePath('/app', 'layout');
  return result;
}

export async function deleteProjectAction(
  projectId: string,
  confirmName: string,
): Promise<ActionResult> {
  const user = await requireUser();
  const result = await deleteProject(await getDeps(), user.id, { projectId, confirmName });
  if (!result.ok) return result;
  revalidatePath('/app', 'layout');
  redirect('/app');
}

export async function createTelegramLinkAction(
  projectId: string,
): Promise<ActionResult<{ link: TelegramLink }>> {
  const user = await requireUser();
  return createTelegramLink(await getDeps(), user.id, projectId);
}

export async function integrationStatusAction(
  projectId: string,
): Promise<IntegrationStatus[] | null> {
  const user = await requireUser();
  return integrationStatus(await getDeps(), user.id, projectId);
}

export async function saveCustomBotAction(
  projectId: string,
  token: string,
  chatId: string,
): Promise<ActionResult<{ botUsername: string }>> {
  const user = await requireUser();
  return saveCustomBot(await getDeps(), user.id, { projectId, token, chatId });
}

export async function saveDiscordAction(
  projectId: string,
  webhookUrl: string,
): Promise<ActionResult> {
  const user = await requireUser();
  return saveDiscord(await getDeps(), user.id, { projectId, webhookUrl });
}

export async function sendTestAction(
  projectId: string,
  kind: IntegrationKind,
): Promise<ActionResult> {
  const user = await requireUser();
  return sendTest(await getDeps(), user.id, { projectId, kind });
}

export async function disconnectIntegrationAction(
  projectId: string,
  kind: IntegrationKind,
): Promise<ActionResult> {
  const user = await requireUser();
  return disconnectIntegration(await getDeps(), user.id, { projectId, kind });
}

export async function deleteAccountAction(confirmEmail: string): Promise<ActionResult> {
  const user = await requireUser();
  const deps = await getDeps();
  const result = await deleteAccount(
    { ...deps, authAdmin: getAuthAdmin(deps) },
    user,
    confirmEmail,
  );
  if (!result.ok) return result;
  await signOut(); // clears the session and redirects to '/'
  return result;
}
