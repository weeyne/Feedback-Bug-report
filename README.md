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

| Command                                | What it does                                                              |
| -------------------------------------- | ------------------------------------------------------------------------- |
| `pnpm typecheck`                       | Type-check all packages                                                   |
| `pnpm test`                            | All tests, including DB tests on in-process PGlite (no Docker)            |
| `pnpm db:test`                         | DB tests only (PGlite by default)                                         |
| `DB_TEST_TARGET=supabase pnpm db:test` | DB tests against a running local Supabase (`pnpm db:start`, needs Docker) |
| `pnpm format`                          | Format with Prettier                                                      |

## Database tests

`supabase/tests` runs every test in a rolled-back transaction and switches Postgres roles
(`authenticated`, `anon`, `service_role`) to exercise RLS the way PostgREST does. Locally it uses
PGlite with `supabase/tests/src/pglite-bootstrap.sql` emulating the roles, schemas and functions
Supabase provides. CI runs the same tests against a real Supabase stack.

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

## Web app and API (`apps/web`)

Next.js app serving the public widget API, notifications, the Telegram webhook and the retention cron.

```bash
pnpm --filter @dymcode/web dev     # builds the widget, copies it to public/w/, starts next dev (needs apps/web/.env.local)
pnpm --filter @dymcode/web test    # unit + DB tests on PGlite (no Docker, no .env.local needed)
pnpm --filter @dymcode/web e2e     # widget → API → notification E2E in test mode (fake env, in-memory DB)
```

Endpoints: `GET /api/v1/widget/config`, `POST /api/v1/widget/submit`, `POST /api/telegram/webhook`,
`GET /api/cron/retention` (Vercel Cron, `Authorization: Bearer $CRON_SECRET`).
Submissions are rate limited to 5 per minute per project and client (IPv6 grouped by /64) and 30 per
minute per project.

After deploying, register the shared bot webhook:

```bash
pnpm --filter @dymcode/web telegram:set-webhook https://<your-domain>/api/telegram/webhook
```

## Layout

- `packages/shared`: widget↔API contract (zod schemas, constants, brand)
- `packages/widget`: embeddable widget (Shadow DOM, i18n, screenshots)
- `apps/web`: Next.js API, widget hosting, notifications, Telegram webhook, retention cron
- `supabase/migrations`: database schema, functions, RLS
- `supabase/tests`: database tests
