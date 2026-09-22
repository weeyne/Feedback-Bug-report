import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { encryptSecret } from './crypto';
import type { Db, Row } from './db/types';
import type { AppDeps } from './deps';
import type { Env } from './env';
import { createMemoryStorage } from './storage';

export const E2E_PROJECT_KEY = 'pk_E2eE2eE2eE2e1234';
// PUBLIC_KEY_PATTERN requires exactly 16 chars after `pk_`.
export const E2E_ORIGIN_PROJECT_KEY = 'pk_E2eE2eE2eOrig567';
export const E2E_DISCORD_WEBHOOK = 'https://discord.com/api/webhooks/1/e2e';

export interface OutboxEntry {
  url: string;
  body: unknown;
}

export interface TestModeDeps extends AppDeps {
  outbox: OutboxEntry[];
  ownerId: string;
}

export function assertTestModeAllowed(env: Env, nodeEnv: string | undefined): void {
  if (env.DYMCODE_TEST_MODE === '1' && nodeEnv === 'production') {
    throw new Error('DYMCODE_TEST_MODE must never be enabled in production');
  }
}

/** Repo paths are resolved from the app directory (next dev and vitest both run in apps/web). */
async function openDatabase(): Promise<Db> {
  const root = join(process.cwd(), '..', '..', 'supabase');
  const db = new PGlite({ extensions: { pgcrypto }, parsers: { 20: (value: string) => value } });
  await db.exec(await readFile(join(root, 'tests', 'src', 'pglite-bootstrap.sql'), 'utf8'));
  const migrations = (await readdir(join(root, 'migrations')))
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of migrations)
    await db.exec(await readFile(join(root, 'migrations', file), 'utf8'));
  // PGlite's `transaction` serializes concurrent requests on its single connection.
  const wrap = (q: { query: PGlite['query'] }): Db => ({
    query: async <T extends Row>(sql: string, params: unknown[] = []) =>
      (await q.query<T>(sql, params)).rows,
    transaction: async <T>(fn: (tx: Db) => Promise<T>) =>
      (await db.transaction(async (tx) =>
        fn(wrap(tx as unknown as { query: PGlite['query'] })),
      )) as T,
  });
  return wrap(db);
}

async function describeBody(body: BodyInit | null | undefined): Promise<unknown> {
  if (body instanceof FormData) {
    const fields: Record<string, string> = {};
    const files: Record<string, { name: string; type: string; size: number }> = {};
    for (const [key, value] of body.entries()) {
      if (typeof value === 'string') fields[key] = value;
      else files[key] = { name: value.name, type: value.type, size: value.size };
    }
    return { fields, files };
  }
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }
  return null;
}

export async function createTestModeDeps(env: Env): Promise<TestModeDeps> {
  const db = await openDatabase();
  const [owner] = await db.query<{ id: string }>(
    `insert into auth.users (id, instance_id, aud, role, email)
     values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'e2e@test.dev')
     returning id`,
  );
  const [project] = await db.query<{ id: string }>(
    `insert into public.projects (owner_id, name, public_key) values ($1, 'E2E Shop', $2) returning id`,
    [owner!.id, E2E_PROJECT_KEY],
  );
  await db.query(
    `insert into public.projects (owner_id, name, public_key, allowed_origins)
     values ($1, 'E2E Locked', $2, '{https://allowed.example}')`,
    [owner!.id, E2E_ORIGIN_PROJECT_KEY],
  );
  await db.query(
    `insert into public.integrations (project_id, kind, target, secret_encrypted) values
       ($1, 'telegram_shared', '424242', null),
       ($1, 'discord', null, $2)`,
    [project!.id, encryptSecret(E2E_DISCORD_WEBHOOK, env.SECRETS_ENCRYPTION_KEY)],
  );

  const outbox: OutboxEntry[] = [];
  const outboxFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    outbox.push({ url, body: await describeBody(init?.body) });
    if (url.endsWith('/getMe')) {
      return new Response(
        JSON.stringify({ ok: true, result: { id: 1, is_bot: true, username: 'e2e_custom_bot' } }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
  }) as typeof fetch;

  return {
    db,
    storage: createMemoryStorage(),
    env,
    fetch: outboxFetch,
    after: (task) => {
      void task();
    },
    outbox,
    ownerId: owner!.id,
  };
}
