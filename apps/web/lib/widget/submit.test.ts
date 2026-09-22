import {
  createProject,
  createUser,
  grantPro,
  withTx,
  type TestDb,
} from '@dymcode/db-tests/harness';
import { SCREENSHOT_MAX_BYTES } from '@dymcode/shared';
import { describe, expect, it, vi } from 'vitest';
import type { Db } from '../db/types';
import { createMemoryStorage } from '../storage';
import { handleSubmit, type SubmitDeps } from './submit';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';

function payload(projectKey: string, overrides: Record<string, unknown> = {}) {
  return {
    projectKey,
    type: 'bug',
    message: 'Checkout button does nothing',
    email: 'ann@example.com',
    metadata: {
      url: 'https://host.example/checkout',
      referrer: '',
      userAgent: UA,
      language: 'en-US',
      timezone: 'Europe/London',
      viewport: { w: 1280, h: 720 },
      screen: { w: 1920, h: 1080, dpr: 2 },
      consoleErrors: [],
    },
    elapsedMs: 5000,
    website: '',
    ...overrides,
  };
}

function request(
  body: object | string,
  opts: {
    screenshot?: Blob;
    /** `null` omits the Origin header entirely; omitted defaults to 'https://host.example'. */
    origin?: string | null;
    ip?: string;
    headers?: Record<string, string>;
  } = {},
) {
  const form = new FormData();
  form.append('payload', typeof body === 'string' ? body : JSON.stringify(body));
  if (opts.screenshot) form.append('screenshot', opts.screenshot, 'screenshot');
  const headers: Record<string, string> = {
    'x-forwarded-for': opts.ip ?? '203.0.113.7',
    ...opts.headers,
  };
  const origin = opts.origin === undefined ? 'https://host.example' : opts.origin;
  if (origin !== null) headers.origin = origin;
  return new Request('https://dymcode.dev/api/v1/widget/submit', {
    method: 'POST',
    body: form,
    headers,
  });
}

function setup(db: TestDb) {
  const tasks: Array<() => Promise<void>> = [];
  const storage = createMemoryStorage();
  const notify = { feedback: vi.fn(async () => {}), quotaNotice: vi.fn(async () => {}) };
  const deps: SubmitDeps = {
    db,
    storage,
    env: { IP_HASH_SALT: 'test-salt-0123456789abcdef' },
    after: (task) => tasks.push(task),
    notify,
  };
  const runAfter = async () => {
    for (const task of tasks.splice(0)) await task();
  };
  return { deps, storage, notify, runAfter };
}

async function freeProject(db: TestDb) {
  const owner = await createUser(db);
  return { owner, ...(await createProject(db, owner, 'Acme')) };
}

const feedbackRows = (db: TestDb, projectId: string) =>
  db.query<{
    id: string;
    type: string;
    message: string;
    email: string | null;
    screenshot_path: string | null;
    over_quota: boolean;
    metadata: { browser: string; os: string; url: string };
  }>(
    `select id, type::text as type, message, email, screenshot_path, over_quota, metadata
     from public.feedback where project_id = $1 order by created_at`,
    [projectId],
  );

describe('handleSubmit', () => {
  it('stores feedback with parsed browser/OS and schedules a notification', () =>
    withTx(async (db) => {
      const { deps, notify, runAfter } = setup(db);
      const project = await freeProject(db);
      const res = await handleSubmit(deps, request(payload(project.public_key)));
      expect(res.status).toBe(201);
      expect(res.headers.get('access-control-allow-origin')).toBe('https://host.example');
      const { id } = await res.json();
      const [row] = await feedbackRows(db, project.id);
      expect(row).toMatchObject({
        id,
        type: 'bug',
        message: 'Checkout button does nothing',
        email: 'ann@example.com',
        screenshot_path: null,
        over_quota: false,
      });
      expect(row!.metadata.browser).toMatch(/^Chrome 129/);
      expect(row!.metadata.os).toMatch(/^Windows/);
      expect(notify.feedback).not.toHaveBeenCalled();
      await runAfter();
      expect(notify.feedback).toHaveBeenCalledWith(id);
    }));

  it('stores the screenshot under project/feedback id', () =>
    withTx(async (db) => {
      const { deps, storage } = setup(db);
      const project = await freeProject(db);
      const shot = new Blob([new Uint8Array(2000)], { type: 'image/webp' });
      const res = await handleSubmit(
        deps,
        request(payload(project.public_key), { screenshot: shot }),
      );
      const { id } = await res.json();
      const path = `${project.id}/${id}.webp`;
      expect(storage.files.get(path)?.contentType).toBe('image/webp');
      expect((await feedbackRows(db, project.id))[0]!.screenshot_path).toBe(path);
    }));

  it('saves feedback without a screenshot when the upload fails', () =>
    withTx(async (db) => {
      const { deps, storage } = setup(db);
      storage.failUploads = true;
      const project = await freeProject(db);
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      const shot = new Blob([new Uint8Array(10)], { type: 'image/jpeg' });
      const res = await handleSubmit(
        deps,
        request(payload(project.public_key), { screenshot: shot }),
      );
      expect(res.status).toBe(201);
      expect((await feedbackRows(db, project.id))[0]!.screenshot_path).toBeNull();
      error.mockRestore();
    }));

  it('rejects oversized bodies with 413', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const project = await freeProject(db);
      const res = await handleSubmit(
        deps,
        request(payload(project.public_key), {
          headers: { 'content-length': String(3 * 1024 * 1024) },
        }),
      );
      expect(res.status).toBe(413);
    }));

  it('rejects malformed payloads and screenshots with 400', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const project = await freeProject(db);
      expect((await handleSubmit(deps, request('{not json'))).status).toBe(400);
      const invalid = await handleSubmit(
        deps,
        request(payload(project.public_key, { message: '   ' })),
      );
      expect(invalid.status).toBe(400);
      expect((await invalid.json()).issues[0].path).toBe('message');
      const gif = new Blob([new Uint8Array(10)], { type: 'image/gif' });
      expect(
        (await handleSubmit(deps, request(payload(project.public_key), { screenshot: gif })))
          .status,
      ).toBe(400);
    }));

  it('returns 404 for an unknown project', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      expect((await handleSubmit(deps, request(payload('pk_AbCdEfGh12345678')))).status).toBe(404);
    }));

  it('enforces allowed origins when configured', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const project = await freeProject(db);
      await db.query(
        `update public.projects set allowed_origins = '{https://shop.example}' where id = $1`,
        [project.id],
      );
      expect((await handleSubmit(deps, request(payload(project.public_key)))).status).toBe(403);
      const ok = await handleSubmit(
        deps,
        request(payload(project.public_key), { origin: 'https://shop.example' }),
      );
      expect(ok.status).toBe(201);
    }));

  it('silently drops bot submissions', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const project = await freeProject(db);
      const honeypot = await handleSubmit(
        deps,
        request(payload(project.public_key, { website: 'http://spam' })),
      );
      expect(honeypot.status).toBe(200);
      expect(await honeypot.json()).toEqual({ id: null });
      const fast = await handleSubmit(
        deps,
        request(payload(project.public_key, { elapsedMs: 1500 })),
      );
      expect(await fast.json()).toEqual({ id: null });
      expect(await feedbackRows(db, project.id)).toEqual([]);
    }));

  it('rate limits 5 submissions per minute per project and IP', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const project = await freeProject(db);
      for (let i = 0; i < 5; i++) {
        expect((await handleSubmit(deps, request(payload(project.public_key)))).status).toBe(201);
      }
      expect((await handleSubmit(deps, request(payload(project.public_key)))).status).toBe(429);
      const otherIp = await handleSubmit(
        deps,
        request(payload(project.public_key), { ip: '198.51.100.9' }),
      );
      expect(otherIp.status).toBe(201);
    }));

  it('hides submissions over the Free quota and sends one quota notice', () =>
    withTx(async (db) => {
      const { deps, notify, runAfter } = setup(db);
      const project = await freeProject(db);
      await db.query(
        `insert into public.usage_counters (owner_id, period, count)
         values ($1, date_trunc('month', now() at time zone 'utc')::date, 20)`,
        [project.owner],
      );
      await handleSubmit(deps, request(payload(project.public_key)));
      await handleSubmit(deps, request(payload(project.public_key), { ip: '198.51.100.9' }));
      await runAfter();
      const rows = await feedbackRows(db, project.id);
      expect(rows.map((r) => r.over_quota)).toEqual([true, true]);
      expect(notify.feedback).not.toHaveBeenCalled();
      expect(notify.quotaNotice).toHaveBeenCalledTimes(1);
      expect(notify.quotaNotice).toHaveBeenCalledWith(project.id);
    }));

  it('never applies the quota to Pro owners', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const project = await freeProject(db);
      await grantPro(db, project.owner);
      await db.query(
        `insert into public.usage_counters (owner_id, period, count)
         values ($1, date_trunc('month', now() at time zone 'utc')::date, 500)`,
        [project.owner],
      );
      await handleSubmit(deps, request(payload(project.public_key)));
      expect((await feedbackRows(db, project.id))[0]!.over_quota).toBe(false);
    }));

  it('does not mark the 20th monthly submission as over quota but does mark the 21st', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const project = await freeProject(db);
      await db.query(
        `insert into public.usage_counters (owner_id, period, count)
         values ($1, date_trunc('month', now() at time zone 'utc')::date, 19)`,
        [project.owner],
      );
      await handleSubmit(deps, request(payload(project.public_key)));
      await handleSubmit(deps, request(payload(project.public_key), { ip: '198.51.100.9' }));
      const rows = await feedbackRows(db, project.id);
      expect(rows.map((r) => r.over_quota)).toEqual([false, true]);
    }));

  it('rejects a request with no Origin header when allowed_origins is configured', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const project = await freeProject(db);
      await db.query(
        `update public.projects set allowed_origins = '{https://shop.example}' where id = $1`,
        [project.id],
      );
      const res = await handleSubmit(deps, request(payload(project.public_key), { origin: null }));
      expect(res.status).toBe(403);
    }));

  it('rejects a screenshot larger than the max size with 400', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const project = await freeProject(db);
      const big = new Blob([new Uint8Array(SCREENSHOT_MAX_BYTES + 1)], { type: 'image/webp' });
      const res = await handleSubmit(
        deps,
        request(payload(project.public_key), { screenshot: big }),
      );
      expect(res.status).toBe(400);
    }));

  it('strips NUL bytes from stored strings while still storing the screenshot', () =>
    withTx(async (db) => {
      const { deps, storage } = setup(db);
      const project = await freeProject(db);
      const shot = new Blob([new Uint8Array(2000)], { type: 'image/webp' });
      const res = await handleSubmit(
        deps,
        request(payload(project.public_key, { message: 'a\u0000b' }), { screenshot: shot }),
      );
      expect(res.status).toBe(201);
      const { id } = await res.json();
      const [row] = await feedbackRows(db, project.id);
      expect(row!.message).toBe('ab');
      const path = `${project.id}/${id}.webp`;
      expect(storage.files.has(path)).toBe(true);
    }));

  it('removes the uploaded screenshot and returns 500 when the insert fails', () =>
    withTx(async (db) => {
      const { deps, storage } = setup(db);
      const project = await freeProject(db);
      const throwingDb: Db = {
        query: async (sql, params) => {
          if (/insert into public\.feedback/.test(sql)) throw new Error('simulated insert failure');
          return db.query(sql, params);
        },
      };
      const shot = new Blob([new Uint8Array(2000)], { type: 'image/webp' });
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      const res = await handleSubmit(
        { ...deps, db: throwingDb },
        request(payload(project.public_key), { screenshot: shot }),
      );
      expect(res.status).toBe(500);
      expect(storage.files.size).toBe(0);
      error.mockRestore();
    }));
});
