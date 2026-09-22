import postgres from 'postgres';
import type { Db, Row } from './types';

const connections = new WeakMap<Db, postgres.Sql>();

/** Exported for unit testing the nesting guard without a live Postgres connection. */
export function wrap(sql: postgres.Sql | postgres.TransactionSql): Db {
  const db: Db = {
    async query<T extends Row>(text: string, params: unknown[] = []) {
      const rows = await sql.unsafe(text, params as never[]);
      return rows as unknown as T[];
    },
    async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
      // `sql` is already a TransactionSql (no `begin`) when we're inside a transaction:
      // nesting must throw rather than silently reuse it — reusing it would let a nested
      // withUser's `reset role` clear RLS for the rest of the enclosing transaction (fail-open).
      if (!('begin' in sql)) throw new Error('nested transactions are not supported');
      return (await sql.begin((tx) => fn(wrap(tx)))) as T;
    },
  };
  return db;
}

/** postgres.js through the Supabase transaction pooler (no prepared statements). */
export function createPostgresDb(url: string): Db {
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const sql = postgres(url, {
    prepare: false,
    // A few connections so a dashboard transaction does not block API queries.
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: local ? false : 'require',
  });
  const db = wrap(sql);
  connections.set(db, sql);
  return db;
}

/** Closes the connection behind a db from `createPostgresDb` (scripts and tests; the app never closes). */
export async function closePostgresDb(db: Db): Promise<void> {
  await connections.get(db)?.end({ timeout: 5 });
  connections.delete(db);
}
