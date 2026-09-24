# Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesigned Bugping dashboard: new shell (plan card, back-to-site, sun/moon theme toggle with cross-fade), per-project Overview page, redesigned feedback feed, empty states, restyled pages, light motion — light and dark themes.

**Architecture:** Data first (migration + widget-seen ping, overview/status-count queries), then the theme toggle and motion primitives, then the shell, then Overview, feed, other pages, and finally end-to-end tests. Server components fetch data through `lib/dashboard/*`; small client components handle the toggle, count-up and bar animations.

**Tech Stack:** Next.js 16 App Router (server components, server actions), React 19, Tailwind v4 + shadcn/ui on Base UI (no `asChild`; use `render={<Link/>}` + `nativeButton={false}`), next-intl (en/ru, ICU — escape literal `{`, `}`, `<`), next-themes, lucide-react, postgres via `lib/db` (`withUser` = RLS as the user; `deps.db` = server connection), Vitest + PGlite, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-24-dashboard-redesign-design.md`

**Mockups (local, git-ignored — open in a browser):** `.superpowers/brainstorm/844-1790252839/content/dashboard-shell.html` (option A: light shell + Overview), `theme-toggle-v3.html` (toggle + 0.8 s cross-fade), `feed.html` (feed, detail panel, empty states).

## Global Constraints

- English code/comments/commits/docs; commit trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never read, print, edit or commit `apps/web/.env.local`. Never run `supabase start` / `supabase db push` (the owner applies the migration to the cloud DB with consent).
- Both themes everywhere: use theme tokens (`bg-background`, `bg-card`, `bg-muted`, `bg-sidebar`, `text-muted-foreground`, `border-border`, `bg-primary`, `text-brand` …); any literal colour needs an explicit light/dark pair.
- Headings: `h1` = `text-2xl font-extrabold tracking-tight` (Manrope 800).
- Type colours: pills — bug `bg-red-500/10 text-red-700 dark:text-red-300`, idea `bg-amber-500/15 text-amber-800 dark:text-amber-300`, general `bg-stone-500/15 text-stone-700 dark:text-stone-300`; chart — bug `var(--primary)`, idea `#F5B400` (dark `#E0A800`), general `#8A7F7B` (dark `#A8998F`).
- Motion: 200–500 ms (theme cross-fade 800 ms, `cubic-bezier(.4,0,.2,1)`), transform/opacity only (plus colors for the theme fallback); all disabled under `prefers-reduced-motion: reduce`.
- Keep every existing `data-testid`. New ones: `nav-overview`, `nav-back-to-site`, `theme-toggle`, `plan-card`, `nav-feedback-count`, `overview-checklist`, `checklist-widget`, `checklist-notifications`, `checklist-feedback`, `stat-new`, `stat-resolved`, `stat-last30`, `stat-limit`, `overview-chart`, `overview-recent`, `overview-connections`, `status-tab-new|resolved|archived`, `empty-state`, `feedback-reply`.
- next-intl messages in `apps/web/messages/en.json` and `ru.json` stay in parity (`messages.test.ts`).
- Verification set (repo root): `pnpm typecheck`, `pnpm test`, `pnpm format:check`; UI tasks also `pnpm --filter @bugping/web e2e`. `next dev`/e2e rewrite `apps/web/next-env.d.ts` — `git checkout apps/web/next-env.d.ts` before committing; never commit `.claude/`.

---

### Task 1: `widget_seen_at` migration and the config ping

**Files:**
- Create: `supabase/migrations/20260925000100_widget_seen_at.sql`
- Modify: `apps/web/lib/widget/config.ts`, `apps/web/app/api/v1/widget/config/route.ts` (pass `after`)
- Test: `apps/web/lib/widget/config.test.ts`

**Interfaces:**
- Produces: column `public.projects.widget_seen_at timestamptz null`; `markWidgetSeen(db: Db, projectId: string): Promise<void>`; `handleConfig(deps: { db: Db; env: Pick<Env,'NEXT_PUBLIC_APP_URL'>; after?: (task: () => Promise<void>) => void }, request: Request)`.

- [ ] **Step 1: Failing tests** — add to `config.test.ts`:

```ts
describe('widget seen ping', () => {
  it('marks the project as seen on a successful config request', () =>
    withTx(async (db) => {
      const project = await projectWithSettings(db, false);
      const tasks: Array<Promise<void>> = [];
      await handleConfig(
        { db, env: { NEXT_PUBLIC_APP_URL: 'https://app.example' }, after: (t) => void tasks.push(t()) },
        new Request(`https://bugping.app/api/v1/widget/config?key=${project.public_key}`),
      );
      await Promise.all(tasks);
      const [row] = await db.query<{ seen: boolean }>(
        'select widget_seen_at is not null as seen from public.projects where id = $1',
        [project.id],
      );
      expect(row!.seen).toBe(true);
    }));

  it('rewrites at most once per hour', () =>
    withTx(async (db) => {
      const project = await projectWithSettings(db, false);
      await db.query(`update public.projects set widget_seen_at = now() - interval '10 minutes' where id = $1`, [project.id]);
      await markWidgetSeen(db, project.id);
      const [recent] = await db.query<{ age: number }>(
        `select extract(epoch from now() - widget_seen_at)::int as age from public.projects where id = $1`, [project.id]);
      expect(recent!.age).toBeGreaterThanOrEqual(590);
      await db.query(`update public.projects set widget_seen_at = now() - interval '2 hours' where id = $1`, [project.id]);
      await markWidgetSeen(db, project.id);
      const [fresh] = await db.query<{ age: number }>(
        `select extract(epoch from now() - widget_seen_at)::int as age from public.projects where id = $1`, [project.id]);
      expect(fresh!.age).toBeLessThan(5);
    }));

  it('never fails the config response when the ping fails', async () => {
    const failingAfter = (task: () => Promise<void>) => void task().catch(() => {});
    // db whose update throws but whose project lookup works: wrap a real TestDb
    await withTx(async (db) => {
      const project = await projectWithSettings(db, false);
      const flaky = {
        ...db,
        query: async (sql: string, params?: unknown[]) => {
          if (/widget_seen_at/.test(sql)) throw new Error('db down');
          return db.query(sql, params as never);
        },
      } as typeof db;
      const res = await handleConfig(
        { db: flaky, env: { NEXT_PUBLIC_APP_URL: 'https://app.example' }, after: failingAfter },
        new Request(`https://bugping.app/api/v1/widget/config?key=${project.public_key}`),
      );
      expect(res.status).toBe(200);
    });
  });
});
```

(`projectWithSettings` returns the fixture project; if it lacks `public_key`, select it from `public.projects`.) Import `markWidgetSeen` from `./config`. Run `pnpm --filter @bugping/web exec vitest run lib/widget/config.test.ts` → FAIL.

- [ ] **Step 2: Migration**

```sql
-- When the embedded widget last fetched its config (set at most hourly by the config endpoint).
alter table public.projects add column widget_seen_at timestamptz;
```

- [ ] **Step 3: Implement** in `config.ts`:

```ts
/** Records that the widget loaded on a site; writes at most once per hour per project. */
export async function markWidgetSeen(db: Db, projectId: string): Promise<void> {
  await db.query(
    `update public.projects set widget_seen_at = now()
     where id = $1 and (widget_seen_at is null or widget_seen_at < now() - interval '1 hour')`,
    [projectId],
  );
}
```

In `handleConfig`, add `after?` to the deps type; after the project lookup succeeds and before returning:

```ts
const ping = () =>
  markWidgetSeen(deps.db, project.id).catch((error) => console.error('[widget/config] seen', error));
if (deps.after) deps.after(ping);
else void ping();
```

(`ProjectRow` must expose `id`; check `lib/widget/project.ts` and add `id` to its select if missing.) In `app/api/v1/widget/config/route.ts` pass the full deps (they include `after`).

- [ ] **Step 4:** Run the config tests → PASS; `pnpm --filter @bugping/db-tests test` → PASS (migration applies on PGlite); full verification set → pass.

- [ ] **Step 5: Commit** `feat: record when the widget was last seen on a site`.

---

### Task 2: Overview and feed data

**Files:**
- Create: `apps/web/lib/dashboard/overview.ts`, `apps/web/lib/dashboard/overview.test.ts`
- Modify: `apps/web/lib/dashboard/feedback.ts` (+ `statusCounts`, list meta fields), `apps/web/lib/dashboard/feedback.test.ts`

**Interfaces:**
- Consumes: `projects.widget_seen_at` (Task 1).
- Produces:

```ts
export interface Overview {
  counts: { new: number; resolved: number; last30: number };
  usage: { used: number; limit: number | null; pro: boolean };
  series: Array<{ day: string; bug: number; idea: number; general: number }>; // 30 entries, oldest first
  recent: Array<{ id: string; type: FeedbackType; status: FeedbackStatus; message: string; created_at: string; hidden: boolean }>;
  checklist: { widgetSeen: boolean; notifications: boolean; firstFeedback: boolean };
  widgetSeenAt: string | null;
  integrations: { telegram: boolean; discord: boolean };
}
export function getOverview(deps: DashDeps, userId: string, projectId: string): Promise<Overview | null>;
export function statusCounts(deps: DashDeps, userId: string, projectId: string): Promise<Record<FeedbackStatus, number>>;
```

`FeedbackListItem` gains `page: string | null` (URL path from `metadata.url`, e.g. `/checkout`), `browser: string | null`, `email: string | null`.

- [ ] **Step 1: Failing tests** (`overview.test.ts`, PGlite harness like `feedback.test.ts`):

```ts
import { createFeedback, createProject, createUser, grantPro, withTx, type TestDb } from '@bugping/db-tests/harness';
import { describe, expect, it } from 'vitest';
import { VALID_ENV } from '@/test/fixtures';
import { parseEnv } from '../env';
import { createMemoryStorage } from '../storage';
import { getOverview } from './overview';
import type { DashDeps } from './result';

const deps = (db: TestDb): DashDeps => ({ db, storage: createMemoryStorage(), env: parseEnv(VALID_ENV), fetch });

async function at(db: TestDb, id: string, daysAgo: number, type = 'bug', status = 'new') {
  await db.query(
    `update public.feedback set created_at = now() - ($2 || ' days')::interval, type = $3::feedback_type, status = $4::feedback_status where id = $1`,
    [id, String(daysAgo), type, status],
  );
}

describe('getOverview', () => {
  it('returns null for a project the user does not own', () =>
    withTx(async (db) => {
      const owner = await createUser(db);
      const other = await createUser(db);
      const project = await createProject(db, owner);
      expect(await getOverview(deps(db), other, project.id)).toBeNull();
    }));

  it('counts, zero-filled 30-day series by type and checklist', () =>
    withTx(async (db) => {
      const owner = await createUser(db);
      const project = await createProject(db, owner);
      const a = await createFeedback(db, project.id);
      const b = await createFeedback(db, project.id);
      const c = await createFeedback(db, project.id);
      const old = await createFeedback(db, project.id);
      await at(db, a, 0, 'bug', 'new');
      await at(db, b, 0, 'idea', 'resolved');
      await at(db, c, 3, 'general', 'new');
      await at(db, old, 40, 'bug', 'resolved');
      await db.query(`update public.feedback set created_at = created_at + interval '1 minute' where id = $1`, [a]);
      const o = (await getOverview(deps(db), owner, project.id))!;
      expect(o.counts).toEqual({ new: 2, resolved: 2, last30: 3 });
      expect(o.series).toHaveLength(30);
      expect(o.series.at(-1)).toMatchObject({ bug: 1, idea: 1, general: 0 });
      expect(o.series.at(-4)).toMatchObject({ bug: 0, idea: 0, general: 1 });
      expect(o.series.reduce((n, d) => n + d.bug + d.idea + d.general, 0)).toBe(3);
      expect(o.checklist).toEqual({ widgetSeen: false, notifications: false, firstFeedback: true });
      expect(o.recent.map((r) => r.id)).toEqual([a, b, c, old]);
    }));

  it('masks over-quota feedback for free owners but counts it', () =>
    withTx(async (db) => {
      const owner = await createUser(db);
      const project = await createProject(db, owner);
      await createFeedback(db, project.id, { message: 'secret', overQuota: true });
      const o = (await getOverview(deps(db), owner, project.id))!;
      expect(o.counts.new).toBe(1);
      expect(o.recent[0]).toMatchObject({ hidden: true, message: '' });
      await grantPro(db, owner);
      const pro = (await getOverview(deps(db), owner, project.id))!;
      expect(pro.recent[0]).toMatchObject({ hidden: false, message: 'secret' });
    }));

  it('reports widget seen and connected integrations', () =>
    withTx(async (db) => {
      const owner = await createUser(db);
      const project = await createProject(db, owner);
      await db.query('update public.projects set widget_seen_at = now() where id = $1', [project.id]);
      await db.query(
        `insert into public.integrations (project_id, kind, target, enabled) values ($1, 'telegram_shared', '1', true), ($1, 'discord', null, false)`,
        [project.id],
      );
      const o = (await getOverview(deps(db), owner, project.id))!;
      expect(o.checklist).toMatchObject({ widgetSeen: true, notifications: true });
      expect(o.integrations).toEqual({ telegram: true, discord: false });
      expect(o.widgetSeenAt).not.toBeNull();
    }));
});
```

(`a` is moved 1 minute forward so `a` and `b`, created the same day, have a deterministic order. If the day-0 `a` then crosses UTC midnight in CI, the series assertion for the last day still holds because `now()` is also "today". If the `integrations` insert needs other NOT NULL columns, follow `lib/dashboard/integrations.test.ts`.)

Add to `feedback.test.ts`: `statusCounts` counts visible rows only (an over-quota row for a free owner is excluded) and `listFeedback` returns `page` (`/checkout` for `metadata.url = 'https://shop.example/checkout?x=1'`), `browser`, `email`.

Run → FAIL.

- [ ] **Step 2: Implement `overview.ts`.** Ownership first (`ownsProject`), then use `deps.db` (server connection — it must see over-quota rows to count them; messages of hidden rows are masked in SQL):

```ts
const [head] = await deps.db.query<{
  new_count: number; resolved_count: number; last30: number; any_feedback: boolean;
  widget_seen_at: Date | string | null; telegram: boolean; discord: boolean;
}>(
  `select
     (select count(*) from public.feedback where project_id = $1 and status = 'new')::int as new_count,
     (select count(*) from public.feedback where project_id = $1 and status = 'resolved')::int as resolved_count,
     (select count(*) from public.feedback where project_id = $1 and created_at >= now() - interval '30 days')::int as last30,
     exists(select 1 from public.feedback where project_id = $1) as any_feedback,
     p.widget_seen_at,
     exists(select 1 from public.integrations i where i.project_id = $1 and i.enabled and i.kind in ('telegram_shared','telegram_custom')) as telegram,
     exists(select 1 from public.integrations i where i.project_id = $1 and i.enabled and i.kind = 'discord') as discord
   from public.projects p where p.id = $1`,
  [projectId],
);
const series = await deps.db.query<{ day: string; bug: number; idea: number; general: number }>(
  `select to_char(d, 'YYYY-MM-DD') as day,
          count(f.id) filter (where f.type = 'bug')::int as bug,
          count(f.id) filter (where f.type = 'idea')::int as idea,
          count(f.id) filter (where f.type = 'general')::int as general
   from generate_series((now() at time zone 'utc')::date - 29, (now() at time zone 'utc')::date, interval '1 day') d
   left join public.feedback f
     on f.project_id = $1 and (f.created_at at time zone 'utc')::date = d::date
   group by d order by d`,
  [projectId],
);
const recent = await deps.db.query<{ id: string; type: FeedbackType; status: FeedbackStatus; message: string; created_at: Date | string; hidden: boolean }>(
  `select f.id, f.type::text as type, f.status::text as status,
          case when f.over_quota and not public.is_pro(p.owner_id) then '' else left(f.message, 200) end as message,
          f.created_at, (f.over_quota and not public.is_pro(p.owner_id)) as hidden
   from public.feedback f join public.projects p on p.id = f.project_id
   where f.project_id = $1 order by f.created_at desc, f.id desc limit 5`,
  [projectId],
);
```

`usage` = existing `usage(deps, userId)`. Map dates with the file's `iso` helper; `checklist = { widgetSeen: head.widget_seen_at !== null, notifications: head.telegram || head.discord, firstFeedback: head.any_feedback }`.

`statusCounts` (in `feedback.ts`, via `withUser` so RLS hides over-quota rows automatically): `select status::text as status, count(*)::int as n from public.feedback where project_id = $1 group by status` → fill missing statuses with 0; non-UUID or not owned → all zeros.

`listFeedback`: add to the select `metadata->>'url' as url, metadata->>'browser' as browser, email`; map `page` = `new URL(url).pathname` inside try/catch (null on failure), keep `browser`, `email`.

- [ ] **Step 3:** Run the new and existing dashboard tests → PASS; verification set → pass.
- [ ] **Step 4: Commit** `feat(web): overview data, status counts and feed meta fields`.

---

### Task 3: Theme toggle and motion primitives

**Files:**
- Create: `apps/web/components/theme-toggle.tsx`, `apps/web/components/theme-toggle.test.tsx`, `apps/web/components/motion/count-up.tsx`
- Modify: `apps/web/app/globals.css` (view-transition, theme-fading, keyframes, reduced motion), `apps/web/messages/{en,ru}.json` (`common.themeDark`, `common.themeLight`)

**Interfaces:**
- Produces: `<ThemeToggle className?: string />` (client); `<CountUp value={number} durationMs?={number} />` (client; renders the final value as initial text, animates from 0 after mount unless reduced motion); CSS utilities `.animate-enter` (fade + 6 px rise, 300 ms), `.animate-grow` (scaleY 0→1 from bottom, 500 ms, `transform-origin: bottom`), `.animate-draw` (stroke-dashoffset 24→0, 350 ms), stagger helper `[style*="--i"]` via `animation-delay: calc(var(--i) * 60ms)`.

Toggle (spec §1 "Theme toggle"):

```tsx
'use client';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from 'cn';

function runTransition(apply: () => void) {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return apply();
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (typeof doc.startViewTransition === 'function') {
    doc.startViewTransition(apply);
    return;
  }
  const root = document.documentElement;
  root.classList.add('theme-fading');
  apply();
  window.setTimeout(() => root.classList.remove('theme-fading'), 850);
}

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const t = useTranslations('common');
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === 'dark';
  if (!mounted) return <span className={cn('inline-block h-[30px] w-14', className)} aria-hidden />;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label={t('themeDark')}
      data-testid="theme-toggle"
      onClick={() => runTransition(() => setTheme(dark ? 'light' : 'dark'))}
      className={cn('theme-toggle relative h-[30px] w-14 rounded-full border border-border bg-card', className)}
      data-dark={dark}
    >
      <span className="theme-toggle-knob">
        <svg viewBox="0 0 24 24" aria-hidden>
          <mask id="bp-moon-mask">
            <rect width="24" height="24" fill="#fff" />
            <circle className="theme-toggle-cut" cx="12" cy="12" r="7" fill="#000" />
          </mask>
          <circle cx="12" cy="12" r="6" fill="#fff" mask="url(#bp-moon-mask)" />
          <g className="theme-toggle-rays" stroke="#fff" strokeWidth="2" strokeLinecap="round">
            <path d="M12 1.5v2M12 20.5v2M1.5 12h2M20.5 12h2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M4.6 19.4 6 18M18 6l1.4-1.4" />
          </g>
        </svg>
      </span>
    </button>
  );
}
```

(The mask id must be unique if two toggles render at once — the mobile top bar and the sheet; use `useId()` sanitised like `components/brand/logo.tsx`.)

`globals.css` additions (knob/ray/cut styles copied from `theme-toggle-v3.html`, adapted to `[data-dark='true']`):

```css
::view-transition-old(root),
::view-transition-new(root) {
  animation-duration: 0.8s;
  animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
}
.theme-fading,
.theme-fading * {
  transition: background-color 0.8s cubic-bezier(0.4, 0, 0.2, 1), color 0.8s cubic-bezier(0.4, 0, 0.2, 1),
    border-color 0.8s cubic-bezier(0.4, 0, 0.2, 1), fill 0.8s, stroke 0.8s !important;
}
.theme-toggle-knob { position: absolute; top: 3px; left: 3px; width: 22px; height: 22px; border-radius: 9999px;
  background: #ffb020; display: grid; place-items: center;
  transition: transform 0.45s cubic-bezier(0.5, 1.6, 0.4, 1), background-color 0.45s; }
.theme-toggle[data-dark='true'] .theme-toggle-knob { transform: translateX(26px); background: #cfd6ff; }
.theme-toggle-knob svg { width: 22px; height: 22px; }
.theme-toggle-rays { transform-origin: 12px 12px; transition: transform 0.5s ease, opacity 0.3s; }
.theme-toggle[data-dark='true'] .theme-toggle-rays { transform: rotate(90deg) scale(0.4); opacity: 0; }
.theme-toggle-cut { transform: translate(14px, -14px); transition: transform 0.5s ease; }
.theme-toggle[data-dark='true'] .theme-toggle-cut { transform: translate(6px, -6px); }
@keyframes bp-enter { from { opacity: 0; transform: translateY(6px); } }
@keyframes bp-grow { from { transform: scaleY(0); } }
@keyframes bp-draw { from { stroke-dashoffset: 24; } }
.animate-enter { animation: bp-enter 0.3s cubic-bezier(0.4, 0, 0.2, 1) both; animation-delay: calc(var(--i, 0) * 60ms); }
.animate-grow { transform-origin: bottom; animation: bp-grow 0.5s cubic-bezier(0.4, 0, 0.2, 1) both; animation-delay: calc(var(--i, 0) * 12ms); }
.animate-draw { stroke-dasharray: 24; animation: bp-draw 0.35s ease-out both; }
@media (prefers-reduced-motion: reduce) {
  ::view-transition-old(root), ::view-transition-new(root) { animation: none; }
  .theme-toggle-knob, .theme-toggle-rays, .theme-toggle-cut { transition: none; }
  .animate-enter, .animate-grow, .animate-draw { animation: none; }
}
```

`CountUp`: `'use client'`; state starts at `value`; in `useEffect`, unless reduced motion, animate from 0 to `value` over `durationMs` (default 400) with `requestAnimationFrame` and ease-out, then set exactly `value`; render `{display.toLocaleString()}`.

Messages: `common.themeDark` = "Dark theme" / "Тёмная тема".

Tests (`theme-toggle.test.tsx`, Vitest + `renderToStaticMarkup`; mock `next-themes` and `next-intl` with `vi.mock`): before mount the placeholder renders (SSR path — `useEffect` doesn't run in `renderToStaticMarkup`), so assert the placeholder is `aria-hidden` and the same size; add a small pure test of `runTransition` by exporting it: with reduced motion → apply called synchronously and no class added; with `startViewTransition` present → it's called with the apply callback; fallback → `theme-fading` added and removed after 850 ms (fake timers).

- [ ] Steps: tests → FAIL; implement → PASS; verification set; commit `feat(web): animated theme toggle with a cross-fade and motion utilities`.

---

### Task 4: Dashboard shell

**Files:**
- Modify: `apps/web/components/app/app-shell.tsx`, `apps/web/components/app/project-nav.tsx`, `apps/web/components/app/project-switcher.tsx`, `apps/web/app/app/layout.tsx`, `apps/web/app/app/page.tsx`, `apps/web/app/app/p/[projectId]/layout.tsx` (page-enter wrapper), `apps/web/messages/{en,ru}.json` (`nav.*`)
- Create: `apps/web/components/app/plan-card.tsx`
- Test: update `apps/web/e2e/dashboard.spec.ts` / `billing.spec.ts` selectors only if they break

**Interfaces:**
- Consumes: `ThemeToggle` (Task 3); `statusCounts`, `usage` (Task 2 / existing); `Logo` (`components/brand/logo.tsx`).
- Produces: `AppShell({ projects, email, usage: { used; limit; pro }, plan: 'free' | 'pro_monthly' | 'pro_lifetime', newCounts: Record<string, number>, children })` — `newCounts` maps projectId → visible `new` count.

Behaviour per spec §1 and `dashboard-shell.html` option A:
- `app/app/layout.tsx` loads `projects`, `usage(deps, user.id)`, the plan (`isPro` + plan kind — reuse whatever `app/app/billing/page.tsx` uses to show the current plan) and, for each project, `statusCounts(...).new` (projects are few; `Promise.all`).
- Sidebar (`bg-sidebar`, `w-60`, `border-r`): `Logo href="/app"`; `ProjectSwitcher` restyled as a card (existing logic); `ProjectNav` items with icons (`LayoutDashboard`, `MessageSquare`, `Code2`, `Bell`, `Settings` from `lucide-react`): Overview → `/app/p/:id` (`data-testid="nav-overview"`), Feedback (badge `nav-feedback-count` when > 0), Install, Integrations, Settings; active item = `bg-card shadow-sm font-bold` (dark: `bg-accent`). Active detection: Overview when the path is exactly `/app/p/:id`.
- `PlanCard` (`data-testid="plan-card"`): Free → name, bar `used/limit`, text `nav.planUsage` ("{used} of {limit} feedback this month"), primary button "Upgrade to Pro" → `/app/billing`; Pro/Lifetime → name + "Unlimited" + outline button "Manage subscription" → `/app/billing`. Keep a `nav-billing` link somewhere reachable (the plan card button carries `data-testid="nav-billing"`).
- Footer: `Link` "← Back to site" (`nav-back-to-site`, `/`), "Account" (`nav-account`), row: truncated email, sign-out button (existing form), `ThemeToggle`.
- Mobile: top bar `md:hidden` with the Sheet trigger (existing `menu` label), `Logo`, `ThemeToggle`; sheet contains the same sidebar content.
- `app/app/page.tsx`: redirect to `/app/p/${first.id}` (Overview).
- Project layout wraps `children` in `<div key={pathname-ish} className="animate-enter">` — server layouts can't read the pathname; instead add a tiny client component `PageEnter` that keys on `usePathname()`.

Messages (`nav`): `overview` Overview/Обзор, `backToSite` Back to site/На сайт, `planFree` Free plan/Бесплатный тариф, `planPro` Pro, `planLifetime` Lifetime, `planUsage` `{used} of {limit} feedback this month` / `{used} из {limit} отзывов в этом месяце`, `unlimited` Unlimited/Без лимита, `upgrade` Upgrade to Pro/Перейти на Pro, `manage` Manage subscription/Управлять подпиской, `signOut` keep existing key location (`auth.signOut`).

- [ ] Steps: implement; update the existing e2e specs only where the shell change breaks a selector (keep test ids); run `pnpm --filter @bugping/web e2e`; verification set; commit `feat(web): redesigned dashboard shell with plan card and theme toggle`.

---

### Task 5: Overview page

**Files:**
- Create: `apps/web/app/app/p/[projectId]/page.tsx`, `apps/web/components/app/overview/{checklist,stat-cards,feedback-chart,recent-feedback,connections}.tsx`, `apps/web/components/app/empty-state.tsx`
- Modify: `apps/web/messages/{en,ru}.json` (`overview.*`, `empty.*`)
- Test: `apps/web/components/app/overview/feedback-chart.test.tsx`, `apps/web/components/app/empty-state.test.tsx`

**Interfaces:**
- Consumes: `getOverview` (Task 2), `CountUp`, `.animate-enter|grow|draw` (Task 3), `formatter.relativeTime` (next-intl).
- Produces: `EmptyState({ icon: ReactNode; title: string; body?: string; action?: { href: string; label: string; variant?: 'default' | 'outline' } })` with `data-testid="empty-state"` — reused by Task 6 and 7.

Layout per `dashboard-shell.html`: `h1` Overview + project name subtitle; `Checklist` (`overview-checklist`, hidden when all three done; tiles `checklist-widget|notifications|feedback` with `data-done`; done tiles show a check SVG path with `animate-draw`; undone tiles have a link button: widget → `/install`, notifications → `/integrations`, feedback → `/install`); `StatCards` (four cards `stat-new|resolved|last30|limit`, `CountUp`, `animate-enter` with `--i`); `FeedbackChart` (`overview-chart`: 30 flex columns, each a stack of three `div`s with heights proportional to counts over the max day total (max 120 px), `animate-grow` with `--i` = index; `title` = `"{day}: {bug} bugs, {idea} ideas, {general} questions"`; legend; all-zero → muted text `overview.chartEmpty`); `RecentFeedback` (`overview-recent`: rows with type pill, message or blurred placeholder for hidden, relative time; link to `/app/p/:id/feedback?status=<status>&f=<id>`; hidden rows link to `/app/billing`; empty → `EmptyState`); `Connections` (`overview-connections`: widget "On your site · seen {time}" / "Not seen yet" → Install; Telegram; Discord).

Messages (`overview`), en / ru:
title Overview/Обзор · checklistTitle `First steps · {done} of 3`/`Первые шаги · {done} из 3` · stepWidget Install the widget/Установите виджет · stepWidgetHint Paste the snippet on your site/Вставьте код на сайт · stepNotifications Connect notifications/Подключите уведомления · stepNotificationsHint Telegram or Discord/Telegram или Discord · stepFeedback Get your first feedback/Получите первый отзыв · stepFeedbackHint Send a test from your site/Отправьте тестовый со своего сайта · statNew New/Новые · statResolved Resolved/Решённые · statLast30 Last 30 days/За 30 дней · statLimit This month/В этом месяце · chartTitle Feedback, last 30 days/Отзывы за 30 дней · chartEmpty No feedback yet/Пока нет отзывов · legendBug Bugs/Баги · legendIdea Ideas/Идеи · legendGeneral Questions/Вопросы · recentTitle Recent feedback/Последние отзывы · allFeedback All feedback/Все отзывы · hiddenRow Upgrade to see this feedback/Перейдите на Pro, чтобы увидеть · widget Widget/Виджет · widgetSeen `On your site · seen {time}`/`На сайте · замечен {time}` · widgetNotSeen Not seen yet/Ещё не замечен · connected Connected/Подключён · notConnected Not connected/Не подключён.
`empty`: quietTitle It's quiet here/Пока тихо · quietBody As soon as a visitor sends feedback, it shows up here and in your notifications./Как только посетитель отправит отзыв, он появится здесь и придёт вам в уведомления. · installCta Install the widget/Установить виджет.

Tests: `FeedbackChart` renders 30 columns and scales heights relative to the busiest day (render with `renderToStaticMarkup`, parse `style` heights); all-zero shows the empty text. `EmptyState` renders title/body and the action link.

- [ ] Steps: tests → FAIL; implement → PASS; verification set incl. web e2e; commit `feat(web): project overview with checklist, stats, chart and connections`.

---

### Task 6: Feedback feed, detail panel and empty states

**Files:**
- Modify: `apps/web/app/app/p/[projectId]/feedback/page.tsx`, `apps/web/components/app/feedback/{feedback-list,feedback-detail,feedback-filters,feedback-actions,screenshot-viewer}.tsx`, `apps/web/messages/{en,ru}.json` (`feedback.*`, `empty.*`)

**Interfaces:**
- Consumes: `statusCounts`, list fields `page/browser/email` (Task 2); `EmptyState` (Task 5); `.animate-enter` (Task 3).

Per spec §3 and `feed.html`:
- Header: `h1` Feedback + auto-refresh; status tabs as a segmented control (`status-tab-new|resolved|archived`, New shows the count badge from `statusCounts`); type chips (existing filter links, restyled; keep existing test ids).
- Rows (`feedback-row` kept): type pill, 2-line clamp message, meta `page · browser · email` (skip missing parts), a small `Image` icon chip when `has_screenshot`, relative time; selected row `bg-primary/5` + `shadow-[inset_3px_0_0_var(--primary)]`.
- Hidden placeholders + upgrade row restyled (keep `feedback-hidden`).
- Detail panel (`feedback-detail` kept): header pill + date + close; larger screenshot viewer (rounded, border); message; data table; console errors `bg-zinc-950 text-red-300 font-mono` (same in both themes); actions: Resolve/Reopen (primary; keep `feedback-resolve`, `feedback-reopen`), Reply (`feedback-reply`, only with email: `mailto:{email}?subject=Re%3A%20your%20feedback`), Archive, Delete (existing confirm). Panel enters with `animate-enter` (desktop: translateX variant `bp-slide` 200 ms — add `@keyframes bp-slide { from { opacity: 0; transform: translateX(12px) } }` and `.animate-slide` to `globals.css`, reduced-motion safe).
- Empty states via `EmptyState` (`feedback-empty` test id must remain on the empty container: pass it through): no feedback in project → quiet + Install CTA (use `hasFeedback`); `new` empty with feedback elsewhere → "All caught up" + "Open resolved" (`?status=resolved`); resolved/archived empty → text only; type filter empty → "No {type} here" + "Clear filter".

Messages add (en / ru): feedback.reply Reply/Ответить · feedback.replySubject Re: your feedback/Re: ваш отзыв (use in mailto) · empty.caughtUpTitle All caught up/Все отзывы разобраны · empty.caughtUpBody No new feedback. Resolved ones are on the Resolved tab./Новых отзывов нет. Решённые — на вкладке «Решённые». · empty.openResolved Open resolved/Открыть решённые · empty.noneResolved Nothing resolved yet/Пока ничего не решено · empty.noneArchived The archive is empty/Архив пуст · empty.noneOfType `No {type} here`/`Здесь нет: {type}` · empty.clearFilter Clear filter/Сбросить фильтр.

- [ ] Steps: implement; unit tests for any new pure helper (e.g. `metaLine(item)` joining parts); web e2e (`dashboard.spec.ts` resolve flow) passes; verification set; commit `feat(web): redesigned feedback feed, detail panel and empty states`.

---

### Task 7: Remaining pages restyle

**Files:**
- Modify: `apps/web/app/app/p/[projectId]/install/page.tsx`, `integrations/page.tsx`, `settings/page.tsx`, `apps/web/app/app/billing/page.tsx`, `apps/web/app/app/account/page.tsx`, `apps/web/app/app/new/page.tsx` + `new-project-form.tsx`, `apps/web/components/app/{integrations/integrations-panel,settings/settings-form,settings/delete-project,billing/billing-panel,account/delete-account,copy-button,first-feedback-watcher,usage-bar}.tsx`, `apps/web/messages/{en,ru}.json`

**Interfaces:**
- Consumes: `EmptyState`, `.animate-enter`, `getOverview().widgetSeenAt` or a lighter query (`select widget_seen_at from projects` via `getProject` — add the column to `getProject`'s select) for the Install status line.

Per spec §4: consistent page header (`h1` + muted description), content as cards (`rounded-xl border bg-card p-5`), spacing `gap-6`, primary coral actions.
- Install: three numbered steps; snippet in `bg-zinc-950 text-zinc-100 font-mono rounded-lg` with the copy button; hide-trigger and identify sections as cards; status line "Widget seen {time}" / "Not seen yet" (+ existing `install-waiting` / `install-received` watcher kept).
- Integrations: Telegram/Discord cards with status chips (Connected green, Not connected muted, Error red with `last_error`); an `EmptyState`-style hint when none connected (keep all existing test ids and flows).
- Settings: grouped cards — Appearance (colour, text, position, locale + live preview), Allowed websites, Custom CSS (Pro), Danger zone (red-bordered card).
- Billing, Account: restyled cards; New project: when the user has no projects, a welcome block with `LadybugMark` + "Create your first project".

Messages add only what the new layout needs (step titles for Install, "Danger zone", welcome texts) in both locales.

- [ ] Steps: implement page by page; keep all flows' test ids; web e2e passes (billing, dashboard, login specs); verification set; commit `feat(web): restyle install, integrations, settings, billing, account and new project`.

---

### Task 8: End-to-end coverage and visual pass

**Files:**
- Modify: `apps/web/e2e/dashboard.spec.ts` (+ new cases), `apps/web/e2e/billing.spec.ts` (only if needed)

Cases:
1. Login → `/app` with a project → lands on Overview (`nav-overview` active, `overview-checklist` visible, `checklist-widget` `data-done="false"`); request `/api/v1/widget/config?key=<key>` (`page.request.get`) → reload → `checklist-widget` `data-done="true"`; widget status in `overview-connections` says seen.
2. After receiving feedback (reuse the onboarding helper): Overview `stat-new` shows 1, `overview-recent` contains the message, clicking it opens the feed with the detail panel; Resolve → the New tab count badge decreases and the Resolved tab lists it.
3. Theme: click `theme-toggle` → `html` gets class `dark`; reload → still dark; click again → light.
4. Empty states: a fresh project's feed shows `empty-state` with the Install CTA.
5. Mobile (390×844): menu opens the sheet with nav + theme toggle.

- [ ] Steps: write cases; run `pnpm --filter @bugping/web e2e` twice; verification set; commit `test(web): e2e coverage for the redesigned dashboard`.
