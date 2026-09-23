# Owner checklist: renaming Dymcode to Bugping

This is a manual, click-by-click checklist for the project owner. It covers everything that lives
outside the code: the Telegram bot, the Vercel project, environment variables, Supabase auth
settings, the GitHub OAuth app, and Paddle sandbox billing.

Do the steps **in this order**. `https://dymcode.vercel.app` keeps serving the app normally
throughout the move (see step 2), so nothing that embeds it breaks mid-way, and sign-in and
billing keep working the whole time. The one deliberate gap is the Telegram bot: once step 7
switches the shared bot's token, every chat connected through the old bot stops receiving
deliveries until that chat reconnects to the new one.

Nothing in this checklist is done by the coding agent. No secret (bot token, webhook secret,
API key) is ever typed into chat with an AI assistant — only into the Vercel/Supabase/Paddle/
BotFather dashboards, or read from `apps/web/.env.local` by the commands below.

---

## Before you start

- The Bugping code (this branch) must already be merged to `main` and deployed to production
  before you start this checklist.
- That deploy is safe on its own, before you touch any dashboard: with the old environment
  variable names and values still in place, the app keeps working exactly as it did before. The
  only visible change is that the landing page's own feedback widget stays hidden until you set
  `NEXT_PUBLIC_BUGPING_PROJECT_KEY` (step 4).
- Vercel auto-deploys every push to `main`. Don't merge anything else into `main` while you work
  through this checklist — an unrelated merge would trigger a redeploy mid-move and could race
  with the environment-variable changes below.

## 1. Create the new Telegram bot (BotFather)

1. Open a chat with **@BotFather** in Telegram.
2. Send `/newbot`.
3. When asked for a name, send `Bugping`.
4. When asked for a username, send `bugping_bot` (Telegram requires usernames to end in `bot`).
   If that username is already taken, pick a close variant instead (for example
   `bugping_app_bot`) — whichever one you end up with, use that same value everywhere below
   instead of `bugping_bot`.
5. BotFather replies with a message containing the line `Use this token to access the HTTP API:`
   followed by a token that looks like `123456789:AA...`. Copy that token somewhere safe (a
   password manager, not a chat) — you'll paste it into Vercel in step 4. Do not paste it into any
   AI chat.
6. Keep the old bot (`@dymcode_bot`) running for now — do not delete or rename it yet. It keeps
   serving existing chats until step 7 cuts over.

## 2. Vercel: rename the project and add the new domain

1. Go to your Vercel dashboard → the `dymcode` project → **Settings** → **General**.
2. Under **Project Name**, change `dymcode` to `bugping`, then save.
3. Go to **Settings** → **Domains**.
4. Add `bugping.vercel.app`. Vercel should offer it automatically once the project is renamed
   (a project named `bugping` gets `bugping.vercel.app` for free); if it's not offered
   automatically, add it manually.
5. Make sure `dymcode.vercel.app` is still listed, and leave it as a **plain alias** — both
   domains serve the same deployment, with no redirect between them. Do not turn it into a
   redirect yet: the embeddable widget derives the API origin it calls from the origin of its own
   `<script src>` (`packages/widget/src/index.ts`), so any page still embedding
   `https://dymcode.vercel.app/w/widget.js` needs that host to actually serve the app — a redirect
   response carries no CORS headers, so the widget's request would fail outright. The Paddle and
   Telegram webhook URLs also still point at the old host until steps 6 and 7 move them, and a
   redirect would break those deliveries too.
6. Do not remove `dymcode.vercel.app` — that's optional, and covered separately in step 9, only
   after the smoke test in step 8 passes.

## 3. Supabase: update auth URLs

1. Open your Supabase project → **Authentication** → **URL Configuration**.
2. Under **Redirect URLs**, add `https://bugping.vercel.app/auth/callback`. Leave the existing
   `https://dymcode.vercel.app/auth/callback` entry in place for now.
3. While you're here, also set **Site URL** to `https://bugping.vercel.app`. This is safe to do
   right away, before the Vercel environment variables change in step 4: the app always passes an
   explicit `redirectTo` built from `NEXT_PUBLIC_APP_URL` (`apps/web/app/login/actions.ts`), and
   Supabase only falls back to Site URL when a request doesn't specify one — so today's sign-in
   flow keeps working off the Redirect URLs list regardless of what Site URL says.
4. Doing this step before step 4 matters: when Vercel later auto-deploys with the new
   `NEXT_PUBLIC_APP_URL`, the callback it will request
   (`https://bugping.vercel.app/auth/callback`) is already on the allow-list, so sign-in is never
   pointed at a URL Supabase doesn't recognize yet.

## 4. Vercel: update environment variables

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
6. Make the same changes in your local `apps/web/.env.local` file, by hand, in your own editor:
   the project key variable name, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_BOT_TOKEN`,
   `TELEGRAM_WEBHOOK_SECRET` — and if `DYMCODE_TEST_MODE` is set there too, rename it to
   `BUGPING_TEST_MODE`. No AI assistant reads or edits that file.
7. Only once items 1–6 above are all done, save the Vercel changes. Don't redeploy yet — step 7
   below redeploys once and picks up everything together.

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
   variable changed in step 4.
2. Once the deploy finishes, register the new bot's webhook. The script that does this is
   `apps/web/scripts/set-telegram-webhook.mjs`. It reads two variables —
   `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` — first from `apps/web/.env.local` (that
   file lives in `apps/web/`, one directory above the script itself, not next to it) and then
   from your shell's actual environment, with the shell environment taking priority over the
   file. The file parser only trims whitespace — it does **not** strip quotes — so don't wrap the
   values in quotes there (`TELEGRAM_BOT_TOKEN=123:abc`, not `TELEGRAM_BOT_TOKEN="123:abc"`) or
   the quote characters become part of the value the script sends to Telegram. It never prints
   either value; it only prints whether the call to Telegram succeeded. Make sure both values in
   `apps/web/.env.local` already match what you put in Vercel in step 4, then run, from
   `apps/web`:
   ```bash
   pnpm telegram:set-webhook https://bugping.vercel.app/api/telegram/webhook
   ```
   You should see `Webhook set to https://bugping.vercel.app/api/telegram/webhook`. Nothing
   secret is typed into this command or into chat — the script reads the token and secret from
   the environment.
3. From this point, the shared bot sends with the **new** bot's token
   (`apps/web/lib/notify/dispatch.ts`). Telegram rejects a message sent by a bot that was never
   started in that chat, so every chat that was connected through the old shared bot stops
   receiving deliveries until it reconnects — this is a real, if brief, per-chat outage, not a
   cosmetic one:
   - **Tell the affected users first** — their feedback delivery is down for that chat until they
     redo the steps below.
   - For a **private chat**, opening a chat with the new `@bugping_bot` and pressing **Start** is
     enough.
   - For a **group chat**, pressing Start in a private chat is *not* enough — the new bot must
     actually be added as a member of that group. Use the reconnect link on the project's
     **Integrations** page (it adds the bot to the group for you) rather than trying to add it by
     hand from Telegram's own UI.

## 8. Smoke test, then clean up the old Supabase redirect entry

Before testing, check the **Allowed websites** setting on your own landing project (dashboard →
your project → **Settings** → Allowed websites): if it currently restricts submissions to
`https://dymcode.vercel.app`, add `https://bugping.vercel.app` there first — otherwise the
widget test in step 5 below is rejected as coming from a disallowed origin.

Test all of this on `https://bugping.vercel.app`:

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
the old `https://dymcode.vercel.app/auth/callback` redirect URL entry.

## 9. Optional: retire the old domain

Once the smoke test above passes and you no longer need `dymcode.vercel.app` to keep serving old
embeds, you can turn it into a redirect to `bugping.vercel.app` (Vercel → **Settings** →
**Domains** → the "Redirect to" option on `dymcode.vercel.app`).

Before doing this, update every widget snippet you control that still points at the old host,
starting with your own test sites — Paddle and Telegram were already moved to the new host in
steps 6 and 7, so this step is mainly about embed snippets living outside this repo. **Any widget
snippet, Paddle destination or Telegram webhook still pointing at `dymcode.vercel.app` stops
working the moment it becomes a redirect** (a redirect response carries no CORS headers, so the
widget's own request fails outright).

## 10. Apply the default-color database migration

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
