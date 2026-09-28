# Launch wave 1a Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the code-side launch blockers: silently lost fast reports, the allowed-origin trap, missing security
headers, a spoofable client IP off Vercel, lost sign-in intent and an unlimited magic-link sender.

**Architecture:** Server-side changes in `apps/web` only (the widget package is untouched). Origin matching moves to
one pure helper used by the config and submit endpoints; refusals are recorded on the project (new migration) and
surfaced in the dashboard with a one-click "Allow". Headers live in `next.config.ts`; the client IP source becomes
configurable; the post-sign-in target travels in a short-lived cookie.

**Tech Stack:** Next.js 16 App Router, React 19, next-intl, Supabase Postgres (PGlite in tests), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-28-launch-wave-1a-design.md`

## Global Constraints

- English code/comments/commits/docs. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- No new runtime dependencies. Widget package (`packages/widget`) unchanged.
- Keep every existing `data-testid`. New test ids: `blocked-origin-notice`, `blocked-origin-allow`.
- All user-facing strings in `apps/web/messages/en.json` and `ru.json`; `messages.test.ts` parity stays green.
  ICU: escape literal braces and apostrophes.
- UI: shadcn/ui on Base UI, no `asChild`; link-looking buttons are `<Link className={buttonVariants(...)}>`.
  Tokens from `app/globals.css`; any literal colour needs a light/dark pair.
- Migration `supabase/migrations/20260928000100_blocked_origin.sql` must be applied to the cloud DB before merge
  (owner's step; never run `supabase` CLI commands).
- Never create, read, print or commit `.env*` files.
- `next dev` and e2e rewrite `apps/web/next-env.d.ts`: run `git checkout apps/web/next-env.d.ts` before every commit.
- Commands run from the repo root. Single web test file: `pnpm --filter @bugping/web exec vitest run <path relative
  to apps/web>`. Every task ends with `pnpm typecheck`, `pnpm --filter @bugping/web test` and `pnpm format:check`;
  tasks with UI or headers also run `pnpm --filter @bugping/web e2e`.

---

### Task 1: Fast-report threshold, origin matching and blocked-origin recording (server)

**Files:**
- Create: `apps/web/lib/widget/origins.ts`, `apps/web/lib/widget/origins.test.ts`
- Create: `supabase/migrations/20260928000100_blocked_origin.sql`
- Modify: `apps/web/lib/widget/project.ts` (add `markOriginBlocked`)
- Modify: `apps/web/lib/widget/submit.ts` (threshold, `originAllowed`, record refusal)
- Modify: `apps/web/lib/widget/config.ts` (refuse disallowed `Origin`, record refusal)
- Test: `apps/web/lib/widget/submit.test.ts`, `apps/web/lib/widget/config.test.ts`

**Interfaces:**
- Produces: `siteKey(origin: string): string | null`, `parseOrigin(value: string | null): string | null`,
  `originAllowed(origin: string | null, allowed: readonly string[]): boolean` (all in `lib/widget/origins.ts`);
  `markOriginBlocked(db: Db, projectId: string, origin: string): Promise<void>` (in `lib/widget/project.ts`);
  DB columns `projects.blocked_origin text`, `projects.blocked_origin_at timestamptz`.

- [ ] **Step 1: Write the failing matcher tests** — `apps/web/lib/widget/origins.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { originAllowed, parseOrigin, siteKey } from './origins';

describe('siteKey', () => {
  it('drops one leading www., the scheme and default ports', () => {
    expect(siteKey('https://www.Example.com')).toBe('example.com');
    expect(siteKey('http://example.com:80')).toBe('example.com');
    expect(siteKey('https://example.com:8443')).toBe('example.com:8443');
    expect(siteKey('https://www.www.example.com')).toBe('www.example.com');
  });

  it('rejects non-http(s) and unparsable values', () => {
    expect(siteKey('null')).toBeNull();
    expect(siteKey('file:///tmp/x.html')).toBeNull();
    expect(siteKey('not a url')).toBeNull();
  });
});

describe('parseOrigin', () => {
  it('returns the origin of http(s) URLs only', () => {
    expect(parseOrigin('https://shop.example/path?q=1')).toBe('https://shop.example');
    expect(parseOrigin('http://localhost:3000')).toBe('http://localhost:3000');
    expect(parseOrigin('null')).toBeNull();
    expect(parseOrigin(null)).toBeNull();
    expect(parseOrigin('chrome-extension://abc')).toBeNull();
  });
});

describe('originAllowed', () => {
  const list = ['https://example.com', 'http://localhost:3000'];

  it('allows everything when the list is empty', () => {
    expect(originAllowed('https://anything.example', [])).toBe(true);
    expect(originAllowed(null, [])).toBe(true);
  });

  it('treats apex and www, http and https as one site', () => {
    expect(originAllowed('https://example.com', list)).toBe(true);
    expect(originAllowed('https://www.example.com', list)).toBe(true);
    expect(originAllowed('http://example.com', list)).toBe(true);
    expect(originAllowed('https://example.com', ['https://www.example.com'])).toBe(true);
  });

  it('keeps ports and other subdomains distinct', () => {
    expect(originAllowed('http://localhost:3000', list)).toBe(true);
    expect(originAllowed('http://localhost:4000', list)).toBe(false);
    expect(originAllowed('https://shop.example.com', list)).toBe(false);
    expect(originAllowed('https://example.com.evil.io', list)).toBe(false);
  });

  it('refuses a missing, "null" or unparsable origin when a list is set', () => {
    expect(originAllowed(null, list)).toBe(false);
    expect(originAllowed('null', list)).toBe(false);
    expect(originAllowed('garbage', list)).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @bugping/web exec vitest run lib/widget/origins.test.ts`
Expected: FAIL — cannot resolve `./origins`.

- [ ] **Step 3: Implement** — `apps/web/lib/widget/origins.ts`:

```ts
/** The part of an origin that names a site: hostname without one leading `www.`, plus a non-default port. */
export function siteKey(origin: string): string | null {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  return url.port ? `${host}:${url.port}` : host;
}

/** `scheme://host[:port]` of an http(s) URL, or null. */
export function parseOrigin(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * Whether a request's `Origin` may use a project whose allow-list is `allowed` (empty = any site).
 * Apex and `www`, http and https count as one site; ports and other subdomains do not.
 */
export function originAllowed(origin: string | null, allowed: readonly string[]): boolean {
  if (allowed.length === 0) return true;
  const key = origin ? siteKey(origin) : null;
  if (!key) return false;
  return allowed.some((entry) => siteKey(entry) === key);
}
```

- [ ] **Step 4: Run the matcher tests** — same command. Expected: PASS.

- [ ] **Step 5: Add the migration** — `supabase/migrations/20260928000100_blocked_origin.sql`:

```sql
-- The last origin the project's allow-list refused (config or submit), shown to the owner with an "Allow" action.
alter table public.projects
  add column blocked_origin text check (char_length(blocked_origin) <= 2048),
  add column blocked_origin_at timestamptz;

-- The owner clears it when allowing the origin (RLS "projects: update own" still applies).
grant update (blocked_origin, blocked_origin_at) on public.projects to authenticated;
```

- [ ] **Step 6: Write failing endpoint tests.**

In `apps/web/lib/widget/submit.test.ts`, change the `fast` case of `'silently drops bot submissions'` from
`elapsedMs: 1500` to `elapsedMs: 799`, and add inside `describe('handleSubmit')`:

```ts
  it('stores a submission sent 800 ms after the form opened', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const project = await freeProject(db);
      const res = await handleSubmit(deps, request(payload(project.public_key, { elapsedMs: 800 })));
      expect(res.status).toBe(201);
      expect(await feedbackRows(db, project.id)).toHaveLength(1);
    }));

  it('accepts www and http variants of an allowed origin', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const project = await freeProject(db);
      await db.query(
        `update public.projects set allowed_origins = '{https://shop.example}' where id = $1`,
        [project.id],
      );
      const www = await handleSubmit(
        deps,
        request(payload(project.public_key), { origin: 'https://www.shop.example' }),
      );
      expect(www.status).toBe(201);
      const http = await handleSubmit(
        deps,
        request(payload(project.public_key), { origin: 'http://shop.example', ip: '198.51.100.9' }),
      );
      expect(http.status).toBe(201);
    }));

  it('records the refused origin on the project', () =>
    withTx(async (db) => {
      const { deps, runAfter } = setup(db);
      const project = await freeProject(db);
      await db.query(
        `update public.projects set allowed_origins = '{https://shop.example}' where id = $1`,
        [project.id],
      );
      const res = await handleSubmit(deps, request(payload(project.public_key)));
      expect(res.status).toBe(403);
      await runAfter();
      const [row] = await db.query<{ blocked_origin: string | null; recorded: boolean }>(
        `select blocked_origin, blocked_origin_at is not null as recorded
         from public.projects where id = $1`,
        [project.id],
      );
      expect(row).toEqual({ blocked_origin: 'https://host.example', recorded: true });
    }));
```

In `apps/web/lib/widget/config.test.ts`, change the import to
`import { handleConfig, markWidgetSeen } from './config';` plus `import { markOriginBlocked } from './project';`, and
add inside `describe('handleConfig')`:

```ts
  describe('allowed origins', () => {
    async function locked(db: TestDb) {
      const project = await projectWithSettings(db, false);
      await db.query(
        `update public.projects set allowed_origins = '{https://shop.example}' where id = $1`,
        [project.id],
      );
      return project;
    }
    const call = (db: TestDb, key: string, origin: string | null) => {
      const tasks: Array<Promise<void>> = [];
      const res = handleConfig(
        {
          db,
          env: { NEXT_PUBLIC_APP_URL: 'https://app.example' },
          after: (t) => void tasks.push(t()),
        },
        new Request(`https://bugping.app/api/v1/widget/config?key=${key}`, {
          headers: origin ? { origin } : {},
        }),
      );
      return { res, settled: async () => Promise.all(tasks) };
    };
    const state = async (db: TestDb, id: string) =>
      (
        await db.query<{ blocked_origin: string | null; seen: boolean }>(
          `select blocked_origin, widget_seen_at is not null as seen from public.projects where id = $1`,
          [id],
        )
      )[0];

    it('refuses a disallowed Origin, records it and does not mark the widget seen', () =>
      withTx(async (db) => {
        const project = await locked(db);
        const { res, settled } = call(db, project.public_key, 'https://evil.example');
        const response = await res;
        expect(response.status).toBe(403);
        expect(response.headers.get('cache-control')).toBeNull();
        await settled();
        expect(await state(db, project.id)).toEqual({
          blocked_origin: 'https://evil.example',
          seen: false,
        });
      }));

    it('serves the www variant of an allowed site and marks it seen', () =>
      withTx(async (db) => {
        const project = await locked(db);
        const { res, settled } = call(db, project.public_key, 'https://www.shop.example');
        expect((await res).status).toBe(200);
        await settled();
        expect(await state(db, project.id)).toEqual({ blocked_origin: null, seen: true });
      }));

    it('serves a request without Origin even when a list is set', () =>
      withTx(async (db) => {
        const project = await locked(db);
        const { res } = call(db, project.public_key, null);
        expect((await res).status).toBe(200);
      }));
  });

  it('rewrites the blocked origin at most once per hour for the same origin', () =>
    withTx(async (db) => {
      const project = await projectWithSettings(db, false);
      await db.query(
        `update public.projects set blocked_origin = 'https://a.example',
           blocked_origin_at = now() - interval '10 minutes' where id = $1`,
        [project.id],
      );
      const age = async () =>
        (
          await db.query<{ age: number; origin: string }>(
            `select extract(epoch from now() - blocked_origin_at)::int as age, blocked_origin as origin
             from public.projects where id = $1`,
            [project.id],
          )
        )[0]!;
      await markOriginBlocked(db, project.id, 'https://a.example');
      expect((await age()).age).toBeGreaterThanOrEqual(590);
      await markOriginBlocked(db, project.id, 'https://b.example');
      expect(await age()).toEqual({ age: expect.any(Number), origin: 'https://b.example' });
      expect((await age()).age).toBeLessThan(5);
    }));
```

- [ ] **Step 7: Run to verify they fail**

Run: `pnpm --filter @bugping/web exec vitest run lib/widget/submit.test.ts lib/widget/config.test.ts`
Expected: FAIL — `markOriginBlocked` missing; 800 ms case returns 200 `{ id: null }`; config returns 200 for
`https://evil.example`.

- [ ] **Step 8: Implement the endpoints.**

`apps/web/lib/widget/project.ts` — append:

```ts
/** Remembers the last origin the allow-list refused; rewrites at most once per hour for the same origin. */
export async function markOriginBlocked(db: Db, projectId: string, origin: string): Promise<void> {
  await db.query(
    `update public.projects set blocked_origin = $2, blocked_origin_at = now()
     where id = $1
       and (blocked_origin is distinct from $2 or blocked_origin_at < now() - interval '1 hour')`,
    [projectId, origin],
  );
}
```

`apps/web/lib/widget/submit.ts`:
- `const MIN_ELAPSED_MS = 800;`
- imports: `import { originAllowed, parseOrigin } from './origins';` and
  `import { loadProjectByKey, markOriginBlocked } from './project';`
- replace the `allowed_origins` check with:

```ts
    if (!originAllowed(origin, project.allowed_origins)) {
      const blocked = parseOrigin(origin);
      if (blocked) {
        deps.after(() =>
          markOriginBlocked(deps.db, project.id, blocked).catch((error) =>
            console.error('[widget/submit] blocked origin', error),
          ),
        );
      }
      return json({ error: 'origin not allowed' }, 403, cors);
    }
```

`apps/web/lib/widget/config.ts` — in `handleConfig`, read the origin once
(`const origin = request.headers.get('origin'); const cors = corsHeaders(origin);`), import
`originAllowed, parseOrigin` from `./origins` and `markOriginBlocked` from `./project`, and after the 404 check add:

```ts
    if (origin !== null && !originAllowed(origin, project.allowed_origins)) {
      const blocked = parseOrigin(origin);
      if (blocked) {
        const record = () =>
          markOriginBlocked(deps.db, project.id, blocked).catch((error) =>
            console.error('[widget/config] blocked origin', error),
          );
        if (deps.after) deps.after(record);
        else void record();
      }
      return json({ error: 'origin not allowed' }, 403, cors);
    }
```

The seen ping stays below this check, so a refused origin never marks the widget seen.

- [ ] **Step 9: Run the widget tests** — `pnpm --filter @bugping/web exec vitest run lib/widget`. Expected: PASS.

- [ ] **Step 10: Full checks** — `pnpm typecheck`, `pnpm --filter @bugping/web test`, `pnpm format:check`, then
  `pnpm --filter @bugping/web e2e` (the existing `a disallowed origin is rejected` test must still pass: the e2e host
  is same-origin, so the config GET carries no `Origin` and the widget mounts; the submit is refused).

- [ ] **Step 11: Commit**

```bash
git checkout apps/web/next-env.d.ts
git add apps/web/lib/widget supabase/migrations/20260928000100_blocked_origin.sql
git commit -m "fix(web): lenient origin matching, record refused origins, 800 ms bot guard"
```

---

### Task 2: Blocked-origin notice with one-click Allow (dashboard)

**Files:**
- Modify: `apps/web/lib/dashboard/projects.ts` (`ProjectDetail` + `getProject` select)
- Modify: `apps/web/lib/dashboard/settings.ts` (`allowBlockedOrigin`)
- Modify: `apps/web/app/app/actions.ts` (`allowBlockedOriginAction`)
- Create: `apps/web/components/app/blocked-origin-notice.tsx`, `apps/web/components/app/allow-origin-button.tsx`
- Modify: `apps/web/app/app/p/[projectId]/install/page.tsx`, `apps/web/app/app/p/[projectId]/page.tsx`,
  `apps/web/app/app/p/[projectId]/settings/page.tsx` (form key)
- Modify: `apps/web/messages/en.json`, `apps/web/messages/ru.json`
- Test: `apps/web/lib/dashboard/settings.test.ts`, `apps/web/lib/dashboard/projects.test.ts`,
  `apps/web/e2e/dashboard.spec.ts`

**Interfaces:**
- Consumes: `originAllowed(origin, allowed)` from `@/lib/widget/origins`; columns `blocked_origin`,
  `blocked_origin_at` (Task 1).
- Produces: `ProjectDetail.blocked_origin: string | null`, `ProjectDetail.blocked_origin_at: string | null` (ISO);
  `allowBlockedOrigin(deps: DashDeps, userId: string, projectId: string): Promise<ActionResult>`;
  `allowBlockedOriginAction(projectId: string): Promise<ActionResult>`.

- [ ] **Step 1: Write failing tests.**

`apps/web/lib/dashboard/projects.test.ts` — in `'lists and reads only the user’s own projects'`, extend the first
`toMatchObject` with `blocked_origin: null, blocked_origin_at: null`.

`apps/web/lib/dashboard/settings.test.ts` — import `allowBlockedOrigin` from `./settings` and add:

```ts
describe('allowBlockedOrigin', () => {
  async function blockedProject(db: TestDb, origins: string, blocked: string) {
    const owner = await createUser(db);
    const project = await createProject(db, owner);
    await db.query(
      `update public.projects set allowed_origins = $2::text[], blocked_origin = $3,
         blocked_origin_at = now() where id = $1`,
      [project.id, origins === '' ? [] : origins.split(','), blocked],
    );
    return { owner, project };
  }

  it('adds the blocked origin to the list and clears the notice', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const { owner, project } = await blockedProject(db, 'https://shop.example', 'https://evil.example');
      expect(await allowBlockedOrigin(deps, owner, project.id)).toEqual({ ok: true });
      const detail = await getProject(deps, owner, project.id);
      expect(detail?.allowed_origins).toEqual(['https://shop.example', 'https://evil.example']);
      expect(detail?.blocked_origin).toBeNull();
      expect(detail?.blocked_origin_at).toBeNull();
    }));

  it('only clears the notice when the list already allows the origin', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const { owner, project } = await blockedProject(
        db,
        'https://shop.example',
        'https://www.shop.example',
      );
      expect(await allowBlockedOrigin(deps, owner, project.id)).toEqual({ ok: true });
      const detail = await getProject(deps, owner, project.id);
      expect(detail?.allowed_origins).toEqual(['https://shop.example']);
      expect(detail?.blocked_origin).toBeNull();
    }));

  it('refuses when the list is full', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const full = Array.from({ length: 20 }, (_, i) => `https://s${i}.example`).join(',');
      const { owner, project } = await blockedProject(db, full, 'https://evil.example');
      expect(await allowBlockedOrigin(deps, owner, project.id)).toEqual({
        ok: false,
        error: 'settings.tooManyOrigins',
      });
    }));

  it("cannot touch another user's project", () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const { project } = await blockedProject(db, 'https://shop.example', 'https://evil.example');
      const stranger = await createUser(db);
      expect(await allowBlockedOrigin(deps, stranger, project.id)).toEqual({
        ok: false,
        error: 'errors.notFound',
      });
    }));
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @bugping/web exec vitest run lib/dashboard/settings.test.ts lib/dashboard/projects.test.ts`
Expected: FAIL — `allowBlockedOrigin` is not exported; `blocked_origin` missing from `getProject`.

- [ ] **Step 3: Implement the data layer.**

`apps/web/lib/dashboard/projects.ts` — add to `ProjectDetail`:

```ts
  /** The last origin the allow-list refused, or null. */
  blocked_origin: string | null;
  /** ISO timestamp of that refusal, or null. */
  blocked_origin_at: string | null;
```

and in `getProject` select `blocked_origin, blocked_origin_at` after `widget_seen_at`, type the row as
`Omit<ProjectDetail, 'widget_seen_at' | 'blocked_origin_at'> & { widget_seen_at: Date | string | null;
blocked_origin_at: Date | string | null }`, and return
`blocked_origin_at: row.blocked_origin_at == null ? null : new Date(row.blocked_origin_at).toISOString()` next to the
existing `widget_seen_at` conversion.

`apps/web/lib/dashboard/settings.ts` — import `originAllowed` from `'../widget/origins'` and add:

```ts
/** Adds the project's last refused origin to its allow-list (unless already allowed) and clears the notice. */
export async function allowBlockedOrigin(
  deps: DashDeps,
  userId: string,
  projectId: string,
): Promise<ActionResult> {
  const project = await getProject(deps, userId, projectId);
  if (!project) return { ok: false, error: 'errors.notFound' };
  let origins = project.allowed_origins;
  const blocked = project.blocked_origin;
  if (blocked && !originAllowed(blocked, origins)) {
    const next = normalizeOrigins([...origins, blocked]);
    if (typeof next === 'string') return { ok: false, error: next };
    origins = next;
  }
  await withUser(deps.db, userId, (tx) =>
    tx.query(
      `update public.projects
         set allowed_origins = $2::text[], blocked_origin = null, blocked_origin_at = null
       where id = $1`,
      [project.id, origins],
    ),
  );
  return { ok: true };
}
```

`apps/web/app/app/actions.ts` — import `allowBlockedOrigin` with the other settings imports and add:

```ts
export async function allowBlockedOriginAction(projectId: string): Promise<ActionResult> {
  const user = await requireUser();
  const result = await allowBlockedOrigin(await getDeps(), user.id, projectId);
  revalidatePath('/app', 'layout');
  return result;
}
```

`apps/web/app/app/p/[projectId]/settings/page.tsx` — exclude the new fields from the form key so a fresh refusal
never resets the form mid-edit:

```ts
  // Not settings: leave them out of the key so a fresh "seen"/"blocked" timestamp never resets the form.
  const {
    widget_seen_at: _seen,
    blocked_origin: _blocked,
    blocked_origin_at: _blockedAt,
    ...settings
  } = project;
```

- [ ] **Step 4: Run the data tests** — same command as Step 2. Expected: PASS.

- [ ] **Step 5: Messages.** Add a top-level `blockedOrigin` namespace and update two hints.

`en.json`:

```json
  "blockedOrigin": {
    "title": "The widget is blocked on {origin}",
    "hint": "Reports from this site were refused {time}: it is not in your allowed websites.",
    "allow": "Allow this site",
    "settings": "Settings"
  },
```

`ru.json`:

```json
  "blockedOrigin": {
    "title": "Виджет заблокирован на {origin}",
    "hint": "Отчёты с этого сайта отклонены {time}: его нет в списке разрешённых сайтов.",
    "allow": "Разрешить этот сайт",
    "settings": "Настройки"
  },
```

Replace `projects.siteUrlHint`:
- en: `"Reports are accepted only from this site (with or without www). Leave empty to accept them from any site."`
- ru: `"Отчёты будут приниматься только с этого сайта (с www и без). Оставьте пустым, чтобы принимать с любого сайта."`

Replace `settings.originsHint`:
- en: `"One per line. www and non-www, http and https count as one site. Leave empty to accept feedback from any site."`
- ru: `"По одному в строке. Адреса с www и без, http и https считаются одним сайтом. Оставьте пустым, чтобы принимать отзывы с любого сайта."`

- [ ] **Step 6: Components.**

`apps/web/components/app/allow-origin-button.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { allowBlockedOriginAction } from '@/app/app/actions';
import { Button } from '@/components/ui/button';

export function AllowOriginButton({ projectId }: { projectId: string }) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      disabled={pending}
      data-testid="blocked-origin-allow"
      onClick={() =>
        start(async () => {
          const result = await allowBlockedOriginAction(projectId);
          if (!result.ok) toast.error(t(result.error));
          router.refresh();
        })
      }
    >
      {t('blockedOrigin.allow')}
    </Button>
  );
}
```

`apps/web/components/app/blocked-origin-notice.tsx`:

```tsx
import { ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { cn } from 'cn';
import { buttonVariants } from '@/components/ui/button';
import { originAllowed } from '@/lib/widget/origins';
import { AllowOriginButton } from './allow-origin-button';

/** Warns that the allow-list refused a site, until it is allowed or the list changes to allow it. */
export function BlockedOriginNotice({
  projectId,
  blockedOrigin,
  blockedAt,
  allowedOrigins,
}: {
  projectId: string;
  blockedOrigin: string | null;
  blockedAt: string | null;
  allowedOrigins: readonly string[];
}) {
  const t = useTranslations('blockedOrigin');
  const format = useFormatter();
  if (!blockedOrigin || !blockedAt || originAllowed(blockedOrigin, allowedOrigins)) return null;
  return (
    <section
      role="status"
      data-testid="blocked-origin-notice"
      className="flex flex-col gap-3 rounded-xl border border-amber-600/30 bg-amber-500/10 p-4 sm:flex-row sm:items-center dark:border-amber-400/30 dark:bg-amber-400/10"
    >
      <ShieldAlert className="size-5 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold break-all">{t('title', { origin: blockedOrigin })}</p>
        <p className="text-xs text-muted-foreground">
          {t('hint', { time: format.relativeTime(new Date(blockedAt)) })}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <AllowOriginButton projectId={projectId} />
        <Link
          href={`/app/p/${projectId}/settings`}
          className={cn(buttonVariants({ size: 'sm', variant: 'outline' }))}
        >
          {t('settings')}
        </Link>
      </div>
    </section>
  );
}
```

Render it on the Install page right after `<PageHeader … />` and on the Overview page right after the `<header>`:

```tsx
      <BlockedOriginNotice
        projectId={project.id}
        blockedOrigin={project.blocked_origin}
        blockedAt={project.blocked_origin_at}
        allowedOrigins={project.allowed_origins}
      />
```

- [ ] **Step 7: E2E** — add to `apps/web/e2e/dashboard.spec.ts`:

```ts
test('a refused site shows a notice that allows it in one click', async ({ page, context }) => {
  await login(page);
  await page.goto('/app');
  await expect(page).toHaveURL(/\/app\/new$/);
  await page.getByTestId('project-name').fill('E2E Blocked');
  await page.getByTestId('project-site').fill('allowed.example');
  await page.getByTestId('project-create').click();
  await expect(page).toHaveURL(/\/app\/p\/[0-9a-f-]+\/install$/);
  const snippet = await page.getByTestId('install-snippet').textContent();
  const key = /data-project-id="(pk_[A-Za-z0-9]{16})"/.exec(snippet ?? '')![1]!;

  const host = await context.newPage();
  await host.goto(`/e2e-host?key=${key}`);
  await host.locator('[data-bugping] .bp-trigger').click();
  await host.locator('.bp-card[data-type="general"]').click();
  await host.locator('.bp-message').fill('E2E: from a refused site');
  await host.waitForTimeout(900); // bot guard
  await host.locator('.bp-send').click();
  await expect(host.locator('.bp-status')).toHaveText("Couldn't send. Try again later.");
  await host.close();

  const notice = page.getByTestId('blocked-origin-notice');
  await expect
    .poll(
      async () => {
        await page.reload();
        return notice.count();
      },
      { timeout: 10_000 },
    )
    .toBe(1);
  await expect(notice).toContainText(new URL(page.url()).origin);
  await page.getByTestId('blocked-origin-allow').click();
  await expect(notice).toHaveCount(0);

  await submitFeedback(context, key, 'E2E: allowed now');
  await expect(page.getByTestId('install-received')).toBeVisible({ timeout: 15_000 });
});
```

- [ ] **Step 8: Full checks** — `pnpm typecheck`, `pnpm --filter @bugping/web test`, `pnpm format:check`,
  `pnpm --filter @bugping/web e2e`. Look at the notice in light and dark on the Install page at 390 and 1280 px
  (Playwright screenshot) and fix overflow if any.

- [ ] **Step 9: Commit**

```bash
git checkout apps/web/next-env.d.ts
git add apps/web/lib/dashboard apps/web/app/app apps/web/components/app/blocked-origin-notice.tsx \
  apps/web/components/app/allow-origin-button.tsx apps/web/messages apps/web/e2e/dashboard.spec.ts
git commit -m "feat(web): show refused sites on Install and Overview with a one-click Allow"
```

---

### Task 3: Security headers and a configurable client IP

**Files:**
- Modify: `apps/web/next.config.ts`
- Modify: `apps/web/lib/http.ts` (`clientIp(headers, trustedHeader?)`, moved `rateLimitIdentity`)
- Modify: `apps/web/lib/widget/submit.ts` (import `rateLimitIdentity` from `../http`, pass the header)
- Modify: `apps/web/lib/env.ts` (`CLIENT_IP_HEADER`)
- Modify: `docs/deploy.md`
- Test: `apps/web/lib/http.test.ts`, `apps/web/lib/widget/submit.test.ts`, `apps/web/lib/env.test.ts`,
  create `apps/web/e2e/headers.spec.ts`

**Interfaces:**
- Produces: `clientIp(headers: Headers, trustedHeader?: string): string`;
  `rateLimitIdentity(ip: string): string` exported from `apps/web/lib/http.ts` (no longer from `submit.ts`);
  `Env.CLIENT_IP_HEADER?: string`.

- [ ] **Step 1: Move `rateLimitIdentity`.** Cut the function (and its doc comment) from `lib/widget/submit.ts` into
  `lib/http.ts` with `import { isIPv4, isIPv6 } from 'node:net';`. In `submit.ts` import it from `'../http'` and remove
  the now-unused `node:net` import. Move the `describe('rateLimitIdentity', …)` block from `submit.test.ts` into
  `http.test.ts` (import from `./http`) and drop `rateLimitIdentity` from the `submit.test.ts` import.

- [ ] **Step 2: Write failing tests.**

`apps/web/lib/http.test.ts` — add:

```ts
  it('reads only the trusted header when one is configured', () => {
    const headers = new Headers({
      'cf-connecting-ip': '198.51.100.20',
      'x-forwarded-for': '203.0.113.7',
    });
    expect(clientIp(headers, 'cf-connecting-ip')).toBe('198.51.100.20');
    expect(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.7' }), 'cf-connecting-ip')).toBe(
      'unknown',
    );
    expect(clientIp(new Headers({ 'x-client-ip': ' 192.0.2.1, 10.0.0.1' }), 'x-client-ip')).toBe(
      '192.0.2.1',
    );
  });
```

`apps/web/lib/env.test.ts` — add (use the file's existing valid-env fixture; `VALID_ENV` from `@/test/fixtures`):

```ts
  it('accepts an optional lower-case CLIENT_IP_HEADER', () => {
    expect(parseEnv({ ...VALID_ENV, CLIENT_IP_HEADER: 'cf-connecting-ip' }).CLIENT_IP_HEADER).toBe(
      'cf-connecting-ip',
    );
    expect(parseEnv({ ...VALID_ENV, CLIENT_IP_HEADER: '' }).CLIENT_IP_HEADER).toBeUndefined();
    expect(() => parseEnv({ ...VALID_ENV, CLIENT_IP_HEADER: 'CF Connecting IP' })).toThrow(
      /CLIENT_IP_HEADER/,
    );
  });
```

`apps/web/lib/widget/submit.test.ts` — add:

```ts
  it('rate limits by the trusted IP header when configured', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const trusted = { ...deps, env: { ...deps.env, CLIENT_IP_HEADER: 'cf-connecting-ip' } };
      const project = await freeProject(db);
      for (let i = 0; i < 5; i++) {
        const res = await handleSubmit(
          trusted,
          request(payload(project.public_key), {
            ip: `203.0.113.${i + 10}`,
            headers: { 'cf-connecting-ip': '198.51.100.20' },
          }),
        );
        expect(res.status).toBe(201);
      }
      const spoofed = await handleSubmit(
        trusted,
        request(payload(project.public_key), {
          ip: '203.0.113.99',
          headers: { 'cf-connecting-ip': '198.51.100.20' },
        }),
      );
      expect(spoofed.status).toBe(429);
    }));
```

- [ ] **Step 3: Run to verify they fail**

Run: `pnpm --filter @bugping/web exec vitest run lib/http.test.ts lib/env.test.ts lib/widget/submit.test.ts`
Expected: FAIL — `clientIp` ignores the second argument; `CLIENT_IP_HEADER` unknown.

- [ ] **Step 4: Implement.**

`apps/web/lib/http.ts`:

```ts
/**
 * The client's IP. With `trustedHeader` (e.g. `cf-connecting-ip` behind Cloudflare) only that header counts;
 * without it, the first x-forwarded-for hop, then x-real-ip — both set by Vercel, spoofable anywhere else.
 */
export function clientIp(headers: Headers, trustedHeader?: string): string {
  if (trustedHeader) return headers.get(trustedHeader)?.split(',')[0]?.trim() || 'unknown';
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || headers.get('x-real-ip')?.trim() || 'unknown';
}
```

`apps/web/lib/env.ts` — add to `EnvSchema` after `IP_HASH_SALT`:

```ts
  /** Header holding the client IP behind a proxy that sets it (e.g. `cf-connecting-ip`); unset on Vercel. */
  CLIENT_IP_HEADER: optionalWhenEmpty(z.string().regex(/^[a-z0-9-]+$/)),
```

`apps/web/lib/widget/submit.ts` — `env: Pick<Env, 'IP_HASH_SALT' | 'CLIENT_IP_HEADER'>` in `SubmitDeps`, and
`clientIp(request.headers, deps.env.CLIENT_IP_HEADER)`.

- [ ] **Step 5: Run the unit tests** — Step 3 command. Expected: PASS.

- [ ] **Step 6: Headers.** In `apps/web/next.config.ts` add `poweredByHeader: false` to the config, a module-level

```ts
/** Sent on every response; framing rules differ between the demo frames and everything else. */
const BASE_SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // No includeSubDomains: the production host is a shared *.vercel.app subdomain today.
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
];
```

and as the first entries of `headers()`:

```ts
      {
        // Every page except the landing demo's frames: never framed by another site (clickjacking).
        source: '/:path((?!demo/).*)',
        headers: [
          ...BASE_SECURITY_HEADERS,
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
          },
        ],
      },
```

and extend the existing `/demo/:path*` entry's `headers` with `...BASE_SECURITY_HEADERS` (keep its
`frame-ancestors 'self'`).

- [ ] **Step 7: E2E for headers** — create `apps/web/e2e/headers.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('pages refuse framing and send the security headers', async ({ request }) => {
  for (const path of ['/', '/login', '/privacy']) {
    const headers = (await request.get(path)).headers();
    expect(headers['x-frame-options'], path).toBe('DENY');
    expect(headers['content-security-policy'], path).toBe(
      "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
    );
    expect(headers['x-content-type-options'], path).toBe('nosniff');
    expect(headers['referrer-policy'], path).toBe('strict-origin-when-cross-origin');
    expect(headers['strict-transport-security'], path).toBe('max-age=31536000');
    expect(headers['x-powered-by'], path).toBeUndefined();
  }
});

test('the demo frames may only be framed by the landing itself', async ({ request }) => {
  const headers = (await request.get('/demo/shop')).headers();
  expect(headers['x-frame-options']).toBeUndefined();
  expect(headers['content-security-policy']).toBe("frame-ancestors 'self'");
  expect(headers['x-content-type-options']).toBe('nosniff');
});
```

Run: `pnpm --filter @bugping/web e2e -- headers.spec.ts`. If `/` lacks the headers (the negative-lookahead source
does not match the root path), add a second entry with `source: '/'` and the same headers, and re-run. The whole
landing e2e must stay green: the demo iframes load `/demo/*` only.

- [ ] **Step 8: Docs** — in `docs/deploy.md` §2 step 5 (environment variables), add a bullet after
  `SECRETS_ENCRYPTION_KEY, IP_HASH_SALT, CRON_SECRET`:

```md
   - `CLIENT_IP_HEADER` (optional): leave unset on Vercel (the client IP comes from `x-forwarded-for`, which Vercel
     overwrites). Behind Cloudflare on your own server set `cf-connecting-ip`, and let only Cloudflare's IP ranges
     reach the server — otherwise anyone can send that header and dodge the rate limits.
```

- [ ] **Step 9: Full checks** — `pnpm typecheck`, `pnpm --filter @bugping/web test`, `pnpm format:check`,
  `pnpm --filter @bugping/web e2e`.

- [ ] **Step 10: Commit**

```bash
git checkout apps/web/next-env.d.ts
git add apps/web/next.config.ts apps/web/lib/http.ts apps/web/lib/http.test.ts apps/web/lib/env.ts \
  apps/web/lib/env.test.ts apps/web/lib/widget/submit.ts apps/web/lib/widget/submit.test.ts \
  apps/web/e2e/headers.spec.ts docs/deploy.md
git commit -m "fix(web): security headers everywhere and a configurable client IP header"
```

---

### Task 4: Return to the intended page after sign-in; magic-link rate limit

**Files:**
- Create: `apps/web/lib/auth/next.ts`, `apps/web/lib/auth/next.test.ts`
- Create: `apps/web/lib/auth/magic-link-limit.ts`, `apps/web/lib/auth/magic-link-limit.test.ts`
- Modify: `apps/web/proxy.ts`, `apps/web/app/auth/callback/route.ts`, `apps/web/app/login/page.tsx`,
  `apps/web/app/login/actions.ts`
- Modify: `apps/web/messages/en.json`, `apps/web/messages/ru.json` (`auth.rateLimited`)
- Test: `apps/web/e2e/login.spec.ts`

**Interfaces:**
- Consumes: `clientIp(headers, trustedHeader?)`, `rateLimitIdentity(ip)` from `@/lib/http` (Task 3);
  `Env.CLIENT_IP_HEADER` (Task 3).
- Produces: `NEXT_COOKIE = 'bp_next'`, `NEXT_COOKIE_MAX_AGE = 600`, `safeNext(value: string | null | undefined):
  string | null`; `MAGIC_LINK_LIMITS`, `magicLinkLimited(db: Db, salt: string, ip: string, email: string):
  Promise<boolean>`.

- [ ] **Step 1: Write failing unit tests.**

`apps/web/lib/auth/next.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { safeNext } from './next';

describe('safeNext', () => {
  it('accepts dashboard paths with their query', () => {
    expect(safeNext('/app')).toBe('/app');
    expect(safeNext('/app/billing')).toBe('/app/billing');
    expect(safeNext('/app/p/1/feedback?status=new')).toBe('/app/p/1/feedback?status=new');
    expect(safeNext('/app?x=1')).toBe('/app?x=1');
  });

  it('rejects anything that could leave the dashboard', () => {
    for (const value of [
      undefined,
      null,
      '',
      '/',
      '/login',
      '/apps',
      '//evil.com',
      '/app//evil.com',
      '/\\evil.com',
      '/app/\\evil',
      'https://evil.com/app',
      '/app/\u0000',
      '/app/\n',
      `/app/${'a'.repeat(600)}`,
    ]) {
      expect(safeNext(value), String(value)).toBeNull();
    }
  });
});
```

`apps/web/lib/auth/magic-link-limit.test.ts`:

```ts
import { withTx } from '@bugping/db-tests/harness';
import { describe, expect, it } from 'vitest';
import { magicLinkLimited } from './magic-link-limit';

const SALT = 'test-salt-0123456789abcdef';

describe('magicLinkLimited', () => {
  it('allows 5 requests per IP per window', () =>
    withTx(async (db) => {
      for (let i = 0; i < 5; i++) {
        expect(await magicLinkLimited(db, SALT, '203.0.113.7', `u${i}@example.com`)).toBe(false);
      }
      expect(await magicLinkLimited(db, SALT, '203.0.113.7', 'u9@example.com')).toBe(true);
      expect(await magicLinkLimited(db, SALT, '198.51.100.1', 'u8@example.com')).toBe(false);
    }));

  it('allows 3 requests per address per window, case-insensitively', () =>
    withTx(async (db) => {
      expect(await magicLinkLimited(db, SALT, '203.0.113.1', 'ann@example.com')).toBe(false);
      expect(await magicLinkLimited(db, SALT, '203.0.113.2', 'Ann@Example.com')).toBe(false);
      expect(await magicLinkLimited(db, SALT, '203.0.113.3', 'ANN@example.com')).toBe(false);
      expect(await magicLinkLimited(db, SALT, '203.0.113.4', 'ann@example.com')).toBe(true);
    }));

  it('stores only hashes of the IP and the address', () =>
    withTx(async (db) => {
      await magicLinkLimited(db, SALT, '203.0.113.7', 'ann@example.com');
      const rows = await db.query<{ key: string }>(
        `select key from public.rate_limits where key like 'magic-%' order by key`,
      );
      expect(rows).toHaveLength(2);
      for (const { key } of rows) {
        expect(key).toMatch(/^magic-(ip|email):[0-9a-f]{64}$/);
      }
    }));
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @bugping/web exec vitest run lib/auth/next.test.ts lib/auth/magic-link-limit.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the helpers.**

`apps/web/lib/auth/next.ts`:

```ts
/** Where to go after signing in; set when an anonymous visitor is sent from /app/* to /login. */
export const NEXT_COOKIE = 'bp_next';
export const NEXT_COOKIE_MAX_AGE = 600;

/** A post-sign-in target: dashboard paths only, never another host or a protocol-relative URL. */
export function safeNext(value: string | null | undefined): string | null {
  if (!value || value.length > 512) return null;
  if (/[\u0000-\u001f\u007f\\]/.test(value) || value.includes('//')) return null;
  if (value === '/app' || value.startsWith('/app/') || value.startsWith('/app?')) return value;
  return null;
}
```

`apps/web/lib/auth/magic-link-limit.ts`:

```ts
import { createHash } from 'node:crypto';
import type { Db } from '../db/types';
import { rateLimitIdentity } from '../http';

export const MAGIC_LINK_LIMITS = {
  ip: { max: 5, windowSeconds: 900 },
  email: { max: 3, windowSeconds: 900 },
} as const;

const digest = (value: string, salt: string) =>
  createHash('sha256').update(value + salt).digest('hex');

/** Counts one magic-link request; true when its IP or its address is over the limit. */
export async function magicLinkLimited(
  db: Db,
  salt: string,
  ip: string,
  email: string,
): Promise<boolean> {
  const hit = async (key: string, limit: { max: number; windowSeconds: number }) => {
    const [row] = await db.query<{ limited: boolean }>(
      'select public.hit_rate_limit($1, $2, $3) as limited',
      [key, limit.max, limit.windowSeconds],
    );
    return Boolean(row?.limited);
  };
  const byIp = await hit(`magic-ip:${digest(rateLimitIdentity(ip), salt)}`, MAGIC_LINK_LIMITS.ip);
  const byEmail = await hit(
    `magic-email:${digest(email.toLowerCase(), salt)}`,
    MAGIC_LINK_LIMITS.email,
  );
  return byIp || byEmail;
}
```

- [ ] **Step 4: Run the unit tests** — Step 2 command. Expected: PASS.

- [ ] **Step 5: Wire the cookie.**

`apps/web/proxy.ts` — import `NEXT_COOKIE, NEXT_COOKIE_MAX_AGE, safeNext` from `'@/lib/auth/next'`; in the anonymous
`/app` branch, before `return login;`:

```ts
    const next = safeNext(pathname + request.nextUrl.search);
    if (next) {
      login.cookies.set(NEXT_COOKIE, next, {
        maxAge: NEXT_COOKIE_MAX_AGE,
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: request.nextUrl.protocol === 'https:',
      });
    }
```

`apps/web/app/auth/callback/route.ts` — import `NEXT_COOKIE, safeNext` from `'@/lib/auth/next'`; replace
`return NextResponse.redirect(new URL('/app', url.origin));` with:

```ts
      const next = safeNext(store.get(NEXT_COOKIE)?.value) ?? '/app';
      store.delete(NEXT_COOKIE);
      return NextResponse.redirect(new URL(next, url.origin));
```

(`store` is the `await cookies()` already read in that block.)

`apps/web/app/login/page.tsx` — import `cookies` from `'next/headers'` and `NEXT_COOKIE, safeNext` from
`'@/lib/auth/next'`; replace the signed-in redirect with:

```ts
  if (await getSessionUser()) {
    // Server components cannot delete cookies; the cookie expires on its own.
    redirect(safeNext((await cookies()).get(NEXT_COOKIE)?.value) ?? '/app');
  }
```

- [ ] **Step 6: Rate-limit the magic link.** In `apps/web/app/login/actions.ts` import `headers` from
  `'next/headers'`, `magicLinkLimited` from `'@/lib/auth/magic-link-limit'`, `getDeps` from `'@/lib/deps'` and
  `clientIp` from `'@/lib/http'`. After the test-mode early return (e2e reuses one dev server across runs, so the
  limit would trip repeated local runs; the unit tests cover it), add:

```ts
  const env = getEnv();
  const ip = clientIp(await headers(), env.CLIENT_IP_HEADER);
  if (await magicLinkLimited((await getDeps()).db, env.IP_HASH_SALT, ip, email.data)) {
    return { status: 'error', error: 'auth.rateLimited' };
  }
```

Messages — `auth.rateLimited`: en `"Too many attempts. Try again in a few minutes."`, ru
`"Слишком много попыток. Попробуйте через несколько минут."`.

- [ ] **Step 7: E2E** — add to `apps/web/e2e/login.spec.ts`:

```ts
test('signing in returns to the dashboard page that asked for it', async ({ page }) => {
  await page.goto('/app/billing');
  await expect(page).toHaveURL(/\/login$/);
  const email = `next-${Date.now()}@e2e.dev`;
  expect((await page.request.post('/api/e2e-test/login', { data: { email } })).ok()).toBe(true);
  await page.goto('/login');
  await expect(page).toHaveURL(/\/app\/billing$/);
});
```

- [ ] **Step 8: Full checks** — `pnpm typecheck`, `pnpm --filter @bugping/web test`, `pnpm format:check`,
  `pnpm --filter @bugping/web e2e` twice in a row (both green).

- [ ] **Step 9: Commit**

```bash
git checkout apps/web/next-env.d.ts
git add apps/web/lib/auth apps/web/proxy.ts apps/web/app/auth/callback/route.ts apps/web/app/login \
  apps/web/messages apps/web/e2e/login.spec.ts
git commit -m "fix(web): return to the intended page after sign-in and rate-limit magic links"
```
