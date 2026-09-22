import postgres from 'postgres';
import type { Db, Row } from './types';

const connections = new WeakMap<Db, postgres.Sql>();

/** postgres.js through the Supabase transaction pooler (no prepared statements). */
export function createPostgresDb(url: string): Db {
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const sql = postgres(url, {
    prepare: false,
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: local ? false : 'require',
  });
  const db: Db = {
    async query<T extends Row>(text: string, params: unknown[] = []) {
      const rows = await sql.unsafe(text, params as never[]);
      return rows as unknown as T[];
    },
  };
  connections.set(db, sql);
  return db;
}

/** Closes the connection behind a db from `createPostgresDb` (scripts and tests; the app never closes). */
export async function closePostgresDb(db: Db): Promise<void> {
  await connections.get(db)?.end({ timeout: 5 });
  connections.delete(db);
}
