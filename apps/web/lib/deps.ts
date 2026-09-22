import { after } from 'next/server';
import { createPostgresDb } from './db/postgres';
import type { Db } from './db/types';
import { getEnv, type Env } from './env';
import { createSupabaseStorage, type Storage } from './storage';

export interface AppDeps {
  db: Db;
  storage: Storage;
  env: Env;
  fetch: typeof fetch;
  /** Runs work after the response is sent (Next.js `after`). */
  after: (task: () => Promise<void>) => void;
}

let deps: Promise<AppDeps> | undefined;

export function getDeps(): Promise<AppDeps> {
  return (deps ??= buildDeps());
}

async function buildDeps(): Promise<AppDeps> {
  const env = getEnv();
  return {
    db: createPostgresDb(env.DATABASE_URL),
    storage: createSupabaseStorage(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
    env,
    fetch: globalThis.fetch.bind(globalThis),
    after: (task) => after(task),
  };
}
