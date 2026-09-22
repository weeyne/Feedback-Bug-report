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
3. Build command: `cd ../.. && pnpm --filter @dymcode/widget build && pnpm --filter @dymcode/web build`.
   Install command: leave the default (Vercel detects pnpm from the lockfile).
4. Environment variables (Production and Preview), same names as `apps/web/.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `DATABASE_URL`: the transaction pooler URL (`…pooler.supabase.com:6543/postgres`)
   - `NEXT_PUBLIC_APP_URL`: `https://<domain>` (no trailing slash)
   - `SECRETS_ENCRYPTION_KEY`, `IP_HASH_SALT`, `CRON_SECRET`
   - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`
   - `NEXT_PUBLIC_DYMCODE_PROJECT_KEY` (optional): the public key of your own Dymcode project, for the landing widget
   - Do NOT set `DYMCODE_TEST_MODE`.
5. Deploy. `vercel.json` registers the daily retention cron; Vercel sends `Authorization: Bearer $CRON_SECRET`.

`NEXT_PUBLIC_SUPABASE_ANON_KEY` (the Supabase publishable/anon key) is new in phase 4 — add it to
`apps/web/.env.local` for local dev and to Vercel for Production and Preview.

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

## 5. Smoke checklist

- [ ] Sign in with GitHub; sign out; sign in with a magic link.
- [ ] Create a project, copy the snippet, connect Telegram (private chat) and Discord.
- [ ] Submit feedback from the landing widget (set `NEXT_PUBLIC_DYMCODE_PROJECT_KEY` to that project and redeploy)
      or from any page with the snippet: the report arrives in Telegram with a screenshot and appears in the feed.
- [ ] Vercel → Settings → Cron Jobs lists `/api/cron/retention`.
