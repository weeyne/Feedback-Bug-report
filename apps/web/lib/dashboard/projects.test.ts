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
import { createMemoryStorage } from '../storage';
import {
  canCreateProject,
  createProject as create,
  getProject,
  hasFeedback,
  listProjects,
  ownsProject,
} from './projects';
import type { DashDeps } from './result';

const deps = (db: TestDb): DashDeps => ({
  db,
  storage: createMemoryStorage(),
  env: parseEnv(VALID_ENV),
  fetch,
});

describe('projects', () => {
  it('lists and reads only the user’s own projects', () =>
    withTx(async (db) => {
      const a = await createUser(db);
      const b = await createUser(db);
      const mine = await createProject(db, a, 'Mine');
      await createProject(db, b, 'Theirs');
      expect(await listProjects(deps(db), a)).toEqual([
        { id: mine.id, name: 'Mine', public_key: mine.public_key },
      ]);
      expect((await getProject(deps(db), a, mine.id))?.name).toBe('Mine');
      expect(await getProject(deps(db), b, mine.id)).toBeNull();
      expect(await getProject(deps(db), a, 'not-a-uuid')).toBeNull();
    }));

  it('creates a project with a normalized origin', () =>
    withTx(async (db) => {
      const a = await createUser(db);
      const result = await create(deps(db), a, { name: '  Acme  ', siteUrl: 'acme.io/landing' });
      expect(result.ok).toBe(true);
      const project = await getProject(deps(db), a, (result as { projectId: string }).projectId);
      expect(project).toMatchObject({ name: 'Acme', allowed_origins: ['https://acme.io'] });
    }));

  it('validates input', () =>
    withTx(async (db) => {
      const a = await createUser(db);
      expect(await create(deps(db), a, { name: '' })).toEqual({
        ok: false,
        error: 'projects.nameInvalid',
      });
      expect(await create(deps(db), a, { name: 'x', siteUrl: 'ftp://x' })).toEqual({
        ok: false,
        error: 'projects.urlInvalid',
      });
    }));

  it('limits Free accounts to one project but not Pro accounts', () =>
    withTx(async (db) => {
      const free = await createUser(db);
      expect(await canCreateProject(deps(db), free)).toBe(true);
      expect((await create(deps(db), free, { name: 'One' })).ok).toBe(true);
      expect(await canCreateProject(deps(db), free)).toBe(false);
      expect(await create(deps(db), free, { name: 'Two' })).toEqual({
        ok: false,
        error: 'projects.limitReached',
      });

      const pro = await createUser(db);
      await grantPro(db, pro);
      await create(deps(db), pro, { name: 'One' });
      expect((await create(deps(db), pro, { name: 'Two' })).ok).toBe(true);
    }));

  it('reports project ownership', () =>
    withTx(async (db) => {
      const a = await createUser(db);
      const b = await createUser(db);
      const project = await createProject(db, a);
      expect(await ownsProject(deps(db), a, project.id)).toBe(true);
      expect(await ownsProject(deps(db), b, project.id)).toBe(false);
      expect(await ownsProject(deps(db), a, 'not-a-uuid')).toBe(false);
    }));

  it('reports whether a project has received feedback', () =>
    withTx(async (db) => {
      const a = await createUser(db);
      const project = await createProject(db, a);
      expect(await hasFeedback(deps(db), a, project.id)).toBe(false);
      await createFeedback(db, project.id);
      expect(await hasFeedback(deps(db), a, project.id)).toBe(true);
      const b = await createUser(db);
      expect(await hasFeedback(deps(db), b, project.id)).toBe(false);
    }));
});
