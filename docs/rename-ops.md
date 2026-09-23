# Owner checklist: renaming Dymcode to Bugping

This is a manual, click-by-click checklist for the project owner. It covers everything that lives
outside the code: the Telegram bot, the Vercel project, environment variables, Supabase auth
settings, the GitHub OAuth app, and Paddle sandbox billing.

Do the steps **in this order**. The order matters: it keeps the live site at
`https://dymcode.vercel.app` working for existing users while the move to `bugping.vercel.app`
happens, and it avoids a window where auth, billing or the Telegram bot are broken.

Nothing in this checklist is done by the coding agent. No secret (bot token, webhook secret,
API key) is ever typed into chat with an AI assistant — only into the Vercel/Supabase/Paddle/
BotFather dashboards, or read from your local `apps/web/.env.local` by the commands below.

---

## 1. Create the new Telegram bot (BotFather)

1. Open a chat with **@BotFather** in Telegram.
2. Send `/newbot`.
3. When asked for a name, send `Bugping`.
4. When asked for a username, send `bugping_bot` (must end in `bot`; if it's taken, `bugping_bot`
   should still be free — if not, pick a close variant and remember it, you'll use it everywhere
   below instead of `bugping_bot`).
5. BotFather replies with a message containing the line `Use this token to access the HTTP API:`
   followed by a token that looks like `123456789:AA...`. Copy that token somewhere safe (a
   password manager, not a chat) — you'll paste it into Vercel in step 3. Do not paste it into any
   AI chat.
6. Keep the old bot (`@dymcode_bot`) running for now — do not delete or rename it yet. It keeps
   serving existing installs until step 7 finishes the cutover.

## 2. Vercel: rename the project and add the new domain

1. Go to your Vercel dashboard → the `dymcode` project → **Settings** → **General**.
2. Under **Project Name**, change `dymcode` to `bugping`, then save.
3. Go to **Settings** → **Domains**.
4. Add `bugping.vercel.app`. Vercel should offer it automatically once the project is renamed
   (a project named `bugping` gets `bugping.vercel.app` for free); if it's not offered
   automatically, add it manually.
5. Make sure `dymcode.vercel.app` is still listed. If Vercel doesn't keep it as a redirect
   automatically, add it back and set it to **redirect** to `bugping.vercel.app` (there is a
   "Redirect to" option next to each domain). This keeps old links and the old widget embed
   working while people migrate.
6. Do not remove `dymcode.vercel.app` yet — that happens only after step 8's smoke test passes.

## 3. Vercel: update environment variables

Go to **Settings** → **Environment Variables** (Production scope, same scope the existing
variables use).

1. Find `NEXT_PUBLIC_DYMCODE_PROJECT_KEY`. Add a new variable
   `NEXT_PUBLIC_BUGPING_PROJECT_KEY` with the same value, then delete
   `NEXT_PUBLIC_DYMCODE_PROJECT_KEY` (Vercel does not support renaming a variable in place).
2. Set `NEXT_PUBLIC_APP_URL` to `https://bugping.vercel.app` (edit the existing variable).
3. Set `TELEGRAM_BOT_USERNAME` to `bugping_bot` (edit the existing variable).
4. Set `TELEGRAM_BOT_TOKEN` to the token BotFather gave you in step 1 (edit the existing
   variable; paste it directly into the Vercel value field, never into chat).
5. Generate a new `TELEGRAM_WEBHOOK_SECRET`. Any long random string works — for example, run
   this locally and copy its output:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   Paste the result into the `TELEGRAM_WEBHOOK_SECRET` variable in Vercel.
6. Make the same four changes (project key variable name, `TELEGRAM_BOT_USERNAME`,
   `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`) in your local `apps/web/.env.local` file, by
   hand, in your own editor. No AI assistant reads or edits that file.
7. Save the Vercel changes. Do not redeploy yet — finish step 4, 5 and 6 first so one redeploy in
   step 7 picks up everything at once.

## 4. Supabase: update auth URLs

1. Open your Supabase project → **Authentication** → **URL Configuration**.
2. Set **Site URL** to `https://bugping.vercel.app`.
3. Under **Redirect URLs**, add `https://bugping.vercel.app/auth/callback`.
4. Leave the old `https://dymcode.vercel.app/auth/callback` entry in the list for now — remove it
   only in step 8, after the smoke test confirms the new domain works end to end.

## 5. GitHub: rename the OAuth App

1. Go to GitHub → your account **Settings** → **Developer settings** → **OAuth Apps** → the app
   used for sign-in.
2. Change **Application name** to `Bugping`.
3. Change **Homepage URL** to `https://bugping.vercel.app`.
4. Leave **Authorization callback URL** exactly as it is — it points at your Supabase project
   (`https://<project-ref>.supabase.co/auth/v1/callback`), which does not change in this rename.
5. Save.

## 6. Paddle (sandbox): rename products and update destinations

1. Log in to your Paddle **sandbox** account at `https://sandbox-vendors.paddle.com`.
2. Go to **Catalog** → **Products**. Open the product currently named "Dymcode Pro" (or whatever
   your monthly/lifetime products are named) and rename it to **Bugping Pro**. If Lifetime is a
   separate product, rename it to **Bugping Lifetime**.
3. Go to **Checkout** → **Checkout settings**. Update the default payment link / approved domain
   from `dymcode.vercel.app` to `bugping.vercel.app`.
4. Go to **Developer tools** → **Notifications**. Open the existing webhook destination and
   change its URL to `https://bugping.vercel.app/api/billing/webhook`.
5. Nothing else in Paddle needs to change — the API key, webhook secret and price ids stay the
   same.

## 7. Redeploy and cut over the Telegram webhook

1. Back in Vercel, trigger a redeploy of the `bugping` project (Deployments → the three-dot menu
   on the latest deployment → **Redeploy**, or push a commit) so it picks up every environment
   variable changed in step 3.
2. Once the deploy finishes, register the new bot's webhook. The script that does this is
   `apps/web/scripts/set-telegram-webhook.mjs`. It reads two variables —
   `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` — first from `apps/web/.env.local` (if that
   file exists next to the script) and then from your shell's actual environment, with the shell
   environment taking priority over the file. It never prints either value; it only prints
   whether the call to Telegram succeeded. Make sure both values in `apps/web/.env.local` already
   match what you put in Vercel in step 3, then run, from `apps/web`:
   ```bash
   pnpm telegram:set-webhook https://bugping.vercel.app/api/telegram/webhook
   ```
   You should see `Webhook set to https://bugping.vercel.app/api/telegram/webhook`. Nothing
   secret is typed into this command or into chat — the script reads the token and secret from
   the environment.
3. The old bot (`@dymcode_bot`) can no longer deliver feedback once the new webhook is set,
   because a Telegram bot can only have one webhook and the underlying integration record now
   points at the new bot. Every team that connected the old bot must:
   - open a chat with the new `@bugping_bot` and press **Start**;
   - go to their project's **Integrations** page in Bugping and reconnect Telegram there.

## 8. Smoke test, then clean up the old Supabase redirect

Test all of this on `https://bugping.vercel.app` before removing anything:

1. Open the landing page — it loads without errors.
2. Sign in with GitHub — completes and lands on `/app`.
3. Sign in with a magic link — open the emailed link in the **same browser** you requested it
   from, and it signs you in.
4. Create a project.
5. Confirm the widget embedded on the landing page sends a test report and it arrives in
   Telegram (via the new bot, reconnected per step 7.3).
6. Open the billing page and confirm the checkout modal opens (no need to complete a real
   purchase — the sandbox test card from `docs/deploy.md` is fine if you want to go further).

Once all of that passes, go back to **Supabase → Authentication → URL Configuration** and remove
the old `https://dymcode.vercel.app/auth/callback` redirect URL.

## 9. Apply the default-color database migration

When it's convenient (this does not need to happen during the cutover — it only changes the
default color new projects get, and backfills projects that never customized their color):

1. Make sure you're linked to the right Supabase project: `supabase link --project-ref <ref>`.
2. Run:
   ```bash
   supabase db push
   ```
3. This applies `supabase/migrations/20260924000100_bugping_default_color.sql`, which changes the
   `primary_color` default on `public.projects` from `#6366f1` to `#E0321F` and updates any
   existing project that still has the untouched old default. Projects that picked a custom color
   are not touched.
