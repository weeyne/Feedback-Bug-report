import { describe, expect, it } from 'vitest';
import { withTx } from './db';
import { createUser } from './fixtures';

describe('profiles', () => {
  it('creates a profile when an auth user signs up', () =>
    withTx(async (db) => {
      const id = await createUser(db, 'maker@test.dev');
      const rows = await db.query('select email from public.profiles where id = $1', [id]);
      expect(rows).toEqual([{ email: 'maker@test.dev' }]);
    }));

  it('has RLS enabled', () =>
    withTx(async (db) => {
      const rows = await db.query(
        `select relrowsecurity from pg_class where oid = 'public.profiles'::regclass`,
      );
      expect(rows).toEqual([{ relrowsecurity: true }]);
    }));
});

describe('random_base62', () => {
  it('returns a base62 string of the requested length', () =>
    withTx(async (db) => {
      const [row] = await db.query<{ value: string }>('select public.random_base62(16) as value');
      expect(row?.value).toMatch(/^[0-9A-Za-z]{16}$/);
    }));
});
