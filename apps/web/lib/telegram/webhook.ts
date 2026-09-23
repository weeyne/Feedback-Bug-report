import { safeEqual } from '../crypto';
import type { Db } from '../db/types';
import type { Env } from '../env';

export const EXPIRED_TEXT = 'This link has expired. Create a new one in your Dymcode dashboard.';
export const HELP_TEXT =
  'Hi! I deliver feedback from your Bugping widget. Connect a project in your dashboard: Integrations → Telegram.';

export interface WebhookDeps {
  db: Db;
  fetch: typeof fetch;
  env: Pick<Env, 'TELEGRAM_WEBHOOK_SECRET' | 'TELEGRAM_BOT_TOKEN' | 'TELEGRAM_BOT_USERNAME'>;
}

interface Update {
  message?: { text?: string; chat?: { id: number; type: string } };
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Atomically claims an unexpired code and links the chat. Returns the project name, or null. */
async function linkChat(db: Db, code: string, chatId: string): Promise<string | null> {
  const [row] = await db.query<{ name: string }>(
    `with claimed as (
       delete from public.telegram_link_codes where code = $1 and expires_at > now() returning project_id
     ), linked as (
       insert into public.integrations (project_id, kind, target, enabled, last_error)
       select project_id, 'telegram_shared', $2, true, null from claimed
       on conflict (project_id, kind)
       do update set target = excluded.target, enabled = true, last_error = null
       returning project_id
     )
     select p.name from linked join public.projects p on p.id = linked.project_id`,
    [code, chatId],
  );
  return row?.name ?? null;
}

async function reply(deps: WebhookDeps, chatId: number, text: string) {
  await deps.fetch(`https://api.telegram.org/bot${deps.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
    signal: AbortSignal.timeout(5000),
  });
}

export async function handleTelegramWebhook(
  deps: WebhookDeps,
  request: Request,
): Promise<Response> {
  if (
    !safeEqual(
      request.headers.get('x-telegram-bot-api-secret-token'),
      deps.env.TELEGRAM_WEBHOOK_SECRET,
    )
  ) {
    return new Response('unauthorized', { status: 401 });
  }
  try {
    const update = (await request.json()) as Update;
    const text = update.message?.text?.trim();
    const chat = update.message?.chat;
    if (!text || !chat) return new Response('ok');

    const start = new RegExp(
      `^/start(?:@${escapeRegex(deps.env.TELEGRAM_BOT_USERNAME)})?\\s+([0-9A-Za-z]{12})$`,
      'i',
    );
    const match = start.exec(text);
    if (match) {
      const projectName = await linkChat(deps.db, match[1]!, String(chat.id));
      await reply(deps, chat.id, projectName ? `✅ Connected to ${projectName}` : EXPIRED_TEXT);
    } else if (chat.type === 'private') {
      await reply(deps, chat.id, HELP_TEXT);
    }
  } catch (error) {
    // Telegram retries non-2xx responses; log and acknowledge instead.
    console.error('[telegram/webhook]', error);
  }
  return new Response('ok');
}
