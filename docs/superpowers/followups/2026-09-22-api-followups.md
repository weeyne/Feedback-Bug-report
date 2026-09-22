# API follow-ups (after phase 3)

## Before public launch
- Verify real integrations manually once deployed: Telegram `sendPhoto` with WebP through the shared bot, Discord `files[0]` with WebP, and Supabase Storage download/remove. The E2E suite only checks the outbox.
- `createSupabaseStorage` is not tested against a live bucket; consider adding it to the CI `db-supabase` job (`supabase start` runs Storage).
- The body-size guard trusts `Content-Length` only. Vercel's 4.5MB request limit contains this, but a self-hosted deployment would not.
- Submissions over the quota still upload screenshots. Revisit together with pricing.
- Validation failures are not rate limited, and `rate_limits` rows are created before the 404 check (possible table bloat).
- The screenshot MIME type comes from the client (the bucket restricts stored types and size).
- `stripNul` fixes U+0000 and lone surrogates; other hostile sequences are not handled.
- The Discord "Console errors" field is not link-escaped (only description, email and page are).
- Telegram "group chat was upgraded to a supergroup" (`migrate_to_chat_id`) is not handled.
- `postgres.js` uses `max: 1` per instance; consider 3–5 and `attachDatabasePool` under Fluid compute. `ssl: 'require'` does not verify the certificate.
- The public `config` endpoint reflects `Origin` with `Vary: Origin`; `Access-Control-Allow-Origin: *` would be safer for CDN caching (spec change).
- A failed insert after `consume_quota` loses one quota unit.
- Secrets could be bound to `integration.id` via AES-GCM AAD.

## Can wait
- No unit assertion pins the `domToCanvas` options (the E2E pixel tests cover them).
- The exported `Notification` type shadows the DOM type.
- `escapeHtmlLimited(text, 0)` returns `'…'`; `environmentLine` has no budget.
- The retention `attempted` id array grows per run (bounded by the time budget).
- The CI artifact step is still named `widget-e2e-report` though it also collects web artifacts.
- Playwright `reuseExistingServer` on :3100 could reuse a non-test server locally.
