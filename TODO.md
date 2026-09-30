# Bugping review — open issues

Review of the whole app (web, widget, database, CI) on branch `feat/landing-redesign` at `ded8bdb`, 2026-09-25.
Method: read the code, then ran the app in test mode (`next dev`, fake env) and walked every dashboard page,
the widget and the landing in Chromium (light/dark, en/ru, 1280/390 px). Nothing was changed.

Priority: **P0** — fix before public launch (lost data, legal, broken core flow) · **P1** — important bug or gap ·
**P2** — polish, debt, backlog. "Verified" means reproduced in the running app.

---

## P0 — before public launch

- [ ] **Fast reports are silently lost (verified).** `apps/web/lib/widget/submit.ts:145` drops any submission with
      `elapsedMs < 2000` (the bot guard) but still answers `200 { id: null }`, so the widget shows "Thanks!". Opening
      "Ask a question", typing a short text and pressing Send within 2 s showed the thanks screen and stored nothing.
      Paste-and-send and `Bugping.open('bug')` + a prefilled text make this realistic. Fix: keep the honeypot drop, but
      store fast submissions with a `suspected_bot` flag (or lower the threshold to ~800 ms), and never show "Thanks" for
      a report that was not saved.
- [ ] **Allowed-origin trap in onboarding.** `createProject` turns the optional "Website" field into an exact
      `allowed_origins` entry (`apps/web/lib/dashboard/projects.ts`, `normalizeOrigin`). Entering `example.com` blocks
      `https://www.example.com`, `http://`, staging hosts and `localhost` with `403 origin not allowed`
      (`lib/widget/submit.ts:140`). Meanwhile the config endpoint does not check origins, so the widget renders and the
      install checklist turns green ("On your site · seen …"), while every visitor gets the generic "Couldn't send. Try
      again later." and the owner is never told. Fix: accept apex + `www`, record the last rejected origin and show it on
      the Install/Overview pages ("Blocked a report from https://www.example.com — allow it?"), explain the field better,
      consider leaving it empty by default.
- [ ] **Legal pages are drafts.** Privacy, Terms and Refunds render "Draft — not legal advice"
      (`app/(marketing)/privacy/page.tsx:13`, same for terms/refund). There is no legal entity, contact email or address
      anywhere ("contact us" in `legal.refund3` has no contact). Paddle's domain review and GDPR both need this. The privacy
      policy also misses: subprocessors (Supabase, Vercel, Telegram, Discord, Paddle), data location (Vercel `lhr1`),
      retention of messages/emails/metadata (only screenshots are covered), cookies (`locale`, `theme`, `ref`, Supabase
      auth), and visitors' rights (visitors are the data subjects, owners are controllers — needs a DPA-style clause).
- [ ] **Supabase Auth production settings (check in the Supabase dashboard; not in the repo).** Custom SMTP (the
      built-in mailer is rate-limited and not meant for production; `supabase/config.toml` shows `email_sent = 2` per hour),
      branded and localized magic-link templates (en/ru), CAPTCHA/Turnstile on sign-in (`[auth.captcha]` is commented out;
      `sendMagicLink` has no rate limit of its own, so the endpoint can be used to email-bomb any address), production
      `site_url` and redirect allow-list.

## P1 — bugs

- [ ] **Project switcher is stale after creating a project (verified).** `createProjectAction`
      (`apps/web/app/app/actions.ts:33`) does not call `revalidatePath`, and `router.push` keeps the shared `/app` layout.
      On the Install page right after creation the switcher says "Projects" and the new project is missing from the
      dropdown until a full reload. Fix: `revalidatePath('/app', 'layout')` like the other actions.
- [ ] **Dates are shown in the server's time zone (verified).** next-intl has no `timeZone` in
      `apps/web/i18n/request.ts:10`, so `format.dateTime` renders in UTC on Vercel ("Sep 25, 2026, 8:20 AM" for a report
      sent at 11:20 Moscow time), with no zone label. Fix: store the owner's zone (from the browser, e.g. cookie) and
      pass `timeZone` in the request config, or format client-side.
- [ ] **Sign-in loses the user's intent.** The proxy redirects `/app/*` to plain `/login`
      (`apps/web/proxy.ts:50`) and the auth callback always goes to `/app` (`app/auth/callback/route.ts:25`). A visitor
      who clicks "Get Pro" / "Buy Lifetime" on the landing (`/app/billing`) ends up on the overview after signing in. Fix: a
      validated same-origin `next` parameter through login → magic link / OAuth → callback.
- [ ] **No 404, error or loading UI.** There is no `not-found.tsx`, `error.tsx`, `global-error.tsx` or `loading.tsx`
      anywhere in `apps/web/app`. Unknown URLs get Next's unbranded English 404; any DB/API error in a server component
      shows Next's generic error screen; slow dashboard renders (the DB is remote) have no skeleton, so navigation feels
      stuck (`components/ui/skeleton.tsx` exists but is unused).
- [ ] **Screenshots are re-downloaded every 30 s.** `AutoRefresh` (`components/app/auto-refresh.tsx:15`) calls
      `router.refresh()` every 30 s, also in background tabs. Each refresh re-runs the layout's queries and mints a new
      5-minute signed URL (`lib/dashboard/feedback.ts:261`), so an open detail panel re-downloads its screenshot (up to
      2 MB) every 30 s. Fix: pause while `document.hidden`, keep a stable signed URL per feedback for its TTL, refresh only
      the feed data.
- [ ] **`getDeps()` caches a rejected promise** (`apps/web/lib/deps.ts:28`, already in the dashboard follow-ups):
      one transient env/DB error at cold start breaks every request until the instance restarts. Clear the cache on rejection.

## P1 — product

- [ ] **"Ask a question" promises a reply the owner cannot send.** The card hint says "We'll reply by email"
      (`packages/widget/src/i18n.ts:75`, also ru/uk/es), but the email field is optional and unlabeled except for its
      placeholder. Many questions arrive without an address. Fix: require the email for the question type (or show
      "Leave your email so we can reply" and a visible label), and hide Reply in the dashboard only when there is none.
- [ ] **Owners are not told when delivery stops.** Telegram/Discord integrations are auto-disabled on 401/403/404
      (`lib/notify/telegram.ts`, `lib/notify/discord.ts`, `record()` in `lib/notify/dispatch.ts`), and the monthly-limit
      notice is only sent through integrations (`dispatchQuotaNotice`). An owner whose bot was kicked from the group, or who
      has no integration, learns nothing until they open the dashboard. Fix: email the owner on disable and on quota reached
      (and show a banner in the app).
- [ ] **Free quota can be burned by anyone.** The public key is in the page source and `allowed_origins` is empty by
      default, so a script can send 5 reports/min per IP and 30/min per project (`lib/widget/submit.ts` rate limits) and use
      up the Free owner's 20 reports in a minute; real reports then land as hidden `over_quota` rows. `Origin` is also
      trivially forged outside browsers. Consider a per-project daily cap, not counting reports the owner deletes as spam,
      and nudging owners to set allowed origins.
- [ ] **Russian-speaking audience is invisible to search engines.** The locale comes only from the `locale` cookie or
      `Accept-Language` (`i18n/locale.ts`); there are no locale URLs (`/ru`), no `hreflang`, and the sitemap lists one
      version. Crawlers (Google, Yandex) index the English page only, while the product copy is ru-first.
- [ ] **Install guides promised on the landing do not exist.** The landing and FAQ say it works on WordPress, Shopify
      and Tilda; the Install page only has HTML, Next.js, "your own button" and `identify()`. Add short per-platform guides
      (where to paste the snippet in each builder).
- [ ] **Retention covers screenshots only.** `lib/retention.ts` deletes expired screenshot files; messages, visitor
      emails, URLs and console errors are kept forever. Decide a retention period for rows (or say "until you delete it" in
      the privacy policy) and enforce it.

## P1 — security

- [ ] **No security headers on app pages.** `next.config.ts` only sets headers for `/w/*` and `/demo/*`. The dashboard
      can be framed by any site (clickjacking on Resolve/Delete/Disconnect), there is no CSP, no `Referrer-Policy`, and
      `X-Powered-By: Next.js` is sent. Add `frame-ancestors 'none'` (or `X-Frame-Options: DENY`) for everything except
      `/demo/*`, a CSP at least for `/app`, `Referrer-Policy: strict-origin-when-cross-origin`, `poweredByHeader: false`.

## P1 — UI

- [ ] **Word spaces collapse in small text (verified, needs a check on macOS/Windows).** At `text-xs` (12 px Manrope)
      a space measures 2 px (0.17 em), so hints read as "Pastethesnippet on yoursite", "0 of 20 feedbackthismonth" in
      Chromium (1× and 2× DPR). Affects every muted hint in the dashboard and landing. Fix: `word-spacing: 0.05em` (or
      `0.04em`) on small text, or a slightly larger hint size.

## P2 — UI / UX polish

- [ ] Inconsistent page widths: Overview/Settings use the full content width, Install/Integrations/Billing
      `max-w-3xl`, Account is narrower again.
- [ ] On `/app/billing` and `/app/account` the sidebar drops project navigation (switcher shows "Projects", no
      Overview/Feedback links) and the Account link is not highlighted as current.
- [ ] Deleting a report uses the browser's native `confirm()` (`components/app/feedback/feedback-actions.tsx:102`)
      while project/account deletion use a typed in-app confirmation; the native dialog is unthemed and its buttons follow
      the browser language.
- [ ] After Resolve/Archive the detail panel stays open on a report that no longer belongs to the current tab; there
      is no "next report" flow for triaging.
- [ ] "Your own Telegram bot" (Pro) shows disabled inputs without an upgrade link.
- [ ] Settings: one Save button at the bottom of a long page, no unsaved-changes indicator or leave guard; on mobile
      the empty 420 px preview box pushes the rest of the form down.
- [ ] Russian copy: "Не подключён" (overview) vs "Не подключено" (integrations); the Resolve button reads «Решено»
      (a state) instead of an action («Отметить решённым» / «Решить»); the dashboard is "Дашборд" on the landing but
      "панель" in the integrations copy.
- [ ] Billing highlights Lifetime, the landing highlights Pro ("Popular"); plan names/feature wording differ between
      the two pages.
- [ ] Paddle.js blocked (ad blockers often block it): the user only gets a generic "checkout failed" toast; say that
      a blocker may be the cause.
- [ ] Legal pages still use the old typography (`text-3xl font-semibold`, plain paragraphs) next to the new landing.
- [ ] Default launcher text is the English "Feedback" for every project (DB default,
      `supabase/migrations/20260921000200_core_tables.sql:26`); it becomes the button's tooltip and `aria-label` on
      Russian sites. Default it from the owner's locale.
- [ ] Mobile nav `Sheet` has no `SheetTitle` (`components/app/mobile-nav.tsx`, known) — unlabeled dialog for screen
      readers.
- [ ] Integration errors (`lastError`) are raw English provider texts in the Russian UI (known).
- [ ] Notifications, the quota notice and the Telegram bot's replies are English only, while the dashboard and
      widget are localized. Consider the owner's locale for bot/notification texts.

## P2 — product backlog

- [ ] Policy on downgrade from Pro: extra projects keep receiving reports (only creating new ones is blocked).
- [ ] Deleted reports still count toward the monthly quota, so deleting spam does not give it back.
- [ ] Referral attribution is collected (`ref` cookie on every page via `proxy.ts`, `profiles.referred_by_project`)
      but used nowhere; build the program or drop the cookie and column (and mention it in the privacy policy if kept).
- [ ] Missing for teams/agencies: team members and invites, search, bulk actions, CSV/data export, notes/assignee/tags,
      an email notification channel, Slack/Jira/GitHub issues.
- [ ] The widget supports `uk` and `es`, the site and dashboard only `en`/`ru`.

## P2 — security / privacy

- [ ] `clientIp()` trusts the first `x-forwarded-for` hop (`lib/http.ts`): correct on Vercel, spoofable (rate-limit
      bypass) on any other hosting. Document it or read the platform's client-IP header.
- [ ] The config endpoint answers any origin and sets `widget_seen_at` (`lib/widget/config.ts:43`), so anyone with
      the key (or a curl) turns "Install the widget" green, even from a blocked origin.
- [ ] `feedback` is in the `supabase_realtime` publication (`supabase/migrations/20260921000400_access.sql:91`) but
      nothing subscribes; remove it (less exposure through the anon key, less WAL load).
- [ ] E2E routes are guarded inconsistently: `/api/e2e-test/*` check only `BUGPING_TEST_MODE`, `/e2e-host` also
      `NODE_ENV`; production safety relies on `assertTestModeAllowed` in `getDeps`. Use one guard helper everywhere.

## P2 — performance / cost

- [ ] The live demo reloads `/demo/shop` and `/demo/dashboard` every ~20 s per visitor watching the hero (plus the
      proxy's Supabase `getClaims` for each). `/demo/shop` could be static and cached; consider not reloading the shop
      iframe between loops.
- [ ] Every non-static request, including the landing and the demo iframes, runs the proxy's Supabase `getClaims`;
      the root layout's `getLocale()` makes every page dynamic, so the landing is never static/CDN-cached.
- [ ] The `/app` layout runs 4 queries on every navigation and pages repeat `usage()` / `isPro()`; cache per request
      (`react.cache`).
- [ ] Polls ignore tab visibility: install "waiting for first feedback" every 3 s, Telegram link status every 2 s
      without an in-flight guard (known).

## P2 — tech debt / tests

- [ ] No ESLint at all (no config, no script, not in CI); 6 files carry dead `eslint-disable` comments and
      react-hooks dependency mistakes are not caught. Add `eslint-config-next` + `react-hooks`.
- [ ] Unused UI components: `components/ui/badge.tsx`, `select.tsx`, `separator.tsx`, `skeleton.tsx`, `tooltip.tsx`.
- [ ] Every web unit test starts the PGlite DB harness (`apps/web/test/setup.ts:4`), so the suite takes ~140 s
      sequentially; split pure unit tests into their own Vitest project without DB setup and run it in parallel.
- [ ] Web E2E runs against `next dev` only; production-only behaviour (bundling, prefetch, headers, CSP) is never
      tested. Add a small smoke suite against `next build && next start`.
- [ ] `adoptStyles()` is duplicated in `packages/widget/src/ui/mount.ts` and `src/annotate/editor.ts`.
- [ ] No DOM test environment in `apps/web`: component logic (feed filters, demo stage lifecycle, forms) is only
      covered by E2E.

## Landing (stage 4) — left for the owner

- [ ] Mobile: the demo is a scaled 1280×720 canvas (~0.28× at 390 px), readable as a picture only.
- [ ] Russian and English copy was written without the brainstorm's approved text; review headline, facts, FAQ and the
      new footer tagline. "Free" stays untranslated in ru pricing.
- [ ] The demo store logs one real `console.error` per loop: Lighthouse "errors in console" may flag the landing; in
      dev Next shows an issue badge inside the demo.
- [ ] Safari < 16.4 sends no `Sec-Fetch-*` headers, so scene 3 shows the fixture text instead of the typed report.
- [ ] `/demo/shop` logs "preloaded but not used" warnings for two Manrope files on every iframe load.

## Carried over — still open in `docs/superpowers/followups/`

These were listed after earlier phases and are still open in the code (not repeated above):

- API: body-size guard trusts `Content-Length`; over-quota submissions still upload screenshots; `rate_limits` rows
  created before the 404 check; a failed insert after `consume_quota` loses a unit; Telegram `migrate_to_chat_id` not
  handled; Discord "Console errors" field not link-escaped; `ssl: 'require'` does not verify the certificate; config
  CORS reflects `Origin` (CDN caching). See `2026-09-22-api-followups.md`.
- Widget: capture of scrolled pages with fixed headers / long pages / transparent backgrounds; memoized chunk-load
  failures; `annotate.js` not minified; paste hint on touch devices; export failure looks like Cancel. See
  `2026-09-22-widget-followups.md`.
- Billing: `past_due` cancellation in the Paddle sandbox, email changes vs Paddle customer, `chargeback_reverse`,
  per-user advisory lock for webhooks, webhook body cap, env/key consistency check. See `2026-09-23-billing-followups.md`.
- Dashboard: zod validation of raw action arguments; screenshots orphaned when feedback arrives during project/account
  deletion; magic links only work in the requesting browser (PKCE); missing rate-limit/ownership tests for integration
  actions. See `2026-09-23-dashboard-followups.md`.

Resolved since those notes (verified in code): the Discord webhook URL is now encrypted like the bot token; the feed
cursor uses `(created_at, id)`; the landing has one CTA per plan.

Still open in a new form: plan prices are no longer in JSX, but they are typed into five message keys per locale
(`landing.pricing.proPrice`, `lifetimePrice`, `billing.monthly`, `billing.lifetime`, `billing.switchLifetime`) and set
separately in Paddle. A price change means editing ten strings plus Paddle; use one constant, or Paddle's price
preview.
