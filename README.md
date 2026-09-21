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

## Layout

- `packages/shared`: widget↔API contract (zod schemas, constants, brand)
- `supabase/migrations`: database schema, functions, RLS
- `supabase/tests`: database tests
