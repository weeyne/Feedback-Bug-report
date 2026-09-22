# Dymcode Phase 3: Public API, Notifications, Capture Hardening: Design

**Date:** 2026-09-22
**Status:** Approved in brainstorming, pending spec review
**Parent specs:**
- `docs/superpowers/specs/2026-09-21-dymcode-design.md` (§5 Public API, §6 Notifications, §9 Security).
- `docs/superpowers/specs/2026-09-21-widget-design.md` (widget contract).

This document refines both parents. Where they disagree, this document wins for phase 3.

## 1. Scope

1. **Widget capture hardening.** Viewport-accurate, memory-bounded screenshots with a real background.
   This closes the must-do item in `docs/superpowers/followups/2026-09-22-widget-followups.md`.
2. **`apps/web` scaffold** (`@dymcode/web`). Next.js App Router with API routes only; the landing page is a placeholder.
3. **Public widget API:**
   - `GET /api/v1/widget/config`;
   - `POST /api/v1/widget/submit` (CORS, rate limit, quota, Storage, bot guard).
4. **Notifications:**
   - Telegram (shared bot and the owner's custom bot) and Discord;
   - secret encryption;
   - the one-time "limit reached" notice.
5. **Shared bot webhook.** `POST /api/telegram/webhook` handles `/start <code>` linking.
6. **Screenshot retention.** A daily cron deletes old screenshots.
7. **Tests and CI.** Unit and integration tests on PGlite, the same DB tests against real Supabase in CI,
   and a full widget → API → notification E2E test.

**Out of scope:**
- the dashboard UI that creates Telegram link codes, stores Discord webhooks or custom bot tokens (phase 4);
- Tailwind/shadcn (phase 4);
- Vercel deployment and registering the webhook against a public URL (end of phase 3 or 4, decided separately);
- billing (phase 5).

## 2. Decisions

| Topic | Decision |
|---|---|
| DB access from API code | Direct SQL via `postgres` (postgres.js) through the Supabase **transaction pooler** (Supavisor, port 6543, `prepare: false`). Storage stays on supabase-js with the secret key. The dashboard (phase 4) keeps using supabase-js with RLS. |
| Code structure | Thin route handlers. Logic lives in `lib/` use-case modules that take injected `deps` (`db`, `storage`, `fetch`, `now`, `after`, `env`). |
| Local testing | Vitest on PGlite, reusing the phase-1 harness, plus in-memory fakes for Storage and outbound HTTP. No Docker. CI repeats the DB-backed tests on real Supabase. |
| Runtime | Node.js runtime for all API routes (postgres.js needs TCP). |
| Screenshot retention | Free: 30 days. Pro: 365 days. The feedback text is kept forever. |

## 3. Widget capture hardening (`packages/widget/src/screenshot.ts`)

**Problem.** The current capture renders the whole document and then crops to the viewport. This has
four consequences:
- on scrolled pages, `position: fixed` elements are laid out against the full document and fall outside the crop;
- long pages allocate huge canvases;
- the crop scale is wrong with horizontal overflow;
- the capture is transparent when the page has no background.

**New algorithm:**
1. Viewport `w = innerWidth`, `h = innerHeight`, `x = scrollX`, `y = scrollY`. Scale `s = min(1, 1600 / w)`.
2. `domToCanvas(document.documentElement, options)` with:
   - `width: w`, `height: h`, `scale: s`;
   - `backgroundColor`: the first non-transparent computed background of `body`, else of `html`, else `#ffffff`;
   - `filter: (node) => node !== exclude`;
   - `onCloneEachNode: maskClonedNode`;
   - `timeout: 5000`;
   - `maximumCanvasSize: 4096`;
   - `style: { position: 'relative', top: -y + 'px', left: -x + 'px' }` applied to the cloned root.
     `position: relative` makes the cloned root the containing block for absolutely positioned
     elements that had no positioned ancestor, so they move with the offset like normal flow;
     unlike `transform` or `filter`, relative positioning does not become the containing block for
     `position: fixed` elements, so those stay bound to the viewport.
3. Encode WebP 0.7, fall back to JPEG 0.8. Return `null` on failure or when the result exceeds `SCREENSHOT_MAX_BYTES`.

**Known edge case.** An absolutely positioned element anchored to the *bottom* of the initial
containing block (e.g. `position: absolute; bottom: 0` with no positioned ancestor) resolves
against the relatively-positioned cloned root's own (viewport-sized) box instead of the true
document/viewport, so its vertical placement can differ from what the page actually shows.

**Fallback.** A `margin-top`/`margin-left` offset on the cloned root was tried first and rejected:
margins only shift normal-flow layout, so they do not move absolutely positioned elements whose
containing block is the initial containing block (elements with no positioned ancestor) — those
stayed at their unscrolled document position and fell outside the crop. The `position: relative` +
`top`/`left` offset above is the shipped approach and passes the scrolled-page E2E test below. If a
future `modern-screenshot` release changes how it establishes containing blocks for a relatively
positioned clone root and breaks that test, the documented contingency is to render the full
document, crop the viewport region, and offset `position: fixed` clones by `(x, y)` in
`onCloneEachNode` so they land inside the crop. The scrolled-page E2E test is the acceptance test
for whichever approach is in place.

**E2E (widget package):**
- `dev/scrolled.html`: a 6000px-tall page with a fixed 60px header of a known color (`#ff00aa`) and a
  marker block of another known color (`#00aaff`) at document offset 2400px. The test scrolls to
  `y = 2000` and submits. Assertions:
  - the image height matches the viewport (scaled), not the document;
  - the top 60px strip is ≈ `#ff00aa`;
  - the pixel at the marker's viewport position (y = 400) is ≈ `#00aaff`.
- `dev/transparent.html`: a page with no background. Composited pixels in an empty area are white
  (not transparent/black).

## 4. `apps/web` scaffold

```
apps/web/
├── app/
│   ├── page.tsx                           # placeholder landing
│   ├── e2e-host/route.ts                  # E2E widget host page; 404 unless test mode
│   └── api/
│       ├── v1/widget/config/route.ts
│       ├── v1/widget/submit/route.ts      # maxDuration = 60 (notifications run in after())
│       ├── telegram/webhook/route.ts
│       ├── cron/retention/route.ts
│       ├── e2e-test/outbox/route.ts       # 404 unless test mode
│       └── e2e-test/usage/route.ts        # 404 unless test mode
├── lib/
│   ├── env.ts            # zod-validated server env
│   ├── db/types.ts       # interface Db { query<T>(sql, params?): Promise<T[]> }
│   ├── db/postgres.ts    # postgres.js implementation (prepare: false, max 1 per lambda) + closePostgresDb
│   ├── storage.ts        # interface Storage { upload(path, data, contentType), download(path), remove(paths) }; supabase-js impl
│   ├── crypto.ts         # AES-256-GCM encryptSecret/decryptSecret
│   ├── http.ts           # CORS helpers, client IP, JSON responses
│   ├── widget/config.ts  # getWidgetConfig(deps, key)
│   ├── widget/submit.ts  # handleSubmit(deps, request)
│   ├── notify/           # types, format, telegram, discord, dispatch
│   ├── telegram/webhook.ts
│   ├── retention.ts
│   ├── deps.ts           # production wiring
│   └── test-mode.ts      # in-memory deps for E2E (never in production)
├── scripts/copy-widget.mjs          # packages/widget/dist → public/w/
├── scripts/set-telegram-webhook.mjs
├── vercel.json                      # cron schedule
└── next.config.ts                   # headers for /w/*
```

- **Package:** `@dymcode/web`. Scripts:
  - `dev` and `build` (both run `copy-widget` first);
  - `test` (Vitest), `typecheck`, `e2e` (Playwright);
  - `telegram:set-webhook`.

  Turbo makes `@dymcode/web#build` / `#dev` depend on `@dymcode/widget#build`. `public/w/` is git-ignored.
- **Cache headers:**
  - `/w/widget.js`: `public, max-age=300, s-maxage=3600`;
  - `/w/screenshot.js`: `public, max-age=31536000, immutable` (the URL is versioned with `?v=`).
- **DB harness reuse.** `@dymcode/db-tests` gains an export `./harness` (`connect`/`disconnect`,
  `withTx`, `createPgliteDb`, fixtures) used by `apps/web` tests. It uses the same `DB_TEST_TARGET` switch
  (`pglite` default, `supabase` in CI). `lib/db/postgres.integration.test.ts` exercises the production
  postgres.js adapter itself and runs only with `DB_TEST_TARGET=supabase`.
- **jsonb parameters.** postgres.js JSON-encodes every parameter Postgres describes as `json`/`jsonb`,
  even a string, while pg and PGlite pass strings through. JSON values are therefore written as
  `$n::text::jsonb` with a `JSON.stringify`-ed string, which every driver stores as a jsonb object.
- **Environment** (`lib/env.ts`, validated on first use; missing vars fail loudly):
  - `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`;
  - `NEXT_PUBLIC_APP_URL`, `SECRETS_ENCRYPTION_KEY` (32 bytes base64), `IP_HASH_SALT`, `CRON_SECRET`;
  - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`;
  - `DYMCODE_TEST_MODE` (optional).

  `NEXT_PUBLIC_SUPABASE_ANON_KEY` arrives with the dashboard in phase 4. Local values live in
  `apps/web/.env.local` (git-ignored). The env is read lazily on the first request, so `next build`
  needs no env at all (CI builds without placeholder values).
- **Test mode.** `DYMCODE_TEST_MODE=1` wires:
  - PGlite in memory with migrations and a seeded Free project `pk_E2eE2eE2eE2e1234`, with a
    `telegram_shared` integration (chat `424242`) and a Discord integration (encrypted fake webhook URL);
  - in-memory Storage;
  - an outbox `fetch` that records Telegram/Discord calls instead of sending them;
  - `GET/DELETE /api/e2e-test/outbox` (recorded calls and stored feedback / reset) and
    `POST /api/e2e-test/usage` (sets the monthly usage counter);
  - `GET /e2e-host`, the HTML host page that embeds the widget for Playwright.

  Startup throws if `NODE_ENV === 'production'` and test mode is on. The `e2e-test` routes and
  `/e2e-host` return 404 outside test mode (Next excludes `_`-prefixed folders from routing, hence no `__test`).

## 5. Public widget API

**Common rules:**
- CORS: reflect the request `Origin`, send `Vary: Origin`, and answer `OPTIONS` with 204 (`Allow-Methods: GET, POST, OPTIONS`, `Allow-Headers: content-type`).
- Client IP: the first entry of `x-forwarded-for`, else `x-real-ip`, else `'unknown'`. For rate limiting it
  is normalized first: IPv4 as is, IPv4-mapped IPv6 (`::ffff:a.b.c.d`) as the IPv4 address, other IPv6
  reduced to its /64 prefix. It is stored only as `sha256(identity + IP_HASH_SALT)` inside the rate-limit key.
- Unexpected errors → 500 `{ error: 'internal' }`, with details only in the server log.

### `GET /api/v1/widget/config?key=pk_…`
- If the key fails `PUBLIC_KEY_PATTERN`, or no project is found → 404 `{ error: 'unknown project' }`.
- Single query: `select … , public.is_pro(owner_id) as pro from public.projects where public_key = $1`.
- The body satisfies `WidgetConfigSchema`:
  - `showBadge = !(hide_badge && pro)`;
  - `customCss = pro ? custom_css : null`;
  - `badgeUrl = buildBadgeUrl(public_key)`;
  - `locale`.
- `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`.

### `POST /api/v1/widget/submit`

| # | Step | Failure |
|---|---|---|
| 1 | `Content-Length` > 2.5MB | 413 |
| 2 | Parse `formData()`; `payload` JSON passes `SubmitPayloadSchema`; the optional `screenshot` is a Blob ≤ `SCREENSHOT_MAX_BYTES` of a type in `SCREENSHOT_MIME_TYPES` | 400 `{ error, issues? }` |
| 3 | `select public.hit_rate_limit('submit:' \|\| $key \|\| ':' \|\| $ipHash, 5, 60)`, then the per-project cap `hit_rate_limit('submit-project:' \|\| $key, 30, 60)` | 429 |
| 4 | Load the project by key plus `is_pro(owner_id)` | 404 |
| 5 | `allowed_origins` non-empty and `Origin` not in it (exact match) | 403 |
| 6 | Honeypot `website` non-empty or `elapsedMs < 2000` | 200 `{ id: null }`, nothing stored |
| 7 | `count = consume_quota(owner)`; `over_quota = !pro && count > 20` | — |
| 8 | `id = randomUUID()`. If a screenshot is present, upload it to `screenshots/{project_id}/{id}.{webp\|jpg\|png}`; on upload failure log it and continue without a screenshot. `insert into feedback` (metadata = payload metadata + `browser`, `os` from `ua-parser-js`, written as `$n::text::jsonb`; strings have U+0000 removed and lone surrogates replaced via `toWellFormed()`) | insert failure → 500 (uploaded screenshot removed) |
| 9 | 201 `{ id }` | — |
| 10 | `after()`: not over quota → `dispatch(deps, id)`; over quota and `claim_quota_notice(owner)` → `dispatchQuotaNotice(deps, projectId)`. The route exports `maxDuration = 60` so this work fits in the function budget | errors only logged / recorded on integrations |

## 6. Notifications

### Interfaces (`lib/notify/types.ts`)
```ts
interface FeedbackMessage {
  projectName: string;
  type: FeedbackType;
  message: string;
  email: string | null;
  metadata: FeedbackMetadata;
  dashboardUrl: string;
  screenshot: { data: Uint8Array; contentType: string; filename: string } | null;
}
type DeliveryResult =
  | { ok: true }
  | { ok: false; retryable: boolean; disable: boolean; error: string };
interface Notifier {
  send(message: FeedbackMessage | TextNotice): Promise<DeliveryResult>;
}
```

### `dispatch(deps, feedbackId)`
1. Load the feedback, its project, `is_pro(owner)`, and the enabled integrations.
2. Download the screenshot from Storage if `screenshot_path` is set, with a 10 s budget; on timeout
   or failure the notification is sent without it.
3. Build a notifier per integration:
   - `telegram_shared`: `TELEGRAM_BOT_TOKEN` + `target`;
   - `telegram_custom`: decrypted token + `target`, **skipped unless the owner is Pro**; the token must
     match `^\d+:[\w-]+$`, else `last_error = 'invalid bot token'` and no call;
   - `discord`: decrypted webhook URL; it must be `https:` on `discord.com`, `discordapp.com`,
     `ptb.discord.com` or `canary.discord.com` with a path starting `/api/webhooks/`, else
     `last_error = 'invalid webhook url'` and no call. Discord calls use `redirect: 'error'`.

   A decrypt failure records `last_error = 'secret unreadable'` for that integration only.
4. Send to all of them in parallel; each call carries `AbortSignal.timeout(5000)`. Any exception while
   building, sending or recording for one integration is logged (`[dispatch]`) and recorded as
   `last_error = 'internal error'`; it never affects other integrations or escapes `dispatch`.
   Network error text has URLs replaced with `<url>` so tokens never reach `last_error`.
5. Retry once on a retryable failure (HTTP 429/5xx), waiting `min(retry_after, 3)` seconds.
6. Record the outcome per integration:
   - success → `last_delivered_at = now(), last_error = null`;
   - `disable` (HTTP 403/404 from Telegram, 404 from Discord) → `enabled = false, last_error = <reason>`;
   - any other failure → `last_error = <reason>`.

`dispatchQuotaNotice(deps, projectId)` sends a `TextNotice` to all enabled integrations: "Your free limit
of 20 submissions this month is reached. New feedback is saved; upgrade to Pro to see it: <APP_URL>/billing".

### Formatting (`lib/notify/format.ts`)
- **Content:**
  - type emoji + label (🐞 Bug, 💡 Idea, 💬 Other) and project name;
  - the message;
  - the email if present;
  - page URL (already redacted by the widget);
  - browser/OS and viewport/screen;
  - up to 3 console errors;
  - "Open in dashboard" link.
- **Telegram:**
  - HTML parse mode, and every interpolated value is HTML-escaped;
  - with a screenshot: `sendPhoto` (multipart) with the caption. If the caption exceeds 1024 chars,
    the photo goes with a short caption (type + project + link), followed by `sendMessage` with the
    full text truncated to 4096;
  - without a screenshot: `sendMessage` only.
- **Discord:**
  - `payload_json` with one embed (title = type + project, description = message, fields for
    email/URL/browser/OS/errors, color: bug `#ef4444`, idea `#22c55e`, general `#6366f1`)
    and `allowed_mentions: { parse: [] }`;
  - the description budget is `min(4000, 6000 − (title + field names + values) − 20)`, so the embed
    stays within Discord's 6000-character total;
  - reporter-controlled text (description, email, page) has `[ ] ( ) < >` backslash-escaped, so it
    cannot form masked links;
  - the screenshot as `files[0]` with `embed.image.url = attachment://screenshot.<ext>`.

### Shared bot webhook (`POST /api/telegram/webhook`)
- If `X-Telegram-Bot-Api-Secret-Token` ≠ `TELEGRAM_WEBHOOK_SECRET` → 401 (constant-time comparison of
  sha256 digests; the cron bearer token is compared the same way).
- Handles `message.text` matching `/^\/start(?:@<bot_username>)?\s+([0-9A-Za-z]{12})$/`:
  - **valid, unexpired code** → upsert the `telegram_shared` integration (`target = chat.id`,
    `enabled = true`, `last_error = null`), delete the code, reply "✅ Connected to <project name>";
  - **unknown or expired code** → reply "This link has expired. Create a new one in your Dymcode dashboard.";
  - **any other private message** → a short help reply;
  - **other group messages** → ignored.
- Always responds 200 to Telegram after the secret check; internal errors are logged.
- `scripts/set-telegram-webhook.mjs <url>` calls `setWebhook` with `secret_token` and `allowed_updates: ["message"]`.

### Secrets (`lib/crypto.ts`)
- `encryptSecret(plain): string` and `decryptSecret(token): string` use AES-256-GCM with a random
  12-byte IV. The format is `v1:<iv>:<ciphertext>:<tag>`, each part base64url.
- Decrypt throws on an unknown version, a malformed token, a wrong key, or tampering.

## 7. Screenshot retention (`GET /api/cron/retention`)

- Schedule `0 3 * * *` in `vercel.json`. Requires `Authorization: Bearer <CRON_SECRET>`, else 401.
- Selects batches of 200: `feedback` rows with `screenshot_path is not null` and `created_at` older than
  30 days (owner not Pro) or 365 days (owner Pro).
- For each batch: `storage.remove(paths)`, then `update feedback set screenshot_path = null` **only for
  the paths Storage confirmed removed**.
- Stops after 25s. Responds `{ removed, remaining }`.

## 8. Testing

| Area | Coverage |
|---|---|
| Widget capture | E2E on `scrolled.html` (fixed header, marker position, viewport-sized image) and `transparent.html` (white background); existing mask pixel check stays green |
| `config` | Unknown/invalid key 404; Free vs Pro gating of `showBadge`/`customCss`; `locale`; cache header |
| `submit` | Every row of the §5 table: 413, 400 (bad JSON, schema, screenshot type/size), 429 on the 6th request in a minute, 404, 403, bot 200 `{id:null}`, over-quota on the 21st (Free) and unlimited for Pro, screenshot stored at the right path, Storage failure → saved without a screenshot, `browser`/`os` parsed, CORS headers, `after()` receives the right dispatch |
| Notifiers | Mocked `fetch`: Telegram multipart body, HTML escaping, caption split, Discord embed + file + `allowed_mentions`, retry on 429 honoring `retry_after`, 403 → disable |
| `dispatch` | PGlite: per-integration outcomes written back; custom bot skipped for non-Pro; decrypt failure isolated; quota notice sent once |
| Webhook | Bad secret 401; link success (integration upserted, code deleted, reply sent); expired code; group mention form; unrelated messages |
| Crypto | Round trip; tampered ciphertext/tag; wrong key; bad version |
| Retention | Free 31d removed, Free 29d kept, Pro 200d kept, Pro 400d removed; Storage partial failure keeps paths; batching; 401 without the secret |
| E2E (Playwright, `apps/web` test mode) | (1) widget submit with screenshot → outbox has one Telegram `sendPhoto` and one Discord call, and the DB row has `screenshot_path`; (2) 21st Free submission → exactly one quota notice, no feedback notification; (3) disallowed Origin → no outbox entries, widget shows an error |

**CI changes:**
- `check`: `@dymcode/web` typecheck (`next typegen && tsc --noEmit`, so a clean checkout has the
  generated route types), tests, and `next build` (no env needed: it is read lazily).
- `db-supabase`: also runs the DB-backed `@dymcode/web` tests with `DB_TEST_TARGET=supabase`.
- `e2e`: also runs the `@dymcode/web` E2E suite.
