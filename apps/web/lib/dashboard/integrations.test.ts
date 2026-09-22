import {
  createProject,
  createUser,
  grantPro,
  withTx,
  type TestDb,
} from '@dymcode/db-tests/harness';
import { describe, expect, it } from 'vitest';
import { VALID_ENV } from '@/test/fixtures';
import { decryptSecret } from '../crypto';
import { parseEnv } from '../env';
import { createMemoryStorage } from '../storage';
import {
  createTelegramLink,
  disconnectIntegration,
  integrationStatus,
  saveCustomBot,
  saveDiscord,
  sendTest,
} from './integrations';
import type { DashDeps } from './result';

const env = parseEnv(VALID_ENV);
const WEBHOOK = 'https://discord.com/api/webhooks/123/abc';
const TOKEN = '987654:custom_TOKEN';

interface Call {
  url: string;
  body: string;
}

/** Fake Telegram/Discord: `fail` makes every send fail with 400. */
function fakeFetch(opts: { fail?: boolean } = {}) {
  const calls: Call[] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: typeof init?.body === 'string' ? init.body : '' });
    if (url.endsWith('/getMe')) {
      return Response.json(
        opts.fail
          ? { ok: false, description: 'Unauthorized' }
          : { ok: true, result: { username: 'acme_bot' } },
        {
          status: opts.fail ? 401 : 200,
        },
      );
    }
    if (opts.fail)
      return Response.json(
        { ok: false, description: 'Bad Request: chat not found' },
        { status: 400 },
      );
    if (url.includes('discord.com')) return new Response(null, { status: 204 });
    return Response.json({ ok: true, result: {} });
  }) as typeof fetch;
  return { calls, fetchFn };
}

function setup(db: TestDb, opts: { fail?: boolean } = {}) {
  const fake = fakeFetch(opts);
  const deps: DashDeps = { db, storage: createMemoryStorage(), env, fetch: fake.fetchFn };
  return { deps, calls: fake.calls };
}

const secretOf = async (db: TestDb, projectId: string, kind: string) => {
  const [row] = await db.query<{ secret_encrypted: string | null; target: string | null }>(
    'select secret_encrypted, target from public.integrations where project_id = $1 and kind = $2::integration_kind',
    [projectId, kind],
  );
  return row;
};

describe('createTelegramLink', () => {
  it('replaces older codes and returns both deep links', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const owner = await createUser(db);
      const project = await createProject(db, owner);
      const first = await createTelegramLink(deps, owner, project.id);
      const second = await createTelegramLink(deps, owner, project.id);
      if (!first.ok || !second.ok) throw new Error('expected ok');
      expect(second.link.privateUrl).toBe(
        `https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=${second.link.code}`,
      );
      expect(second.link.groupUrl).toBe(
        `https://t.me/${env.TELEGRAM_BOT_USERNAME}?startgroup=${second.link.code}`,
      );
      const codes = await db.query<{ code: string }>(
        'select code from public.telegram_link_codes where project_id = $1',
        [project.id],
      );
      expect(codes.map((c) => c.code)).toEqual([second.link.code]);
    }));

  it('denies strangers and rate-limits at 10 per minute', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const owner = await createUser(db);
      const project = await createProject(db, owner);
      const stranger = await createUser(db);
      expect(await createTelegramLink(deps, stranger, project.id)).toEqual({
        ok: false,
        error: 'errors.notFound',
      });
      for (let i = 0; i < 10; i++)
        expect((await createTelegramLink(deps, owner, project.id)).ok).toBe(true);
      expect(await createTelegramLink(deps, owner, project.id)).toEqual({
        ok: false,
        error: 'errors.rateLimited',
      });
    }));
});

describe('saveDiscord', () => {
  it('stores the webhook encrypted only after a successful test send', () =>
    withTx(async (db) => {
      const owner = await createUser(db);
      const project = await createProject(db, owner);
      const failing = setup(db, { fail: true });
      expect(
        await saveDiscord(failing.deps, owner, { projectId: project.id, webhookUrl: WEBHOOK }),
      ).toEqual({
        ok: false,
        error: 'integrations.testFailed',
      });
      expect(await secretOf(db, project.id, 'discord')).toBeUndefined();

      const { deps, calls } = setup(db);
      expect(
        await saveDiscord(deps, owner, { projectId: project.id, webhookUrl: WEBHOOK }),
      ).toEqual({ ok: true });
      expect(calls.at(-1)!.url.startsWith(WEBHOOK)).toBe(true);
      const row = await secretOf(db, project.id, 'discord');
      expect(decryptSecret(row!.secret_encrypted!, env.SECRETS_ENCRYPTION_KEY)).toBe(WEBHOOK);
    }));

  it('rejects non-Discord URLs without calling out', () =>
    withTx(async (db) => {
      const { deps, calls } = setup(db);
      const owner = await createUser(db);
      const project = await createProject(db, owner);
      for (const webhookUrl of [
        'http://discord.com/api/webhooks/1/a',
        'https://evil.com/api/webhooks/1/a',
        'nope',
      ]) {
        expect(await saveDiscord(deps, owner, { projectId: project.id, webhookUrl })).toEqual({
          ok: false,
          error: 'integrations.invalidWebhook',
        });
      }
      expect(calls).toEqual([]);
    }));
});

describe('saveCustomBot', () => {
  it('requires Pro', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const owner = await createUser(db);
      const project = await createProject(db, owner);
      expect(
        await saveCustomBot(deps, owner, { projectId: project.id, token: TOKEN, chatId: '42' }),
      ).toEqual({
        ok: false,
        error: 'integrations.proRequired',
      });
    }));

  it('validates the token and chat id, calls getMe, tests, then stores encrypted', () =>
    withTx(async (db) => {
      const owner = await createUser(db);
      await grantPro(db, owner);
      const project = await createProject(db, owner);
      const { deps, calls } = setup(db);
      expect(
        await saveCustomBot(deps, owner, { projectId: project.id, token: 'bad', chatId: '42' }),
      ).toEqual({
        ok: false,
        error: 'integrations.invalidToken',
      });
      expect(
        await saveCustomBot(deps, owner, { projectId: project.id, token: TOKEN, chatId: 'x y' }),
      ).toEqual({
        ok: false,
        error: 'integrations.invalidChatId',
      });
      const failing = setup(db, { fail: true });
      expect(
        await saveCustomBot(failing.deps, owner, {
          projectId: project.id,
          token: TOKEN,
          chatId: '42',
        }),
      ).toEqual({
        ok: false,
        error: 'integrations.invalidToken',
      });
      expect(
        await saveCustomBot(deps, owner, {
          projectId: project.id,
          token: TOKEN,
          chatId: '-100123',
        }),
      ).toEqual({
        ok: true,
        botUsername: 'acme_bot',
      });
      expect(calls.map((c) => c.url.split('/').pop())).toEqual(['getMe', 'sendMessage']);
      const row = await secretOf(db, project.id, 'telegram_custom');
      expect(row!.target).toBe('-100123');
      expect(decryptSecret(row!.secret_encrypted!, env.SECRETS_ENCRYPTION_KEY)).toBe(TOKEN);
    }));
});

describe('integrationStatus, sendTest, disconnect', () => {
  it('returns secret-free DTOs for all kinds', () =>
    withTx(async (db) => {
      const owner = await createUser(db);
      await grantPro(db, owner);
      const project = await createProject(db, owner);
      const { deps } = setup(db);
      await saveDiscord(deps, owner, { projectId: project.id, webhookUrl: WEBHOOK });
      await saveCustomBot(deps, owner, { projectId: project.id, token: TOKEN, chatId: '42' });
      const status = await integrationStatus(deps, owner, project.id);
      expect(status!.map((s) => [s.kind, s.connected])).toEqual([
        ['telegram_shared', false],
        ['telegram_custom', true],
        ['discord', true],
      ]);
      expect(status!.find((s) => s.kind === 'telegram_custom')!.botUsername).toBe('acme_bot');
      const serialized = JSON.stringify(status);
      expect(serialized).not.toContain('custom_TOKEN');
      expect(serialized).not.toContain('webhooks');
      expect(serialized).not.toContain('"42"');
      const stranger = await createUser(db);
      expect(await integrationStatus(deps, stranger, project.id)).toBeNull();
    }));

  it('sends a test to one integration and disconnects it', () =>
    withTx(async (db) => {
      const owner = await createUser(db);
      const project = await createProject(db, owner);
      const { deps, calls } = setup(db);
      expect(await sendTest(deps, owner, { projectId: project.id, kind: 'discord' })).toEqual({
        ok: false,
        error: 'integrations.notConnected',
      });
      await saveDiscord(deps, owner, { projectId: project.id, webhookUrl: WEBHOOK });
      const before = calls.length;
      expect(await sendTest(deps, owner, { projectId: project.id, kind: 'discord' })).toEqual({
        ok: true,
      });
      expect(calls.length).toBe(before + 1);
      expect(
        await disconnectIntegration(deps, owner, { projectId: project.id, kind: 'discord' }),
      ).toEqual({ ok: true });
      expect(await secretOf(db, project.id, 'discord')).toBeUndefined();
      const stranger = await createUser(db);
      expect(
        await disconnectIntegration(deps, stranger, { projectId: project.id, kind: 'discord' }),
      ).toEqual({
        ok: false,
        error: 'errors.notFound',
      });
    }));
});
