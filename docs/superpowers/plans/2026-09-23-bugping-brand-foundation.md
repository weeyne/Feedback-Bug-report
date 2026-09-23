# Bugping Brand Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename Dymcode to Bugping everywhere, add the coral/ladybug visual identity with Manrope, and rebuild the login page.

**Architecture:** Mechanical renames first (code identifiers, then texts/docs), so every later task already uses the new names. Theme tokens live in `apps/web/app/globals.css` and flow into all shadcn components. A single `components/brand/logo.tsx` owns the mark and wordmark; icons and the share image use Next.js file conventions. The login page is rebuilt with existing shadcn primitives.

**Tech Stack:** pnpm 11 + Turborepo, Next.js 16 (App Router), React 19, Tailwind v4, shadcn/ui on Base UI (no `asChild`; use `render` + `nativeButton={false}`), next-intl (en/ru, ICU — escape literal `{`/`}`/`<` in messages), Vitest 5, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-23-bugping-brand-foundation-design.md`

## Global Constraints

- Conversation with the owner is Russian; all code, comments, commit messages and docs are English.
- Never read, print, edit or commit `apps/web/.env.local` (real secrets). Exclude it from every grep: `git grep ... -- ':!apps/web/.env.local'`.
- Never run `supabase start` / `supabase db push` (local Docker is broken; pushing changes production and needs the owner's consent).
- Do not edit historical documents under `docs/superpowers/` except this plan's own spec and plan.
- Keep every existing `data-testid` name unchanged.
- Widget bundle limits: `dist/widget.js` ≤ 20 KB gzip, `dist/screenshot.js` ≤ 40 KB gzip (`pnpm --filter @bugping/widget size`).
- Brand coral `#FF4D3D` (logo, highlights, `--brand`); light `--primary` `#E0321F` with white text; dark `--primary` `#FF5A4A` with `#1A1414` text.
- New default widget color: `#E0321F`.
- Commit trailer on every commit: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Full verification command set (run from repo root): `pnpm install`, `pnpm typecheck`, `pnpm test`, `pnpm format:check`, `pnpm --filter @bugping/widget build && pnpm --filter @bugping/widget size && pnpm --filter @bugping/widget check:bundle`. Before Task 1 finishes, the filters are still `@dymcode/*`.

---

### Task 1: Rename code identifiers

Mechanical rename of package names, env vars, the widget's public API, DOM markers and CSS prefix. No user-visible copy changes here (Task 2 does texts).

**Files (all modified):**
- `package.json` (root `name`, `db:test` script filter), `turbo.json` (task keys), `pnpm-lock.yaml` (regenerated)
- `packages/shared/package.json`, `packages/widget/package.json`, `apps/web/package.json`, `supabase/tests/package.json` (names + `workspace:*` deps + scripts)
- `.github/workflows/ci.yml`, `apps/web/vercel.json`, `apps/web/next.config.ts`, `apps/web/playwright.config.ts`, `packages/widget/playwright.config.ts`, `packages/widget/vite.widget.config.ts`, `packages/widget/dev/mock-api.ts`, `packages/widget/dev/*.html`, `apps/web/scripts/copy-widget.mjs`, `apps/web/scripts/set-telegram-webhook.mjs`, `supabase/config.toml`
- Every `import ... from '@dymcode/...'` in `apps/web/**`, `packages/**`, `supabase/tests/**`
- `apps/web/lib/env.ts`, `apps/web/lib/public-env.ts`, `apps/web/components/marketing/own-widget.tsx`, `apps/web/lib/deps.ts`, `apps/web/lib/test-mode.ts`, `apps/web/lib/auth/admin.ts`, `apps/web/lib/auth/session.ts`, `apps/web/app/actions/session.ts`, `apps/web/app/api/e2e-test/*/route.ts`, `apps/web/app/e2e-host/route.ts`, `apps/web/proxy.ts`
- `packages/widget/src/index.ts`, `public-api.ts`, `api.ts`, `ui/h.ts`, `ui/mount.ts`, `ui/panel.ts`, `ui/trigger.ts`, `ui/styles.css`, `context/metadata.ts`, `context/console-buffer.ts`, `screenshot.ts`, `packages/shared/src/schemas/metadata.ts`
- `apps/web/app/app/p/[projectId]/install/page.tsx` (snippet `Dymcode.open` / `Dymcode.identify` → `Bugping.*`)
- `apps/web/components/app/settings/widget-preview.tsx`, `settings-form.tsx` (identifier/prefix references only)
- All tests and e2e specs that reference the renamed identifiers

**Interfaces:**
- Produces: packages `@bugping/shared`, `@bugping/widget`, `@bugping/web`, `@bugping/db-tests`; root `bugping`; env `NEXT_PUBLIC_BUGPING_PROJECT_KEY`, `BUGPING_TEST_MODE`; `PublicEnv.bugpingProjectKey`; `window.Bugping` typed `BugpingApi`; event `bugping:ready`; host attribute `data-bugping`; widget CSS classes `bp-*` and custom properties `--bp-*`; vite lib name `BugpingWidget`; `globalThis.__bugpingDeps`; log prefix `[Bugping]`.

Rename table (apply exactly):

| From | To |
|---|---|
| `@dymcode/` (package scope) | `@bugping/` |
| root package name `dymcode` | `bugping` |
| `NEXT_PUBLIC_DYMCODE_PROJECT_KEY` | `NEXT_PUBLIC_BUGPING_PROJECT_KEY` |
| `dymcodeProjectKey` | `bugpingProjectKey` |
| `DYMCODE_TEST_MODE` | `BUGPING_TEST_MODE` |
| `__dymcodeDeps` | `__bugpingDeps` |
| `window.Dymcode`, `win.Dymcode`, `Dymcode?: unknown`, `Dymcode.open`, `Dymcode.identify` (code + install snippet + comments) | `Bugping` equivalents |
| `DymcodeApi` | `BugpingApi` |
| `'[Dymcode]'` log prefix | `'[Bugping]'` |
| `'dymcode:ready'` | `'bugping:ready'` |
| `data-dymcode` | `data-bugping` |
| `DymcodeWidget` (vite lib name) | `BugpingWidget` |
| `dymcode-mock-api` | `bugping-mock-api` |
| `project_id = "dymcode"` in `supabase/config.toml` | `project_id = "bugping"` |
| Widget CSS class / id prefix `dc-` and custom property prefix `--dc-` in `packages/widget/**` and in tests/e2e that select widget elements (`apps/web/e2e/*.spec.ts`, `apps/web/lib/dashboard/settings.test.ts`, `apps/web/lib/widget/config.test.ts`) | `bp-` / `--bp-` |
| `TELEGRAM_BOT_USERNAME: 'dymcode_bot'` in `apps/web/playwright.config.ts` and `apps/web/test/fixtures.ts` | `'bugping_bot'` |

- [ ] **Step 1: Record the starting point**

Run: `git grep -ic dymcode -- . ':!docs/superpowers' ':!apps/web/.env.local' | wc -l`
Expected: about 113 files.

- [ ] **Step 2: Apply the rename table**

Do the renames with a script or editor, file by file from the list above. For the CSS prefix, only replace the token at a word boundary: regex `(?<![\w-])dc-` → `bp-` and `--dc-` → `--bp-`, limited to `packages/widget/src/**`, `packages/widget/e2e/**`, `packages/widget/dev/**`, `apps/web/e2e/**`, `apps/web/lib/dashboard/settings.test.ts`, `apps/web/lib/widget/config.test.ts`. Do not touch `apps/web/public/w/**` (build output, git-ignored).

Leave user-visible copy for Task 2: the strings `Dymcode` in `apps/web/messages/*.json`, `packages/shared/src/brand.ts`, `apps/web/app/layout.tsx` metadata, `app/(marketing)/layout.tsx`, `components/app/app-shell.tsx`, `components/marketing/site-footer.tsx`, `lib/telegram/webhook.ts` texts, `lib/notify/dispatch.ts` test message, `app/e2e-host/route.ts` `<title>`, test fixtures URLs `dymcode.dev`, `README.md`, `docs/deploy.md`.

- [ ] **Step 3: Reinstall so workspace links and the lockfile use the new names**

Run: `pnpm install`
Expected: success; `git diff --stat pnpm-lock.yaml` shows the `@bugping/*` names; `ls node_modules/@bugping` (in `apps/web`) lists `shared` and `widget`.

- [ ] **Step 4: Check no identifier survived**

Run: `git grep -nE "@dymcode|DYMCODE_|dymcodeProjectKey|__dymcodeDeps|DymcodeApi|dymcode:ready|data-dymcode|DymcodeWidget|window\.Dymcode|win\.Dymcode|Dymcode\.(open|identify)|\[Dymcode\]" -- . ':!docs/superpowers' ':!apps/web/.env.local'`
Expected: no output.

Run: `git grep -nE "(^|[^\w-])dc-|--dc-" -- packages/widget apps/web/e2e apps/web/lib ':!apps/web/.env.local'`
Expected: no output.

- [ ] **Step 5: Run the full verification set**

Run: `pnpm typecheck && pnpm test && pnpm format:check && pnpm --filter @bugping/widget build && pnpm --filter @bugping/widget size && pnpm --filter @bugping/widget check:bundle`
Expected: all pass; size within limits. (`pnpm test` uses PGlite locally for DB tests.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: rename Dymcode identifiers to Bugping

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Rename user-facing texts, docs, default color, owner checklist

**Files:**
- Modify: `packages/shared/src/brand.ts`, `packages/shared/src/brand.test.ts`
- Modify: `apps/web/messages/en.json`, `apps/web/messages/ru.json`
- Modify: `apps/web/app/layout.tsx` (title template, `siteName`)
- Modify: `apps/web/app/(marketing)/layout.tsx`, `apps/web/components/app/app-shell.tsx`, `apps/web/components/marketing/site-footer.tsx` (text `Dymcode` → `Bugping`; Task 4 later swaps the header/nav text for the logo)
- Modify: `apps/web/lib/telegram/webhook.ts`, `apps/web/lib/notify/dispatch.ts`, `apps/web/app/e2e-host/route.ts` (strings) and their tests
- Modify: `apps/web/test/fixtures.ts`, `apps/web/test/notify-fixtures.ts`, `apps/web/test/paddle-fixtures.ts` and any test asserting `dymcode.dev` / `Dymcode` strings
- Modify: `apps/web/components/app/settings/settings-form.tsx:46`, `packages/widget/dev/mock-api.ts:34`, `apps/web/lib/notify/format.ts:7` (+ `format.test.ts` if it asserts the color)
- Create: `supabase/migrations/20260924000100_bugping_default_color.sql`
- Modify: `README.md`, `docs/deploy.md`
- Create: `docs/rename-ops.md`

**Interfaces:**
- Consumes: Task 1 names.
- Produces: `BRAND = { name: 'Bugping', domain: 'bugping.app', url: 'https://bugping.app' }` (no `telegramBot`); `buildBadgeUrl(publicKey, baseUrl = BRAND.url)` unchanged in signature.

- [ ] **Step 1: Update the brand test first**

`packages/shared/src/brand.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BRAND, buildBadgeUrl } from './brand';

describe('buildBadgeUrl', () => {
  it('links to the landing page with ref and utm_source', () => {
    expect(buildBadgeUrl('pk_AbCdEfGh12345678')).toBe(
      'https://bugping.app/?ref=pk_AbCdEfGh12345678&utm_source=widget',
    );
  });

  it('uses the given base URL without a trailing slash', () => {
    expect(buildBadgeUrl('pk_AbCdEfGh12345678', 'https://bugping.vercel.app/')).toBe(
      'https://bugping.vercel.app/?ref=pk_AbCdEfGh12345678&utm_source=widget',
    );
  });

  it('encodes unexpected characters', () => {
    expect(buildBadgeUrl('a&b')).toBe('https://bugping.app/?ref=a%26b&utm_source=widget');
  });
});

describe('BRAND', () => {
  it('is Bugping and derives url from domain', () => {
    expect(BRAND.name).toBe('Bugping');
    expect(BRAND.url).toBe(`https://${BRAND.domain}`);
    expect(BRAND).not.toHaveProperty('telegramBot');
  });
});
```

Run: `pnpm --filter @bugping/shared test`
Expected: FAIL (still `dymcode.dev`).

- [ ] **Step 2: Update `brand.ts`**

```ts
// Must stay free of runtime dependencies: the widget bundle imports this file directly.

const DOMAIN = 'bugping.app';

export const BRAND = {
  name: 'Bugping',
  domain: DOMAIN,
  url: `https://${DOMAIN}`,
} as const;
```

Keep `buildBadgeUrl` and its doc comment as they are. Run `git grep -n "telegramBot" -- packages apps ':!apps/web/.env.local'` and remove any remaining use. Run `pnpm --filter @bugping/shared test` → PASS.

- [ ] **Step 3: Replace the product name in copy**

In `apps/web/messages/en.json` and `ru.json` replace every `Dymcode` with `Bugping` (keys stay the same; keep ICU escaping intact). In `apps/web/app/layout.tsx`: `template: '%s · Bugping'`, `siteName: 'Bugping'`. In the marketing layout, app shell (both places) and site footer: `Bugping`. In `lib/telegram/webhook.ts`: `Create a new one in your Bugping dashboard.` and `I deliver feedback from your Bugping widget.`. In `lib/notify/dispatch.ts`: `✅ Bugping test message: ...`. In `app/e2e-host/route.ts`: `<title>Bugping E2E host</title>`. In test fixtures: `https://dymcode.dev` → `https://bugping.app`. Update the tests that assert these strings to the new text.

- [ ] **Step 4: Default widget color**

Create `supabase/migrations/20260924000100_bugping_default_color.sql`:

```sql
-- New projects get the Bugping coral; projects still on the old untouched default follow it.
alter table public.projects alter column primary_color set default '#E0321F';
update public.projects set primary_color = '#E0321F' where primary_color = '#6366f1';
```

Set the fallback `'#6366f1'` → `'#E0321F'` in `components/app/settings/settings-form.tsx` and `packages/widget/dev/mock-api.ts`; in `messages/en.json` / `ru.json` `colorInvalid` use the example `#E0321F`; in `lib/notify/format.ts` `general.color` → `0xe0321f`. Test fixtures that use `#6366f1` as an arbitrary valid color may stay.

`supabase/tests/src/core-tables.test.ts` already has `it('applies widget defaults', ...)` (around line 14) asserting `primary_color: '#6366f1'`. Change that expectation to `primary_color: '#E0321F'` — do this before writing the migration and confirm it fails:

Run: `pnpm --filter @bugping/db-tests test`
Expected before the migration: FAIL on "applies widget defaults"; after the migration: PASS (PGlite applies all migrations in order).

- [ ] **Step 5: Docs**

In `README.md` and `docs/deploy.md` replace `Dymcode` → `Bugping`, `dymcode.vercel.app` → `bugping.vercel.app`, `@dymcode_bot` → `@bugping_bot`, `NEXT_PUBLIC_DYMCODE_PROJECT_KEY` → `NEXT_PUBLIC_BUGPING_PROJECT_KEY`, `@dymcode/` → `@bugping/`.

Create `docs/rename-ops.md` with the owner checklist from spec section 2 "Owner checklist", steps 1–9 in that order, expanded into click-by-click instructions. Step 7 must give this command, run from `apps/web` after the new env values are in `.env.local` (the script reads the token and secret from the environment; nothing secret is typed into chat or the command line):

```bash
pnpm telegram:set-webhook https://bugping.vercel.app/api/telegram/webhook
```

Before writing step 7, read `apps/web/scripts/set-telegram-webhook.mjs` and describe exactly which env vars it reads and how it loads them.

- [ ] **Step 6: Whole-repo grep is clean**

Run: `git grep -in dymcode -- . ':!docs/superpowers' ':!apps/web/.env.local'`
Expected: only lines in `docs/rename-ops.md` that name the *old* things the owner must rename (old variable name, old URL, old bot). Nothing else.

- [ ] **Step 7: Full verification set, then commit**

Run the Global Constraints verification set. Expected: all pass.

```bash
git add -A
git commit -m "feat: rename the product to Bugping in copy and docs, coral default color

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Theme tokens and Manrope

**Files:**
- Modify: `apps/web/app/globals.css` (`@theme inline`, `:root`, `.dark`)
- Modify: `apps/web/app/layout.tsx` (load Manrope)
- Create: `apps/web/app/theme.test.ts`

**Interfaces:**
- Produces: Tailwind color `brand` (`bg-brand`, `text-brand`) from `--color-brand: var(--brand)`; CSS variable `--font-manrope` on `<html>`; tokens in hex exactly as listed below.

- [ ] **Step 1: Write the failing contrast test**

`apps/web/app/theme.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./globals.css', import.meta.url), 'utf8');

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`missing ${selector} block`);
  return css.slice(start, css.indexOf('}', start));
}

function token(body: string, name: string): string {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(body);
  if (!match) throw new Error(`--${name} is not a 6-digit hex color`);
  return match[1]!;
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe.each([':root', '.dark'])('%s theme', (selector) => {
  const body = block(selector);

  it('primary buttons meet WCAG AA for normal text', () => {
    expect(contrast(token(body, 'primary'), token(body, 'primary-foreground'))).toBeGreaterThanOrEqual(4.5);
  });

  it('body text meets WCAG AA', () => {
    expect(contrast(token(body, 'background'), token(body, 'foreground'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token(body, 'background'), token(body, 'muted-foreground'))).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the brand coral', () => {
    expect(token(body, 'brand').toUpperCase()).toBe('#FF4D3D');
  });
});
```

Run: `pnpm --filter @bugping/web exec vitest run app/theme.test.ts`
Expected: FAIL (`--primary is not a 6-digit hex color` — current tokens are oklch).

- [ ] **Step 2: Replace the tokens**

In `globals.css`, replace the whole `:root { ... }` and `.dark { ... }` blocks with:

```css
:root {
  --background: #fffdfb;
  --foreground: #1a1414;
  --card: #ffffff;
  --card-foreground: #1a1414;
  --popover: #ffffff;
  --popover-foreground: #1a1414;
  --primary: #e0321f;
  --primary-foreground: #ffffff;
  --secondary: #f7eeea;
  --secondary-foreground: #1a1414;
  --muted: #fbf4f1;
  --muted-foreground: #6f6461;
  --accent: #fbf4f1;
  --accent-foreground: #1a1414;
  --destructive: #b42318;
  --border: #f0e6e2;
  --input: #ead9d4;
  --ring: #ff4d3d;
  --brand: #ff4d3d;
  --chart-1: #ff4d3d;
  --chart-2: #e0321f;
  --chart-3: #ff9a8f;
  --chart-4: #6f6461;
  --chart-5: #a8998f;
  --radius: 0.75rem;
  --sidebar: #fbf4f1;
  --sidebar-foreground: #1a1414;
  --sidebar-primary: #e0321f;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #f7eeea;
  --sidebar-accent-foreground: #1a1414;
  --sidebar-border: #f0e6e2;
  --sidebar-ring: #ff4d3d;
}

.dark {
  --background: #141010;
  --foreground: #fbf4f1;
  --card: #1c1716;
  --card-foreground: #fbf4f1;
  --popover: #1c1716;
  --popover-foreground: #fbf4f1;
  --primary: #ff5a4a;
  --primary-foreground: #1a1414;
  --secondary: #2a2321;
  --secondary-foreground: #fbf4f1;
  --muted: #241e1c;
  --muted-foreground: #a8998f;
  --accent: #2a2321;
  --accent-foreground: #fbf4f1;
  --destructive: #ff6b5e;
  --border: #332a28;
  --input: #3a302e;
  --ring: #ff5a4a;
  --brand: #ff4d3d;
  --chart-1: #ff5a4a;
  --chart-2: #ff4d3d;
  --chart-3: #ff9a8f;
  --chart-4: #a8998f;
  --chart-5: #6f6461;
  --sidebar: #1c1716;
  --sidebar-foreground: #fbf4f1;
  --sidebar-primary: #ff5a4a;
  --sidebar-primary-foreground: #1a1414;
  --sidebar-accent: #2a2321;
  --sidebar-accent-foreground: #fbf4f1;
  --sidebar-border: #332a28;
  --sidebar-ring: #ff5a4a;
}
```

If the existing blocks contain other variables not listed here, keep them. In `@theme inline` add `--color-brand: var(--brand);` and change the font line to:

```css
  --font-sans:
    var(--font-manrope), ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto,
    'Helvetica Neue', Arial, sans-serif;
```

Keep `--font-heading: var(--font-sans);`.

- [ ] **Step 3: Load Manrope**

In `apps/web/app/layout.tsx`:

```tsx
import { Manrope } from 'next/font/google';

const manrope = Manrope({
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
  variable: '--font-manrope',
});
```

and `<html lang={locale} className={manrope.variable} suppressHydrationWarning>`. Leave the rest of the layout unchanged.

- [ ] **Step 4: Tests and build**

Run: `pnpm --filter @bugping/web exec vitest run app/theme.test.ts` → PASS.
Run: `pnpm --filter @bugping/web build` → succeeds (downloads Manrope at build time).
Run the Global Constraints verification set → all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/globals.css apps/web/app/layout.tsx apps/web/app/theme.test.ts
git commit -m "feat(web): Bugping coral theme tokens and Manrope

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Logo, icons and share image

**Files:**
- Create: `apps/web/components/brand/logo.tsx`, `apps/web/components/brand/ladybug-svg.ts`, `apps/web/components/brand/logo.test.tsx`
- Create: `apps/web/app/icon.svg`, `apps/web/app/apple-icon.tsx`, `apps/web/app/opengraph-image.tsx`
- Modify: `apps/web/vitest.config.ts` (include component tests, JSX transform)
- Modify: `apps/web/app/(marketing)/layout.tsx`, `apps/web/components/app/app-shell.tsx`

**Interfaces:**
- Consumes: `--brand` / Tailwind `text-brand`, `bg-brand` (Task 3).
- Produces:
  - `LadybugMark(props: { size?: number; className?: string }): JSX.Element` — default size 28.
  - `Wordmark(props: { className?: string }): JSX.Element`.
  - `Logo(props: { size?: 'md' | 'lg'; href?: string; className?: string }): JSX.Element` — `md` = mark 28 px + text-xl; `lg` = mark 40 px + text-3xl.
  - `ladybugSimpleSvg: string` and `ladybugDetailedSvg(gradientId: string): string` — full `<svg ...>` strings (with `xmlns`) used by icons/OG image.

- [ ] **Step 1: Let Vitest run component tests**

In `apps/web/vitest.config.ts` add `'components/**/*.test.tsx'` to `test.include`, and make `.tsx` compile with the automatic React runtime (tsconfig has `"jsx": "preserve"`, which Vitest must not use). Add at the top level of `defineConfig`:

```ts
  oxc: { jsx: { runtime: 'automatic' } },
```

If Vitest 5 rejects `oxc`, use `esbuild: { jsx: 'automatic' }` instead. Confirm by running the test in Step 3 — a JSX error means this step is wrong.

- [ ] **Step 2: Write the failing test**

`apps/web/components/brand/logo.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LadybugMark, Wordmark } from './logo';

describe('LadybugMark', () => {
  it('gives every instance its own gradient id', () => {
    const html = renderToStaticMarkup(
      <>
        <LadybugMark />
        <LadybugMark />
      </>,
    );
    const ids = [...html.matchAll(/<radialGradient id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(html).toContain(`url(#${id})`);
  });

  it('is decorative', () => {
    expect(renderToStaticMarkup(<LadybugMark />)).toContain('aria-hidden="true"');
  });
});

describe('Wordmark', () => {
  it('exposes the accessible name Bugping', () => {
    const html = renderToStaticMarkup(<Wordmark />);
    expect(html).toMatch(/aria-label="Bugping"/);
    expect(html).toContain('bugp');
  });
});
```

Run: `pnpm --filter @bugping/web exec vitest run components/brand/logo.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the SVG sources and components**

`apps/web/components/brand/ladybug-svg.ts` (plain strings for `ImageResponse` and `icon.svg`; the paths are the spec's):

```ts
/** Simplified ladybug for 16–32 px (favicon, apple icon). */
export const ladybugSimpleSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
  '<path d="M9 9.5 a7 6 0 0 1 14 0 z" fill="#1a1414"/>' +
  '<circle cx="16" cy="19" r="12" fill="#ff4d3d"/>' +
  '<path d="M16 9 L16 31" stroke="#1a1414" stroke-width="2.2"/>' +
  '<path d="M9 10 Q16 7 23 10 Q16 13 9 10Z" fill="#1a1414"/>' +
  '<circle cx="10.5" cy="17" r="2.6" fill="#1a1414"/><circle cx="21.5" cy="17" r="2.6" fill="#1a1414"/>' +
  '<circle cx="11.5" cy="25" r="2.2" fill="#1a1414"/><circle cx="20.5" cy="25" r="2.2" fill="#1a1414"/>' +
  '</svg>';

/** Detailed ladybug; `ink` colors legs, antennae and the head outline. */
export function ladybugDetailedSvg(gradientId: string, ink = '#1a1414'): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<defs><radialGradient id="${gradientId}" cx="35%" cy="30%" r="75%">` +
    `<stop offset="0" stop-color="#ff7a6b"/><stop offset=".55" stop-color="#ff4d3d"/><stop offset="1" stop-color="#d9321f"/>` +
    `</radialGradient></defs>` +
    `<g stroke="${ink}" stroke-width="2.4" stroke-linecap="round" fill="none">` +
    `<path d="M14 28 L6 24"/><path d="M12 38 L4 39"/><path d="M15 48 L8 54"/>` +
    `<path d="M50 28 L58 24"/><path d="M52 38 L60 39"/><path d="M49 48 L56 54"/>` +
    `<path d="M27 12 Q23 4 17 4"/><path d="M37 12 Q41 4 47 4"/></g>` +
    `<circle cx="17" cy="4.2" r="2.3" fill="${ink}"/><circle cx="47" cy="4.2" r="2.3" fill="${ink}"/>` +
    `<path d="M21 17 a11 9 0 0 1 22 0 z" fill="#1a1414" stroke="${ink}" stroke-width="1"/>` +
    `<circle cx="27.5" cy="13.5" r="2" fill="#fff"/><circle cx="36.5" cy="13.5" r="2" fill="#fff"/>` +
    `<path d="M32 18 C14 18 10 32 10 38 C10 51 20 59 31 59.5 L32 20 Z" fill="url(#${gradientId})"/>` +
    `<path d="M32 18 C50 18 54 32 54 38 C54 51 44 59 33 59.5 L32 20 Z" fill="url(#${gradientId})"/>` +
    `<path d="M22 19 Q32 15 42 19 Q37 23 32 23 Q27 23 22 19Z" fill="#1a1414"/>` +
    `<ellipse cx="25" cy="20" rx="2.6" ry="1.4" fill="#fff" opacity=".9"/>` +
    `<ellipse cx="39" cy="20" rx="2.6" ry="1.4" fill="#fff" opacity=".9"/>` +
    `<path d="M32 21 L32 59.5" stroke="#1a1414" stroke-width="1.6"/>` +
    `<circle cx="21" cy="31" r="4" fill="#1a1414"/><circle cx="43" cy="31" r="4" fill="#1a1414"/>` +
    `<circle cx="17.5" cy="43" r="3.2" fill="#1a1414"/><circle cx="46.5" cy="43" r="3.2" fill="#1a1414"/>` +
    `<circle cx="25.5" cy="51" r="2.8" fill="#1a1414"/><circle cx="38.5" cy="51" r="2.8" fill="#1a1414"/>` +
    `<circle cx="27" cy="40" r="2.2" fill="#1a1414"/><circle cx="37" cy="40" r="2.2" fill="#1a1414"/>` +
    `<ellipse cx="20" cy="26" rx="5" ry="2.6" fill="#fff" opacity=".35" transform="rotate(-35 20 26)"/>` +
    `</svg>`
  );
}
```

`apps/web/components/brand/logo.tsx`:

```tsx
import Link from 'next/link';
import { useId } from 'react';
import { cn } from 'cn';

export function LadybugMark({ size = 28, className }: { size?: number; className?: string }) {
  // useId output contains ':' which is invalid inside url(#...); keep only safe characters.
  const gradient = `lb-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={cn('shrink-0', className)}
    >
      <defs>
        <radialGradient id={gradient} cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#ff7a6b" />
          <stop offset=".55" stopColor="#ff4d3d" />
          <stop offset="1" stopColor="#d9321f" />
        </radialGradient>
      </defs>
      <g stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" fill="none">
        <path d="M14 28 L6 24" />
        <path d="M12 38 L4 39" />
        <path d="M15 48 L8 54" />
        <path d="M50 28 L58 24" />
        <path d="M52 38 L60 39" />
        <path d="M49 48 L56 54" />
        <path d="M27 12 Q23 4 17 4" />
        <path d="M37 12 Q41 4 47 4" />
      </g>
      <circle cx="17" cy="4.2" r="2.3" fill="currentColor" />
      <circle cx="47" cy="4.2" r="2.3" fill="currentColor" />
      <path d="M21 17 a11 9 0 0 1 22 0 z" fill="#1a1414" stroke="currentColor" strokeWidth="1" />
      <circle cx="27.5" cy="13.5" r="2" fill="#fff" />
      <circle cx="36.5" cy="13.5" r="2" fill="#fff" />
      <path d="M32 18 C14 18 10 32 10 38 C10 51 20 59 31 59.5 L32 20 Z" fill={`url(#${gradient})`} />
      <path d="M32 18 C50 18 54 32 54 38 C54 51 44 59 33 59.5 L32 20 Z" fill={`url(#${gradient})`} />
      <path d="M22 19 Q32 15 42 19 Q37 23 32 23 Q27 23 22 19Z" fill="#1a1414" />
      <ellipse cx="25" cy="20" rx="2.6" ry="1.4" fill="#fff" opacity=".9" />
      <ellipse cx="39" cy="20" rx="2.6" ry="1.4" fill="#fff" opacity=".9" />
      <path d="M32 21 L32 59.5" stroke="#1a1414" strokeWidth="1.6" />
      <circle cx="21" cy="31" r="4" fill="#1a1414" />
      <circle cx="43" cy="31" r="4" fill="#1a1414" />
      <circle cx="17.5" cy="43" r="3.2" fill="#1a1414" />
      <circle cx="46.5" cy="43" r="3.2" fill="#1a1414" />
      <circle cx="25.5" cy="51" r="2.8" fill="#1a1414" />
      <circle cx="38.5" cy="51" r="2.8" fill="#1a1414" />
      <circle cx="27" cy="40" r="2.2" fill="#1a1414" />
      <circle cx="37" cy="40" r="2.2" fill="#1a1414" />
      <ellipse cx="20" cy="26" rx="5" ry="2.6" fill="#fff" opacity=".35" transform="rotate(-35 20 26)" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Bugping"
      className={cn('font-extrabold tracking-[-0.03em] leading-none', className)}
    >
      <span aria-hidden="true">
        bugp
        <span className="relative">
          ı
          <span className="absolute left-1/2 top-[0.12em] size-[0.26em] -translate-x-1/2 rounded-full bg-brand" />
        </span>
        ng
      </span>
    </span>
  );
}

const SIZES = {
  md: { mark: 28, text: 'text-xl' },
  lg: { mark: 40, text: 'text-3xl' },
} as const;

export function Logo({
  size = 'md',
  href,
  className,
}: {
  size?: 'md' | 'lg';
  href?: string;
  className?: string;
}) {
  const s = SIZES[size];
  const content = (
    <>
      <LadybugMark size={s.mark} />
      <Wordmark className={s.text} />
    </>
  );
  const classes = cn('inline-flex items-center gap-2 text-foreground', className);
  return href ? (
    <Link href={href} className={classes}>
      {content}
    </Link>
  ) : (
    <span className={classes}>{content}</span>
  );
}
```

Adjust the dot's `top`/`size` in the browser (Step 6) so it sits where the "i" dot would be in Manrope 800; the test does not pin those values.

Run: `pnpm --filter @bugping/web exec vitest run components/brand/logo.test.tsx` → PASS.

- [ ] **Step 4: Icons and share image**

`apps/web/app/icon.svg`: the exact content of `ladybugSimpleSvg` (a static file; copy the string, unescaped).

`apps/web/app/apple-icon.tsx`:

```tsx
import { ImageResponse } from 'next/og';
import { ladybugSimpleSvg } from '@/components/brand/ladybug-svg';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  const src = `data:image/svg+xml;base64,${Buffer.from(ladybugSimpleSvg).toString('base64')}`;
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fffdfb' }}>
        <img src={src} width={132} height={132} alt="" />
      </div>
    ),
    size,
  );
}
```

`apps/web/app/opengraph-image.tsx`:

```tsx
import { ImageResponse } from 'next/og';
import { ladybugDetailedSvg } from '@/components/brand/ladybug-svg';
import en from '@/messages/en.json';

export const alt = 'Bugping';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Manrope 800 subset for the given text; null when Google Fonts is unreachable (then the default font is used). */
async function manrope(text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await (
      await fetch(`https://fonts.googleapis.com/css2?family=Manrope:wght@800&text=${encodeURIComponent(text)}`)
    ).text();
    const url = /src: url\((.+?)\) format\('(?:opentype|truetype)'\)/.exec(css)?.[1];
    if (!url) return null;
    const response = await fetch(url);
    return response.ok ? await response.arrayBuffer() : null;
  } catch {
    return null;
  }
}

export default async function OpengraphImage() {
  const tagline = en.meta.description;
  const font = await manrope(`bugping${tagline}`);
  const mark = `data:image/svg+xml;base64,${Buffer.from(ladybugDetailedSvg('og')).toString('base64')}`;
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 96, background: '#fbf4f1', color: '#1a1414', fontFamily: font ? 'Manrope' : undefined }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <img src={mark} width={140} height={140} alt="" />
          <div style={{ fontSize: 120, fontWeight: 800, letterSpacing: -4 }}>bugping</div>
        </div>
        <div style={{ marginTop: 40, fontSize: 44, fontWeight: 800, lineHeight: 1.2, maxWidth: 960 }}>{tagline}</div>
        <div style={{ position: 'absolute', right: 96, top: 96, width: 28, height: 28, borderRadius: 14, background: '#ff4d3d' }} />
      </div>
    ),
    { ...size, fonts: font ? [{ name: 'Manrope', data: font, weight: 800, style: 'normal' }] : [] },
  );
}
```

If `en.meta.description` is not the right key path, use the key that `app/layout.tsx` passes to `description` in `generateMetadata`. If `@/messages/en.json` cannot be imported as JSON, add `"resolveJsonModule": true` only if the base tsconfig lacks it (check `tsconfig.base.json` first).

- [ ] **Step 5: Put the logo in the header and nav**

`app/(marketing)/layout.tsx`: replace the `<Link href="/" ...>Bugping</Link>` with `<Logo href="/" />` (import from `@/components/brand/logo`).
`components/app/app-shell.tsx`: in `Nav` replace the `<Link href="/app" ...>Bugping</Link>` with `<Logo href="/app" />`; in the mobile header replace `<span className="font-semibold">Bugping</span>` with `<Logo />`.

- [ ] **Step 6: Verify**

Run the Global Constraints verification set → all pass. Run `pnpm --filter @bugping/web build` and confirm the output lists `/icon.svg`, `/apple-icon`, `/opengraph-image`. Start `pnpm --filter @bugping/web dev` and open `/icon.svg`, `/apple-icon`, `/opengraph-image` and `/` in a browser (light and dark): the mark renders, the wordmark dot sits over the "ı". Stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "feat(web): ladybug logo, app icons and share image

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Login page

**Files:**
- Modify: `apps/web/app/login/page.tsx`, `apps/web/app/login/login-form.tsx`, `apps/web/app/login/actions.ts`
- Modify: `apps/web/messages/en.json`, `apps/web/messages/ru.json` (`auth` namespace)
- Create: `apps/web/e2e/login.spec.ts`

**Interfaces:**
- Consumes: `Logo` (Task 4), theme tokens (Task 3), `BUGPING_TEST_MODE` (Task 1), shadcn `Button`, `Input`, `Label`, `Card` from `@/components/ui/*`, icons from `lucide-react`.
- Produces: `LoginState = { status: 'idle' | 'sent' | 'error'; error?: string; email?: string }` — `email` is set when `status === 'sent'`.

Messages (`auth` namespace). Replace `title`, `github`, `emailSubmit`, `sent`; add the rest; keep `emailPlaceholder`, `emailInvalid`, `sendFailed`, `callbackFailed`, `oauthFailed`, `signOut` as they are:

| key | en | ru |
|---|---|---|
| `title` | `Sign in to Bugping` | `Вход в Bugping` |
| `subtitle` | `No account? One is created automatically.` | `Нет аккаунта? Он создастся автоматически.` |
| `github` | `Continue with GitHub` | `Войти через GitHub` |
| `orEmail` | `or with email` | `или по почте` |
| `emailLabel` | `Email` | `Email` |
| `emailSubmit` | `Send sign-in link` | `Прислать ссылку для входа` |
| `noPassword` | `No password: we'll email you a one-time link.` | `Без пароля: пришлём одноразовую ссылку.` |
| `sentTitle` | `Check your email` | `Проверьте почту` |
| `sent` | `We sent a sign-in link to {email}.` | `Мы отправили ссылку для входа на {email}.` |
| `differentEmail` | `Use a different email` | `Указать другой email` |
| `backToSite` | `Back to site` | `На сайт` |

- [ ] **Step 1: Test-mode short-circuit and the returned email**

In `actions.ts`, extend `LoginState` with `email?: string`. After the email is validated, before creating the Supabase client, add the same test-mode guard the codebase uses elsewhere (see `apps/web/lib/auth/session.ts`):

```ts
  if (getEnv().BUGPING_TEST_MODE === '1' && process.env.NODE_ENV !== 'production') {
    return { status: 'sent', email: email.data };
  }
```

and return `{ status: 'sent', email: email.data }` on success.

- [ ] **Step 2: Write the failing e2e spec**

`apps/web/e2e/login.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('login page links back to the site', async ({ page }) => {
  await page.goto('/login');
  await page.getByTestId('login-back').click();
  await expect(page).toHaveURL(/\/$/);
});

test('email sign-in shows the sent state and can start over', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByTestId('login-github')).toBeVisible();
  await page.getByTestId('login-email').fill('someone@example.com');
  await page.getByTestId('login-submit').click();
  const sent = page.getByTestId('login-sent');
  await expect(sent).toBeVisible();
  await expect(sent).toContainText('someone@example.com');
  await page.getByTestId('login-different-email').click();
  await expect(page.getByTestId('login-email')).toBeVisible();
  await expect(page.getByTestId('login-email')).toHaveValue('');
});

test('a failed callback shows an alert', async ({ page }) => {
  await page.goto('/login?error=callback');
  await expect(page.getByRole('alert')).toBeVisible();
});
```

Run: `pnpm --filter @bugping/web exec playwright test e2e/login.spec.ts`
Expected: FAIL (`login-back` not found).

- [ ] **Step 3: Rebuild the page**

`app/login/page.tsx` — keep the redirect-if-signed-in and `force-dynamic`; render:

```tsx
<main className="relative flex min-h-screen flex-col items-center justify-center gap-8 bg-muted bg-[radial-gradient(var(--input)_1px,transparent_1px)] bg-size-[18px_18px] p-4">
  <Link
    href="/"
    data-testid="login-back"
    className="absolute left-4 top-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
  >
    <ArrowLeft className="size-4" aria-hidden />
    {t('backToSite')}
  </Link>
  <Logo size="lg" href="/" />
  <LoginCard error={params.error === 'callback' ? t('callbackFailed') : params.error === 'oauth' ? t('oauthFailed') : undefined} />
</main>
```

`app/login/login-form.tsx` (client) exports `LoginCard({ error }: { error?: string })`:

- Holds `const [attempt, setAttempt] = useState(0)` and renders `<Card className="w-full max-w-[360px] p-6 shadow-[0_12px_40px_rgb(26_20_20/0.06)]">` containing `<LoginForm key={attempt} pageError={error} onRestart={() => setAttempt((n) => n + 1)} />`. Remounting via `key` resets the `useActionState` state, which is how "Use a different email" returns to an empty form.
- `LoginForm` uses `useActionState(sendMagicLink, { status: 'idle' })`.
- Sent state, wrapped in `<div data-testid="login-sent" className="flex flex-col items-center gap-3 text-center">`: `MailCheck` icon (`size-10 text-brand`), `<h1 className="text-xl font-extrabold tracking-tight">{t('sentTitle')}</h1>`, `<p className="text-sm text-muted-foreground">{t('sent', { email: state.email ?? '' })}</p>`, `<Button variant="outline" className="w-full" data-testid="login-different-email" onClick={onRestart}>{t('differentEmail')}</Button>`.
- Form state, in order:
  1. `<h1 className="text-xl font-extrabold tracking-tight">{t('title')}</h1>` and `<p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>`;
  2. an alert when `pageError` or `state.status === 'error'`: `<div role="alert" className="mt-4 flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"><CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />{message}</div>` (form error text: `t(state.error.replace('auth.', ''))`; if both exist, show the form error);
  3. `<form action={signInWithGitHub} className="mt-5">` with `<Button type="submit" size="lg" className="h-10 w-full bg-foreground text-background hover:bg-foreground/90" data-testid="login-github">` + inline GitHub SVG (`size-4`, `fill="currentColor"`, path from the mockup: GitHub mark 16×16) + `{t('github')}`;
  4. divider: `<div className="my-5 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />{t('orEmail')}<span className="h-px flex-1 bg-border" /></div>`;
  5. `<form action={action} className="flex flex-col gap-2">`: `<Label htmlFor="login-email">{t('emailLabel')}</Label>`, `<Input id="login-email" name="email" type="email" required autoComplete="email" placeholder={t('emailPlaceholder')} className="h-10" data-testid="login-email" />`, `<Button type="submit" size="lg" className="mt-1 h-10 w-full" disabled={pending} data-testid="login-submit">{pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}{t('emailSubmit')}</Button>`;
  6. `<p className="mt-4 text-center text-xs text-muted-foreground">{t('noPassword')}</p>`.

GitHub mark path (`viewBox="0 0 16 16"`):
`M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8z`

Add the message keys from the table to both `en.json` and `ru.json`.

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @bugping/web exec playwright test e2e/login.spec.ts` → PASS.
Run: `pnpm --filter @bugping/web e2e` → all e2e specs pass.
Run the Global Constraints verification set → all pass (includes `messages.test.ts`, which checks en/ru key parity).

- [ ] **Step 5: Visual check**

With the dev server running, open `/login` at desktop width and at 375 px, in light and dark theme, and `/login?error=oauth`. The card is centered, the dotted background is visible but faint, the GitHub button is dark in light theme and light in dark theme, the pending spinner shows on submit.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat(web): redesigned login page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
