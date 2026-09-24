# Dymcode → Bugping move (done 2026-09-24)

A record of the one-off production move from Dymcode to Bugping, kept for the next address change
(the custom domain `bugping.app`) and anyone wondering where the old names went.

## Where things live now

| What | Now | Before |
|---|---|---|
| Production URL | `https://bugping-app.vercel.app` | `https://dymcode.vercel.app` (now a redirect to the new URL) |
| Shared Telegram bot | `@BugP1ngbot` | `@dymcode_bot` (retired) |
| Telegram webhook | `https://bugping-app.vercel.app/api/telegram/webhook` | old host |
| Paddle webhook | `https://bugping-app.vercel.app/api/billing/webhook` | old host |
| Supabase Site URL / redirect | `https://bugping-app.vercel.app` + `/auth/callback` | old host |
| Landing widget key var | `NEXT_PUBLIC_BUGPING_PROJECT_KEY` | `NEXT_PUBLIC_DYMCODE_PROJECT_KEY` |
| DB | migration `20260924000100_bugping_default_color.sql` applied | — |

`bugping.vercel.app` is **not ours**: it belongs to an unrelated product ("BugPing — Error tracking
for vibe coders", app.bugping.io). Never add it to Supabase redirect URLs, Paddle domains or
anything else.

## What the move taught us (read before the next address change)

- **Vercel Hobby allows one `*.vercel.app` domain per project.** You can't run old and new
  side by side; editing the domain offers "Redirect old domain to new", which is what we used. So
  an address change is a single cutover, not a gradual one.
- **Vercel env vars saved as Secret can't be switched to Config**, and Vercel refuses a Secret with
  a `NEXT_PUBLIC_` prefix. Delete and re-create the variable as Config. Rule: `NEXT_PUBLIC_*` →
  Config; tokens, secrets, API keys, `DATABASE_URL`, salts → Secret.
- **Paddle has one Default payment link**, and its domain must be approved first ("Request website
  approval"). Checkout itself doesn't depend on it, so it can be switched after the cutover.
- **Env var changes don't redeploy by themselves**; a manual Redeploy picks them up. Any push to
  `main` also redeploys, so don't merge during a move.
- **Sign-in follows `NEXT_PUBLIC_APP_URL`.** A sign-in started on the old host after the redeploy
  fails (the PKCE cookie is on the old host) — sign in on the new host only.
- **A new shared bot cuts every connected chat.** Delivery uses the new bot's token, so each chat
  must press Start in the new bot (private chats) or reconnect via Integrations (groups).
- **"Unauthorized" from `telegram:set-webhook` means the token itself is wrong or revoked** (format
  can look fine). Copy it again from BotFather → `/mybots` → the bot → API Token.

## Cutover order that worked

1. Merge and deploy the renamed code first (safe with the old env values).
2. Prepare without downtime: create the bot; add the new `/auth/callback` to Supabase redirect
   URLs; rename Paddle products; update the GitHub OAuth app name and homepage; set the new env
   values in Vercel (`NEXT_PUBLIC_APP_URL`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_BOT_TOKEN`,
   `TELEGRAM_WEBHOOK_SECRET`) and in `apps/web/.env.local` — without redeploying.
3. Cut over in one go: change the Vercel domain (with redirect) → Redeploy → Supabase Site URL →
   Paddle webhook URL → `pnpm telegram:set-webhook https://<new-host>/api/telegram/webhook` (from
   `apps/web`; it reads the token and secret from `.env.local`, never prints them) → Start the bot
   and reconnect chats.
4. Smoke test on the new host: landing, GitHub and magic-link sign-in, widget → Telegram, checkout
   opens. Then remove the old Supabase redirect URL and switch Paddle's Default payment link.
5. Apply pending migrations with `supabase db push` (owner's consent; it changes production).
