import type { Db } from './types';

/**
 * Runs fn as `userId` under the database's RLS policies, the way PostgREST does for a JWT:
 * role `authenticated` + request.jwt.claims. The role is reset before the transaction ends.
 */
export async function withUser<T>(db: Db, userId: string, fn: (tx: Db) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query('set local role authenticated');
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: userId, role: 'authenticated' }),
    ]);
    const result = await fn(tx);
    await tx.query('reset role');
    await tx.query(`select set_config('request.jwt.claims', '', true)`);
    return result;
  });
}
