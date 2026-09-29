import {
  createFeedback,
  createProject,
  createUser,
  grantPro,
  withTx,
  type TestDb,
} from '@bugping/db-tests/harness';
import { describe, expect, it } from 'vitest';
import { VALID_ENV } from '@/test/fixtures';
import { parseEnv } from '../env';
import { createMemoryStorage, type MemoryStorage } from '../storage';
import { usage } from './feedback';
import { getProject } from './projects';
import type { DashDeps } from './result';
import { allowBlockedOrigin, deleteProject, updateProjectSettings } from './settings';

const valid = {
  name: 'Renamed',
  primaryColor: '#112233',
  triggerText: 'Report',
  position: 'bottom-left',
  locale: 'ru',
  allowedOrigins: ['shop.example.com/path', 'http://localhost:3000', 'shop.example.com'],
  hideBadge: true,
  customCss: '.bp-root { color: red; }',
};

function setup(db: TestDb) {
  const storage: MemoryStorage = createMemoryStorage();
  const deps: DashDeps = { db, storage, env: parseEnv(VALID_ENV), fetch };
  return { deps, storage };
}

describe('updateProjectSettings', () => {
  it('saves normalized settings for a Pro owner', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const owner = await createUser(db);
      await grantPro(db, owner);
      const project = await createProject(db, owner);
      expect(await updateProjectSettings(deps, owner, project.id, valid)).toEqual({ ok: true });
      expect(await getProject(deps, owner, project.id)).toMatchObject({
        name: 'Renamed',
        primary_color: '#112233',
        trigger_text: 'Report',
        position: 'bottom-left',
        locale: 'ru',
        allowed_origins: ['https://shop.example.com', 'http://localhost:3000'],
        hide_badge: true,
        custom_css: '.bp-root { color: red; }',
      });
    }));

  it('keeps Pro-only fields unchanged for Free owners', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const owner = await createUser(db);
      const project = await createProject(db, owner);
      expect(await updateProjectSettings(deps, owner, project.id, valid)).toEqual({ ok: true });
      expect(await getProject(deps, owner, project.id)).toMatchObject({
        name: 'Renamed',
        hide_badge: false,
        custom_css: null,
      });
    }));

  it('rejects invalid input', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const owner = await createUser(db);
      await grantPro(db, owner);
      const project = await createProject(db, owner);
      const cases: Array<[Record<string, unknown>, string]> = [
        [{ primaryColor: 'red' }, 'settings.colorInvalid'],
        [{ triggerText: '' }, 'settings.triggerInvalid'],
        [{ triggerText: 'x'.repeat(41) }, 'settings.triggerInvalid'],
        [{ allowedOrigins: ['ftp://x.com'] }, 'settings.originInvalid'],
        [
          { allowedOrigins: Array.from({ length: 21 }, (_, i) => `s${i}.example.com`) },
          'settings.tooManyOrigins',
        ],
        [
          {
            allowedOrigins: Array.from(
              { length: 20 },
              (_, i) => `s${i}-${'x'.repeat(220)}.example.com`,
            ),
          },
          'settings.originsTooLong',
        ],
        [{ customCss: 'ж'.repeat(5121) }, 'settings.cssTooLarge'],
      ];
      for (const [patch, error] of cases) {
        expect(
          await updateProjectSettings(deps, owner, project.id, { ...valid, ...patch }),
        ).toEqual({ ok: false, error });
      }
      expect(
        await updateProjectSettings(deps, owner, project.id, {
          ...valid,
          customCss: 'a'.repeat(10240),
        }),
      ).toEqual({
        ok: true,
      });
    }));

  it('does not touch other users’ projects', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const owner = await createUser(db);
      const project = await createProject(db, owner);
      const stranger = await createUser(db);
      expect(await updateProjectSettings(deps, stranger, project.id, valid)).toEqual({
        ok: false,
        error: 'errors.notFound',
      });
      expect((await getProject(deps, owner, project.id))?.name).toBe('Test project');
    }));
});

describe('deleteProject', () => {
  it('requires the exact name and removes screenshots, including hidden ones', () =>
    withTx(async (db) => {
      const { deps, storage } = setup(db);
      const owner = await createUser(db);
      const project = await createProject(db, owner, 'Acme');
      const visible = await createFeedback(db, project.id);
      const hidden = await createFeedback(db, project.id, { overQuota: true });
      for (const id of [visible, hidden]) {
        const path = `${project.id}/${id}.webp`;
        await storage.upload(path, new Uint8Array([1]), 'image/webp');
        await db.query('update public.feedback set screenshot_path = $1 where id = $2', [path, id]);
      }
      expect(
        await deleteProject(deps, owner, { projectId: project.id, confirmName: 'acme' }),
      ).toEqual({
        ok: false,
        error: 'settings.confirmMismatch',
      });
      const stranger = await createUser(db);
      expect(
        await deleteProject(deps, stranger, { projectId: project.id, confirmName: 'Acme' }),
      ).toEqual({
        ok: false,
        error: 'errors.notFound',
      });
      expect(
        await deleteProject(deps, owner, { projectId: project.id, confirmName: 'Acme' }),
      ).toEqual({ ok: true });
      expect(await getProject(deps, owner, project.id)).toBeNull();
      expect(storage.files.size).toBe(0);
    }));
});

describe('deleteProject quota refund', () => {
  it('gives back one unit per current-month report and none for older ones', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const owner = await createUser(db);
      const project = await createProject(db, owner, 'Acme');
      for (let i = 0; i < 3; i++) await createFeedback(db, project.id);
      const old = await createFeedback(db, project.id);
      await db.query(
        `update public.feedback set created_at = now() - interval '40 days' where id = $1`,
        [old],
      );
      await db.query(
        `insert into public.usage_counters (owner_id, period, count)
         values ($1, date_trunc('month', now() at time zone 'utc')::date, 10)`,
        [owner],
      );
      expect(
        await deleteProject(deps, owner, { projectId: project.id, confirmName: 'Acme' }),
      ).toEqual({ ok: true });
      expect((await usage(deps, owner)).used).toBe(7);
    }));

  it('refunds nothing when the project is already gone by the time of the delete', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const owner = await createUser(db);
      const project = await createProject(db, owner, 'Acme');
      for (let i = 0; i < 3; i++) await createFeedback(db, project.id);
      await db.query(
        `insert into public.usage_counters (owner_id, period, count)
         values ($1, date_trunc('month', now() at time zone 'utc')::date, 10)`,
        [owner],
      );
      const racing: DashDeps = {
        ...deps,
        db: {
          ...db,
          query: async (sql, params) => {
            const rows = await db.query(sql, params);
            if (/count\(\*\)/.test(sql) && sql.includes('public.feedback')) {
              await db.query('delete from public.projects where id = $1', [project.id]);
            }
            return rows;
          },
          transaction: (fn) => db.transaction(fn),
        } as TestDb,
      };
      await deleteProject(racing, owner, { projectId: project.id, confirmName: 'Acme' });
      expect((await usage(deps, owner)).used).toBe(10);
    }));

  it('never takes the counter below zero', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const owner = await createUser(db);
      const project = await createProject(db, owner, 'Acme');
      for (let i = 0; i < 3; i++) await createFeedback(db, project.id);
      await db.query(
        `insert into public.usage_counters (owner_id, period, count)
         values ($1, date_trunc('month', now() at time zone 'utc')::date, 1)`,
        [owner],
      );
      await deleteProject(deps, owner, { projectId: project.id, confirmName: 'Acme' });
      expect((await usage(deps, owner)).used).toBe(0);
    }));
});

describe('allowBlockedOrigin', () => {
  async function blockedProject(db: TestDb, origins: string, blocked: string) {
    const owner = await createUser(db);
    const project = await createProject(db, owner);
    await db.query(
      `update public.projects set allowed_origins = $2::text[], blocked_origin = $3,
         blocked_origin_at = now() where id = $1`,
      [project.id, origins === '' ? [] : origins.split(','), blocked],
    );
    return { owner, project };
  }

  it('adds the blocked origin to the list and clears the notice', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const { owner, project } = await blockedProject(
        db,
        'https://shop.example',
        'https://evil.example',
      );
      expect(await allowBlockedOrigin(deps, owner, project.id)).toEqual({ ok: true });
      const detail = await getProject(deps, owner, project.id);
      expect(detail?.allowed_origins).toEqual(['https://shop.example', 'https://evil.example']);
      expect(detail?.blocked_origin).toBeNull();
      expect(detail?.blocked_origin_at).toBeNull();
    }));

  it('only clears the notice when the list already allows the origin', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const { owner, project } = await blockedProject(
        db,
        'https://shop.example',
        'https://www.shop.example',
      );
      expect(await allowBlockedOrigin(deps, owner, project.id)).toEqual({ ok: true });
      const detail = await getProject(deps, owner, project.id);
      expect(detail?.allowed_origins).toEqual(['https://shop.example']);
      expect(detail?.blocked_origin).toBeNull();
    }));

  it('refuses when the list is full', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const full = Array.from({ length: 20 }, (_, i) => `https://s${i}.example`).join(',');
      const { owner, project } = await blockedProject(db, full, 'https://evil.example');
      expect(await allowBlockedOrigin(deps, owner, project.id)).toEqual({
        ok: false,
        error: 'settings.tooManyOrigins',
      });
    }));

  it("cannot touch another user's project", () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const { project } = await blockedProject(db, 'https://shop.example', 'https://evil.example');
      const stranger = await createUser(db);
      expect(await allowBlockedOrigin(deps, stranger, project.id)).toEqual({
        ok: false,
        error: 'errors.notFound',
      });
    }));
});
