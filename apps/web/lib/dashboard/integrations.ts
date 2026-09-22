import { decryptSecret, encryptSecret } from '../crypto';
import { createDiscordNotifier } from '../notify/discord';
import { sendTestNotice, TEST_NOTICE_TEXT } from '../notify/dispatch';
import { createTelegramNotifier } from '../notify/telegram';
import { isBotToken, isDiscordWebhookUrl } from '../notify/validate';
import { getProject, ownsProject } from './projects';
import type { ActionResult, DashDeps } from './result';
import { isPro } from './settings';

export const DASHBOARD_RATE_LIMIT = 10;
export const INTEGRATION_KINDS = ['telegram_shared', 'telegram_custom', 'discord'] as const;
export type IntegrationKind = (typeof INTEGRATION_KINDS)[number];

export interface IntegrationStatus {
  kind: IntegrationKind;
  connected: boolean;
  enabled: boolean;
  lastError: string | null;
  lastDeliveredAt: string | null;
  botUsername?: string;
}

export interface TelegramLink {
  code: string;
  privateUrl: string;
  groupUrl: string;
  expiresAt: string;
}

const CHAT_ID = /^(-?\d{1,20}|@\w{5,32})$/;
const TELEGRAM_TIMEOUT_MS = 5000;

async function rateLimited(deps: DashDeps, action: string, userId: string): Promise<boolean> {
  const [row] = await deps.db.query<{ limited: boolean }>(
    'select public.hit_rate_limit($1, $2, 60) as limited',
    [`dashboard:${action}:${userId}`, DASHBOARD_RATE_LIMIT],
  );
  return Boolean(row?.limited);
}

async function getMe(deps: DashDeps, token: string): Promise<string | null> {
  try {
    const response = await deps.fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
    });
    const data = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      result?: { username?: string };
    };
    return response.ok && data.ok && data.result?.username ? data.result.username : null;
  } catch {
    return null;
  }
}

async function upsert(
  deps: DashDeps,
  projectId: string,
  kind: IntegrationKind,
  target: string | null,
  secret: string,
) {
  await deps.db.query(
    `insert into public.integrations (project_id, kind, target, secret_encrypted, enabled, last_error)
     values ($1, $2::integration_kind, $3, $4, true, null)
     on conflict (project_id, kind) do update
       set target = excluded.target, secret_encrypted = excluded.secret_encrypted, enabled = true, last_error = null`,
    [projectId, kind, target, encryptSecret(secret, deps.env.SECRETS_ENCRYPTION_KEY)],
  );
}

export async function createTelegramLink(
  deps: DashDeps,
  userId: string,
  projectId: string,
): Promise<ActionResult<{ link: TelegramLink }>> {
  if (!(await ownsProject(deps, userId, projectId))) return { ok: false, error: 'errors.notFound' };
  if (await rateLimited(deps, 'telegram-link', userId))
    return { ok: false, error: 'errors.rateLimited' };
  await deps.db.query('delete from public.telegram_link_codes where project_id = $1', [projectId]);
  const [row] = await deps.db.query<{ code: string; expires_at: Date | string }>(
    'insert into public.telegram_link_codes (project_id) values ($1) returning code, expires_at',
    [projectId],
  );
  const bot = deps.env.TELEGRAM_BOT_USERNAME;
  return {
    ok: true,
    link: {
      code: row!.code,
      privateUrl: `https://t.me/${bot}?start=${row!.code}`,
      groupUrl: `https://t.me/${bot}?startgroup=${row!.code}`,
      expiresAt: new Date(row!.expires_at).toISOString(),
    },
  };
}

export async function integrationStatus(
  deps: DashDeps,
  userId: string,
  projectId: string,
): Promise<IntegrationStatus[] | null> {
  if (!(await ownsProject(deps, userId, projectId))) return null;
  const rows = await deps.db.query<{
    kind: IntegrationKind;
    enabled: boolean;
    target: string | null;
    secret_encrypted: string | null;
    last_error: string | null;
    last_delivered_at: Date | string | null;
  }>(
    `select kind::text as kind, enabled, target, secret_encrypted, last_error, last_delivered_at
     from public.integrations where project_id = $1`,
    [projectId],
  );
  return Promise.all(
    INTEGRATION_KINDS.map(async (kind): Promise<IntegrationStatus> => {
      const row = rows.find((r) => r.kind === kind);
      if (!row)
        return { kind, connected: false, enabled: false, lastError: null, lastDeliveredAt: null };
      const status: IntegrationStatus = {
        kind,
        connected: row.enabled && (kind === 'discord' || row.target !== null),
        enabled: row.enabled,
        lastError: row.last_error,
        lastDeliveredAt: row.last_delivered_at
          ? new Date(row.last_delivered_at).toISOString()
          : null,
      };
      if (kind === 'telegram_custom' && row.secret_encrypted) {
        try {
          const username = await getMe(
            deps,
            decryptSecret(row.secret_encrypted, deps.env.SECRETS_ENCRYPTION_KEY),
          );
          if (username) status.botUsername = username;
        } catch {
          // Unreadable secret: shown as not connected via lastError on the next delivery.
        }
      }
      return status;
    }),
  );
}

export async function saveCustomBot(
  deps: DashDeps,
  userId: string,
  input: { projectId: string; token: string; chatId: string },
): Promise<ActionResult<{ botUsername: string }>> {
  const project = await getProject(deps, userId, input.projectId);
  if (!project) return { ok: false, error: 'errors.notFound' };
  if (!(await isPro(deps, userId))) return { ok: false, error: 'integrations.proRequired' };
  const token = input.token.trim();
  const chatId = input.chatId.trim();
  if (!isBotToken(token)) return { ok: false, error: 'integrations.invalidToken' };
  if (!CHAT_ID.test(chatId)) return { ok: false, error: 'integrations.invalidChatId' };
  if (await rateLimited(deps, 'custom-bot', userId))
    return { ok: false, error: 'errors.rateLimited' };
  const botUsername = await getMe(deps, token);
  if (!botUsername) return { ok: false, error: 'integrations.invalidToken' };
  const result = await createTelegramNotifier({ token, chatId, fetch: deps.fetch }).send({
    kind: 'text',
    text: TEST_NOTICE_TEXT(project.name),
  });
  if (!result.ok) return { ok: false, error: 'integrations.testFailed' };
  await upsert(deps, project.id, 'telegram_custom', chatId, token);
  return { ok: true, botUsername };
}

export async function saveDiscord(
  deps: DashDeps,
  userId: string,
  input: { projectId: string; webhookUrl: string },
): Promise<ActionResult> {
  const project = await getProject(deps, userId, input.projectId);
  if (!project) return { ok: false, error: 'errors.notFound' };
  const webhookUrl = input.webhookUrl.trim();
  if (!isDiscordWebhookUrl(webhookUrl)) return { ok: false, error: 'integrations.invalidWebhook' };
  if (await rateLimited(deps, 'discord', userId)) return { ok: false, error: 'errors.rateLimited' };
  const result = await createDiscordNotifier({ webhookUrl, fetch: deps.fetch }).send({
    kind: 'text',
    text: TEST_NOTICE_TEXT(project.name),
  });
  if (!result.ok) return { ok: false, error: 'integrations.testFailed' };
  await upsert(deps, project.id, 'discord', null, webhookUrl);
  return { ok: true };
}

export async function sendTest(
  deps: DashDeps,
  userId: string,
  input: { projectId: string; kind: IntegrationKind },
): Promise<ActionResult> {
  if (!INTEGRATION_KINDS.includes(input.kind)) return { ok: false, error: 'errors.notFound' };
  if (!(await ownsProject(deps, userId, input.projectId)))
    return { ok: false, error: 'errors.notFound' };
  if (await rateLimited(deps, 'send-test', userId))
    return { ok: false, error: 'errors.rateLimited' };
  const [row] = await deps.db.query<{ id: string }>(
    `update public.integrations set enabled = true
     where project_id = $1 and kind = $2::integration_kind returning id`,
    [input.projectId, input.kind],
  );
  if (!row) return { ok: false, error: 'integrations.notConnected' };
  const result = await sendTestNotice(deps, row.id);
  return result.ok ? { ok: true } : { ok: false, error: 'integrations.testFailed' };
}

export async function disconnectIntegration(
  deps: DashDeps,
  userId: string,
  input: { projectId: string; kind: IntegrationKind },
): Promise<ActionResult> {
  if (!INTEGRATION_KINDS.includes(input.kind)) return { ok: false, error: 'errors.notFound' };
  if (!(await ownsProject(deps, userId, input.projectId)))
    return { ok: false, error: 'errors.notFound' };
  await deps.db.query(
    'delete from public.integrations where project_id = $1 and kind = $2::integration_kind',
    [input.projectId, input.kind],
  );
  return { ok: true };
}
