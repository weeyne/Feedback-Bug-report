# Bugping brand foundation (redesign stage 1 of 4)

**Status:** approved in brainstorming, 2026-09-23
**Stage order:** 1 brand foundation (this spec) → 2 widget redesign + own screenshot → 3 dashboard → 4 landing with demo.

## Goal

Rename the product from Dymcode to **Bugping** everywhere, give it a real visual identity (coral accent, ladybug logo, Manrope), and replace the unstyled login page. Later stages build on the tokens and the `Logo` component defined here.

## Decisions (from brainstorming)

| Topic | Decision |
|---|---|
| Style | Light, warm, coral accent (option C). Dark theme kept. |
| Logo | Detailed ladybug mark + wordmark `bugping` whose "i" dot is a coral circle (option A: mark next to wordmark). A simplified ladybug is used at 16–32 px. |
| Font | Manrope (Cyrillic subset) via `next/font/google` for the web app. The widget keeps the system font stack. |
| Login | Centered card on a warm dotted background (option A). |
| Address | `bugping.vercel.app` now; the `bugping.app` domain later (separate task). |
| Rename depth | Full: packages, public widget API, CSS classes, env var names, texts. No backward-compatibility aliases (there are no external installs). |

## Out of scope

- Widget layout redesign and "attach your own screenshot" (stage 2).
- Dashboard shell redesign, "back to site" in the dashboard nav, overview page (stage 3).
- Landing layout, copy, animations, demo (stage 4). In this stage the marketing header and dashboard nav only get the new `Logo`.
- Custom domain, Resend SMTP, live Paddle.

## 1. Visual identity

### Colors

Brand coral `#FF4D3D` is used for the logo, highlights and decorative dots. White text on it is only 3.3:1, so interactive fills (`--primary`) use a deeper coral that passes WCAG AA (4.5:1) with white text.

Light theme (`:root` in `apps/web/app/globals.css`):

| Token | Value |
|---|---|
| `--background` | `#FFFDFB` |
| `--foreground` | `#1A1414` |
| `--card`, `--popover` | `#FFFFFF` |
| `--card-foreground`, `--popover-foreground` | `#1A1414` |
| `--primary` | `#E0321F` |
| `--primary-foreground` | `#FFFFFF` |
| `--secondary` | `#F7EEEA` |
| `--secondary-foreground` | `#1A1414` |
| `--muted` | `#FBF4F1` |
| `--muted-foreground` | `#6F6461` |
| `--accent` | `#FBF4F1` |
| `--accent-foreground` | `#1A1414` |
| `--destructive` | `#B42318` |
| `--border` | `#F0E6E2` |
| `--input` | `#EAD9D4` |
| `--ring` | `#FF4D3D` |
| `--brand` (new) | `#FF4D3D` |
| `--radius` | `0.75rem` |

Dark theme (`.dark`):

| Token | Value |
|---|---|
| `--background` | `#141010` |
| `--foreground` | `#FBF4F1` |
| `--card`, `--popover` | `#1C1716` |
| `--card-foreground`, `--popover-foreground` | `#FBF4F1` |
| `--primary` | `#FF5A4A` |
| `--primary-foreground` | `#1A1414` |
| `--secondary` | `#2A2321` |
| `--secondary-foreground` | `#FBF4F1` |
| `--muted` | `#241E1C` |
| `--muted-foreground` | `#A8998F` |
| `--accent` | `#2A2321` |
| `--accent-foreground` | `#FBF4F1` |
| `--destructive` | `#FF6B5E` |
| `--border` | `#332A28` |
| `--input` | `#3A302E` |
| `--ring` | `#FF5A4A` |
| `--brand` | `#FF4D3D` |

`--brand` is exposed to Tailwind as `--color-brand` in `@theme inline`. Sidebar and chart tokens follow the same palette (sidebar = muted/foreground/primary, charts = shades of coral and warm grey). A unit test reads `globals.css` and asserts `--primary`/`--primary-foreground` reach ≥ 4.5:1 contrast in both themes.

### Font

`apps/web/app/layout.tsx` loads Manrope with `next/font/google` (`subsets: ['latin', 'cyrillic']`, `display: 'swap'`, CSS variable `--font-manrope`). `--font-sans` in `@theme inline` becomes `var(--font-manrope), ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`. Headings use weight 800 with `tracking-tight`.

### Logo

New `apps/web/components/brand/logo.tsx` exports:

- `LadybugMark({ size, className })` — the detailed mark (SVG below). Legs, antennae and head outline use `currentColor`, so the mark works on light and dark backgrounds.
- `Wordmark({ className })` — text `bugping` in weight 800, letter-spacing −0.03em, with a dotless `ı` and an absolutely positioned coral (`--brand`) circle as its dot. Accessible name "Bugping" (`aria-label`), decorative parts `aria-hidden`.
- `Logo({ size = 'md' | 'lg', href? })` — mark + wordmark in a row; when `href` is given it renders a `next/link`.

Detailed mark (`viewBox="0 0 64 64"`, gradient id must be unique per instance — use React `useId`):

```svg
<defs>
  <radialGradient id="{id}" cx="35%" cy="30%" r="75%">
    <stop offset="0" stop-color="#ff7a6b"/>
    <stop offset=".55" stop-color="#ff4d3d"/>
    <stop offset="1" stop-color="#d9321f"/>
  </radialGradient>
</defs>
<g stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none">
  <path d="M14 28 L6 24"/><path d="M12 38 L4 39"/><path d="M15 48 L8 54"/>
  <path d="M50 28 L58 24"/><path d="M52 38 L60 39"/><path d="M49 48 L56 54"/>
  <path d="M27 12 Q23 4 17 4"/><path d="M37 12 Q41 4 47 4"/>
</g>
<circle cx="17" cy="4.2" r="2.3" fill="currentColor"/>
<circle cx="47" cy="4.2" r="2.3" fill="currentColor"/>
<path d="M21 17 a11 9 0 0 1 22 0 z" fill="#1a1414" stroke="currentColor" stroke-width="1"/>
<circle cx="27.5" cy="13.5" r="2" fill="#fff"/><circle cx="36.5" cy="13.5" r="2" fill="#fff"/>
<path d="M32 18 C14 18 10 32 10 38 C10 51 20 59 31 59.5 L32 20 Z" fill="url(#{id})"/>
<path d="M32 18 C50 18 54 32 54 38 C54 51 44 59 33 59.5 L32 20 Z" fill="url(#{id})"/>
<path d="M22 19 Q32 15 42 19 Q37 23 32 23 Q27 23 22 19Z" fill="#1a1414"/>
<ellipse cx="25" cy="20" rx="2.6" ry="1.4" fill="#fff" opacity=".9"/>
<ellipse cx="39" cy="20" rx="2.6" ry="1.4" fill="#fff" opacity=".9"/>
<path d="M32 21 L32 59.5" stroke="#1a1414" stroke-width="1.6"/>
<circle cx="21" cy="31" r="4" fill="#1a1414"/><circle cx="43" cy="31" r="4" fill="#1a1414"/>
<circle cx="17.5" cy="43" r="3.2" fill="#1a1414"/><circle cx="46.5" cy="43" r="3.2" fill="#1a1414"/>
<circle cx="25.5" cy="51" r="2.8" fill="#1a1414"/><circle cx="38.5" cy="51" r="2.8" fill="#1a1414"/>
<circle cx="27" cy="40" r="2.2" fill="#1a1414"/><circle cx="37" cy="40" r="2.2" fill="#1a1414"/>
<ellipse cx="20" cy="26" rx="5" ry="2.6" fill="#fff" opacity=".35" transform="rotate(-35 20 26)"/>
```

Simplified mark for small sizes (`viewBox="0 0 32 32"`):

```svg
<path d="M9 9.5 a7 6 0 0 1 14 0 z" fill="#1a1414"/>
<circle cx="16" cy="19" r="12" fill="#ff4d3d"/>
<path d="M16 9 L16 31" stroke="#1a1414" stroke-width="2.2"/>
<path d="M9 10 Q16 7 23 10 Q16 13 9 10Z" fill="#1a1414"/>
<circle cx="10.5" cy="17" r="2.6" fill="#1a1414"/><circle cx="21.5" cy="17" r="2.6" fill="#1a1414"/>
<circle cx="11.5" cy="25" r="2.2" fill="#1a1414"/><circle cx="20.5" cy="25" r="2.2" fill="#1a1414"/>
```

### Icons and share image (Next.js file conventions)

- `apps/web/app/icon.svg` — simplified mark (static file).
- `apps/web/app/apple-icon.tsx` — `ImageResponse` 180×180: simplified mark centered on `#FFFDFB` with 24 px padding.
- `apps/web/app/opengraph-image.tsx` — `ImageResponse` 1200×630: warm background, detailed mark, wordmark, and the English `meta.description` as the tagline (crawlers carry no locale cookie, so the default locale is what they see). Uses Manrope 800 fetched at build time from Google Fonts (`fetch` of the TTF with Cyrillic); if the fetch fails, it falls back to the default font instead of failing the build.

### Where the logo appears in this stage

- Marketing header (`app/(marketing)/layout.tsx`): `Logo href="/"` replaces the "Dymcode" text.
- Dashboard nav and mobile header (`components/app/app-shell.tsx`): `Logo href="/app"` / `Logo` replace the "Dymcode" text.
- Login page (section 3).

## 2. Rename

### Identifiers

| From | To |
|---|---|
| root package `dymcode` | `bugping` |
| `@dymcode/shared`, `@dymcode/widget` | `@bugping/shared`, `@bugping/widget` (all imports, `package.json` deps, tsconfig paths, vitest/vite configs, `vercel.json` build command) |
| `BRAND` in `packages/shared/src/brand.ts` | `name: 'Bugping'`, `domain: 'bugping.app'`, `url: 'https://bugping.app'`. Remove `telegramBot` (unused; the bot comes from `TELEGRAM_BOT_USERNAME`). |
| `window.Dymcode`, type `DymcodeApi` | `window.Bugping`, `BugpingApi` |
| Widget CSS classes and custom properties `dc-*`, `--dc-*` | `bp-*`, `--bp-*` (including the host element id/attributes and the custom-CSS docs in the settings page) |
| Env `NEXT_PUBLIC_DYMCODE_PROJECT_KEY`, `publicEnv.dymcodeProjectKey` | `NEXT_PUBLIC_BUGPING_PROJECT_KEY`, `bugpingProjectKey` |
| Env `DYMCODE_TEST_MODE` | `BUGPING_TEST_MODE` (tests, Playwright configs, CI workflow) |
| `TELEGRAM_BOT_USERNAME` in Playwright/test fixtures | value `bugping_bot` |
| Titles, `siteName`, metadata template `%s · Dymcode` | `Bugping` |

`apps/web/public/w/*` is build output of the widget; it is regenerated, not hand-edited.

### Default widget color

New projects default to `#E0321F` instead of `#6366f1`:

- Migration `supabase/migrations/20260924000100_bugping_default_color.sql`: `alter table public.projects alter column primary_color set default '#E0321F';` and `update public.projects set primary_color = '#E0321F' where primary_color = '#6366f1';` (only untouched defaults change). Applying it to the cloud database needs the owner's consent (`supabase db push`).
- Code fallbacks (`settings-form.tsx`, `packages/widget/dev/mock-api.ts`) and the color example in `messages/*.json` `colorInvalid` use `#E0321F`. Test fixtures may keep any valid hex.
- Discord embed color for `general` in `lib/notify/format.ts` becomes `0xE0321F`.

### Texts

All occurrences of "Dymcode" in `apps/web/messages/{en,ru}.json`, widget `i18n.ts` ("Powered by"), legal pages (terms, privacy, refund), email-facing strings, README and `docs/deploy.md` become "Bugping". URLs `dymcode.vercel.app` in current docs become `bugping.vercel.app`; `@dymcode_bot` becomes `@bugping_bot`.

Historical documents under `docs/superpowers/` (specs, plans, follow-ups written before this stage) are not edited.

### Verification

`git grep -i dymcode -- . ':!docs/superpowers'` returns nothing after the change (including `pnpm-lock.yaml`, regenerated by `pnpm install`). `apps/web/.env.local` is never read or edited by the implementation; the owner renames the variable there.

### Owner checklist (`docs/rename-ops.md`)

A new document with the ordered manual steps, written for someone clicking through the dashboards:

1. BotFather: create `@bugping_bot` (name "Bugping"), copy the token.
2. Vercel → project → Settings: rename the project to `bugping`; under Domains, make sure `bugping.vercel.app` is present and keep `dymcode.vercel.app` as a redirect to it.
3. Vercel → Environment Variables: rename `NEXT_PUBLIC_DYMCODE_PROJECT_KEY` → `NEXT_PUBLIC_BUGPING_PROJECT_KEY`; set `NEXT_PUBLIC_APP_URL=https://bugping.vercel.app`; set `TELEGRAM_BOT_USERNAME=bugping_bot` and the new `TELEGRAM_BOT_TOKEN`; generate a new `TELEGRAM_WEBHOOK_SECRET`. Same renames in local `apps/web/.env.local`.
4. Supabase → Authentication → URL Configuration: Site URL `https://bugping.vercel.app`; add `https://bugping.vercel.app/auth/callback` to redirect URLs (keep the old one until step 8).
5. GitHub → OAuth App: rename to Bugping, homepage `https://bugping.vercel.app` (the callback stays the Supabase URL).
6. Paddle (sandbox): rename the products to "Bugping Pro" / "Bugping Lifetime"; update the default payment link / approved domain and the webhook destination to `https://bugping.vercel.app/api/billing/webhook`.
7. Redeploy, then register the Telegram webhook for the new bot (command given in the doc, with the secret passed from the environment, not typed into chat). Chats connected to the old bot must press Start in `@bugping_bot` and reconnect in Integrations; the old bot can no longer deliver.
8. Smoke test: landing, login by GitHub and email, create project, widget on the landing sends to Telegram, billing page opens checkout. Then remove the old Supabase redirect URL.
9. Apply the default-color migration (`supabase db push`) when convenient.

## 3. Login page

`app/login/page.tsx` and `login-form.tsx` are rebuilt with the existing shadcn `Button`, `Input`, `Label`, `Card`:

- Full-height page, background `--muted` with a dotted pattern (`radial-gradient` of `--input` 1 px dots on an 18 px grid).
- Top-left link "← Back to site" / "← На сайт" to `/` (`data-testid="login-back"`).
- Centered column: `Logo size="lg"`, then a card (max width 360 px, padding 24 px, subtle shadow).
- Card content:
  - heading "Sign in to Bugping" / "Вход в Bugping";
  - sub-line "No account? One is created automatically." / "Нет аккаунта? Он создастся автоматически.";
  - GitHub button: full width, dark (`bg-foreground text-background` in light theme, inverted in dark), GitHub icon (inline SVG), `data-testid="login-github"`;
  - divider "or with email" / "или по почте";
  - `Label` "Email" + `Input type="email"` (`data-testid="login-email"`);
  - primary full-width submit "Send sign-in link" / "Прислать ссылку для входа" (`data-testid="login-submit"`); while pending it is disabled and shows a spinner icon;
  - fine print "No password: we'll email you a one-time link." / "Без пароля: пришлём одноразовую ссылку.".
- Errors (`?error=callback`, `?error=oauth`, and the form's validation error) render in one styled alert (`role="alert"`, destructive tint, icon) at the top of the card.
- Sent state (`data-testid="login-sent"`) replaces the card content: mail icon, heading "Check your email" / "Проверьте почту", text with the address it was sent to, and a secondary button "Use a different email" / "Указать другой email" that returns to the form. `sendMagicLink` returns the submitted email in its `sent` state so it can be shown.
- Works at 360 px width and in the dark theme.

## 4. Testing

- Existing unit, db and e2e suites pass; existing `data-testid`s keep their names.
- New unit test for the contrast of `--primary` vs `--primary-foreground` in both themes.
- `components/brand/logo.tsx`: test that two `LadybugMark`s on one page get different gradient ids and the wordmark exposes the accessible name "Bugping".
- E2E login spec: the back link navigates to `/`; submitting an email shows the sent state with that email and "Use a different email" returns to the form.
- Widget `size-limit` stays within 20 KB (widget.js) / 40 KB (screenshot.js).
- Manual visual pass (controller, in the browser): login, landing header, dashboard nav — light, dark, and 375 px width.
- The rename grep in section 2 is clean.
