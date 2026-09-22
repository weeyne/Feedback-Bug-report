import type { Db } from './types';

/**
 * Runs fn as `userId` under the database's RLS policies, the way PostgREST does for a JWT:
 * role `authenticated` + request.jwt.claims. The role is reset before the transaction ends.
 */
export async function withUser<T>(db: Db, userId: string, fn: (tx: Db) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    // One round trip: set_config('role', …) drives the same "role" GUC as `set local role`, so
    // both settings can go through a single parameterized SELECT. Verified on PGlite (this file's
    // own tests, plus a manual probe): current_user becomes `authenticated`, RLS sees
    // request.jwt.claims, and the transaction-local scope still reverts both at commit/rollback.
    // Not separately verified against a live Postgres/Supabase connection (Docker is unavailable
    // here), but "role" is a regular GUC on the server side and set_config()/SET go through the
    // same assign hook, so real Postgres is expected to behave the same way.
    await tx.query(
      `select set_config('role', 'authenticated', true), set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: userId, role: 'authenticated' })],
    );
    const result = await fn(tx);
    // Teardown is intentionally kept as two statements. `reset role` is a utility statement, not
    // an expression, so it cannot be folded into the same SELECT as set_config(). Sending both as
    // one semicolon-joined string in a single query() call would save the round trip, but PGlite's
    // driver rejects that ("cannot insert multiple commands into a prepared statement") even with
    // no parameters, so the two backends would no longer behave identically. Replacing `reset role`
    // with `select set_config('role', 'none', true)` was tried and rejected per the brief (not
    // guaranteed equivalent to RESET ROLE's session-authorization semantics) — do not guess here.
    await tx.query('reset role');
    await tx.query(`select set_config('request.jwt.claims', '', true)`);
    return result;
  });
}
