# Dymcode Phase 4: Dashboard, Landing, Deployment: Design

**Date:** 2026-09-22
**Status:** Approved in brainstorming, pending spec review
**Parent specs:**
- `docs/superpowers/specs/2026-09-21-dymcode-design.md` (§7 Dashboard);
- `docs/superpowers/specs/2026-09-22-api-notifications-design.md` (apps/web architecture, notifiers, test mode).

This document refines both parents. Where they disagree, this document wins for phase 4.

## 1. Scope

- **Auth:** magic link and GitHub (Supabase Auth). Google is deferred.
- **Dashboard in `apps/web`:** onboarding, project creation, install page, feedback feed with detail panel,
  settings with live widget preview, integrations (shared Telegram bot deep-link, custom bot, Discord),
  billing page (plan and usage, with an upgrade stub), account.
- **Landing page `/`** with pricing and FAQ; draft Privacy/Terms pages.
- **UI in English and Russian** (next-intl).
- **Tests:** server actions on PGlite (and real Supabase in CI), plus Playwright E2E in test mode.
- **Deployment to Vercel** and registration of the Telegram webhook, done together with the owner.

**Out of scope:** payments (phase 5), Google sign-in, custom SMTP (see §9), team members, CSV export,
replying to reporters from the dashboard, Realtime.

## 2. Decisions

| Topic | Decision |
|---|---|
| Sign-in | Magic link (`signInWithOtp`) and GitHub (`signInWithOAuth`) through `@supabase/ssr`, with the session in cookies |
| Data access | postgres.js inside a transaction that runs `set local role authenticated` and `request.jwt.claims = {sub, role}`, so every dashboard read/write is enforced by the phase-1 RLS policies. Service-role SQL is used only for operations RLS forbids, always after an ownership check |
| Live updates | Polling, no Realtime: install page every 3 s; Telegram connect every 2 s, capped at 60 s; feed every 30 s plus a Refresh button |
| Layout | Left sidebar, then the feedback list, then a detail side panel. On mobile the sidebar is a drawer and the detail panel opens full-screen |
| UI kit | Tailwind CSS v4 + shadcn/ui, light and dark themes |
| Languages | `en`, `ru` via next-intl without URL prefixes. Locale comes from the `locale` cookie, else `Accept-Language`, else `en` |

## 3. Auth and routing

**Routes:**
```
/                          landing
/privacy, /terms           draft legal pages
/login                     email magic link + "Continue with GitHub"
/auth/callback             exchange code → session; first-login referral attribution; redirect /app
/app                       → first project's feedback, or /app/new if none
/app/new                   create project
/app/p/[projectId]/feedback | install | settings | integrations
/app/billing               plan, usage, upgrade stub
/app/account               email, language, sign out, delete account
```

**Middleware** (named `proxy.ts` in Next 16; follow the installed version's convention):
- refreshes the Supabase session;
- redirects unauthenticated `/app/*` requests to `/login`;
- when a request carries `?ref=pk_…` matching `PUBLIC_KEY_PATTERN`, stores it in a `ref` cookie for 30 days.

**Current user.** `getSessionUser(): Promise<{ id: string; email: string } | null>`.
- In production it reads Supabase claims (`auth.getClaims()`, falling back to `getUser()`).
- In test mode it reads the `e2e_user` cookie set by `POST /api/e2e-test/login`, which returns 404 outside test mode.

`requireUser()` redirects to `/login` when there is no user.

**Referral attribution** (`/auth/callback`). On the first login, when the profile has no
`referred_by_project` yet and the `ref` cookie names an existing project whose owner is not this user:
set `profiles.referred_by_project`, then clear the cookie. This runs through the service connection.

## 4. Data access layer

- `Db` gains `transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>`.
  - **postgres.js:** `sql.begin`, which is compatible with the transaction pooler.
  - **Test harness:** a savepoint inside the test transaction.
  - **Test mode (PGlite):** `begin`/`commit`.
- `withUser<T>(db: Db, userId: string, fn: (tx: Db) => Promise<T>): Promise<T>`:
  1. opens a transaction;
  2. `set local role authenticated`;
  3. `select set_config('request.jwt.claims', $1, true)` with `{"sub": userId, "role": "authenticated"}`;
  4. `fn(tx)`.
- **Service-role operations** (RLS forbids them for clients) always check ownership first via
  `withUser` (e.g. the project is visible to the user):
  - creating projects (entitlement check);
  - integrations and link codes;
  - hidden-feedback counts;
  - screenshot signed URLs and deletions;
  - account deletion.
- **Storage** gains `signedUrl(path, expiresInSeconds)` (supabase-js `createSignedUrl`; the memory
  storage returns a data URL) and uses the existing `remove`.

## 5. Screens

**Shell.** The sidebar holds the logo, a project switcher, links (Feedback, Install, Settings,
Integrations), and at the bottom Billing and Account. It becomes a drawer on mobile.

**`/app/new`.**
- Fields: name (1–80) and an optional site URL, which pre-fills `allowed_origins`.
- On Free with one project already, show an upgrade card instead of the form. The server enforces
  `ENTITLEMENTS.free.maxProjects` either way.
- On success, go to Install.

**Install.**
- The snippet `<script async src="{APP_URL}/w/widget.js" data-project-id="pk_…"></script>` with a
  copy button, plus short guides: plain HTML, Next.js/React (`next/script` with
  `strategy="afterInteractive"`), `data-hide-trigger` + `Dymcode.open()`, and `Dymcode.identify()`.
- A "Waiting for your first feedback…" indicator polls every 3 s. On the first feedback it shows a
  success state with "Open feedback" and "Connect Telegram".

**Feedback.**
- **List:**
  - filters by type (All/Bug/Idea/Other) and status (New/Resolved/Archived);
  - cursor pagination by 50 on `(created_at, id)`;
  - auto-refresh every 30 s plus a Refresh button;
  - each row: type color, first line of the message, relative time, screenshot icon.
- **Hidden rows.** When the owner has over-quota feedback that RLS hides, show that many blurred
  placeholder rows (count from the service query) with "Upgrade to see N hidden".
- **Detail panel:**
  - message;
  - `mailto:` email;
  - screenshot through a 5-minute signed URL, full-screen on click;
  - metadata table (URL, browser, OS, viewport, screen, language, timezone, identified user);
  - console errors in a code block;
  - actions Resolve / Archive / Reopen / Delete (Delete asks for confirmation).
- **Usage bar** on Free: "N / 20 this month".

**Settings.**
- The form is on the left and a live preview on the right: `mountWidget` from `@dymcode/widget` with
  `preview: true`; the panel can be opened.
- **Fields:**
  - primary color (picker + hex), trigger text (1–40), position, widget language (`auto`, `en`, `ru`, `uk`, `es`);
  - allowed origins (≤ 20, normalized to `scheme://host[:port]`);
  - 🔒 Pro: hide badge, custom CSS (≤ 10 240 **bytes**).
- The danger zone deletes the project after the user retypes its name.

**Integrations.** Each card shows its status (Connected / Not connected / Error: `last_error`), the
last delivery time, "Send test" and "Disconnect".
- **Telegram (shared bot):**
  - "Connect" creates a link code and shows "Private chat" (`t.me/<bot>?start=<code>`) and
    "Add to group" (`?startgroup=<code>`);
  - the card polls every 2 s (≤ 60 s) until connected.
- **Custom bot (🔒 Pro):** bot token + chat id. The server validates the token format, calls `getMe`,
  sends a test message, and only then stores the encrypted token. The card shows `@username` only.
- **Discord:** webhook URL, validated exactly like `dispatch` (https, Discord host, `/api/webhooks/`),
  then a test message, then stored encrypted.

**Billing.** Current plan, this month's usage, and "Pro $9/mo" / "Lifetime $49" buttons that open a
"Payments are coming soon" dialog (phase 5).

**Account.** Email, UI language, sign out, delete account (confirmation by typing the email).

## 6. Server actions (`apps/web/lib/dashboard/*`)

Every action:
- validates input with zod;
- takes `userId` from `requireUser()`;
- returns `{ ok: true, … } | { ok: false, error: <i18n key> }`;
- never returns secrets.

| Action | Execution |
|---|---|
| `createProject` | service `db`: count the owner's projects vs `ENTITLEMENTS`, then insert |
| `updateProjectSettings` | `withUser` (RLS column grant covers the settings columns incl. `locale`) |
| `deleteProject` | ownership via `withUser` → service: remove Storage objects under `{projectId}/` → `withUser` delete |
| `listFeedback`, `getFeedback`, `usage` | `withUser` reads |
| `hiddenFeedbackCount` | ownership via `withUser`, then a service count of `over_quota` rows when the owner is not Pro |
| `screenshotUrl` | `withUser` confirms the feedback is visible → Storage signed URL (300 s) |
| `setFeedbackStatus`, `deleteFeedback` | `withUser` (RLS: `status` only / own rows); deletion also removes the screenshot |
| `createTelegramLink` | ownership → rate limit → delete the project's old codes → insert a new code → return both links |
| `integrationStatus` | ownership → service read → DTO `{ kind, enabled, connected, lastError, lastDeliveredAt, botUsername? }` |
| `saveCustomBot` | ownership + Pro → token regex → `getMe` → test send → encrypt + upsert |
| `saveDiscord` | ownership → URL validation → test send → encrypt + upsert |
| `sendTest` | ownership → rate limit → deliver a test notice to that single integration (reusing the notifiers) |
| `disconnectIntegration` | ownership → delete the row |
| `deleteAccount` | remove Storage objects of all owned projects → `auth.admin.deleteUser(userId)` (DB cascade) → sign out |

- **Rate limits:** `createTelegramLink`, `sendTest`, `saveCustomBot` and `saveDiscord` are capped at
  10 per minute per user through `hit_rate_limit('dashboard:<action>:<userId>', 10, 60)`.
- **Validation lives in shared helpers,** so dispatch and dashboard never diverge: the Discord URL
  and bot-token validators move from `lib/notify/dispatch.ts` to `lib/notify/validate.ts`.
- **No schema changes.**

## 7. Landing page and legal pages

- **Sections:**
  1. Hero: "Bug reports and feedback, straight to Telegram & Discord", with "Start free" and "See how it works".
  2. How it works: 3 steps, with the real Dymcode widget embedded (our own project key comes from the
     env var `NEXT_PUBLIC_DYMCODE_PROJECT_KEY`; if it is unset, the landing page shows no widget).
  3. Why Dymcode: size, instant alerts, privacy, price.
  4. Pricing: Free / Pro / Lifetime.
  5. FAQ.
  6. Footer with a language switch and Privacy/Terms links.
- **Privacy and Terms:** draft pages marked "Draft — not legal advice". They describe what is stored:
  message, optional email, screenshots (30 days Free / 365 days Pro), page metadata with redacted
  tokens, and IP only as a salted hash inside rate-limit keys.
- **SEO:** localized `metadata` (title, description, Open Graph), `robots.txt`, `sitemap.xml`.

## 8. Testing and deployment

**Tests:**
- **Server actions** (Vitest on PGlite; CI repeats them on real Supabase):
  - owner allowed, other user denied or empty;
  - Free cannot create a second project;
  - CSS over 10 240 bytes rejected; origins normalized; hidden feedback invisible but counted;
  - a new link code replaces older ones;
  - rate limits;
  - custom bot and Discord saved only after a successful test;
  - DTOs contain no secrets;
  - `deleteProject` / `deleteAccount` remove Storage objects.
- **i18n:** `en.json` and `ru.json` have identical key sets and no empty strings.
- **Component tests** only where there is logic: feed filters, settings byte counter.
- **E2E** (Playwright, test mode, using `/api/e2e-test/login`):
  1. log in → create project → Install shows the snippet → submit from the host page through the real
     widget → Install shows success → the feedback is in the feed → Resolve;
  2. Settings: change color and locale → the preview updates → `GET /api/v1/widget/config` returns the new values;
  3. Integrations: Connect Telegram → the test posts `/start <code>` to the webhook with the test secret →
     the card shows Connected; Discord save goes through the outbox test send;
  4. switch the UI to Russian → the dashboard renders in Russian.
- **CI:** the new tests join the existing jobs.

**Deployment** (with the owner, at the end of the phase):
1. Create a Vercel project from the GitHub repo with Root Directory `apps/web`. The build must produce
   the widget first (`pnpm --filter @dymcode/widget build && pnpm --filter @dymcode/web build`).
2. The owner enters the environment variables (the same names as `.env.local`) with
   `NEXT_PUBLIC_APP_URL` = the production URL.
3. Supabase → Authentication → URL Configuration: Site URL and redirect URL `https://<domain>/auth/callback`.
4. GitHub OAuth App: callback `https://<project-ref>.supabase.co/auth/v1/callback`. Client ID and
   secret go into Supabase → Auth → Providers → GitHub. A step-by-step guide is given at that point.
5. `pnpm --filter @dymcode/web telegram:set-webhook https://<domain>/api/telegram/webhook`.
6. Live smoke checklist:
   - sign in with GitHub and with a magic link (to a team-member address);
   - create a project, submit from the landing widget;
   - the message arrives in the owner's Telegram with a screenshot;
   - connect Discord;
   - the retention cron is listed in Vercel.

## 9. Launch checklist (not part of phase 4 development)

| Item | Why | Cost |
|---|---|---|
| Custom SMTP (e.g. Resend) configured in Supabase Auth | Supabase's built-in email only sends to project team members, a few per hour; magic links fail for real users without it | Free up to 3 000 emails/month |
| Own domain (e.g. dymcode.dev) | Required by Resend for sending; brand and trust | ~$10–15/year |
| Vercel Pro | Hobby is for non-commercial use only | $20/month |
| Supabase Pro | Free projects pause after a week of inactivity; limits of 500 MB DB and 1 GB storage | $25/month |
| Review Privacy/Terms with a lawyer | Draft pages only | — |
| Items in `docs/superpowers/followups/2026-09-22-api-followups.md` marked "before public launch" | Abuse and robustness hardening | — |
