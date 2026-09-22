# Phase 4: Dashboard, Landing, Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Dymcode dashboard in `apps/web` (auth, projects, install, feedback feed, settings with live preview, integrations, billing stub, account), the bilingual landing and legal pages, and everything needed to deploy to Vercel.

**Architecture:**
- **Auth.** Supabase Auth via `@supabase/ssr`, sessions in cookies. `getSessionUser()` returns the current user (a cookie in test mode).
- **Data.** All dashboard data goes through use-case functions in `lib/dashboard/*` that take injected deps. They run user-scoped SQL through `withUser(db, userId, fn)`: a transaction that sets `role authenticated` + JWT claims, so the phase-1 RLS policies enforce access exactly as PostgREST would. Service-role SQL is used only for operations RLS forbids, after an ownership check.
- **UI.** Pages are Server Components. Mutations are thin `'use server'` actions calling the use cases.
- **Tests.** The use cases are tested on the PGlite harness (and real Supabase in CI). UI flows are covered by Playwright E2E in test mode.

**Tech Stack:** Next.js 16 (App Router, `proxy.ts`), React 19, `@supabase/ssr`, postgres.js, next-intl, Tailwind CSS v4, shadcn/ui, zod 4, Vitest + PGlite, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-22-dashboard-design.md`. Parents:
- `docs/superpowers/specs/2026-09-21-dymcode-design.md`;
- `docs/superpowers/specs/2026-09-22-api-notifications-design.md`.

## Global Constraints

- **Language and style:**
  - All code, comments, identifiers and docs are in English. Every user-visible string goes through next-intl with keys in BOTH `apps/web/messages/en.json` and `apps/web/messages/ru.json` (a test enforces identical key sets).
  - Run `pnpm format` before every commit.
  - Commit messages end with a blank line, then exactly `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Next.js 16 differs from older versions.** Before writing Next-specific code, read the relevant guide in `apps/web/node_modules/next/dist/docs/`. Middleware is `proxy.ts` in Next 16; confirm with the docs.
- **Environment:**
  - Docker does not work on the dev machine: never run `supabase start`. DB tests run on PGlite locally and on real Supabase in CI.
  - `apps/web/.env.local` holds REAL secrets: never print, read into output, or commit it. Tests and E2E must not depend on it.
  - `next build`/`next dev` may rewrite `apps/web/next-env.d.ts`. Restore it (`git checkout -- apps/web/next-env.d.ts`) unless a change is intended.
- **Data access rules:**
  - Dashboard reads/writes of user data go through `withUser`.
  - Service-role queries (plain `deps.db.query`) are allowed only after an ownership check made through `withUser`, and only for: project creation, integrations and link codes, hidden-feedback counts, Storage paths for deletion, account deletion, the user's own usage row, Pro status (`public.is_pro`), and `hit_rate_limit`.
  - **Never call `deps.db` (or anything that uses it) inside a `withUser` callback.** With a single pooled connection this deadlocks. Finish the `withUser` call first.
- **Server actions** are thin wrappers: `requireUser()` → `getDeps()` → use case. They return `{ ok: true, … } | { ok: false, error: <i18n key> }`. Secrets (bot tokens, webhook URLs, `secret_encrypted`) never reach the browser.
- **Limits** (verbatim from the specs):
  - project name 1–80; trigger text 1–40; custom CSS ≤ 10 240 **bytes**;
  - allowed origins ≤ 20, normalized to `scheme://host[:port]`;
  - Free plan: 1 project, 20 submissions/month;
  - signed screenshot URLs live 300 s; link codes live 15 min;
  - dashboard rate limit 10/min per user per action for `createTelegramLink`, `sendTest`, `saveCustomBot`, `saveDiscord`.
- **Polling intervals:** install page 3 s; Telegram connect 2 s for at most 60 s; feed 30 s.
- **Test mode:** `DYMCODE_TEST_MODE=1` stays impossible in production. Every `/api/e2e-test/*` route returns 404 outside test mode.

## File Map

| Path | Responsibility |
|---|---|
| `apps/web/lib/db/types.ts`, `db/postgres.ts`, `db/with-user.ts` | `Db.transaction`, `withUser` |
| `supabase/tests/src/db.ts` | Harness `Db.transaction` (savepoint) |
| `apps/web/lib/storage.ts` | `+ signedUrl` |
| `apps/web/lib/notify/validate.ts` | `isDiscordWebhookUrl`, `isBotToken` (shared by dispatch + dashboard) |
| `apps/web/lib/auth/*` | Supabase server client, `getSessionUser`/`requireUser`, referral attribution |
| `apps/web/proxy.ts` | Session refresh, `/app` guard, `ref` cookie |
| `apps/web/app/login/*`, `app/auth/callback/route.ts`, `app/api/e2e-test/login/route.ts` | Sign-in |
| `apps/web/i18n/request.ts`, `messages/{en,ru}.json` | next-intl |
| `apps/web/components/ui/*` | shadcn/ui primitives |
| `apps/web/components/app/*` | Shell, sidebar, project switcher, feedback/settings/integrations UI |
| `apps/web/lib/dashboard/*` | Use cases: projects, feedback, settings, integrations, account, origins, result |
| `apps/web/app/app/**` | Dashboard routes + `actions.ts` |
| `packages/widget/vite.preview.config.ts` | `dist/preview.js` (ES module exporting `mountWidget`) for the settings preview |
| `apps/web/app/(marketing)/*` | Landing, privacy, terms |
| `apps/web/app/robots.ts`, `app/sitemap.ts` | SEO |
| `apps/web/e2e/dashboard.spec.ts` | Dashboard E2E |
| `docs/deploy.md` | Step-by-step deployment guide |

---

### Task 1: Data access layer: transactions, `withUser`, signed URLs, shared validators, env

**Files:**
- Modify: `apps/web/lib/db/types.ts`, `apps/web/lib/db/postgres.ts`, `supabase/tests/src/db.ts`, `apps/web/lib/test-mode.ts`, `apps/web/lib/storage.ts`, `apps/web/lib/notify/dispatch.ts`, `apps/web/lib/env.ts`, `apps/web/test/fixtures.ts`, `apps/web/playwright.config.ts`
- Create: `apps/web/lib/db/with-user.ts`, `apps/web/lib/notify/validate.ts`
- Test: `apps/web/lib/db/with-user.test.ts`, `apps/web/lib/notify/validate.test.ts`, `apps/web/lib/storage.test.ts` (extend), `apps/web/lib/env.test.ts` (extend)

**Interfaces:**
- Produces:
  ```ts
  // lib/db/types.ts
  interface Db {
    query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]>;
    /** Transaction (savepoint in tests). Never use another Db inside fn. */
    transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
  }
  // lib/db/with-user.ts
  function withUser<T>(db: Db, userId: string, fn: (tx: Db) => Promise<T>): Promise<T>;
  // lib/storage.ts — Storage gains:
  signedUrl(path: string, expiresInSeconds: number): Promise<string | null>;
  // lib/notify/validate.ts
  function isDiscordWebhookUrl(value: string): boolean;
  function isBotToken(value: string): boolean;
  // env: + NEXT_PUBLIC_SUPABASE_ANON_KEY (required, min 20), NEXT_PUBLIC_DYMCODE_PROJECT_KEY (optional, PUBLIC_KEY_PATTERN)
  ```

- [ ] **Step 1: Write failing tests**

`apps/web/lib/db/with-user.test.ts`:
```ts
import { createProject, createUser, withTx } from '@dymcode/db-tests/harness';
import { describe, expect, it } from 'vitest';
import { withUser } from './with-user';

describe('withUser', () => {
  it('runs queries under RLS as the given user', () =>
    withTx(async (db) => {
      const a = await createUser(db);
      const b = await createUser(db);
      const project = await createProject(db, a, 'Mine');
      const seenByA = await withUser(db, a, (tx) => tx.query<{ id: string }>('select id from public.projects'));
      const seenByB = await withUser(db, b, (tx) => tx.query('select id from public.projects'));
      expect(seenByA).toEqual([{ id: project.id }]);
      expect(seenByB).toEqual([]);
    }));

  it('restores the connection role afterwards', () =>
    withTx(async (db) => {
      const a = await createUser(db);
      await withUser(db, a, (tx) => tx.query('select 1'));
      const [row] = await db.query<{ role: string; claims: string }>(
        `select current_user as role, coalesce(current_setting('request.jwt.claims', true), '') as claims`,
      );
      expect(row!.role).not.toBe('authenticated');
      expect(row!.claims).toBe('');
    }));

  it('rolls back and restores the role when the callback throws', () =>
    withTx(async (db) => {
      const a = await createUser(db);
      await expect(
        withUser(db, a, async (tx) => {
          await tx.query(`insert into public.projects (owner_id, name) values ($1, 'x')`, [a]);
          return 1;
        }),
      ).rejects.toThrow(/permission denied/);
      const [row] = await db.query<{ role: string }>('select current_user as role');
      expect(row!.role).not.toBe('authenticated');
    }));
});
```

`apps/web/lib/notify/validate.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { isBotToken, isDiscordWebhookUrl } from './validate';

describe('validators', () => {
  it.each([
    ['https://discord.com/api/webhooks/1/abc', true],
    ['https://canary.discord.com/api/webhooks/1/abc', true],
    ['http://discord.com/api/webhooks/1/abc', false],
    ['https://discord.com.evil.tld/api/webhooks/1/abc', false],
    ['https://discord.com@evil.tld/api/webhooks/1/abc', false],
    ['https://discord.com/other', false],
    ['not a url', false],
  ])('isDiscordWebhookUrl(%s) = %s', (value, expected) => {
    expect(isDiscordWebhookUrl(value)).toBe(expected);
  });

  it.each([
    ['123456:ABC-def_g', true],
    ['123:abc/../x', false],
    ['bot:123', false],
    ['', false],
  ])('isBotToken(%s) = %s', (value, expected) => {
    expect(isBotToken(value)).toBe(expected);
  });
});
```

Append to `apps/web/lib/storage.test.ts`:
```ts
describe('memory storage signed urls', () => {
  it('returns a data URL for existing files and null otherwise', async () => {
    const storage = createMemoryStorage();
    await storage.upload('p/1.webp', new Uint8Array([1, 2, 3]), 'image/webp');
    expect(await storage.signedUrl('p/1.webp', 300)).toBe('data:image/webp;base64,AQID');
    expect(await storage.signedUrl('p/missing.webp', 300)).toBeNull();
  });
});
```

In `apps/web/lib/env.test.ts`, add inside `describe('parseEnv')`:
```ts
  it('requires the publishable key and accepts an optional own project key', () => {
    const { NEXT_PUBLIC_SUPABASE_ANON_KEY: _, ...withoutAnon } = VALID_ENV;
    expect(() => parseEnv(withoutAnon)).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
    expect(parseEnv({ ...VALID_ENV, NEXT_PUBLIC_DYMCODE_PROJECT_KEY: 'pk_AbCdEfGh12345678' }).NEXT_PUBLIC_DYMCODE_PROJECT_KEY).toBe(
      'pk_AbCdEfGh12345678',
    );
    expect(() => parseEnv({ ...VALID_ENV, NEXT_PUBLIC_DYMCODE_PROJECT_KEY: 'nope' })).toThrow(
      /NEXT_PUBLIC_DYMCODE_PROJECT_KEY/,
    );
  });
```
Add to `VALID_ENV` in `apps/web/test/fixtures.ts`: `NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_0123456789abcdef',`.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @dymcode/web test`
Expected: FAIL. `./with-user` and `./validate` are unresolved, `signedUrl` is not a function, and the env test fails.

- [ ] **Step 3: Implement**

`apps/web/lib/db/types.ts`:
```ts
export type Row = Record<string, unknown>;

/** The only database surface use cases depend on. */
export interface Db {
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Runs fn in a transaction (a savepoint inside test transactions). Never use another Db inside fn. */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}
```

`apps/web/lib/db/postgres.ts`: replace the `db` object with a wrapper that supports transactions, and raise `max` to 3:
```ts
function wrap(sql: postgres.Sql | postgres.TransactionSql): Db {
  const db: Db = {
    async query<T extends Row>(text: string, params: unknown[] = []) {
      const rows = await sql.unsafe(text, params as never[]);
      return rows as unknown as T[];
    },
    async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
      // Nested calls reuse the open transaction.
      if (!('begin' in sql)) return fn(db);
      return (await sql.begin((tx) => fn(wrap(tx)))) as T;
    },
  };
  return db;
}
```
In `createPostgresDb`, use `max: 3` (a comment: "a few connections so a dashboard transaction does not block API queries") and `const db = wrap(sql);`.

`supabase/tests/src/db.ts`: add to the `Db` interface
```ts
  /** Savepoint-scoped transaction inside the test transaction. */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
```
and, in `makeDb`, build the object as `const db: Db = { … }` and add:
```ts
    async transaction(fn) {
      const name = `sp_${++savepointCounter}`;
      await d.query(`savepoint ${name}`);
      try {
        const result = await fn(db);
        await d.query(`release savepoint ${name}`);
        return result;
      } catch (error) {
        await d.query(`rollback to savepoint ${name}`);
        throw error;
      }
    },
```
with `let savepointCounter = 0;` at module level and `return db;` at the end of `makeDb`.

`apps/web/lib/test-mode.ts` `openDatabase()`: return
```ts
  const wrap = (q: { query: PGlite['query'] }): Db => ({
    query: async <T extends Row>(sql: string, params: unknown[] = []) => (await q.query<T>(sql, params)).rows,
    transaction: async <T>(fn: (tx: Db) => Promise<T>) =>
      (await db.transaction(async (tx) => fn(wrap(tx as unknown as { query: PGlite['query'] })))) as T,
  });
  return wrap(db);
```
(PGlite's `transaction` serializes concurrent requests on its single connection.)

Any other in-repo object implementing `Db` (e.g. test helpers wrapping a db) must add `transaction`. Run `pnpm typecheck` to find them, and delegate to the wrapped db's `transaction`.

`apps/web/lib/db/with-user.ts`:
```ts
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
```

`apps/web/lib/notify/validate.ts`: move `DISCORD_HOSTS`, `BOT_TOKEN` and `isDiscordWebhookUrl` out of `dispatch.ts` unchanged, and add:
```ts
export function isBotToken(value: string): boolean {
  return BOT_TOKEN.test(value);
}
```
In `dispatch.ts`, import `isDiscordWebhookUrl` and `isBotToken` from `./validate`, replace `BOT_TOKEN.test(value)` with `isBotToken(value)`, and keep re-exporting `isDiscordWebhookUrl` from dispatch if existing tests import it from there.

`apps/web/lib/storage.ts`: add to `Storage`:
```ts
  /** A time-limited URL the browser can load, or null if the file does not exist. */
  signedUrl(path: string, expiresInSeconds: number): Promise<string | null>;
```
Memory implementation:
```ts
    async signedUrl(path) {
      const file = storage.files.get(path);
      return file ? `data:${file.contentType};base64,${Buffer.from(file.data).toString('base64')}` : null;
    },
```
Supabase implementation:
```ts
    async signedUrl(path, expiresInSeconds) {
      const { data, error } = await bucket.createSignedUrl(path, expiresInSeconds);
      return error || !data ? null : data.signedUrl;
    },
```

`apps/web/lib/env.ts`: add to the schema
```ts
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  NEXT_PUBLIC_DYMCODE_PROJECT_KEY: z.string().regex(PUBLIC_KEY_PATTERN).optional(),
```
(import `PUBLIC_KEY_PATTERN` from `@dymcode/shared`).

`apps/web/playwright.config.ts`: add `NEXT_PUBLIC_SUPABASE_ANON_KEY: 'e2e-publishable-key-0000000000'` to `webServer.env`.

- [ ] **Step 4: Verify and commit**

Run: `pnpm --filter @dymcode/web test && pnpm typecheck && pnpm test`
Expected: PASS.
```bash
pnpm format
git add apps/web supabase/tests
git commit -m "feat(web): add transactions, withUser, signed URLs and shared validators"
```

---

### Task 2: Authentication

**Files:**
- Create: `apps/web/lib/auth/supabase-server.ts`, `apps/web/lib/auth/session.ts`, `apps/web/lib/auth/referral.ts`, `apps/web/proxy.ts`, `apps/web/app/login/page.tsx`, `apps/web/app/login/login-form.tsx`, `apps/web/app/login/actions.ts`, `apps/web/app/auth/callback/route.ts`, `apps/web/app/api/e2e-test/login/route.ts`, `apps/web/app/actions/session.ts`
- Test: `apps/web/lib/auth/referral.test.ts`, `apps/web/lib/auth/session.test.ts`

**Interfaces:**
- Consumes: `getEnv`, `getDeps`, `Db`, `PUBLIC_KEY_PATTERN`.
- Produces:
  ```ts
  interface SessionUser { id: string; email: string }
  const E2E_USER_COOKIE = 'e2e_user';
  function parseE2eUser(raw: string | undefined): SessionUser | null;
  function getSessionUser(): Promise<SessionUser | null>;
  function requireUser(): Promise<SessionUser>;           // redirect('/login') when absent
  function createSupabaseServerClient(): Promise<SupabaseClient>;
  function attributeReferral(db: Db, userId: string, ref: string): Promise<boolean>;
  // app/actions/session.ts ('use server')
  signOut(): Promise<void>;                                // clears Supabase session + e2e cookie, redirect('/')
  ```
  The login page and callback use message keys added in Task 3. In this task, write English literals in `login-form.tsx`; Task 3 replaces them with `t()` calls.

- [ ] **Step 1: Write failing tests**

`apps/web/lib/auth/referral.test.ts`:
```ts
import { createProject, createUser, withTx, type TestDb } from '@dymcode/db-tests/harness';
import { describe, expect, it } from 'vitest';
import { attributeReferral } from './referral';

const referredBy = (db: TestDb, userId: string) =>
  db
    .query<{ ref: string | null }>('select referred_by_project as ref from public.profiles where id = $1', [userId])
    .then((rows) => rows[0]!.ref);

describe('attributeReferral', () => {
  it('attributes a new user to the referring project once', () =>
    withTx(async (db) => {
      const owner = await createUser(db);
      const project = await createProject(db, owner);
      const newcomer = await createUser(db);
      expect(await attributeReferral(db, newcomer, project.public_key)).toBe(true);
      expect(await referredBy(db, newcomer)).toBe(project.id);
      const other = await createProject(db, owner, 'Other');
      expect(await attributeReferral(db, newcomer, other.public_key)).toBe(false);
      expect(await referredBy(db, newcomer)).toBe(project.id);
    }));

  it('ignores own projects, unknown or malformed keys, and old accounts', () =>
    withTx(async (db) => {
      const owner = await createUser(db);
      const project = await createProject(db, owner);
      expect(await attributeReferral(db, owner, project.public_key)).toBe(false);
      const newcomer = await createUser(db);
      expect(await attributeReferral(db, newcomer, 'pk_AbCdEfGh12345678')).toBe(false);
      expect(await attributeReferral(db, newcomer, 'garbage')).toBe(false);
      const veteran = await createUser(db);
      await db.query(`update public.profiles set created_at = now() - interval '2 days' where id = $1`, [veteran]);
      expect(await attributeReferral(db, veteran, project.public_key)).toBe(false);
    }));
});
```

`apps/web/lib/auth/session.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseE2eUser } from './session';

describe('parseE2eUser', () => {
  it('accepts a JSON cookie with a uuid and email', () => {
    const raw = JSON.stringify({ id: '8c0e2f36-3c5e-4f63-9d5b-0a4d1b1f6a10', email: 'a@b.co' });
    expect(parseE2eUser(raw)).toEqual({ id: '8c0e2f36-3c5e-4f63-9d5b-0a4d1b1f6a10', email: 'a@b.co' });
  });

  it.each([undefined, '', 'not json', JSON.stringify({ id: 'x', email: 'a@b.co' })])('rejects %s', (raw) => {
    expect(parseE2eUser(raw)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @dymcode/web test`
Expected: FAIL with unresolved `./referral`, `./session`.

- [ ] **Step 3: Implement**

Run: `pnpm --filter @dymcode/web add @supabase/ssr`

`apps/web/lib/auth/supabase-server.ts`:
```ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getEnv } from '../env';

/** Supabase client bound to the request cookies (Server Components, Server Actions, Route Handlers). */
export async function createSupabaseServerClient() {
  const env = getEnv();
  const store = await cookies();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Server Components cannot set cookies; proxy.ts refreshes the session instead.
        }
      },
    },
  });
}
```

`apps/web/lib/auth/session.ts`:
```ts
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getEnv } from '../env';
import { createSupabaseServerClient } from './supabase-server';

export interface SessionUser {
  id: string;
  email: string;
}

export const E2E_USER_COOKIE = 'e2e_user';

const E2eUser = z.object({ id: z.uuid(), email: z.string().max(254) });

export function parseE2eUser(raw: string | undefined): SessionUser | null {
  if (!raw) return null;
  try {
    const parsed = E2eUser.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  if (getEnv().DYMCODE_TEST_MODE === '1') {
    return parseE2eUser((await cookies()).get(E2E_USER_COOKIE)?.value);
  }
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: String(claims.sub), email: String(claims.email ?? '') };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  return user;
}
```
If the installed supabase-js lacks `auth.getClaims`, use `auth.getUser()` (`data.user.id`, `data.user.email`) and note it.

`apps/web/lib/auth/referral.ts`:
```ts
import { PUBLIC_KEY_PATTERN } from '@dymcode/shared';
import type { Db } from '../db/types';

/**
 * Credits a newly created account (≤ 1 day old) to the project whose badge referred it.
 * Never overwrites an existing attribution and never credits a user's own project.
 */
export async function attributeReferral(db: Db, userId: string, ref: string): Promise<boolean> {
  if (!PUBLIC_KEY_PATTERN.test(ref)) return false;
  const rows = await db.query<{ id: string }>(
    `update public.profiles pr set referred_by_project = p.id
     from public.projects p
     where pr.id = $1 and pr.referred_by_project is null and pr.created_at > now() - interval '1 day'
       and p.public_key = $2 and p.owner_id <> $1
     returning pr.id`,
    [userId, ref],
  );
  return rows.length > 0;
}
```

`apps/web/proxy.ts` (check `node_modules/next/dist/docs` for the exact Next 16 proxy convention and adapt the export name/config if it differs):
```ts
import { PUBLIC_KEY_PATTERN } from '@dymcode/shared';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const REF_MAX_AGE = 60 * 60 * 24 * 30;

async function currentUserId(request: NextRequest, response: NextResponse): Promise<string | null> {
  if (process.env.DYMCODE_TEST_MODE === '1') {
    try {
      return JSON.parse(request.cookies.get('e2e_user')?.value ?? 'null')?.id ?? null;
    } catch {
      return null;
    }
  }
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value, options } of list) {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );
  const { data } = await supabase.auth.getClaims();
  return (data?.claims?.sub as string | undefined) ?? null;
}

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });
  const userId = await currentUserId(request, response);

  if (request.nextUrl.pathname.startsWith('/app') && !userId) {
    const login = new URL('/login', request.url);
    return NextResponse.redirect(login);
  }

  const ref = request.nextUrl.searchParams.get('ref');
  if (ref && PUBLIC_KEY_PATTERN.test(ref)) {
    response.cookies.set('ref', ref, { maxAge: REF_MAX_AGE, httpOnly: true, sameSite: 'lax', path: '/' });
  }
  return response;
}

export const config = {
  // Skip static files, the widget bundle and the public API.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|w/|api/).*)'],
};
```

`apps/web/app/login/actions.ts`:
```ts
'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { getEnv } from '@/lib/env';

export interface LoginState {
  status: 'idle' | 'sent' | 'error';
  error?: string;
}

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = z.email().max(254).safeParse(String(formData.get('email') ?? '').trim());
  if (!email.success) return { status: 'error', error: 'auth.emailInvalid' };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: { emailRedirectTo: `${getEnv().NEXT_PUBLIC_APP_URL}/auth/callback` },
  });
  return error ? { status: 'error', error: 'auth.sendFailed' } : { status: 'sent' };
}

export async function signInWithGitHub(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: { redirectTo: `${getEnv().NEXT_PUBLIC_APP_URL}/auth/callback` },
  });
  redirect(error || !data.url ? '/login?error=oauth' : data.url);
}
```

`apps/web/app/login/login-form.tsx`:
```tsx
'use client';

import { useActionState } from 'react';
import { sendMagicLink, signInWithGitHub, type LoginState } from './actions';

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, { status: 'idle' });
  if (state.status === 'sent') {
    return <p data-testid="login-sent">Check your inbox for a sign-in link.</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      <form action={signInWithGitHub}>
        <button type="submit" data-testid="login-github">
          Continue with GitHub
        </button>
      </form>
      <form action={action} className="flex flex-col gap-2">
        <input name="email" type="email" required placeholder="you@example.com" data-testid="login-email" />
        <button type="submit" disabled={pending} data-testid="login-submit">
          Email me a sign-in link
        </button>
        {state.status === 'error' && <p role="alert">{state.error}</p>}
      </form>
    </div>
  );
}
```

`apps/web/app/login/page.tsx`:
```tsx
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { LoginForm } from './login-form';

export default async function LoginPage() {
  if (await getSessionUser()) redirect('/app');
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Sign in to Dymcode</h1>
      <LoginForm />
    </main>
  );
}
```

`apps/web/app/auth/callback/route.ts`:
```ts
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { attributeReferral } from '@/lib/auth/referral';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { getDeps } from '@/lib/deps';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (code) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      const store = await cookies();
      const ref = store.get('ref')?.value;
      if (ref) {
        await attributeReferral((await getDeps()).db, data.user.id, ref).catch((e: unknown) =>
          console.error('[auth/callback] referral', e),
        );
        store.delete('ref');
      }
      return NextResponse.redirect(new URL('/app', url.origin));
    }
  }
  return NextResponse.redirect(new URL('/login?error=callback', url.origin));
}
```

`apps/web/app/api/e2e-test/login/route.ts`:
```ts
import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { E2E_USER_COOKIE } from '@/lib/auth/session';
import { getDeps } from '@/lib/deps';
import { getEnv } from '@/lib/env';
import { json } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** E2E only: signs in as (and creates if needed) the user with the given email. */
export async function POST(request: Request) {
  if (getEnv().DYMCODE_TEST_MODE !== '1') return json({ error: 'not found' }, 404);
  const { email } = (await request.json()) as { email: string };
  const { db } = await getDeps();
  let [user] = await db.query<{ id: string }>('select id from auth.users where email = $1', [email]);
  if (!user) {
    [user] = await db.query<{ id: string }>(
      `insert into auth.users (id, instance_id, aud, role, email)
       values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2) returning id`,
      [randomUUID(), email],
    );
  }
  (await cookies()).set(E2E_USER_COOKIE, JSON.stringify({ id: user!.id, email }), { path: '/', httpOnly: true });
  return json({ id: user!.id }, 200);
}
```

`apps/web/app/actions/session.ts`:
```ts
'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { E2E_USER_COOKIE } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { getEnv } from '@/lib/env';

export async function signOut(): Promise<void> {
  if (getEnv().DYMCODE_TEST_MODE === '1') {
    (await cookies()).delete(E2E_USER_COOKIE);
  } else {
    await (await createSupabaseServerClient()).auth.signOut();
  }
  redirect('/');
}
```

- [ ] **Step 4: Verify and commit**

Run: `pnpm --filter @dymcode/web test && pnpm typecheck`
Run: `pnpm --filter @dymcode/widget build && pnpm --filter @dymcode/web build`
Expected: PASS; the build lists `/login`, `/auth/callback` and the proxy.
```bash
pnpm format
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): add Supabase sign-in with magic link and GitHub"
```

---

### Task 3: UI foundation: Tailwind, shadcn/ui, next-intl, app shell

**Files:**
- Create: `apps/web/postcss.config.mjs`, `apps/web/app/globals.css`, `apps/web/components.json`, `apps/web/components/ui/*` (generated), `apps/web/lib/utils.ts` (generated `cn`), `apps/web/i18n/request.ts`, `apps/web/i18n/locale.ts`, `apps/web/messages/en.json`, `apps/web/messages/ru.json`, `apps/web/app/actions/locale.ts`, `apps/web/components/app/app-shell.tsx`, `apps/web/components/app/project-switcher.tsx`, `apps/web/components/locale-switcher.tsx`
- Modify: `apps/web/next.config.ts`, `apps/web/app/layout.tsx`, `apps/web/app/login/login-form.tsx`, `apps/web/app/login/page.tsx`
- Test: `apps/web/i18n/locale.test.ts`, `apps/web/messages/messages.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // i18n/locale.ts
  const LOCALES = ['en', 'ru'] as const; type AppLocale = (typeof LOCALES)[number];
  const LOCALE_COOKIE = 'locale';
  function pickLocale(cookie: string | undefined, acceptLanguage: string | null): AppLocale;
  // app/actions/locale.ts ('use server')
  setLocale(locale: AppLocale): Promise<void>;
  // components/app/app-shell.tsx
  <AppShell projects={ProjectSummary[]} currentProjectId={string | null} email={string}>{children}</AppShell>
  // ProjectSummary = { id: string; name: string; public_key: string } (defined in Task 4's lib/dashboard/projects.ts;
  //   in this task declare the prop type inline: { id: string; name: string; public_key: string })
  ```
- Message namespaces created now (later tasks add keys): `common`, `auth`, `nav`, `errors`.

- [ ] **Step 1: Write failing tests**

`apps/web/i18n/locale.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { pickLocale } from './locale';

describe('pickLocale', () => {
  it('prefers a valid cookie', () => {
    expect(pickLocale('ru', 'en-US')).toBe('ru');
    expect(pickLocale('de', 'ru-RU,ru;q=0.9')).toBe('ru');
  });

  it('falls back to Accept-Language, then English', () => {
    expect(pickLocale(undefined, 'ru-RU,en;q=0.8')).toBe('ru');
    expect(pickLocale(undefined, 'uk-UA')).toBe('en');
    expect(pickLocale(undefined, null)).toBe('en');
  });
});
```

`apps/web/messages/messages.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import en from './en.json';
import ru from './ru.json';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tree).flatMap(([key, value]) =>
      typeof value === 'string' ? [[prefix + key, value]] : Object.entries(flatten(value, `${prefix}${key}.`)),
    ),
  );
}

describe('messages', () => {
  it('have identical keys and no empty strings in en and ru', () => {
    const a = flatten(en as Tree);
    const b = flatten(ru as Tree);
    expect(Object.keys(b).sort()).toEqual(Object.keys(a).sort());
    for (const value of [...Object.values(a), ...Object.values(b)]) expect(value.trim()).not.toBe('');
  });
});
```
Update `apps/web/vitest.config.ts` `include` to also cover `i18n/**/*.test.ts` and `messages/**/*.test.ts`.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @dymcode/web test`
Expected: FAIL with unresolved `./locale` and missing `en.json`/`ru.json`.

- [ ] **Step 3: Install Tailwind v4, shadcn/ui and next-intl**

```bash
pnpm --filter @dymcode/web add next-intl
pnpm --filter @dymcode/web add -D tailwindcss @tailwindcss/postcss
```
`apps/web/postcss.config.mjs`:
```js
export default { plugins: { '@tailwindcss/postcss': {} } };
```
Initialise shadcn/ui in `apps/web` (run from `apps/web`): `pnpm dlx shadcn@latest init`. Choose the defaults (Next.js, neutral base color, CSS variables); it writes `components.json`, `lib/utils.ts` and theme tokens into `app/globals.css`. Then:
```bash
pnpm dlx shadcn@latest add button input label textarea card dialog sheet dropdown-menu badge select switch skeleton sonner separator tooltip
```
If the CLI asks questions that cannot be answered non-interactively, create `components.json` by hand per the shadcn docs for Tailwind v4 and add the components one by one. Make sure `app/globals.css` starts with `@import "tailwindcss";` and is imported in `app/layout.tsx`. Components live in `apps/web/components/ui/`.

- [ ] **Step 4: next-intl setup**

`apps/web/i18n/locale.ts`:
```ts
export const LOCALES = ['en', 'ru'] as const;
export type AppLocale = (typeof LOCALES)[number];
export const LOCALE_COOKIE = 'locale';

const isLocale = (value: string | undefined): value is AppLocale => LOCALES.includes(value as AppLocale);

/** Cookie wins; otherwise the first Accept-Language entry we support; otherwise English. */
export function pickLocale(cookie: string | undefined, acceptLanguage: string | null): AppLocale {
  if (isLocale(cookie)) return cookie;
  for (const part of acceptLanguage?.split(',') ?? []) {
    const primary = part.trim().split(/[-;]/)[0]?.toLowerCase();
    if (isLocale(primary)) return primary;
  }
  return 'en';
}
```

`apps/web/i18n/request.ts`:
```ts
import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { LOCALE_COOKIE, pickLocale } from './locale';

export default getRequestConfig(async () => {
  const locale = pickLocale((await cookies()).get(LOCALE_COOKIE)?.value, (await headers()).get('accept-language'));
  return { locale, messages: (await import(`../messages/${locale}.json`)).default };
});
```

`apps/web/next.config.ts`: wrap the export:
```ts
import createNextIntlPlugin from 'next-intl/plugin';
const withNextIntl = createNextIntlPlugin('./i18n/request.ts');
// …existing config…
export default withNextIntl(config);
```

`apps/web/app/actions/locale.ts`:
```ts
'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { LOCALE_COOKIE, LOCALES, type AppLocale } from '@/i18n/locale';

export async function setLocale(locale: AppLocale): Promise<void> {
  if (!LOCALES.includes(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  revalidatePath('/', 'layout');
}
```

`apps/web/app/layout.tsx`:
```tsx
import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale } from 'next-intl/server';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

export const metadata = { title: 'Dymcode' };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        <Toaster />
      </body>
    </html>
  );
}
```

`apps/web/messages/en.json`:
```json
{
  "common": {
    "save": "Save",
    "saved": "Saved",
    "cancel": "Cancel",
    "delete": "Delete",
    "confirm": "Confirm",
    "copy": "Copy",
    "copied": "Copied",
    "refresh": "Refresh",
    "loading": "Loading…",
    "language": "Language",
    "comingSoon": "Coming soon"
  },
  "auth": {
    "title": "Sign in to Dymcode",
    "github": "Continue with GitHub",
    "emailPlaceholder": "you@example.com",
    "emailSubmit": "Email me a sign-in link",
    "sent": "Check your inbox for a sign-in link.",
    "emailInvalid": "Enter a valid email address.",
    "sendFailed": "We couldn't send the link. Try again in a minute.",
    "callbackFailed": "That sign-in link is invalid or expired. Request a new one.",
    "signOut": "Sign out"
  },
  "nav": {
    "feedback": "Feedback",
    "install": "Install",
    "settings": "Settings",
    "integrations": "Integrations",
    "billing": "Billing",
    "account": "Account",
    "newProject": "New project",
    "projects": "Projects",
    "menu": "Menu"
  },
  "errors": {
    "generic": "Something went wrong. Try again.",
    "notFound": "Not found.",
    "rateLimited": "Too many attempts. Wait a minute and try again."
  }
}
```
`apps/web/messages/ru.json`:
```json
{
  "common": {
    "save": "Сохранить",
    "saved": "Сохранено",
    "cancel": "Отмена",
    "delete": "Удалить",
    "confirm": "Подтвердить",
    "copy": "Копировать",
    "copied": "Скопировано",
    "refresh": "Обновить",
    "loading": "Загрузка…",
    "language": "Язык",
    "comingSoon": "Скоро"
  },
  "auth": {
    "title": "Вход в Dymcode",
    "github": "Войти через GitHub",
    "emailPlaceholder": "you@example.com",
    "emailSubmit": "Прислать ссылку для входа",
    "sent": "Проверьте почту — мы отправили ссылку для входа.",
    "emailInvalid": "Введите корректный email.",
    "sendFailed": "Не удалось отправить ссылку. Попробуйте через минуту.",
    "callbackFailed": "Ссылка недействительна или устарела. Запросите новую.",
    "signOut": "Выйти"
  },
  "nav": {
    "feedback": "Отзывы",
    "install": "Установка",
    "settings": "Настройки",
    "integrations": "Интеграции",
    "billing": "Тариф",
    "account": "Аккаунт",
    "newProject": "Новый проект",
    "projects": "Проекты",
    "menu": "Меню"
  },
  "errors": {
    "generic": "Что-то пошло не так. Попробуйте ещё раз.",
    "notFound": "Не найдено.",
    "rateLimited": "Слишком много попыток. Подождите минуту и попробуйте снова."
  }
}
```
Replace the English literals in `app/login/login-form.tsx` and `app/login/page.tsx` with `useTranslations('auth')` / `getTranslations('auth')`. Show `t(state.error.replace('auth.', ''))` for errors. On the login page, if `searchParams.error === 'callback'`, show `t('callbackFailed')`.

- [ ] **Step 5: App shell components**

`apps/web/components/locale-switcher.tsx`:
```tsx
'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { setLocale } from '@/app/actions/locale';
import { LOCALES, type AppLocale } from '@/i18n/locale';

export function LocaleSwitcher() {
  const t = useTranslations('common');
  const locale = useLocale();
  const [pending, start] = useTransition();
  return (
    <label className="flex items-center gap-2 text-sm">
      {t('language')}
      <select
        data-testid="locale-switcher"
        value={locale}
        disabled={pending}
        onChange={(e) => start(() => setLocale(e.target.value as AppLocale))}
        className="rounded-md border bg-background px-2 py-1"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {l === 'en' ? 'English' : 'Русский'}
          </option>
        ))}
      </select>
    </label>
  );
}
```

`apps/web/components/app/project-switcher.tsx`:
```tsx
'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface ShellProject {
  id: string;
  name: string;
  public_key: string;
}

export function ProjectSwitcher({ projects, currentProjectId }: { projects: ShellProject[]; currentProjectId: string | null }) {
  const t = useTranslations('nav');
  const current = projects.find((p) => p.id === currentProjectId);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="w-full truncate rounded-md border px-3 py-2 text-left text-sm" data-testid="project-switcher">
        {current?.name ?? t('projects')}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        {projects.map((p) => (
          <DropdownMenuItem key={p.id} asChild>
            <Link href={`/app/p/${p.id}/feedback`}>{p.name}</Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/app/new">{t('newProject')}</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

`apps/web/components/app/app-shell.tsx`:
```tsx
import Link from 'next/link';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { signOut } from '@/app/actions/session';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { ProjectSwitcher, type ShellProject } from './project-switcher';

async function Nav({ projects, currentProjectId, email }: { projects: ShellProject[]; currentProjectId: string | null; email: string }) {
  const t = await getTranslations('nav');
  const tAuth = await getTranslations('auth');
  const base = currentProjectId ? `/app/p/${currentProjectId}` : null;
  const projectLinks = base
    ? ([
        ['feedback', `${base}/feedback`],
        ['install', `${base}/install`],
        ['settings', `${base}/settings`],
        ['integrations', `${base}/integrations`],
      ] as const)
    : [];
  return (
    <nav className="flex h-full flex-col gap-4 p-4">
      <Link href="/app" className="text-lg font-semibold">
        Dymcode
      </Link>
      <ProjectSwitcher projects={projects} currentProjectId={currentProjectId} />
      <ul className="flex flex-col gap-1 text-sm">
        {projectLinks.map(([key, href]) => (
          <li key={key}>
            <Link href={href} className="block rounded-md px-3 py-2 hover:bg-muted" data-testid={`nav-${key}`}>
              {t(key)}
            </Link>
          </li>
        ))}
      </ul>
      <ul className="mt-auto flex flex-col gap-1 text-sm">
        <li>
          <Link href="/app/billing" className="block rounded-md px-3 py-2 hover:bg-muted" data-testid="nav-billing">
            {t('billing')}
          </Link>
        </li>
        <li>
          <Link href="/app/account" className="block rounded-md px-3 py-2 hover:bg-muted" data-testid="nav-account">
            {t('account')}
          </Link>
        </li>
      </ul>
      <form action={signOut} className="border-t pt-3 text-xs text-muted-foreground">
        <div className="truncate">{email}</div>
        <button type="submit" className="mt-1 underline">
          {tAuth('signOut')}
        </button>
      </form>
    </nav>
  );
}

export async function AppShell(props: { projects: ShellProject[]; currentProjectId: string | null; email: string; children: ReactNode }) {
  const t = await getTranslations('nav');
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 border-r md:block">
        <Nav {...props} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b p-3 md:hidden">
          <Sheet>
            <SheetTrigger className="rounded-md border px-3 py-1 text-sm">{t('menu')}</SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <Nav {...props} />
            </SheetContent>
          </Sheet>
          <span className="font-semibold">Dymcode</span>
        </header>
        <main className="min-w-0 flex-1">{props.children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Verify and commit**

Run: `pnpm --filter @dymcode/web test && pnpm typecheck`
Run: `pnpm --filter @dymcode/widget build && pnpm --filter @dymcode/web build`
Expected: PASS.
```bash
pnpm format
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): add Tailwind, shadcn/ui, next-intl and the app shell"
```

---

### Task 4: Projects, onboarding and the install page

**Files:**
- Create: `apps/web/lib/dashboard/result.ts`, `apps/web/lib/dashboard/origins.ts`, `apps/web/lib/dashboard/projects.ts`, `apps/web/app/app/actions.ts`, `apps/web/components/app/project-nav.tsx`, `apps/web/app/app/layout.tsx`, `apps/web/app/app/page.tsx`, `apps/web/app/app/new/page.tsx`, `apps/web/app/app/new/new-project-form.tsx`, `apps/web/app/app/p/[projectId]/layout.tsx`, `apps/web/app/app/p/[projectId]/install/page.tsx`, `apps/web/components/app/copy-button.tsx`, `apps/web/components/app/first-feedback-watcher.tsx`
- Modify: `apps/web/components/app/app-shell.tsx`, `apps/web/messages/en.json`, `apps/web/messages/ru.json`
- Test: `apps/web/lib/dashboard/origins.test.ts`, `apps/web/lib/dashboard/projects.test.ts`

**Interfaces:**
- Consumes: `withUser`, `Db` (Task 1), `requireUser` (Task 2), `AppShell`, `ShellProject` (Task 3), `ENTITLEMENTS`, `getDeps`, `AppDeps`.
- Produces:
  ```ts
  // lib/dashboard/result.ts
  type ActionResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };
  type DashDeps = Pick<AppDeps, 'db' | 'storage' | 'env' | 'fetch'>;
  const isUuid: (value: string) => boolean;
  // lib/dashboard/origins.ts
  function normalizeOrigin(input: string): string | null; // "example.com" → "https://example.com"
  // lib/dashboard/projects.ts
  interface ProjectSummary { id: string; name: string; public_key: string }
  interface ProjectDetail extends ProjectSummary { allowed_origins: string[]; primary_color: string; trigger_text: string;
    position: 'bottom-right' | 'bottom-left'; hide_badge: boolean; custom_css: string | null; locale: WidgetLocale }
  listProjects(deps: DashDeps, userId: string): Promise<ProjectSummary[]>;
  getProject(deps: DashDeps, userId: string, projectId: string): Promise<ProjectDetail | null>;
  createProject(deps: DashDeps, userId: string, input: unknown): Promise<ActionResult<{ projectId: string }>>;
  hasFeedback(deps: DashDeps, userId: string, projectId: string): Promise<boolean>;
  ownsProject(deps: DashDeps, userId: string, projectId: string): Promise<boolean>; // withUser check, false for non-uuid
  canCreateProject(deps: DashDeps, userId: string): Promise<boolean>;
  // app/app/actions.ts ('use server') — extended by later tasks
  createProjectAction(input: { name: string; siteUrl?: string }): Promise<ActionResult<{ projectId: string }>>;
  hasFeedbackAction(projectId: string): Promise<boolean>;
  ```

- [ ] **Step 1: Write failing tests**

`apps/web/lib/dashboard/origins.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { normalizeOrigin } from './origins';

describe('normalizeOrigin', () => {
  it.each([
    ['example.com', 'https://example.com'],
    ['https://shop.example.com/path?q=1', 'https://shop.example.com'],
    ['http://localhost:3000', 'http://localhost:3000'],
    ['  HTTPS://Example.COM  ', 'https://example.com'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeOrigin(input)).toBe(expected);
  });

  it.each(['', 'ftp://example.com', 'javascript:alert(1)', 'http://', 'exa mple.com'])('rejects %s', (input) => {
    expect(normalizeOrigin(input)).toBeNull();
  });
});
```

`apps/web/lib/dashboard/projects.test.ts`:
```ts
import { createFeedback, createProject, createUser, grantPro, withTx, type TestDb } from '@dymcode/db-tests/harness';
import { describe, expect, it } from 'vitest';
import { VALID_ENV } from '@/test/fixtures';
import { parseEnv } from '../env';
import { createMemoryStorage } from '../storage';
import { canCreateProject, createProject as create, getProject, hasFeedback, listProjects } from './projects';
import type { DashDeps } from './result';

const deps = (db: TestDb): DashDeps => ({ db, storage: createMemoryStorage(), env: parseEnv(VALID_ENV), fetch });

describe('projects', () => {
  it('lists and reads only the user’s own projects', () =>
    withTx(async (db) => {
      const a = await createUser(db);
      const b = await createUser(db);
      const mine = await createProject(db, a, 'Mine');
      await createProject(db, b, 'Theirs');
      expect(await listProjects(deps(db), a)).toEqual([{ id: mine.id, name: 'Mine', public_key: mine.public_key }]);
      expect((await getProject(deps(db), a, mine.id))?.name).toBe('Mine');
      expect(await getProject(deps(db), b, mine.id)).toBeNull();
      expect(await getProject(deps(db), a, 'not-a-uuid')).toBeNull();
    }));

  it('creates a project with a normalized origin', () =>
    withTx(async (db) => {
      const a = await createUser(db);
      const result = await create(deps(db), a, { name: '  Acme  ', siteUrl: 'acme.io/landing' });
      expect(result.ok).toBe(true);
      const project = await getProject(deps(db), a, (result as { projectId: string }).projectId);
      expect(project).toMatchObject({ name: 'Acme', allowed_origins: ['https://acme.io'] });
    }));

  it('validates input', () =>
    withTx(async (db) => {
      const a = await createUser(db);
      expect(await create(deps(db), a, { name: '' })).toEqual({ ok: false, error: 'projects.nameInvalid' });
      expect(await create(deps(db), a, { name: 'x', siteUrl: 'ftp://x' })).toEqual({
        ok: false,
        error: 'projects.urlInvalid',
      });
    }));

  it('limits Free accounts to one project but not Pro accounts', () =>
    withTx(async (db) => {
      const free = await createUser(db);
      expect(await canCreateProject(deps(db), free)).toBe(true);
      expect((await create(deps(db), free, { name: 'One' })).ok).toBe(true);
      expect(await canCreateProject(deps(db), free)).toBe(false);
      expect(await create(deps(db), free, { name: 'Two' })).toEqual({ ok: false, error: 'projects.limitReached' });

      const pro = await createUser(db);
      await grantPro(db, pro);
      await create(deps(db), pro, { name: 'One' });
      expect((await create(deps(db), pro, { name: 'Two' })).ok).toBe(true);
    }));

  it('reports whether a project has received feedback', () =>
    withTx(async (db) => {
      const a = await createUser(db);
      const project = await createProject(db, a);
      expect(await hasFeedback(deps(db), a, project.id)).toBe(false);
      await createFeedback(db, project.id);
      expect(await hasFeedback(deps(db), a, project.id)).toBe(true);
      const b = await createUser(db);
      expect(await hasFeedback(deps(db), b, project.id)).toBe(false);
    }));
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @dymcode/web test`
Expected: FAIL with unresolved `./origins`, `./projects`, `./result`.

- [ ] **Step 3: Implement the use cases**

`apps/web/lib/dashboard/result.ts`:
```ts
import type { AppDeps } from '../deps';

export type ActionResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

export type DashDeps = Pick<AppDeps, 'db' | 'storage' | 'env' | 'fetch'>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string) => UUID.test(value);
```

`apps/web/lib/dashboard/origins.ts`:
```ts
/** Normalizes user input like "shop.example.com/path" to an origin ("https://shop.example.com"). */
export function normalizeOrigin(input: string): string | null {
  const value = input.trim();
  if (!value || /\s/.test(value)) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(value);
  let url: URL;
  try {
    url = new URL(hasScheme ? value : `https://${value}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!url.hostname) return null;
  return url.origin;
}
```

`apps/web/lib/dashboard/projects.ts`:
```ts
import type { WidgetLocale } from '@dymcode/shared';
import { z } from 'zod';
import { ENTITLEMENTS } from '../billing/plans';
import type { Row } from '../db/types';
import { withUser } from '../db/with-user';
import { normalizeOrigin } from './origins';
import { isUuid, type ActionResult, type DashDeps } from './result';

export interface ProjectSummary extends Row {
  id: string;
  name: string;
  public_key: string;
}

export interface ProjectDetail extends ProjectSummary {
  allowed_origins: string[];
  primary_color: string;
  trigger_text: string;
  position: 'bottom-right' | 'bottom-left';
  hide_badge: boolean;
  custom_css: string | null;
  locale: WidgetLocale;
}

export function listProjects(deps: DashDeps, userId: string): Promise<ProjectSummary[]> {
  return withUser(deps.db, userId, (tx) =>
    tx.query<ProjectSummary>('select id, name, public_key from public.projects order by created_at, id'),
  );
}

export async function getProject(deps: DashDeps, userId: string, projectId: string): Promise<ProjectDetail | null> {
  if (!isUuid(projectId)) return null;
  const [row] = await withUser(deps.db, userId, (tx) =>
    tx.query<ProjectDetail>(
      `select id, name, public_key, allowed_origins, primary_color, trigger_text, "position"::text as "position",
              hide_badge, custom_css, locale::text as locale
       from public.projects where id = $1`,
      [projectId],
    ),
  );
  return row ?? null;
}

export async function canCreateProject(deps: DashDeps, userId: string): Promise<boolean> {
  const [row] = await deps.db.query<{ n: number; pro: boolean }>(
    'select count(*)::int as n, public.is_pro($1) as pro from public.projects where owner_id = $1',
    [userId],
  );
  return Boolean(row?.pro) || (row?.n ?? 0) < ENTITLEMENTS.free.maxProjects;
}

const CreateInput = z.object({
  name: z.string().trim().min(1).max(80),
  siteUrl: z.string().trim().max(2048).optional(),
});

export async function createProject(
  deps: DashDeps,
  userId: string,
  input: unknown,
): Promise<ActionResult<{ projectId: string }>> {
  const parsed = CreateInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'projects.nameInvalid' };
  const { name, siteUrl } = parsed.data;
  let origins: string[] = [];
  if (siteUrl) {
    const origin = normalizeOrigin(siteUrl);
    if (!origin) return { ok: false, error: 'projects.urlInvalid' };
    origins = [origin];
  }
  // Projects have no client INSERT policy: created with the service connection after the plan check.
  if (!(await canCreateProject(deps, userId))) return { ok: false, error: 'projects.limitReached' };
  const [row] = await deps.db.query<{ id: string }>(
    'insert into public.projects (owner_id, name, allowed_origins) values ($1, $2, $3::text[]) returning id',
    [userId, name, origins],
  );
  return { ok: true, projectId: row!.id };
}

export export async function hasFeedback(deps: DashDeps, userId: string, projectId: string): Promise<boolean> {
  if (!isUuid(projectId)) return false;
  const [row] = await withUser(deps.db, userId, (tx) =>
    tx.query<{ found: boolean }>('select exists(select 1 from public.feedback where project_id = $1) as found', [
      projectId,
    ]),
  );
  return Boolean(row?.found);
}
```

- [ ] **Step 4: Verify the use cases**

Run: `pnpm --filter @dymcode/web test`
Expected: PASS.

- [ ] **Step 5: Messages, actions and pages**

Add to both message files (English / Russian):
```json
"projects": {
  "newTitle": "Create your project" / "Создайте проект",
  "name": "Project name" / "Название проекта",
  "siteUrl": "Website (optional)" / "Сайт (необязательно)",
  "siteUrlHint": "Used to restrict where the widget can send feedback from." / "Нужен, чтобы виджет принимал отзывы только с вашего сайта.",
  "create": "Create project" / "Создать проект",
  "nameInvalid": "Enter a name from 1 to 80 characters." / "Введите название от 1 до 80 символов.",
  "urlInvalid": "Enter a valid website address." / "Введите корректный адрес сайта.",
  "limitReached": "The Free plan includes one project. Upgrade to Pro for unlimited projects." / "На бесплатном тарифе доступен один проект. Перейдите на Pro, чтобы создавать сколько угодно.",
  "upgrade": "Upgrade to Pro" / "Перейти на Pro"
},
"install": {
  "title": "Install the widget" / "Установите виджет",
  "intro": "Paste this snippet before the closing </body> tag of your site." / "Вставьте этот код перед закрывающим тегом </body> на вашем сайте.",
  "nextjsTitle": "Next.js / React" / "Next.js / React",
  "nextjsHint": "Use next/script with strategy \"afterInteractive\" in your root layout." / "Используйте next/script со strategy=\"afterInteractive\" в корневом layout.",
  "customTitle": "Your own button" / "Своя кнопка",
  "customHint": "Add data-hide-trigger and call Dymcode.open('bug') from your UI." / "Добавьте data-hide-trigger и вызывайте Dymcode.open('bug') из своего интерфейса.",
  "identifyTitle": "Identify signed-in users" / "Передача данных пользователя",
  "identifyHint": "Call Dymcode.identify({ email, id, name }) after sign-in." / "Вызовите Dymcode.identify({ email, id, name }) после входа пользователя.",
  "waiting": "Waiting for your first feedback…" / "Ждём первый отзыв…",
  "received": "🎉 Your first feedback arrived!" / "🎉 Первый отзыв получен!",
  "openFeedback": "Open feedback" / "Открыть отзывы",
  "connectTelegram": "Connect Telegram" / "Подключить Telegram"
}
```
(Write each file with its own language values; the `/` above only separates EN / RU for this plan.)

`apps/web/app/app/actions.ts`:
```ts
'use server';

import { requireUser } from '@/lib/auth/session';
import { createProject, hasFeedback } from '@/lib/dashboard/projects';
import type { ActionResult } from '@/lib/dashboard/result';
import { getDeps } from '@/lib/deps';

export async function createProjectAction(input: {
  name: string;
  siteUrl?: string;
}): Promise<ActionResult<{ projectId: string }>> {
  const user = await requireUser();
  return createProject(await getDeps(), user.id, input);
}

export async function hasFeedbackAction(projectId: string): Promise<boolean> {
  const user = await requireUser();
  return hasFeedback(await getDeps(), user.id, projectId);
}
```

`apps/web/app/app/layout.tsx`:
```tsx
import type { ReactNode } from 'react';
import { requireUser } from '@/lib/auth/session';
import { listProjects } from '@/lib/dashboard/projects';
import { getDeps } from '@/lib/deps';
import { AppShell } from '@/components/app/app-shell';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const projects = await listProjects(await getDeps(), user.id);
  return (
    <AppShell projects={projects} email={user.email}>
      {children}
    </AppShell>
  );
}
```
The layout cannot see the `[projectId]` param, so the project-specific part of the sidebar moves into a client component that reads the pathname. Create `apps/web/components/app/project-nav.tsx`:
```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ProjectSwitcher, type ShellProject } from './project-switcher';

const SECTIONS = ['feedback', 'install', 'settings', 'integrations'] as const;

export function ProjectNav({ projects }: { projects: ShellProject[] }) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const match = /^\/app\/p\/([^/]+)(?:\/([^/]+))?/.exec(pathname);
  const currentProjectId = match?.[1] ?? null;
  const section = match?.[2];
  return (
    <>
      <ProjectSwitcher projects={projects} currentProjectId={currentProjectId} />
      {currentProjectId && (
        <ul className="flex flex-col gap-1 text-sm">
          {SECTIONS.map((key) => (
            <li key={key}>
              <Link
                href={`/app/p/${currentProjectId}/${key}`}
                className={`block rounded-md px-3 py-2 hover:bg-muted ${section === key ? 'bg-muted font-medium' : ''}`}
                data-testid={`nav-${key}`}
              >
                {t(key)}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
```
In `apps/web/components/app/app-shell.tsx`: remove `currentProjectId` from the `Nav` and `AppShell` props, delete the `base`/`projectLinks` computation and the project `<ul>`, and render `<ProjectNav projects={projects} />` where `<ProjectSwitcher … />` was (import it from `./project-nav`; drop the `ProjectSwitcher` import, keep the `ShellProject` type import). The resulting signatures are `Nav({ projects, email })` and `AppShell(props: { projects: ShellProject[]; email: string; children: ReactNode })`.

`apps/web/app/app/page.tsx`:
```tsx
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { listProjects } from '@/lib/dashboard/projects';
import { getDeps } from '@/lib/deps';

export default async function AppIndex() {
  const user = await requireUser();
  const [first] = await listProjects(await getDeps(), user.id);
  redirect(first ? `/app/p/${first.id}/feedback` : '/app/new');
}
```

`apps/web/app/app/new/page.tsx`:
```tsx
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireUser } from '@/lib/auth/session';
import { canCreateProject } from '@/lib/dashboard/projects';
import { getDeps } from '@/lib/deps';
import { NewProjectForm } from './new-project-form';

export default async function NewProjectPage() {
  const user = await requireUser();
  const t = await getTranslations('projects');
  const allowed = await canCreateProject(await getDeps(), user.id);
  return (
    <div className="mx-auto max-w-lg p-6">
      <h1 className="mb-6 text-2xl font-semibold">{t('newTitle')}</h1>
      {allowed ? (
        <NewProjectForm />
      ) : (
        <div className="rounded-lg border p-4" data-testid="project-limit">
          <p>{t('limitReached')}</p>
          <Link href="/app/billing" className="mt-3 inline-block underline">
            {t('upgrade')}
          </Link>
        </div>
      )}
    </div>
  );
}
```

`apps/web/app/app/new/new-project-form.tsx`:
```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createProjectAction } from '../actions';

export function NewProjectForm() {
  const t = useTranslations();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-4"
      action={(form) =>
        start(async () => {
          const result = await createProjectAction({
            name: String(form.get('name') ?? ''),
            siteUrl: String(form.get('siteUrl') ?? '') || undefined,
          });
          if (result.ok) router.push(`/app/p/${result.projectId}/install`);
          else setError(result.error);
        })
      }
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">{t('projects.name')}</Label>
        <Input id="name" name="name" required maxLength={80} data-testid="project-name" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="siteUrl">{t('projects.siteUrl')}</Label>
        <Input id="siteUrl" name="siteUrl" placeholder="https://example.com" data-testid="project-site" />
        <p className="text-xs text-muted-foreground">{t('projects.siteUrlHint')}</p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t(error)}
        </p>
      )}
      <Button type="submit" disabled={pending} data-testid="project-create">
        {t('projects.create')}
      </Button>
    </form>
  );
}
```

`apps/web/app/app/p/[projectId]/layout.tsx`:
```tsx
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { requireUser } from '@/lib/auth/session';
import { getProject } from '@/lib/dashboard/projects';
import { getDeps } from '@/lib/deps';

export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const user = await requireUser();
  const { projectId } = await params;
  if (!(await getProject(await getDeps(), user.id, projectId))) notFound();
  return <>{children}</>;
}
```

`apps/web/components/app/copy-button.tsx`:
```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function CopyButton({ text, testId }: { text: string; testId?: string }) {
  const t = useTranslations('common');
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      data-testid={testId}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? t('copied') : t('copy')}
    </Button>
  );
}
```

`apps/web/components/app/first-feedback-watcher.tsx`:
```tsx
'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { hasFeedbackAction } from '@/app/app/actions';

const POLL_MS = 3000;

export function FirstFeedbackWatcher({ projectId, initial }: { projectId: string; initial: boolean }) {
  const t = useTranslations('install');
  const [received, setReceived] = useState(initial);
  useEffect(() => {
    if (received) return;
    const timer = setInterval(async () => {
      if (await hasFeedbackAction(projectId)) setReceived(true);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [projectId, received]);

  if (!received) {
    return (
      <p className="animate-pulse text-muted-foreground" data-testid="install-waiting">
        {t('waiting')}
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3" data-testid="install-received">
      <span className="font-medium">{t('received')}</span>
      <Link href={`/app/p/${projectId}/feedback`} className="underline">
        {t('openFeedback')}
      </Link>
      <Link href={`/app/p/${projectId}/integrations`} className="underline">
        {t('connectTelegram')}
      </Link>
    </div>
  );
}
```

`apps/web/app/app/p/[projectId]/install/page.tsx`:
```tsx
import { getTranslations } from 'next-intl/server';
import { CopyButton } from '@/components/app/copy-button';
import { FirstFeedbackWatcher } from '@/components/app/first-feedback-watcher';
import { requireUser } from '@/lib/auth/session';
import { getProject, hasFeedback } from '@/lib/dashboard/projects';
import { getDeps } from '@/lib/deps';

export default async function InstallPage({ params }: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser();
  const { projectId } = await params;
  const deps = await getDeps();
  const project = (await getProject(deps, user.id, projectId))!;
  const t = await getTranslations('install');
  const src = `${deps.env.NEXT_PUBLIC_APP_URL}/w/widget.js`;
  const snippet = `<script async src="${src}" data-project-id="${project.public_key}"></script>`;
  const nextSnippet = `import Script from 'next/script';\n\n<Script src="${src}" data-project-id="${project.public_key}" strategy="afterInteractive" />`;
  const Block = ({ code, testId }: { code: string; testId?: string }) => (
    <div className="relative rounded-md border bg-muted p-3">
      <pre className="overflow-x-auto pr-20 text-xs" data-testid={testId}>
        {code}
      </pre>
      <div className="absolute right-2 top-2">
        <CopyButton text={code} />
      </div>
    </div>
  );
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p>{t('intro')}</p>
      <Block code={snippet} testId="install-snippet" />
      <FirstFeedbackWatcher projectId={project.id} initial={await hasFeedback(deps, user.id, project.id)} />
      <section className="flex flex-col gap-2">
        <h2 className="font-medium">{t('nextjsTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('nextjsHint')}</p>
        <Block code={nextSnippet} />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="font-medium">{t('customTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('customHint')}</p>
        <Block code={`<script async src="${src}" data-project-id="${project.public_key}" data-hide-trigger></script>\n<button onclick="Dymcode.open('bug')">Report a bug</button>`} />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="font-medium">{t('identifyTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('identifyHint')}</p>
        <Block code={`Dymcode.identify({ email: user.email, id: user.id, name: user.name });`} />
      </section>
    </div>
  );
}
```

- [ ] **Step 6: Verify and commit**

Run: `pnpm --filter @dymcode/web test && pnpm typecheck && pnpm --filter @dymcode/web build`
Expected: PASS.
```bash
pnpm format
git add apps/web
git commit -m "feat(web): add projects, onboarding and the install page"
```

---

### Task 5: Feedback use cases

**Files:**
- Create: `apps/web/lib/dashboard/feedback.ts`
- Modify: `apps/web/lib/notify/dispatch.ts` (dashboard URL), `apps/web/lib/notify/dispatch.test.ts`
- Test: `apps/web/lib/dashboard/feedback.test.ts`

**Interfaces:**
- Consumes: `withUser`, `DashDeps`, `ActionResult`, `isUuid`, `ownsProject` (Tasks 1, 4), `createMemoryStorage`.
- Produces:
  ```ts
  const FEEDBACK_PAGE_SIZE = 50;
  type FeedbackStatus = 'new' | 'resolved' | 'archived';
  interface FeedbackCursor { createdAt: string; id: string }         // ISO string + uuid
  interface FeedbackListItem { id: string; type: FeedbackType; message: string; status: FeedbackStatus;
    created_at: string; has_screenshot: boolean }                     // message ≤ 200 chars, created_at ISO
  interface FeedbackDetail extends FeedbackListItem { project_id: string; email: string | null; metadata: Partial<FeedbackMetadata> }
  listFeedback(deps, userId, input: { projectId: string; type?: FeedbackType; status?: FeedbackStatus; cursor?: FeedbackCursor })
    : Promise<{ items: FeedbackListItem[]; nextCursor: FeedbackCursor | null }>;
  getFeedback(deps, userId, feedbackId: string): Promise<FeedbackDetail | null>; // full message
  hiddenFeedbackCount(deps, userId, projectId: string): Promise<number>;
  usage(deps, userId): Promise<{ used: number; limit: number | null; pro: boolean }>;
  setFeedbackStatus(deps, userId, input: { feedbackId: string; status: FeedbackStatus }): Promise<ActionResult>;
  deleteFeedback(deps, userId, feedbackId: string): Promise<ActionResult>;
  screenshotUrl(deps, userId, feedbackId: string): Promise<string | null>;
  function encodeCursor(c: FeedbackCursor): string; function decodeCursor(s: string | undefined): FeedbackCursor | undefined;
  ```
- Dispatch dashboard links become `${APP_URL}/app/p/${projectId}/feedback?f=${feedbackId}`, and the quota notice links to `${APP_URL}/app/billing`.

- [ ] **Step 1: Write failing tests**

`apps/web/lib/dashboard/feedback.test.ts`:
```ts
import { createFeedback, createProject, createUser, grantPro, withTx, type TestDb } from '@dymcode/db-tests/harness';
import { describe, expect, it } from 'vitest';
import { VALID_ENV } from '@/test/fixtures';
import { parseEnv } from '../env';
import { createMemoryStorage, type MemoryStorage } from '../storage';
import {
  decodeCursor,
  deleteFeedback,
  encodeCursor,
  getFeedback,
  hiddenFeedbackCount,
  listFeedback,
  screenshotUrl,
  setFeedbackStatus,
  usage,
} from './feedback';
import type { DashDeps } from './result';

function setup(db: TestDb) {
  const storage: MemoryStorage = createMemoryStorage();
  const deps: DashDeps = { db, storage, env: parseEnv(VALID_ENV), fetch };
  return { deps, storage };
}

async function seed(db: TestDb, count: number) {
  const owner = await createUser(db);
  const project = await createProject(db, owner);
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = await createFeedback(db, project.id, { message: `m${i}` });
    await db.query(`update public.feedback set created_at = now() - ($2 || ' minutes')::interval where id = $1`, [
      id,
      String(count - i),
    ]);
    ids.push(id);
  }
  return { owner, project, ids };
}

describe('feedback use cases', () => {
  it('lists newest first with cursor pagination and filters', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const { owner, project, ids } = await seed(db, 55);
      const first = await listFeedback(deps, owner, { projectId: project.id });
      expect(first.items).toHaveLength(50);
      expect(first.items[0]!.id).toBe(ids[54]);
      expect(first.nextCursor).not.toBeNull();
      const second = await listFeedback(deps, owner, { projectId: project.id, cursor: first.nextCursor! });
      expect(second.items.map((i) => i.id)).toEqual(ids.slice(0, 5).reverse());
      expect(second.nextCursor).toBeNull();
      await db.query(`update public.feedback set type = 'idea' where id = $1`, [ids[3]]);
      const ideas = await listFeedback(deps, owner, { projectId: project.id, type: 'idea' });
      expect(ideas.items.map((i) => i.id)).toEqual([ids[3]]);
      const resolved = await listFeedback(deps, owner, { projectId: project.id, status: 'resolved' });
      expect(resolved.items).toEqual([]);
    }));

  it('round-trips cursors and rejects garbage', () => {
    const cursor = { createdAt: '2026-09-22T10:00:00.000Z', id: '8c0e2f36-3c5e-4f63-9d5b-0a4d1b1f6a10' };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
    expect(decodeCursor('garbage')).toBeUndefined();
    expect(decodeCursor(undefined)).toBeUndefined();
  });

  it('never exposes other users’ feedback', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const { project, ids } = await seed(db, 1);
      const stranger = await createUser(db);
      expect((await listFeedback(deps, stranger, { projectId: project.id })).items).toEqual([]);
      expect(await getFeedback(deps, stranger, ids[0]!)).toBeNull();
      expect(await setFeedbackStatus(deps, stranger, { feedbackId: ids[0]!, status: 'resolved' })).toEqual({
        ok: false,
        error: 'errors.notFound',
      });
      expect(await deleteFeedback(deps, stranger, ids[0]!)).toEqual({ ok: false, error: 'errors.notFound' });
    }));

  it('hides over-quota feedback from Free owners but counts it', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const owner = await createUser(db);
      const project = await createProject(db, owner);
      await createFeedback(db, project.id, { message: 'visible' });
      await createFeedback(db, project.id, { message: 'hidden', overQuota: true });
      expect((await listFeedback(deps, owner, { projectId: project.id })).items.map((i) => i.message)).toEqual([
        'visible',
      ]);
      expect(await hiddenFeedbackCount(deps, owner, project.id)).toBe(1);
      await grantPro(db, owner);
      expect(await hiddenFeedbackCount(deps, owner, project.id)).toBe(0);
      const stranger = await createUser(db);
      expect(await hiddenFeedbackCount(deps, stranger, project.id)).toBe(0);
    }));

  it('updates status and deletes feedback with its screenshot', () =>
    withTx(async (db) => {
      const { deps, storage } = setup(db);
      const { owner, project, ids } = await seed(db, 1);
      const path = `${project.id}/${ids[0]}.webp`;
      await storage.upload(path, new Uint8Array([1]), 'image/webp');
      await db.query('update public.feedback set screenshot_path = $1 where id = $2', [path, ids[0]]);
      expect(await screenshotUrl(deps, owner, ids[0]!)).toMatch(/^data:image\/webp;base64,/);
      expect(await setFeedbackStatus(deps, owner, { feedbackId: ids[0]!, status: 'resolved' })).toEqual({ ok: true });
      expect((await getFeedback(deps, owner, ids[0]!))?.status).toBe('resolved');
      expect(await deleteFeedback(deps, owner, ids[0]!)).toEqual({ ok: true });
      expect(await getFeedback(deps, owner, ids[0]!)).toBeNull();
      expect(storage.files.has(path)).toBe(false);
    }));

  it('reports monthly usage and plan', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const owner = await createUser(db);
      expect(await usage(deps, owner)).toEqual({ used: 0, limit: 20, pro: false });
      await db.query(
        `insert into public.usage_counters (owner_id, period, count)
         values ($1, date_trunc('month', now() at time zone 'utc')::date, 7)`,
        [owner],
      );
      expect(await usage(deps, owner)).toEqual({ used: 7, limit: 20, pro: false });
      await grantPro(db, owner);
      expect(await usage(deps, owner)).toEqual({ used: 7, limit: null, pro: true });
    }));
});
```

In `apps/web/lib/notify/dispatch.test.ts`, change the expected dashboard link from `https://dymcode.dev/projects/${project.id}/feedback?f=${feedbackId}` to `https://dymcode.dev/app/p/${project.id}/feedback?f=${feedbackId}`.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @dymcode/web test`
Expected: FAIL with unresolved `./feedback`, and the dispatch link assertion fails.

- [ ] **Step 3: Implement**

In `apps/web/lib/notify/dispatch.ts`, change `dashboardUrl` to:
```ts
    dashboardUrl: `${deps.env.NEXT_PUBLIC_APP_URL}/app/p/${row.project_id}/feedback?f=${feedbackId}`,
```
and in `quotaNoticeText` replace `${appUrl}/billing` with `${appUrl}/app/billing`. Update any test that asserts the old quota text (search `apps/web` for `/billing` in `*.test.ts` and `e2e/*.spec.ts`).

`apps/web/lib/dashboard/feedback.ts`:
```ts
import type { FeedbackMetadata, FeedbackType } from '@dymcode/shared';
import { z } from 'zod';
import { ENTITLEMENTS } from '../billing/plans';
import type { Row } from '../db/types';
import { withUser } from '../db/with-user';
import { ownsProject } from './projects';
import { isUuid, type ActionResult, type DashDeps } from './result';

export const FEEDBACK_PAGE_SIZE = 50;
export type FeedbackStatus = 'new' | 'resolved' | 'archived';

export interface FeedbackCursor {
  createdAt: string;
  id: string;
}

export interface FeedbackListItem {
  id: string;
  type: FeedbackType;
  message: string;
  status: FeedbackStatus;
  created_at: string;
  has_screenshot: boolean;
}

export interface FeedbackDetail extends FeedbackListItem {
  project_id: string;
  email: string | null;
  metadata: Partial<FeedbackMetadata>;
}

interface ListRow extends Row {
  id: string;
  type: FeedbackType;
  message: string;
  status: FeedbackStatus;
  created_at: Date | string;
  has_screenshot: boolean;
}

const iso = (value: Date | string) => new Date(value).toISOString();

export const encodeCursor = (c: FeedbackCursor) => Buffer.from(JSON.stringify(c)).toString('base64url');

const CursorSchema = z.object({ createdAt: z.iso.datetime(), id: z.uuid() });

export function decodeCursor(value: string | undefined): FeedbackCursor | undefined {
  if (!value) return undefined;
  try {
    const parsed = CursorSchema.safeParse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

const ListInput = z.object({
  projectId: z.uuid(),
  type: z.enum(['bug', 'idea', 'general']).optional(),
  status: z.enum(['new', 'resolved', 'archived']).default('new'),
  cursor: CursorSchema.optional(),
});

export async function listFeedback(
  deps: DashDeps,
  userId: string,
  input: unknown,
): Promise<{ items: FeedbackListItem[]; nextCursor: FeedbackCursor | null }> {
  const parsed = ListInput.safeParse(input);
  if (!parsed.success) return { items: [], nextCursor: null };
  const { projectId, type, status, cursor } = parsed.data;
  const rows = await withUser(deps.db, userId, (tx) =>
    tx.query<ListRow>(
      `select id, type::text as type, left(message, 200) as message, status::text as status, created_at,
              screenshot_path is not null as has_screenshot
       from public.feedback
       where project_id = $1 and status = $2::feedback_status
         and ($3::text is null or type = $3::feedback_type)
         and ($4::timestamptz is null or (created_at, id) < ($4::timestamptz, $5::uuid))
       order by created_at desc, id desc
       limit $6`,
      [projectId, status, type ?? null, cursor?.createdAt ?? null, cursor?.id ?? null, FEEDBACK_PAGE_SIZE + 1],
    ),
  );
  const page = rows.slice(0, FEEDBACK_PAGE_SIZE).map((r) => ({ ...r, created_at: iso(r.created_at) }));
  const last = page[page.length - 1];
  return {
    items: page,
    nextCursor: rows.length > FEEDBACK_PAGE_SIZE && last ? { createdAt: last.created_at, id: last.id } : null,
  };
}

export async function getFeedback(deps: DashDeps, userId: string, feedbackId: string): Promise<FeedbackDetail | null> {
  if (!isUuid(feedbackId)) return null;
  const [row] = await withUser(deps.db, userId, (tx) =>
    tx.query<ListRow & { project_id: string; email: string | null; metadata: Partial<FeedbackMetadata> }>(
      `select id, project_id, type::text as type, message, email, status::text as status, created_at, metadata,
              screenshot_path is not null as has_screenshot
       from public.feedback where id = $1`,
      [feedbackId],
    ),
  );
  return row ? { ...row, created_at: iso(row.created_at) } : null;
}

async function ownsProject(deps: DashDeps, userId: string, projectId: string): Promise<boolean> {
  if (!isUuid(projectId)) return false;
  const [row] = await withUser(deps.db, userId, (tx) =>
    tx.query<{ found: boolean }>('select exists(select 1 from public.projects where id = $1) as found', [projectId]),
  );
  return Boolean(row?.found);
}

export async function hiddenFeedbackCount(deps: DashDeps, userId: string, projectId: string): Promise<number> {
  if (!(await ownsProject(deps, userId, projectId))) return 0;
  const [row] = await deps.db.query<{ n: number }>(
    `select count(*)::int as n from public.feedback f join public.projects p on p.id = f.project_id
     where f.project_id = $1 and f.over_quota and not public.is_pro(p.owner_id)`,
    [projectId],
  );
  return row?.n ?? 0;
}

export async function usage(deps: DashDeps, userId: string): Promise<{ used: number; limit: number | null; pro: boolean }> {
  const [row] = await deps.db.query<{ used: number; pro: boolean }>(
    `select coalesce((select count from public.usage_counters
                      where owner_id = $1 and period = date_trunc('month', now() at time zone 'utc')::date), 0)::int as used,
            public.is_pro($1) as pro`,
    [userId],
  );
  const pro = Boolean(row?.pro);
  return { used: row?.used ?? 0, limit: pro ? null : ENTITLEMENTS.free.monthlySubmissions, pro };
}

const StatusInput = z.object({ feedbackId: z.uuid(), status: z.enum(['new', 'resolved', 'archived']) });

export async function setFeedbackStatus(deps: DashDeps, userId: string, input: unknown): Promise<ActionResult> {
  const parsed = StatusInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'errors.notFound' };
  const rows = await withUser(deps.db, userId, (tx) =>
    tx.query('update public.feedback set status = $2::feedback_status where id = $1 returning id', [
      parsed.data.feedbackId,
      parsed.data.status,
    ]),
  );
  return rows.length ? { ok: true } : { ok: false, error: 'errors.notFound' };
}

export async function deleteFeedback(deps: DashDeps, userId: string, feedbackId: string): Promise<ActionResult> {
  if (!isUuid(feedbackId)) return { ok: false, error: 'errors.notFound' };
  const rows = await withUser(deps.db, userId, (tx) =>
    tx.query<{ screenshot_path: string | null }>(
      'delete from public.feedback where id = $1 returning screenshot_path',
      [feedbackId],
    ),
  );
  if (!rows.length) return { ok: false, error: 'errors.notFound' };
  const path = rows[0]!.screenshot_path;
  if (path) await deps.storage.remove([path]).catch((e: unknown) => console.error('[dashboard] screenshot remove', e));
  return { ok: true };
}

export async function screenshotUrl(deps: DashDeps, userId: string, feedbackId: string): Promise<string | null> {
  if (!isUuid(feedbackId)) return null;
  const [row] = await withUser(deps.db, userId, (tx) =>
    tx.query<{ screenshot_path: string | null }>('select screenshot_path from public.feedback where id = $1', [
      feedbackId,
    ]),
  );
  return row?.screenshot_path ? deps.storage.signedUrl(row.screenshot_path, 300) : null;
}
```
Note: RLS lets owners delete their own feedback (`feedback: delete own` requires the row to be visible, so hidden over-quota rows cannot be deleted by Free owners; this is intended). If `z.iso.datetime()` is not available in the installed zod, use `z.string().datetime()`.

- [ ] **Step 4: Verify and commit**

Run: `pnpm --filter @dymcode/web test && pnpm typecheck`
Expected: PASS.
```bash
pnpm format
git add apps/web
git commit -m "feat(web): add feedback feed use cases"
```

---

### Task 6: Feedback feed UI

**Files:**
- Create: `apps/web/app/app/p/[projectId]/feedback/page.tsx`, `apps/web/components/app/feedback/feedback-filters.tsx`, `apps/web/components/app/feedback/feedback-list.tsx`, `apps/web/components/app/feedback/feedback-detail.tsx`, `apps/web/components/app/feedback/feedback-actions.tsx`, `apps/web/components/app/auto-refresh.tsx`, `apps/web/components/app/usage-bar.tsx`
- Modify: `apps/web/app/app/actions.ts`, `apps/web/messages/en.json`, `apps/web/messages/ru.json`

**Interfaces:**
- Consumes: Task 5 use cases, `requireUser`, `getDeps`.
- Produces (server actions in `app/app/actions.ts`):
  ```ts
  setFeedbackStatusAction(feedbackId: string, status: FeedbackStatus): Promise<ActionResult>;
  deleteFeedbackAction(feedbackId: string): Promise<ActionResult>;
  ```
- URL state of the feed page: `?type=bug|idea|general`, `?status=new|resolved|archived` (default `new`), `?before=<encoded cursor>`, `?f=<feedbackId>` (open detail).
- Test ids used by E2E (Task 11): `feedback-row` (with `data-id`), `feedback-detail`, `feedback-message`, `feedback-resolve`, `feedback-archive`, `feedback-reopen`, `feedback-delete`, `feedback-hidden`, `feedback-empty`, `filter-type-<value>`, `filter-status-<value>`, `usage-bar`, `feed-refresh`.

- [ ] **Step 1: Messages**

Add to both message files:
```json
"feedback": {
  "title": "Feedback" / "Отзывы",
  "typeAll": "All" / "Все",
  "type_bug": "Bug" / "Баг",
  "type_idea": "Idea" / "Идея",
  "type_general": "Other" / "Другое",
  "status_new": "New" / "Новые",
  "status_resolved": "Resolved" / "Решённые",
  "status_archived": "Archived" / "Архив",
  "empty": "No feedback here yet." / "Здесь пока нет отзывов.",
  "hidden": "{count, plural, one {# hidden report} other {# hidden reports}} over your Free limit. Upgrade to see them." / "{count, plural, one {# скрытый отзыв} few {# скрытых отзыва} other {# скрытых отзывов}} сверх лимита Free. Перейдите на Pro, чтобы их увидеть.",
  "loadMore": "Load more" / "Показать ещё",
  "resolve": "Resolve" / "Решено",
  "archive": "Archive" / "В архив",
  "reopen": "Reopen" / "Вернуть",
  "deleteConfirm": "Delete this feedback permanently?" / "Удалить этот отзыв навсегда?",
  "close": "Close" / "Закрыть",
  "email": "Email" / "Email",
  "page": "Page" / "Страница",
  "browser": "Browser" / "Браузер",
  "os": "OS" / "ОС",
  "viewport": "Viewport" / "Окно",
  "screen": "Screen" / "Экран",
  "language": "Language" / "Язык",
  "timezone": "Time zone" / "Часовой пояс",
  "user": "User" / "Пользователь",
  "consoleErrors": "Console errors" / "Ошибки консоли",
  "screenshot": "Screenshot" / "Скриншот",
  "usage": "{used} / {limit} submissions this month" / "{used} / {limit} отзывов в этом месяце",
  "usagePro": "{used} submissions this month" / "{used} отзывов в этом месяце"
}
```

- [ ] **Step 2: Server actions**

Append to `apps/web/app/app/actions.ts`:
```ts
import { revalidatePath } from 'next/cache';
import { deleteFeedback, setFeedbackStatus, type FeedbackStatus } from '@/lib/dashboard/feedback';

export async function setFeedbackStatusAction(feedbackId: string, status: FeedbackStatus): Promise<ActionResult> {
  const user = await requireUser();
  const result = await setFeedbackStatus(await getDeps(), user.id, { feedbackId, status });
  revalidatePath('/app', 'layout');
  return result;
}

export async function deleteFeedbackAction(feedbackId: string): Promise<ActionResult> {
  const user = await requireUser();
  const result = await deleteFeedback(await getDeps(), user.id, feedbackId);
  revalidatePath('/app', 'layout');
  return result;
}
```
(Keep all imports at the top of the file.)

- [ ] **Step 3: Components**

`apps/web/components/app/auto-refresh.tsx`:
```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useTransition } from 'react';
import { Button } from '@/components/ui/button';

export function AutoRefresh({ intervalMs }: { intervalMs: number }) {
  const router = useRouter();
  const t = useTranslations('common');
  const [pending, start] = useTransition();
  useEffect(() => {
    const timer = setInterval(() => start(() => router.refresh()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, router]);
  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={() => start(() => router.refresh())} data-testid="feed-refresh">
      {t('refresh')}
    </Button>
  );
}
```

`apps/web/components/app/usage-bar.tsx`:
```tsx
import { getTranslations } from 'next-intl/server';

export async function UsageBar({ used, limit }: { used: number; limit: number | null }) {
  const t = await getTranslations('feedback');
  if (limit === null) return <p className="text-xs text-muted-foreground" data-testid="usage-bar">{t('usagePro', { used })}</p>;
  const percent = Math.min(100, Math.round((used / limit) * 100));
  return (
    <div className="flex items-center gap-3 text-xs" data-testid="usage-bar">
      <div className="h-2 w-32 overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${percent >= 100 ? 'bg-destructive' : 'bg-primary'}`} style={{ width: `${percent}%` }} />
      </div>
      <span>{t('usage', { used, limit })}</span>
    </div>
  );
}
```

`apps/web/components/app/feedback/feedback-filters.tsx`:
```tsx
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

const TYPES = ['all', 'bug', 'idea', 'general'] as const;
const STATUSES = ['new', 'resolved', 'archived'] as const;

export async function FeedbackFilters({ base, type, status }: { base: string; type?: string; status: string }) {
  const t = await getTranslations('feedback');
  const href = (next: { type?: string; status?: string }) => {
    const params = new URLSearchParams();
    const nextType = next.type ?? type;
    if (nextType && nextType !== 'all') params.set('type', nextType);
    params.set('status', next.status ?? status);
    return `${base}?${params.toString()}`;
  };
  const pill = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs ${active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`;
  return (
    <div className="flex flex-wrap gap-2">
      {TYPES.map((value) => (
        <Link key={value} href={href({ type: value })} className={pill((type ?? 'all') === value)} data-testid={`filter-type-${value}`}>
          {value === 'all' ? t('typeAll') : t(`type_${value}`)}
        </Link>
      ))}
      <span className="mx-1 border-l" />
      {STATUSES.map((value) => (
        <Link key={value} href={href({ status: value })} className={pill(status === value)} data-testid={`filter-status-${value}`}>
          {t(`status_${value}`)}
        </Link>
      ))}
    </div>
  );
}
```

`apps/web/components/app/feedback/feedback-list.tsx`:
```tsx
import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import type { FeedbackListItem } from '@/lib/dashboard/feedback';

const DOT: Record<string, string> = { bug: 'bg-red-500', idea: 'bg-green-500', general: 'bg-indigo-500' };

export async function FeedbackList({
  items,
  hidden,
  hrefFor,
  selectedId,
  loadMoreHref,
}: {
  items: FeedbackListItem[];
  hidden: number;
  hrefFor: (id: string) => string;
  selectedId?: string;
  loadMoreHref: string | null;
}) {
  const t = await getTranslations('feedback');
  const format = await getFormatter();
  if (!items.length && !hidden) {
    return <p className="p-6 text-sm text-muted-foreground" data-testid="feedback-empty">{t('empty')}</p>;
  }
  return (
    <ul className="divide-y">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={hrefFor(item.id)}
            data-testid="feedback-row"
            data-id={item.id}
            className={`flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted ${selectedId === item.id ? 'bg-muted' : ''}`}
          >
            <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[item.type]}`} aria-label={t(`type_${item.type}`)} />
            <span className="min-w-0 flex-1 truncate">{item.message}</span>
            {item.has_screenshot && <span aria-hidden>🖼</span>}
            <time className="shrink-0 text-xs text-muted-foreground" dateTime={item.created_at}>
              {format.relativeTime(new Date(item.created_at))}
            </time>
          </Link>
        </li>
      ))}
      {hidden > 0 && (
        <li className="px-4 py-3 text-sm" data-testid="feedback-hidden">
          <div className="select-none blur-[2px]" aria-hidden>
            ████████ ████ ██████
          </div>
          <Link href="/app/billing" className="underline">
            {t('hidden', { count: hidden })}
          </Link>
        </li>
      )}
      {loadMoreHref && (
        <li className="p-3 text-center">
          <Link href={loadMoreHref} className="text-sm underline">
            {t('loadMore')}
          </Link>
        </li>
      )}
    </ul>
  );
}
```

`apps/web/components/app/feedback/feedback-actions.tsx`:
```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { deleteFeedbackAction, setFeedbackStatusAction } from '@/app/app/actions';
import type { FeedbackStatus } from '@/lib/dashboard/feedback';

export function FeedbackActions({ id, status, closeHref }: { id: string; status: FeedbackStatus; closeHref: string }) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      const result = await fn();
      if (!result.ok) toast.error(t(result.error ?? 'errors.generic'));
      else after?.();
      router.refresh();
    });
  return (
    <div className="flex flex-wrap gap-2">
      {status !== 'resolved' && (
        <Button size="sm" disabled={pending} data-testid="feedback-resolve" onClick={() => run(() => setFeedbackStatusAction(id, 'resolved'))}>
          {t('feedback.resolve')}
        </Button>
      )}
      {status !== 'archived' && (
        <Button size="sm" variant="outline" disabled={pending} data-testid="feedback-archive" onClick={() => run(() => setFeedbackStatusAction(id, 'archived'))}>
          {t('feedback.archive')}
        </Button>
      )}
      {status !== 'new' && (
        <Button size="sm" variant="outline" disabled={pending} data-testid="feedback-reopen" onClick={() => run(() => setFeedbackStatusAction(id, 'new'))}>
          {t('feedback.reopen')}
        </Button>
      )}
      <Button
        size="sm"
        variant="destructive"
        disabled={pending}
        data-testid="feedback-delete"
        onClick={() => {
          if (confirm(t('feedback.deleteConfirm'))) run(() => deleteFeedbackAction(id), () => router.push(closeHref));
        }}
      >
        {t('common.delete')}
      </Button>
    </div>
  );
}
```

`apps/web/components/app/feedback/feedback-detail.tsx`:
```tsx
import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import type { FeedbackDetail } from '@/lib/dashboard/feedback';
import { FeedbackActions } from './feedback-actions';

export async function FeedbackDetailPanel({
  feedback,
  screenshot,
  closeHref,
}: {
  feedback: FeedbackDetail;
  screenshot: string | null;
  closeHref: string;
}) {
  const t = await getTranslations('feedback');
  const format = await getFormatter();
  const m = feedback.metadata;
  const rows: Array<[string, string | undefined]> = [
    [t('page'), m.url],
    [t('browser'), m.browser],
    [t('os'), m.os],
    [t('viewport'), m.viewport ? `${m.viewport.w}×${m.viewport.h}` : undefined],
    [t('screen'), m.screen ? `${m.screen.w}×${m.screen.h} @${m.screen.dpr}x` : undefined],
    [t('language'), m.language],
    [t('timezone'), m.timezone],
    [t('user'), m.user ? [m.user.name, m.user.id].filter(Boolean).join(' · ') : undefined],
  ];
  return (
    <aside
      data-testid="feedback-detail"
      className="fixed inset-0 z-40 overflow-y-auto bg-background p-4 md:static md:z-auto md:w-[420px] md:shrink-0 md:border-l"
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {t(`type_${feedback.type}`)} · {format.dateTime(new Date(feedback.created_at), { dateStyle: 'medium', timeStyle: 'short' })}
        </span>
        <Link href={closeHref} className="text-sm underline">
          {t('close')}
        </Link>
      </div>
      <p className="whitespace-pre-wrap break-words text-sm" data-testid="feedback-message">
        {feedback.message}
      </p>
      {feedback.email && (
        <p className="mt-2 text-sm">
          {t('email')}: <a href={`mailto:${feedback.email}`} className="underline">{feedback.email}</a>
        </p>
      )}
      {screenshot && (
        <a href={screenshot} target="_blank" rel="noopener noreferrer" className="mt-4 block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={screenshot} alt={t('screenshot')} className="w-full rounded-md border" />
        </a>
      )}
      <dl className="mt-4 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
        {rows
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="break-all">{value}</dd>
            </div>
          ))}
      </dl>
      {m.consoleErrors && m.consoleErrors.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-1 text-xs font-medium">{t('consoleErrors')}</h3>
          <pre className="overflow-x-auto rounded-md bg-muted p-2 text-xs">{m.consoleErrors.map((e) => e.message).join('\n')}</pre>
        </div>
      )}
      <div className="mt-4">
        <FeedbackActions id={feedback.id} status={feedback.status} closeHref={closeHref} />
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Page**

`apps/web/app/app/p/[projectId]/feedback/page.tsx`:
```tsx
import { getTranslations } from 'next-intl/server';
import { AutoRefresh } from '@/components/app/auto-refresh';
import { FeedbackDetailPanel } from '@/components/app/feedback/feedback-detail';
import { FeedbackFilters } from '@/components/app/feedback/feedback-filters';
import { FeedbackList } from '@/components/app/feedback/feedback-list';
import { UsageBar } from '@/components/app/usage-bar';
import { requireUser } from '@/lib/auth/session';
import {
  decodeCursor,
  encodeCursor,
  getFeedback,
  hiddenFeedbackCount,
  listFeedback,
  screenshotUrl,
  usage,
  type FeedbackStatus,
} from '@/lib/dashboard/feedback';
import { getDeps } from '@/lib/deps';

const TYPES = ['bug', 'idea', 'general'] as const;
const STATUSES = ['new', 'resolved', 'archived'] as const;

export default async function FeedbackPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  const { projectId } = await params;
  const query = await searchParams;
  const deps = await getDeps();
  const t = await getTranslations('feedback');

  const type = TYPES.find((v) => v === query.type);
  const status: FeedbackStatus = STATUSES.find((v) => v === query.status) ?? 'new';
  const cursor = decodeCursor(query.before);
  const base = `/app/p/${projectId}/feedback`;
  const keep = (extra: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    if (type) next.set('type', type);
    next.set('status', status);
    if (query.before) next.set('before', query.before);
    for (const [k, v] of Object.entries(extra)) v === undefined ? next.delete(k) : next.set(k, v);
    return `${base}?${next.toString()}`;
  };

  const [{ items, nextCursor }, hidden, plan] = await Promise.all([
    listFeedback(deps, user.id, { projectId, type, status, cursor }),
    hiddenFeedbackCount(deps, user.id, projectId),
    usage(deps, user.id),
  ]);
  const selected = query.f ? await getFeedback(deps, user.id, query.f) : null;
  const screenshot = selected?.has_screenshot ? await screenshotUrl(deps, user.id, selected.id) : null;

  return (
    <div className="flex min-h-full">
      <section className="min-w-0 flex-1">
        <header className="flex flex-col gap-3 border-b p-4">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl font-semibold">{t('title')}</h1>
            <AutoRefresh intervalMs={30_000} />
          </div>
          <FeedbackFilters base={base} type={type} status={status} />
          <UsageBar used={plan.used} limit={plan.limit} />
        </header>
        <FeedbackList
          items={items}
          hidden={status === 'new' && !type && !cursor ? hidden : 0}
          selectedId={selected?.id}
          hrefFor={(id) => keep({ f: id })}
          loadMoreHref={nextCursor ? keep({ before: encodeCursor(nextCursor), f: undefined }) : null}
        />
      </section>
      {selected && <FeedbackDetailPanel feedback={selected} screenshot={screenshot} closeHref={keep({ f: undefined })} />}
    </div>
  );
}
```
Note: `hrefFor` is a function passed from a Server Component to a Server Component (`FeedbackList` is a server component), which is allowed. Do not add `'use client'` to `FeedbackList`.

- [ ] **Step 5: Verify and commit**

Run: `pnpm --filter @dymcode/web test && pnpm typecheck && pnpm --filter @dymcode/web build`
Expected: PASS.
```bash
pnpm format
git add apps/web
git commit -m "feat(web): add the feedback feed with filters and detail panel"
```

---

### Task 7: Project settings with live preview and project deletion

**Files:**
- Create: `apps/web/lib/dashboard/bytes.ts`, `apps/web/lib/dashboard/cleanup.ts`, `apps/web/lib/dashboard/settings.ts`, `packages/widget/src/preview.ts`, `packages/widget/vite.preview.config.ts`, `apps/web/app/app/p/[projectId]/settings/page.tsx`, `apps/web/components/app/settings/settings-form.tsx`, `apps/web/components/app/settings/widget-preview.tsx`, `apps/web/components/app/settings/delete-project.tsx`
- Modify: `packages/widget/package.json` (build script), `apps/web/scripts/copy-widget.mjs`, `apps/web/app/app/actions.ts`, `apps/web/messages/en.json`, `apps/web/messages/ru.json`
- Test: `apps/web/lib/dashboard/bytes.test.ts`, `apps/web/lib/dashboard/settings.test.ts`

**Interfaces:**
- Consumes: `withUser`, `DashDeps`, `ActionResult`, `getProject`, `ProjectDetail`, `normalizeOrigin` (Task 4), `Storage.remove`, shared constants `HEX_COLOR_PATTERN`, `TRIGGER_TEXT_MAX_LENGTH`, `CUSTOM_CSS_MAX_BYTES`, `WIDGET_POSITIONS`, `WIDGET_LOCALES`, `buildBadgeUrl`.
- Produces:
  ```ts
  // lib/dashboard/bytes.ts (browser-safe, no Node APIs)
  function utf8ByteLength(value: string): number;
  // lib/dashboard/cleanup.ts
  function removeScreenshots(storage: Storage, paths: string[]): Promise<void>; // chunks of 100, logs failures, never throws
  // lib/dashboard/settings.ts
  interface SettingsInput { name: string; primaryColor: string; triggerText: string; position: 'bottom-right' | 'bottom-left';
    locale: WidgetLocale; allowedOrigins: string[]; hideBadge: boolean; customCss: string }
  isPro(deps: DashDeps, userId: string): Promise<boolean>;
  updateProjectSettings(deps, userId, projectId: string, input: unknown): Promise<ActionResult>;
  deleteProject(deps, userId, input: { projectId: string; confirmName: string }): Promise<ActionResult>;
  // app/app/actions.ts
  updateProjectSettingsAction(projectId: string, input: SettingsInput): Promise<ActionResult>;
  deleteProjectAction(projectId: string, confirmName: string): Promise<ActionResult>; // redirects to /app on success
  ```
- `packages/widget/dist/preview.js`: an ES module exporting `mountWidget` (same signature as `packages/widget/src/ui/mount.ts`), served at `/w/preview.js`.
- Test ids: `settings-name`, `settings-color`, `settings-color-hex`, `settings-trigger`, `settings-position`, `settings-locale`, `settings-origins`, `settings-hide-badge`, `settings-css`, `settings-css-bytes`, `settings-save`, `widget-preview`, `delete-project-name`, `delete-project-submit`.

- [ ] **Step 1: Write failing tests**

`apps/web/lib/dashboard/bytes.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { utf8ByteLength } from './bytes';

describe('utf8ByteLength', () => {
  it('counts UTF-8 bytes, not characters', () => {
    expect(utf8ByteLength('')).toBe(0);
    expect(utf8ByteLength('abc')).toBe(3);
    expect(utf8ByteLength('ж')).toBe(2);
    expect(utf8ByteLength('€')).toBe(3);
    expect(utf8ByteLength('😀')).toBe(4);
  });
});
```

`apps/web/lib/dashboard/settings.test.ts`:
```ts
import { createFeedback, createProject, createUser, grantPro, withTx, type TestDb } from '@dymcode/db-tests/harness';
import { describe, expect, it } from 'vitest';
import { VALID_ENV } from '@/test/fixtures';
import { parseEnv } from '../env';
import { createMemoryStorage, type MemoryStorage } from '../storage';
import { getProject } from './projects';
import type { DashDeps } from './result';
import { deleteProject, updateProjectSettings } from './settings';

const valid = {
  name: 'Renamed',
  primaryColor: '#112233',
  triggerText: 'Report',
  position: 'bottom-left',
  locale: 'ru',
  allowedOrigins: ['shop.example.com/path', 'http://localhost:3000', 'shop.example.com'],
  hideBadge: true,
  customCss: '.dc-root { color: red; }',
};

function setup(db: TestDb) {
  const storage: MemoryStorage = createMemoryStorage();
  const deps: DashDeps = { db, storage, env: parseEnv(VALID_ENV), fetch };
  return { deps, storage };
}

describe('updateProjectSettings', () => {
  it('saves normalized settings for a Pro owner', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const owner = await createUser(db);
      await grantPro(db, owner);
      const project = await createProject(db, owner);
      expect(await updateProjectSettings(deps, owner, project.id, valid)).toEqual({ ok: true });
      expect(await getProject(deps, owner, project.id)).toMatchObject({
        name: 'Renamed',
        primary_color: '#112233',
        trigger_text: 'Report',
        position: 'bottom-left',
        locale: 'ru',
        allowed_origins: ['https://shop.example.com', 'http://localhost:3000'],
        hide_badge: true,
        custom_css: '.dc-root { color: red; }',
      });
    }));

  it('keeps Pro-only fields unchanged for Free owners', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const owner = await createUser(db);
      const project = await createProject(db, owner);
      expect(await updateProjectSettings(deps, owner, project.id, valid)).toEqual({ ok: true });
      expect(await getProject(deps, owner, project.id)).toMatchObject({ name: 'Renamed', hide_badge: false, custom_css: null });
    }));

  it('rejects invalid input', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const owner = await createUser(db);
      await grantPro(db, owner);
      const project = await createProject(db, owner);
      const cases: Array<[Record<string, unknown>, string]> = [
        [{ primaryColor: 'red' }, 'settings.colorInvalid'],
        [{ triggerText: '' }, 'settings.triggerInvalid'],
        [{ triggerText: 'x'.repeat(41) }, 'settings.triggerInvalid'],
        [{ allowedOrigins: ['ftp://x.com'] }, 'settings.originInvalid'],
        [{ allowedOrigins: Array.from({ length: 21 }, (_, i) => `s${i}.example.com`) }, 'settings.tooManyOrigins'],
        [{ customCss: 'ж'.repeat(5121) }, 'settings.cssTooLarge'],
      ];
      for (const [patch, error] of cases) {
        expect(await updateProjectSettings(deps, owner, project.id, { ...valid, ...patch })).toEqual({ ok: false, error });
      }
      expect(await updateProjectSettings(deps, owner, project.id, { ...valid, customCss: 'a'.repeat(10240) })).toEqual({
        ok: true,
      });
    }));

  it('does not touch other users’ projects', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const owner = await createUser(db);
      const project = await createProject(db, owner);
      const stranger = await createUser(db);
      expect(await updateProjectSettings(deps, stranger, project.id, valid)).toEqual({
        ok: false,
        error: 'errors.notFound',
      });
      expect((await getProject(deps, owner, project.id))?.name).toBe('Test project');
    }));
});

describe('deleteProject', () => {
  it('requires the exact name and removes screenshots, including hidden ones', () =>
    withTx(async (db) => {
      const { deps, storage } = setup(db);
      const owner = await createUser(db);
      const project = await createProject(db, owner, 'Acme');
      const visible = await createFeedback(db, project.id);
      const hidden = await createFeedback(db, project.id, { overQuota: true });
      for (const id of [visible, hidden]) {
        const path = `${project.id}/${id}.webp`;
        await storage.upload(path, new Uint8Array([1]), 'image/webp');
        await db.query('update public.feedback set screenshot_path = $1 where id = $2', [path, id]);
      }
      expect(await deleteProject(deps, owner, { projectId: project.id, confirmName: 'acme' })).toEqual({
        ok: false,
        error: 'settings.confirmMismatch',
      });
      const stranger = await createUser(db);
      expect(await deleteProject(deps, stranger, { projectId: project.id, confirmName: 'Acme' })).toEqual({
        ok: false,
        error: 'errors.notFound',
      });
      expect(await deleteProject(deps, owner, { projectId: project.id, confirmName: 'Acme' })).toEqual({ ok: true });
      expect(await getProject(deps, owner, project.id)).toBeNull();
      expect(storage.files.size).toBe(0);
    }));
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @dymcode/web test`
Expected: FAIL with unresolved `./bytes` and `./settings`.

- [ ] **Step 3: Implement the use cases**

`apps/web/lib/dashboard/bytes.ts`:
```ts
const encoder = new TextEncoder();

/** Byte length as stored by Postgres `octet_length` (UTF-8). Safe in the browser. */
export const utf8ByteLength = (value: string) => encoder.encode(value).length;
```

`apps/web/lib/dashboard/cleanup.ts`:
```ts
import type { Storage } from '../storage';

const CHUNK = 100;

/** Best-effort removal of screenshot objects; failures are logged, never thrown (the retention cron is the backstop). */
export async function removeScreenshots(storage: Storage, paths: string[]): Promise<void> {
  for (let i = 0; i < paths.length; i += CHUNK) {
    try {
      await storage.remove(paths.slice(i, i + CHUNK));
    } catch (error) {
      console.error('[dashboard] screenshot cleanup failed', error);
    }
  }
}
```

`apps/web/lib/dashboard/settings.ts`:
```ts
import {
  CUSTOM_CSS_MAX_BYTES,
  HEX_COLOR_PATTERN,
  TRIGGER_TEXT_MAX_LENGTH,
  WIDGET_LOCALES,
  WIDGET_POSITIONS,
  type WidgetLocale,
} from '@dymcode/shared';
import { z } from 'zod';
import { withUser } from '../db/with-user';
import { utf8ByteLength } from './bytes';
import { removeScreenshots } from './cleanup';
import { normalizeOrigin } from './origins';
import { getProject } from './projects';
import { isUuid, type ActionResult, type DashDeps } from './result';

export const MAX_ORIGINS = 20;

export interface SettingsInput {
  name: string;
  primaryColor: string;
  triggerText: string;
  position: 'bottom-right' | 'bottom-left';
  locale: WidgetLocale;
  allowedOrigins: string[];
  hideBadge: boolean;
  customCss: string;
}

// Each field carries the i18n key of its error; the first failing field wins.
const Settings = z.object({
  name: z.string().trim().min(1, 'projects.nameInvalid').max(80, 'projects.nameInvalid'),
  primaryColor: z.string().regex(HEX_COLOR_PATTERN, 'settings.colorInvalid'),
  triggerText: z
    .string()
    .trim()
    .min(1, 'settings.triggerInvalid')
    .max(TRIGGER_TEXT_MAX_LENGTH, 'settings.triggerInvalid'),
  position: z.enum(WIDGET_POSITIONS),
  locale: z.enum(WIDGET_LOCALES),
  allowedOrigins: z.array(z.string().max(2048)).max(200),
  hideBadge: z.boolean(),
  customCss: z.string().refine((css) => utf8ByteLength(css) <= CUSTOM_CSS_MAX_BYTES, 'settings.cssTooLarge'),
});

export async function isPro(deps: DashDeps, userId: string): Promise<boolean> {
  const [row] = await deps.db.query<{ pro: boolean }>('select public.is_pro($1) as pro', [userId]);
  return Boolean(row?.pro);
}

function normalizeOrigins(inputs: string[]): string[] | string {
  const origins: string[] = [];
  for (const raw of inputs) {
    if (!raw.trim()) continue;
    const origin = normalizeOrigin(raw);
    if (!origin) return 'settings.originInvalid';
    if (!origins.includes(origin)) origins.push(origin);
  }
  return origins.length > MAX_ORIGINS ? 'settings.tooManyOrigins' : origins;
}

export async function updateProjectSettings(
  deps: DashDeps,
  userId: string,
  projectId: string,
  input: unknown,
): Promise<ActionResult> {
  if (!isUuid(projectId)) return { ok: false, error: 'errors.notFound' };
  const parsed = Settings.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? '';
    return { ok: false, error: /^[a-z]+\.[A-Za-z]+$/.test(message) ? message : 'errors.generic' };
  }
  const origins = normalizeOrigins(parsed.data.allowedOrigins);
  if (typeof origins === 'string') return { ok: false, error: origins };
  const pro = await isPro(deps, userId);
  const s = parsed.data;
  const css = s.customCss.trim() ? s.customCss : null;
  const rows = await withUser(deps.db, userId, (tx) =>
    tx.query(
      `update public.projects set
         name = $2, primary_color = $3, trigger_text = $4, "position" = $5::widget_position,
         locale = $6::widget_locale, allowed_origins = $7::text[],
         hide_badge = case when $8 then $9 else hide_badge end,
         custom_css = case when $8 then $10 else custom_css end
       where id = $1 returning id`,
      [projectId, s.name, s.primaryColor, s.triggerText, s.position, s.locale, origins, pro, s.hideBadge, css],
    ),
  );
  return rows.length ? { ok: true } : { ok: false, error: 'errors.notFound' };
}

export async function deleteProject(
  deps: DashDeps,
  userId: string,
  input: { projectId: string; confirmName: string },
): Promise<ActionResult> {
  const project = await getProject(deps, userId, input.projectId);
  if (!project) return { ok: false, error: 'errors.notFound' };
  if (input.confirmName !== project.name) return { ok: false, error: 'settings.confirmMismatch' };
  // Service query: hidden (over-quota) rows are invisible through RLS but their files must go too.
  const files = await deps.db.query<{ screenshot_path: string }>(
    'select screenshot_path from public.feedback where project_id = $1 and screenshot_path is not null',
    [project.id],
  );
  await removeScreenshots(
    deps.storage,
    files.map((f) => f.screenshot_path),
  );
  await withUser(deps.db, userId, (tx) => tx.query('delete from public.projects where id = $1', [project.id]));
  return { ok: true };
}
```
If Postgres rejects `$8` as an untyped boolean in `case when $8`, write `case when $8::boolean`. Keep `"position"` quoted.

- [ ] **Step 4: Verify the use cases**

Run: `pnpm --filter @dymcode/web test`
Expected: PASS.

- [ ] **Step 5: Preview bundle**

`packages/widget/src/preview.ts`:
```ts
// Dashboard live preview entry: the same UI as widget.js, as an ES module the dashboard imports at runtime.
export { mountWidget } from './ui/mount';
export type { MountOptions, WidgetHandle } from './ui/mount';
```

`packages/widget/vite.preview.config.ts`:
```ts
import { defineConfig } from 'vite';

// ES module for the dashboard settings preview (/w/preview.js). Not size-limited: dashboard only.
export default defineConfig({
  define: { __WIDGET_VERSION__: JSON.stringify('preview') },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'es2019',
    lib: { entry: 'src/preview.ts', formats: ['es'], fileName: () => 'preview.js' },
  },
});
```

In `packages/widget/package.json`, change `build` to:
```json
"build": "vite build --config vite.screenshot.config.ts && vite build --config vite.widget.config.ts && vite build --config vite.preview.config.ts",
```

In `apps/web/scripts/copy-widget.mjs`, copy the preview too:
```js
for (const file of ['widget.js', 'screenshot.js', 'preview.js']) cpSync(new URL(file, src), new URL(file, dest));
console.log('Copied widget.js, screenshot.js and preview.js into apps/web/public/w/');
```
Check that `apps/web/public/w/` is git-ignored (it was in phase 3); if not, ignore it.

Run: `pnpm --filter @dymcode/widget build && pnpm --filter @dymcode/widget size && pnpm --filter @dymcode/widget check:bundle`
Expected: `dist/preview.js` exists; the size limits and bundle check still pass (they only cover `widget.js`/`screenshot.js`; if `check:bundle` scans every file in `dist/`, exclude `preview.js` in `scripts/check-bundle.mjs`).

- [ ] **Step 6: Messages and actions**

Add to both message files:
```json
"settings": {
  "title": "Settings" / "Настройки",
  "widget": "Widget" / "Виджет",
  "name": "Project name" / "Название проекта",
  "color": "Accent color" / "Цвет акцента",
  "trigger": "Button text" / "Текст кнопки",
  "position": "Position" / "Положение",
  "position_bottom-right": "Bottom right" / "Справа внизу",
  "position_bottom-left": "Bottom left" / "Слева внизу",
  "locale": "Widget language" / "Язык виджета",
  "locale_auto": "Visitor’s browser language" / "Язык браузера посетителя",
  "origins": "Allowed websites" / "Разрешённые сайты",
  "originsHint": "One per line. Leave empty to accept feedback from any site." / "По одному в строке. Оставьте пустым, чтобы принимать отзывы с любого сайта.",
  "hideBadge": "Hide “Powered by Dymcode”" / "Скрыть «Powered by Dymcode»",
  "customCss": "Custom CSS" / "Свой CSS",
  "cssBytes": "{used} / {max} bytes" / "{used} / {max} байт",
  "proOnly": "Pro" / "Pro",
  "preview": "Preview" / "Предпросмотр",
  "saved": "Settings saved" / "Настройки сохранены",
  "colorInvalid": "Enter a color like #6366f1." / "Введите цвет в формате #6366f1.",
  "triggerInvalid": "Button text must be 1–40 characters." / "Текст кнопки: от 1 до 40 символов.",
  "originInvalid": "One of the websites is not a valid address." / "Один из сайтов указан с ошибкой.",
  "tooManyOrigins": "You can list up to 20 websites." / "Можно указать не больше 20 сайтов.",
  "cssTooLarge": "Custom CSS must be at most 10 240 bytes." / "Свой CSS: не больше 10 240 байт.",
  "danger": "Danger zone" / "Опасная зона",
  "deleteProject": "Delete project" / "Удалить проект",
  "deleteHint": "This deletes all feedback, screenshots and integrations. Type the project name to confirm." / "Будут удалены все отзывы, скриншоты и интеграции. Введите название проекта для подтверждения.",
  "confirmMismatch": "The name does not match." / "Название не совпадает."
}
```
Language option labels for `en`, `ru`, `uk`, `es` are shown as native names ("English", "Русский", "Українська", "Español") and are not translated.

Append to `apps/web/app/app/actions.ts` (imports at the top):
```ts
import { redirect } from 'next/navigation';
import { deleteProject, updateProjectSettings, type SettingsInput } from '@/lib/dashboard/settings';

export async function updateProjectSettingsAction(projectId: string, input: SettingsInput): Promise<ActionResult> {
  const user = await requireUser();
  const result = await updateProjectSettings(await getDeps(), user.id, projectId, input);
  revalidatePath('/app', 'layout');
  return result;
}

export async function deleteProjectAction(projectId: string, confirmName: string): Promise<ActionResult> {
  const user = await requireUser();
  const result = await deleteProject(await getDeps(), user.id, { projectId, confirmName });
  if (!result.ok) return result;
  revalidatePath('/app', 'layout');
  redirect('/app');
}
```

- [ ] **Step 7: UI**

`apps/web/components/app/settings/widget-preview.tsx`:
```tsx
'use client';

import type { WidgetConfig } from '@dymcode/shared';
import { useEffect, useRef } from 'react';

interface PreviewModule {
  mountWidget(container: HTMLElement, config: WidgetConfig, options: { preview: boolean }): { destroy(): void };
}

let modulePromise: Promise<PreviewModule> | null = null;
// Loaded at runtime from /w/preview.js: the widget imports CSS with Vite's `?inline`, which Next cannot bundle.
const loadPreview = () =>
  (modulePromise ??= import(/* webpackIgnore: true */ /* turbopackIgnore: true */ '/w/preview.js' as string) as Promise<PreviewModule>);

export function WidgetPreview({ config }: { config: WidgetConfig }) {
  const ref = useRef<HTMLDivElement>(null);
  const key = JSON.stringify(config);
  useEffect(() => {
    let handle: { destroy(): void } | null = null;
    let cancelled = false;
    loadPreview()
      .then((mod) => {
        if (!cancelled && ref.current) handle = mod.mountWidget(ref.current, config, { preview: true });
      })
      .catch((error: unknown) => console.error('[preview]', error));
    return () => {
      cancelled = true;
      handle?.destroy();
    };
    // `key` captures every config field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return <div ref={ref} data-testid="widget-preview" className="relative min-h-[420px] rounded-lg border bg-muted/40 p-4" />;
}
```
If the TypeScript build rejects the dynamic import of a string URL, keep the `as string` cast and add `// @ts-expect-error runtime URL import` only if needed. Confirm in `node_modules/next/dist/docs/` how Turbopack treats `import()` of an absolute URL path; if it tries to resolve it, load the module with `new Function('u', 'return import(u)')('/w/preview.js')` instead and note why in a comment.

`apps/web/components/app/settings/settings-form.tsx`:
```tsx
'use client';

import { CUSTOM_CSS_MAX_BYTES, buildBadgeUrl, type WidgetConfig } from '@dymcode/shared';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { updateProjectSettingsAction } from '@/app/app/actions';
import { utf8ByteLength } from '@/lib/dashboard/bytes';
import type { ProjectDetail } from '@/lib/dashboard/projects';
import type { SettingsInput } from '@/lib/dashboard/settings';
import { WidgetPreview } from './widget-preview';

const LOCALE_NAMES = { en: 'English', ru: 'Русский', uk: 'Українська', es: 'Español' } as const;

export function SettingsForm({ project, pro }: { project: ProjectDetail; pro: boolean }) {
  const t = useTranslations();
  const [pending, start] = useTransition();
  const [form, setForm] = useState<SettingsInput>({
    name: project.name,
    primaryColor: project.primary_color,
    triggerText: project.trigger_text,
    position: project.position,
    locale: project.locale,
    allowedOrigins: project.allowed_origins,
    hideBadge: project.hide_badge,
    customCss: project.custom_css ?? '',
  });
  const [originsText, setOriginsText] = useState(project.allowed_origins.join('\n'));
  const set = <K extends keyof SettingsInput>(key: K, value: SettingsInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const cssBytes = utf8ByteLength(form.customCss);
  const preview: WidgetConfig = {
    primaryColor: /^#[0-9a-fA-F]{6}$/.test(form.primaryColor) ? form.primaryColor : '#6366f1',
    triggerText: form.triggerText.trim() || 'Feedback',
    position: form.position,
    showBadge: !(pro && form.hideBadge),
    customCss: pro && form.customCss.trim() ? form.customCss : null,
    badgeUrl: buildBadgeUrl(project.public_key),
    locale: form.locale,
  };

  const save = () =>
    start(async () => {
      const allowedOrigins = originsText.split('\n').map((s) => s.trim()).filter(Boolean);
      const result = await updateProjectSettingsAction(project.id, { ...form, allowedOrigins });
      if (result.ok) toast.success(t('settings.saved'));
      else toast.error(t(result.error));
    });

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
      <form className="flex flex-col gap-5" action={save}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">{t('settings.name')}</Label>
          <Input id="name" value={form.name} maxLength={80} onChange={(e) => set('name', e.target.value)} data-testid="settings-name" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="color">{t('settings.color')}</Label>
          <div className="flex items-center gap-2">
            <input
              id="color"
              type="color"
              value={preview.primaryColor}
              onChange={(e) => set('primaryColor', e.target.value)}
              className="h-9 w-12 cursor-pointer rounded border"
              data-testid="settings-color"
            />
            <Input value={form.primaryColor} onChange={(e) => set('primaryColor', e.target.value)} className="w-32" data-testid="settings-color-hex" />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="trigger">{t('settings.trigger')}</Label>
          <Input id="trigger" value={form.triggerText} maxLength={40} onChange={(e) => set('triggerText', e.target.value)} data-testid="settings-trigger" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="position">{t('settings.position')}</Label>
            <select
              id="position"
              value={form.position}
              onChange={(e) => set('position', e.target.value as SettingsInput['position'])}
              className="h-9 rounded-md border bg-background px-2 text-sm"
              data-testid="settings-position"
            >
              <option value="bottom-right">{t('settings.position_bottom-right')}</option>
              <option value="bottom-left">{t('settings.position_bottom-left')}</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="locale">{t('settings.locale')}</Label>
            <select
              id="locale"
              value={form.locale}
              onChange={(e) => set('locale', e.target.value as SettingsInput['locale'])}
              className="h-9 rounded-md border bg-background px-2 text-sm"
              data-testid="settings-locale"
            >
              <option value="auto">{t('settings.locale_auto')}</option>
              {Object.entries(LOCALE_NAMES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="origins">{t('settings.origins')}</Label>
          <Textarea id="origins" rows={4} value={originsText} onChange={(e) => setOriginsText(e.target.value)} placeholder="https://example.com" data-testid="settings-origins" />
          <p className="text-xs text-muted-foreground">{t('settings.originsHint')}</p>
        </div>
        <fieldset disabled={!pro} className="flex flex-col gap-4 rounded-lg border p-4 disabled:opacity-60">
          <legend className="px-1 text-xs font-medium">🔒 {t('settings.proOnly')}</legend>
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={form.hideBadge} onCheckedChange={(v) => set('hideBadge', v)} disabled={!pro} data-testid="settings-hide-badge" />
            {t('settings.hideBadge')}
          </label>
          <div className="flex flex-col gap-2">
            <Label htmlFor="css">{t('settings.customCss')}</Label>
            <Textarea id="css" rows={6} className="font-mono text-xs" value={form.customCss} onChange={(e) => set('customCss', e.target.value)} data-testid="settings-css" />
            <p className={`text-xs ${cssBytes > CUSTOM_CSS_MAX_BYTES ? 'text-destructive' : 'text-muted-foreground'}`} data-testid="settings-css-bytes">
              {t('settings.cssBytes', { used: cssBytes, max: CUSTOM_CSS_MAX_BYTES })}
            </p>
          </div>
        </fieldset>
        <Button type="submit" disabled={pending || cssBytes > CUSTOM_CSS_MAX_BYTES} data-testid="settings-save" className="self-start">
          {t('common.save')}
        </Button>
      </form>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">{t('settings.preview')}</h2>
        <WidgetPreview config={preview} />
      </section>
    </div>
  );
}
```

`apps/web/components/app/settings/delete-project.tsx`:
```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { deleteProjectAction } from '@/app/app/actions';

export function DeleteProject({ projectId, name }: { projectId: string; name: string }) {
  const t = useTranslations();
  const [value, setValue] = useState('');
  const [pending, start] = useTransition();
  return (
    <section className="rounded-lg border border-destructive/50 p-4">
      <h2 className="font-medium text-destructive">{t('settings.danger')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('settings.deleteHint')}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={name} className="max-w-xs" data-testid="delete-project-name" />
        <Button
          variant="destructive"
          disabled={pending || value !== name}
          data-testid="delete-project-submit"
          onClick={() =>
            start(async () => {
              const result = await deleteProjectAction(projectId, value);
              if (result && !result.ok) toast.error(t(result.error));
            })
          }
        >
          {t('settings.deleteProject')}
        </Button>
      </div>
    </section>
  );
}
```

`apps/web/app/app/p/[projectId]/settings/page.tsx`:
```tsx
import { getTranslations } from 'next-intl/server';
import { DeleteProject } from '@/components/app/settings/delete-project';
import { SettingsForm } from '@/components/app/settings/settings-form';
import { requireUser } from '@/lib/auth/session';
import { getProject } from '@/lib/dashboard/projects';
import { isPro } from '@/lib/dashboard/settings';
import { getDeps } from '@/lib/deps';

export default async function SettingsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser();
  const { projectId } = await params;
  const deps = await getDeps();
  const project = (await getProject(deps, user.id, projectId))!;
  const t = await getTranslations('settings');
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 p-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <SettingsForm key={JSON.stringify(project)} project={project} pro={await isPro(deps, user.id)} />
      <DeleteProject projectId={project.id} name={project.name} />
    </div>
  );
}
```

- [ ] **Step 8: Verify and commit**

Run: `pnpm --filter @dymcode/web test && pnpm typecheck && pnpm --filter @dymcode/widget build && pnpm --filter @dymcode/web build`
Expected: PASS. Then start `pnpm --filter @dymcode/web dev` in test mode is NOT required here; the E2E in Task 11 covers the preview.
```bash
pnpm format
git add apps/web packages/widget
git commit -m "feat(web): add project settings with live widget preview"
```

---

### Task 8: Integrations use cases

**Files:**
- Create: `apps/web/lib/dashboard/integrations.ts`
- Modify: `apps/web/lib/notify/dispatch.ts` (export `sendTestNotice`, `TEST_NOTICE_TEXT`)
- Test: `apps/web/lib/dashboard/integrations.test.ts`, `apps/web/lib/notify/dispatch.test.ts` (one new case)

**Interfaces:**
- Consumes: `ownsProject` (Task 4), `isPro` (Task 7), `isBotToken`, `isDiscordWebhookUrl` (Task 1, `lib/notify/validate.ts`), `encryptSecret`/`decryptSecret`, `createTelegramNotifier`, `createDiscordNotifier`, `DispatchDeps`.
- Produces:
  ```ts
  // lib/notify/dispatch.ts
  const TEST_NOTICE_TEXT: (projectName: string) => string;
  sendTestNotice(deps: DispatchDeps, integrationId: string): Promise<{ ok: true } | { ok: false; error: string }>; // records the result on the row
  // lib/dashboard/integrations.ts
  type IntegrationKind = 'telegram_shared' | 'telegram_custom' | 'discord';
  interface IntegrationStatus { kind: IntegrationKind; connected: boolean; enabled: boolean;
    lastError: string | null; lastDeliveredAt: string | null; botUsername?: string } // no secrets, no chat ids
  interface TelegramLink { code: string; privateUrl: string; groupUrl: string; expiresAt: string }
  createTelegramLink(deps, userId, projectId: string): Promise<ActionResult<{ link: TelegramLink }>>;
  integrationStatus(deps, userId, projectId: string): Promise<IntegrationStatus[] | null>; // null = not owner; always 3 entries in kind order above
  saveCustomBot(deps, userId, input: { projectId: string; token: string; chatId: string }): Promise<ActionResult<{ botUsername: string }>>;
  saveDiscord(deps, userId, input: { projectId: string; webhookUrl: string }): Promise<ActionResult>;
  sendTest(deps, userId, input: { projectId: string; kind: IntegrationKind }): Promise<ActionResult>;
  disconnectIntegration(deps, userId, input: { projectId: string; kind: IntegrationKind }): Promise<ActionResult>;
  const DASHBOARD_RATE_LIMIT = 10; // per 60 s per user per action
  ```
- Error keys: `integrations.invalidToken`, `integrations.invalidChatId`, `integrations.invalidWebhook`, `integrations.testFailed`, `integrations.proRequired`, `integrations.notConnected`, `errors.rateLimited`, `errors.notFound`.

- [ ] **Step 1: Write failing tests**

`apps/web/lib/dashboard/integrations.test.ts`:
```ts
import { createProject, createUser, grantPro, withTx, type TestDb } from '@dymcode/db-tests/harness';
import { describe, expect, it } from 'vitest';
import { VALID_ENV } from '@/test/fixtures';
import { decryptSecret } from '../crypto';
import { parseEnv } from '../env';
import { createMemoryStorage } from '../storage';
import {
  createTelegramLink,
  disconnectIntegration,
  integrationStatus,
  saveCustomBot,
  saveDiscord,
  sendTest,
} from './integrations';
import type { DashDeps } from './result';

const env = parseEnv(VALID_ENV);
const WEBHOOK = 'https://discord.com/api/webhooks/123/abc';
const TOKEN = '987654:custom_TOKEN';

interface Call {
  url: string;
  body: string;
}

/** Fake Telegram/Discord: `fail` makes every send fail with 400. */
function fakeFetch(opts: { fail?: boolean } = {}) {
  const calls: Call[] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: typeof init?.body === 'string' ? init.body : '' });
    if (url.endsWith('/getMe')) {
      return Response.json(opts.fail ? { ok: false, description: 'Unauthorized' } : { ok: true, result: { username: 'acme_bot' } }, {
        status: opts.fail ? 401 : 200,
      });
    }
    if (opts.fail) return Response.json({ ok: false, description: 'Bad Request: chat not found' }, { status: 400 });
    if (url.includes('discord.com')) return new Response(null, { status: 204 });
    return Response.json({ ok: true, result: {} });
  }) as typeof fetch;
  return { calls, fetchFn };
}

function setup(db: TestDb, opts: { fail?: boolean } = {}) {
  const fake = fakeFetch(opts);
  const deps: DashDeps = { db, storage: createMemoryStorage(), env, fetch: fake.fetchFn };
  return { deps, calls: fake.calls };
}

const secretOf = async (db: TestDb, projectId: string, kind: string) => {
  const [row] = await db.query<{ secret_encrypted: string | null; target: string | null }>(
    'select secret_encrypted, target from public.integrations where project_id = $1 and kind = $2::integration_kind',
    [projectId, kind],
  );
  return row;
};

describe('createTelegramLink', () => {
  it('replaces older codes and returns both deep links', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const owner = await createUser(db);
      const project = await createProject(db, owner);
      const first = await createTelegramLink(deps, owner, project.id);
      const second = await createTelegramLink(deps, owner, project.id);
      if (!first.ok || !second.ok) throw new Error('expected ok');
      expect(second.link.privateUrl).toBe(`https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=${second.link.code}`);
      expect(second.link.groupUrl).toBe(`https://t.me/${env.TELEGRAM_BOT_USERNAME}?startgroup=${second.link.code}`);
      const codes = await db.query<{ code: string }>('select code from public.telegram_link_codes where project_id = $1', [
        project.id,
      ]);
      expect(codes.map((c) => c.code)).toEqual([second.link.code]);
    }));

  it('denies strangers and rate-limits at 10 per minute', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const owner = await createUser(db);
      const project = await createProject(db, owner);
      const stranger = await createUser(db);
      expect(await createTelegramLink(deps, stranger, project.id)).toEqual({ ok: false, error: 'errors.notFound' });
      for (let i = 0; i < 10; i++) expect((await createTelegramLink(deps, owner, project.id)).ok).toBe(true);
      expect(await createTelegramLink(deps, owner, project.id)).toEqual({ ok: false, error: 'errors.rateLimited' });
    }));
});

describe('saveDiscord', () => {
  it('stores the webhook encrypted only after a successful test send', () =>
    withTx(async (db) => {
      const owner = await createUser(db);
      const project = await createProject(db, owner);
      const failing = setup(db, { fail: true });
      expect(await saveDiscord(failing.deps, owner, { projectId: project.id, webhookUrl: WEBHOOK })).toEqual({
        ok: false,
        error: 'integrations.testFailed',
      });
      expect(await secretOf(db, project.id, 'discord')).toBeUndefined();

      const { deps, calls } = setup(db);
      expect(await saveDiscord(deps, owner, { projectId: project.id, webhookUrl: WEBHOOK })).toEqual({ ok: true });
      expect(calls.at(-1)!.url.startsWith(WEBHOOK)).toBe(true);
      const row = await secretOf(db, project.id, 'discord');
      expect(decryptSecret(row!.secret_encrypted!, env.SECRETS_ENCRYPTION_KEY)).toBe(WEBHOOK);
    }));

  it('rejects non-Discord URLs without calling out', () =>
    withTx(async (db) => {
      const { deps, calls } = setup(db);
      const owner = await createUser(db);
      const project = await createProject(db, owner);
      for (const webhookUrl of ['http://discord.com/api/webhooks/1/a', 'https://evil.com/api/webhooks/1/a', 'nope']) {
        expect(await saveDiscord(deps, owner, { projectId: project.id, webhookUrl })).toEqual({
          ok: false,
          error: 'integrations.invalidWebhook',
        });
      }
      expect(calls).toEqual([]);
    }));
});

describe('saveCustomBot', () => {
  it('requires Pro', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const owner = await createUser(db);
      const project = await createProject(db, owner);
      expect(await saveCustomBot(deps, owner, { projectId: project.id, token: TOKEN, chatId: '42' })).toEqual({
        ok: false,
        error: 'integrations.proRequired',
      });
    }));

  it('validates the token and chat id, calls getMe, tests, then stores encrypted', () =>
    withTx(async (db) => {
      const owner = await createUser(db);
      await grantPro(db, owner);
      const project = await createProject(db, owner);
      const { deps, calls } = setup(db);
      expect(await saveCustomBot(deps, owner, { projectId: project.id, token: 'bad', chatId: '42' })).toEqual({
        ok: false,
        error: 'integrations.invalidToken',
      });
      expect(await saveCustomBot(deps, owner, { projectId: project.id, token: TOKEN, chatId: 'x y' })).toEqual({
        ok: false,
        error: 'integrations.invalidChatId',
      });
      const failing = setup(db, { fail: true });
      expect(await saveCustomBot(failing.deps, owner, { projectId: project.id, token: TOKEN, chatId: '42' })).toEqual({
        ok: false,
        error: 'integrations.invalidToken',
      });
      expect(await saveCustomBot(deps, owner, { projectId: project.id, token: TOKEN, chatId: '-100123' })).toEqual({
        ok: true,
        botUsername: 'acme_bot',
      });
      expect(calls.map((c) => c.url.split('/').pop())).toEqual(['getMe', 'sendMessage']);
      const row = await secretOf(db, project.id, 'telegram_custom');
      expect(row!.target).toBe('-100123');
      expect(decryptSecret(row!.secret_encrypted!, env.SECRETS_ENCRYPTION_KEY)).toBe(TOKEN);
    }));
});

describe('integrationStatus, sendTest, disconnect', () => {
  it('returns secret-free DTOs for all kinds', () =>
    withTx(async (db) => {
      const owner = await createUser(db);
      await grantPro(db, owner);
      const project = await createProject(db, owner);
      const { deps } = setup(db);
      await saveDiscord(deps, owner, { projectId: project.id, webhookUrl: WEBHOOK });
      await saveCustomBot(deps, owner, { projectId: project.id, token: TOKEN, chatId: '42' });
      const status = await integrationStatus(deps, owner, project.id);
      expect(status!.map((s) => [s.kind, s.connected])).toEqual([
        ['telegram_shared', false],
        ['telegram_custom', true],
        ['discord', true],
      ]);
      expect(status!.find((s) => s.kind === 'telegram_custom')!.botUsername).toBe('acme_bot');
      const serialized = JSON.stringify(status);
      expect(serialized).not.toContain('custom_TOKEN');
      expect(serialized).not.toContain('webhooks');
      expect(serialized).not.toContain('"42"');
      const stranger = await createUser(db);
      expect(await integrationStatus(deps, stranger, project.id)).toBeNull();
    }));

  it('sends a test to one integration and disconnects it', () =>
    withTx(async (db) => {
      const owner = await createUser(db);
      const project = await createProject(db, owner);
      const { deps, calls } = setup(db);
      expect(await sendTest(deps, owner, { projectId: project.id, kind: 'discord' })).toEqual({
        ok: false,
        error: 'integrations.notConnected',
      });
      await saveDiscord(deps, owner, { projectId: project.id, webhookUrl: WEBHOOK });
      const before = calls.length;
      expect(await sendTest(deps, owner, { projectId: project.id, kind: 'discord' })).toEqual({ ok: true });
      expect(calls.length).toBe(before + 1);
      expect(await disconnectIntegration(deps, owner, { projectId: project.id, kind: 'discord' })).toEqual({ ok: true });
      expect(await secretOf(db, project.id, 'discord')).toBeUndefined();
      const stranger = await createUser(db);
      expect(await disconnectIntegration(deps, stranger, { projectId: project.id, kind: 'discord' })).toEqual({
        ok: false,
        error: 'errors.notFound',
      });
    }));
});
```

Add to `apps/web/lib/notify/dispatch.test.ts` (it reuses the file's `setup`, `projectWith`, `addIntegration`, `integration`, `KEY`, `DISCORD` helpers; import `sendTestNotice` and `TEST_NOTICE_TEXT` from `./dispatch`):
```ts
describe('sendTestNotice', () => {
  it('delivers a text notice to exactly one integration and records it', () =>
    withTx(async (db) => {
      const { deps, calls } = setup(db, (url) =>
        url.includes('discord.com') ? new Response(null, { status: 204 }) : new Response(JSON.stringify({ ok: true })),
      );
      const project = await projectWith(db);
      await addIntegration(db, project.id, 'telegram_shared', { target: '424242' });
      const discordId = await addIntegration(db, project.id, 'discord', { secret: encryptSecret(DISCORD, KEY) });

      expect(await sendTestNotice(deps, discordId)).toEqual({ ok: true });
      expect(calls).toHaveLength(1);
      expect(calls[0]!.url.startsWith(DISCORD)).toBe(true);
      expect(JSON.parse(String(calls[0]!.init!.body)).content).toContain(TEST_NOTICE_TEXT('Acme'));
      expect(await integration(db, discordId)).toEqual({ enabled: true, last_error: null, delivered: true });
    }));

  it('records a configuration error without calling out', () =>
    withTx(async (db) => {
      const { deps, calls } = setup(db);
      const project = await projectWith(db);
      const id = await addIntegration(db, project.id, 'telegram_shared', { target: null });
      expect(await sendTestNotice(deps, id)).toEqual({ ok: false, error: 'missing chat id' });
      expect(calls).toEqual([]);
      expect((await integration(db, id)).last_error).toBe('missing chat id');
    }));
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @dymcode/web test`
Expected: FAIL with unresolved `./integrations` and missing `sendTestNotice`.

- [ ] **Step 3: Implement `sendTestNotice` in dispatch**

Add to `apps/web/lib/notify/dispatch.ts`:
```ts
export const TEST_NOTICE_TEXT = (projectName: string) =>
  `✅ Dymcode test message: notifications for "${projectName}" work.`;

/** Dashboard "Send test": one integration, same notifiers and bookkeeping as real deliveries. */
export async function sendTestNotice(
  deps: DispatchDeps,
  integrationId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [row] = await deps.db.query<IntegrationRow & { project_name: string; pro: boolean }>(
    `select i.id, i.kind::text as kind, i.target, i.secret_encrypted, p.name as project_name,
            public.is_pro(p.owner_id) as pro
     from public.integrations i join public.projects p on p.id = i.project_id
     where i.id = $1`,
    [integrationId],
  );
  if (!row) return { ok: false, error: 'not found' };
  const notifier = buildNotifier(deps, row, row.pro);
  if (notifier === null) return { ok: false, error: 'requires Pro' };
  if (typeof notifier === 'string') {
    await record(deps.db, row.id, { ok: false, disable: false, error: notifier });
    return { ok: false, error: notifier };
  }
  const result = await deliver(deps, notifier, { kind: 'text', text: TEST_NOTICE_TEXT(row.project_name) });
  await record(deps.db, row.id, result);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}
```
Note: a test send re-enables nothing: `sendTest` in the dashboard first sets `enabled = true` (below) so an integration disabled by a delivery error can be revived by a successful test.

- [ ] **Step 4: Implement the use cases**

`apps/web/lib/dashboard/integrations.ts`:
```ts
import { decryptSecret, encryptSecret } from '../crypto';
import { createDiscordNotifier } from '../notify/discord';
import { sendTestNotice, TEST_NOTICE_TEXT } from '../notify/dispatch';
import { createTelegramNotifier } from '../notify/telegram';
import { isBotToken, isDiscordWebhookUrl } from '../notify/validate';
import { getProject, ownsProject } from './projects';
import type { ActionResult, DashDeps } from './result';
import { isPro } from './settings';

export const DASHBOARD_RATE_LIMIT = 10;
export const INTEGRATION_KINDS = ['telegram_shared', 'telegram_custom', 'discord'] as const;
export type IntegrationKind = (typeof INTEGRATION_KINDS)[number];

export interface IntegrationStatus {
  kind: IntegrationKind;
  connected: boolean;
  enabled: boolean;
  lastError: string | null;
  lastDeliveredAt: string | null;
  botUsername?: string;
}

export interface TelegramLink {
  code: string;
  privateUrl: string;
  groupUrl: string;
  expiresAt: string;
}

const CHAT_ID = /^(-?\d{1,20}|@\w{5,32})$/;
const TELEGRAM_TIMEOUT_MS = 5000;

async function rateLimited(deps: DashDeps, action: string, userId: string): Promise<boolean> {
  const [row] = await deps.db.query<{ limited: boolean }>('select public.hit_rate_limit($1, $2, 60) as limited', [
    `dashboard:${action}:${userId}`,
    DASHBOARD_RATE_LIMIT,
  ]);
  return Boolean(row?.limited);
}

async function getMe(deps: DashDeps, token: string): Promise<string | null> {
  try {
    const response = await deps.fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
    });
    const data = (await response.json().catch(() => ({}))) as { ok?: boolean; result?: { username?: string } };
    return response.ok && data.ok && data.result?.username ? data.result.username : null;
  } catch {
    return null;
  }
}

async function upsert(deps: DashDeps, projectId: string, kind: IntegrationKind, target: string | null, secret: string) {
  await deps.db.query(
    `insert into public.integrations (project_id, kind, target, secret_encrypted, enabled, last_error)
     values ($1, $2::integration_kind, $3, $4, true, null)
     on conflict (project_id, kind) do update
       set target = excluded.target, secret_encrypted = excluded.secret_encrypted, enabled = true, last_error = null`,
    [projectId, kind, target, encryptSecret(secret, deps.env.SECRETS_ENCRYPTION_KEY)],
  );
}

export async function createTelegramLink(
  deps: DashDeps,
  userId: string,
  projectId: string,
): Promise<ActionResult<{ link: TelegramLink }>> {
  if (!(await ownsProject(deps, userId, projectId))) return { ok: false, error: 'errors.notFound' };
  if (await rateLimited(deps, 'telegram-link', userId)) return { ok: false, error: 'errors.rateLimited' };
  await deps.db.query('delete from public.telegram_link_codes where project_id = $1', [projectId]);
  const [row] = await deps.db.query<{ code: string; expires_at: Date | string }>(
    'insert into public.telegram_link_codes (project_id) values ($1) returning code, expires_at',
    [projectId],
  );
  const bot = deps.env.TELEGRAM_BOT_USERNAME;
  return {
    ok: true,
    link: {
      code: row!.code,
      privateUrl: `https://t.me/${bot}?start=${row!.code}`,
      groupUrl: `https://t.me/${bot}?startgroup=${row!.code}`,
      expiresAt: new Date(row!.expires_at).toISOString(),
    },
  };
}

export async function integrationStatus(
  deps: DashDeps,
  userId: string,
  projectId: string,
): Promise<IntegrationStatus[] | null> {
  if (!(await ownsProject(deps, userId, projectId))) return null;
  const rows = await deps.db.query<{
    kind: IntegrationKind;
    enabled: boolean;
    target: string | null;
    secret_encrypted: string | null;
    last_error: string | null;
    last_delivered_at: Date | string | null;
  }>(
    `select kind::text as kind, enabled, target, secret_encrypted, last_error, last_delivered_at
     from public.integrations where project_id = $1`,
    [projectId],
  );
  return Promise.all(
    INTEGRATION_KINDS.map(async (kind): Promise<IntegrationStatus> => {
      const row = rows.find((r) => r.kind === kind);
      if (!row) return { kind, connected: false, enabled: false, lastError: null, lastDeliveredAt: null };
      const status: IntegrationStatus = {
        kind,
        connected: row.enabled && (kind === 'discord' || row.target !== null),
        enabled: row.enabled,
        lastError: row.last_error,
        lastDeliveredAt: row.last_delivered_at ? new Date(row.last_delivered_at).toISOString() : null,
      };
      if (kind === 'telegram_custom' && row.secret_encrypted) {
        try {
          const username = await getMe(deps, decryptSecret(row.secret_encrypted, deps.env.SECRETS_ENCRYPTION_KEY));
          if (username) status.botUsername = username;
        } catch {
          // Unreadable secret: shown as not connected via lastError on the next delivery.
        }
      }
      return status;
    }),
  );
}

export async function saveCustomBot(
  deps: DashDeps,
  userId: string,
  input: { projectId: string; token: string; chatId: string },
): Promise<ActionResult<{ botUsername: string }>> {
  const project = await getProject(deps, userId, input.projectId);
  if (!project) return { ok: false, error: 'errors.notFound' };
  if (!(await isPro(deps, userId))) return { ok: false, error: 'integrations.proRequired' };
  const token = input.token.trim();
  const chatId = input.chatId.trim();
  if (!isBotToken(token)) return { ok: false, error: 'integrations.invalidToken' };
  if (!CHAT_ID.test(chatId)) return { ok: false, error: 'integrations.invalidChatId' };
  if (await rateLimited(deps, 'custom-bot', userId)) return { ok: false, error: 'errors.rateLimited' };
  const botUsername = await getMe(deps, token);
  if (!botUsername) return { ok: false, error: 'integrations.invalidToken' };
  const result = await createTelegramNotifier({ token, chatId, fetch: deps.fetch }).send({
    kind: 'text',
    text: TEST_NOTICE_TEXT(project.name),
  });
  if (!result.ok) return { ok: false, error: 'integrations.testFailed' };
  await upsert(deps, project.id, 'telegram_custom', chatId, token);
  return { ok: true, botUsername };
}

export async function saveDiscord(
  deps: DashDeps,
  userId: string,
  input: { projectId: string; webhookUrl: string },
): Promise<ActionResult> {
  const project = await getProject(deps, userId, input.projectId);
  if (!project) return { ok: false, error: 'errors.notFound' };
  const webhookUrl = input.webhookUrl.trim();
  if (!isDiscordWebhookUrl(webhookUrl)) return { ok: false, error: 'integrations.invalidWebhook' };
  if (await rateLimited(deps, 'discord', userId)) return { ok: false, error: 'errors.rateLimited' };
  const result = await createDiscordNotifier({ webhookUrl, fetch: deps.fetch }).send({
    kind: 'text',
    text: TEST_NOTICE_TEXT(project.name),
  });
  if (!result.ok) return { ok: false, error: 'integrations.testFailed' };
  await upsert(deps, project.id, 'discord', null, webhookUrl);
  return { ok: true };
}

export async function sendTest(
  deps: DashDeps,
  userId: string,
  input: { projectId: string; kind: IntegrationKind },
): Promise<ActionResult> {
  if (!INTEGRATION_KINDS.includes(input.kind)) return { ok: false, error: 'errors.notFound' };
  if (!(await ownsProject(deps, userId, input.projectId))) return { ok: false, error: 'errors.notFound' };
  if (await rateLimited(deps, 'send-test', userId)) return { ok: false, error: 'errors.rateLimited' };
  const [row] = await deps.db.query<{ id: string }>(
    `update public.integrations set enabled = true
     where project_id = $1 and kind = $2::integration_kind returning id`,
    [input.projectId, input.kind],
  );
  if (!row) return { ok: false, error: 'integrations.notConnected' };
  const result = await sendTestNotice(deps, row.id);
  return result.ok ? { ok: true } : { ok: false, error: 'integrations.testFailed' };
}

export async function disconnectIntegration(
  deps: DashDeps,
  userId: string,
  input: { projectId: string; kind: IntegrationKind },
): Promise<ActionResult> {
  if (!INTEGRATION_KINDS.includes(input.kind)) return { ok: false, error: 'errors.notFound' };
  if (!(await ownsProject(deps, userId, input.projectId))) return { ok: false, error: 'errors.notFound' };
  await deps.db.query('delete from public.integrations where project_id = $1 and kind = $2::integration_kind', [
    input.projectId,
    input.kind,
  ]);
  return { ok: true };
}
```
Note: `sendTestNotice` may record a failure that disables the row again (401/403/404) — that is the desired behaviour. The `createDiscordNotifier` options must match its real signature in `lib/notify/discord.ts` (check it; phase 3 uses `{ webhookUrl, fetch }`).

- [ ] **Step 5: Verify and commit**

Run: `pnpm --filter @dymcode/web test && pnpm typecheck`
Expected: PASS.
```bash
pnpm format
git add apps/web
git commit -m "feat(web): add integrations use cases with test sends and rate limits"
```

---

### Task 9: Integrations UI, billing and account

**Files:**
- Create: `apps/web/lib/auth/admin.ts`, `apps/web/lib/dashboard/account.ts`, `apps/web/app/app/p/[projectId]/integrations/page.tsx`, `apps/web/components/app/integrations/integrations-panel.tsx`, `apps/web/app/app/billing/page.tsx`, `apps/web/components/app/billing/upgrade-buttons.tsx`, `apps/web/app/app/account/page.tsx`, `apps/web/components/app/account/delete-account.tsx`
- Modify: `apps/web/app/app/actions.ts`, `apps/web/messages/en.json`, `apps/web/messages/ru.json`
- Test: `apps/web/lib/dashboard/account.test.ts`

**Interfaces:**
- Consumes: Task 8 use cases, `isPro` (Task 7), `usage` (Task 5), `removeScreenshots` (Task 7), `signOut` (Task 2), `LocaleSwitcher` (Task 3, a `<select data-testid="locale-switcher">`).
- Produces:
  ```ts
  // lib/auth/admin.ts
  interface AuthAdmin { deleteUser(userId: string): Promise<void> } // throws on failure
  function getAuthAdmin(deps: Pick<AppDeps, 'db' | 'env'>): AuthAdmin; // test mode: deletes the auth.users row; prod: supabase-js admin API
  // lib/dashboard/account.ts
  deleteAccount(deps: DashDeps & { authAdmin: AuthAdmin }, user: { id: string; email: string }, confirmEmail: string): Promise<ActionResult>;
  // app/app/actions.ts
  createTelegramLinkAction(projectId: string): Promise<ActionResult<{ link: TelegramLink }>>;
  integrationStatusAction(projectId: string): Promise<IntegrationStatus[] | null>;
  saveCustomBotAction(projectId: string, token: string, chatId: string): Promise<ActionResult<{ botUsername: string }>>;
  saveDiscordAction(projectId: string, webhookUrl: string): Promise<ActionResult>;
  sendTestAction(projectId: string, kind: IntegrationKind): Promise<ActionResult>;
  disconnectIntegrationAction(projectId: string, kind: IntegrationKind): Promise<ActionResult>;
  deleteAccountAction(confirmEmail: string): Promise<ActionResult>; // signs out + redirect('/') on success
  ```
- Test ids: `integration-<kind>` (card) with `data-connected="true|false"`, `integration-<kind>-status`, `tg-connect`, `tg-private-link`, `tg-group-link`, `discord-url`, `discord-save`, `custom-token`, `custom-chat`, `custom-save`, `send-test-<kind>`, `disconnect-<kind>`, `billing-plan`, `billing-upgrade-monthly`, `billing-upgrade-lifetime`, `billing-coming-soon`, `account-email`, `delete-account-email`, `delete-account-submit`.

- [ ] **Step 1: Write the failing test**

`apps/web/lib/dashboard/account.test.ts`:
```ts
import { createFeedback, createProject, createUser, withTx, type TestDb } from '@dymcode/db-tests/harness';
import { describe, expect, it } from 'vitest';
import { VALID_ENV } from '@/test/fixtures';
import type { AuthAdmin } from '../auth/admin';
import { parseEnv } from '../env';
import { createMemoryStorage } from '../storage';
import { deleteAccount } from './account';

const dbAdmin = (db: TestDb): AuthAdmin => ({
  deleteUser: async (id) => {
    await db.query('delete from auth.users where id = $1', [id]);
  },
});

describe('deleteAccount', () => {
  it('requires the email, removes screenshots of every owned project and deletes the user', () =>
    withTx(async (db) => {
      const storage = createMemoryStorage();
      const deps = { db, storage, env: parseEnv(VALID_ENV), fetch, authAdmin: dbAdmin(db) };
      const email = 'owner@example.com';
      const owner = await createUser(db, email);
      const other = await createUser(db);
      const mine = await createProject(db, owner);
      const theirs = await createProject(db, other);
      const paths: string[] = [];
      for (const project of [mine, theirs]) {
        const id = await createFeedback(db, project.id, { overQuota: project === mine });
        const path = `${project.id}/${id}.webp`;
        paths.push(path);
        await storage.upload(path, new Uint8Array([1]), 'image/webp');
        await db.query('update public.feedback set screenshot_path = $1 where id = $2', [path, id]);
      }

      expect(await deleteAccount(deps, { id: owner, email }, 'wrong@example.com')).toEqual({
        ok: false,
        error: 'account.confirmMismatch',
      });
      expect(await deleteAccount(deps, { id: owner, email }, '  OWNER@example.com ')).toEqual({ ok: true });
      expect(await db.query('select 1 from auth.users where id = $1', [owner])).toEqual([]);
      expect(await db.query('select 1 from public.projects where id = $1', [mine.id])).toEqual([]);
      expect([...storage.files.keys()]).toEqual([paths[1]]);
    }));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @dymcode/web test`
Expected: FAIL with unresolved `./account` and `../auth/admin`.

- [ ] **Step 3: Implement**

`apps/web/lib/auth/admin.ts`:
```ts
import { createClient } from '@supabase/supabase-js';
import type { AppDeps } from '../deps';

export interface AuthAdmin {
  /** Deletes the auth user; the DB cascades to profiles, projects, feedback and integrations. Throws on failure. */
  deleteUser(userId: string): Promise<void>;
}

export function getAuthAdmin(deps: Pick<AppDeps, 'db' | 'env'>): AuthAdmin {
  if (deps.env.DYMCODE_TEST_MODE === '1') {
    return {
      deleteUser: async (userId) => {
        await deps.db.query('delete from auth.users where id = $1', [userId]);
      },
    };
  }
  const client = createClient(deps.env.NEXT_PUBLIC_SUPABASE_URL, deps.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return {
    deleteUser: async (userId) => {
      const { error } = await client.auth.admin.deleteUser(userId);
      if (error) throw new Error(`auth admin deleteUser failed: ${error.message}`);
    },
  };
}
```

`apps/web/lib/dashboard/account.ts`:
```ts
import type { AuthAdmin } from '../auth/admin';
import { removeScreenshots } from './cleanup';
import type { ActionResult, DashDeps } from './result';

export async function deleteAccount(
  deps: DashDeps & { authAdmin: AuthAdmin },
  user: { id: string; email: string },
  confirmEmail: string,
): Promise<ActionResult> {
  if (confirmEmail.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
    return { ok: false, error: 'account.confirmMismatch' };
  }
  const files = await deps.db.query<{ screenshot_path: string }>(
    `select f.screenshot_path from public.feedback f join public.projects p on p.id = f.project_id
     where p.owner_id = $1 and f.screenshot_path is not null`,
    [user.id],
  );
  await removeScreenshots(
    deps.storage,
    files.map((f) => f.screenshot_path),
  );
  try {
    await deps.authAdmin.deleteUser(user.id);
  } catch (error) {
    console.error('[account] delete failed', error);
    return { ok: false, error: 'errors.generic' };
  }
  return { ok: true };
}
```

Append to `apps/web/app/app/actions.ts` (imports at the top):
```ts
import { signOut } from '@/app/actions/session';
import { getAuthAdmin } from '@/lib/auth/admin';
import { deleteAccount } from '@/lib/dashboard/account';
import {
  createTelegramLink,
  disconnectIntegration,
  integrationStatus,
  saveCustomBot,
  saveDiscord,
  sendTest,
  type IntegrationKind,
  type IntegrationStatus,
  type TelegramLink,
} from '@/lib/dashboard/integrations';

export async function createTelegramLinkAction(projectId: string): Promise<ActionResult<{ link: TelegramLink }>> {
  const user = await requireUser();
  return createTelegramLink(await getDeps(), user.id, projectId);
}

export async function integrationStatusAction(projectId: string): Promise<IntegrationStatus[] | null> {
  const user = await requireUser();
  return integrationStatus(await getDeps(), user.id, projectId);
}

export async function saveCustomBotAction(
  projectId: string,
  token: string,
  chatId: string,
): Promise<ActionResult<{ botUsername: string }>> {
  const user = await requireUser();
  return saveCustomBot(await getDeps(), user.id, { projectId, token, chatId });
}

export async function saveDiscordAction(projectId: string, webhookUrl: string): Promise<ActionResult> {
  const user = await requireUser();
  return saveDiscord(await getDeps(), user.id, { projectId, webhookUrl });
}

export async function sendTestAction(projectId: string, kind: IntegrationKind): Promise<ActionResult> {
  const user = await requireUser();
  return sendTest(await getDeps(), user.id, { projectId, kind });
}

export async function disconnectIntegrationAction(projectId: string, kind: IntegrationKind): Promise<ActionResult> {
  const user = await requireUser();
  return disconnectIntegration(await getDeps(), user.id, { projectId, kind });
}

export async function deleteAccountAction(confirmEmail: string): Promise<ActionResult> {
  const user = await requireUser();
  const deps = await getDeps();
  const result = await deleteAccount({ ...deps, authAdmin: getAuthAdmin(deps) }, user, confirmEmail);
  if (!result.ok) return result;
  await signOut(); // clears the session and redirects to '/'
  return result;
}
```

- [ ] **Step 4: Verify the use case**

Run: `pnpm --filter @dymcode/web test`
Expected: PASS.

- [ ] **Step 5: Messages**

Add to both message files:
```json
"integrations": {
  "title": "Integrations" / "Интеграции",
  "telegram_shared": "Telegram" / "Telegram",
  "telegram_sharedHint": "Get reports from @{bot} in a private chat or a group." / "Получайте отзывы от @{bot} в личке или в группе.",
  "telegram_custom": "Your own Telegram bot" / "Свой Telegram-бот",
  "telegram_customHint": "Reports come from your bot, under your brand." / "Отзывы приходят от вашего бота, под вашим брендом.",
  "discord": "Discord" / "Discord",
  "discordHint": "Paste a channel webhook URL (Channel settings → Integrations → Webhooks)." / "Вставьте URL вебхука канала (Настройки канала → Интеграции → Вебхуки).",
  "connected": "Connected" / "Подключено",
  "notConnected": "Not connected" / "Не подключено",
  "error": "Error: {message}" / "Ошибка: {message}",
  "lastDelivery": "Last delivery: {time}" / "Последняя доставка: {time}",
  "connect": "Connect" / "Подключить",
  "privateChat": "Open private chat" / "Открыть личный чат",
  "addToGroup": "Add to group" / "Добавить в группу",
  "waitingTelegram": "Press Start in Telegram. Waiting…" / "Нажмите Start в Telegram. Ждём…",
  "linkExpired": "Did not connect in time. Try again." / "Не удалось подключиться вовремя. Попробуйте ещё раз.",
  "botToken": "Bot token" / "Токен бота",
  "chatId": "Chat ID" / "ID чата",
  "webhookUrl": "Webhook URL" / "URL вебхука",
  "save": "Save and send test" / "Сохранить и отправить тест",
  "sendTest": "Send test" / "Отправить тест",
  "testSent": "Test message sent" / "Тестовое сообщение отправлено",
  "disconnect": "Disconnect" / "Отключить",
  "bot": "Bot: @{username}" / "Бот: @{username}",
  "invalidToken": "The bot token is not valid." / "Токен бота недействителен.",
  "invalidChatId": "Enter a numeric chat ID or @channel." / "Введите числовой ID чата или @канал.",
  "invalidWebhook": "Enter a Discord webhook URL (https://discord.com/api/webhooks/…)." / "Введите URL вебхука Discord (https://discord.com/api/webhooks/…).",
  "testFailed": "The test message could not be delivered. Check the settings." / "Не удалось доставить тестовое сообщение. Проверьте настройки.",
  "proRequired": "Available on Pro." / "Доступно на Pro.",
  "notConnectedError": "Connect this integration first." / "Сначала подключите эту интеграцию."
},
"billing": {
  "title": "Billing" / "Тариф",
  "current": "Current plan: {plan}" / "Текущий тариф: {plan}",
  "free": "Free" / "Бесплатный",
  "pro": "Pro" / "Pro",
  "usage": "{used} / {limit} submissions this month" / "{used} / {limit} отзывов в этом месяце",
  "usageUnlimited": "{used} submissions this month" / "{used} отзывов в этом месяце",
  "monthly": "Pro — $9/month" / "Pro — $9/мес",
  "lifetime": "Lifetime — $49" / "Навсегда — $49",
  "comingSoonTitle": "Payments are coming soon" / "Оплата скоро появится",
  "comingSoonBody": "We are finishing payments. Pro features will be available here shortly." / "Мы заканчиваем подключение оплаты. Pro-возможности скоро будут доступны здесь."
},
"account": {
  "title": "Account" / "Аккаунт",
  "email": "Email" / "Email",
  "language": "Interface language" / "Язык интерфейса",
  "deleteTitle": "Delete account" / "Удалить аккаунт",
  "deleteHint": "Deletes all projects, feedback, screenshots and integrations. Type your email to confirm." / "Будут удалены все проекты, отзывы, скриншоты и интеграции. Введите свой email для подтверждения.",
  "delete": "Delete my account" / "Удалить мой аккаунт",
  "confirmMismatch": "The email does not match." / "Email не совпадает."
}
```
The `integrations.notConnected` key is the card status label; the `sendTest` error key `integrations.notConnected` from Task 8 must therefore render sensibly: map it in the UI (`error === 'integrations.notConnected' ? 'integrations.notConnectedError' : error`).

- [ ] **Step 6: Integrations UI**

`apps/web/components/app/integrations/integrations-panel.tsx`:
```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  createTelegramLinkAction,
  disconnectIntegrationAction,
  integrationStatusAction,
  saveCustomBotAction,
  saveDiscordAction,
  sendTestAction,
} from '@/app/app/actions';
import type { IntegrationKind, IntegrationStatus, TelegramLink } from '@/lib/dashboard/integrations';

const POLL_MS = 2000;
const POLL_LIMIT_MS = 60_000;

export function IntegrationsPanel(props: { projectId: string; bot: string; pro: boolean; initial: IntegrationStatus[] }) {
  const t = useTranslations();
  const format = useFormatter();
  const router = useRouter();
  const [statuses, setStatuses] = useState(props.initial);
  const [link, setLink] = useState<TelegramLink | null>(null);
  const [pending, start] = useTransition();
  const pollStarted = useRef(0);
  const byKind = (kind: IntegrationKind) => statuses.find((s) => s.kind === kind)!;
  const errorText = (key: string) => t(key === 'integrations.notConnected' ? 'integrations.notConnectedError' : key);

  const refresh = async () => {
    const next = await integrationStatusAction(props.projectId);
    if (next) setStatuses(next);
    return next;
  };

  useEffect(() => {
    if (!link) return;
    pollStarted.current = Date.now();
    const timer = setInterval(async () => {
      const next = await refresh();
      if (next?.find((s) => s.kind === 'telegram_shared')?.connected) {
        clearInterval(timer);
        setLink(null);
        router.refresh();
      } else if (Date.now() - pollStarted.current > POLL_LIMIT_MS) {
        clearInterval(timer);
        setLink(null);
        toast.error(t('integrations.linkExpired'));
      }
    }, POLL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success?: string) =>
    start(async () => {
      const result = await fn();
      if (result.ok) {
        if (success) toast.success(t(success));
        await refresh();
      } else toast.error(errorText(result.error ?? 'errors.generic'));
    });

  const Status = ({ status }: { status: IntegrationStatus }) => (
    <div className="text-xs" data-testid={`integration-${status.kind}-status`}>
      {status.connected ? (
        <span className="text-green-600">{t('integrations.connected')}</span>
      ) : status.lastError ? (
        <span className="text-destructive">{t('integrations.error', { message: status.lastError })}</span>
      ) : (
        <span className="text-muted-foreground">{t('integrations.notConnected')}</span>
      )}
      {status.lastDeliveredAt && (
        <span className="ml-2 text-muted-foreground">
          {t('integrations.lastDelivery', { time: format.relativeTime(new Date(status.lastDeliveredAt)) })}
        </span>
      )}
    </div>
  );

  const Card = ({ kind, hint, children, locked }: { kind: IntegrationKind; hint: string; children: ReactNode; locked?: boolean }) => {
    const status = byKind(kind);
    const exists = status.connected || status.lastError !== null;
    return (
      <section className="flex flex-col gap-3 rounded-lg border p-4" data-testid={`integration-${kind}`} data-connected={String(status.connected)}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-medium">
              {t(`integrations.${kind}`)} {locked && <span className="text-xs">🔒 Pro</span>}
            </h2>
            <p className="text-sm text-muted-foreground">{hint}</p>
          </div>
          <Status status={status} />
        </div>
        {children}
        {exists && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={pending} data-testid={`send-test-${kind}`} onClick={() => run(() => sendTestAction(props.projectId, kind), 'integrations.testSent')}>
              {t('integrations.sendTest')}
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} data-testid={`disconnect-${kind}`} onClick={() => run(() => disconnectIntegrationAction(props.projectId, kind))}>
              {t('integrations.disconnect')}
            </Button>
          </div>
        )}
      </section>
    );
  };

  const custom = byKind('telegram_custom');
  return (
    <div className="flex flex-col gap-4">
      <Card kind="telegram_shared" hint={t('integrations.telegram_sharedHint', { bot: props.bot })}>
        {link ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <a href={link.privateUrl} target="_blank" rel="noopener noreferrer" className="underline" data-testid="tg-private-link">
                {t('integrations.privateChat')}
              </a>
              <a href={link.groupUrl} target="_blank" rel="noopener noreferrer" className="underline" data-testid="tg-group-link">
                {t('integrations.addToGroup')}
              </a>
            </div>
            <p className="animate-pulse text-xs text-muted-foreground">{t('integrations.waitingTelegram')}</p>
          </div>
        ) : (
          !byKind('telegram_shared').connected && (
            <Button
              size="sm"
              className="self-start"
              disabled={pending}
              data-testid="tg-connect"
              onClick={() =>
                start(async () => {
                  const result = await createTelegramLinkAction(props.projectId);
                  if (result.ok) setLink(result.link);
                  else toast.error(t(result.error));
                })
              }
            >
              {t('integrations.connect')}
            </Button>
          )
        )}
      </Card>

      <Card kind="telegram_custom" hint={t('integrations.telegram_customHint')} locked={!props.pro}>
        {custom.botUsername && <p className="text-sm">{t('integrations.bot', { username: custom.botUsername })}</p>}
        <form
          className="flex flex-wrap gap-2"
          action={(form) =>
            run(() => saveCustomBotAction(props.projectId, String(form.get('token') ?? ''), String(form.get('chatId') ?? '')), 'integrations.testSent')
          }
        >
          <fieldset disabled={!props.pro || pending} className="contents">
            <Input name="token" type="password" autoComplete="off" placeholder={t('integrations.botToken')} className="max-w-xs" data-testid="custom-token" />
            <Input name="chatId" placeholder={t('integrations.chatId')} className="max-w-[12rem]" data-testid="custom-chat" />
            <Button type="submit" size="sm" data-testid="custom-save">
              {t('integrations.save')}
            </Button>
          </fieldset>
        </form>
      </Card>

      <Card kind="discord" hint={t('integrations.discordHint')}>
        <form className="flex flex-wrap gap-2" action={(form) => run(() => saveDiscordAction(props.projectId, String(form.get('webhookUrl') ?? '')), 'integrations.testSent')}>
          <Input name="webhookUrl" type="url" autoComplete="off" placeholder="https://discord.com/api/webhooks/…" className="max-w-md" disabled={pending} data-testid="discord-url" />
          <Button type="submit" size="sm" disabled={pending} data-testid="discord-save">
            {t('integrations.save')}
          </Button>
        </form>
      </Card>
    </div>
  );
}
```

`apps/web/app/app/p/[projectId]/integrations/page.tsx`:
```tsx
import { getTranslations } from 'next-intl/server';
import { IntegrationsPanel } from '@/components/app/integrations/integrations-panel';
import { requireUser } from '@/lib/auth/session';
import { integrationStatus } from '@/lib/dashboard/integrations';
import { isPro } from '@/lib/dashboard/settings';
import { getDeps } from '@/lib/deps';

export default async function IntegrationsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser();
  const { projectId } = await params;
  const deps = await getDeps();
  const t = await getTranslations('integrations');
  const [initial, pro] = await Promise.all([integrationStatus(deps, user.id, projectId), isPro(deps, user.id)]);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <IntegrationsPanel projectId={projectId} bot={deps.env.TELEGRAM_BOT_USERNAME} pro={pro} initial={initial ?? []} />
    </div>
  );
}
```

- [ ] **Step 7: Billing and account pages**

`apps/web/components/app/billing/upgrade-buttons.tsx`:
```tsx
'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export function UpgradeButtons() {
  const t = useTranslations('billing');
  const dialog = (label: string, testId: string) => (
    <Dialog>
      <DialogTrigger asChild>
        <Button data-testid={testId}>{label}</Button>
      </DialogTrigger>
      <DialogContent data-testid="billing-coming-soon">
        <DialogHeader>
          <DialogTitle>{t('comingSoonTitle')}</DialogTitle>
          <DialogDescription>{t('comingSoonBody')}</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
  return (
    <div className="flex flex-wrap gap-3">
      {dialog(t('monthly'), 'billing-upgrade-monthly')}
      {dialog(t('lifetime'), 'billing-upgrade-lifetime')}
    </div>
  );
}
```

`apps/web/app/app/billing/page.tsx`:
```tsx
import { getTranslations } from 'next-intl/server';
import { UpgradeButtons } from '@/components/app/billing/upgrade-buttons';
import { requireUser } from '@/lib/auth/session';
import { usage } from '@/lib/dashboard/feedback';
import { getDeps } from '@/lib/deps';

export default async function BillingPage() {
  const user = await requireUser();
  const plan = await usage(await getDeps(), user.id);
  const t = await getTranslations('billing');
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p data-testid="billing-plan">{t('current', { plan: plan.pro ? t('pro') : t('free') })}</p>
      <p className="text-sm text-muted-foreground">
        {plan.limit === null ? t('usageUnlimited', { used: plan.used }) : t('usage', { used: plan.used, limit: plan.limit })}
      </p>
      {!plan.pro && <UpgradeButtons />}
    </div>
  );
}
```

`apps/web/components/app/account/delete-account.tsx`:
```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { deleteAccountAction } from '@/app/app/actions';

export function DeleteAccount() {
  const t = useTranslations();
  const [value, setValue] = useState('');
  const [pending, start] = useTransition();
  return (
    <section className="rounded-lg border border-destructive/50 p-4">
      <h2 className="font-medium text-destructive">{t('account.deleteTitle')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('account.deleteHint')}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Input type="email" value={value} onChange={(e) => setValue(e.target.value)} className="max-w-xs" data-testid="delete-account-email" />
        <Button
          variant="destructive"
          disabled={pending || !value}
          data-testid="delete-account-submit"
          onClick={() =>
            start(async () => {
              const result = await deleteAccountAction(value);
              if (result && !result.ok) toast.error(t(result.error));
            })
          }
        >
          {t('account.delete')}
        </Button>
      </div>
    </section>
  );
}
```

`apps/web/app/app/account/page.tsx`:
```tsx
import { getTranslations } from 'next-intl/server';
import { signOut } from '@/app/actions/session';
import { DeleteAccount } from '@/components/app/account/delete-account';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { Button } from '@/components/ui/button';
import { requireUser } from '@/lib/auth/session';

export default async function AccountPage() {
  const user = await requireUser();
  const t = await getTranslations();
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">{t('account.title')}</h1>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{t('account.email')}</span>
        <span data-testid="account-email">{user.email}</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{t('account.language')}</span>
        <LocaleSwitcher />
      </div>
      <form action={signOut}>
        <Button type="submit" variant="outline">
          {t('auth.signOut')}
        </Button>
      </form>
      <DeleteAccount />
    </div>
  );
}
```

- [ ] **Step 8: Verify and commit**

Run: `pnpm --filter @dymcode/web test && pnpm typecheck && pnpm --filter @dymcode/web build`
Expected: PASS.
```bash
pnpm format
git add apps/web
git commit -m "feat(web): add integrations, billing and account pages"
```

---

### Task 10: Landing, legal pages and SEO

**Files:**
- Create: `apps/web/app/(marketing)/layout.tsx`, `apps/web/app/(marketing)/page.tsx`, `apps/web/app/(marketing)/privacy/page.tsx`, `apps/web/app/(marketing)/terms/page.tsx`, `apps/web/components/marketing/site-footer.tsx`, `apps/web/components/marketing/own-widget.tsx`, `apps/web/app/robots.ts`, `apps/web/app/sitemap.ts`
- Delete: `apps/web/app/page.tsx` (replaced by the marketing page)
- Modify: `apps/web/app/layout.tsx` (`generateMetadata`), `apps/web/messages/en.json`, `apps/web/messages/ru.json`
- Test: `apps/web/app/seo.test.ts`

**Interfaces:**
- Consumes: `getEnv` (`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_DYMCODE_PROJECT_KEY`), `LocaleSwitcher`, `ENTITLEMENTS`.
- Produces: routes `/`, `/privacy`, `/terms`, `/robots.txt`, `/sitemap.xml`. Test ids: `landing-cta`, `landing-pricing`.

- [ ] **Step 1: Write the failing test**

`apps/web/app/seo.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VALID_ENV } from '@/test/fixtures';

afterEach(() => vi.unstubAllEnvs());

async function load() {
  for (const [key, value] of Object.entries(VALID_ENV)) vi.stubEnv(key, value);
  vi.resetModules();
  return { robots: (await import('./robots')).default, sitemap: (await import('./sitemap')).default };
}

describe('SEO routes', () => {
  it('robots allows the site but not the dashboard or API', async () => {
    const { robots } = await load();
    const result = robots();
    expect(result.rules).toEqual({ userAgent: '*', allow: '/', disallow: ['/app', '/api', '/auth'] });
    expect(result.sitemap).toBe(`${VALID_ENV.NEXT_PUBLIC_APP_URL}/sitemap.xml`);
  });

  it('sitemap lists the public pages', async () => {
    const { sitemap } = await load();
    expect(sitemap().map((entry) => entry.url)).toEqual(
      ['', '/privacy', '/terms', '/login'].map((path) => `${VALID_ENV.NEXT_PUBLIC_APP_URL}${path}`),
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @dymcode/web test`
Expected: FAIL with unresolved `./robots` and `./sitemap`.

- [ ] **Step 3: SEO routes**

`apps/web/app/robots.ts`:
```ts
import type { MetadataRoute } from 'next';
import { getEnv } from '@/lib/env';

export default function robots(): MetadataRoute.Robots {
  const base = getEnv().NEXT_PUBLIC_APP_URL;
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/app', '/api', '/auth'] },
    sitemap: `${base}/sitemap.xml`,
  };
}
```

`apps/web/app/sitemap.ts`:
```ts
import type { MetadataRoute } from 'next';
import { getEnv } from '@/lib/env';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getEnv().NEXT_PUBLIC_APP_URL;
  return ['', '/privacy', '/terms', '/login'].map((path) => ({
    url: `${base}${path}`,
    changeFrequency: 'monthly',
    priority: path === '' ? 1 : 0.5,
  }));
}
```
`getEnv` caches the parsed env at module scope; `vi.resetModules()` in the test gives each import a fresh cache.

- [ ] **Step 4: Messages**

Add to both message files (EN / RU):
```json
"meta": {
  "title": "Dymcode — bug reports and feedback in Telegram & Discord" / "Dymcode — баг-репорты и отзывы в Telegram и Discord",
  "description": "A 9 KB feedback widget with screenshots. Reports land in Telegram or Discord instantly. Free to start." / "Виджет обратной связи весом 9 КБ со скриншотами. Отзывы мгновенно приходят в Telegram или Discord. Бесплатный старт."
},
"landing": {
  "heroTitle": "Bug reports and feedback, straight to Telegram & Discord" / "Баг-репорты и отзывы — сразу в Telegram и Discord",
  "heroBody": "Add one script tag. Visitors send a message with a screenshot and page context; you get it in your chat within seconds." / "Добавьте один тег script. Посетители отправляют сообщение со скриншотом и контекстом страницы, а вы получаете его в чат за секунды.",
  "startFree": "Start free" / "Начать бесплатно",
  "howItWorks": "See how it works" / "Как это работает",
  "stepsTitle": "How it works" / "Как это работает",
  "step1": "Create a project and paste the snippet into your site." / "Создайте проект и вставьте код на сайт.",
  "step2": "Connect Telegram or Discord in one click." / "Подключите Telegram или Discord в один клик.",
  "step3": "Get every report with a screenshot, browser and console errors." / "Получайте каждый отзыв со скриншотом, браузером и ошибками консоли.",
  "tryIt": "Try it: the button in the corner is the real widget." / "Попробуйте: кнопка в углу — это настоящий виджет.",
  "whyTitle": "Why Dymcode" / "Почему Dymcode",
  "whySize": "Tiny: about 9 KB gzipped, screenshots load only when needed." / "Лёгкий: около 9 КБ в gzip, скриншоты грузятся только по требованию.",
  "whyInstant": "Instant alerts where your team already is." / "Мгновенные уведомления там, где уже сидит ваша команда.",
  "whyPrivacy": "Private by design: passwords are masked in screenshots, tokens are redacted." / "Приватность по умолчанию: пароли скрываются на скриншотах, токены вырезаются.",
  "whyPrice": "Fair price: free to start, $9/month or $49 once for Pro." / "Честная цена: бесплатный старт, Pro за $9/мес или $49 навсегда.",
  "pricingTitle": "Pricing" / "Тарифы",
  "planFree": "Free" / "Free",
  "planFreeBody": "1 project · 20 reports/month · Telegram & Discord alerts · 30-day screenshots" / "1 проект · 20 отзывов/мес · уведомления в Telegram и Discord · скриншоты 30 дней",
  "planPro": "Pro — $9/month" / "Pro — $9/мес",
  "planProBody": "Unlimited projects and reports · your own bot · no badge · custom CSS · 1-year screenshots" / "Безлимит проектов и отзывов · свой бот · без бейджа · свой CSS · скриншоты 1 год",
  "planLifetime": "Lifetime — $49" / "Навсегда — $49",
  "planLifetimeBody": "Everything in Pro, paid once." / "Всё из Pro, одна оплата.",
  "faqTitle": "FAQ" / "Вопросы и ответы",
  "faq1q": "Will it slow down my site?" / "Замедлит ли это мой сайт?",
  "faq1a": "No. The script loads async and starts when the browser is idle." / "Нет. Скрипт грузится асинхронно и запускается, когда браузер свободен.",
  "faq2q": "What happens over the Free limit?" / "Что будет после лимита Free?",
  "faq2a": "Reports are still saved; upgrade to see them." / "Отзывы всё равно сохраняются; перейдите на Pro, чтобы их увидеть.",
  "faq3q": "Can I use my own button?" / "Можно использовать свою кнопку?",
  "faq3a": "Yes: hide ours with data-hide-trigger and call Dymcode.open()." / "Да: скройте нашу через data-hide-trigger и вызывайте Dymcode.open().",
  "privacy": "Privacy" / "Конфиденциальность",
  "terms": "Terms" / "Условия",
  "dashboard": "Dashboard" / "Кабинет"
},
"legal": {
  "draft": "Draft — not legal advice." / "Черновик — не является юридической консультацией.",
  "privacyTitle": "Privacy Policy" / "Политика конфиденциальности",
  "privacy1": "Dymcode stores what a visitor submits through the widget: the message, an optional email and an optional screenshot." / "Dymcode хранит то, что посетитель отправляет через виджет: сообщение, необязательный email и необязательный скриншот.",
  "privacy2": "With each report we store page metadata: URL (tokens in query strings are redacted), browser, OS, screen and viewport size, language, time zone and recent console errors." / "Вместе с отзывом мы храним метаданные страницы: URL (токены в параметрах вырезаются), браузер, ОС, размер экрана и окна, язык, часовой пояс и последние ошибки консоли.",
  "privacy3": "Screenshots are kept for 30 days on Free and 365 days on Pro, then deleted automatically." / "Скриншоты хранятся 30 дней на Free и 365 дней на Pro, затем удаляются автоматически.",
  "privacy4": "IP addresses are never stored; only a salted hash is used inside short-lived rate-limit keys." / "IP-адреса не сохраняются; используется только солёный хэш внутри краткоживущих ключей ограничения частоты.",
  "privacy5": "Reports are delivered to the Telegram or Discord destinations the project owner configures." / "Отзывы доставляются в Telegram или Discord, которые настроил владелец проекта.",
  "privacy6": "Account owners can delete projects or their whole account at any time; this removes all related data." / "Владелец аккаунта может в любой момент удалить проекты или весь аккаунт; это удаляет все связанные данные.",
  "termsTitle": "Terms of Service" / "Условия использования",
  "terms1": "Dymcode is provided as is. Do not use it to collect data you are not allowed to collect." / "Dymcode предоставляется «как есть». Не используйте его для сбора данных, которые вам не разрешено собирать.",
  "terms2": "You are responsible for informing your site’s visitors about the widget in your own privacy policy." / "Вы отвечаете за информирование посетителей вашего сайта о виджете в своей политике конфиденциальности.",
  "terms3": "Free plan limits may change with notice. Paid plans renew monthly until cancelled; Lifetime is a one-time payment." / "Лимиты бесплатного тарифа могут меняться с уведомлением. Платные тарифы продлеваются ежемесячно до отмены; Lifetime — разовая оплата.",
  "terms4": "We may suspend accounts that abuse the service or its delivery channels." / "Мы можем приостановить аккаунты, злоупотребляющие сервисом или каналами доставки."
}
```

- [ ] **Step 5: Pages**

`apps/web/app/layout.tsx`: replace the static `metadata` export with:
```tsx
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { getEnv } from '@/lib/env';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  const locale = await getLocale();
  return {
    metadataBase: new URL(getEnv().NEXT_PUBLIC_APP_URL),
    title: { default: t('title'), template: '%s · Dymcode' },
    description: t('description'),
    openGraph: { title: t('title'), description: t('description'), siteName: 'Dymcode', locale, type: 'website' },
  };
}
```
(Merge the imports with the existing ones; keep the `NextIntlClientProvider` + `Toaster` body from Task 3.)

`apps/web/components/marketing/own-widget.tsx`:
```tsx
import Script from 'next/script';
import { getEnv } from '@/lib/env';

/** Our own Dymcode widget on the landing page; nothing renders when the project key is unset. */
export function OwnWidget() {
  const key = getEnv().NEXT_PUBLIC_DYMCODE_PROJECT_KEY;
  if (!key) return null;
  return <Script src="/w/widget.js" data-project-id={key} strategy="afterInteractive" />;
}
```

`apps/web/components/marketing/site-footer.tsx`:
```tsx
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { LocaleSwitcher } from '@/components/locale-switcher';

export async function SiteFooter() {
  const t = await getTranslations('landing');
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-6 text-sm text-muted-foreground">
        <span>© {new Date().getFullYear()} Dymcode</span>
        <nav className="flex items-center gap-4">
          <Link href="/privacy" className="hover:underline">
            {t('privacy')}
          </Link>
          <Link href="/terms" className="hover:underline">
            {t('terms')}
          </Link>
          <LocaleSwitcher />
        </nav>
      </div>
    </footer>
  );
}
```

`apps/web/app/(marketing)/layout.tsx`:
```tsx
import Link from 'next/link';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { SiteFooter } from '@/components/marketing/site-footer';

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('landing');
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-semibold">
          Dymcode
        </Link>
        <Link href="/app" className="text-sm hover:underline">
          {t('dashboard')}
        </Link>
      </header>
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
```

`apps/web/app/(marketing)/page.tsx`:
```tsx
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { OwnWidget } from '@/components/marketing/own-widget';
import { Button } from '@/components/ui/button';

export default async function LandingPage() {
  const t = await getTranslations('landing');
  const section = 'mx-auto max-w-5xl px-6 py-16';
  return (
    <>
      <section className={`${section} text-center`}>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">{t('heroTitle')}</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">{t('heroBody')}</p>
        <div className="mt-8 flex justify-center gap-3">
          <Button asChild size="lg" data-testid="landing-cta">
            <Link href="/login">{t('startFree')}</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href="#how">{t('howItWorks')}</a>
          </Button>
        </div>
      </section>

      <section id="how" className={section}>
        <h2 className="text-2xl font-semibold">{t('stepsTitle')}</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-3">
          {(['step1', 'step2', 'step3'] as const).map((key, i) => (
            <li key={key} className="rounded-lg border p-4">
              <span className="text-sm font-semibold text-primary">{i + 1}</span>
              <p className="mt-2">{t(key)}</p>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm text-muted-foreground">{t('tryIt')}</p>
      </section>

      <section className={section}>
        <h2 className="text-2xl font-semibold">{t('whyTitle')}</h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {(['whySize', 'whyInstant', 'whyPrivacy', 'whyPrice'] as const).map((key) => (
            <li key={key} className="rounded-lg border p-4">
              {t(key)}
            </li>
          ))}
        </ul>
      </section>

      <section className={section} data-testid="landing-pricing">
        <h2 className="text-2xl font-semibold">{t('pricingTitle')}</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {(
            [
              ['planFree', 'planFreeBody'],
              ['planPro', 'planProBody'],
              ['planLifetime', 'planLifetimeBody'],
            ] as const
          ).map(([title, body]) => (
            <div key={title} className="flex flex-col gap-2 rounded-lg border p-5">
              <h3 className="font-semibold">{t(title)}</h3>
              <p className="text-sm text-muted-foreground">{t(body)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={section}>
        <h2 className="text-2xl font-semibold">{t('faqTitle')}</h2>
        <dl className="mt-6 flex flex-col gap-4">
          {(['faq1', 'faq2', 'faq3'] as const).map((key) => (
            <div key={key}>
              <dt className="font-medium">{t(`${key}q`)}</dt>
              <dd className="text-muted-foreground">{t(`${key}a`)}</dd>
            </div>
          ))}
        </dl>
      </section>
      <OwnWidget />
    </>
  );
}
```

`apps/web/app/(marketing)/privacy/page.tsx`:
```tsx
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('legal'))('privacyTitle') };
}

export default async function PrivacyPage() {
  const t = await getTranslations('legal');
  return (
    <article className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold">{t('privacyTitle')}</h1>
      <p className="mt-2 rounded-md bg-muted px-3 py-2 text-sm">{t('draft')}</p>
      {(['privacy1', 'privacy2', 'privacy3', 'privacy4', 'privacy5', 'privacy6'] as const).map((key) => (
        <p key={key} className="mt-4">
          {t(key)}
        </p>
      ))}
    </article>
  );
}
```

`apps/web/app/(marketing)/terms/page.tsx`:
```tsx
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('legal'))('termsTitle') };
}

export default async function TermsPage() {
  const t = await getTranslations('legal');
  return (
    <article className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold">{t('termsTitle')}</h1>
      <p className="mt-2 rounded-md bg-muted px-3 py-2 text-sm">{t('draft')}</p>
      {(['terms1', 'terms2', 'terms3', 'terms4'] as const).map((key) => (
        <p key={key} className="mt-4">
          {t(key)}
        </p>
      ))}
    </article>
  );
}
```

Delete `apps/web/app/page.tsx` (`git rm apps/web/app/page.tsx`): the `(marketing)` group now owns `/`.

- [ ] **Step 6: Verify and commit**

Run: `pnpm --filter @dymcode/web test && pnpm typecheck && pnpm --filter @dymcode/web build`
Expected: PASS; the build output lists `/`, `/privacy`, `/terms`, `/robots.txt`, `/sitemap.xml`.
```bash
pnpm format
git add -A apps/web
git commit -m "feat(web): add the bilingual landing, legal drafts and SEO routes"
```

---

### Task 11: Dashboard E2E, CI, docs and the deployment guide

**Files:**
- Create: `apps/web/e2e/dashboard.spec.ts`, `docs/deploy.md`
- Modify: `apps/web/lib/test-mode.ts` (fake `getMe` response), `apps/web/playwright.config.ts` (only if needed, see Step 2), `README.md`, `docs/superpowers/followups/2026-09-22-api-followups.md` (close items this phase resolved, if any)

**Interfaces:**
- Consumes: every test id listed in Tasks 4, 6, 7, 9; `/api/e2e-test/login` (Task 2); `/api/e2e-test/outbox` (phase 3); `/api/telegram/webhook` with header `x-telegram-bot-api-secret-token`; `/api/v1/widget/config?key=`; `/e2e-host?key=`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Test-mode Telegram `getMe`**

In `apps/web/lib/test-mode.ts`, make the outbox fetch answer `getMe` like Telegram:
```ts
  const outboxFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    outbox.push({ url, body: await describeBody(init?.body) });
    if (url.endsWith('/getMe')) {
      return new Response(JSON.stringify({ ok: true, result: { id: 1, is_bot: true, username: 'e2e_custom_bot' } }), {
        status: 200,
      });
    }
    return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
  }) as typeof fetch;
```

- [ ] **Step 2: Write the E2E spec**

`apps/web/e2e/dashboard.spec.ts`:
```ts
import { expect, test, type Page } from '@playwright/test';

const WEBHOOK_SECRET = 'e2e-webhook-secret-0123'; // playwright.config.ts webServer.env

let counter = 0;
async function login(page: Page) {
  const email = `owner-${Date.now()}-${counter++}@e2e.dev`;
  const response = await page.request.post('/api/e2e-test/login', { data: { email } });
  expect(response.ok()).toBe(true);
  return email;
}

async function createProject(page: Page, name: string) {
  await page.goto('/app');
  await expect(page).toHaveURL(/\/app\/new$/);
  await page.getByTestId('project-name').fill(name);
  await page.getByTestId('project-create').click();
  await expect(page).toHaveURL(/\/app\/p\/[0-9a-f-]+\/install$/);
  const snippet = await page.getByTestId('install-snippet').textContent();
  const key = /data-project-id="(pk_[A-Za-z0-9]{16})"/.exec(snippet ?? '')?.[1];
  expect(key).toBeTruthy();
  const projectId = /\/app\/p\/([0-9a-f-]+)\//.exec(page.url())![1]!;
  return { key: key!, projectId };
}

test.beforeEach(async ({ page }) => {
  await page.request.delete('/api/e2e-test/outbox');
});

test('onboarding: create a project, receive the first feedback, resolve it', async ({ page, context }) => {
  await login(page);
  const { key, projectId } = await createProject(page, 'E2E Onboarding');
  await expect(page.getByTestId('install-waiting')).toBeVisible();

  const host = await context.newPage();
  await host.goto(`/e2e-host?key=${key}`);
  await host.locator('[data-dymcode] .dc-trigger').click();
  await expect(host.locator('.dc-thumb')).toHaveAttribute('data-state', /ready|unavailable/, { timeout: 15_000 });
  await host.locator('.dc-message').fill('E2E: the cart button does nothing');
  await host.waitForTimeout(2100); // bot guard
  await host.locator('.dc-send').click();
  await expect(host.locator('.dc-thanks')).toBeVisible();
  await host.close();

  await expect(page.getByTestId('install-received')).toBeVisible({ timeout: 15_000 });
  await page.goto(`/app/p/${projectId}/feedback`);
  const row = page.getByTestId('feedback-row').filter({ hasText: 'the cart button does nothing' });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByTestId('feedback-message')).toHaveText('E2E: the cart button does nothing');
  await page.getByTestId('feedback-resolve').click();
  await expect(page.getByTestId('feedback-reopen')).toBeVisible();
  await page.getByTestId('filter-status-new').click();
  await expect(page.getByTestId('feedback-empty')).toBeVisible();
  await page.getByTestId('filter-status-resolved').click();
  await expect(page.getByTestId('feedback-row')).toHaveCount(1);
});

test('settings: color and locale update the preview and the public config', async ({ page }) => {
  await login(page);
  const { key, projectId } = await createProject(page, 'E2E Settings');
  await page.goto(`/app/p/${projectId}/settings`);
  const preview = page.getByTestId('widget-preview');
  await expect(preview.locator('[data-dymcode]')).toBeAttached({ timeout: 15_000 });

  await page.getByTestId('settings-color-hex').fill('#ff0055');
  await page.getByTestId('settings-locale').selectOption('ru');
  await expect
    .poll(() =>
      preview
        .locator('[data-dymcode]')
        .evaluate((host) => {
          const root = host.shadowRoot?.querySelector<HTMLElement>('.dc-root');
          return `${root?.style.getPropertyValue('--dc-accent')}|${root?.getAttribute('lang')}`;
        }),
    )
    .toBe('#ff0055|ru');

  await page.getByTestId('settings-save').click();
  await expect
    .poll(async () => {
      const config = await (await page.request.get(`/api/v1/widget/config?key=${key}`)).json();
      return `${config.primaryColor}|${config.locale}`;
    })
    .toBe('#ff0055|ru');
});

test('integrations: Telegram connects through the webhook, Discord saves after a test send', async ({ page }) => {
  await login(page);
  const { projectId } = await createProject(page, 'E2E Integrations');
  await page.goto(`/app/p/${projectId}/integrations`);

  await page.getByTestId('tg-connect').click();
  const href = await page.getByTestId('tg-private-link').getAttribute('href');
  const code = /start=([0-9A-Za-z]{12})$/.exec(href ?? '')?.[1];
  expect(code).toBeTruthy();
  const webhook = await page.request.post('/api/telegram/webhook', {
    headers: { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET },
    data: { message: { text: `/start ${code}`, chat: { id: 777001, type: 'private' } } },
  });
  expect(webhook.ok()).toBe(true);
  await expect(page.getByTestId('integration-telegram_shared')).toHaveAttribute('data-connected', 'true', {
    timeout: 15_000,
  });

  await page.getByTestId('discord-url').fill('https://discord.com/api/webhooks/42/e2e-dashboard');
  await page.getByTestId('discord-save').click();
  await expect(page.getByTestId('integration-discord')).toHaveAttribute('data-connected', 'true');
  const { outbox } = await (await page.request.get('/api/e2e-test/outbox')).json();
  expect(outbox.some((entry: { url: string }) => entry.url.startsWith('https://discord.com/api/webhooks/42/e2e-dashboard'))).toBe(
    true,
  );
});

test('the dashboard renders in Russian after switching the language', async ({ page }) => {
  await login(page);
  await createProject(page, 'E2E Locale');
  await page.goto('/app/account');
  await page.getByTestId('locale-switcher').selectOption('ru');
  await expect(page.getByRole('heading', { name: 'Аккаунт' })).toBeVisible();
  await page.getByTestId('nav-feedback').first().click();
  await expect(page.getByRole('heading', { name: 'Отзывы' })).toBeVisible();
});
```
`nav-feedback` exists twice in the DOM (desktop sidebar and mobile sheet); `.first()` picks the visible desktop one at the default viewport. If the webhook route validates the update shape more strictly, add the fields it requires (e.g. `update_id`).

- [ ] **Step 3: Run the E2E suite**

Run: `pnpm --filter @dymcode/web e2e`
Expected: the 3 phase-3 tests and the 4 new tests PASS. Kill any stale dev server on port 3100 first (`reuseExistingServer` would reuse a server started with different env).

- [ ] **Step 4: CI**

`.github/workflows/ci.yml` needs no new jobs: `check` runs `pnpm test` (new unit tests) and builds the widget (now including `preview.js`) and the web app; `e2e` runs `pnpm --filter @dymcode/web e2e` (includes `dashboard.spec.ts`); `db-supabase` runs `pnpm --filter @dymcode/web test` against real Supabase (covers `withUser` + RLS). Confirm the `check` job builds the widget before `pnpm --filter @dymcode/web build` (it does) so `copy-widget` finds `preview.js`.

- [ ] **Step 5: Deployment guide**

`docs/deploy.md`:
````markdown
# Deploying Dymcode

Production runs on Vercel (the `apps/web` Next.js app) and Supabase Cloud (Postgres, Auth, Storage).
Never commit secrets: every value below is entered in the Vercel or Supabase dashboard.

## 1. Supabase

1. Migrations: `supabase link --project-ref <ref>` then `supabase db push` (already done for the dev project).
2. Authentication → URL Configuration:
   - Site URL: `https://<domain>`
   - Redirect URLs: `https://<domain>/auth/callback` (add `http://localhost:3000/auth/callback` for local dev).
3. Authentication → Providers → Email: enabled (magic link). For production mail volume configure a custom SMTP
   server (the built-in sender is rate-limited and only for testing).
4. Authentication → Providers → GitHub: see step 3.

## 2. Vercel project

1. New Project → import `weeyne/Feedback-Bug-report`.
2. Root Directory: `apps/web`. Framework preset: Next.js.
3. Build command: `cd ../.. && pnpm --filter @dymcode/widget build && pnpm --filter @dymcode/web build`.
   Install command: leave the default (Vercel detects pnpm from the lockfile).
4. Environment variables (Production and Preview), same names as `apps/web/.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `DATABASE_URL`: the transaction pooler URL (`…pooler.supabase.com:6543/postgres`)
   - `NEXT_PUBLIC_APP_URL`: `https://<domain>` (no trailing slash)
   - `SECRETS_ENCRYPTION_KEY`, `IP_HASH_SALT`, `CRON_SECRET`
   - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`
   - `NEXT_PUBLIC_DYMCODE_PROJECT_KEY` (optional): the public key of your own Dymcode project, for the landing widget
   - Do NOT set `DYMCODE_TEST_MODE`.
5. Deploy. `vercel.json` registers the daily retention cron; Vercel sends `Authorization: Bearer $CRON_SECRET`.

## 3. GitHub sign-in

1. GitHub → Settings → Developer settings → OAuth Apps → New OAuth App.
   - Homepage URL: `https://<domain>`
   - Authorization callback URL: `https://<project-ref>.supabase.co/auth/v1/callback`
2. Generate a client secret. Paste the Client ID and secret into Supabase → Authentication → Providers → GitHub.

## 4. Telegram webhook

After the first successful deploy:

```bash
pnpm --filter @dymcode/web telegram:set-webhook https://<domain>/api/telegram/webhook
```

The script reads `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` from `apps/web/.env.local`.

## 5. Smoke checklist

- [ ] Sign in with GitHub; sign out; sign in with a magic link.
- [ ] Create a project, copy the snippet, connect Telegram (private chat) and Discord.
- [ ] Submit feedback from the landing widget (set `NEXT_PUBLIC_DYMCODE_PROJECT_KEY` to that project and redeploy)
      or from any page with the snippet: the report arrives in Telegram with a screenshot and appears in the feed.
- [ ] Vercel → Settings → Cron Jobs lists `/api/cron/retention`.
````

In `README.md`, add a "Dashboard" line to the feature overview (or create the section if missing) and a "Deploying" section that links to `docs/deploy.md`. Keep the existing content.

- [ ] **Step 6: Final verification and commit**

Run:
```bash
pnpm format:check && pnpm typecheck && pnpm test
pnpm --filter @dymcode/widget build && pnpm --filter @dymcode/widget size && pnpm --filter @dymcode/widget check:bundle
pnpm --filter @dymcode/web build && pnpm --filter @dymcode/web e2e
git checkout -- apps/web/next-env.d.ts
```
Expected: all PASS.
```bash
pnpm format
git add -A apps/web docs README.md
git commit -m "test(web): add dashboard E2E and the deployment guide"
```
