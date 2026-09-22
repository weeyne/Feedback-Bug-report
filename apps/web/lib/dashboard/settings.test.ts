import {
  createFeedback,
  createProject,
  createUser,
  grantPro,
  withTx,
  type TestDb,
} from '@dymcode/db-tests/harness';
import { describe, expect, it } from 'vitest';
import { VALID_ENV } from '@/test/fixtures';
import { parseEnv } from '../env';
import { createMemoryStorage, type MemoryStorage } from '../storage';
import { getProject } from './projects';
import type { DashDeps } from './result';
import { deleteProject, updateProjectSettings } from './settings';

const valid = {
  name: 'Renamed',
  primaryColor: '#112233',
  triggerText: 'Report',
  position: 'bottom-left',
  locale: 'ru',
  allowedOrigins: ['shop.example.com/path', 'http://localhost:3000', 'shop.example.com'],
  hideBadge: true,
  customCss: '.dc-root { color: red; }',
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
        custom_css: '.dc-root { color: red; }',
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
