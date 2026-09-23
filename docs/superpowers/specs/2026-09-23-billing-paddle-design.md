# Dymcode Phase 5: Billing with Paddle: Design

**Date:** 2026-09-23
**Status:** Approved in brainstorming, pending spec review
**Parent specs:**
- `docs/superpowers/specs/2026-09-21-dymcode-design.md` (§8 Billing, §7 Billing screen);
- `docs/superpowers/specs/2026-09-22-dashboard-design.md` (dashboard architecture, `withUser`, test mode).

This document replaces §8 of the main spec. The main spec chose Lemon Squeezy, but Lemon Squeezy cannot
pay out to a seller in Ukraine: Ukraine is missing from its bank-payout list, and Ukrainian PayPal accounts
cannot receive commercial payments. Paddle is also a Merchant of Record and pays out to Ukraine by wire
or Payoneer, so phase 5 uses Paddle Billing. Where this document and a parent disagree, this document wins.

## 1. Scope

- Paddle Billing integration:
  - **Pro monthly**: a $9/month subscription with no trial;
  - **Pro Lifetime**: a single $49 payment.
- Checkout from the dashboard billing page (Paddle.js overlay), plus a Paddle webhook, the customer portal,
  a new billing page UI, and the Terms/Privacy/Refund texts Paddle requires.
- Account deletion cancels an active subscription.
- Everything is built and verified against the **Paddle sandbox**. Switching to live Paddle means changing
  environment variables only.

**Out of scope:**
- trials, coupons, annual plans, seat or team billing, invoices inside the dashboard (the Paddle portal
  provides them);
- the live Paddle account, its verification and site approval (a separate owner task; a custom domain is
  likely required);
- usage-based pricing.

## 2. Decisions

| Topic | Decision |
|---|---|
| Provider | Paddle Billing (Merchant of Record) instead of Lemon Squeezy |
| Trial | None. The Free plan is the trial |
| Checkout | A server action creates a Paddle transaction (price, `custom_data.user_id`, known `customer_id`) and returns only its id; Paddle.js opens the overlay by `transactionId` |
| Source of truth | Only signed webhooks change `subscriptions`. `checkout.completed` in the browser only starts polling |
| Pro derivation | `public.is_pro()` stays the single place Pro is derived |
| Lifetime over monthly | After a Lifetime purchase, the active monthly subscription is cancelled at the end of its billing period (no second charge, no proration refund) |
| Self-service | The Paddle customer portal (cancel, card update, receipts); no custom screens |
| Unconfigured billing | If the Paddle env vars are absent, billing is disabled: the billing page keeps the "Payments are coming soon" dialog. Local dev, CI and E2E do not need Paddle credentials |

## 3. Data model

One migration, `supabase/migrations/<ts>_paddle_billing.sql`:

- **Rename the Lemon Squeezy columns** of `public.subscriptions`, keeping their unique constraints. No
  rows use them yet.
  - `ls_customer_id` → `paddle_customer_id`;
  - `ls_subscription_id` → `paddle_subscription_id` (monthly only);
  - `ls_order_id` → `paddle_transaction_id` (Lifetime only).
- **Add two columns:**
  - `paddle_occurred_at timestamptz`: the `occurred_at` of the Paddle event that last wrote the row. It
    guards against out-of-order delivery;
  - `cancel_at_period_end boolean not null default false`: true when the subscription's
    `scheduled_change.action = 'cancel'`.
- **`plan`** keeps the enum `pro_monthly` / `pro_lifetime`.
- **`status`** stores the raw value:
  - monthly: the Paddle subscription status (`active`, `trialing`, `past_due`, `paused`, `canceled`);
  - Lifetime: `paid` or `refunded`.
- **`is_pro(uid)`** is replaced. It returns true if the user has a row with:
  - `plan = 'pro_lifetime' and status = 'paid'`, or
  - `plan = 'pro_monthly' and status in ('active', 'trialing', 'past_due')`.

  Paddle keeps a cancelled subscription `active` until the period ends and only then sends `canceled`, so
  no date check is needed. `trialing` is accepted for safety although no trial is sold.
- **Unchanged:** RLS on `subscriptions` (no client access), `current_user_is_pro()` and its grants.
- **Test harness:** `grantPro(db, userId, opts)` in `supabase/tests/src/fixtures.ts` is updated to the new
  statuses. `pro_lifetime/paid` stays the default; `pro_monthly` uses `active`. Existing DB tests for
  `is_pro()` are updated to the new truth table.

## 4. Configuration

New variables, all optional as a group. Billing is enabled only when every one of them is set:

| Variable | Scope | Meaning |
|---|---|---|
| `PADDLE_API_KEY` | server | Paddle API key |
| `PADDLE_WEBHOOK_SECRET` | server | Secret of the notification destination |
| `PADDLE_PRICE_MONTHLY` | server | Price id `pri_…` of the $9/month price |
| `PADDLE_PRICE_LIFETIME` | server | Price id `pri_…` of the $49 one-time price |
| `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` | public | Client-side token for Paddle.js |
| `NEXT_PUBLIC_PADDLE_ENV` | public | `sandbox` or `production` |

- **API base URL:** `https://sandbox-api.paddle.com` when `NEXT_PUBLIC_PADDLE_ENV = sandbox`, else
  `https://api.paddle.com`.
- **Validation:** `lib/env.ts` validates the group, and a partially configured group is an error. It
  exposes `billingConfig(env)`, which returns `null` when billing is disabled.

## 5. Paddle API client (`apps/web/lib/billing/paddle.ts`)

A small typed client with injected `fetch`. It sends a bearer API key and a 10 s timeout. Non-2xx responses
throw a `PaddleError` with the status and Paddle's error code. The error never carries the API key.

- `createTransaction({ priceId, userId, customerId? })`:
  - calls `POST /transactions` with `items: [{ price_id, quantity: 1 }]`, `custom_data: { user_id }` and
    `customer_id` when known;
  - returns `{ id }`.
- `cancelSubscription(id, when: 'next_billing_period' | 'immediately')`:
  - calls `POST /subscriptions/{id}/cancel`;
  - treats "already cancelled / already scheduled" as success.
- `createPortalSession(customerId, subscriptionIds)`:
  - calls `POST /customers/{id}/portal-sessions`;
  - returns the `general.overview` URL.

## 6. Checkout

**Server action `startCheckout(plan: 'monthly' | 'lifetime')`**. It is a thin wrapper over the use case
`lib/billing/checkout.ts`:

1. `requireUser()`; if billing is disabled, return `billing.unavailable`.
2. Rate limit: `hit_rate_limit('dashboard:checkout:<userId>', 10, 60)` → `errors.rateLimited`.
3. Read the user's subscription rows through the service connection. These are the user's own rows, which
   the allowlist already covers for "the user's own usage row / Pro status". Then apply the rules:
   - an active Lifetime (`paid`) → `billing.alreadyLifetime`;
   - `plan = 'monthly'` while a monthly subscription is Pro-granting → `billing.alreadySubscribed`;
   - `plan = 'lifetime'` while monthly is active → allowed (upgrade).
4. `customerId` = the `paddle_customer_id` of any of the user's rows, if present.
5. Call `createTransaction` and return `{ ok: true, transactionId }`. A Paddle failure is logged and
   returns `billing.checkoutFailed`.

**Client (`components/app/billing/*`):**
- Load `https://cdn.paddle.com/paddle/v2/paddle.js` once. Call `Paddle.Environment.set('sandbox')` in the
  sandbox, then `Paddle.Initialize({ token, eventCallback })`.
- Open the overlay with
  `Paddle.Checkout.open({ transactionId, customer: { email }, settings: { displayMode: 'overlay', locale } })`.
  The locale is `ru` or `en` from the UI locale.
- On `checkout.completed`:
  - close the overlay and show "Payment received, activating Pro…";
  - poll a server action `billingStatus()` every 2 s for at most 60 s until `pro` is true;
  - on success refresh the page. On timeout show "Payment received; activation can take a couple of
    minutes — refresh later".
- Closing the overlay without paying does nothing.

## 7. Webhook `POST /api/billing/webhook`

Runtime `nodejs`, `force-dynamic`. The body is read raw before JSON parsing.

**Signature:**
- `Paddle-Signature: ts=<unix>;h1=<hex>[;h1=<hex>…]`;
- expected = HMAC-SHA256(`PADDLE_WEBHOOK_SECRET`, `${ts}:${rawBody}`), compared with each `h1` using
  `timingSafeEqual`;
- reject with 401 when the header is missing or malformed, no `h1` matches, or `|now − ts| > 300 s`;
- when billing is disabled, return 404.

**Envelope:** `{ event_id, event_type, occurred_at, data }`. Parse it with zod, keeping only the fields
used. An unknown `event_type` returns 200 and is ignored.

**Resolving the user** of a subscription or transaction, in order:
1. `data.custom_data.user_id`, if it is a UUID of an existing profile;
2. the `user_id` of an existing row with the same `paddle_subscription_id`;
3. the `user_id` of an existing row with the same `paddle_customer_id`.

If none resolves, log it and return **500**, so Paddle retries later: the transaction and subscription
events can arrive in either order. If the resolved profile no longer exists (deleted account), log it and
return 200.

**Events:**
- **`subscription.created | updated | activated | canceled | past_due | paused | resumed | trialing`**
  - Handle them only when an item's price is `PADDLE_PRICE_MONTHLY`.
  - Upsert `pro_monthly` by `paddle_subscription_id` with:
    - `status`, `paddle_customer_id`;
    - `current_period_end = data.current_billing_period.ends_at` (null when absent);
    - `cancel_at_period_end = (data.scheduled_change?.action = 'cancel')`;
    - `paddle_occurred_at = occurred_at`.
  - The update applies only if the stored `paddle_occurred_at` is null or older.
- **`transaction.completed`**
  - **Lifetime price:** upsert `pro_lifetime` by `paddle_transaction_id` with `status = 'paid'`,
    `paddle_customer_id` and `paddle_occurred_at`, using the same ordering guard. Then, for each of the
    user's `pro_monthly` rows whose status is Pro-granting and `cancel_at_period_end = false`, call
    `cancelSubscription(id, 'next_billing_period')`. On a Paddle failure return 500; the retry is safe.
  - **Monthly price:** if no row exists for `data.subscription_id`, insert a `pro_monthly` row with status
    `active` and `paddle_occurred_at = null` so the user mapping exists before or without
    `subscription.created`; the null timestamp lets any subscription event overwrite it. Otherwise do
    nothing: the subscription events own the status.
- **`adjustment.created | updated`**
  - Act only when `status = 'approved'` and `data.transaction_id` matches a `pro_lifetime` row.
  - `action = 'refund'` with `type = 'full'`, or `action = 'chargeback'` → set `status = 'refunded'`
    (ordering guard applies).
  - Partial refunds and credits leave the row unchanged. Monthly refunds are reflected by Paddle's
    subscription events.

**Errors:** DB or Paddle failures → 500 with `console.error('[billing/webhook]', …)`. Logs never include
the payload's card details, emails or secrets: log `event_id`, `event_type` and ids only.

## 8. Billing page and portal

**`/app/billing`** (Server Component). It reads `billingOverview(userId)` through the service connection
(the user's own rows):

- **Billing disabled:** the current phase-4 page, with the "coming soon" dialog.
- **Free:**
  - the usage bar "N / 20 this month";
  - two cards:
    - "Pro — $9/month";
    - "Lifetime — $49".

    Each card lists the features (unlimited projects and reports, own Telegram bot, no badge, custom CSS,
    1-year screenshot retention) and has a checkout button;
  - the note "Tax may apply at checkout".
- **Monthly, `active`:**
  - "Pro · next payment on {date}", or "Pro · active until {date}" when `cancel_at_period_end`;
  - "Manage subscription";
  - "Switch to Lifetime — $49".
- **Monthly, `past_due`:** a warning "We couldn't charge your card — update your payment method", plus
  "Manage subscription".
- **Lifetime:** "Pro Lifetime" and "Billing and receipts" (the portal).
- **After `?checkout=success`:** the activation polling state from §6. This state is also shown when
  returning from the overlay.

**Server action `openPortal()`:**
- `requireUser()`; rate limit 10/min;
- find the user's `paddle_customer_id` (and active subscription ids), then call `createPortalSession`;
- return the URL. The client opens it in a new tab.
- No customer id → `billing.noCustomer`.

**Landing pricing** buttons link to `/app/billing`, which requires sign-in and so redirects to `/login`
first.

**i18n:** every new string in `messages/en.json` and `ru.json` under `billing.*`.

## 9. Legal pages

- **Terms:** add a paragraph with Paddle's required wording: "Our order process is conducted by our online
  reseller Paddle.com. Paddle.com is the Merchant of Record for all our orders. Paddle provides all
  customer service inquiries and handles returns."
- **Privacy:** add "Payments are processed by Paddle.com; we do not see or store card details."
- **New `/refund` page** (Refund Policy), en and ru, marked as a draft:
  - full refunds within 14 days of the first payment of a subscription or of a Lifetime purchase;
  - after that, a monthly subscription can be cancelled at any time and stays active until the end of the
    paid period;
  - refunds are requested through Paddle (the receipt email) or by contacting us.

  Add it to the footer and the sitemap.

## 10. Account deletion

`deleteAccount` (phase 4) gains a first step, run when billing is enabled:
- for every Pro-granting `pro_monthly` row of the user, call `cancelSubscription(id, 'immediately')`;
- if any call fails, return `errors.generic` and delete nothing.

Lifetime rows need no action. The subscription rows disappear with the profile (FK cascade).

## 11. Testing

**Unit and integration** (Vitest on PGlite; CI repeats DB tests on real Supabase):
- **Signature:**
  - a valid signature passes;
  - a wrong secret, a tampered body, a stale `ts`, a missing or malformed header are rejected;
  - a header with multiple `h1` values passes.
- **`is_pro()`** truth table for every plan × status.
- **Webhook fixtures** (JSON files under `apps/web/test/paddle/`), with `is_pro()` asserted after each:
  - subscription lifecycle: created → past_due → active → scheduled cancel (`cancel_at_period_end`) →
    canceled; paused → resumed;
  - Lifetime `transaction.completed` → Pro, and the active monthly subscription is cancelled with
    `next_billing_period` (fake fetch records the call); a failing cancel call → 500;
  - a full refund and a chargeback → Free; a partial refund → still Pro;
  - replaying the same event is a no-op; an older event after a newer one is ignored;
  - unresolvable user → 500; deleted profile → 200;
  - billing disabled → 404.
- **`startCheckout`:**
  - the three rules;
  - the rate limit;
  - `custom_data.user_id` is sent and a known `customer_id` is reused;
  - a Paddle error maps to `billing.checkoutFailed`.
- **`openPortal`:** it only uses the caller's customer id; `billing.noCustomer`.
- **`deleteAccount`:** it cancels immediately; a failed cancel leaves the account intact.
- **Env:** a partial Paddle group is rejected; the full group enables billing; no group disables it.
- **i18n parity and ICU validity:** the existing tests cover the new keys.

**E2E** (Playwright, test mode). Test mode sets fake Paddle variables, so billing is enabled, and routes
Paddle API calls to the outbox fetch. The E2E:
1. signs in;
2. posts a signed `transaction.completed` (Lifetime) fixture for that user to `/api/billing/webhook`;
3. asserts that the billing page shows "Pro Lifetime" and that the Pro-only settings (hide badge, custom
   CSS) are enabled.

The real Paddle.js overlay is verified manually in the sandbox.

## 12. Setup with the owner (sandbox), after implementation

1. Create a sandbox account at `sandbox-vendors.paddle.com`.
2. Catalog → Products: "Dymcode Pro" with two prices: $9 monthly recurring and $49 one-time. Copy both
   price ids.
3. Developer tools → Authentication: an API key and a client-side token.
4. Developer tools → Notifications: a destination `https://dymcode.vercel.app/api/billing/webhook` for the
   events `subscription.*`, `transaction.completed`, `adjustment.created` and `adjustment.updated`. Copy
   its secret.
5. Checkout settings: set the default payment link to `https://dymcode.vercel.app/app/billing`.
6. Add the six variables to Vercel (Production) and `apps/web/.env.local`, then redeploy.
7. Live check with the test card `4242 4242 4242 4242`:
   - monthly purchase → Pro;
   - cancel in the portal → "active until";
   - Lifetime upgrade → monthly scheduled to cancel;
   - a refund from the sandbox dashboard → Free.

`docs/deploy.md` gains a "Billing (Paddle)" section with these steps and the later switch to live.
