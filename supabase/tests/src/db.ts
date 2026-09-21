import { readdir, readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import pg from 'pg';

type Row = Record<string, unknown>;

/** Minimal driver both targets implement. */
interface Driver {
  query<T extends Row>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

const INT8_OID = 20;
const MIGRATIONS_DIR = new URL('../../migrations/', import.meta.url);
const BOOTSTRAP_SQL = new URL('./pglite-bootstrap.sql', import.meta.url);

/** In-process Postgres with Supabase emulation and all migrations applied. */
async function openPglite(): Promise<Driver> {
  const db = new PGlite({
    extensions: { pgcrypto },
    // Match node-postgres: int8 comes back as a string.
    parsers: { [INT8_OID]: (value: string) => value },
  });
  await db.exec(await readFile(BOOTSTRAP_SQL, 'utf8'));
  const migrations = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of migrations) {
    await db.exec(await readFile(new URL(file, MIGRATIONS_DIR), 'utf8'));
  }
  return {
    query: async <T extends Row>(sql: string, params: unknown[] = []) =>
      (await db.query<T>(sql, params)).rows,
    close: () => db.close(),
  };
}

/** Real local Supabase (CI), migrations already applied by `supabase start`. */
async function openSupabase(): Promise<Driver> {
  const client = new pg.Client({
    connectionString:
      process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  });
  await client.connect();
  return {
    query: async <T extends Row>(sql: string, params: unknown[] = []) =>
      (await client.query<T>(sql, params)).rows,
    close: () => client.end(),
  };
}

let driver: Driver | undefined;

export async function connect(): Promise<void> {
  const target = process.env.DB_TEST_TARGET ?? 'pglite';
  if (target !== 'pglite' && target !== 'supabase') {
    throw new Error(`Unknown DB_TEST_TARGET "${target}" (expected "pglite" or "supabase")`);
  }
  driver = target === 'supabase' ? await openSupabase() : await openPglite();
}

export async function disconnect(): Promise<void> {
  await driver?.close();
  driver = undefined;
}

export interface Db {
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Runs a statement expected to fail and returns its error message. The transaction stays usable. */
  queryError(sql: string, params?: unknown[]): Promise<string>;
  /** Acts as a signed-in user, the way PostgREST does for a JWT with `sub = uid`. */
  asUser(uid: string): Promise<void>;
  asAnon(): Promise<void>;
  asServiceRole(): Promise<void>;
  /** Back to the connection's own role (postgres), e.g. to create fixtures. */
  asPostgres(): Promise<void>;
}

function makeDb(d: Driver): Db {
  const setRole = async (role: string, claims: Record<string, string>) => {
    await d.query(`set local role ${role}`);
    await d.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
  };

  return {
    query: (sql, params) => d.query(sql, params),
    async queryError(sql, params = []) {
      await d.query('savepoint expect_error');
      try {
        await d.query(sql, params);
      } catch (error) {
        await d.query('rollback to savepoint expect_error');
        return (error as Error).message;
      }
      await d.query('release savepoint expect_error');
      throw new Error(`Expected query to fail but it succeeded: ${sql}`);
    },
    asUser: (uid) => setRole('authenticated', { sub: uid, role: 'authenticated' }),
    asAnon: () => setRole('anon', { role: 'anon' }),
    asServiceRole: () => setRole('service_role', { role: 'service_role' }),
    async asPostgres() {
      await d.query('reset role');
    },
  };
}

/** Runs `fn` in a transaction that is always rolled back, so tests never leak data. */
export async function withTx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  if (!driver) throw new Error('Database not connected');
  await driver.query('begin');
  try {
    return await fn(makeDb(driver));
  } finally {
    await driver.query('rollback');
  }
}
