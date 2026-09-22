import { createProject, createUser, withTx, type TestDb } from '@dymcode/db-tests/harness';
import { describe, expect, it, vi } from 'vitest';
import { EXPIRED_TEXT, HELP_TEXT, handleTelegramWebhook, type WebhookDeps } from './webhook';

const SECRET = 'webhook-secret-0123456789';

function setup(db: TestDb) {
  const sent: Array<{ chat_id: number | string; text: string }> = [];
  const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    sent.push(JSON.parse(String(init!.body)));
    return new Response(JSON.stringify({ ok: true }));
  });
  const deps: WebhookDeps = {
    db,
    fetch: fetchImpl as typeof fetch,
    env: {
      TELEGRAM_WEBHOOK_SECRET: SECRET,
      TELEGRAM_BOT_TOKEN: '111:BOT',
      TELEGRAM_BOT_USERNAME: 'dymcode_bot',
    },
  };
  return { deps, sent, fetchImpl };
}

const update = (
  text: string,
  chat: { id: number; type: string } = { id: 777, type: 'private' },
  secret = SECRET,
) =>
  new Request('https://dymcode.dev/api/telegram/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': secret },
    body: JSON.stringify({ update_id: 1, message: { message_id: 1, text, chat } }),
  });

async function projectWithCode(db: TestDb, expired = false) {
  const owner = await createUser(db);
  const project = await createProject(db, owner, 'Acme Shop');
  const [row] = await db.query<{ code: string }>(
    `insert into public.telegram_link_codes (project_id, expires_at)
     values ($1, now() + ($2 || ' minutes')::interval) returning code`,
    [project.id, expired ? '-1' : '15'],
  );
  return { project, code: row!.code };
}

const integrationFor = (db: TestDb, projectId: string) =>
  db.query<{ target: string; enabled: boolean; last_error: string | null }>(
    `select target, enabled, last_error from public.integrations where project_id = $1 and kind = 'telegram_shared'`,
    [projectId],
  );

describe('handleTelegramWebhook', () => {
  it('rejects requests without the secret', () =>
    withTx(async (db) => {
      const { deps, fetchImpl } = setup(db);
      expect(
        (await handleTelegramWebhook(deps, update('/start x', undefined, 'wrong'))).status,
      ).toBe(401);
      expect(fetchImpl).not.toHaveBeenCalled();
    }));

  it('links a private chat with a valid code', () =>
    withTx(async (db) => {
      const { deps, sent } = setup(db);
      const { project, code } = await projectWithCode(db);
      const res = await handleTelegramWebhook(deps, update(`/start ${code}`));
      expect(res.status).toBe(200);
      expect(await integrationFor(db, project.id)).toEqual([
        { target: '777', enabled: true, last_error: null },
      ]);
      expect(
        await db.query('select 1 from public.telegram_link_codes where code = $1', [code]),
      ).toEqual([]);
      expect(sent).toEqual([{ chat_id: 777, text: '✅ Connected to Acme Shop' }]);
    }));

  it('accepts the group form addressed to the bot and re-enables an existing integration', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const { project, code } = await projectWithCode(db);
      await db.query(
        `insert into public.integrations (project_id, kind, target, enabled, last_error)
         values ($1, 'telegram_shared', '1', false, 'Forbidden')`,
        [project.id],
      );
      await handleTelegramWebhook(
        deps,
        update(`/start@Dymcode_Bot ${code}`, { id: -100123, type: 'supergroup' }),
      );
      expect(await integrationFor(db, project.id)).toEqual([
        { target: '-100123', enabled: true, last_error: null },
      ]);
    }));

  it('replies with an expiry notice for expired or unknown codes', () =>
    withTx(async (db) => {
      const { deps, sent } = setup(db);
      const { project, code } = await projectWithCode(db, true);
      await handleTelegramWebhook(deps, update(`/start ${code}`));
      await handleTelegramWebhook(deps, update('/start AAAAAAAAAAAA'));
      expect(await integrationFor(db, project.id)).toEqual([]);
      expect(sent.map((s) => s.text)).toEqual([EXPIRED_TEXT, EXPIRED_TEXT]);
    }));

  it('helps in private chats and stays silent in groups', () =>
    withTx(async (db) => {
      const { deps, sent } = setup(db);
      await handleTelegramWebhook(deps, update('hello'));
      await handleTelegramWebhook(deps, update('hello', { id: -5, type: 'group' }));
      await handleTelegramWebhook(
        deps,
        update('/start@other_bot AAAAAAAAAAAA', { id: -5, type: 'group' }),
      );
      expect(sent.map((s) => s.text)).toEqual([HELP_TEXT]);
    }));

  it('always answers 200 to Telegram after the secret check', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      const bad = new Request('https://dymcode.dev/api/telegram/webhook', {
        method: 'POST',
        headers: { 'x-telegram-bot-api-secret-token': SECRET },
        body: '{not json',
      });
      expect((await handleTelegramWebhook(deps, bad)).status).toBe(200);
      error.mockRestore();
    }));
});
