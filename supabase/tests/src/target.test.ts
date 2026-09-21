import { describe, expect, it } from 'vitest';
import { withTx } from './db';

// Proves that the "supabase" DB_TEST_TARGET actually ran against real Supabase and not
// accidentally fell back to PGlite: PGlite executes everything as a superuser, but the
// Supabase local stack's `postgres` connection role is not a superuser.
describe('DB_TEST_TARGET=supabase sanity', () => {
  it.runIf(process.env.DB_TEST_TARGET === 'supabase')('does not run as a superuser role', () =>
    withTx(async (db) => {
      const [row] = await db.query<{ rolsuper: boolean }>(
        `select rolsuper from pg_roles where rolname = current_user`,
      );
      expect(row?.rolsuper).toBe(false);
    }),
  );
});
