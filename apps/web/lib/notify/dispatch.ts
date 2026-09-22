import type { FeedbackMetadata, FeedbackType } from '@dymcode/shared';
import { ENTITLEMENTS } from '../billing/plans';
import { decryptSecret } from '../crypto';
import type { Db, Row } from '../db/types';
import type { Env } from '../env';
import type { Storage } from '../storage';
import { createDiscordNotifier } from './discord';
import { createTelegramNotifier } from './telegram';
import { isBotToken, isDiscordWebhookUrl } from './validate';
import type { Attachment, DeliveryResult, Notification, Notifier } from './types';

export { isDiscordWebhookUrl } from './validate';

const MAX_RETRY_WAIT_SEC = 3;
const SCREENSHOT_TIMEOUT_MS = 10_000;
const EXTENSION_TYPES: Record<string, string> = {
  webp: 'image/webp',
  jpg: 'image/jpeg',
  png: 'image/png',
};

export interface DispatchDeps {
  db: Db;
  storage: Storage;
  fetch: typeof fetch;
  env: Pick<Env, 'TELEGRAM_BOT_TOKEN' | 'SECRETS_ENCRYPTION_KEY' | 'NEXT_PUBLIC_APP_URL'>;
  sleep?: (ms: number) => Promise<void>;
  /** Screenshot download budget; on timeout the notification is sent without it. */
  screenshotTimeoutMs?: number;
}

interface IntegrationRow extends Row {
  id: string;
  kind: 'telegram_shared' | 'telegram_custom' | 'discord';
  target: string | null;
  secret_encrypted: string | null;
}

export const quotaNoticeText = (appUrl: string) =>
  `Your free limit of ${ENTITLEMENTS.free.monthlySubmissions} submissions this month is reached. ` +
  `New feedback is saved; upgrade to Pro to see it: ${appUrl}/billing`;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** null = skip silently; string = configuration error recorded on the integration. */
function buildNotifier(
  deps: DispatchDeps,
  row: IntegrationRow,
  pro: boolean,
): Notifier | string | null {
  const secret = () => decryptSecret(row.secret_encrypted ?? '', deps.env.SECRETS_ENCRYPTION_KEY);
  let value: string;
  switch (row.kind) {
    case 'telegram_shared':
      if (!row.target) return 'missing chat id';
      return createTelegramNotifier({
        token: deps.env.TELEGRAM_BOT_TOKEN,
        chatId: row.target,
        fetch: deps.fetch,
      });
    case 'telegram_custom':
      if (!pro) return null;
      if (!row.target) return 'missing chat id';
      try {
        value = secret();
      } catch {
        return 'secret unreadable';
      }
      if (!isBotToken(value)) return 'invalid bot token';
      return createTelegramNotifier({ token: value, chatId: row.target, fetch: deps.fetch });
    case 'discord':
      try {
        value = secret();
      } catch {
        return 'secret unreadable';
      }
      if (!isDiscordWebhookUrl(value)) return 'invalid webhook url';
      return createDiscordNotifier({ webhookUrl: value, fetch: deps.fetch });
  }
}

/** Resolves null when `promise` does not settle within `ms`. */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function deliver(
  deps: DispatchDeps,
  notifier: Notifier,
  notification: Notification,
): Promise<DeliveryResult> {
  const first = await notifier.send(notification);
  if (first.ok || !first.retryable) return first;
  const waitSec = Math.min(first.retryAfterSec ?? 1, MAX_RETRY_WAIT_SEC);
  await (deps.sleep ?? defaultSleep)(waitSec * 1000);
  return notifier.send(notification);
}

async function record(
  db: Db,
  id: string,
  result: DeliveryResult | { ok: false; disable: false; error: string },
) {
  if (result.ok) {
    await db.query(
      'update public.integrations set last_delivered_at = now(), last_error = null where id = $1',
      [id],
    );
  } else if (result.disable) {
    await db.query(
      'update public.integrations set enabled = false, last_error = $2 where id = $1',
      [id, result.error.slice(0, 500)],
    );
  } else {
    await db.query('update public.integrations set last_error = $2 where id = $1', [
      id,
      result.error.slice(0, 500),
    ]);
  }
}

async function fanOut(
  deps: DispatchDeps,
  projectId: string,
  pro: boolean,
  notification: Notification,
) {
  const rows = await deps.db.query<IntegrationRow>(
    `select id, kind::text as kind, target, secret_encrypted
     from public.integrations where project_id = $1 and enabled order by created_at`,
    [projectId],
  );
  await Promise.all(
    rows.map(async (row) => {
      try {
        const notifier = buildNotifier(deps, row, pro);
        if (notifier === null) return;
        if (typeof notifier === 'string')
          return await record(deps.db, row.id, { ok: false, disable: false, error: notifier });
        await record(deps.db, row.id, await deliver(deps, notifier, notification));
      } catch (error) {
        console.error('[dispatch]', error);
        await record(deps.db, row.id, { ok: false, disable: false, error: 'internal error' }).catch(
          (recordError: unknown) => console.error('[dispatch]', recordError),
        );
      }
    }),
  );
}

export async function dispatchFeedback(deps: DispatchDeps, feedbackId: string): Promise<void> {
  const [row] = await deps.db.query<{
    project_id: string;
    project_name: string;
    type: FeedbackType;
    message: string;
    email: string | null;
    screenshot_path: string | null;
    metadata: FeedbackMetadata;
    pro: boolean;
  }>(
    `select f.project_id, p.name as project_name, f.type::text as type, f.message, f.email,
            f.screenshot_path, f.metadata, public.is_pro(p.owner_id) as pro
     from public.feedback f join public.projects p on p.id = f.project_id
     where f.id = $1`,
    [feedbackId],
  );
  if (!row) return;

  let screenshot: Attachment | null = null;
  if (row.screenshot_path) {
    const file = await withTimeout(
      deps.storage.download(row.screenshot_path),
      deps.screenshotTimeoutMs ?? SCREENSHOT_TIMEOUT_MS,
    ).catch(() => null);
    const extension = row.screenshot_path.split('.').pop() ?? 'webp';
    if (file) {
      screenshot = {
        data: file.data,
        contentType: EXTENSION_TYPES[extension] ?? file.contentType,
        filename: `screenshot.${extension}`,
      };
    }
  }

  await fanOut(deps, row.project_id, row.pro, {
    kind: 'feedback',
    projectName: row.project_name,
    type: row.type,
    message: row.message,
    email: row.email,
    metadata: row.metadata,
    dashboardUrl: `${deps.env.NEXT_PUBLIC_APP_URL}/projects/${row.project_id}/feedback?f=${feedbackId}`,
    screenshot,
  });
}

export async function dispatchQuotaNotice(deps: DispatchDeps, projectId: string): Promise<void> {
  const [row] = await deps.db.query<{ pro: boolean }>(
    'select public.is_pro(owner_id) as pro from public.projects where id = $1',
    [projectId],
  );
  if (!row) return;
  await fanOut(deps, projectId, row.pro, {
    kind: 'text',
    text: quotaNoticeText(deps.env.NEXT_PUBLIC_APP_URL),
  });
}
