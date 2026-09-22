import { createProject, createUser, withTx } from '@dymcode/db-tests/harness';
import { describe, expect, it } from 'vitest';
import { withUser } from './with-user';

describe('withUser', () => {
  it('runs queries under RLS as the given user', () =>
    withTx(async (db) => {
      const a = await createUser(db);
      const b = await createUser(db);
      const project = await createProject(db, a, 'Mine');
      const seenByA = await withUser(db, a, (tx) =>
        tx.query<{ id: string }>('select id from public.projects'),
      );
      const seenByB = await withUser(db, b, (tx) => tx.query('select id from public.projects'));
      expect(seenByA).toEqual([{ id: project.id }]);
      expect(seenByB).toEqual([]);
    }));

  it('restores the connection role afterwards', () =>
    withTx(async (db) => {
      const a = await createUser(db);
      await withUser(db, a, (tx) => tx.query('select 1'));
      const [row] = await db.query<{ role: string; claims: string }>(
        `select current_user as role, coalesce(current_setting('request.jwt.claims', true), '') as claims`,
      );
      expect(row!.role).not.toBe('authenticated');
      expect(row!.claims).toBe('');
    }));

  it('rolls back and restores the role when the callback throws', () =>
    withTx(async (db) => {
      const a = await createUser(db);
      await expect(
        withUser(db, a, async (tx) => {
          await tx.query(`insert into public.projects (owner_id, name) values ($1, 'x')`, [a]);
          return 1;
        }),
      ).rejects.toThrow(/permission denied/);
      const [row] = await db.query<{ role: string }>('select current_user as role');
      expect(row!.role).not.toBe('authenticated');
    }));
});
