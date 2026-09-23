# Billing follow-ups (after the phase 5 final-review fix wave)

## Before going live
- **Verify in the Paddle sandbox that a `past_due` subscription can be cancelled `immediately`.** Paddle's
  cancellation guide says a `past_due` subscription cannot be changed. If Paddle refuses, the webhook paths that cancel
  it (a duplicate after Lifetime, a refund, a deleted profile) return 500 until the retries run out, while dunning keeps
  trying to charge the card. The same applies to account deletion for a `past_due` user. Also record Paddle's error
  when cancelling a subscription that already has a scheduled cancellation.
- **Narrow the "both duplicates cancelled" race cheaply.** After a successful `next_billing_period` cancel in
  `cancelIfDuplicate`, set `cancel_at_period_end = true` on that row (without touching `paddle_occurred_at`), so a
  late event for the other subscription no longer sees two active duplicates. The advisory lock below closes it fully.
- **Email changes.** Portal access and checkout resolve the Paddle customer from the current session email. A user
  who changes their account email after buying gets `billing.noCustomer`, or a portal without their subscription, and
  a new checkout creates a second Paddle customer. Update the Paddle customer's email when the account email changes.
- **Webhook customer-id fallback.** `resolveUser` still falls back to the stored `paddle_customer_id` when
  `custom_data` is absent. An attacker can blank `custom_data` to attribute a subscription they pay for to another
  user's row. This is harmless today (they pay; duplicates are cancelled), but it trusts the same client-influenced id
  that the checkout and portal no longer trust.
- **Amend the phase 5 spec** (`2026-09-23-billing-paddle-design.md` §5–§8). Checkout and the portal now always resolve
  the customer from the verified session email (`findCustomer` / `ensureCustomer`). Duplicate or refunded monthly
  subscriptions are cancelled from the webhook, and account deletion refuses when billing is disabled but a paid
  subscription exists.
- **Environment consistency check.** Nothing checks that the Paddle keys match `NEXT_PUBLIC_PADDLE_ENV`: a live
  API key (`pdl_live_…`) or client token (`live_…`) with `NEXT_PUBLIC_PADDLE_ENV=sandbox`, or the reverse, only
  fails at the first Paddle call. `parseEnv` could compare the key prefixes with the environment.
- **Archived Paddle customers.** `GET /customers?email=` returns active customers only. If the customer for a
  user's email is archived in Paddle, `ensureCustomer` finds nothing, the create call returns
  `customer_already_exists`, the second lookup finds nothing again and checkout fails (`billing.checkoutFailed`);
  `findCustomer` returns null and the portal shows `billing.noCustomer`. Unarchiving the customer in Paddle fixes
  it; the code could also look up `status=archived` and unarchive.
- **Per-user advisory lock for concurrent webhooks.** Events for one user are processed concurrently. Two monthly
  subscriptions whose events interleave (or an event for the first subscription that arrives between the
  cancellation of a duplicate and Paddle's follow-up `subscription.updated`) can make both look like duplicates, so
  both get cancelled. A `pg_advisory_xact_lock` on the user id around the handler (in a transaction) would
  serialize them. Until then, such a case needs a manual fix in the Paddle dashboard.
- **`chargeback_reverse` is not handled.** A reversed chargeback leaves a Lifetime row `refunded` and a monthly
  subscription cancelled; the customer has paid but has no Pro. Restoring it needs a manual row update today.
- **Webhook body size cap.** `/api/billing/webhook` reads the whole body before verifying the signature. A cap
  (Paddle events are a few KB) would stop large unauthenticated bodies from being buffered.

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
