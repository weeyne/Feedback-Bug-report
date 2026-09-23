import { createProject, createUser, withTx, type TestDb } from '@bugping/db-tests/harness';
import { describe, expect, it } from 'vitest';
import { attributeReferral } from './referral';

const referredBy = (db: TestDb, userId: string) =>
  db
    .query<{ ref: string | null }>(
      'select referred_by_project as ref from public.profiles where id = $1',
      [userId],
    )
    .then((rows) => rows[0]!.ref);

describe('attributeReferral', () => {
  it('attributes a new user to the referring project once', () =>
    withTx(async (db) => {
      const owner = await createUser(db);
      const project = await createProject(db, owner);
      const newcomer = await createUser(db);
      expect(await attributeReferral(db, newcomer, project.public_key)).toBe(true);
      expect(await referredBy(db, newcomer)).toBe(project.id);
      const other = await createProject(db, owner, 'Other');
      expect(await attributeReferral(db, newcomer, other.public_key)).toBe(false);
      expect(await referredBy(db, newcomer)).toBe(project.id);
    }));

  it('ignores own projects, unknown or malformed keys, and old accounts', () =>
    withTx(async (db) => {
      const owner = await createUser(db);
      const project = await createProject(db, owner);
      expect(await attributeReferral(db, owner, project.public_key)).toBe(false);
      const newcomer = await createUser(db);
      expect(await attributeReferral(db, newcomer, 'pk_AbCdEfGh12345678')).toBe(false);
      expect(await attributeReferral(db, newcomer, 'garbage')).toBe(false);
      const veteran = await createUser(db);
      await db.query(
        `update public.profiles set created_at = now() - interval '2 days' where id = $1`,
        [veteran],
      );
      expect(await attributeReferral(db, veteran, project.public_key)).toBe(false);
    }));
});
