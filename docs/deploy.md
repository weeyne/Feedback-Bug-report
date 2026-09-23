# Deploying Dymcode

Production runs on Vercel (the `apps/web` Next.js app) and Supabase Cloud (Postgres, Auth, Storage).
Never commit secrets: every value below is entered in the Vercel or Supabase dashboard.

## 1. Supabase

1. Migrations: `supabase link --project-ref <ref>` then `supabase db push` (already done for the dev project).
2. Authentication → URL Configuration:
   - Site URL: `https://<domain>`
   - Redirect URLs: `https://<domain>/auth/callback` (add `http://localhost:3000/auth/callback` for local dev).
3. Authentication → Providers → Email: enabled (magic link). For production mail volume configure a custom SMTP
   server (the built-in sender is rate-limited and only for testing).
4. Authentication → Providers → GitHub: see step 3.

## 2. Vercel project

1. New Project → import `weeyne/Feedback-Bug-report`.
2. Root Directory: `apps/web`. Framework preset: Next.js.
   - Settings → General → "Include files outside the Root Directory in the Build Step": enable it. The workspace
     packages (`packages/*`) and `supabase/` (migrations, PGlite bootstrap) live outside `apps/web` and are needed
     by the build and by the workspace's `pnpm` install.
3. Build command, function region and Node version live in the repo, not the dashboard:
   - `apps/web/vercel.json` sets `buildCommand` (`cd ../.. && pnpm --filter @dymcode/widget build && pnpm --filter
     @dymcode/web build`). It must be in `vercel.json`: when Vercel detects Turborepo it replaces a dashboard build
     command with plain `next build`, which skips the widget and leaves `/w/widget.js` returning 404.
   - `apps/web/vercel.json` sets `regions: ["lhr1"]` (London), next to the Supabase `eu-west-2` pooler. Each dashboard
     page makes several DB round trips, so a region mismatch is noticeable latency. Change it if the Supabase
     project moves.
   - `apps/web/package.json` sets `engines.node` to `24.x`, which Vercel reads from the Root Directory.
   - Install command: leave the default (Vercel detects pnpm from the lockfile).
   - The repo pins `packageManager: pnpm@11.20.0` in the root `package.json`, and pnpm 11 reads `allowBuilds` from
     `pnpm-workspace.yaml`. Add the environment variable `ENABLE_EXPERIMENTAL_COREPACK=1` so Vercel installs and
     uses that pnpm version instead of its own default.
4. After the first deploy, check that `https://<domain>/w/widget.js` returns JavaScript (not 404).
5. Environment variables, same names as `apps/web/.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `DATABASE_URL`: the transaction pooler URL (`…pooler.supabase.com:6543/postgres`)
   - `NEXT_PUBLIC_APP_URL`: `https://<domain>` (no trailing slash)
   - `SECRETS_ENCRYPTION_KEY`, `IP_HASH_SALT`, `CRON_SECRET`
   - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`
   - `NEXT_PUBLIC_DYMCODE_PROJECT_KEY` (optional): the public key of your own Dymcode project, for the landing widget
   - Do NOT set `DYMCODE_TEST_MODE`.
   - **Scope all of the above to Production only.** Preview deployments would otherwise read the production
     database and send magic-link/OAuth redirects to the production domain. Either leave Preview without these
     variables (previews then fail to boot, which is acceptable for now) or point a Preview-scoped copy at a
     separate Supabase project — do not scope the production values to Preview.
6. Deploy. `vercel.json` registers the daily retention cron; Vercel sends `Authorization: Bearer $CRON_SECRET`.

`NEXT_PUBLIC_SUPABASE_ANON_KEY` (the Supabase publishable/anon key) is new in phase 4 — it must also be added to
`apps/web/.env.local` for local dev (do not read or modify that file from an agent session) and to Vercel
Production, as above.

## 3. GitHub sign-in

1. GitHub → Settings → Developer settings → OAuth Apps → New OAuth App.
   - Homepage URL: `https://<domain>`
   - Authorization callback URL: `https://<project-ref>.supabase.co/auth/v1/callback`
2. Generate a client secret. Paste the Client ID and secret into Supabase → Authentication → Providers → GitHub.

## 4. Telegram webhook

After the first successful deploy:

```bash
pnpm --filter @dymcode/web telegram:set-webhook https://<domain>/api/telegram/webhook
```

The script reads `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` from `apps/web/.env.local`.

## 6. Billing (Paddle)

### Sandbox

1. Create a sandbox account at `https://sandbox-vendors.paddle.com` (no identity verification).
2. Catalog → Products: "Dymcode Pro" with two prices: $9 monthly recurring and $49 one-time. Copy both `pri_…` ids.
3. Developer tools → Authentication: create an API key and a client-side token.
4. Developer tools → Notifications: a destination `https://<domain>/api/billing/webhook` for `subscription.*`,
   `transaction.completed`, `adjustment.created`, `adjustment.updated`. Copy its secret key.
5. Checkout → Checkout settings: set the default payment link to `https://<domain>/app/billing`.
6. Apply the database migration to Supabase before deploying this code: `supabase db push` (the owner runs it, or
   the agent runs it with the owner's explicit approval). Migration `supabase/migrations/20260923000100_paddle_billing.sql`
   renames columns the webhook depends on — deploying the app before this migration lands makes the webhook fail.
7. Add `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `PADDLE_PRICE_MONTHLY`, `PADDLE_PRICE_LIFETIME`,
   `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` and `NEXT_PUBLIC_PADDLE_ENV=sandbox` to Vercel (Production; the two
   `NEXT_PUBLIC_` ones as type Config) and to `apps/web/.env.local`, then redeploy.
8. Test with card `4242 4242 4242 4242`, any future expiry, CVC `100`:
   - monthly purchase → Pro;
   - cancel in the portal → "active until";
   - Lifetime upgrade → the monthly subscription is scheduled to cancel;
   - a refund from the sandbox dashboard → Free.

### Going live

- Create the live Paddle account and complete verification and domain/site approval. The site needs pricing, Terms,
  Privacy and Refund pages; a custom domain is likely required.
- Recreate the product, prices, keys, notification destination and default payment link in the live account.
- Replace the six variables with live values (`NEXT_PUBLIC_PADDLE_ENV=production`) and redeploy.

## 7. Smoke checklist

- [ ] Sign in with GitHub; sign out; sign in with a magic link. Open the magic link in the **same browser** that
      requested it — Supabase Auth uses PKCE, so the code verifier only exists in that browser's storage.
- [ ] Create a project, copy the snippet, connect Telegram (private chat) and Discord.
- [ ] Submit feedback from the landing widget (set `NEXT_PUBLIC_DYMCODE_PROJECT_KEY` to that project and redeploy)
      or from any page with the snippet: the report arrives in Telegram with a screenshot and appears in the feed.
- [ ] Vercel → Settings → Cron Jobs lists `/api/cron/retention`.
