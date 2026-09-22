import {
  createFeedback,
  createProject,
  createUser,
  withTx,
  type TestDb,
} from '@dymcode/db-tests/harness';
import { describe, expect, it } from 'vitest';
import { VALID_ENV } from '@/test/fixtures';
import type { AuthAdmin } from '../auth/admin';
import { parseEnv } from '../env';
import { createMemoryStorage } from '../storage';
import { deleteAccount } from './account';

const dbAdmin = (db: TestDb): AuthAdmin => ({
  deleteUser: async (id) => {
    await db.query('delete from auth.users where id = $1', [id]);
  },
});

describe('deleteAccount', () => {
  it('requires the email, removes screenshots of every owned project and deletes the user', () =>
    withTx(async (db) => {
      const storage = createMemoryStorage();
      const deps = { db, storage, env: parseEnv(VALID_ENV), fetch, authAdmin: dbAdmin(db) };
      const email = 'owner@example.com';
      const owner = await createUser(db, email);
      const other = await createUser(db);
      const mine = await createProject(db, owner);
      const theirs = await createProject(db, other);
      const paths: string[] = [];
      for (const project of [mine, theirs]) {
        const id = await createFeedback(db, project.id, { overQuota: project === mine });
        const path = `${project.id}/${id}.webp`;
        paths.push(path);
        await storage.upload(path, new Uint8Array([1]), 'image/webp');
        await db.query('update public.feedback set screenshot_path = $1 where id = $2', [path, id]);
      }

      expect(await deleteAccount(deps, { id: owner, email }, 'wrong@example.com')).toEqual({
        ok: false,
        error: 'account.confirmMismatch',
      });
      expect(await deleteAccount(deps, { id: owner, email }, '  OWNER@example.com ')).toEqual({
        ok: true,
      });
      expect(await db.query('select 1 from auth.users where id = $1', [owner])).toEqual([]);
      expect(await db.query('select 1 from public.projects where id = $1', [mine.id])).toEqual([]);
      expect([...storage.files.keys()]).toEqual([paths[1]]);
    }));
});
