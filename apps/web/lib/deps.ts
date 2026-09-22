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

// Next.js dev (Turbopack) compiles route handlers and the SSR/RSC render path as separate
// module graphs, so a plain module-level `let` gets one instance per graph instead of one per
// process. In test mode that silently split the in-memory PGlite database and outbox in two
// (e.g. a user created by /api/e2e-test/login, a route handler, was invisible to a server action
// invoked from a page). Caching on `globalThis` keeps a single instance across every graph, the
// same pattern used for database-client singletons that must survive Next.js dev reloads.
declare global {
  // eslint-disable-next-line no-var -- `var` is required for global augmentation
  var __dymcodeDeps: Promise<AppDeps> | undefined;
}

export function getDeps(): Promise<AppDeps> {
  return (globalThis.__dymcodeDeps ??= buildDeps());
}

async function buildDeps(): Promise<AppDeps> {
  const env = getEnv();
  if (env.DYMCODE_TEST_MODE === '1') {
    const { assertTestModeAllowed, createTestModeDeps } = await import('./test-mode');
    assertTestModeAllowed(env, process.env.NODE_ENV);
    return createTestModeDeps(env);
  }
  return {
    db: createPostgresDb(env.DATABASE_URL),
    storage: createSupabaseStorage(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
    env,
    fetch: globalThis.fetch.bind(globalThis),
    after: (task) => after(task),
  };
}
