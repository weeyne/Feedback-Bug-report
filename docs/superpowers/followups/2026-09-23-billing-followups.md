# Billing follow-ups (after the phase 5 final-review fix wave)

## Done in wave 1c (2026-09-28)
- **Narrow the "both duplicates cancelled" race cheaply.** After a successful `next_billing_period` cancel (a
  duplicate, or the monthly subscriptions cancelled by a Lifetime purchase) the row gets `cancel_at_period_end = true`,
  so a late event for the other subscription no longer sees two active duplicates.
- **Per-user advisory lock for concurrent webhooks.** Each event runs in one transaction, and `subscription.*` and
  `transaction.completed` take `pg_advisory_xact_lock` on `billing:<userId>`, so events for one user are processed one
  at a time.
- **`chargeback_reverse`.** An approved reversal restores a `refunded` Lifetime row to `paid`. For a monthly
  subscription, which was cancelled by the chargeback and cannot be revived, the webhook only logs a warning for a
  manual decision.
- **Webhook body size cap.** Bodies over 64 KiB get 413 before the signature check.
- **Environment consistency check.** `billingConfig` disables billing, with one log line, when the Paddle key or client
  token prefix names the other environment than `NEXT_PUBLIC_PADDLE_ENV`.
- **Amend the phase 5 spec.** `2026-09-23-billing-paddle-design.md` has an "Amendments (2026-09-28)" section.

## Deferred
- **Verify in the Paddle sandbox that a `past_due` subscription can be cancelled `immediately`.** Paddle's
  cancellation guide says a `past_due` subscription cannot be changed. If Paddle refuses, the webhook paths that cancel
  it (a duplicate after Lifetime, a refund, a deleted profile) return 500 until the retries run out, while dunning keeps
  trying to charge the card. The same applies to account deletion for a `past_due` user. Reason for deferring: the owner
  runs this in the sandbox; the steps are in `docs/deploy.md` ("Before going live: sandbox checks", check b). Check c in the same section
  records Paddle's error for cancelling a subscription that already has a scheduled cancellation.
- **A second next-period cancel after a rolled-back transaction.** This now happens only when a database write fails
  after Paddle accepted a cancel, or in the duplicate rule (`cancelIfDuplicate`), whose failure rolls back. A failed
  cancel on a Lifetime purchase commits the grant and the cancels that succeeded, so the retry skips the marked rows.
  After such a rollback, Paddle's retry may re-send
  `cancelSubscription(id, 'next_billing_period')` for a subscription that already has a scheduled cancel. Paddle's
  error code for that (likely `subscription_locked_pending_changes`) is unconfirmed, and `cancelSubscription` throws on
  it, so the retry answers 500 again. The extra 500 and retry are bounded: they end once Paddle's
  `subscription.updated` with the scheduled cancel is processed. Hardening if it matters: on that code, GET the
  subscription and treat `scheduled_change.action === 'cancel'` as done. Do not treat the code itself as success: it
  may also be returned for a scheduled pause (unverified; sandbox check c records the real code).
- **`chargeback_reverse` and a later monthly.** A `chargeback_reverse` that restores Lifetime does not cancel a
  monthly subscription bought after the chargeback. It is cancelled only at that subscription's next event (possibly
  after one more charge).
- **Email changes.** Portal access and checkout resolve the Paddle customer from the current session email. A user
  who changes their account email after buying gets `billing.noCustomer`, or a portal without their subscription, and
  a new checkout creates a second Paddle customer. Update the Paddle customer's email when the account email changes.
  Reason for deferring: the app has no email change today.
- **Webhook customer-id fallback.** `resolveUser` still falls back to the stored `paddle_customer_id` when
  `custom_data` is absent. An attacker can blank `custom_data` to attribute a subscription they pay for to another
  user's row. This is harmless today (they pay; duplicates are cancelled), but it trusts the same client-influenced id
  that the checkout and portal no longer trust. Reason for deferring: removing the fallback can break legitimate
  events that arrive without `custom_data`.
- **Archived Paddle customers.** `GET /customers?email=` returns active customers only. If the customer for a
  user's email is archived in Paddle, `ensureCustomer` finds nothing, the create call returns
  `customer_already_exists`, the second lookup finds nothing again and checkout fails (`billing.checkoutFailed`);
  `findCustomer` returns null and the portal shows `billing.noCustomer`. Unarchiving the customer in Paddle fixes
  it; the code could also look up `status=archived` and unarchive. Reason for deferring: rare, and the manual
  unarchive in Paddle is enough for now.

## Can wait
- **`?checkout=success` state (spec §8) is not implemented.** The overlay checkout never leaves the page, so the
  activation polling starts from the `checkout.completed` event instead. It is only needed if a hosted checkout or
  a payment link that redirects back is ever used.
- **Constraint names.** The unique constraints on the renamed columns are still named
  `subscriptions_ls_subscription_id_key` / `subscriptions_ls_order_id_key` (Lemon Squeezy). Harmless, but
  confusing; a migration could rename them.
- **Missing tests:**
  - empty-string Paddle variables (`PADDLE_API_KEY=""` etc.) in `parseEnv` / `billingConfig`;
  - non-JSON Paddle responses (an HTML error page from a proxy) in the Paddle client;
  - a `pro_lifetime` row is left untouched (no Paddle call) when an account with billing enabled is deleted.
- **Shared test id.** The Lifetime "Billing and receipts" button and the monthly "Manage subscription" button both
  use `data-testid="billing-manage"`; tests cannot tell them apart.
- **One landing CTA.** The landing pricing section has a single "Choose a plan" button (`landing-pricing-cta`) under
  the three cards instead of a button per plan (spec §8: "Landing pricing buttons"). It links to `/app/billing`,
  where the user picks the plan again.
