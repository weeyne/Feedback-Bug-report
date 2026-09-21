# Phase 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Dymcode monorepo with the shared widget↔API contract package and the complete, tested Supabase database layer: schema, functions, RLS, storage bucket and realtime.

**Architecture:** This is a pnpm + Turborepo monorepo. `packages/shared` is an internal TS-source package that holds zod schemas and constants. `supabase/` holds SQL migrations in the Supabase CLI layout. `supabase/tests` is a workspace package with Vitest DB tests that run against one of two targets behind the same `Db` interface:
- `pglite` (default, local): an in-process PGlite Postgres with a small bootstrap that emulates what Supabase provides (roles, `auth`/`storage`/`extensions` schemas, `auth.uid()`, the realtime publication), plus all migrations applied fresh per test file.
- `supabase` (CI, `DB_TEST_TARGET=supabase`): node-postgres against a real local Supabase started by the CLI in GitHub Actions.

Each test runs inside a transaction that is always rolled back and switches Postgres roles (`authenticated`, `anon`, `service_role`) to exercise RLS as PostgREST would. The developer machine has no working Docker, so the local loop never needs it.

**Tech Stack:** Node 24, pnpm 11, Turborepo 2, TypeScript (strict), zod 4, Vitest, PGlite, node-postgres, Supabase CLI, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-21-dymcode-design.md` (sections 2, 3, 9, 10 are implemented here).

## Global Constraints

- All code, comments, identifiers and docs are in English.
- Product name `Dymcode`, domain `dymcode.dev`, shared bot `DymcodeBot`. These values appear only in `packages/shared/src/brand.ts`.
- Free tier: 20 submissions/month per account, 1 project. Message is 1–5000 chars, email ≤ 254 chars, screenshot ≤ 2MB (`image/webp`, `image/png`, `image/jpeg`), custom CSS ≤ 10240 bytes, console errors ≤ 10 entries of ≤ 500 chars each.
- Public key format: `pk_` + 16 base62 chars.
- `is_pro` truth table: lifetime `paid`; monthly `active` | `on_trial` | `past_due`; monthly `cancelled` with `current_period_end > now()`.
- Every table in `public` has RLS enabled in the same migration that creates it.
- `packages/shared` has exactly one runtime dependency: `zod`. The widget (phase 2) will import only types plus the `./constants` and `./brand` subpaths, so these two files must never import zod.
- TypeScript is `strict` with `noUncheckedIndexedAccess`.
- Migrations are never edited after they are committed on `main`. Changes go into new migrations.
- After Task 8, new tables and functions get no `anon`/`authenticated` privileges by default. Any client access must be granted explicitly in the migration that needs it.
- Run `pnpm format` before every commit.

## Prerequisites (human)

- Node ≥ 24 and pnpm ≥ 11 on PATH.
- Docker is **not** required locally (it is broken on the dev machine). Real-Supabase verification happens only in CI.

## File Map

| Path | Responsibility |
|---|---|
| `package.json`, `pnpm-workspace.yaml`, `turbo.json` | Workspace and task orchestration |
| `tsconfig.base.json` | Shared strict compiler options |
| `.gitignore`, `.gitattributes`, `.nvmrc`, `.editorconfig`, `.prettierrc.json`, `.prettierignore` | Repo hygiene |
| `packages/shared/src/constants.ts` | Limits, enums and patterns (no zod) |
| `packages/shared/src/brand.ts` | Brand constants, `buildBadgeUrl` (no zod) |
| `packages/shared/src/schemas/metadata.ts` | `ClientMetadataSchema`, `ConsoleErrorSchema`, `FeedbackMetadata` type |
| `packages/shared/src/schemas/submit.ts` | `SubmitPayloadSchema` |
| `packages/shared/src/schemas/config.ts` | `WidgetConfigSchema` |
| `packages/shared/src/index.ts` | Barrel export |
| `supabase/config.toml` | Supabase CLI local config |
| `supabase/migrations/20260921000100_profiles.sql` | Enums, `random_base62`, `profiles`, signup trigger |
| `supabase/migrations/20260921000200_core_tables.sql` | All remaining tables + RLS enabled |
| `supabase/migrations/20260921000300_functions.sql` | `is_pro`, `current_user_is_pro`, `consume_quota`, `claim_quota_notice`, `hit_rate_limit` + grants |
| `supabase/migrations/20260921000400_access.sql` | Table/column grants, RLS policies, storage bucket, realtime |
| `supabase/tests/src/db.ts` | Target selection (PGlite / real Supabase), `withTx`, role switching |
| `supabase/tests/src/pglite-bootstrap.sql` | Emulation of Supabase-provided roles, schemas and functions for PGlite |
| `supabase/tests/src/fixtures.ts` | `createUser`, `createProject`, `createFeedback`, `grantPro` |
| `supabase/tests/src/*.test.ts` | DB tests per migration |
| `.github/workflows/ci.yml` | CI: format, typecheck, unit tests, DB tests |
| `README.md` | Local dev setup |

---

### Task 1: Monorepo scaffold

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.gitignore`, `.gitattributes`, `.nvmrc`, `.editorconfig`, `.prettierrc.json`, `.prettierignore`

**Interfaces:**
- Produces: root scripts `typecheck`, `test`, `format`, `format:check`. Turbo tasks `typecheck`, `test`, `test:db`. `tsconfig.base.json` for packages to extend.

- [ ] **Step 1: Create root config files**

`package.json`:
```json
{
  "name": "dymcode",
  "private": true,
  "packageManager": "pnpm@11.20.0",
  "engines": { "node": ">=24" },
  "scripts": {
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  }
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
  - 'supabase/tests'
```

`turbo.json`:
```json
{
  "$schema": "https://turborepo.com/schema.json",
  "tasks": {
    "typecheck": { "dependsOn": ["^typecheck"] },
    "test": { "dependsOn": ["^typecheck"] },
    "test:db": { "cache": false }
  }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "noEmit": true
  }
}
```

`.gitignore`:
```
node_modules/
.turbo/
dist/
coverage/
.env
.env.*
!.env.example
supabase/.branches/
supabase/.temp/
```

`.gitattributes`:
```
* text=auto eol=lf
```

`.nvmrc`:
```
24
```

`.editorconfig`:
```
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true
```

`.prettierrc.json`:
```json
{ "singleQuote": true, "printWidth": 100 }
```

`.prettierignore`:
```
pnpm-lock.yaml
docs/
supabase/.temp/
```

- [ ] **Step 2: Install root dev dependencies**

Run: `pnpm add -D -w turbo typescript prettier`
Expected: `pnpm-lock.yaml` is created and `devDependencies` appear in `package.json`.

- [ ] **Step 3: Verify the workspace runs**

Run: `pnpm typecheck`
Expected: turbo exits 0 ("No tasks were executed" or similar, since there are no packages yet).

Run: `pnpm format:check`
Expected: exit 0. If files are reported, run `pnpm format` and re-check.

- [ ] **Step 4: Normalize line endings and commit**

```bash
git add --renormalize .
git add -A
git commit -m "chore: scaffold pnpm + turborepo monorepo"
```

---

### Task 2: `packages/shared`: constants and brand

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/constants.ts`, `packages/shared/src/brand.ts`, `packages/shared/src/index.ts`
- Test: `packages/shared/src/constants.test.ts`, `packages/shared/src/brand.test.ts`

**Interfaces:**
- Produces (from `@dymcode/shared/constants`):
  `FEEDBACK_TYPES: readonly ['bug','idea','general']`, `type FeedbackType`,
  `WIDGET_POSITIONS: readonly ['bottom-right','bottom-left']`, `type WidgetPosition`,
  `MESSAGE_MAX_LENGTH = 5000`, `EMAIL_MAX_LENGTH = 254`, `TRIGGER_TEXT_MAX_LENGTH = 40`,
  `CUSTOM_CSS_MAX_BYTES = 10240`, `SCREENSHOT_MAX_BYTES = 2097152`,
  `SCREENSHOT_MIME_TYPES: readonly ['image/webp','image/png','image/jpeg']`,
  `CONSOLE_ERRORS_MAX = 10`, `CONSOLE_ERROR_MESSAGE_MAX_LENGTH = 500`,
  `PUBLIC_KEY_PATTERN: RegExp`, `HEX_COLOR_PATTERN: RegExp`.
- Produces (from `@dymcode/shared/brand`):
  `BRAND = { name: 'Dymcode', domain: 'dymcode.dev', url: 'https://dymcode.dev', telegramBot: 'DymcodeBot' }`,
  `buildBadgeUrl(publicKey: string): string`.

- [ ] **Step 1: Create the package skeleton**

`packages/shared/package.json`:
```json
{
  "name": "@dymcode/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./constants": "./src/constants.ts",
    "./brand": "./src/brand.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

`packages/shared/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

Run: `pnpm --filter @dymcode/shared add zod@^4`
Run: `pnpm --filter @dymcode/shared add -D vitest typescript`

- [ ] **Step 2: Write the failing tests**

`packages/shared/src/constants.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { HEX_COLOR_PATTERN, PUBLIC_KEY_PATTERN } from './constants';

describe('PUBLIC_KEY_PATTERN', () => {
  it('accepts pk_ followed by 16 base62 chars', () => {
    expect(PUBLIC_KEY_PATTERN.test('pk_AbCdEfGh12345678')).toBe(true);
  });

  it.each(['pk_short', 'pk_AbCdEfGh123456789', 'sk_AbCdEfGh12345678', 'pk_AbCdEfGh1234567-'])(
    'rejects %s',
    (key) => {
      expect(PUBLIC_KEY_PATTERN.test(key)).toBe(false);
    },
  );
});

describe('HEX_COLOR_PATTERN', () => {
  it('accepts 6-digit hex colors', () => {
    expect(HEX_COLOR_PATTERN.test('#6366f1')).toBe(true);
    expect(HEX_COLOR_PATTERN.test('#ABCDEF')).toBe(true);
  });

  it.each(['6366f1', '#fff', '#6366f1ff', 'red'])('rejects %s', (color) => {
    expect(HEX_COLOR_PATTERN.test(color)).toBe(false);
  });
});
```

`packages/shared/src/brand.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { BRAND, buildBadgeUrl } from './brand';

describe('buildBadgeUrl', () => {
  it('links to the landing page with ref and utm_source', () => {
    expect(buildBadgeUrl('pk_AbCdEfGh12345678')).toBe(
      'https://dymcode.dev/?ref=pk_AbCdEfGh12345678&utm_source=widget',
    );
  });

  it('encodes unexpected characters', () => {
    expect(buildBadgeUrl('a&b')).toBe('https://dymcode.dev/?ref=a%26b&utm_source=widget');
  });
});

describe('BRAND', () => {
  it('derives url from domain', () => {
    expect(BRAND.url).toBe(`https://${BRAND.domain}`);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @dymcode/shared test`
Expected: FAIL with "Failed to resolve import './constants'" (and `./brand`).

- [ ] **Step 4: Implement**

`packages/shared/src/constants.ts`:
```ts
// Must stay free of runtime dependencies: the widget bundle imports this file directly.

export const FEEDBACK_TYPES = ['bug', 'idea', 'general'] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export const WIDGET_POSITIONS = ['bottom-right', 'bottom-left'] as const;
export type WidgetPosition = (typeof WIDGET_POSITIONS)[number];

export const MESSAGE_MAX_LENGTH = 5000;
export const EMAIL_MAX_LENGTH = 254;
export const TRIGGER_TEXT_MAX_LENGTH = 40;
export const CUSTOM_CSS_MAX_BYTES = 10_240;

export const SCREENSHOT_MAX_BYTES = 2 * 1024 * 1024;
export const SCREENSHOT_MIME_TYPES = ['image/webp', 'image/png', 'image/jpeg'] as const;

export const CONSOLE_ERRORS_MAX = 10;
export const CONSOLE_ERROR_MESSAGE_MAX_LENGTH = 500;

export const PUBLIC_KEY_PATTERN = /^pk_[0-9A-Za-z]{16}$/;
export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
```

`packages/shared/src/brand.ts`:
```ts
// Must stay free of runtime dependencies: the widget bundle imports this file directly.

const DOMAIN = 'dymcode.dev';

export const BRAND = {
  name: 'Dymcode',
  domain: DOMAIN,
  url: `https://${DOMAIN}`,
  telegramBot: 'DymcodeBot',
} as const;

/** Landing-page link used by the "Powered by" badge; `ref` attributes signups to the host project. */
export function buildBadgeUrl(publicKey: string): string {
  return `${BRAND.url}/?ref=${encodeURIComponent(publicKey)}&utm_source=widget`;
}
```

`packages/shared/src/index.ts`:
```ts
export * from './constants';
export * from './brand';
```

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter @dymcode/shared test`
Expected: PASS (all tests).

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/shared pnpm-lock.yaml
git commit -m "feat(shared): add brand and limit constants"
```

---

### Task 3: `packages/shared`: metadata and submit payload schemas

**Files:**
- Create: `packages/shared/src/schemas/metadata.ts`, `packages/shared/src/schemas/submit.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/schemas/submit.test.ts`

**Interfaces:**
- Consumes: constants from Task 2.
- Produces:
  - `ConsoleErrorSchema`, `type ConsoleError = { message: string; source?: string; line?: number; at: number }`
  - `ClientMetadataSchema`, `type ClientMetadata = { url; referrer; userAgent; language; timezone; viewport: {w,h}; screen: {w,h,dpr}; consoleErrors: ConsoleError[] }`
  - `type FeedbackMetadata = ClientMetadata & { browser: string; os: string }` (the shape stored in `feedback.metadata`)
  - `SubmitPayloadSchema`, `type SubmitPayload` (output type: `email` is `string | undefined`, `website` is `string`)

- [ ] **Step 1: Write the failing tests**

`packages/shared/src/schemas/submit.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { SubmitPayloadSchema } from './submit';

const metadata = {
  url: 'https://example.com/pricing',
  referrer: '',
  userAgent: 'Mozilla/5.0',
  language: 'en-US',
  timezone: 'Europe/Kyiv',
  viewport: { w: 1280, h: 720 },
  screen: { w: 1920, h: 1080, dpr: 2 },
  consoleErrors: [
    {
      message: 'TypeError: x is undefined',
      source: 'https://example.com/app.js',
      line: 42,
      at: 1758466800000,
    },
  ],
};

const valid = {
  projectKey: 'pk_AbCdEfGh12345678',
  type: 'bug',
  message: 'Button does nothing',
  metadata,
  openedAt: 1758466800000,
  website: '',
};

const parse = (overrides: Record<string, unknown>) =>
  SubmitPayloadSchema.safeParse({ ...valid, ...overrides });

describe('SubmitPayloadSchema', () => {
  it('accepts a valid payload', () => {
    expect(SubmitPayloadSchema.safeParse(valid).success).toBe(true);
  });

  it('trims the message', () => {
    const result = parse({ message: '  hello  ' });
    expect(result.success && result.data.message).toBe('hello');
  });

  it('rejects a whitespace-only message', () => {
    expect(parse({ message: '   ' }).success).toBe(false);
  });

  it('rejects a message longer than 5000 chars', () => {
    expect(parse({ message: 'a'.repeat(5001) }).success).toBe(false);
  });

  it('rejects an unknown type', () => {
    expect(parse({ type: 'praise' }).success).toBe(false);
  });

  it('rejects a malformed project key', () => {
    expect(parse({ projectKey: 'pk_123' }).success).toBe(false);
  });

  it('treats an empty email as absent', () => {
    const result = parse({ email: '' });
    expect(result.success).toBe(true);
    expect(result.success && result.data.email).toBeUndefined();
  });

  it('rejects an invalid email', () => {
    expect(parse({ email: 'not-an-email' }).success).toBe(false);
  });

  it('defaults the honeypot to an empty string', () => {
    const { website: _, ...withoutHoneypot } = valid;
    const result = SubmitPayloadSchema.safeParse(withoutHoneypot);
    expect(result.success && result.data.website).toBe('');
  });

  it('rejects more than 10 console errors', () => {
    const consoleErrors = Array.from({ length: 11 }, () => metadata.consoleErrors[0]);
    expect(parse({ metadata: { ...metadata, consoleErrors } }).success).toBe(false);
  });

  it('rejects a console error message longer than 500 chars', () => {
    const consoleErrors = [{ message: 'e'.repeat(501), at: 1 }];
    expect(parse({ metadata: { ...metadata, consoleErrors } }).success).toBe(false);
  });

  it('rejects a non-http page url', () => {
    expect(parse({ metadata: { ...metadata, url: 'javascript:alert(1)' } }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @dymcode/shared test`
Expected: FAIL with "Failed to resolve import './submit'".

- [ ] **Step 3: Implement**

`packages/shared/src/schemas/metadata.ts`:
```ts
import { z } from 'zod';
import { CONSOLE_ERRORS_MAX, CONSOLE_ERROR_MESSAGE_MAX_LENGTH } from '../constants';

const dimension = z.number().int().nonnegative().max(100_000);

export const ConsoleErrorSchema = z.object({
  message: z.string().max(CONSOLE_ERROR_MESSAGE_MAX_LENGTH),
  source: z.string().max(2048).optional(),
  line: z.number().int().nonnegative().optional(),
  /** Epoch milliseconds. */
  at: z.number().int().nonnegative(),
});
export type ConsoleError = z.infer<typeof ConsoleErrorSchema>;

/** Context collected by the widget. Browser and OS are parsed server-side from `userAgent`. */
export const ClientMetadataSchema = z.object({
  url: z.url({ protocol: /^https?$/ }).max(2048),
  referrer: z.string().max(2048),
  userAgent: z.string().max(1024),
  language: z.string().max(35),
  timezone: z.string().max(64),
  viewport: z.object({ w: dimension, h: dimension }),
  screen: z.object({ w: dimension, h: dimension, dpr: z.number().positive().max(10) }),
  consoleErrors: z.array(ConsoleErrorSchema).max(CONSOLE_ERRORS_MAX),
});
export type ClientMetadata = z.infer<typeof ClientMetadataSchema>;

/** Shape persisted in `feedback.metadata`. */
export type FeedbackMetadata = ClientMetadata & { browser: string; os: string };
```

`packages/shared/src/schemas/submit.ts`:
```ts
import { z } from 'zod';
import {
  EMAIL_MAX_LENGTH,
  FEEDBACK_TYPES,
  MESSAGE_MAX_LENGTH,
  PUBLIC_KEY_PATTERN,
} from '../constants';
import { ClientMetadataSchema } from './metadata';

/** JSON sent in the `payload` field of `POST /api/v1/widget/submit`. */
export const SubmitPayloadSchema = z.object({
  projectKey: z.string().regex(PUBLIC_KEY_PATTERN),
  type: z.enum(FEEDBACK_TYPES),
  message: z.string().trim().min(1).max(MESSAGE_MAX_LENGTH),
  email: z
    .union([z.email().max(EMAIL_MAX_LENGTH), z.literal('').transform(() => undefined)])
    .optional(),
  metadata: ClientMetadataSchema,
  /** Epoch ms when the modal was opened; submissions faster than 2s are treated as bots. */
  openedAt: z.number().int().positive(),
  /** Honeypot: real users never fill it. */
  website: z.string().max(200).default(''),
});
export type SubmitPayload = z.infer<typeof SubmitPayloadSchema>;
```

Modify `packages/shared/src/index.ts`:
```ts
export * from './constants';
export * from './brand';
export * from './schemas/metadata';
export * from './schemas/submit';
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @dymcode/shared test`
Expected: PASS.

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add submit payload and metadata schemas"
```

---

### Task 4: `packages/shared`: widget config schema

**Files:**
- Create: `packages/shared/src/schemas/config.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/schemas/config.test.ts`

**Interfaces:**
- Produces: `WidgetConfigSchema`, `type WidgetConfig = { primaryColor: string; triggerText: string; position: WidgetPosition; showBadge: boolean; customCss: string | null; badgeUrl: string }`. This is the response body of `GET /api/v1/widget/config`.

- [ ] **Step 1: Write the failing tests**

`packages/shared/src/schemas/config.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { WidgetConfigSchema } from './config';

const valid = {
  primaryColor: '#6366f1',
  triggerText: 'Feedback',
  position: 'bottom-right',
  showBadge: true,
  customCss: null,
  badgeUrl: 'https://dymcode.dev/?ref=pk_AbCdEfGh12345678&utm_source=widget',
};

const parse = (overrides: Record<string, unknown>) =>
  WidgetConfigSchema.safeParse({ ...valid, ...overrides });

describe('WidgetConfigSchema', () => {
  it('accepts a valid config', () => {
    expect(WidgetConfigSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts custom css', () => {
    expect(parse({ customCss: '.trigger { border-radius: 0; }' }).success).toBe(true);
  });

  it('rejects an invalid color', () => {
    expect(parse({ primaryColor: 'blue' }).success).toBe(false);
  });

  it('rejects an unknown position', () => {
    expect(parse({ position: 'top-left' }).success).toBe(false);
  });

  it('rejects empty or too long trigger text', () => {
    expect(parse({ triggerText: '' }).success).toBe(false);
    expect(parse({ triggerText: 'x'.repeat(41) }).success).toBe(false);
  });

  it('rejects custom css over the size limit', () => {
    expect(parse({ customCss: 'a'.repeat(10_241) }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @dymcode/shared test`
Expected: FAIL with "Failed to resolve import './config'".

- [ ] **Step 3: Implement**

`packages/shared/src/schemas/config.ts`:
```ts
import { z } from 'zod';
import {
  CUSTOM_CSS_MAX_BYTES,
  HEX_COLOR_PATTERN,
  TRIGGER_TEXT_MAX_LENGTH,
  WIDGET_POSITIONS,
} from '../constants';

/** Response of `GET /api/v1/widget/config`. Plan gating is already applied server-side. */
export const WidgetConfigSchema = z.object({
  primaryColor: z.string().regex(HEX_COLOR_PATTERN),
  triggerText: z.string().min(1).max(TRIGGER_TEXT_MAX_LENGTH),
  position: z.enum(WIDGET_POSITIONS),
  showBadge: z.boolean(),
  // Char count approximates the byte limit; the DB enforces octet_length exactly.
  customCss: z.string().max(CUSTOM_CSS_MAX_BYTES).nullable(),
  badgeUrl: z.url(),
});
export type WidgetConfig = z.infer<typeof WidgetConfigSchema>;
```

Modify `packages/shared/src/index.ts`:
```ts
export * from './constants';
export * from './brand';
export * from './schemas/metadata';
export * from './schemas/submit';
export * from './schemas/config';
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @dymcode/shared test`
Expected: PASS.

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add widget config schema"
```

---

### Task 5: Supabase CLI, DB test harness (PGlite + real Supabase), profiles migration

**Files:**
- Create: `supabase/config.toml` (generated), `supabase/migrations/20260921000100_profiles.sql`
- Create: `supabase/tests/package.json`, `supabase/tests/tsconfig.json`, `supabase/tests/vitest.config.ts`, `supabase/tests/src/setup.ts`, `supabase/tests/src/db.ts`, `supabase/tests/src/pglite-bootstrap.sql`, `supabase/tests/src/fixtures.ts`
- Modify: `package.json` (root scripts), `turbo.json` (drop `test:db`, disable cache for db tests)
- Test: `supabase/tests/src/profiles.test.ts`

**Interfaces:**
- Produces (`supabase/tests/src/db.ts`):
  ```ts
  type Row = Record<string, unknown>;
  interface Db {
    query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]>;
    queryError(sql: string, params?: unknown[]): Promise<string>; // error message; throws if the query succeeds
    asUser(uid: string): Promise<void>;
    asAnon(): Promise<void>;
    asServiceRole(): Promise<void>;
    asPostgres(): Promise<void>;
  }
  function connect(): Promise<void>;    // opens the target selected by DB_TEST_TARGET ('pglite' default | 'supabase')
  function disconnect(): Promise<void>;
  function withTx<T>(fn: (db: Db) => Promise<T>): Promise<T>; // always rolls back
  ```
  Both targets return `int8`/`bigint` columns as **strings** (node-postgres behaviour). The PGlite target is configured to match.
- Produces (`supabase/tests/src/fixtures.ts`), all run as the current role (use as postgres):
  ```ts
  createUser(db: Db, email?: string): Promise<string>                       // returns user id
  createProject(db: Db, ownerId: string, name?: string): Promise<{ id: string; public_key: string }>
  createFeedback(db: Db, projectId: string, opts?: { overQuota?: boolean; message?: string }): Promise<string>
  grantPro(db: Db, userId: string, opts?: { plan?: 'pro_monthly' | 'pro_lifetime'; status?: string; periodEnd?: string | null }): Promise<void>
  // periodEnd is a Postgres interval relative to now(), e.g. '1 day' or '-1 day'
  ```
- Produces (SQL): enums `feedback_type`, `feedback_status`, `widget_position`, `integration_kind`, `plan_kind`; `public.random_base62(len int) returns text`; table `public.profiles`; trigger `on_auth_user_created`.
- Root scripts: `db:start`, `db:stop`, `db:reset` (CLI, need Docker, used in CI only) and `db:test` (PGlite locally, real Supabase when `DB_TEST_TARGET=supabase`).
- `pnpm test` (turbo) now also runs the DB tests on PGlite.

- [ ] **Step 1: Install and initialize the Supabase CLI**

Run: `pnpm add -D -w supabase`
If pnpm reports that the `supabase` build script was ignored, run `pnpm approve-builds` and approve `supabase` (this downloads the CLI binary and records the approval in the workspace config). Commit that config change with this task.

Run: `pnpm supabase --version`
Expected: prints a version (2.x).

Run: `pnpm supabase init` (answer **N** to the VS Code/Deno prompts; `init` does not need Docker)
Expected: `supabase/config.toml` is created.

Edit `supabase/config.toml`: set `project_id = "dymcode"`.

Add to root `package.json` `scripts`:
```json
"db:start": "supabase start",
"db:stop": "supabase stop",
"db:reset": "supabase db reset",
"db:test": "pnpm --filter @dymcode/db-tests test"
```

Replace `turbo.json` with (the `test:db` task is gone; DB tests must not be cached because their real inputs, `supabase/migrations`, live outside the package):
```json
{
  "$schema": "https://turborepo.com/schema.json",
  "tasks": {
    "typecheck": { "dependsOn": ["^typecheck"] },
    "test": { "dependsOn": ["^typecheck"] },
    "@dymcode/db-tests#test": { "dependsOn": ["^typecheck"], "cache": false }
  }
}
```

- [ ] **Step 2: Create the test package**

`supabase/tests/package.json`:
```json
{
  "name": "@dymcode/db-tests",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

Run: `pnpm --filter @dymcode/db-tests add -D vitest typescript pg @types/pg @types/node @electric-sql/pglite`
Run: `pnpm --filter @dymcode/db-tests add -D "@dymcode/shared@workspace:*"`

`supabase/tests/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["src", "vitest.config.ts"]
}
```

`supabase/tests/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./src/setup.ts'],
    // One database per file; sequential files keep the real-Supabase target free of lock contention.
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 60_000, // PGlite boot + migrations
  },
});
```

`supabase/tests/src/pglite-bootstrap.sql`:
```sql
-- Emulates what a Supabase project provides before user migrations run.
-- Used only by the PGlite target; the real stack (CI) provides all of this itself.

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

create schema extensions;
create extension pgcrypto with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;

-- Supabase grants everything in public to the API roles by default; migrations must revoke.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  id          uuid primary key,
  instance_id uuid,
  aud         varchar(255),
  role        varchar(255),
  email       varchar(255),
  created_at  timestamptz default now()
);

-- Same definition as Supabase's auth.uid().
create function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;

create schema storage;
create table storage.buckets (
  id                 text primary key,
  name               text not null unique,
  public             boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz default now()
);

create publication supabase_realtime;
```

`supabase/tests/src/db.ts`:
```ts
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
```

If the installed PGlite version exposes a different API for `parsers`, `extensions` or the `pgcrypto` contrib import path, adapt `openPglite` to the installed version's documented API while keeping the same behaviour (int8 as string, pgcrypto available in schema `extensions`), and note it in the report.

`supabase/tests/src/setup.ts`:
```ts
import { afterAll, beforeAll } from 'vitest';
import { connect, disconnect } from './db';

beforeAll(connect);
afterAll(disconnect);
```

`supabase/tests/src/fixtures.ts`:
```ts
import { randomUUID } from 'node:crypto';
import type { Db } from './db';

export async function createUser(db: Db, email = `${randomUUID()}@test.dev`): Promise<string> {
  const id = randomUUID();
  await db.query(
    `insert into auth.users (id, instance_id, aud, role, email)
     values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2)`,
    [id, email],
  );
  return id;
}

export async function createProject(
  db: Db,
  ownerId: string,
  name = 'Test project',
): Promise<{ id: string; public_key: string }> {
  const [row] = await db.query<{ id: string; public_key: string }>(
    'insert into public.projects (owner_id, name) values ($1, $2) returning id, public_key',
    [ownerId, name],
  );
  if (!row) throw new Error('Project insert returned no row');
  return row;
}

export async function createFeedback(
  db: Db,
  projectId: string,
  opts: { overQuota?: boolean; message?: string } = {},
): Promise<string> {
  const [row] = await db.query<{ id: string }>(
    `insert into public.feedback (project_id, type, message, over_quota)
     values ($1, 'bug', $2, $3) returning id`,
    [projectId, opts.message ?? 'Something broke', opts.overQuota ?? false],
  );
  if (!row) throw new Error('Feedback insert returned no row');
  return row.id;
}

export async function grantPro(
  db: Db,
  userId: string,
  opts: { plan?: 'pro_monthly' | 'pro_lifetime'; status?: string; periodEnd?: string | null } = {},
): Promise<void> {
  await db.query(
    `insert into public.subscriptions (user_id, plan, status, current_period_end)
     values ($1, $2, $3, case when $4::text is null then null else now() + $4::interval end)`,
    [userId, opts.plan ?? 'pro_lifetime', opts.status ?? 'paid', opts.periodEnd ?? null],
  );
}
```

- [ ] **Step 3: Write the failing test**

`supabase/tests/src/profiles.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { withTx } from './db';
import { createUser } from './fixtures';

describe('profiles', () => {
  it('creates a profile when an auth user signs up', () =>
    withTx(async (db) => {
      const id = await createUser(db, 'maker@test.dev');
      const rows = await db.query('select email from public.profiles where id = $1', [id]);
      expect(rows).toEqual([{ email: 'maker@test.dev' }]);
    }));

  it('has RLS enabled', () =>
    withTx(async (db) => {
      const rows = await db.query(
        `select relrowsecurity from pg_class where oid = 'public.profiles'::regclass`,
      );
      expect(rows).toEqual([{ relrowsecurity: true }]);
    }));
});

describe('random_base62', () => {
  it('returns a base62 string of the requested length', () =>
    withTx(async (db) => {
      const [row] = await db.query<{ value: string }>('select public.random_base62(16) as value');
      expect(row?.value).toMatch(/^[0-9A-Za-z]{16}$/);
    }));
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm db:test`
Expected: FAIL with `relation "public.profiles" does not exist` / `function public.random_base62(integer) does not exist`. If `supabase/migrations/` does not exist yet, create it empty first (`mkdir supabase/migrations`), so the failure is about the missing schema and not an ENOENT.

- [ ] **Step 5: Write the migration**

`supabase/migrations/20260921000100_profiles.sql`:
```sql
-- Enums used across the schema
create type public.feedback_type as enum ('bug', 'idea', 'general');
create type public.feedback_status as enum ('new', 'resolved', 'archived');
create type public.widget_position as enum ('bottom-right', 'bottom-left');
create type public.integration_kind as enum ('discord', 'telegram_shared', 'telegram_custom');
create type public.plan_kind as enum ('pro_monthly', 'pro_lifetime');

-- Random base62 string for public keys and link codes (modulo bias is negligible here)
create function public.random_base62(len int)
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(
    substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', (get_byte(b, i) % 62) + 1, 1),
    '' order by i
  )
  from extensions.gen_random_bytes(len) as b, generate_series(0, len - 1) as i
$$;

-- 1:1 with auth.users
create table public.profiles (
  id                  uuid primary key references auth.users on delete cascade,
  email               text not null,
  referred_by_project uuid, -- FK added in core_tables once projects exists
  created_at          timestamptz not null default now()
);
alter table public.profiles enable row level security;

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email) values (new.id, coalesce(new.email, ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

- [ ] **Step 6: Apply and run the tests**

Run: `pnpm db:test`
Expected: PASS (3 tests). PGlite applies all migrations fresh, so no reset step is needed.

Run: `pnpm test`
Expected: shared + db tests pass.

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add package.json turbo.json pnpm-lock.yaml pnpm-workspace.yaml supabase
git commit -m "feat(db): add supabase setup, db test harness and profiles"
```

---

### Task 6: Core tables migration

**Files:**
- Create: `supabase/migrations/20260921000200_core_tables.sql`
- Test: `supabase/tests/src/core-tables.test.ts`

**Interfaces:**
- Consumes: enums, `random_base62`, `profiles` (Task 5); fixtures (Task 5).
- Produces: tables `subscriptions`, `projects`, `integrations`, `telegram_link_codes`, `feedback`, `usage_counters`, `rate_limits`, exactly as in spec §3. `projects.public_key` defaults to `'pk_' || random_base62(16)`. `telegram_link_codes.code` defaults to `random_base62(12)` and `expires_at` to `now() + interval '15 minutes'`. RLS is enabled on every table.

- [ ] **Step 1: Write the failing tests**

`supabase/tests/src/core-tables.test.ts`:
```ts
import { PUBLIC_KEY_PATTERN } from '@dymcode/shared/constants';
import { describe, expect, it } from 'vitest';
import { withTx } from './db';
import { createFeedback, createProject, createUser } from './fixtures';

describe('projects', () => {
  it('generates a public key in the shared format', () =>
    withTx(async (db) => {
      const owner = await createUser(db);
      const project = await createProject(db, owner);
      expect(project.public_key).toMatch(PUBLIC_KEY_PATTERN);
    }));

  it('applies widget defaults', () =>
    withTx(async (db) => {
      const owner = await createUser(db);
      const { id } = await createProject(db, owner);
      const rows = await db.query(
        `select primary_color, trigger_text, position, hide_badge, allowed_origins
         from public.projects where id = $1`,
        [id],
      );
      expect(rows).toEqual([
        {
          primary_color: '#6366f1',
          trigger_text: 'Feedback',
          position: 'bottom-right',
          hide_badge: false,
          allowed_origins: [],
        },
      ]);
    }));

  it('rejects an invalid primary color', () =>
    withTx(async (db) => {
      const owner = await createUser(db);
      const error = await db.queryError(
        `insert into public.projects (owner_id, name, primary_color) values ($1, 'x', 'blue')`,
        [owner],
      );
      expect(error).toMatch(/projects_primary_color_check/);
    }));

  it('rejects custom css over 10240 bytes', () =>
    withTx(async (db) => {
      const owner = await createUser(db);
      const error = await db.queryError(
        `insert into public.projects (owner_id, name, custom_css) values ($1, 'x', repeat('a', 10241))`,
        [owner],
      );
      expect(error).toMatch(/projects_custom_css_check/);
    }));

  it('cascades deletes to feedback and integrations', () =>
    withTx(async (db) => {
      const owner = await createUser(db);
      const { id } = await createProject(db, owner);
      await createFeedback(db, id);
      await db.query(
        `insert into public.integrations (project_id, kind, target) values ($1, 'telegram_shared', '42')`,
        [id],
      );
      await db.query('delete from public.projects where id = $1', [id]);
      const [counts] = await db.query(
        `select (select count(*)::int from public.feedback where project_id = $1) as feedback,
                (select count(*)::int from public.integrations where project_id = $1) as integrations`,
        [id],
      );
      expect(counts).toEqual({ feedback: 0, integrations: 0 });
    }));

  it('nulls referral attribution when the referring project is deleted', () =>
    withTx(async (db) => {
      const owner = await createUser(db);
      const referred = await createUser(db);
      const { id } = await createProject(db, owner);
      await db.query('update public.profiles set referred_by_project = $1 where id = $2', [
        id,
        referred,
      ]);
      await db.query('delete from public.projects where id = $1', [id]);
      const rows = await db.query('select referred_by_project from public.profiles where id = $1', [
        referred,
      ]);
      expect(rows).toEqual([{ referred_by_project: null }]);
    }));
});

describe('feedback', () => {
  it('rejects an empty message', () =>
    withTx(async (db) => {
      const owner = await createUser(db);
      const { id } = await createProject(db, owner);
      const error = await db.queryError(
        `insert into public.feedback (project_id, type, message) values ($1, 'bug', '')`,
        [id],
      );
      expect(error).toMatch(/feedback_message_check/);
    }));

  it('defaults to status new and not over quota', () =>
    withTx(async (db) => {
      const owner = await createUser(db);
      const { id } = await createProject(db, owner);
      const feedbackId = await createFeedback(db, id);
      const rows = await db.query(
        'select status, over_quota, metadata from public.feedback where id = $1',
        [feedbackId],
      );
      expect(rows).toEqual([{ status: 'new', over_quota: false, metadata: {} }]);
    }));
});

describe('integrations', () => {
  it('allows one integration per kind per project', () =>
    withTx(async (db) => {
      const owner = await createUser(db);
      const { id } = await createProject(db, owner);
      const insert = `insert into public.integrations (project_id, kind) values ($1, 'discord')`;
      await db.query(insert, [id]);
      expect(await db.queryError(insert, [id])).toMatch(/duplicate key/);
    }));
});

describe('telegram_link_codes', () => {
  it('generates a 12-char code expiring in 15 minutes', () =>
    withTx(async (db) => {
      const owner = await createUser(db);
      const { id } = await createProject(db, owner);
      const [row] = await db.query<{ code: string; ttl_minutes: number }>(
        `insert into public.telegram_link_codes (project_id) values ($1)
         returning code, round(extract(epoch from expires_at - now()) / 60)::int as ttl_minutes`,
        [id],
      );
      expect(row?.code).toMatch(/^[0-9A-Za-z]{12}$/);
      expect(row?.ttl_minutes).toBe(15);
    }));
});

describe('row level security', () => {
  it('is enabled on every public table', () =>
    withTx(async (db) => {
      const rows = await db.query(
        `select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
      );
      expect(rows).toEqual([]);
    }));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm db:test`
Expected: FAIL with `relation "public.projects" does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260921000200_core_tables.sql`:
```sql
create table public.subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles on delete cascade,
  plan               public.plan_kind not null,
  status             text not null,          -- raw Lemon Squeezy status
  ls_customer_id     text,
  ls_subscription_id text unique,            -- monthly only
  ls_order_id        text unique,            -- lifetime only
  current_period_end timestamptz,            -- monthly only
  updated_at         timestamptz not null default now()
);
create index subscriptions_user_id_idx on public.subscriptions (user_id);
alter table public.subscriptions enable row level security;

create table public.projects (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.profiles on delete cascade,
  public_key      text not null unique default ('pk_' || public.random_base62(16)),
  name            text not null check (char_length(name) between 1 and 80),
  allowed_origins text[] not null default '{}', -- empty = any origin
  primary_color   text not null default '#6366f1' check (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  trigger_text    text not null default 'Feedback' check (char_length(trigger_text) between 1 and 40),
  position        public.widget_position not null default 'bottom-right',
  hide_badge      boolean not null default false, -- applied only when the owner is Pro
  custom_css      text check (octet_length(custom_css) <= 10240), -- applied only when the owner is Pro
  created_at      timestamptz not null default now()
);
create index projects_owner_id_idx on public.projects (owner_id);
alter table public.projects enable row level security;

alter table public.profiles
  add constraint profiles_referred_by_project_fkey
  foreign key (referred_by_project) references public.projects on delete set null;

create table public.integrations (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects on delete cascade,
  kind              public.integration_kind not null,
  enabled           boolean not null default true,
  target            text,             -- telegram chat_id
  secret_encrypted  text,             -- discord webhook URL or custom bot token (AES-256-GCM)
  last_error        text,
  last_delivered_at timestamptz,
  created_at        timestamptz not null default now(),
  unique (project_id, kind)
);
alter table public.integrations enable row level security;

create table public.telegram_link_codes (
  code       text primary key default public.random_base62(12),
  project_id uuid not null references public.projects on delete cascade,
  expires_at timestamptz not null default (now() + interval '15 minutes')
);
alter table public.telegram_link_codes enable row level security;

create table public.feedback (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects on delete cascade,
  type            public.feedback_type not null,
  message         text not null check (char_length(message) between 1 and 5000),
  email           text check (char_length(email) <= 254),
  screenshot_path text,               -- screenshots/{project_id}/{feedback_id}.{ext}
  metadata        jsonb not null default '{}',
  status          public.feedback_status not null default 'new',
  over_quota      boolean not null default false,
  created_at      timestamptz not null default now()
);
create index feedback_project_created_idx on public.feedback (project_id, created_at desc);
alter table public.feedback enable row level security;

create table public.usage_counters (
  owner_id          uuid not null references public.profiles on delete cascade,
  period            date not null,    -- first day of month, UTC
  count             int not null default 0,
  quota_notice_sent boolean not null default false,
  primary key (owner_id, period)
);
alter table public.usage_counters enable row level security;

create table public.rate_limits (
  key          text not null,         -- e.g. 'submit:{project_key}:{ip_hash}'
  window_start timestamptz not null,
  count        int not null default 0,
  primary key (key, window_start)
);
alter table public.rate_limits enable row level security;
```

- [ ] **Step 4: Apply and run the tests**

Run: `pnpm db:test`
Expected: PASS (all profiles + core-tables tests).

- [ ] **Step 5: Commit**

```bash
git add supabase
git commit -m "feat(db): add core tables"
```

---

### Task 7: Billing, quota and rate-limit functions

**Files:**
- Create: `supabase/migrations/20260921000300_functions.sql`
- Test: `supabase/tests/src/functions.test.ts`

**Interfaces:**
- Consumes: tables from Task 6; `grantPro`, `createUser` fixtures.
- Produces (all `security definer`, `search_path = ''`):
  - `public.is_pro(p_uid uuid) returns boolean`: service_role only
  - `public.current_user_is_pro() returns boolean`: `is_pro(auth.uid())`, executable by `authenticated`
  - `public.consume_quota(p_owner uuid) returns int`: new count for the current UTC month; service_role only
  - `public.claim_quota_notice(p_owner uuid) returns boolean`: true exactly once per owner per month, and only after a counter row exists; service_role only
  - `public.hit_rate_limit(p_key text, p_max int, p_window_seconds int) returns boolean`: true when the limit is **exceeded**; service_role only

- [ ] **Step 1: Write the failing tests**

`supabase/tests/src/functions.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { withTx } from './db';
import { createUser, grantPro } from './fixtures';

describe('is_pro', () => {
  it('is false without subscriptions', () =>
    withTx(async (db) => {
      const uid = await createUser(db);
      const [row] = await db.query('select public.is_pro($1) as pro', [uid]);
      expect(row).toEqual({ pro: false });
    }));

  it.each([
    ['pro_lifetime', 'paid', null, true],
    ['pro_lifetime', 'refunded', null, false],
    ['pro_monthly', 'active', '1 month', true],
    ['pro_monthly', 'on_trial', '7 days', true],
    ['pro_monthly', 'past_due', '-1 day', true],
    ['pro_monthly', 'cancelled', '1 day', true],
    ['pro_monthly', 'cancelled', '-1 day', false],
    ['pro_monthly', 'expired', '-1 day', false],
    ['pro_monthly', 'unpaid', '-1 day', false],
  ] as const)('%s / %s (period end %s) -> %s', (plan, status, periodEnd, expected) =>
    withTx(async (db) => {
      const uid = await createUser(db);
      await grantPro(db, uid, { plan, status, periodEnd });
      const [row] = await db.query('select public.is_pro($1) as pro', [uid]);
      expect(row).toEqual({ pro: expected });
    }),
  );

  it('current_user_is_pro reflects the signed-in user', () =>
    withTx(async (db) => {
      const pro = await createUser(db);
      const free = await createUser(db);
      await grantPro(db, pro);
      await db.asUser(pro);
      expect(await db.query('select public.current_user_is_pro() as pro')).toEqual([{ pro: true }]);
      await db.asUser(free);
      expect(await db.query('select public.current_user_is_pro() as pro')).toEqual([{ pro: false }]);
    }));
});

describe('consume_quota', () => {
  it('increments per owner for the current month', () =>
    withTx(async (db) => {
      const a = await createUser(db);
      const b = await createUser(db);
      const consume = async (uid: string) =>
        (await db.query<{ n: number }>('select public.consume_quota($1) as n', [uid]))[0]?.n;
      expect(await consume(a)).toBe(1);
      expect(await consume(a)).toBe(2);
      expect(await consume(b)).toBe(1);
      expect(await consume(a)).toBe(3);
      const rows = await db.query(
        `select period = date_trunc('month', now() at time zone 'utc')::date as current
         from public.usage_counters where owner_id = $1`,
        [a],
      );
      expect(rows).toEqual([{ current: true }]);
    }));
});

describe('claim_quota_notice', () => {
  it('returns true once per month after usage exists', () =>
    withTx(async (db) => {
      const uid = await createUser(db);
      const claim = async () =>
        (await db.query<{ ok: boolean }>('select public.claim_quota_notice($1) as ok', [uid]))[0]?.ok;
      expect(await claim()).toBe(false); // no counter row yet
      await db.query('select public.consume_quota($1)', [uid]);
      expect(await claim()).toBe(true);
      expect(await claim()).toBe(false);
    }));
});

describe('hit_rate_limit', () => {
  it('reports exceeded after max hits within the window', () =>
    withTx(async (db) => {
      const hit = async (key: string) =>
        (await db.query<{ limited: boolean }>('select public.hit_rate_limit($1, 5, 60) as limited', [key]))[0]
          ?.limited;
      for (let i = 0; i < 5; i++) expect(await hit('submit:a')).toBe(false);
      expect(await hit('submit:a')).toBe(true);
      expect(await hit('submit:b')).toBe(false);
    }));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm db:test`
Expected: FAIL with `function public.is_pro(uuid) does not exist` (and similar for the others).

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260921000300_functions.sql`:
```sql
-- Single source of truth for Pro status.
create function public.is_pro(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.subscriptions s
    where s.user_id = p_uid
      and (
        (s.plan = 'pro_lifetime' and s.status = 'paid')
        or (s.plan = 'pro_monthly' and s.status in ('active', 'on_trial', 'past_due'))
        or (s.plan = 'pro_monthly' and s.status = 'cancelled' and s.current_period_end > now())
      )
  );
$$;

-- Used by RLS policies; cannot be pointed at another user.
create function public.current_user_is_pro()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_pro(auth.uid());
$$;

-- Atomically counts one submission for the owner in the current UTC month.
create function public.consume_quota(p_owner uuid)
returns int
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.usage_counters as u (owner_id, period, count)
  values (p_owner, date_trunc('month', now() at time zone 'utc')::date, 1)
  on conflict (owner_id, period) do update set count = u.count + 1
  returning u.count;
$$;

-- True only for the first caller per owner per month: gates the one-time "limit reached" alert.
create function public.claim_quota_notice(p_owner uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.usage_counters
  set quota_notice_sent = true
  where owner_id = p_owner
    and period = date_trunc('month', now() at time zone 'utc')::date
    and not quota_notice_sent;
  return found;
end;
$$;

-- Fixed-window counter. Returns true when the limit is exceeded.
create function public.hit_rate_limit(p_key text, p_max int, p_window_seconds int)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_window timestamptz :=
    to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count int;
begin
  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set count = r.count + 1
  returning r.count into v_count;

  -- Opportunistic cleanup keeps the table small without a cron job.
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_count > p_max;
end;
$$;

-- Supabase grants execute on new functions to anon/authenticated by default; lock them down.
revoke execute on function
  public.is_pro(uuid),
  public.current_user_is_pro(),
  public.consume_quota(uuid),
  public.claim_quota_notice(uuid),
  public.hit_rate_limit(text, int, int),
  public.handle_new_user(),
  public.random_base62(int)
from public, anon, authenticated;

grant execute on function
  public.is_pro(uuid),
  public.consume_quota(uuid),
  public.claim_quota_notice(uuid),
  public.hit_rate_limit(text, int, int),
  public.random_base62(int)
to service_role;

grant execute on function public.current_user_is_pro() to authenticated, service_role;
```

- [ ] **Step 4: Apply and run the tests**

Run: `pnpm db:test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase
git commit -m "feat(db): add pro, quota and rate-limit functions"
```

---

### Task 8: Access control: grants, RLS policies, storage bucket, realtime

**Files:**
- Create: `supabase/migrations/20260921000400_access.sql`
- Test: `supabase/tests/src/access.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces the access model from spec §3 "RLS and access":
  - `anon`: no table privileges in `public`.
  - `authenticated`:
    - select own `profiles`;
    - select/delete own `projects`, with update only on the settings columns;
    - select own `feedback` where `not over_quota or current_user_is_pro()`, update only `status`, delete own;
    - no access to `subscriptions`, `integrations`, `telegram_link_codes`, `usage_counters`, `rate_limits`.
  - `service_role`: full access (bypasses RLS).
  - Private storage bucket `screenshots` (2MB, webp/png/jpeg).
  - `public.feedback` in the `supabase_realtime` publication.

- [ ] **Step 1: Write the failing tests**

`supabase/tests/src/access.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { type Db, withTx } from './db';
import { createFeedback, createProject, createUser, grantPro } from './fixtures';

/** Two tenants: A (free) with one visible and one over-quota feedback, B with one feedback. */
async function seed(db: Db) {
  const a = await createUser(db);
  const b = await createUser(db);
  const projectA = await createProject(db, a, 'A');
  const projectB = await createProject(db, b, 'B');
  const visible = await createFeedback(db, projectA.id, { message: 'visible' });
  const hidden = await createFeedback(db, projectA.id, { message: 'hidden', overQuota: true });
  const foreign = await createFeedback(db, projectB.id, { message: 'foreign' });
  return { a, b, projectA, projectB, visible, hidden, foreign };
}

describe('projects access', () => {
  it('shows users only their own projects', () =>
    withTx(async (db) => {
      const { a, projectA } = await seed(db);
      await db.asUser(a);
      expect(await db.query('select id from public.projects')).toEqual([{ id: projectA.id }]);
    }));

  it('forbids creating projects from the client', () =>
    withTx(async (db) => {
      const { a } = await seed(db);
      await db.asUser(a);
      const error = await db.queryError(
        `insert into public.projects (owner_id, name) values ($1, 'sneaky')`,
        [a],
      );
      expect(error).toMatch(/permission denied/);
    }));

  it('allows updating settings columns on own project only', () =>
    withTx(async (db) => {
      const { a, projectA, projectB } = await seed(db);
      await db.asUser(a);
      const own = await db.query(
        `update public.projects set primary_color = '#000000' where id = $1 returning id`,
        [projectA.id],
      );
      expect(own).toHaveLength(1);
      const foreign = await db.query(
        `update public.projects set primary_color = '#000000' where id = $1 returning id`,
        [projectB.id],
      );
      expect(foreign).toHaveLength(0);
    }));

  it('forbids changing owner_id or public_key', () =>
    withTx(async (db) => {
      const { a, b, projectA } = await seed(db);
      await db.asUser(a);
      expect(
        await db.queryError('update public.projects set owner_id = $1 where id = $2', [b, projectA.id]),
      ).toMatch(/permission denied/);
      expect(
        await db.queryError(`update public.projects set public_key = 'pk_x' where id = $1`, [
          projectA.id,
        ]),
      ).toMatch(/permission denied/);
    }));

  it('hides projects from anon', () =>
    withTx(async (db) => {
      await seed(db);
      await db.asAnon();
      expect(await db.queryError('select id from public.projects')).toMatch(/permission denied/);
    }));
});

describe('feedback access', () => {
  it('hides over-quota feedback from free users', () =>
    withTx(async (db) => {
      const { a, visible } = await seed(db);
      await db.asUser(a);
      expect(await db.query('select id from public.feedback')).toEqual([{ id: visible }]);
    }));

  it('shows over-quota feedback to pro users', () =>
    withTx(async (db) => {
      const { a, visible, hidden } = await seed(db);
      await grantPro(db, a);
      await db.asUser(a);
      const rows = await db.query<{ id: string }>('select id from public.feedback order by message desc');
      expect(rows.map((r) => r.id)).toEqual([visible, hidden]);
    }));

  it('allows updating status only', () =>
    withTx(async (db) => {
      const { a, visible } = await seed(db);
      await db.asUser(a);
      const updated = await db.query(
        `update public.feedback set status = 'resolved' where id = $1 returning status`,
        [visible],
      );
      expect(updated).toEqual([{ status: 'resolved' }]);
      expect(
        await db.queryError(`update public.feedback set over_quota = false where id = $1`, [visible]),
      ).toMatch(/permission denied/);
      expect(
        await db.queryError(`update public.feedback set message = 'x' where id = $1`, [visible]),
      ).toMatch(/permission denied/);
    }));

  it('cannot un-hide over-quota feedback by updating it', () =>
    withTx(async (db) => {
      const { a, hidden } = await seed(db);
      await db.asUser(a);
      const rows = await db.query(
        `update public.feedback set status = 'resolved' where id = $1 returning id`,
        [hidden],
      );
      expect(rows).toHaveLength(0);
    }));

  it('allows deleting own feedback but not others', () =>
    withTx(async (db) => {
      const { a, visible, foreign } = await seed(db);
      await db.asUser(a);
      expect(
        await db.query('delete from public.feedback where id = $1 returning id', [visible]),
      ).toHaveLength(1);
      expect(
        await db.query('delete from public.feedback where id = $1 returning id', [foreign]),
      ).toHaveLength(0);
    }));

  it('forbids inserting feedback from the client', () =>
    withTx(async (db) => {
      const { a, projectA } = await seed(db);
      await db.asUser(a);
      const error = await db.queryError(
        `insert into public.feedback (project_id, type, message) values ($1, 'bug', 'x')`,
        [projectA.id],
      );
      expect(error).toMatch(/permission denied/);
    }));
});

describe('backend-only tables', () => {
  it.each(['subscriptions', 'integrations', 'telegram_link_codes', 'usage_counters', 'rate_limits'])(
    '%s is not readable by authenticated users',
    (table) =>
      withTx(async (db) => {
        const { a } = await seed(db);
        await db.asUser(a);
        expect(await db.queryError(`select * from public.${table}`)).toMatch(/permission denied/);
      }),
  );

  it('service role can read everything', () =>
    withTx(async (db) => {
      await seed(db);
      await db.asServiceRole();
      const [row] = await db.query<{ n: number }>(
        'select count(*)::int as n from public.feedback where over_quota',
      );
      expect(row?.n).toBeGreaterThanOrEqual(1);
    }));
});

describe('profiles access', () => {
  it('shows users only their own profile', () =>
    withTx(async (db) => {
      const { a } = await seed(db);
      await db.asUser(a);
      expect(await db.query('select id from public.profiles')).toEqual([{ id: a }]);
    }));
});

describe('function privileges', () => {
  it.each([
    ['consume_quota', 'select public.consume_quota($1)'],
    ['is_pro', 'select public.is_pro($1)'],
    ['claim_quota_notice', 'select public.claim_quota_notice($1)'],
  ])('%s is not callable by authenticated users', (_, sql) =>
    withTx(async (db) => {
      const { a } = await seed(db);
      await db.asUser(a);
      expect(await db.queryError(sql, [a])).toMatch(/permission denied/);
    }),
  );

  it('hit_rate_limit is not callable by anon', () =>
    withTx(async (db) => {
      await db.asAnon();
      expect(await db.queryError(`select public.hit_rate_limit('k', 1, 60)`)).toMatch(
        /permission denied/,
      );
    }));
});

describe('storage and realtime', () => {
  it('has a private screenshots bucket with limits', () =>
    withTx(async (db) => {
      const rows = await db.query(
        `select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'screenshots'`,
      );
      expect(rows).toEqual([
        {
          public: false,
          file_size_limit: '2097152',
          allowed_mime_types: ['image/webp', 'image/png', 'image/jpeg'],
        },
      ]);
    }));

  it('publishes feedback changes to realtime', () =>
    withTx(async (db) => {
      const rows = await db.query(
        `select tablename from pg_publication_tables
         where pubname = 'supabase_realtime' and schemaname = 'public'`,
      );
      expect(rows).toEqual([{ tablename: 'feedback' }]);
    }));
});
```

Note: `storage.buckets.file_size_limit` is `bigint`, which node-postgres returns as a string. That is why the test expects `'2097152'`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm db:test`
Expected: FAIL. Several assertions fail: users see nothing or everything, inserts succeed, the bucket row is missing, and so on.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260921000400_access.sql`:
```sql
-- The browser holds the anon key, so every paywall rule must be enforced here.

-- 1. Table privileges. Supabase grants ALL to anon/authenticated by default; start from zero,
--    and make tables/functions created by later migrations private by default too.
revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

grant select on public.profiles to authenticated;

grant select, delete on public.projects to authenticated;
grant update (name, allowed_origins, primary_color, trigger_text, position, hide_badge, custom_css)
  on public.projects to authenticated;

grant select, delete on public.feedback to authenticated;
grant update (status) on public.feedback to authenticated;

-- subscriptions, integrations, telegram_link_codes, usage_counters, rate_limits: service_role only.

-- 2. Row policies.
create policy "profiles: select own" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy "projects: select own" on public.projects
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "projects: update own" on public.projects
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "projects: delete own" on public.projects
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Over-quota rows stay invisible to Free accounts (including via Realtime).
create policy "feedback: select own visible" on public.feedback
  for select to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = feedback.project_id and p.owner_id = (select auth.uid())
    )
    and (not over_quota or (select public.current_user_is_pro()))
  );

create policy "feedback: update own visible" on public.feedback
  for update to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = feedback.project_id and p.owner_id = (select auth.uid())
    )
    and (not over_quota or (select public.current_user_is_pro()))
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = feedback.project_id and p.owner_id = (select auth.uid())
    )
  );

create policy "feedback: delete own" on public.feedback
  for delete to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = feedback.project_id and p.owner_id = (select auth.uid())
    )
  );

-- 3. Screenshots bucket. Private: the dashboard uses signed URLs created with the service role.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('screenshots', 'screenshots', false, 2097152, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;

-- 4. Realtime for the install page and live feed.
alter publication supabase_realtime add table public.feedback;
```

- [ ] **Step 4: Apply and run the tests**

Run: `pnpm db:test`
Expected: PASS (all files).

The storage and realtime assertions are also checked against real Supabase in CI (Task 9). If CI later shows the real `storage.buckets` shape differs from the PGlite bootstrap, fix the bootstrap and the test. Never change the bucket limits to make a test pass.

- [ ] **Step 5: Commit**

```bash
git add supabase
git commit -m "feat(db): add grants, RLS policies, screenshots bucket and realtime"
```

---

### Task 9: CI and developer README

**Files:**
- Create: `.github/workflows/ci.yml`, `README.md`

**Interfaces:**
- Consumes: root scripts `format:check`, `typecheck`, `test`, `db:start`, `db:test`. `db:test` honours `DB_TEST_TARGET=supabase` (Task 5).

- [ ] **Step 1: Write the workflow**

The `check` job runs everything that works without Docker, including the DB tests on PGlite through `pnpm test`. The `db-supabase` job runs the same DB tests against a real local Supabase (GitHub runners have Docker). This is the fidelity check for the PGlite emulation. `supabase start` applies `supabase/migrations` itself.

`.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm format:check
      - run: pnpm typecheck
      - run: pnpm test

  db-supabase:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm db:start
      - run: pnpm db:test
        env:
          DB_TEST_TARGET: supabase
```

- [ ] **Step 2: Write the README**

`README.md`:
````markdown
# Dymcode

Lightweight feedback & bug-report widget that delivers reports straight to Telegram and Discord.

Design: `docs/superpowers/specs/2026-09-21-dymcode-design.md`

## Requirements

- Node 24+ and pnpm 11+
- Docker is optional: only needed to run a full local Supabase stack (`pnpm db:start`).

## Setup

```bash
pnpm install
pnpm test
```

## Commands

| Command | What it does |
|---|---|
| `pnpm typecheck` | Type-check all packages |
| `pnpm test` | All tests, including DB tests on in-process PGlite (no Docker) |
| `pnpm db:test` | DB tests only (PGlite by default) |
| `DB_TEST_TARGET=supabase pnpm db:test` | DB tests against a running local Supabase (`pnpm db:start`, needs Docker) |
| `pnpm format` | Format with Prettier |

## Database tests

`supabase/tests` runs every test in a rolled-back transaction and switches Postgres roles
(`authenticated`, `anon`, `service_role`) to exercise RLS the way PostgREST does. Locally it uses
PGlite with `supabase/tests/src/pglite-bootstrap.sql` emulating the roles, schemas and functions
Supabase provides. CI runs the same tests against a real Supabase stack.

## Layout

- `packages/shared`: widget↔API contract (zod schemas, constants, brand)
- `supabase/migrations`: database schema, functions, RLS
- `supabase/tests`: database tests
````

- [ ] **Step 3: Verify everything locally**

Run: `pnpm format:check && pnpm typecheck && pnpm test`
Expected: all commands exit 0. The `db-supabase` CI job cannot run locally (no Docker); it is verified when the branch is pushed.

- [ ] **Step 4: Commit**

```bash
git add .github README.md
git commit -m "ci: add format, typecheck, test and real-supabase db jobs"
```
