# Dymcode — Feedback & Bug-Report Widget: Design

**Date:** 2026-09-21
**Status:** Approved in brainstorming, pending spec review

## 1. Product summary

Dymcode is a micro-SaaS for indie makers and small SaaS teams: an embeddable feedback/bug-report widget
(core script ≤ 20KB gzip) that captures a message, a client-side screenshot and technical context,
and delivers it in real time to the owner's Telegram or Discord.

Positioning: a lightweight, cheap alternative to Canny, Marker.io and Usersnap.

**Naming:** product `Dymcode`, domain placeholder `dymcode.dev`, shared Telegram bot `@DymcodeBot`.
All three live in one config module (`packages/shared/src/brand.ts`) so they can be changed in one place.

### Tiers

| | Free | Pro ($9/mo or $49 lifetime) |
|---|---|---|
| Submissions | 20/month per account | Unlimited |
| Projects | 1 | Unlimited |
| Telegram (shared bot) / Discord alerts | Yes | Yes |
| "Powered by Dymcode" badge | Mandatory | Can be hidden |
| Custom CSS | No | Yes |
| Own Telegram bot ("white label") | No | Yes |

Submissions over the Free quota are **stored but hidden** (`over_quota = true`). They trigger no alerts
and are shown blurred in the dashboard with an upgrade CTA.

## 2. Architecture

- **Hosting:** Vercel (Next.js) + Supabase Cloud (Postgres, Auth, Storage, Realtime).
- **Payments:** Lemon Squeezy (Merchant of Record).
- **Repository:** pnpm workspaces + Turborepo monorepo.

```
dymcode/
├── apps/web/                          # Next.js (App Router) → Vercel
│   ├── app/
│   │   ├── (marketing)/               # landing, pricing
│   │   ├── (auth)/login/              # magic link + GitHub/Google OAuth
│   │   ├── (dashboard)/projects/      # list, create
│   │   ├── (dashboard)/projects/[id]/ # feedback, settings, integrations, install
│   │   ├── (dashboard)/billing/
│   │   ├── (dashboard)/account/
│   │   ├── api/v1/widget/config/route.ts   # GET public widget config
│   │   ├── api/v1/widget/submit/route.ts   # POST feedback
│   │   ├── api/telegram/webhook/route.ts   # shared bot updates
│   │   ├── api/billing/webhook/route.ts    # Lemon Squeezy events
│   │   └── auth/callback/route.ts
│   ├── lib/
│   │   ├── supabase/                  # server, browser, admin (service role) clients
│   │   ├── notify/                    # notifier interface, telegram, discord, format, dispatch
│   │   ├── billing/                   # lemonsqueezy client, plans (entitlements)
│   │   ├── quota.ts
│   │   ├── rate-limit.ts
│   │   └── crypto.ts                  # AES-256-GCM for secrets
│   ├── components/                    # shadcn/ui + feature components
│   ├── public/w/                      # widget build output (widget.js, screenshot.[hash].js)
│   └── middleware.ts                  # session refresh, ref cookie
├── packages/
│   ├── widget/                        # vanilla TS, Vite library mode
│   │   ├── src/index.ts               # bootstrap
│   │   ├── src/ui/                    # trigger, modal, styles (Shadow DOM)
│   │   ├── src/context/               # metadata, console buffer
│   │   ├── src/screenshot.ts          # lazy chunk
│   │   ├── src/api.ts
│   │   └── .size-limit.json
│   └── shared/                        # zod schemas, types, brand constants
├── supabase/migrations/, supabase/seed.sql
└── turbo.json, pnpm-workspace.yaml
```

The widget is built into `apps/web/public/w/`, so it is served from the Vercel CDN on the same origin as the API.

### Unit boundaries

- **`packages/shared`**: the single source of truth for the widget↔API contract (`SubmitPayloadSchema`,
  `WidgetConfigSchema`) and brand constants. It has no runtime dependencies besides `zod`. The widget
  imports only types from it, to keep zod out of the widget bundle.
- **`lib/notify`**: `interface Notifier { send(feedback: FeedbackMessage): Promise<DeliveryResult> }`,
  implemented by `DiscordNotifier`, `TelegramNotifier`, which covers both the shared bot and a custom bot
  (they differ only in token and chat). `dispatch()` fans out to all enabled integrations.
- **`lib/billing/plans.ts`**: the only place in TS where tier limits live (see §7).
- **SQL `is_pro()`**: the only place where Pro status is derived from subscription rows.

## 3. Database schema

```sql
create type feedback_type    as enum ('bug', 'idea', 'general');
create type feedback_status  as enum ('new', 'resolved', 'archived');
create type widget_position  as enum ('bottom-right', 'bottom-left');
create type integration_kind as enum ('discord', 'telegram_shared', 'telegram_custom');
create type plan_kind        as enum ('pro_monthly', 'pro_lifetime');

create table profiles (                  -- 1:1 with auth.users, created by trigger on signup
  id                  uuid primary key references auth.users on delete cascade,
  email               text not null,
  referred_by_project uuid,              -- FK to projects added after projects is created
  created_at          timestamptz not null default now()
);

create table subscriptions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references profiles on delete cascade,
  plan                plan_kind not null,
  status              text not null,     -- raw LS status
  ls_customer_id      text,
  ls_subscription_id  text unique,       -- monthly only
  ls_order_id         text unique,       -- lifetime only
  current_period_end  timestamptz,       -- monthly only
  updated_at          timestamptz not null default now()
);

create table projects (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references profiles on delete cascade,
  public_key          text not null unique,          -- 'pk_' + 16 random base62 chars
  name                text not null check (char_length(name) between 1 and 80),
  allowed_origins     text[] not null default '{}',  -- empty = any origin
  primary_color       text not null default '#6366f1' check (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  trigger_text        text not null default 'Feedback' check (char_length(trigger_text) between 1 and 40),
  position            widget_position not null default 'bottom-right',
  hide_badge          boolean not null default false, -- applied only if owner is Pro
  custom_css          text check (octet_length(custom_css) <= 10240), -- applied only if owner is Pro
  created_at          timestamptz not null default now()
);

alter table profiles
  add constraint profiles_referred_by_project_fkey
  foreign key (referred_by_project) references projects on delete set null;

create table integrations (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references projects on delete cascade,
  kind                integration_kind not null,
  enabled             boolean not null default true,
  target              text,              -- telegram chat_id
  secret_encrypted    text,              -- discord webhook URL or custom bot token (AES-256-GCM)
  last_error          text,
  last_delivered_at   timestamptz,
  created_at          timestamptz not null default now(),
  unique (project_id, kind)
);

create table telegram_link_codes (
  code                text primary key,  -- 12 random base62 chars
  project_id          uuid not null references projects on delete cascade,
  expires_at          timestamptz not null  -- now() + 15 minutes
);

create table feedback (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references projects on delete cascade,
  type                feedback_type not null,
  message             text not null check (char_length(message) between 1 and 5000),
  email               text check (char_length(email) <= 254),
  screenshot_path     text,              -- screenshots/{project_id}/{feedback_id}.{ext}
  metadata            jsonb not null default '{}',
  status              feedback_status not null default 'new',
  over_quota          boolean not null default false,
  created_at          timestamptz not null default now()
);
create index feedback_project_created_idx on feedback (project_id, created_at desc);

create table usage_counters (
  owner_id            uuid not null references profiles on delete cascade,
  period              date not null,     -- first day of month, UTC
  count               int not null default 0,
  quota_notice_sent   boolean not null default false,
  primary key (owner_id, period)
);

create table rate_limits (
  key                 text not null,     -- e.g. 'submit:{project_id}:{ip_hash}'
  window_start        timestamptz not null,
  count               int not null default 0,
  primary key (key, window_start)
);
```

### Functions

- `is_pro(uid uuid) returns boolean` (security definer). Returns true if the user has any subscription row where:
  - `plan = 'pro_lifetime' and status = 'paid'`, or
  - `plan = 'pro_monthly' and status in ('active', 'on_trial', 'past_due')`, or
  - `plan = 'pro_monthly' and status = 'cancelled' and current_period_end > now()`.
- `consume_quota(uid uuid) returns int`: atomic
  `insert … on conflict (owner_id, period) do update set count = usage_counters.count + 1 returning count`.
- `hit_rate_limit(k text, max int, window_seconds int) returns boolean`: atomic fixed-window upsert.
  Returns true when the limit is exceeded. Rows older than 1 day are deleted opportunistically inside
  the function (1% sampling).
- `claim_quota_notice(uid uuid) returns boolean`: sets `quota_notice_sent = true` for the current period
  and returns true only for the first caller.
- Trigger `on_auth_user_created`: inserts into `profiles`.

`metadata` JSON shape (validated by the shared zod schema):
`{ url, referrer, userAgent, browser, os, language, timezone, viewport: {w,h}, screen: {w,h,dpr}, consoleErrors: [{message, source?, line?, at}] }`.
`browser` and `os` are parsed server-side from `userAgent` with `ua-parser-js`.

### RLS and access

The browser holds the Supabase anon key, so RLS must enforce every paywall rule. UI checks alone
are not enough.

- `profiles`: select own row only.
- `projects`: select/delete own rows. Update is limited by a column-level grant to the settings
  columns (`name`, `allowed_origins`, `primary_color`, `trigger_text`, `position`, `hide_badge`,
  `custom_css`). There is **no insert policy**: projects are created by a server action with the
  service-role client after checking `maxProjects`.
- `feedback`: select where the project belongs to `auth.uid()` **and** (`not over_quota` or
  `current_user_is_pro()`). Over-quota rows are therefore invisible to Free accounts at the database
  level, including Realtime. The dashboard gets the number of hidden rows from a service-role count
  query and renders that many blurred placeholders. Update is limited to the `status` column
  (column-level grant). Delete own rows. No insert policy (the submit route uses service role).
- `current_user_is_pro()` (security definer, `is_pro(auth.uid())`) is the only billing function
  executable by `authenticated`. `is_pro`, `consume_quota`, `claim_quota_notice` and `hit_rate_limit`
  are revoked from `public`, `anon` and `authenticated` and granted to `service_role` only.
- `integrations`, `subscriptions`, `usage_counters`, `rate_limits`, `telegram_link_codes`: RLS enabled
  with **no policies**. Only the service-role client (server actions and route handlers) accesses them.
  Server actions return integration DTOs without secrets.
- Storage bucket `screenshots`: private. The dashboard uses signed URLs with a 5-minute TTL.
- Realtime: publication only on `feedback`, used by the install page ("waiting for first feedback")
  and the live feed. `integrations` and `subscriptions` have no client RLS policies, so Realtime cannot
  deliver their changes. For Telegram connect status and post-checkout activation, the client instead
  polls a server action every 2s (max 60s).

## 4. Widget (`packages/widget`)

**Embed:** `<script async src="https://dymcode.dev/w/widget.js" data-project-id="pk_…"></script>`

**Budget:** the core `widget.js` is ≤ 20KB gzip, enforced by `size-limit` in CI. The screenshot chunk
(`modern-screenshot`) is loaded only when the modal opens.

**Lifecycle:**
1. On script execution, the widget reads `document.currentScript.dataset.projectId` and installs the
   console buffer: `window.onerror`, `unhandledrejection` and a wrapper around `console.error` that
   calls through to the original. The buffer is a ring of the last 10 entries, each truncated to 500
   chars. The widget's own errors are excluded.
2. In `requestIdleCallback` (falling back to `setTimeout`), it fetches `GET /api/v1/widget/config?key=pk_…`.
   Then it creates a host element with an **open Shadow DOM**, injects the base styles and the custom
   CSS (if any) into the shadow root, and renders the trigger button. If the config fetch fails
   (404/network), it renders nothing and logs one `console.warn`.
3. On trigger click, it opens the modal and starts loading the screenshot chunk in parallel. The
   viewport is captured in the background with a node filter that excludes the widget host. The
   capture masks `input[type=password]` and `[data-feedback-mask]` elements with solid blocks,
   downscales to max 1600px width and encodes WebP at quality 0.7 (JPEG fallback). A thumbnail
   preview is shown next to the "Attach screenshot" toggle, which is checked by default.
4. The modal contains:
   - type toggle (Bug / Idea / General); the placeholder text changes with the type;
   - message textarea (required, ≤ 5000);
   - optional email;
   - screenshot toggle;
   - hidden honeypot input `website`;
   - "Powered by Dymcode" badge unless `config.showBadge === false`.
5. On submit, it sends `multipart/form-data` with fields `payload` (JSON) and `screenshot` (Blob,
   optional). `payload = { projectKey, type, message, email?, metadata, elapsedMs, website }`.
   On success it shows "Thanks!" and closes after 2s. On network or 5xx errors it keeps the input and
   shows "Retry". On 429 it shows "Too many submissions, try later".
6. Everything runs inside try/catch. The widget never throws into the host page.

**Accessibility:** the modal is a `role="dialog"` with focus trap, Esc to close and labelled controls.

**Preview mode:** `mountWidget(el, config, { preview: true })` is exported so the dashboard can render
a live preview with submission disabled.

## 5. Public API

All responses from `/api/v1/widget/*` include `Access-Control-Allow-Origin: <request Origin>` and
`Vary: Origin`. An `OPTIONS` handler is present for safety.

### `GET /api/v1/widget/config?key=pk_…`
Returns `{ primaryColor, triggerText, position, showBadge, customCss | null, badgeUrl }`. `showBadge`
is `!(hide_badge && is_pro)` and `customCss` is only returned if the owner is Pro.
`badgeUrl = https://dymcode.dev/?ref={public_key}&utm_source=widget`.
Cache headers: `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`. Unknown key → 404.

### `POST /api/v1/widget/submit`

| # | Step | On failure |
|---|------|-----------|
| 1 | Parse multipart, validate `payload` with zod; screenshot ≤ 2MB, `image/webp`, `image/png` or `image/jpeg` | 400 |
| 2 | `hit_rate_limit('submit:{projectKey}:{sha256(ip + salt)}', 5, 60)` | 429 |
| 3 | Load project by `public_key` and `is_pro(owner_id)` | 404 |
| 4 | If `allowed_origins` is non-empty, `Origin` must match one exactly | 403 |
| 5 | Honeypot non-empty, or `elapsedMs < 2000` | 200 `{ id: null }` (silent drop) |
| 6 | `count = consume_quota(owner)`; `over_quota = !pro && count > 20` | — |
| 7 | Generate id; upload screenshot to Storage; insert `feedback` | Upload failure → insert without screenshot, log error. Insert failure → 500 |
| 8 | Respond `201 { id }` | — |
| 9 | `after()`: if not over quota → `dispatch()`; if over quota and `claim_quota_notice(owner)` → send a one-time "limit reached" message to all enabled integrations of that project | failures only recorded on integrations |

The Origin check blocks accidental reuse of a snippet on another site. It is not a security boundary.
The rate limit and the quota are the real protection.

## 6. Notifications (`lib/notify`)

- `dispatch()` loads the enabled integrations, decrypts their secrets and calls the notifiers with
  `Promise.allSettled`. Each call has a 5s timeout.
- **Retry:** one retry on 429 or 5xx, honouring `retry_after` (capped at 3s).
- On **403/404** (bot kicked, chat not found, webhook deleted), the integration is set to
  `enabled = false` with `last_error`. On other failures, `last_error` is set and the integration stays
  enabled. On success, `last_delivered_at` is set and `last_error` is cleared.
- **Telegram:** HTML parse mode with all user content escaped. With a screenshot it calls `sendPhoto`
  (multipart) with the caption. If the caption exceeds 1024 chars, it sends the photo with a short caption,
  followed by `sendMessage` (truncated to 4096). Without a screenshot it calls `sendMessage`.
- **Discord:** a webhook POST with `payload_json` (an embed coloured by type: bug `#ef4444`, idea
  `#22c55e`, general `#6366f1`) and `files[0]`. The embed image is `attachment://screenshot.webp`.
  `allowed_mentions: { parse: [] }` is set so user text cannot ping anyone.
- **Message content:** type emoji + label, message, email (if present), page URL, browser/OS,
  viewport/screen, up to 3 recent console errors and a "Open in dashboard" link.

## 7. Dashboard

**Auth:** Supabase magic link, GitHub and Google. `middleware.ts` refreshes the session, protects
`(dashboard)` routes and stores a `ref` query param in a 30-day cookie. `auth/callback` writes
`profiles.referred_by_project` on the first login when the cookie is present and valid.

**Mutations:** server actions only. Each one checks the session, project ownership, zod input, and
entitlements server-side.

**Onboarding:**
1. After the first login, the user is redirected to "Create project" (name + optional domain, which
   pre-fills `allowed_origins`).
2. The Install page shows the snippet with a copy button and "Waiting for first feedback…" via
   Realtime on `feedback`.
3. The user is then prompted to connect Telegram or Discord.

**Screens:**
- **Projects:** cards with new-feedback counts. Creating a second project on Free opens an upgrade dialog.
- **Feedback feed:**
  - filters by type and status; cursor pagination (50);
  - a row opens a Sheet with the message, `mailto:` link, screenshot thumbnail (a fullscreen Dialog
    via signed URL), a metadata table and console errors in a code block;
  - actions: Resolve, Archive, Delete;
  - over-quota rows for non-Pro accounts are rendered as blurred placeholders with an upgrade CTA;
  - a usage bar shows "N / 20 this month" on Free.
- **Settings:**
  - colour, trigger text and position, with a live preview (`mountWidget` in preview mode);
  - allowed origins;
  - hide badge and custom CSS (Pro-locked in the UI; values may be saved on Free but are applied
    only by the config endpoint when Pro);
  - delete project.
- **Integrations:** three cards (Telegram shared, Telegram custom bot, Discord). Each shows its
  status, `last_error` and a "Send test" button.
  - *Telegram shared:*
    1. "Connect" creates a link code and offers `t.me/DymcodeBot?start=<code>` (private chat)
       and `?startgroup=<code>` (group).
    2. `/api/telegram/webhook` verifies `X-Telegram-Bot-Api-Secret-Token`, handles `/start <code>` and
       `/start@DymcodeBot <code>`, upserts the `telegram_shared` integration with `target = chat.id`,
       deletes the code and replies "✅ Connected to <project>".
    3. The dashboard polls until connected.
  - *Telegram custom (Pro):* bot token and chat ID. The server validates them with `getMe` plus a
    test `sendMessage` before saving, then stores the token encrypted.
  - *Discord:* the webhook URL must match `^https://(discord|discordapp)\.com/api/webhooks/\d+/[\w-]+$`.
    A test message is sent before saving, and the URL is stored encrypted.
- **Billing:** current plan, usage, "Pro $9/mo" and "Lifetime $49" buttons, and a link to the LS
  customer portal.
- **Account:** email, sign out, delete account. Deletion also removes the Storage objects under the
  user's projects.

## 8. Billing (Lemon Squeezy)

- **Setup:** one product with two variants: monthly subscription and lifetime single payment. Variant
  ids come from env.
- **Checkout:** a server action creates a checkout via the LS API with `custom_data.user_id` and
  `redirect_url = /billing?success=1`. The success page polls `getPlan()` until Pro (max 60s), then
  shows a fallback message.
- **Webhook `/api/billing/webhook`:** verifies `X-Signature` (HMAC-SHA256 over the raw body,
  `timingSafeEqual`); invalid → 401. Handled events:
  - `subscription_created`, `subscription_updated`, `subscription_cancelled`, `subscription_resumed`,
    `subscription_expired`, `subscription_payment_failed` → upsert by `ls_subscription_id`;
  - `order_created` (lifetime variant only), `order_refunded` → upsert by `ls_order_id`, with
    status `paid` or `refunded`.

  All handlers are idempotent upserts that store the raw status; Pro is derived only by `is_pro()`.
  Unknown events → 200 and ignored.
- **Lifetime while monthly is active:** after a lifetime `order_created`, the server cancels the
  active monthly subscription via the LS API.
- **Entitlements** (`lib/billing/plans.ts`):

```ts
export const ENTITLEMENTS = {
  free: { maxProjects: 1, monthlySubmissions: 20, hideBadge: false, customCss: false, customBot: false },
  pro: { maxProjects: Infinity, monthlySubmissions: Infinity, hideBadge: true, customCss: true, customBot: true },
} as const;
```

- **Downgrade:** no data is deleted or locked. All projects keep working under the account-wide quota
  of 20/month. The badge and custom CSS revert automatically via the config endpoint. Creating new
  projects is blocked while over `maxProjects`. The custom-bot integration stops dispatching
  (`dispatch()` skips `telegram_custom` when the owner is not Pro).
- **Where limits live:** in the submit route (rate limit + quota) and in server actions (project count,
  Pro-only settings). `middleware.ts` does not touch the DB.

## 9. Security notes

- Secrets (`integrations.secret_encrypted`) use AES-256-GCM with the key from env
  `SECRETS_ENCRYPTION_KEY` (32 bytes, base64). The format is `v1:<iv>:<ciphertext>:<tag>` so the key
  can be rotated later.
- IP addresses are never stored raw, only as a salted SHA-256 inside `rate_limits.key`.
- Custom CSS is injected only inside the widget's shadow root, so it cannot restyle the host page.
- All user content is escaped in Telegram HTML, and Discord mentions are disabled.

### Environment variables
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`NEXT_PUBLIC_APP_URL`, `SECRETS_ENCRYPTION_KEY`, `IP_HASH_SALT`, `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_BOT_USERNAME`, `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`,
`LEMONSQUEEZY_WEBHOOK_SECRET`, `LEMONSQUEEZY_VARIANT_MONTHLY`, `LEMONSQUEEZY_VARIANT_LIFETIME`.

## 10. Testing

| Layer | Approach |
|---|---|
| `packages/shared` | Vitest: schema edge cases |
| Widget | Vitest + happy-dom: metadata, console buffer, modal behaviour. `size-limit` fails CI if core > 20KB gzip |
| Submit API | Vitest against local Supabase (`supabase start`): quota/over_quota, origin check, rate limit, honeypot, missing screenshot |
| Notifiers | Mocked `fetch`: message format, HTML escaping, caption split, 403 → disable, retry on 429 |
| Billing | LS fixture payloads: signature check, idempotency, `is_pro()` status transitions |
| RLS | Two-user tests: user A cannot read B's data; `integrations`/`subscriptions` unreadable with anon/auth clients |
| E2E | Playwright: test HTML page with the widget → submit → row visible in the dashboard |

CI (GitHub Actions): typecheck, lint, unit/integration tests, size-limit.

**Database test targets:** the dev machine has no working Docker, so DB tests run locally on in-process
PGlite with a bootstrap that emulates Supabase roles, `auth`/`storage` schemas and `auth.uid()`. CI runs
the same tests against a real local Supabase (`supabase start`) as the fidelity check. Later phases that
need Auth/Storage/Realtime at runtime use a free Supabase Cloud dev project.

## 11. Build order

Each phase gets its own implementation plan:

1. Monorepo scaffold + Supabase migrations (schema, functions, RLS) + `packages/shared`.
2. Widget (`packages/widget`).
3. Public API (config, submit) + notifications + Telegram bot webhook.
4. Dashboard (auth, projects, feed, settings, integrations, install).
5. Billing (Lemon Squeezy checkout, webhook, entitlements UI).

## 12. Out of scope (MVP)

Replying to users from the dashboard, teams/members, comments, tags, full-text search, CSV export,
email notifications to owners, per-delivery logs, Slack, public roadmap/voting boards, screenshot
annotation.
