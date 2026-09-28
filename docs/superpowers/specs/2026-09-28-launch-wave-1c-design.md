# Launch wave 1c — billing before Paddle live — design

Part 1c of wave 1 in `docs/superpowers/followups/2026-09-28-launch-review.md`; source list:
`docs/superpowers/followups/2026-09-23-billing-followups.md` ("Before going live"). Owner approved the scope on
2026-09-28.

## In scope

### 1. Webhook body cap

`handleBillingWebhook` (`apps/web/lib/billing/webhook.ts`) rejects bodies over **64 KiB** with `413 { error:
'payload too large' }` before verifying the signature: first by `Content-Length` when present, then by the length of
the text it read. Paddle events are a few KB.

### 2. Paddle key / environment consistency

`billingConfig(env)` (`apps/web/lib/billing/config.ts`) returns `null` (billing disabled) and logs one
`console.error('[billing] Paddle keys do not match NEXT_PUBLIC_PADDLE_ENV=<env>; billing is disabled')` when:

- the API key starts with `pdl_live_` and the environment is `sandbox`, or starts with `pdl_sdbx_` and the
  environment is `production`; a key with neither prefix is not judged;
- the client token starts with `test_` and the environment is `production`, or `live_` and it is `sandbox`.

The site keeps working; billing pages show their existing "disabled" state and the webhook answers 404. The log line
never contains key values. It is written at most once per process.

### 3. Per-user serialisation of webhook events

The whole event dispatch in `handleBillingWebhook` runs inside `deps.db.transaction`, and every handler that resolves
a user takes `select pg_advisory_xact_lock(hashtext($1))` with `'billing:' || userId` right after `resolveUser`,
before reading or writing that user's rows or calling Paddle for them (`onSubscription`, both paths of
`onTransactionCompleted`). Events for one user are then processed one at a time; the lock is released at commit or
rollback. `RetryLater` and other errors roll the transaction back as before (500, Paddle retries). Paddle API calls
stay inside the transaction; at our volume holding one connection for up to the 10 s Paddle timeout is acceptable.
`onAdjustment` takes no lock (it writes one Lifetime row by transaction id, guarded by `paddle_occurred_at`).

### 4. Mark duplicates as cancelling

After a successful `cancelSubscription(id, 'next_billing_period')` — in `cancelIfDuplicate` and in the Lifetime path
of `onTransactionCompleted` — set `cancel_at_period_end = true` on that row (without touching
`paddle_occurred_at`), so a late event for the other subscription no longer sees two active duplicates. An
`'immediately'` cancel changes nothing locally (Paddle sends `subscription.canceled`).

### 5. `chargeback_reverse`

An approved adjustment with `action = 'chargeback_reverse'`:

- Lifetime (no `subscription_id`): the `pro_lifetime` row for that transaction goes from `refunded` back to `paid`,
  with the same `paddle_occurred_at` ordering guard as refunds; no row → `RetryLater` like refunds.
- Monthly (`subscription_id` set): the subscription was cancelled when the chargeback arrived and cannot be revived;
  log `console.warn('[billing/webhook] chargeback reversed for a cancelled subscription', eventId, subscriptionId)`
  for a manual decision and answer 200.

### 6. Documentation

- `docs/superpowers/specs/2026-09-23-billing-paddle-design.md` gets a short "Amendments (2026-09-28)" section:
  checkout and portal resolve the customer from the verified session email (`findCustomer` / `ensureCustomer`);
  duplicate and refunded monthly subscriptions are cancelled from the webhook; account deletion refuses when billing
  is disabled but a paid subscription exists; items 1–5 above.
- `docs/superpowers/followups/2026-09-23-billing-followups.md`: mark items 1–5 done (wave 1c) and move the rest under
  "Deferred" with the reason: email change (the app has no email change), customer-id fallback (harmless today;
  removing it can break legitimate events), archived customers (manual unarchive), the `past_due` check (owner runs
  it in the sandbox, steps in `docs/deploy.md`).
- `docs/deploy.md` §5 gets a "Before going live: past_due check" list: in the sandbox, subscribe with card
  `4242 4242 4242 4242`, switch the payment method to a declining test card from Paddle's testing docs so the
  next renewal fails, wait for `past_due`, buy
  Lifetime on the same account, and confirm the monthly subscription ends up `canceled` and the webhook log shows no
  repeated failures.

## Out of scope

Email-change sync with Paddle, removing the customer-id fallback in `resolveUser`, unarchiving archived Paddle
customers.

## Constraints

- English code/comments/commits/docs; trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- No new dependencies, no migrations.
- Existing webhook behaviour and tests stay green; the fixture helper `adjustmentEvent` may widen its `action` type.

## Testing

Unit (Vitest, PGlite): 413 for an oversized body (header and actual length); config null + one log for each mismatch
(values never logged), still valid for matching keys and for unprefixed keys; the lock query is issued with
`billing:<userId>` inside a transaction for subscription and transaction events (a recording `Db` wrapper);
`cancel_at_period_end` set after a next-period duplicate cancel and after a Lifetime purchase, not after an immediate
cancel; `chargeback_reverse` restores a refunded Lifetime, retries when the row is missing, ignores an older event, and
only warns for a subscription.
