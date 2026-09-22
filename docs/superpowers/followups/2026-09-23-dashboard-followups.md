# Dashboard follow-ups (after phase 4 final-review fix wave)

## Before public launch
- No zod validation on the raw `FormData`/action arguments in `saveCustomBot`, `saveDiscord`, `sendTest`,
  `disconnectIntegration`, `deleteProject` and `deleteAccount`: a non-string argument (e.g. a crafted client call)
  throws instead of returning `{ ok: false }`, surfacing a 500 to the browser.
- `deleteProject`/`deleteAccount` list Storage paths for the screenshots to remove, then delete the DB rows. If
  feedback arrives on that project between the listing and the delete, its screenshot is never listed and is
  orphaned in Storage — the retention cron only looks at rows still in the database, so it can never find it.
- Magic links only work in the browser that requested them (Supabase Auth PKCE stores the code verifier in that
  browser's local storage). A user who opens the email on a different device gets `callbackFailed` with no
  explanation why. Consider switching to `token_hash` + `verifyOtp`, which does not require the same browser.
- No rate-limit or stranger-denial (non-owner) tests for `sendTest`, `saveDiscord` and `saveCustomBot` — the
  10/min limit and the ownership check are implemented but not covered.
- The Discord webhook URL is stored and displayed as plaintext (unlike the Telegram bot token, which is
  encrypted). A leaked webhook URL lets anyone post to the channel.

## Can wait
- Component tests for the feedback feed filters (spec §8) are missing; no `.test.tsx` file exists in the repo yet.
- `IntegrationStatusLabel`'s `lastError` string comes straight from the provider (Telegram/Discord API error text)
  and is always English, even in the Russian UI.
- The mobile nav `Sheet` has no `SheetTitle`, which Base UI/Radix requires for accessible names; it likely warns
  in the console and screen readers announce an unlabeled dialog.
- The integrations status poll (`integrationStatusAction`, every 2s while a Telegram link is pending) has no
  in-flight guard — a slow response can overlap with the next tick's request.
- `getDeps()` caches its promise; if the first call rejects (e.g. a transient env/DB error), the rejected promise
  stays cached and every subsequent call fails until the process restarts.
- The landing page's plan prices are hardcoded copy in the component rather than driven by a single source of
  truth (config or i18n data), so a price change means editing JSX.
- The feedback feed's keyset pagination cursor has no tiebreaker column for rows with identical
  `created_at`/index values; ties can be skipped or duplicated across pages. Add `id` to the index/cursor.
- `submit.test.ts`'s `throwingDb.transaction` mock spreads the base `query` implementation and then overrides it;
  the override makes the spread redundant and is easy to misread as intentional passthrough.
