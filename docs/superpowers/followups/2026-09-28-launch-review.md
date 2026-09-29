# Launch review follow-ups

Source: an external review of the whole app (`TODO.md`, 2026-09-25, branch `feat/landing-redesign` at `ded8bdb`).
Every item was re-checked against `main` at `d02c425` on 2026-09-28 (code read; landing headers and fonts checked on
production). Marks: ✅ confirmed · ◐ partly true (correction noted) · ⧗ not checkable from the repo.

Order of work: wave 1 blocks commercial launch (Paddle live, VPS move); later waves follow by priority.

## Wave 1 — before commercial launch

- [ ] ✅ **Fast reports are silently lost.** `lib/widget/submit.ts:145` drops `elapsedMs < 2000` (measured from form
      open, `packages/widget/src/ui/form.ts:213`) with `200 { id: null }`; the widget shows "Thanks". A short question
      sent within 2 s is never stored. Keep the honeypot drop; store fast submissions flagged `suspected_bot` (or lower
      the threshold to ~800 ms); never answer 200 to a report that was not saved. Correction: the widget has no prefill
      API (`open(type)` only), so the realistic cases are paste-and-send and short texts. The FAQ answer
      `landing.faq.a2` ("nothing is lost") must stay true after the fix.
- [ ] ✅ **Allowed-origin trap in onboarding.** `createProject` (`lib/dashboard/projects.ts:99`) turns "Website
      (optional)" into one exact origin (`normalizeOrigin` → `https://example.com`), so `www.`, `http://`, staging and
      `localhost` get `403 origin not allowed`. `handleConfig` (`lib/widget/config.ts:34`) checks no origin and marks
      the widget seen, so the install checklist turns green while every visitor sees "Couldn't send". Accept apex +
      `www`; record the last rejected origin and show it on Install/Overview with an "allow" action; reword the hint;
      consider an empty default.
- [ ] ✅ **Legal pages are drafts.** Privacy/Terms/Refund render `legal.draft` ("Draft — not legal advice",
      `app/(marketing)/privacy/page.tsx:13`). No seller name, contact email or address; `legal.refund3` says "contact us"
      with no contact. Privacy is missing: subprocessors (Supabase, hosting, Telegram, Discord, Paddle), data location,
      retention of messages/emails/metadata (only screenshots are covered), cookies (`locale`, `theme`, `ref`, Supabase
      auth), visitors' rights with owners as controllers (DPA-style clause). Needed for Paddle's website review and GDPR.
      Restyle the pages to the new typography at the same time (`text-3xl font-semibold`, plain paragraphs).
- [ ] ⧗ **Supabase Auth production settings** (dashboard, not in the repo). Custom SMTP (the built-in sender is
      rate-limited: local `supabase/config.toml` has `email_sent = 2` per hour), branded en/ru magic-link templates,
      CAPTCHA/Turnstile on sign-in, production Site URL and redirect list. Correction: "email-bomb any address" is
      overstated — Supabase throttles OTP mails per address — but anyone can exhaust the project-wide mail quota
      through `sendMagicLink` (`app/login/actions.ts:14`, no own rate limit), which blocks sign-in for everyone.
- [ ] ✅ **No security headers on app pages.** `next.config.ts` sets headers only for `/w/*` and `/demo/*`; production
      sends `X-Powered-By: Next.js` and no `X-Frame-Options`/`frame-ancestors`/`Referrer-Policy`. Add
      `frame-ancestors 'none'` everywhere except `/demo/*`, a CSP for `/app`, `Referrer-Policy:
      strict-origin-when-cross-origin`, `poweredByHeader: false`.
- [ ] ✅ **`clientIp()` trusts the first `x-forwarded-for` hop** (`lib/http.ts:26`). Correct on Vercel only; behind
      Cloudflare → VPS it is spoofable (rate-limit bypass). Read `cf-connecting-ip` and firewall the origin to
      Cloudflare ranges. Required for the MVPS move.
- [ ] ✅ **Sign-in loses the user's intent.** `proxy.ts:50` redirects to plain `/login`; `auth/callback/route.ts:25`
      always goes to `/app`. "Get Pro"/"Buy Lifetime" on the landing lands on Overview after sign-in. Pass a validated
      same-origin `next` through login → magic link / OAuth → callback.
- [ ] ✅ **Billing follow-ups marked "before going live"** in `2026-09-23-billing-followups.md` (`past_due`
      cancellation, email changes vs Paddle customer, webhook body cap, advisory lock, key/env consistency).

## Wave 2 — bugs (done 2026-09-29, branch fix/wave-2-bugs)

- [x] ✅ **Project switcher is stale after creating a project.** `createProjectAction` (`app/app/actions.ts:33`) has no
      `revalidatePath`; the form does `router.push` (`app/app/new/new-project-form.tsx:25`). Add
      `revalidatePath('/app', 'layout')` like the other actions.
- [x] ✅ **Dates render in the server's time zone.** `i18n/request.ts` passes no `timeZone`; only the overview chart
      sets `UTC` explicitly. Store the owner's zone (cookie from the browser) and pass it to next-intl.
- [x] ✅ **No 404 / error / loading UI.** No `not-found.tsx`, `error.tsx`, `global-error.tsx` or `loading.tsx` in
      `apps/web/app`; `components/ui/skeleton.tsx` is unused. Add branded, localized ones and dashboard skeletons.
- [x] ✅ **Screenshots re-download every 30 s.** `AutoRefresh` (`components/app/auto-refresh.tsx:15`) refreshes also in
      background tabs; each refresh mints a new 5-minute signed URL (`lib/dashboard/feedback.ts:261`), so the open
      detail panel re-downloads up to 2 MB. Pause while `document.hidden`; keep a stable URL per report for its TTL.
- [x] ✅ **Polls ignore tab visibility** — `first-feedback-watcher.tsx:22` (3 s) and `integrations-panel.tsx:197`
      (2 s, no in-flight guard). Pause while hidden; skip a tick while a request is in flight.

## Wave 3 — product

- [ ] ✅ **"Ask a question" promises a reply by email** (`packages/widget/src/i18n.ts` `cardHints.general`, all four
      locales) but the email field is optional and labelled only by its placeholder. Require it for questions, or show
      a visible "Leave your email so we can reply" label.
- [ ] ✅ **Owners are not told when delivery stops.** Integrations are auto-disabled on 401/403/404
      (`lib/notify/telegram.ts:23`, `discord.ts:56`, `dispatch.ts:117`); the quota notice goes only through
      integrations (`dispatchQuotaNotice`); the app sends no email at all. Email the owner on disable and on quota
      reached; show a banner in the app. (`landing.faq.a2` already promises a notice.)
- [x] ✅ **Free quota can be burned by anyone.** (A+B done 2026-09-29: refund on delete, 10/day per IP; a per-project daily cap was declined — it would also block real reports) Public key in the page source, `allowed_origins` empty by default,
      limits 5/min per IP and 30/min per project (`lib/widget/submit.ts:18-19`) vs 20 reports/month on Free. Add a
      per-project daily cap; give quota back for reports deleted as spam (the counter is never decremented,
      `consume_quota` in `20260921000300_functions.sql:33`); nudge owners to set allowed origins.
- [ ] ✅ **Russian audience invisible to search engines.** Locale only from cookie/`Accept-Language`
      (`i18n/locale.ts`); no `/ru` URLs, no `hreflang`, one sitemap entry per page. Add locale URLs + `hreflang`.
- [x] ✅ **Install guides promised on the landing don't exist.** (done 2026-09-29: dashboard + public /install) The facts strip and FAQ name WordPress, Shopify and
      Tilda; the Install page has only HTML, Next.js, own button and `identify()`. Add short per-platform guides.
- [ ] ✅ **Retention covers screenshots only** (`lib/retention.ts`). Messages, emails, URLs and console errors stay
      forever. Pick a row retention period (or state "until you delete it" in the privacy policy) and enforce it.

## Wave 4 — polish, performance, debt

UI / UX:
- [ ] ✅ Page widths differ: Overview/Settings `max-w-5xl`, Install/Integrations/Billing `max-w-3xl`, Account
      `max-w-2xl`.
- [ ] ✅ Deleting a report uses native `confirm()` (`components/app/feedback/feedback-actions.tsx:102`); use the in-app
      confirmation like project/account deletion.
- [ ] ✅ Billing highlights Lifetime (`billing-panel.tsx:134`), the landing highlights Pro ("Popular"); align plan
      names and wording.
- [ ] ✅ Russian copy: `overview.notConnected` «Не подключён» vs `integrations.notConnected` «Не подключено»;
      `feedback.resolve` «Решено» is a state, not an action; «Дашборд» on the landing vs «панель» in integrations.
- [ ] ✅ Paddle.js blocked by an ad blocker only logs to the console (`use-paddle.ts:27`); tell the user a blocker may
      be the cause.
- [ ] ✅ Default launcher text is English `'Feedback'` (DB default, `20260921000200_core_tables.sql:26`); default it
      from the owner's locale.
- [ ] ✅ Mobile nav `Sheet` has no `SheetTitle` (`components/app/mobile-nav.tsx`).
- [ ] ◐ Small text spacing: Manrope's space is 0.2 em (2.4 px at 12 px, measured on production). Words stay
      readable in Chromium/Windows, but hints look tight; try `word-spacing: 0.03em` on `text-xs`. Not a collapse.
- [ ] Not re-checked in the browser, taken from the review: `/app/billing` and `/app/account` drop project
      navigation; the detail panel stays open after Resolve/Archive (no "next report"); "Your own Telegram bot" shows
      disabled inputs without an upgrade link; Settings has one Save button, no unsaved-changes guard, and a 420 px
      empty preview on mobile; integration `lastError` texts and bot/notification texts are English only.

Security / privacy:
- [ ] ✅ The config endpoint answers any origin and sets `widget_seen_at` (`lib/widget/config.ts:43`).
- [ ] ✅ `feedback` is in `supabase_realtime` (`20260921000400_access.sql:91`) with no subscriber; drop it.
- [ ] ✅ E2E routes use different guards: `/api/e2e-test/*` checks only `BUGPING_TEST_MODE`, `/e2e-host` also
      `NODE_ENV`. One helper everywhere.
- [ ] ◐ `getDeps()` caches a rejected promise (`lib/deps.ts:28`). Only env parsing can reject there (no DB connect
      at start), so it is not a transient-error trap; clear the cache on rejection anyway.

Performance / cost:
- [ ] ✅ The landing is never cached: the root layout calls `getLocale()` and every page runs the proxy's
      `getClaims` (production sends `Cache-Control: private, no-store` for `/` and `/demo/shop`).
- [ ] ✅ The demo reloads its iframes every loop (`demo-stage.tsx:386`, `key={shopKey}`).
- [ ] ✅ `/app` layout runs 4 queries per navigation; pages repeat `usage()` / `isPro()`; wrap them in `react.cache`.

Product backlog:
- [ ] ✅ Referral attribution is written (`lib/auth/referral.ts`) but read nowhere: build the program or drop the
      `ref` cookie and column.
- [ ] ✅ Widget speaks `uk`/`es`, site and dashboard only `en`/`ru`.
- [ ] Decide the downgrade policy for extra projects; team features, search, export, email channel, Slack/Jira.

Tech debt / tests:
- [ ] ✅ No ESLint (no config, no script, not in CI); 5 files carry `eslint-disable` comments.
- [ ] ✅ Unused UI components: `badge`, `select`, `separator`, `skeleton`, `tooltip`.
- [ ] ✅ Every web unit test starts the PGlite harness (`apps/web/test/setup.ts`); split pure unit tests out.
- [ ] ✅ `adoptStyles()` duplicated in `packages/widget/src/ui/mount.ts:52` and `src/annotate/editor.ts:37`.
- [ ] ✅ Prices are typed into five message keys per locale (`landing.pricing.proPrice`, `lifetimePrice`,
      `billing.monthly`, `billing.lifetime`, `billing.switchLifetime`); use one constant.
- [ ] Web E2E runs only against `next dev`; add a smoke suite against `next build && next start`. No DOM test
      environment in `apps/web`.

Landing (stage 4), for the owner:
- [ ] ✅ Copy was written without the brainstorm's exact wording; compare with the approved texts in
      `.superpowers/brainstorm/` and fix the headline, facts, FAQ and footer tagline.
- [ ] ✅ Mobile demo is a ~0.28× canvas; the store logs one `console.error` per loop (kept on purpose); Safari < 16.4
      shows fixture text in scene 3. Manrope "preloaded but not used" warnings on `/demo/shop` — not re-checked.

Carried over: the open items in `2026-09-22-api-followups.md`, `2026-09-22-widget-followups.md`,
`2026-09-23-billing-followups.md` and `2026-09-23-dashboard-followups.md` stay open as listed there.
