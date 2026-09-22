import {
  createFeedback,
  createProject,
  createUser,
  grantPro,
  withTx,
  type TestDb,
} from '@dymcode/db-tests/harness';
import { describe, expect, it, vi } from 'vitest';
import { encryptSecret } from '../crypto';
import { createMemoryStorage } from '../storage';
import { dispatchFeedback, dispatchQuotaNotice, type DispatchDeps } from './dispatch';

const KEY = Buffer.alloc(32, 3).toString('base64');
const SHARED_TOKEN = '111:SHARED';
const DISCORD = 'https://discord.com/api/webhooks/9/hook';
const FULL_METADATA = {
  url: 'https://host.example/',
  referrer: '',
  userAgent: 'UA',
  language: 'en',
  timezone: 'UTC',
  viewport: { w: 1280, h: 720 },
  screen: { w: 1920, h: 1080, dpr: 1 },
  consoleErrors: [],
  browser: 'Chrome 129',
  os: 'Windows 10',
};

/** The harness leaves metadata as {}; notifications need the full shape. */
async function feedback(db: TestDb, projectId: string, message = 'Something broke') {
  const id = await createFeedback(db, projectId, { message });
  await db.query('update public.feedback set metadata = $1::jsonb where id = $2', [
    JSON.stringify(FULL_METADATA),
    id,
  ]);
  return id;
}

type Route = (url: string, init?: RequestInit) => Response;

function setup(
  db: TestDb,
  route: Route = () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return route(url, init);
  });
  const storage = createMemoryStorage();
  const deps: DispatchDeps = {
    db,
    storage,
    fetch: fetchImpl as typeof fetch,
    env: {
      TELEGRAM_BOT_TOKEN: SHARED_TOKEN,
      SECRETS_ENCRYPTION_KEY: KEY,
      NEXT_PUBLIC_APP_URL: 'https://dymcode.dev',
    },
    sleep: async () => {},
  };
  return { deps, calls, storage };
}

async function projectWith(db: TestDb, opts: { pro?: boolean } = {}) {
  const owner = await createUser(db);
  if (opts.pro) await grantPro(db, owner);
  const project = await createProject(db, owner, 'Acme');
  return { owner, ...project };
}

async function addIntegration(
  db: TestDb,
  projectId: string,
  kind: 'telegram_shared' | 'telegram_custom' | 'discord',
  opts: { target?: string | null; secret?: string | null; enabled?: boolean } = {},
) {
  const [row] = await db.query<{ id: string }>(
    `insert into public.integrations (project_id, kind, target, secret_encrypted, enabled)
     values ($1, $2, $3, $4, $5) returning id`,
    [projectId, kind, opts.target ?? null, opts.secret ?? null, opts.enabled ?? true],
  );
  return row!.id;
}

const integration = (db: TestDb, id: string) =>
  db
    .query<{ enabled: boolean; last_error: string | null; delivered: boolean }>(
      `select enabled, last_error, last_delivered_at is not null as delivered from public.integrations where id = $1`,
      [id],
    )
    .then((rows) => rows[0]!);

describe('dispatchFeedback', () => {
  it('delivers to the shared bot and records success', () =>
    withTx(async (db) => {
      const { deps, calls } = setup(db);
      const project = await projectWith(db);
      const tg = await addIntegration(db, project.id, 'telegram_shared', { target: '4242' });
      const feedbackId = await feedback(db, project.id, 'Broken checkout');
      await dispatchFeedback(deps, feedbackId);
      expect(calls).toHaveLength(1);
      expect(calls[0]!.url).toBe(`https://api.telegram.org/bot${SHARED_TOKEN}/sendMessage`);
      const body = JSON.parse(String(calls[0]!.init!.body));
      expect(body.chat_id).toBe('4242');
      expect(body.text).toContain('Broken checkout');
      expect(body.text).toContain(
        `https://dymcode.dev/projects/${project.id}/feedback?f=${feedbackId}`,
      );
      expect(await integration(db, tg)).toEqual({
        enabled: true,
        last_error: null,
        delivered: true,
      });
    }));

  it('attaches the stored screenshot', () =>
    withTx(async (db) => {
      const { deps, calls, storage } = setup(db);
      const project = await projectWith(db);
      await addIntegration(db, project.id, 'telegram_shared', { target: '4242' });
      const feedbackId = await feedback(db, project.id);
      const path = `${project.id}/${feedbackId}.webp`;
      await storage.upload(path, new Uint8Array([1, 2, 3]), 'image/webp');
      await db.query('update public.feedback set screenshot_path = $1 where id = $2', [
        path,
        feedbackId,
      ]);
      await dispatchFeedback(deps, feedbackId);
      expect(calls[0]!.url).toMatch(/\/sendPhoto$/);
      expect(((calls[0]!.init!.body as FormData).get('photo') as File).name).toBe(
        'screenshot.webp',
      );
    }));

  it('uses a custom bot only for Pro owners', () =>
    withTx(async (db) => {
      const secret = encryptSecret('222:CUSTOM', KEY);
      const free = setup(db);
      const freeProject = await projectWith(db);
      const freeBot = await addIntegration(db, freeProject.id, 'telegram_custom', {
        target: '1',
        secret,
      });
      await dispatchFeedback(free.deps, await feedback(db, freeProject.id));
      expect(free.calls).toHaveLength(0);
      expect(await integration(db, freeBot)).toEqual({
        enabled: true,
        last_error: null,
        delivered: false,
      });

      const pro = setup(db);
      const proProject = await projectWith(db, { pro: true });
      await addIntegration(db, proProject.id, 'telegram_custom', { target: '1', secret });
      await dispatchFeedback(pro.deps, await feedback(db, proProject.id));
      expect(pro.calls[0]!.url).toBe('https://api.telegram.org/bot222:CUSTOM/sendMessage');
    }));

  it('disables Discord on 404 and isolates unreadable secrets', () =>
    withTx(async (db) => {
      const { deps, calls } = setup(db, (url) =>
        url.startsWith('https://discord.com')
          ? new Response('{}', { status: 404 })
          : new Response(JSON.stringify({ ok: true })),
      );
      const project = await projectWith(db);
      const discord = await addIntegration(db, project.id, 'discord', {
        secret: encryptSecret(DISCORD, KEY),
      });
      const shared = await addIntegration(db, project.id, 'telegram_shared', { target: '4242' });
      const broken = await addIntegration(db, project.id, 'telegram_custom', {
        target: '5',
        secret: 'v1:broken',
      });
      await grantPro(db, project.owner);
      await dispatchFeedback(deps, await feedback(db, project.id));
      expect(await integration(db, discord)).toMatchObject({
        enabled: false,
        last_error: 'HTTP 404',
      });
      expect(await integration(db, shared)).toMatchObject({ enabled: true, delivered: true });
      expect(await integration(db, broken)).toMatchObject({
        enabled: true,
        last_error: 'secret unreadable',
      });
      expect(calls.map((c) => new URL(c.url).hostname).sort()).toEqual([
        'api.telegram.org',
        'discord.com',
      ]);
    }));

  it('retries once after a rate limit and ignores disabled integrations', () =>
    withTx(async (db) => {
      let attempts = 0;
      const { deps, calls } = setup(db, () =>
        ++attempts === 1
          ? new Response(
              JSON.stringify({
                ok: false,
                description: 'Too Many Requests',
                parameters: { retry_after: 9 },
              }),
              {
                status: 429,
              },
            )
          : new Response(JSON.stringify({ ok: true })),
      );
      const sleep = vi.fn(async () => {});
      deps.sleep = sleep;
      const project = await projectWith(db);
      const tg = await addIntegration(db, project.id, 'telegram_shared', { target: '4242' });
      await addIntegration(db, project.id, 'discord', {
        secret: encryptSecret(DISCORD, KEY),
        enabled: false,
      });
      await dispatchFeedback(deps, await feedback(db, project.id));
      expect(calls).toHaveLength(2);
      expect(sleep).toHaveBeenCalledWith(3000);
      expect(await integration(db, tg)).toMatchObject({ delivered: true, last_error: null });
    }));
});

describe('dispatchQuotaNotice', () => {
  it('sends the limit notice to every enabled channel', () =>
    withTx(async (db) => {
      const { deps, calls } = setup(db, (url) =>
        url.startsWith('https://discord.com')
          ? new Response(null, { status: 204 })
          : new Response(JSON.stringify({ ok: true })),
      );
      const project = await projectWith(db);
      await addIntegration(db, project.id, 'telegram_shared', { target: '4242' });
      await addIntegration(db, project.id, 'discord', { secret: encryptSecret(DISCORD, KEY) });
      await dispatchQuotaNotice(deps, project.id);
      expect(calls).toHaveLength(2);
      for (const call of calls)
        expect(String(call.init!.body)).toContain('free limit of 20 submissions');
    }));
});
