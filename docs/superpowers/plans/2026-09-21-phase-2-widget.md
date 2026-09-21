# Phase 2: Embeddable Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `packages/widget`: a ≤20KB embeddable script (Shadow DOM trigger + corner panel, i18n, console/metadata capture, lazy screenshot module, `window.Dymcode` API) with a Vite dev page and mock API, unit/contract/E2E tests, and the small contract changes it needs (`locale`, `metadata.user`).

**Architecture:**
- The widget is plain TypeScript DOM code with a tiny `h()` helper.
- Pure units are tested with Vitest + happy-dom:
  - `i18n`, `console-buffer`, `metadata`, `api`, `screenshot-loader`, `public-api`;
  - the UI (`ui/*`) takes its side effects as injected `deps`, so these tests run without network or canvas.
- Two Vite builds produce `dist/widget.js` (IIFE) and `dist/screenshot.js` (ES module loaded with `import()`).
- A Vite dev server serves `dev/*.html` pages plus a mock API plugin that validates submissions with the shared zod schemas. Playwright runs the E2E smoke tests against the **built** bundle.

**Tech Stack:** TypeScript (strict), Vite (library mode), Vitest + happy-dom, modern-screenshot, size-limit, Playwright (Chromium), zod 4 via `@dymcode/shared` (tests and mock only), Supabase migrations tested on PGlite.

**Spec:** `docs/superpowers/specs/2026-09-21-widget-design.md` (refines §4 of `docs/superpowers/specs/2026-09-21-dymcode-design.md`).

## Global Constraints

- All code, comments, identifiers and docs are in English. Run `pnpm format` before every commit.
- `dist/widget.js` ≤ 20KB gzip; `dist/screenshot.js` ≤ 40KB gzip (size-limit, CI fails on excess).
- zod must never be bundled into `widget.js`. Widget runtime code may import from `@dymcode/shared` **only** with `import type`, plus runtime imports from `@dymcode/shared/constants` and `@dymcode/shared/brand`. Tests and `dev/` may import anything.
- Never use `innerHTML`/`outerHTML`/`insertAdjacentHTML` with data; build DOM with `h()` (text children become text nodes).
- No exception may escape into the host page: every entry point (bootstrap, event handlers, public API) is wrapped.
- Widget host: a `div[data-dymcode]` with inline style `all: initial` and an **open** shadow root. The trigger and panel use `z-index: 2147483000`.
- Locales: `auto | en | ru | uk | es`. Panel collapses into a bottom sheet below 480px viewport width.
- Phase-1 migrations are on `main` and frozen: schema changes go into a **new** migration file.
- Docker does not work on the dev machine: never run `supabase start` / `db:start` / `db:reset`; DB tests run with `pnpm db:test` (PGlite).
- Commit messages end with a blank line, then `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## File Map

| Path | Responsibility |
|---|---|
| `packages/shared/src/constants.ts` | + `WIDGET_LOCALES`, `WidgetLocale` |
| `packages/shared/src/schemas/config.ts` | + `locale` in `WidgetConfigSchema` |
| `packages/shared/src/schemas/metadata.ts` | + optional `user` in `ClientMetadataSchema` |
| `supabase/migrations/20260921000500_widget_locale.sql` | `projects.locale` + update grant |
| `packages/widget/package.json`, `tsconfig.json`, `vitest.config.ts` | Package setup |
| `packages/widget/src/env.d.ts` | `__WIDGET_VERSION__` declaration |
| `packages/widget/src/ui/h.ts` | DOM helper |
| `packages/widget/src/i18n.ts` | Dictionaries, `resolveLocale` |
| `packages/widget/src/context/console-buffer.ts` | Error ring buffer |
| `packages/widget/src/context/metadata.ts` | `collectMetadata`, `IdentifiedUser` |
| `packages/widget/src/api.ts` | `fetchConfig`, `submitFeedback`, `buildPayload` |
| `packages/widget/src/screenshot-loader.ts` | Memoized lazy `import()` of the screenshot module |
| `packages/widget/src/screenshot.ts` | `capture(exclude)` (separate bundle) |
| `packages/widget/src/ui/styles.css` | All widget CSS (shadow root only) |
| `packages/widget/src/ui/trigger.ts` | Floating button |
| `packages/widget/src/ui/panel.ts` | Panel: form, states, focus, screenshot, submit |
| `packages/widget/src/ui/mount.ts` | `mountWidget` (shadow root, locale, wiring) |
| `packages/widget/src/public-api.ts` | `window.Dymcode` object |
| `packages/widget/src/index.ts` | `boot(win, script)` |
| `packages/widget/src/entry.ts` | IIFE entry: calls `boot` with the current script |
| `packages/widget/vite.screenshot.config.ts`, `vite.widget.config.ts`, `vite.dev.config.ts` | Builds + dev server |
| `packages/widget/.size-limit.json`, `scripts/check-bundle.mjs` | Size and no-zod checks |
| `packages/widget/dev/*` | Dev pages, hostile CSS, mock API plugin |
| `packages/widget/playwright.config.ts`, `e2e/widget.spec.ts` | E2E smoke tests |
| `.github/workflows/ci.yml`, `README.md` | CI jobs, docs |

---

### Task 1: Contract changes: locale and identified user

**Files:**
- Modify: `packages/shared/src/constants.ts`, `packages/shared/src/schemas/config.ts`, `packages/shared/src/schemas/metadata.ts`
- Modify tests: `packages/shared/src/schemas/config.test.ts`, `packages/shared/src/schemas/submit.test.ts`
- Create: `supabase/migrations/20260921000500_widget_locale.sql`
- Modify tests: `supabase/tests/src/core-tables.test.ts`, `supabase/tests/src/access.test.ts`

**Interfaces:**
- Produces:
  - `WIDGET_LOCALES = ['auto', 'en', 'ru', 'uk', 'es'] as const` and `type WidgetLocale` (from `@dymcode/shared/constants`);
  - `WidgetConfig.locale: WidgetLocale`;
  - `ClientMetadata.user?: { id?: string; name?: string }`;
  - DB column `public.projects.locale public.widget_locale not null default 'auto'`, updatable by `authenticated`.

- [ ] **Step 1: Write failing shared tests**

In `packages/shared/src/schemas/config.test.ts`, add `locale: 'auto'` to the `valid` fixture object, then append inside the `describe`:
```ts
  it('accepts every supported locale', () => {
    for (const locale of ['auto', 'en', 'ru', 'uk', 'es']) {
      expect(parse({ locale }).success).toBe(true);
    }
  });

  it('rejects an unsupported locale', () => {
    expect(parse({ locale: 'de' }).success).toBe(false);
  });

  it('requires a locale', () => {
    const { locale: _, ...withoutLocale } = valid;
    expect(WidgetConfigSchema.safeParse(withoutLocale).success).toBe(false);
  });
```

In `packages/shared/src/schemas/submit.test.ts`, append inside the `describe`:
```ts
  it('accepts an identified user in metadata', () => {
    expect(parse({ metadata: { ...metadata, user: { id: 'u_1', name: 'Ann' } } }).success).toBe(true);
  });

  it('rejects an identified user id longer than 128 chars', () => {
    expect(parse({ metadata: { ...metadata, user: { id: 'x'.repeat(129) } } }).success).toBe(false);
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @dymcode/shared test`
Expected: FAIL: "rejects an unsupported locale", "requires a locale" and "rejects an identified user id longer than 128 chars" fail, because zod strips unknown keys, so these inputs still validate.

- [ ] **Step 3: Implement shared changes**

Append to `packages/shared/src/constants.ts`:
```ts
export const WIDGET_LOCALES = ['auto', 'en', 'ru', 'uk', 'es'] as const;
export type WidgetLocale = (typeof WIDGET_LOCALES)[number];
```

In `packages/shared/src/schemas/config.ts`, add `WIDGET_LOCALES` to the constants import and add the field after `badgeUrl`:
```ts
  badgeUrl: z.url(),
  locale: z.enum(WIDGET_LOCALES),
```

In `packages/shared/src/schemas/metadata.ts`, add after `consoleErrors`:
```ts
  consoleErrors: z.array(ConsoleErrorSchema).max(CONSOLE_ERRORS_MAX),
  /** Set by `Dymcode.identify()` on the host page. */
  user: z
    .object({ id: z.string().max(128).optional(), name: z.string().max(128).optional() })
    .optional(),
```

- [ ] **Step 4: Verify shared tests pass**

Run: `pnpm --filter @dymcode/shared test`
Expected: PASS.

- [ ] **Step 5: Write failing DB tests**

In `supabase/tests/src/core-tables.test.ts`, inside `describe('projects', ...)`, append:
```ts
  it('defaults locale to auto', () =>
    withTx(async (db) => {
      const owner = await createUser(db);
      const { id } = await createProject(db, owner);
      const rows = await db.query('select locale from public.projects where id = $1', [id]);
      expect(rows).toEqual([{ locale: 'auto' }]);
    }));

  it('rejects an unsupported locale', () =>
    withTx(async (db) => {
      const owner = await createUser(db);
      const error = await db.queryError(
        `insert into public.projects (owner_id, name, locale) values ($1, 'x', 'de')`,
        [owner],
      );
      expect(error).toMatch(/invalid input value for enum widget_locale/);
    }));
```

In `supabase/tests/src/access.test.ts`, inside `describe('projects access', ...)`, append (it uses the file's existing `seed(db)` helper, which returns `{ a, projectA, ... }`):
```ts
  it('allows the owner to update locale', () =>
    withTx(async (db) => {
      const { a, projectA } = await seed(db);
      await db.asUser(a);
      const rows = await db.query(
        `update public.projects set locale = 'uk' where id = $1 returning locale`,
        [projectA.id],
      );
      expect(rows).toEqual([{ locale: 'uk' }]);
    }));
```

- [ ] **Step 6: Run to verify they fail**

Run: `pnpm db:test`
Expected: FAIL with `column "locale" does not exist`.

- [ ] **Step 7: Write the migration**

`supabase/migrations/20260921000500_widget_locale.sql`:
```sql
-- Widget UI language chosen by the project owner ('auto' = visitor's browser language).
create type public.widget_locale as enum ('auto', 'en', 'ru', 'uk', 'es');

alter table public.projects
  add column locale public.widget_locale not null default 'auto';

-- Settings column: owners may change it from the dashboard.
grant update (locale) on public.projects to authenticated;
```

- [ ] **Step 8: Verify everything passes**

Run: `pnpm db:test`
Expected: PASS.
Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
pnpm format
git add packages/shared supabase
git commit -m "feat(shared,db): add widget locale and identified user to the contract"
```

---

### Task 2: Widget package scaffold, `h()` and i18n

**Files:**
- Create: `packages/widget/package.json`, `packages/widget/tsconfig.json`, `packages/widget/vitest.config.ts`, `packages/widget/src/env.d.ts`
- Create: `packages/widget/src/ui/h.ts`, `packages/widget/src/i18n.ts`
- Test: `packages/widget/src/ui/h.test.ts`, `packages/widget/src/i18n.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // ui/h.ts
  type Attrs = Record<string, string | number | boolean | EventListener | undefined>;
  type Child = Node | string | null | undefined | false;
  function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs, ...children: Child[]): HTMLElementTagNameMap[K];
  // i18n.ts
  type Locale = 'en' | 'ru' | 'uk' | 'es';
  interface Messages { title; types: Record<FeedbackType, string>; placeholders: Record<FeedbackType, string>;
    emailLabel; emailPlaceholder; screenshot; screenshotUnavailable; send; sending; thanks;
    errorRequired; errorEmail; errorRateLimited; errorInvalid; errorNetwork; retry; close; poweredBy } // all strings
  const MESSAGES: Record<Locale, Messages>;
  function resolveLocale(configured: WidgetLocale, languages: readonly string[]): Locale;
  ```
- Package scripts: `test`, `typecheck` (more scripts are added in Task 8).

- [ ] **Step 1: Create the package**

`packages/widget/package.json`:
```json
{
  "name": "@dymcode/widget",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/ui/mount.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

Run:
```bash
pnpm --filter @dymcode/widget add -D "@dymcode/shared@workspace:*" typescript vitest happy-dom vite @types/node@^24
```

`packages/widget/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "types": ["vite/client", "node"]
  },
  "include": ["src", "dev", "e2e", "*.config.ts"]
}
```

`packages/widget/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __WIDGET_VERSION__: JSON.stringify('test') },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
    environmentOptions: { happyDOM: { url: 'https://host.example/pricing?plan=pro' } },
  },
});
```

`packages/widget/src/env.d.ts`:
```ts
/** Package version plus a short hash of the screenshot bundle; injected at build time. */
declare const __WIDGET_VERSION__: string;
```

- [ ] **Step 2: Write failing tests**

`packages/widget/src/ui/h.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { h } from './h';

describe('h', () => {
  it('sets attributes and skips false/undefined', () => {
    const el = h('input', { type: 'email', maxlength: 10, required: true, disabled: false, title: undefined });
    expect(el.getAttribute('type')).toBe('email');
    expect(el.getAttribute('maxlength')).toBe('10');
    expect(el.hasAttribute('required')).toBe(true);
    expect(el.hasAttribute('disabled')).toBe(false);
    expect(el.hasAttribute('title')).toBe(false);
  });

  it('binds on* functions as event listeners', () => {
    const onClick = vi.fn();
    const el = h('button', { onclick: onClick });
    el.click();
    expect(onClick).toHaveBeenCalledOnce();
    expect(el.hasAttribute('onclick')).toBe(false);
  });

  it('renders string children as text, never as HTML', () => {
    const el = h('span', {}, '<img src=x onerror=alert(1)>');
    expect(el.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(el.querySelector('img')).toBeNull();
  });

  it('appends node children and skips empty ones', () => {
    const el = h('div', {}, h('b', {}, 'x'), null, undefined, false, 'y');
    expect(el.childNodes).toHaveLength(2);
    expect(el.textContent).toBe('xy');
  });
});
```

`packages/widget/src/i18n.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { MESSAGES, resolveLocale } from './i18n';

describe('resolveLocale', () => {
  it('returns the configured locale when not auto', () => {
    expect(resolveLocale('ru', ['en-US'])).toBe('ru');
  });

  it('matches the primary subtag of browser languages', () => {
    expect(resolveLocale('auto', ['uk-UA', 'en'])).toBe('uk');
    expect(resolveLocale('auto', ['ES'])).toBe('es');
  });

  it('skips unsupported languages', () => {
    expect(resolveLocale('auto', ['de-DE', 'ru-RU'])).toBe('ru');
  });

  it('falls back to en', () => {
    expect(resolveLocale('auto', ['de-DE'])).toBe('en');
    expect(resolveLocale('auto', [])).toBe('en');
  });
});

describe('MESSAGES', () => {
  const flatten = (m: object): Record<string, string> =>
    Object.fromEntries(
      Object.entries(m).flatMap(([k, v]) =>
        typeof v === 'string' ? [[k, v]] : Object.entries(v).map(([k2, v2]) => [`${k}.${k2}`, v2]),
      ),
    );

  it('has the same non-empty keys in every locale', () => {
    const reference = Object.keys(flatten(MESSAGES.en)).sort();
    for (const messages of Object.values(MESSAGES)) {
      const flat = flatten(messages);
      expect(Object.keys(flat).sort()).toEqual(reference);
      for (const value of Object.values(flat)) expect(value.trim()).not.toBe('');
    }
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `pnpm --filter @dymcode/widget test`
Expected: FAIL with "Failed to resolve import './h'" and "'./i18n'".

- [ ] **Step 4: Implement**

`packages/widget/src/ui/h.ts`:
```ts
type Attrs = Record<string, string | number | boolean | EventListener | undefined>;
type Child = Node | string | null | undefined | false;

/**
 * Creates an element. `on*` function attributes become event listeners; string children become
 * text nodes, so data can never be parsed as HTML.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      el.setAttribute(key, value === true ? '' : String(value));
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return el;
}
```

`packages/widget/src/i18n.ts`:
```ts
import type { FeedbackType, WidgetLocale } from '@dymcode/shared/constants';

export type Locale = Exclude<WidgetLocale, 'auto'>;

export interface Messages {
  title: string;
  types: Record<FeedbackType, string>;
  placeholders: Record<FeedbackType, string>;
  emailLabel: string;
  emailPlaceholder: string;
  screenshot: string;
  screenshotUnavailable: string;
  send: string;
  sending: string;
  thanks: string;
  errorRequired: string;
  errorEmail: string;
  errorRateLimited: string;
  errorInvalid: string;
  errorNetwork: string;
  retry: string;
  close: string;
  /** Prefix before the product name in the badge. */
  poweredBy: string;
}

export const MESSAGES: Record<Locale, Messages> = {
  en: {
    title: 'Send feedback',
    types: { bug: 'Bug', idea: 'Idea', general: 'Other' },
    placeholders: {
      bug: 'What happened?',
      idea: "What's your idea?",
      general: "What's on your mind?",
    },
    emailLabel: 'Email (optional)',
    emailPlaceholder: 'you@example.com',
    screenshot: 'Attach screenshot',
    screenshotUnavailable: 'Screenshot unavailable',
    send: 'Send',
    sending: 'Sending…',
    thanks: 'Thanks! Your feedback was sent.',
    errorRequired: 'Write a message first.',
    errorEmail: 'Check the email address.',
    errorRateLimited: 'Too many submissions. Try again later.',
    errorInvalid: "Couldn't send. Try again later.",
    errorNetwork: "Couldn't send. Check your connection.",
    retry: 'Retry',
    close: 'Close',
    poweredBy: 'Powered by',
  },
  ru: {
    title: 'Отправить отзыв',
    types: { bug: 'Баг', idea: 'Идея', general: 'Другое' },
    placeholders: {
      bug: 'Что случилось?',
      idea: 'Какая у вас идея?',
      general: 'Что вы хотите сказать?',
    },
    emailLabel: 'Email (необязательно)',
    emailPlaceholder: 'you@example.com',
    screenshot: 'Приложить скриншот',
    screenshotUnavailable: 'Скриншот недоступен',
    send: 'Отправить',
    sending: 'Отправка…',
    thanks: 'Спасибо! Отзыв отправлен.',
    errorRequired: 'Сначала напишите сообщение.',
    errorEmail: 'Проверьте адрес email.',
    errorRateLimited: 'Слишком много отправок. Попробуйте позже.',
    errorInvalid: 'Не удалось отправить. Попробуйте позже.',
    errorNetwork: 'Не удалось отправить. Проверьте подключение.',
    retry: 'Повторить',
    close: 'Закрыть',
    poweredBy: 'Работает на',
  },
  uk: {
    title: 'Надіслати відгук',
    types: { bug: 'Баг', idea: 'Ідея', general: 'Інше' },
    placeholders: {
      bug: 'Що сталося?',
      idea: 'Яка у вас ідея?',
      general: 'Що ви хочете сказати?',
    },
    emailLabel: 'Email (необовʼязково)',
    emailPlaceholder: 'you@example.com',
    screenshot: 'Додати скриншот',
    screenshotUnavailable: 'Скриншот недоступний',
    send: 'Надіслати',
    sending: 'Надсилання…',
    thanks: 'Дякуємо! Відгук надіслано.',
    errorRequired: 'Спершу напишіть повідомлення.',
    errorEmail: 'Перевірте адресу email.',
    errorRateLimited: 'Забагато надсилань. Спробуйте пізніше.',
    errorInvalid: 'Не вдалося надіслати. Спробуйте пізніше.',
    errorNetwork: 'Не вдалося надіслати. Перевірте зʼєднання.',
    retry: 'Повторити',
    close: 'Закрити',
    poweredBy: 'Працює на',
  },
  es: {
    title: 'Enviar comentarios',
    types: { bug: 'Error', idea: 'Idea', general: 'Otro' },
    placeholders: {
      bug: '¿Qué ha pasado?',
      idea: '¿Cuál es tu idea?',
      general: '¿Qué quieres contarnos?',
    },
    emailLabel: 'Email (opcional)',
    emailPlaceholder: 'tu@ejemplo.com',
    screenshot: 'Adjuntar captura',
    screenshotUnavailable: 'Captura no disponible',
    send: 'Enviar',
    sending: 'Enviando…',
    thanks: '¡Gracias! Comentario enviado.',
    errorRequired: 'Escribe un mensaje primero.',
    errorEmail: 'Revisa el email.',
    errorRateLimited: 'Demasiados envíos. Inténtalo más tarde.',
    errorInvalid: 'No se pudo enviar. Inténtalo más tarde.',
    errorNetwork: 'No se pudo enviar. Revisa tu conexión.',
    retry: 'Reintentar',
    close: 'Cerrar',
    poweredBy: 'Con tecnología de',
  },
};

const SUPPORTED = Object.keys(MESSAGES) as Locale[];

/** Owner's choice wins; `auto` picks the first supported browser language, else English. */
export function resolveLocale(configured: WidgetLocale, languages: readonly string[]): Locale {
  if (configured !== 'auto') return configured;
  for (const tag of languages) {
    const primary = tag.toLowerCase().split('-')[0] as Locale;
    if (SUPPORTED.includes(primary)) return primary;
  }
  return 'en';
}
```

- [ ] **Step 5: Verify**

Run: `pnpm --filter @dymcode/widget test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
pnpm format
git add packages/widget pnpm-lock.yaml
git commit -m "feat(widget): scaffold package with DOM helper and i18n"
```

---

### Task 3: Console buffer and metadata

**Files:**
- Create: `packages/widget/src/context/console-buffer.ts`, `packages/widget/src/context/metadata.ts`
- Test: `packages/widget/src/context/console-buffer.test.ts`, `packages/widget/src/context/metadata.test.ts`

**Interfaces:**
- Consumes: `CONSOLE_ERRORS_MAX`, `CONSOLE_ERROR_MESSAGE_MAX_LENGTH` (`@dymcode/shared/constants`); types `ConsoleError`, `ClientMetadata` (`@dymcode/shared`, type-only).
- Produces:
  ```ts
  interface ConsoleBuffer { entries(): ConsoleError[]; dispose(): void }
  function installConsoleBuffer(win: Window, ownScriptUrl: string): ConsoleBuffer;
  interface IdentifiedUser { email?: string; id?: string; name?: string }
  function collectMetadata(win: Window, consoleErrors: ConsoleError[], user?: IdentifiedUser): ClientMetadata;
  ```

- [ ] **Step 1: Write failing tests**

`packages/widget/src/context/console-buffer.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installConsoleBuffer, type ConsoleBuffer } from './console-buffer';

const OWN = 'https://dymcode.dev/w/widget.js';

describe('installConsoleBuffer', () => {
  let buffer: ConsoleBuffer;
  let original: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    original = vi.fn();
    console.error = original as unknown as typeof console.error;
    buffer = installConsoleBuffer(window, OWN);
  });

  afterEach(() => buffer.dispose());

  it('records window error events with source and line', () => {
    window.dispatchEvent(
      new ErrorEvent('error', { message: 'boom', filename: 'https://host.example/app.js', lineno: 7 }),
    );
    expect(buffer.entries()).toEqual([
      { message: 'boom', source: 'https://host.example/app.js', line: 7, at: expect.any(Number) },
    ]);
  });

  it('records unhandled rejections', () => {
    window.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: new TypeError('nope') }));
    expect(buffer.entries()[0]?.message).toBe('TypeError: nope');
  });

  it('records console.error and still calls the original', () => {
    console.error('failed to load', { id: 3 });
    expect(original).toHaveBeenCalledWith('failed to load', { id: 3 });
    expect(buffer.entries()[0]?.message).toBe('failed to load {"id":3}');
  });

  it('keeps only the last 10 entries', () => {
    for (let i = 0; i < 12; i++) console.error(`e${i}`);
    const messages = buffer.entries().map((e) => e.message);
    expect(messages).toHaveLength(10);
    expect(messages[0]).toBe('e2');
    expect(messages[9]).toBe('e11');
  });

  it('truncates messages to 500 chars', () => {
    console.error('x'.repeat(600));
    expect(buffer.entries()[0]?.message).toHaveLength(500);
  });

  it('ignores errors coming from the widget itself', () => {
    window.dispatchEvent(new ErrorEvent('error', { message: 'ours', filename: OWN, lineno: 1 }));
    const err = new Error('ours too');
    err.stack = `Error: ours too\n    at x (${OWN}:1:2)`;
    console.error(err);
    expect(buffer.entries()).toEqual([]);
  });

  it('dispose restores console.error and stops recording', () => {
    buffer.dispose();
    expect(console.error).toBe(original);
    window.dispatchEvent(new ErrorEvent('error', { message: 'late' }));
    expect(buffer.entries()).toEqual([]);
  });
});
```

`packages/widget/src/context/metadata.test.ts`:
```ts
import { ClientMetadataSchema } from '@dymcode/shared';
import { describe, expect, it } from 'vitest';
import { collectMetadata } from './metadata';

describe('collectMetadata', () => {
  it('collects page context in the shared contract shape', () => {
    const meta = collectMetadata(window, [{ message: 'boom', at: 1 }]);
    expect(meta.url).toBe('https://host.example/pricing?plan=pro');
    expect(meta.consoleErrors).toEqual([{ message: 'boom', at: 1 }]);
    expect(meta.user).toBeUndefined();
    expect(ClientMetadataSchema.safeParse(meta).success).toBe(true);
  });

  it('includes identified id and name but never the email', () => {
    const meta = collectMetadata(window, [], { email: 'a@b.co', id: 'u_1', name: 'Ann' });
    expect(meta.user).toEqual({ id: 'u_1', name: 'Ann' });
    expect(ClientMetadataSchema.safeParse(meta).success).toBe(true);
  });

  it('omits user when only an email was identified', () => {
    expect(collectMetadata(window, [], { email: 'a@b.co' }).user).toBeUndefined();
  });

  it('truncates identified fields to 128 chars', () => {
    const meta = collectMetadata(window, [], { id: 'i'.repeat(200) });
    expect(meta.user?.id).toHaveLength(128);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @dymcode/widget test`
Expected: FAIL with "Failed to resolve import './console-buffer'" / "'./metadata'".

- [ ] **Step 3: Implement**

`packages/widget/src/context/console-buffer.ts`:
```ts
import type { ConsoleError } from '@dymcode/shared';
import { CONSOLE_ERRORS_MAX, CONSOLE_ERROR_MESSAGE_MAX_LENGTH } from '@dymcode/shared/constants';

export interface ConsoleBuffer {
  entries(): ConsoleError[];
  dispose(): void;
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** Keeps the last few host-page errors so reports carry context. Never throws. */
export function installConsoleBuffer(win: Window, ownScriptUrl: string): ConsoleBuffer {
  const ring: ConsoleError[] = [];

  const push = (message: string, source?: string, line?: number, stack?: string) => {
    try {
      if (ownScriptUrl && (source?.includes(ownScriptUrl) || stack?.includes(ownScriptUrl))) return;
      const entry: ConsoleError = {
        message: message.slice(0, CONSOLE_ERROR_MESSAGE_MAX_LENGTH),
        at: Date.now(),
      };
      if (source) entry.source = source.slice(0, 2048);
      if (line !== undefined && Number.isInteger(line) && line >= 0) entry.line = line;
      ring.push(entry);
      if (ring.length > CONSOLE_ERRORS_MAX) ring.shift();
    } catch {
      // Recording must never break the host page.
    }
  };

  const onError = (event: ErrorEvent) => {
    const message = event.message || stringify(event.error);
    push(message, event.filename || undefined, event.lineno || undefined, event.error?.stack);
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    push(stringify(event.reason), undefined, undefined, event.reason?.stack);
  };

  const original = win.console.error;
  const wrapped = function (this: unknown, ...args: unknown[]) {
    const error = args.find((arg): arg is Error => arg instanceof Error);
    push(args.map(stringify).join(' '), undefined, undefined, error?.stack);
    return original.apply(this, args);
  } as typeof console.error;

  win.addEventListener('error', onError);
  win.addEventListener('unhandledrejection', onRejection);
  win.console.error = wrapped;

  return {
    entries: () => ring.slice(),
    dispose() {
      win.removeEventListener('error', onError);
      win.removeEventListener('unhandledrejection', onRejection);
      if (win.console.error === wrapped) win.console.error = original;
      ring.length = 0;
    },
  };
}
```

Note: `ConsoleError` properties `source`/`line` are optional in the zod-inferred type, so assigning them after creation typechecks.

`packages/widget/src/context/metadata.ts`:
```ts
import type { ClientMetadata, ConsoleError } from '@dymcode/shared';

/** What the host page passed to `Dymcode.identify()`. */
export interface IdentifiedUser {
  email?: string;
  id?: string;
  name?: string;
}

const clampDimension = (value: number) => Math.min(Math.max(Math.round(value) || 0, 0), 100_000);

function timezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    return '';
  }
}

/** Snapshot of page context taken at submit time. The email travels in the payload, not here. */
export function collectMetadata(
  win: Window,
  consoleErrors: ConsoleError[],
  user?: IdentifiedUser,
): ClientMetadata {
  const dpr = win.devicePixelRatio > 0 ? Math.min(win.devicePixelRatio, 10) : 1;
  const meta: ClientMetadata = {
    url: win.location.href.slice(0, 2048),
    referrer: win.document.referrer.slice(0, 2048),
    userAgent: win.navigator.userAgent.slice(0, 1024),
    language: (win.navigator.language || '').slice(0, 35),
    timezone: timezone().slice(0, 64),
    viewport: { w: clampDimension(win.innerWidth), h: clampDimension(win.innerHeight) },
    screen: { w: clampDimension(win.screen.width), h: clampDimension(win.screen.height), dpr },
    consoleErrors,
  };
  const id = user?.id?.slice(0, 128);
  const name = user?.name?.slice(0, 128);
  if (id || name) meta.user = { ...(id ? { id } : {}), ...(name ? { name } : {}) };
  return meta;
}
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter @dymcode/widget test && pnpm typecheck`
Expected: PASS. If happy-dom lacks `ErrorEvent`, report it rather than rewriting the tests; the implementation must keep using real `error` events.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add packages/widget
git commit -m "feat(widget): add console error buffer and metadata collection"
```

---

### Task 4: API client

**Files:**
- Create: `packages/widget/src/api.ts`
- Test: `packages/widget/src/api.test.ts`

**Interfaces:**
- Consumes: `HEX_COLOR_PATTERN`, `WIDGET_POSITIONS`, `WIDGET_LOCALES` (`@dymcode/shared/constants`); types `WidgetConfig`, `SubmitPayload`, `ClientMetadata`, `FeedbackType`.
- Produces:
  ```ts
  type SubmitResult = { ok: true } | { ok: false; reason: 'rate_limited' | 'invalid' | 'server' | 'network' };
  function fetchConfig(apiOrigin: string, projectKey: string, fetchImpl?: typeof fetch): Promise<WidgetConfig | null>;
  function submitFeedback(apiOrigin: string, payload: SubmitPayload, screenshot: Blob | null, fetchImpl?: typeof fetch): Promise<SubmitResult>;
  function buildPayload(input: { projectKey: string; type: FeedbackType; message: string; email: string;
    metadata: ClientMetadata; elapsedMs: number; website: string }): SubmitPayload;
  ```

- [ ] **Step 1: Write failing tests**

`packages/widget/src/api.test.ts`:
```ts
import { SubmitPayloadSchema, type ClientMetadata, type WidgetConfig } from '@dymcode/shared';
import { describe, expect, it, vi } from 'vitest';
import { buildPayload, fetchConfig, submitFeedback } from './api';

const ORIGIN = 'https://dymcode.dev';
const config: WidgetConfig = {
  primaryColor: '#6366f1',
  triggerText: 'Feedback',
  position: 'bottom-right',
  showBadge: true,
  customCss: null,
  badgeUrl: 'https://dymcode.dev/?ref=pk_AbCdEfGh12345678&utm_source=widget',
  locale: 'auto',
};
const metadata: ClientMetadata = {
  url: 'https://host.example/',
  referrer: '',
  userAgent: 'UA',
  language: 'en',
  timezone: 'UTC',
  viewport: { w: 1280, h: 720 },
  screen: { w: 1920, h: 1080, dpr: 1 },
  consoleErrors: [],
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('fetchConfig', () => {
  it('requests the config for the key and returns it', async () => {
    const fetchImpl = vi.fn(async () => json(config));
    await expect(fetchConfig(ORIGIN, 'pk_AbCdEfGh12345678', fetchImpl)).resolves.toEqual(config);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dymcode.dev/api/v1/widget/config?key=pk_AbCdEfGh12345678',
      { credentials: 'omit' },
    );
  });

  it('returns null on non-2xx, network errors and malformed bodies', async () => {
    await expect(fetchConfig(ORIGIN, 'k', async () => json({}, 404))).resolves.toBeNull();
    await expect(
      fetchConfig(ORIGIN, 'k', async () => {
        throw new TypeError('offline');
      }),
    ).resolves.toBeNull();
    await expect(
      fetchConfig(ORIGIN, 'k', async () => json({ ...config, primaryColor: 'red;}body{x' })),
    ).resolves.toBeNull();
    await expect(fetchConfig(ORIGIN, 'k', async () => json({ ...config, locale: 'de' }))).resolves.toBeNull();
    await expect(fetchConfig(ORIGIN, 'k', async () => new Response('not json'))).resolves.toBeNull();
  });
});

describe('submitFeedback', () => {
  const payload = buildPayload({
    projectKey: 'pk_AbCdEfGh12345678',
    type: 'bug',
    message: 'Broken',
    email: '',
    metadata,
    elapsedMs: 5000,
    website: '',
  });

  it('posts multipart with payload JSON and the screenshot', async () => {
    const fetchImpl = vi.fn(async () => json({ id: 'x' }, 201));
    const shot = new Blob(['img'], { type: 'image/webp' });
    await expect(submitFeedback(ORIGIN, payload, shot, fetchImpl)).resolves.toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://dymcode.dev/api/v1/widget/submit');
    expect(init.method).toBe('POST');
    const body = init.body as FormData;
    expect(JSON.parse(String(body.get('payload')))).toEqual(payload);
    expect((body.get('screenshot') as File).type).toBe('image/webp');
  });

  it('omits the screenshot field when there is none', async () => {
    const fetchImpl = vi.fn(async () => json({ id: null }, 200));
    await expect(submitFeedback(ORIGIN, payload, null, fetchImpl)).resolves.toEqual({ ok: true });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.body as FormData).has('screenshot')).toBe(false);
  });

  it('maps failures to reasons', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(submitFeedback(ORIGIN, payload, null, async () => json({}, 429))).resolves.toEqual({
      ok: false,
      reason: 'rate_limited',
    });
    await expect(
      submitFeedback(ORIGIN, payload, null, async () => json({ issues: ['bad'] }, 400)),
    ).resolves.toEqual({ ok: false, reason: 'invalid' });
    expect(warn).toHaveBeenCalledOnce();
    await expect(submitFeedback(ORIGIN, payload, null, async () => json({}, 503))).resolves.toEqual({
      ok: false,
      reason: 'server',
    });
    await expect(
      submitFeedback(ORIGIN, payload, null, async () => {
        throw new TypeError('offline');
      }),
    ).resolves.toEqual({ ok: false, reason: 'network' });
    warn.mockRestore();
  });
});

describe('buildPayload', () => {
  it('trims text, drops a blank email and satisfies the shared contract', () => {
    const payload = buildPayload({
      projectKey: 'pk_AbCdEfGh12345678',
      type: 'idea',
      message: '  Dark mode please  ',
      email: '   ',
      metadata: { ...metadata, user: { id: 'u_1' } },
      elapsedMs: 3210.6,
      website: '',
    });
    expect(payload.message).toBe('Dark mode please');
    expect('email' in payload).toBe(false);
    expect(payload.elapsedMs).toBe(3211);
    expect(SubmitPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it('keeps a provided email', () => {
    const payload = buildPayload({
      projectKey: 'pk_AbCdEfGh12345678',
      type: 'bug',
      message: 'x',
      email: ' ann@example.com ',
      metadata,
      elapsedMs: 2500,
      website: '',
    });
    expect(payload.email).toBe('ann@example.com');
    expect(SubmitPayloadSchema.safeParse(payload).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @dymcode/widget test`
Expected: FAIL with "Failed to resolve import './api'".

- [ ] **Step 3: Implement**

`packages/widget/src/api.ts`:
```ts
import type { ClientMetadata, SubmitPayload, WidgetConfig } from '@dymcode/shared';
import {
  HEX_COLOR_PATTERN,
  WIDGET_LOCALES,
  WIDGET_POSITIONS,
  type FeedbackType,
} from '@dymcode/shared/constants';

export type SubmitResult =
  | { ok: true }
  | { ok: false; reason: 'rate_limited' | 'invalid' | 'server' | 'network' };

/** Structural check without zod; the color is re-validated because it is injected into CSS. */
function isWidgetConfig(value: unknown): value is WidgetConfig {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.primaryColor === 'string' &&
    HEX_COLOR_PATTERN.test(c.primaryColor) &&
    typeof c.triggerText === 'string' &&
    c.triggerText.length > 0 &&
    (WIDGET_POSITIONS as readonly unknown[]).includes(c.position) &&
    typeof c.showBadge === 'boolean' &&
    (c.customCss === null || typeof c.customCss === 'string') &&
    typeof c.badgeUrl === 'string' &&
    (WIDGET_LOCALES as readonly unknown[]).includes(c.locale)
  );
}

export async function fetchConfig(
  apiOrigin: string,
  projectKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<WidgetConfig | null> {
  try {
    const url = `${apiOrigin}/api/v1/widget/config?key=${encodeURIComponent(projectKey)}`;
    const response = await fetchImpl(url, { credentials: 'omit' });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    return isWidgetConfig(body) ? body : null;
  } catch {
    return null;
  }
}

export async function submitFeedback(
  apiOrigin: string,
  payload: SubmitPayload,
  screenshot: Blob | null,
  fetchImpl: typeof fetch = fetch,
): Promise<SubmitResult> {
  const body = new FormData();
  body.append('payload', JSON.stringify(payload));
  if (screenshot) {
    body.append('screenshot', screenshot, screenshot.type === 'image/webp' ? 'screenshot.webp' : 'screenshot.jpg');
  }
  try {
    const response = await fetchImpl(`${apiOrigin}/api/v1/widget/submit`, {
      method: 'POST',
      body,
      credentials: 'omit',
    });
    if (response.ok) return { ok: true };
    if (response.status === 429) return { ok: false, reason: 'rate_limited' };
    if (response.status < 500) {
      console.warn('[Dymcode] submission rejected:', await response.text().catch(() => ''));
      return { ok: false, reason: 'invalid' };
    }
    return { ok: false, reason: 'server' };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export function buildPayload(input: {
  projectKey: string;
  type: FeedbackType;
  message: string;
  email: string;
  metadata: ClientMetadata;
  elapsedMs: number;
  website: string;
}): SubmitPayload {
  const email = input.email.trim();
  return {
    projectKey: input.projectKey,
    type: input.type,
    message: input.message.trim(),
    ...(email ? { email } : {}),
    metadata: input.metadata,
    elapsedMs: Math.max(0, Math.round(input.elapsedMs)),
    website: input.website,
  };
}
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter @dymcode/widget test && pnpm typecheck`
Expected: PASS, and the output shows no stray `console.warn` lines (the test spies on it).

- [ ] **Step 5: Commit**

```bash
pnpm format
git add packages/widget
git commit -m "feat(widget): add config and submit API client"
```

---

### Task 5: Screenshot module and lazy loader

**Files:**
- Create: `packages/widget/src/screenshot-loader.ts`, `packages/widget/src/screenshot.ts`
- Test: `packages/widget/src/screenshot-loader.test.ts`

**Interfaces:**
- Consumes: `SCREENSHOT_MAX_BYTES` (`@dymcode/shared/constants`).
- Produces:
  ```ts
  type CaptureFn = (exclude: Element) => Promise<Blob | null>;
  function createScreenshotLoader(moduleUrl: string, importer?: (url: string) => Promise<unknown>): () => Promise<CaptureFn | null>; // memoized
  // screenshot.ts (separate bundle)
  export function capture(exclude: Element): Promise<Blob | null>;
  ```
- `capture` is exercised by the E2E test in Task 9 (happy-dom has no canvas); this task only type-checks it.

- [ ] **Step 1: Write failing loader tests**

`packages/widget/src/screenshot-loader.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { createScreenshotLoader } from './screenshot-loader';

describe('createScreenshotLoader', () => {
  it('imports the module once and returns its capture function', async () => {
    const capture = vi.fn(async () => null);
    const importer = vi.fn(async () => ({ capture }));
    const load = createScreenshotLoader('https://dymcode.dev/w/screenshot.js?v=1', importer);
    await expect(load()).resolves.toBe(capture);
    await expect(load()).resolves.toBe(capture);
    expect(importer).toHaveBeenCalledOnce();
    expect(importer).toHaveBeenCalledWith('https://dymcode.dev/w/screenshot.js?v=1');
  });

  it('resolves null when the import fails or has no capture export', async () => {
    const failing = createScreenshotLoader('u', async () => {
      throw new Error('blocked by CSP');
    });
    await expect(failing()).resolves.toBeNull();
    const empty = createScreenshotLoader('u', async () => ({}));
    await expect(empty()).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @dymcode/widget test`
Expected: FAIL with "Failed to resolve import './screenshot-loader'".

- [ ] **Step 3: Implement the loader**

`packages/widget/src/screenshot-loader.ts`:
```ts
export type CaptureFn = (exclude: Element) => Promise<Blob | null>;

const nativeImport = (url: string): Promise<unknown> => import(/* @vite-ignore */ url);

/** Loads the screenshot bundle on first use; any failure means "no screenshot", never an error. */
export function createScreenshotLoader(
  moduleUrl: string,
  importer: (url: string) => Promise<unknown> = nativeImport,
): () => Promise<CaptureFn | null> {
  let pending: Promise<CaptureFn | null> | undefined;
  return () =>
    (pending ??= importer(moduleUrl).then(
      (mod) => {
        const capture = (mod as { capture?: unknown } | null)?.capture;
        return typeof capture === 'function' ? (capture as CaptureFn) : null;
      },
      () => null,
    ));
}
```

- [ ] **Step 4: Implement the screenshot module**

Run: `pnpm --filter @dymcode/widget add modern-screenshot`

`packages/widget/src/screenshot.ts`:
```ts
import { SCREENSHOT_MAX_BYTES } from '@dymcode/shared/constants';
import { domToCanvas } from 'modern-screenshot';

const MAX_WIDTH = 1600;
const MASK_SELECTOR = 'input[type="password"], [data-feedback-mask]';

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Captures the visible viewport without `exclude` (the widget host). Sensitive elements are
 * painted over. Returns null on any failure or if the image is too large.
 */
export async function capture(exclude: Element): Promise<Blob | null> {
  try {
    const view = {
      x: window.scrollX,
      y: window.scrollY,
      w: window.innerWidth,
      h: window.innerHeight,
    };
    const masks = Array.from(document.querySelectorAll(MASK_SELECTOR), (el) =>
      el.getBoundingClientRect(),
    );
    const scale = Math.min(1, MAX_WIDTH / view.w);
    const page = await domToCanvas(document.documentElement, {
      scale,
      filter: (node) => node !== exclude,
    });
    // Pixels per CSS px in the rendered page, whatever the library did with devicePixelRatio.
    const k = page.width / document.documentElement.scrollWidth;

    const out = document.createElement('canvas');
    out.width = Math.round(view.w * k);
    out.height = Math.round(view.h * k);
    const ctx = out.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(page, view.x * k, view.y * k, out.width, out.height, 0, 0, out.width, out.height);
    ctx.fillStyle = '#000';
    for (const r of masks) ctx.fillRect(r.left * k, r.top * k, r.width * k, r.height * k);

    let blob = await toBlob(out, 'image/webp', 0.7);
    if (!blob || blob.type !== 'image/webp') blob = await toBlob(out, 'image/jpeg', 0.8);
    return blob && blob.size <= SCREENSHOT_MAX_BYTES ? blob : null;
  } catch {
    return null;
  }
}
```

If the installed `modern-screenshot` names its options differently (check its `.d.ts`: `scale`, `filter`), adapt the call to the installed API while keeping the behaviour (exclude the host, scale so width ≤ 1600px) and note it in the report.

- [ ] **Step 5: Verify**

Run: `pnpm --filter @dymcode/widget test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
pnpm format
git add packages/widget pnpm-lock.yaml
git commit -m "feat(widget): add lazy screenshot module and loader"
```

---

### Task 6: UI: styles, trigger, panel and mount

**Files:**
- Create: `packages/widget/src/ui/styles.css`, `packages/widget/src/ui/trigger.ts`, `packages/widget/src/ui/panel.ts`, `packages/widget/src/ui/mount.ts`
- Test: `packages/widget/src/ui/mount.test.ts`

**Interfaces:**
- Consumes: `h` (Task 2), `MESSAGES`, `resolveLocale`, `Messages` (Task 2), `buildPayload`, `SubmitResult` (Task 4), `CaptureFn` (Task 5), `IdentifiedUser` (Task 3), `BRAND` (`@dymcode/shared/brand`), constants `FEEDBACK_TYPES`, `MESSAGE_MAX_LENGTH`, `EMAIL_MAX_LENGTH`, `HEX_COLOR_PATTERN`.
- Produces:
  ```ts
  // ui/panel.ts
  interface PanelDeps {
    projectKey: string;
    submit(payload: SubmitPayload, screenshot: Blob | null): Promise<SubmitResult>;
    loadCapture(): Promise<CaptureFn | null>;
    collectMetadata(): ClientMetadata;
    now(): number; // monotonic ms, e.g. performance.now()
  }
  // ui/mount.ts
  interface MountOptions { preview?: boolean; hideTrigger?: boolean; deps?: PanelDeps; languages?: readonly string[] }
  interface WidgetHandle { host: HTMLElement; open(type?: FeedbackType): void; close(): void;
    identify(user: IdentifiedUser): void; destroy(): void }
  function mountWidget(container: HTMLElement, config: WidgetConfig, options?: MountOptions): WidgetHandle;
  ```
  `preview: true` (or no `deps`) renders the same UI with submission and capture disabled.

- [ ] **Step 1: Write failing tests**

`packages/widget/src/ui/mount.test.ts`:
```ts
import type { ClientMetadata, WidgetConfig } from '@dymcode/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SubmitResult } from '../api';
import { mountWidget, type WidgetHandle } from './mount';
import type { PanelDeps } from './panel';

const baseConfig: WidgetConfig = {
  primaryColor: '#6366f1',
  triggerText: 'Feedback',
  position: 'bottom-right',
  showBadge: true,
  customCss: null,
  badgeUrl: 'https://dymcode.dev/?ref=pk_AbCdEfGh12345678&utm_source=widget',
  locale: 'en',
};
const metadata: ClientMetadata = {
  url: 'https://host.example/',
  referrer: '',
  userAgent: 'UA',
  language: 'en',
  timezone: 'UTC',
  viewport: { w: 1280, h: 720 },
  screen: { w: 1920, h: 1080, dpr: 1 },
  consoleErrors: [],
};
const shot = new Blob(['img'], { type: 'image/webp' });

let handle: WidgetHandle | undefined;
afterEach(() => {
  handle?.destroy();
  handle = undefined;
  vi.useRealTimers();
});

function setup(
  options: { deps?: Partial<PanelDeps>; config?: Partial<WidgetConfig>; hideTrigger?: boolean; preview?: boolean } = {},
) {
  let clock = 1000;
  const submit = vi.fn<(...a: Parameters<PanelDeps['submit']>) => Promise<SubmitResult>>(async () => ({ ok: true }));
  const deps: PanelDeps = {
    projectKey: 'pk_AbCdEfGh12345678',
    submit,
    loadCapture: async () => async () => shot,
    collectMetadata: () => metadata,
    now: () => clock,
    ...options.deps,
  };
  handle = mountWidget(document.body, { ...baseConfig, ...options.config }, {
    deps,
    languages: ['en-US'],
    hideTrigger: options.hideTrigger,
    preview: options.preview,
  });
  const root = handle.host.shadowRoot!;
  const q = <T extends Element = HTMLElement>(selector: string) => root.querySelector<T>(selector);
  return { handle, root, q, submit, deps, tick: (ms: number) => (clock += ms) };
}

describe('mountWidget', () => {
  it('renders an isolated host with the trigger text as literal text', () => {
    const { handle, q } = setup({ config: { triggerText: '<img src=x onerror=alert(1)>' } });
    expect(handle.host.hasAttribute('data-dymcode')).toBe(true);
    expect(handle.host.shadowRoot).not.toBeNull();
    expect(q('.dc-trigger')!.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(q('img')).toBeNull();
  });

  it('puts custom CSS inside the shadow root only', () => {
    const { root } = setup({ config: { customCss: '.dc-trigger{border-radius:0}' } });
    const styles = Array.from(root.querySelectorAll('style'), (s) => s.textContent);
    expect(styles).toContain('.dc-trigger{border-radius:0}');
    expect(document.head.innerHTML).not.toContain('border-radius:0');
  });

  it('applies the accent color, position and locale', () => {
    const { q } = setup({ config: { primaryColor: '#ff0000', position: 'bottom-left', locale: 'ru' } });
    const root = q('.dc-root')!;
    expect(root.style.getPropertyValue('--dc-accent')).toBe('#ff0000');
    expect(root.dataset.position).toBe('bottom-left');
    expect(q('.dc-title')!.textContent).toBe('Отправить отзыв');
  });

  it('hides the trigger with hideTrigger', () => {
    const { q } = setup({ hideTrigger: true });
    expect(q('.dc-trigger')).toBeNull();
  });

  it('shows the badge unless disabled', () => {
    const shown = setup();
    const badge = shown.q<HTMLAnchorElement>('.dc-badge')!;
    expect(badge.href).toBe(baseConfig.badgeUrl);
    expect(badge.rel).toBe('noopener');
    expect(badge.target).toBe('_blank');
    shown.handle.destroy();
    expect(setup({ config: { showBadge: false } }).q('.dc-badge')).toBeNull();
  });
});

describe('panel', () => {
  it('opens from the trigger with focus in the message field', () => {
    const { q, root } = setup();
    q('.dc-trigger')!.click();
    expect(q('.dc-panel')!.hidden).toBe(false);
    expect(root.activeElement).toBe(q('.dc-message'));
  });

  it('open(type) preselects the type and its placeholder', () => {
    const { handle, q } = setup();
    handle.open('idea');
    expect(q('.dc-type[data-type="idea"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(q('.dc-type[data-type="bug"]')!.getAttribute('aria-pressed')).toBe('false');
    expect(q<HTMLTextAreaElement>('.dc-message')!.placeholder).toBe("What's your idea?");
  });

  it('Escape closes and returns focus to the trigger', () => {
    const { q, root } = setup();
    q('.dc-trigger')!.click();
    q('.dc-panel')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(q('.dc-panel')!.hidden).toBe(true);
    expect(root.activeElement).toBe(q('.dc-trigger'));
  });

  it('requires a message', async () => {
    const { handle, q, submit } = setup();
    handle.open();
    q('.dc-send')!.click();
    expect(q('.dc-message-error')!.textContent).toBe('Write a message first.');
    expect(submit).not.toHaveBeenCalled();
  });

  it('validates the email shape', async () => {
    const { handle, q, submit } = setup();
    handle.open();
    q<HTMLTextAreaElement>('.dc-message')!.value = 'Broken';
    q<HTMLInputElement>('.dc-email')!.value = 'nope';
    q('.dc-send')!.click();
    expect(q('.dc-email-error')!.textContent).toBe('Check the email address.');
    expect(submit).not.toHaveBeenCalled();
  });

  it('submits the payload with the screenshot and elapsed time', async () => {
    const { handle, q, submit, tick } = setup();
    handle.open('bug');
    await vi.waitFor(() => expect(q('.dc-thumb')!.dataset.state).toBe('ready'));
    q<HTMLTextAreaElement>('.dc-message')!.value = '  Checkout fails  ';
    tick(4200);
    q('.dc-send')!.click();
    await vi.waitFor(() => expect(submit).toHaveBeenCalledOnce());
    const [payload, blob] = submit.mock.calls[0]!;
    expect(payload).toMatchObject({
      projectKey: 'pk_AbCdEfGh12345678',
      type: 'bug',
      message: 'Checkout fails',
      elapsedMs: 4200,
      website: '',
      metadata,
    });
    expect(blob).toBe(shot);
  });

  it('sends without a screenshot when the toggle is off', async () => {
    const { handle, q, submit } = setup();
    handle.open();
    await vi.waitFor(() => expect(q('.dc-thumb')!.dataset.state).toBe('ready'));
    q<HTMLInputElement>('.dc-shot-toggle')!.checked = false;
    q<HTMLTextAreaElement>('.dc-message')!.value = 'x';
    q('.dc-send')!.click();
    await vi.waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(submit.mock.calls[0]![1]).toBeNull();
  });

  it('marks the screenshot unavailable when capture is not possible', async () => {
    const { handle, q, submit } = setup({ deps: { loadCapture: async () => null } });
    handle.open();
    await vi.waitFor(() => expect(q('.dc-thumb')!.dataset.state).toBe('unavailable'));
    const toggle = q<HTMLInputElement>('.dc-shot-toggle')!;
    expect(toggle.disabled).toBe(true);
    expect(toggle.checked).toBe(false);
    expect(q('.dc-shot')!.textContent).toContain('Screenshot unavailable');
    q<HTMLTextAreaElement>('.dc-message')!.value = 'x';
    q('.dc-send')!.click();
    await vi.waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(submit.mock.calls[0]![1]).toBeNull();
  });

  it('shows thanks, then closes and resets after 2s', async () => {
    const { handle, q } = setup();
    handle.open();
    q<HTMLTextAreaElement>('.dc-message')!.value = 'Great app';
    vi.useFakeTimers();
    q('.dc-send')!.click();
    await vi.waitFor(() => expect(q('.dc-thanks')!.hidden).toBe(false));
    vi.advanceTimersByTime(2000);
    expect(q('.dc-panel')!.hidden).toBe(true);
    expect(q<HTMLTextAreaElement>('.dc-message')!.value).toBe('');
  });

  it('keeps the text and explains rate limiting', async () => {
    const { handle, q } = setup({ deps: { submit: async () => ({ ok: false, reason: 'rate_limited' }) } });
    handle.open();
    q<HTMLTextAreaElement>('.dc-message')!.value = 'Again';
    q('.dc-send')!.click();
    await vi.waitFor(() =>
      expect(q('.dc-status')!.textContent).toBe('Too many submissions. Try again later.'),
    );
    expect(q<HTMLTextAreaElement>('.dc-message')!.value).toBe('Again');
    expect(q('.dc-retry')!.hidden).toBe(true);
  });

  it('offers retry after a network error', async () => {
    const submit = vi
      .fn<() => Promise<SubmitResult>>()
      .mockResolvedValueOnce({ ok: false, reason: 'network' })
      .mockResolvedValueOnce({ ok: true });
    const { handle, q } = setup({ deps: { submit } });
    handle.open();
    q<HTMLTextAreaElement>('.dc-message')!.value = 'Flaky';
    q('.dc-send')!.click();
    await vi.waitFor(() => expect(q('.dc-retry')!.hidden).toBe(false));
    expect(q('.dc-status')!.textContent).toBe("Couldn't send. Check your connection.");
    q('.dc-retry')!.click();
    await vi.waitFor(() => expect(q('.dc-thanks')!.hidden).toBe(false));
    expect(submit).toHaveBeenCalledTimes(2);
  });

  it('identify pre-fills the email without overwriting typed input', () => {
    const { handle, q } = setup();
    handle.identify({ email: 'ann@example.com' });
    expect(q<HTMLInputElement>('.dc-email')!.value).toBe('ann@example.com');
    q<HTMLInputElement>('.dc-email')!.value = 'typed@example.com';
    handle.identify({ email: 'other@example.com' });
    expect(q<HTMLInputElement>('.dc-email')!.value).toBe('typed@example.com');
  });

  it('never submits in preview mode', async () => {
    const { handle, q, submit } = setup({ preview: true });
    handle.open();
    q<HTMLTextAreaElement>('.dc-message')!.value = 'x';
    q('.dc-send')!.click();
    await Promise.resolve();
    expect(submit).not.toHaveBeenCalled();
    expect(q('.dc-root')!.hasAttribute('data-preview')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @dymcode/widget test`
Expected: FAIL with "Failed to resolve import './mount'".

- [ ] **Step 3: Write the styles**

`packages/widget/src/ui/styles.css`:
```css
:host {
  all: initial;
}
[hidden] {
  display: none !important;
}
.dc-root {
  --dc-bg: #ffffff;
  --dc-fg: #1f2328;
  --dc-muted: #656d76;
  --dc-border: #d0d7de;
  --dc-error: #cf222e;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  line-height: 1.4;
  color: var(--dc-fg);
}
@media (prefers-color-scheme: dark) {
  .dc-root {
    --dc-bg: #161b22;
    --dc-fg: #e6edf3;
    --dc-muted: #8d96a0;
    --dc-border: #30363d;
    --dc-error: #ff7b72;
  }
}
.dc-root *,
.dc-root *::before,
.dc-root *::after {
  box-sizing: border-box;
}
.dc-trigger {
  position: fixed;
  bottom: 20px;
  z-index: 2147483000;
  border: 0;
  border-radius: 999px;
  padding: 10px 16px;
  background: var(--dc-accent);
  color: #fff;
  font-family: inherit;
  font-size: 14px;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.2);
}
.dc-panel {
  position: fixed;
  bottom: 72px;
  z-index: 2147483000;
  width: 340px;
  max-height: calc(100vh - 96px);
  overflow: auto;
  padding: 16px;
  background: var(--dc-bg);
  border: 1px solid var(--dc-border);
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
}
[data-position='bottom-right'] .dc-trigger,
[data-position='bottom-right'] .dc-panel {
  right: 20px;
}
[data-position='bottom-left'] .dc-trigger,
[data-position='bottom-left'] .dc-panel {
  left: 20px;
}
[data-preview] .dc-trigger,
[data-preview] .dc-panel {
  position: absolute;
}
@media (max-width: 479px) {
  .dc-root .dc-panel {
    left: 0;
    right: 0;
    bottom: 0;
    width: auto;
    max-height: 90vh;
    border-radius: 12px 12px 0 0;
  }
}
.dc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.dc-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.dc-close {
  border: 0;
  background: none;
  color: var(--dc-muted);
  font-size: 20px;
  line-height: 1;
  padding: 4px;
  cursor: pointer;
}
.dc-types {
  display: flex;
  margin: 12px 0 4px;
  border: 1px solid var(--dc-border);
  border-radius: 8px;
  overflow: hidden;
}
.dc-type {
  flex: 1;
  border: 0;
  padding: 6px;
  background: transparent;
  color: var(--dc-fg);
  font: inherit;
  cursor: pointer;
}
.dc-type[aria-pressed='true'] {
  background: var(--dc-accent);
  color: #fff;
}
.dc-input {
  display: block;
  width: 100%;
  margin-top: 8px;
  padding: 8px 10px;
  border: 1px solid var(--dc-border);
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  resize: vertical;
}
.dc-root :focus-visible {
  outline: 2px solid var(--dc-accent);
  outline-offset: 2px;
}
.dc-field-error {
  margin: 4px 0 0;
  color: var(--dc-error);
  font-size: 12px;
}
.dc-field-error:empty,
.dc-status:empty {
  display: none;
}
.dc-hp {
  position: absolute;
  left: -10000px;
  width: 1px;
  height: 1px;
  opacity: 0;
}
.dc-shot {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  color: var(--dc-muted);
  font-size: 13px;
}
.dc-thumb {
  flex: none;
  width: 48px;
  height: 30px;
  overflow: hidden;
  border: 1px solid var(--dc-border);
  border-radius: 4px;
  background: var(--dc-border);
}
.dc-thumb[data-state='loading'] {
  animation: dc-pulse 1s ease-in-out infinite alternate;
}
.dc-thumb img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
@keyframes dc-pulse {
  to {
    opacity: 0.4;
  }
}
.dc-status {
  margin: 10px 0 0;
  color: var(--dc-error);
  font-size: 13px;
}
.dc-retry {
  margin-top: 6px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--dc-accent);
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
}
.dc-send {
  width: 100%;
  margin-top: 12px;
  padding: 10px;
  border: 0;
  border-radius: 8px;
  background: var(--dc-accent);
  color: #fff;
  font: inherit;
  font-weight: 500;
  cursor: pointer;
}
.dc-send:disabled {
  opacity: 0.6;
  cursor: progress;
}
.dc-thanks {
  margin: 20px 0;
  text-align: center;
}
.dc-badge {
  display: block;
  margin-top: 12px;
  color: var(--dc-muted);
  font-size: 12px;
  text-align: center;
  text-decoration: none;
}
@media (prefers-reduced-motion: reduce) {
  .dc-root * {
    animation: none !important;
    transition: none !important;
  }
}
```

- [ ] **Step 4: Implement trigger and panel**

`packages/widget/src/ui/trigger.ts`:
```ts
import { h } from './h';

export function createTrigger(text: string, onClick: () => void): HTMLButtonElement {
  return h('button', { type: 'button', class: 'dc-trigger', 'aria-haspopup': 'dialog', onclick: onClick }, text);
}
```

`packages/widget/src/ui/panel.ts`:
```ts
import type { ClientMetadata, SubmitPayload, WidgetConfig } from '@dymcode/shared';
import { BRAND } from '@dymcode/shared/brand';
import {
  EMAIL_MAX_LENGTH,
  FEEDBACK_TYPES,
  MESSAGE_MAX_LENGTH,
  type FeedbackType,
} from '@dymcode/shared/constants';
import { buildPayload, type SubmitResult } from '../api';
import type { Messages } from '../i18n';
import type { CaptureFn } from '../screenshot-loader';
import { h } from './h';

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const THANKS_CLOSE_MS = 2000;

export interface PanelDeps {
  projectKey: string;
  submit(payload: SubmitPayload, screenshot: Blob | null): Promise<SubmitResult>;
  loadCapture(): Promise<CaptureFn | null>;
  collectMetadata(): ClientMetadata;
  /** Monotonic milliseconds, e.g. `performance.now()`. */
  now(): number;
}

export interface Panel {
  element: HTMLElement;
  open(type: FeedbackType): void;
  close(): void;
  isOpen(): boolean;
  setEmail(email: string): void;
}

type ShotState = 'loading' | 'ready' | 'unavailable';

export function createPanel(options: {
  config: WidgetConfig;
  t: Messages;
  /** null = preview: nothing is captured or sent. */
  deps: PanelDeps | null;
  /** Excluded from screenshots. */
  host: Element;
  onClose(): void;
}): Panel {
  const { config, t, deps } = options;
  let type: FeedbackType = 'bug';
  let openedAt = 0;
  let shot: Blob | null = null;
  let shotUrl: string | null = null;
  let capturing: Promise<void> = Promise.resolve();
  let identifiedEmail = '';
  let sending = false;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;

  const typeButtons = FEEDBACK_TYPES.map((ft) =>
    h(
      'button',
      { type: 'button', class: 'dc-type', 'data-type': ft, 'aria-pressed': 'false', onclick: () => selectType(ft) },
      t.types[ft],
    ),
  );
  const message = h('textarea', { class: 'dc-input dc-message', rows: 4, maxlength: MESSAGE_MAX_LENGTH });
  const messageError = h('p', { class: 'dc-field-error dc-message-error', role: 'alert' });
  const email = h('input', {
    class: 'dc-input dc-email',
    type: 'email',
    maxlength: EMAIL_MAX_LENGTH,
    placeholder: t.emailPlaceholder,
    autocomplete: 'email',
    'aria-label': t.emailLabel,
  });
  const emailError = h('p', { class: 'dc-field-error dc-email-error', role: 'alert' });
  const honeypot = h('input', { class: 'dc-hp', name: 'website', tabindex: -1, autocomplete: 'off', 'aria-hidden': 'true' });
  const shotToggle = h('input', { type: 'checkbox', class: 'dc-shot-toggle', checked: true });
  const thumb = h('span', { class: 'dc-thumb', 'data-state': 'loading' });
  const shotText = h('span', {}, t.screenshot);
  const status = h('p', { class: 'dc-status', role: 'status' });
  const retry = h('button', { type: 'button', class: 'dc-retry', hidden: true, onclick: () => void send() }, t.retry);
  const sendButton = h('button', { type: 'button', class: 'dc-send', onclick: () => void send() }, t.send);
  const form = h(
    'form',
    { class: 'dc-form', novalidate: true, onsubmit: (e: Event) => { e.preventDefault(); void send(); } },
    h('div', { class: 'dc-types', role: 'group' }, ...typeButtons),
    message,
    messageError,
    email,
    emailError,
    honeypot,
    h('label', { class: 'dc-shot' }, shotToggle, thumb, shotText),
    status,
    retry,
    sendButton,
  );
  const thanks = h('p', { class: 'dc-thanks', role: 'status', hidden: true }, t.thanks);
  const badge = config.showBadge
    ? h('a', { class: 'dc-badge', href: config.badgeUrl, target: '_blank', rel: 'noopener' }, `${t.poweredBy} ${BRAND.name}`)
    : null;
  const element = h(
    'div',
    { class: 'dc-panel', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'dc-title', hidden: true, onkeydown: onKeydown },
    h(
      'div',
      { class: 'dc-head' },
      h('h2', { class: 'dc-title', id: 'dc-title' }, t.title),
      h('button', { type: 'button', class: 'dc-close', 'aria-label': t.close, onclick: () => close() }, '×'),
    ),
    form,
    thanks,
    badge,
  );

  function selectType(next: FeedbackType) {
    type = next;
    for (const button of typeButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.type === next));
    }
    message.placeholder = t.placeholders[next];
    message.setAttribute('aria-label', t.placeholders[next]);
  }

  function setShot(state: ShotState, blob: Blob | null = null) {
    shot = blob;
    thumb.dataset.state = state;
    thumb.replaceChildren();
    if (shotUrl) URL.revokeObjectURL(shotUrl);
    shotUrl = null;
    const unavailable = state === 'unavailable';
    shotToggle.disabled = unavailable;
    if (unavailable) shotToggle.checked = false;
    shotText.textContent = unavailable ? t.screenshotUnavailable : t.screenshot;
    if (blob && typeof URL.createObjectURL === 'function') {
      shotUrl = URL.createObjectURL(blob);
      thumb.append(h('img', { src: shotUrl, alt: '' }));
    }
  }

  function startCapture() {
    shotToggle.checked = true;
    if (!deps) {
      setShot('ready');
      return;
    }
    setShot('loading');
    capturing = deps
      .loadCapture()
      .then((captureFn) => (captureFn ? captureFn(options.host) : null))
      .then(
        (blob) => setShot(blob ? 'ready' : 'unavailable', blob),
        () => setShot('unavailable'),
      );
  }

  function showForm() {
    form.hidden = false;
    thanks.hidden = true;
  }

  function reset() {
    message.value = '';
    email.value = identifiedEmail;
    honeypot.value = '';
    messageError.textContent = '';
    emailError.textContent = '';
    status.textContent = '';
    retry.hidden = true;
    showForm();
  }

  function open(next: FeedbackType) {
    clearTimeout(closeTimer);
    selectType(next);
    if (element.hidden) {
      element.hidden = false;
      showForm();
      openedAt = deps ? deps.now() : 0;
      startCapture();
    }
    message.focus();
  }

  function close() {
    if (element.hidden) return;
    clearTimeout(closeTimer);
    element.hidden = true;
    if (!thanks.hidden) reset();
    options.onClose();
  }

  function setBusy(busy: boolean) {
    sendButton.disabled = busy;
    retry.disabled = busy;
    sendButton.textContent = busy ? t.sending : t.send;
  }

  function showError(reason: Exclude<SubmitResult, { ok: true }>['reason']) {
    status.textContent =
      reason === 'rate_limited' ? t.errorRateLimited : reason === 'network' ? t.errorNetwork : t.errorInvalid;
    retry.hidden = reason === 'rate_limited' || reason === 'invalid';
  }

  async function send() {
    if (!deps || sending) return;
    const text = message.value.trim();
    const mail = email.value.trim();
    messageError.textContent = text ? '' : t.errorRequired;
    emailError.textContent = mail && !EMAIL_SHAPE.test(mail) ? t.errorEmail : '';
    if (!text) return message.focus();
    if (emailError.textContent) return email.focus();

    sending = true;
    setBusy(true);
    status.textContent = '';
    retry.hidden = true;
    try {
      if (shotToggle.checked) await capturing;
      const payload = buildPayload({
        projectKey: deps.projectKey,
        type,
        message: text,
        email: mail,
        metadata: deps.collectMetadata(),
        elapsedMs: deps.now() - openedAt,
        website: honeypot.value,
      });
      const result = await deps.submit(payload, shotToggle.checked ? shot : null);
      if (result.ok) {
        form.hidden = true;
        thanks.hidden = false;
        closeTimer = setTimeout(close, THANKS_CLOSE_MS);
      } else {
        showError(result.reason);
      }
    } catch {
      showError('network');
    } finally {
      sending = false;
      setBusy(false);
    }
  }

  function onKeydown(event: Event) {
    const key = (event as KeyboardEvent).key;
    if (key === 'Escape') {
      event.stopPropagation();
      close();
      return;
    }
    if (key !== 'Tab') return;
    const focusable = Array.from(
      element.querySelectorAll<HTMLElement>('button, input, textarea, a[href]'),
    ).filter((el) => el.tabIndex >= 0 && !el.closest('[hidden]') && !(el as HTMLButtonElement).disabled);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    const active = (element.getRootNode() as ShadowRoot | Document).activeElement;
    if ((event as KeyboardEvent).shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!(event as KeyboardEvent).shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  selectType('bug');

  return {
    element,
    open,
    close,
    isOpen: () => !element.hidden,
    setEmail(value: string) {
      identifiedEmail = value;
      if (!email.value) email.value = value;
    },
  };
}
```

- [ ] **Step 5: Implement mount**

`packages/widget/src/ui/mount.ts`:
```ts
import type { WidgetConfig } from '@dymcode/shared';
import { HEX_COLOR_PATTERN, type FeedbackType } from '@dymcode/shared/constants';
import type { IdentifiedUser } from '../context/metadata';
import { MESSAGES, resolveLocale } from '../i18n';
import { h } from './h';
import { createPanel, type PanelDeps } from './panel';
import styles from './styles.css?inline';
import { createTrigger } from './trigger';

export type { PanelDeps } from './panel';

export interface MountOptions {
  /** Dashboard live preview: renders the UI but never captures or submits. */
  preview?: boolean;
  hideTrigger?: boolean;
  deps?: PanelDeps;
  /** Defaults to `navigator.languages`; used when the config locale is `auto`. */
  languages?: readonly string[];
}

export interface WidgetHandle {
  host: HTMLElement;
  open(type?: FeedbackType): void;
  close(): void;
  identify(user: IdentifiedUser): void;
  destroy(): void;
}

const FALLBACK_ACCENT = '#6366f1';

export function mountWidget(
  container: HTMLElement,
  config: WidgetConfig,
  options: MountOptions = {},
): WidgetHandle {
  const host = document.createElement('div');
  host.setAttribute('data-dymcode', '');
  host.style.cssText = 'all: initial;';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.append(h('style', {}, styles));
  if (config.customCss) shadow.append(h('style', {}, config.customCss));

  const locale = resolveLocale(config.locale, options.languages ?? navigator.languages ?? []);
  const root = h('div', {
    class: 'dc-root',
    lang: locale,
    'data-position': config.position,
    'data-preview': options.preview === true,
  });
  root.style.setProperty(
    '--dc-accent',
    HEX_COLOR_PATTERN.test(config.primaryColor) ? config.primaryColor : FALLBACK_ACCENT,
  );

  let trigger: HTMLButtonElement | null = null;
  const panel = createPanel({
    config,
    t: MESSAGES[locale],
    deps: options.preview ? null : (options.deps ?? null),
    host,
    onClose: () => trigger?.focus(),
  });
  if (!options.hideTrigger) {
    trigger = createTrigger(config.triggerText, () => (panel.isOpen() ? panel.close() : panel.open('bug')));
    root.append(trigger);
  }
  root.append(panel.element);
  shadow.append(root);
  container.append(host);

  return {
    host,
    open: (type = 'bug') => panel.open(type),
    close: () => panel.close(),
    identify: (user) => {
      if (user.email) panel.setEmail(user.email);
    },
    destroy: () => host.remove(),
  };
}
```

- [ ] **Step 6: Verify**

Run: `pnpm --filter @dymcode/widget test && pnpm typecheck`
Expected: PASS. If a happy-dom limitation (e.g. `KeyboardEvent`, `attachShadow`, `activeElement` inside shadow roots) breaks a test, report it with the exact output rather than weakening the assertion.

- [ ] **Step 7: Commit**

```bash
pnpm format
git add packages/widget
git commit -m "feat(widget): add trigger, panel and shadow DOM mount"
```

---

### Task 7: Public API and bootstrap

**Files:**
- Create: `packages/widget/src/public-api.ts`, `packages/widget/src/index.ts`, `packages/widget/src/entry.ts`
- Test: `packages/widget/src/public-api.test.ts`, `packages/widget/src/index.test.ts`

**Interfaces:**
- Consumes: everything above; `fetchConfig`, `submitFeedback` (Task 4); `installConsoleBuffer`, `collectMetadata` (Task 3); `createScreenshotLoader` (Task 5); `mountWidget`, `WidgetHandle` (Task 6).
- Produces:
  ```ts
  interface DymcodeApi { open(type?: FeedbackType): void; identify(user: IdentifiedUser): void }
  interface ApiState { handle: WidgetHandle | null; user: IdentifiedUser | undefined }
  function createPublicApi(state: ApiState, warn: (message: string) => void): DymcodeApi;
  function boot(win: Window & typeof globalThis, script: HTMLScriptElement | null): void;
  ```
  `window.Dymcode` is set synchronously by `boot`; `dymcode:ready` fires on `window` after mount.

- [ ] **Step 1: Write failing tests**

`packages/widget/src/public-api.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { createPublicApi, type ApiState } from './public-api';
import type { WidgetHandle } from './ui/mount';

const fakeHandle = () =>
  ({ host: document.createElement('div'), open: vi.fn(), close: vi.fn(), identify: vi.fn(), destroy: vi.fn() }) satisfies WidgetHandle;

describe('createPublicApi', () => {
  it('warns instead of opening before the widget is ready', () => {
    const warn = vi.fn();
    createPublicApi({ handle: null, user: undefined }, warn).open('idea');
    expect(warn).toHaveBeenCalledOnce();
  });

  it('opens with a valid type and falls back to bug', () => {
    const handle = fakeHandle();
    const api = createPublicApi({ handle, user: undefined }, vi.fn());
    api.open('idea');
    api.open('nonsense' as never);
    api.open();
    expect(handle.open.mock.calls).toEqual([['idea'], ['bug'], ['bug']]);
  });

  it('stores the identified user and forwards the email', () => {
    const handle = fakeHandle();
    const state: ApiState = { handle, user: undefined };
    createPublicApi(state, vi.fn()).identify({ email: 'a@b.co', id: 'u_1' });
    expect(state.user).toEqual({ email: 'a@b.co', id: 'u_1' });
    expect(handle.identify).toHaveBeenCalledWith({ email: 'a@b.co', id: 'u_1' });
  });

  it('rejects malformed identify input with a warning', () => {
    const warn = vi.fn();
    const state: ApiState = { handle: null, user: undefined };
    const api = createPublicApi(state, warn);
    api.identify({ id: 42 } as never);
    api.identify(null as never);
    expect(state.user).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('never throws into the host page', () => {
    const handle = { ...fakeHandle(), open: () => { throw new Error('boom'); } };
    expect(() => createPublicApi({ handle, user: undefined }, vi.fn()).open('bug')).not.toThrow();
  });
});
```

`packages/widget/src/index.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from './index';

const config = {
  primaryColor: '#6366f1',
  triggerText: 'Feedback',
  position: 'bottom-right',
  showBadge: true,
  customCss: null,
  badgeUrl: 'https://dymcode.dev/?ref=pk_AbCdEfGh12345678&utm_source=widget',
  locale: 'en',
};

function script(attrs: Record<string, string>) {
  const el = document.createElement('script');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

const ready = () => new Promise<void>((resolve) => window.addEventListener('dymcode:ready', () => resolve(), { once: true }));

describe('boot', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(config))));
  });

  afterEach(() => {
    delete (window as { Dymcode?: unknown }).Dymcode;
    document.querySelectorAll('[data-dymcode]').forEach((el) => el.remove());
    vi.unstubAllGlobals();
    warn.mockRestore();
  });

  it('mounts from the script tag, calls the API on the script origin and fires ready', async () => {
    const isReady = ready();
    boot(window, script({ src: 'https://dymcode.dev/w/widget.js', 'data-project-id': 'pk_AbCdEfGh12345678' }));
    expect(window.Dymcode).toBeDefined();
    await isReady;
    expect(fetch).toHaveBeenCalledWith(
      'https://dymcode.dev/api/v1/widget/config?key=pk_AbCdEfGh12345678',
      { credentials: 'omit' },
    );
    const host = document.querySelector('[data-dymcode]')!;
    expect(host.shadowRoot!.querySelector('.dc-trigger')).not.toBeNull();
  });

  it('respects data-hide-trigger and opens through window.Dymcode', async () => {
    const isReady = ready();
    boot(
      window,
      script({ src: 'https://dymcode.dev/w/widget.js', 'data-project-id': 'pk_AbCdEfGh12345678', 'data-hide-trigger': '' }),
    );
    await isReady;
    const root = document.querySelector('[data-dymcode]')!.shadowRoot!;
    expect(root.querySelector('.dc-trigger')).toBeNull();
    (window.Dymcode as { open(type: string): void }).open('idea');
    expect(root.querySelector<HTMLElement>('.dc-panel')!.hidden).toBe(false);
    expect(root.querySelector('.dc-type[data-type="idea"]')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('applies an email identified before the widget was ready', async () => {
    const isReady = ready();
    boot(window, script({ src: 'https://dymcode.dev/w/widget.js', 'data-project-id': 'pk_AbCdEfGh12345678' }));
    (window.Dymcode as { identify(u: object): void }).identify({ email: 'ann@example.com' });
    await isReady;
    const root = document.querySelector('[data-dymcode]')!.shadowRoot!;
    expect(root.querySelector<HTMLInputElement>('.dc-email')!.value).toBe('ann@example.com');
  });

  it('does nothing without a project id', () => {
    boot(window, script({ src: 'https://dymcode.dev/w/widget.js' }));
    expect(window.Dymcode).toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
  });

  it('ignores a second include', () => {
    const existing = { open() {}, identify() {} };
    (window as { Dymcode?: unknown }).Dymcode = existing;
    boot(window, script({ src: 'https://dymcode.dev/w/widget.js', 'data-project-id': 'pk_AbCdEfGh12345678' }));
    expect(window.Dymcode).toBe(existing);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('renders nothing and warns when the config cannot load', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
    boot(window, script({ src: 'https://dymcode.dev/w/widget.js', 'data-project-id': 'pk_AbCdEfGh12345678' }));
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    expect(document.querySelector('[data-dymcode]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @dymcode/widget test`
Expected: FAIL with "Failed to resolve import './public-api'" / "'./index'".

- [ ] **Step 3: Implement**

`packages/widget/src/public-api.ts`:
```ts
import { FEEDBACK_TYPES, type FeedbackType } from '@dymcode/shared/constants';
import type { IdentifiedUser } from './context/metadata';
import type { WidgetHandle } from './ui/mount';

export interface DymcodeApi {
  open(type?: FeedbackType): void;
  identify(user: IdentifiedUser): void;
}

export interface ApiState {
  handle: WidgetHandle | null;
  user: IdentifiedUser | undefined;
}

function isIdentifiedUser(value: unknown): value is IdentifiedUser {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return ['email', 'id', 'name'].every((key) => record[key] === undefined || typeof record[key] === 'string');
}

/** `window.Dymcode`. Every method swallows errors: host pages must never see ours. */
export function createPublicApi(state: ApiState, warn: (message: string) => void): DymcodeApi {
  return {
    open(type) {
      try {
        if (!state.handle) return warn('widget is not ready yet');
        const valid = (FEEDBACK_TYPES as readonly unknown[]).includes(type) ? (type as FeedbackType) : 'bug';
        state.handle.open(valid);
      } catch {
        // Never propagate into the host page.
      }
    },
    identify(user) {
      try {
        if (!isIdentifiedUser(user)) return warn('identify() expects { email?, id?, name? } strings');
        state.user = { ...user };
        state.handle?.identify(state.user);
      } catch {
        // Never propagate into the host page.
      }
    },
  };
}
```

`packages/widget/src/index.ts`:
```ts
import { fetchConfig, submitFeedback } from './api';
import { installConsoleBuffer } from './context/console-buffer';
import { collectMetadata } from './context/metadata';
import { createPublicApi, type ApiState } from './public-api';
import { createScreenshotLoader } from './screenshot-loader';
import { mountWidget } from './ui/mount';

declare global {
  interface Window {
    Dymcode?: unknown;
  }
}

const warn = (message: string) => {
  try {
    console.warn(`[Dymcode] ${message}`);
  } catch {
    // Console may be unavailable; nothing else to do.
  }
};

/** Starts the widget for `script` (the embed tag). Safe to call twice; never throws. */
export function boot(win: Window & typeof globalThis, script: HTMLScriptElement | null): void {
  try {
    if (win.Dymcode || !script) return;
    const projectKey = script.dataset.projectId;
    if (!projectKey) return warn('missing data-project-id on the script tag');

    const scriptUrl = new URL(script.src, win.location.href).href;
    const apiOrigin = new URL(scriptUrl).origin;
    const buffer = installConsoleBuffer(win, scriptUrl);
    const state: ApiState = { handle: null, user: undefined };
    win.Dymcode = createPublicApi(state, warn);
    const loadCapture = createScreenshotLoader(
      new URL(`screenshot.js?v=${encodeURIComponent(__WIDGET_VERSION__)}`, scriptUrl).href,
    );

    const start = async () => {
      const config = await fetchConfig(apiOrigin, projectKey);
      if (!config) return warn('could not load the widget config');
      state.handle = mountWidget(win.document.body, config, {
        hideTrigger: script.hasAttribute('data-hide-trigger'),
        deps: {
          projectKey,
          submit: (payload, screenshot) => submitFeedback(apiOrigin, payload, screenshot),
          loadCapture,
          collectMetadata: () => collectMetadata(win, buffer.entries(), state.user),
          now: () => win.performance.now(),
        },
      });
      if (state.user) state.handle.identify(state.user);
      win.dispatchEvent(new Event('dymcode:ready'));
    };

    const run = () => void start().catch(() => warn('failed to start'));
    if (typeof win.requestIdleCallback === 'function') win.requestIdleCallback(run);
    else win.setTimeout(run, 1);
  } catch {
    warn('failed to start');
  }
}
```

`packages/widget/src/entry.ts`:
```ts
import { boot } from './index';

// Must run synchronously at load: currentScript is only set while the classic script executes.
boot(
  window,
  (document.currentScript as HTMLScriptElement | null) ??
    document.querySelector<HTMLScriptElement>('script[data-project-id]'),
);
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter @dymcode/widget test && pnpm typecheck`
Expected: PASS, with no stray console output.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add packages/widget
git commit -m "feat(widget): add window.Dymcode API and bootstrap"
```

---

### Task 8: Builds, size budget, dev page and mock API

**Files:**
- Create: `packages/widget/vite.screenshot.config.ts`, `packages/widget/vite.widget.config.ts`, `packages/widget/vite.dev.config.ts`
- Create: `packages/widget/.size-limit.json`, `packages/widget/scripts/check-bundle.mjs`
- Create: `packages/widget/dev/index.html`, `packages/widget/dev/built.html`, `packages/widget/dev/built-hidden.html`, `packages/widget/dev/hostile.css`, `packages/widget/dev/mock-api.ts`
- Modify: `packages/widget/package.json` (scripts), `.gitignore` (none needed: `dist/` already ignored)

**Interfaces:**
- Consumes: `entry.ts` (Task 7), `screenshot.ts` (Task 5), `SubmitPayloadSchema`, `buildBadgeUrl`, `PUBLIC_KEY_PATTERN`, `WIDGET_LOCALES`, `SCREENSHOT_MIME_TYPES`, `SCREENSHOT_MAX_BYTES` (`@dymcode/shared`).
- Produces:
  - `pnpm --filter @dymcode/widget build` → `dist/screenshot.js`, `dist/widget.js`;
  - scripts `size`, `check:bundle`, `dev`;
  - dev server on port 5173 serving `/dev/*.html`, `dist/` files at `/` (e.g. `/widget.js`), mock endpoints `GET /api/v1/widget/config`, `POST /api/v1/widget/submit`, `GET /__mock/last-submission`.

- [ ] **Step 1: Add scripts and dependencies**

In `packages/widget/package.json`, set `scripts` to:
```json
  "scripts": {
    "dev": "vite --config vite.dev.config.ts",
    "build": "vite build --config vite.screenshot.config.ts && vite build --config vite.widget.config.ts",
    "size": "size-limit",
    "check:bundle": "node scripts/check-bundle.mjs",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
```
Run: `pnpm --filter @dymcode/widget add -D size-limit @size-limit/file`

- [ ] **Step 2: Write the build configs**

`packages/widget/vite.screenshot.config.ts`:
```ts
import { defineConfig } from 'vite';

// Separate ES module, loaded by widget.js with import() only when the panel opens.
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2019',
    lib: { entry: 'src/screenshot.ts', formats: ['es'], fileName: () => 'screenshot.js' },
  },
});
```

`packages/widget/vite.widget.config.ts`:
```ts
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

// Runs after the screenshot build: its hash busts caches of screenshot.js on every change.
const screenshotHash = createHash('sha256')
  .update(readFileSync(new URL('./dist/screenshot.js', import.meta.url)))
  .digest('hex')
  .slice(0, 8);

export default defineConfig({
  define: { __WIDGET_VERSION__: JSON.stringify(`${pkg.version}-${screenshotHash}`) },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'es2019',
    lib: { entry: 'src/entry.ts', name: 'DymcodeWidget', formats: ['iife'], fileName: () => 'widget.js' },
    modulePreload: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
```

`packages/widget/.size-limit.json`:
```json
[
  { "name": "widget.js", "path": "dist/widget.js", "limit": "20 KB", "gzip": true },
  { "name": "screenshot.js", "path": "dist/screenshot.js", "limit": "40 KB", "gzip": true }
]
```

`packages/widget/scripts/check-bundle.mjs`:
```js
// Fails if zod (or other forbidden runtime code) leaked into the embed bundle.
import { readFileSync } from 'node:fs';

const bundle = readFileSync(new URL('../dist/widget.js', import.meta.url), 'utf8');
const forbidden = ['ZodError', '$ZodType', 'innerHTML', 'insertAdjacentHTML'];
const found = forbidden.filter((needle) => bundle.includes(needle));
if (found.length) {
  console.error(`dist/widget.js contains forbidden code: ${found.join(', ')}`);
  process.exit(1);
}
console.log('dist/widget.js: no forbidden code');
```

- [ ] **Step 3: Build and check size**

Run: `pnpm --filter @dymcode/widget build && pnpm --filter @dymcode/widget size && pnpm --filter @dymcode/widget check:bundle`
Expected: both files in `dist/`; size-limit reports `widget.js` ≤ 20 KB and `screenshot.js` ≤ 40 KB; check prints "no forbidden code".
- If `widget.js` exceeds 20 KB, find the cause with `pnpm --filter @dymcode/widget exec vite build --config vite.widget.config.ts --mode production` and inspect `dist/widget.js`. Do not raise the limit; report NEEDS_CONTEXT with the numbers.
- If `screenshot.js` exceeds 40 KB, try `@zumer/snapdom` in place of `modern-screenshot` (same `capture` contract) and report both sizes.

- [ ] **Step 4: Write the mock API and dev pages**

`packages/widget/dev/mock-api.ts`:
```ts
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import {
  PUBLIC_KEY_PATTERN,
  SCREENSHOT_MAX_BYTES,
  SCREENSHOT_MIME_TYPES,
  SubmitPayloadSchema,
  WIDGET_LOCALES,
  buildBadgeUrl,
  type WidgetConfig,
  type WidgetLocale,
} from '@dymcode/shared';
import type { Plugin } from 'vite';

export interface MockSubmission {
  status: number;
  payload: unknown;
  screenshot: { type: string; size: number } | null;
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

/** Overrides come from the page that embeds the widget, e.g. /dev/index.html?locale=ru&badge=0. */
function configFor(key: string, req: IncomingMessage): WidgetConfig {
  const page = new URL(req.headers.referer ?? 'http://localhost/');
  const q = page.searchParams;
  const locale = q.get('locale');
  return {
    primaryColor: /^[0-9a-fA-F]{6}$/.test(q.get('color') ?? '') ? `#${q.get('color')}` : '#6366f1',
    triggerText: q.get('text') ?? 'Feedback',
    position: q.get('position') === 'bottom-left' ? 'bottom-left' : 'bottom-right',
    showBadge: q.get('badge') !== '0',
    customCss: null,
    badgeUrl: buildBadgeUrl(key),
    locale: (WIDGET_LOCALES as readonly string[]).includes(locale ?? '') ? (locale as WidgetLocale) : 'auto',
  };
}

async function readForm(req: IncomingMessage): Promise<FormData> {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(name, value);
  }
  const request = new Request('http://localhost/submit', {
    method: 'POST',
    headers,
    body: Readable.toWeb(req) as unknown as ReadableStream,
    duplex: 'half',
  } as RequestInit);
  return request.formData();
}

/** Dev/E2E stand-in for the phase-3 API, validating with the same shared schemas. */
export function mockApi(): Plugin {
  let last: MockSubmission | null = null;

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (url.pathname === '/src/screenshot.js') {
      // Source mode: widget asks for screenshot.js next to src/entry.ts; serve the TS module.
      req.url = `/src/screenshot.ts${url.search}`;
      return false;
    }
    if (req.method === 'GET' && url.pathname === '/api/v1/widget/config') {
      const key = url.searchParams.get('key') ?? '';
      if (!PUBLIC_KEY_PATTERN.test(key)) sendJson(res, 404, { error: 'unknown project' });
      else sendJson(res, 200, configFor(key, req));
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/v1/widget/submit') {
      const form = await readForm(req);
      let json: unknown = null;
      try {
        json = JSON.parse(String(form.get('payload')));
      } catch {
        sendJson(res, 400, { error: 'payload is not JSON' });
        return true;
      }
      const file = form.get('screenshot');
      let screenshot: MockSubmission['screenshot'] = null;
      if (file instanceof Blob) {
        screenshot = { type: file.type, size: file.size };
        const okType = (SCREENSHOT_MIME_TYPES as readonly string[]).includes(file.type);
        if (!okType || file.size > SCREENSHOT_MAX_BYTES) {
          last = { status: 400, payload: json, screenshot };
          sendJson(res, 400, { error: 'bad screenshot' });
          return true;
        }
      }
      const parsed = SubmitPayloadSchema.safeParse(json);
      if (!parsed.success) {
        last = { status: 400, payload: json, screenshot };
        sendJson(res, 400, { issues: parsed.error.issues });
      } else if (parsed.data.website || parsed.data.elapsedMs < 2000) {
        last = { status: 200, payload: parsed.data, screenshot };
        sendJson(res, 200, { id: null });
      } else {
        last = { status: 201, payload: parsed.data, screenshot };
        sendJson(res, 201, { id: randomUUID() });
      }
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/__mock/last-submission') {
      sendJson(res, 200, last);
      return true;
    }
    return false;
  }

  return {
    name: 'dymcode-mock-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        handle(req, res).then(
          (handled) => {
            if (!handled) next();
          },
          (error: unknown) => sendJson(res, 500, { error: String(error) }),
        );
      });
    },
  };
}
```

`packages/widget/vite.dev.config.ts`:
```ts
import { defineConfig } from 'vite';
import { mockApi } from './dev/mock-api';

// Source mode: /dev/index.html. Built mode (E2E): /dev/built.html loads dist/ via publicDir.
export default defineConfig({
  plugins: [mockApi()],
  publicDir: 'dist',
  define: { __WIDGET_VERSION__: JSON.stringify('dev') },
  server: { port: 5173, strictPort: true },
});
```

`packages/widget/dev/hostile.css`:
```css
/* A host site that styles everything aggressively; the widget must be unaffected. */
* {
  font: 30px/3 serif !important;
  box-sizing: content-box !important;
  color: #0a0 !important;
}
button,
input,
textarea {
  all: revert !important;
  border: 5px dashed red !important;
}
div {
  padding: 20px !important;
}
```

`packages/widget/dev/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Dymcode widget – dev (source)</title>
    <link rel="stylesheet" href="/dev/hostile.css" />
  </head>
  <body>
    <h1>Host page (source mode)</h1>
    <p>Query overrides: ?locale=ru&amp;badge=0&amp;position=bottom-left&amp;color=ff0066&amp;text=Help</p>
    <input type="password" value="secret-value" />
    <div data-feedback-mask>Masked area</div>
    <script type="module" src="/src/entry.ts" data-project-id="pk_DevDevDevDev1234"></script>
  </body>
</html>
```

`packages/widget/dev/built.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Dymcode widget – dev (built)</title>
    <link rel="stylesheet" href="/dev/hostile.css" />
  </head>
  <body>
    <h1>Host page (built bundle)</h1>
    <input type="password" value="secret-value" />
    <script async src="/widget.js" data-project-id="pk_DevDevDevDev1234"></script>
  </body>
</html>
```

`packages/widget/dev/built-hidden.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Dymcode widget – hidden trigger</title>
    <link rel="stylesheet" href="/dev/hostile.css" />
  </head>
  <body>
    <h1>Host page (hidden trigger)</h1>
    <script async src="/widget.js" data-project-id="pk_DevDevDevDev1234" data-hide-trigger></script>
  </body>
</html>
```

- [ ] **Step 5: Smoke-check the dev server manually**

Run: `pnpm --filter @dymcode/widget dev` (in the background), then:
- `curl -s "http://localhost:5173/api/v1/widget/config?key=pk_DevDevDevDev1234"` → JSON with `"locale":"auto"`;
- `curl -s -o /dev/null -w "%{http_code}" "http://localhost:5173/api/v1/widget/config?key=bad"` → `404`;
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/widget.js` → `200` (after a build).

Stop the server afterwards.

- [ ] **Step 6: Verify and commit**

Run: `pnpm test && pnpm typecheck && pnpm format:check`
Expected: PASS.
```bash
pnpm format
git add packages/widget pnpm-lock.yaml
git commit -m "build(widget): add IIFE + screenshot builds, size budget, dev page and mock API"
```

---

### Task 9: E2E smoke tests, CI and README

**Files:**
- Create: `packages/widget/playwright.config.ts`, `packages/widget/e2e/widget.spec.ts`
- Modify: `packages/widget/package.json` (script `e2e`), `.github/workflows/ci.yml`, `README.md`

**Interfaces:**
- Consumes: build + dev server from Task 8; CSS class names from Task 6 (`.dc-trigger`, `.dc-panel`, `.dc-message`, `.dc-send`, `.dc-thanks`, `.dc-thumb`, `.dc-type[data-type=…]`).

- [ ] **Step 1: Install Playwright**

Run: `pnpm --filter @dymcode/widget add -D @playwright/test`
Run: `pnpm --filter @dymcode/widget exec playwright install chromium`
Add to `packages/widget/package.json` scripts: `"e2e": "playwright test"`.

`packages/widget/playwright.config.ts`:
```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:5173' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm build && pnpm exec vite --config vite.dev.config.ts',
    url: 'http://localhost:5173/dev/built.html',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

- [ ] **Step 2: Write the E2E tests**

`packages/widget/e2e/widget.spec.ts`:
```ts
import { expect, test } from '@playwright/test';

test('trigger keeps its own styles despite hostile host CSS', async ({ page }) => {
  await page.goto('/dev/built.html');
  const trigger = page.locator('[data-dymcode] .dc-trigger');
  await expect(trigger).toHaveText('Feedback');
  const style = await trigger.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { fontSize: cs.fontSize, position: cs.position, borderStyle: cs.borderTopStyle };
  });
  expect(style).toEqual({ fontSize: '14px', position: 'fixed', borderStyle: 'none' });
});

test('submits feedback with a screenshot to the API', async ({ page }) => {
  await page.goto('/dev/built.html');
  await page.locator('.dc-trigger').click();
  await expect(page.locator('.dc-thumb')).toHaveAttribute('data-state', 'ready', { timeout: 15_000 });
  await page.locator('.dc-message').fill('The pricing button does nothing');
  await page.waitForTimeout(2100); // the bot guard drops submissions faster than 2s
  await page.locator('.dc-send').click();
  await expect(page.locator('.dc-thanks')).toBeVisible();

  const last = await (await page.request.get('/__mock/last-submission')).json();
  expect(last.status).toBe(201);
  expect(last.payload.message).toBe('The pricing button does nothing');
  expect(last.payload.metadata.url).toContain('/dev/built.html');
  expect(['image/webp', 'image/jpeg']).toContain(last.screenshot.type);
  expect(last.screenshot.size).toBeGreaterThan(1000);
});

test('hidden trigger can be opened through window.Dymcode', async ({ page }) => {
  await page.goto('/dev/built-hidden.html');
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        if (document.querySelector('[data-dymcode]')) resolve();
        else window.addEventListener('dymcode:ready', () => resolve(), { once: true });
      }),
  );
  await expect(page.locator('.dc-trigger')).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { Dymcode: { open(t: string): void } }).Dymcode.open('idea'));
  await expect(page.locator('.dc-panel')).toBeVisible();
  await expect(page.locator('.dc-type[data-type="idea"]')).toHaveAttribute('aria-pressed', 'true');
});
```

- [ ] **Step 3: Run the E2E tests**

Run: `pnpm --filter @dymcode/widget e2e`
Expected: 3 passed. Playwright CSS locators pierce open shadow roots, so `.dc-*` selectors reach inside the widget. If the screenshot test fails because capture returns null, inspect `modern-screenshot` in the browser console (`page.on('console')`) and fix `src/screenshot.ts`; do not relax the assertion.

- [ ] **Step 4: Update CI**

In `.github/workflows/ci.yml`, append to the `check` job steps (after `pnpm test`):
```yaml
      - run: pnpm --filter @dymcode/widget build
      - run: pnpm --filter @dymcode/widget size
      - run: pnpm --filter @dymcode/widget check:bundle
```
Add a new job:
```yaml
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @dymcode/widget exec playwright install --with-deps chromium
      - run: pnpm --filter @dymcode/widget e2e
```

- [ ] **Step 5: Update the README**

Add to `README.md` a section after "Database tests":
````markdown
## Widget

`packages/widget` builds the embeddable script (`dist/widget.js`, ≤ 20 KB gzip) and the lazily
loaded screenshot module (`dist/screenshot.js`).

```bash
pnpm --filter @dymcode/widget dev     # dev page with a mock API at http://localhost:5173/dev/index.html
pnpm --filter @dymcode/widget build   # dist/widget.js + dist/screenshot.js
pnpm --filter @dymcode/widget size    # enforce the size budget
pnpm --filter @dymcode/widget e2e     # Playwright smoke tests against the built bundle
```

Embed:

```html
<script async src="https://dymcode.dev/w/widget.js" data-project-id="pk_…"></script>
```

Host page API: `Dymcode.open('bug' | 'idea' | 'general')`, `Dymcode.identify({ email, id, name })`,
and the `dymcode:ready` window event. Add `data-hide-trigger` to hide the floating button.
````
Also add `packages/widget` to the "Layout" list: `- \`packages/widget\`: embeddable widget (Shadow DOM, i18n, screenshots)`.

- [ ] **Step 6: Verify and commit**

Run: `pnpm format && pnpm format:check && pnpm typecheck && pnpm test`
Expected: PASS.
```bash
git add packages/widget .github README.md pnpm-lock.yaml
git commit -m "test(widget): add Playwright smoke tests, CI jobs and docs"
```
