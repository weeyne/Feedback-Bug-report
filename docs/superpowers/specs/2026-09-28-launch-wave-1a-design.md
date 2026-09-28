# Launch wave 1a — code fixes before commercial launch — design

Part 1a of wave 1 in `docs/superpowers/followups/2026-09-28-launch-review.md`. Parts 1b (legal pages), 1c (billing
before live) and 1d (Supabase/Cloudflare dashboard settings) are separate. Branch `fix/launch-wave-1`.

Owner decisions (2026-09-28): fast-report threshold lowered, not a spam flag (option A); origin design, headers/IP
and sign-in sections approved as written below.

## 1. Fast reports

`apps/web/lib/widget/submit.ts`: `MIN_ELAPSED_MS` goes from 2000 to **800**. The honeypot (`website`) and the silent
`200 { id: null }` for bots stay as they are. Rationale: the form focuses the message field, but Send needs a pointer
click (no keyboard shortcut submits), so a person cannot paste and send within 0.8 s; scripted submits arrive within
tens of milliseconds. `elapsedMs` is still measured from the form's `begin()` in the widget; nothing changes there.

## 2. Allowed origins

### 2.1 Matching

A new pure function `originAllowed(origin: string | null, allowed: readonly string[]): boolean` (in
`apps/web/lib/widget/origins.ts`, unit-tested) replaces `allowed_origins.includes(origin)`:

- an empty `allowed` list allows everything (as today);
- otherwise the origin must parse as an `http:`/`https:` URL, and it matches an entry when both have the same
  **site key**: the hostname with one leading `www.` removed, plus the port when it is not the scheme's default;
- the scheme is ignored (`http://example.com` matches `https://example.com`);
- subdomains other than `www` are different sites (`shop.example.com` ≠ `example.com`);
- `null`, the literal `"null"` (sandboxed frames, `file:`) and unparsable values do not match a non-empty list.

Stored data does not change; the rule applies to existing projects immediately.

### 2.2 Where it is enforced

- **Submit** (`lib/widget/submit.ts`): same place as today, now through `originAllowed`. A rejected submit also
  records the blocked origin (2.3). Response unchanged: `403 { error: 'origin not allowed' }`.
- **Config** (`lib/widget/config.ts`): when the request has an `Origin` header and the list is non-empty and
  `originAllowed` is false, answer `403 { error: 'origin not allowed' }` (with CORS headers, no cache headers), record
  the blocked origin, and **do not** mark the widget seen. The widget already refuses to mount without a config, so
  it does not appear on sites that are not allowed. A request without `Origin` (same-origin GET, server tools) is
  treated as allowed, because the server cannot judge it and such requests cannot submit anyway.

### 2.3 Recording the blocked origin

Migration `supabase/migrations/20260928000100_blocked_origin.sql`:

```sql
alter table public.projects
  add column blocked_origin text check (char_length(blocked_origin) <= 2048),
  add column blocked_origin_at timestamptz;
grant update (blocked_origin, blocked_origin_at) on public.projects to authenticated;
```

The existing "projects: select own" / "update own" policies cover the new columns. `markOriginBlocked(db, projectId,
origin)` (next to `markWidgetSeen`) writes through the service connection, at most once per hour for the same origin:

```sql
update public.projects set blocked_origin = $2, blocked_origin_at = now()
where id = $1 and (blocked_origin is distinct from $2 or blocked_origin_at < now() - interval '1 hour')
```

It runs in `deps.after` (config) or after the response is decided (submit) and never fails the request (errors are
logged, like `markWidgetSeen`). Only values that parse as an origin are stored (`new URL(origin).origin`).

### 2.4 Showing it to the owner

- A notice component `BlockedOriginNotice` (`components/app/blocked-origin-notice.tsx`) renders when
  `blocked_origin` is set and not already allowed by the current list: "The widget was blocked on
  **https://www.example.com** · {relative time}" with an **Allow** button and a secondary "Settings" link.
- It appears on the **Install** page (above the steps) and on **Overview** (in the checklist's "widget on your site"
  item). The Overview data (`lib/dashboard/overview.ts`) gains `blockedOrigin` / `blockedOriginAt`.
- **Allow** calls a server action `allowBlockedOriginAction(projectId)` → `allowBlockedOrigin(deps, userId,
  projectId)` in `lib/dashboard/settings.ts`: under `withUser` (RLS), it reads the project, appends the normalized
  blocked origin to `allowed_origins` (reusing the settings validation: dedup, `MAX_ORIGINS`, byte limit), clears both
  new columns, then `revalidatePath('/app', 'layout')`. If the list is full it returns the existing settings error.
- Saving settings clears the notice when the saved list now allows the blocked origin (the component checks with
  `originAllowed`, so no extra write is needed).

### 2.5 Onboarding copy

The "Website (optional)" hint (`projects.siteUrlHint`, en/ru) becomes: "Reports are accepted only from this site
(with or without www). Leave empty to accept them from any site." The Settings field for allowed origins gets the same
explanation.

## 3. Security headers

In `apps/web/next.config.ts`:

- `poweredByHeader: false`;
- for every path except `/demo/*` (a `headers()` entry with a negative-lookahead `source`):
  - `X-Frame-Options: DENY`
  - `Content-Security-Policy: frame-ancestors 'none'; base-uri 'self'; object-src 'none'`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Strict-Transport-Security: max-age=31536000` (no `includeSubDomains`: the host is a shared `vercel.app`
    subdomain today);
- `/demo/*` keeps its own `frame-ancestors 'self'` and gets the other three non-framing headers.

The existing `/w/*` entries (cache, CORS) are unchanged and combine with the above. A full script CSP is out of scope
(it needs nonces and would risk Paddle/Supabase); it is noted in the follow-ups.

## 4. Client IP

- `lib/env.ts` gains an optional `CLIENT_IP_HEADER` (lower-case header name, `^[a-z0-9-]+$`).
- `clientIp(headers, trustedHeader?)` in `lib/http.ts`:
  - with `trustedHeader` set: the first comma-separated value of that header, trimmed; if absent → `'unknown'`
    (no fallback to `x-forwarded-for`, which would reopen spoofing);
  - without it: today's behaviour (first `x-forwarded-for` hop, then `x-real-ip`), correct on Vercel.
- Callers pass `deps.env.CLIENT_IP_HEADER`. `docs/deploy.md` documents the variable; the VPS guide (later) sets
  `CLIENT_IP_HEADER=cf-connecting-ip` and restricts the origin firewall to Cloudflare's ranges.

## 5. Returning to the intended page after sign-in

- Cookie `bp_next`: `httpOnly`, `sameSite=lax`, `secure` in production, `path=/`, `maxAge` 600 s.
- A pure `safeNext(value: string | undefined): string | null` (`lib/auth/next.ts`, unit-tested) accepts only
  `/app` or a path starting with `/app/` or `/app?`, with no `//`, no `\`, no control characters, length ≤ 512.
- `proxy.ts`: when an anonymous request to `/app/*` is redirected to `/login`, set `bp_next` to
  `pathname + search` if `safeNext` accepts it.
- `app/auth/callback/route.ts`: after a successful code exchange, redirect to `safeNext(cookie) ?? '/app'` and delete
  the cookie.
- `app/login/page.tsx`: a signed-in visitor is redirected to `safeNext(cookie) ?? '/app'` (the cookie expires on its
  own; server components cannot delete cookies).
- Magic link and GitHub sign-in keep `.../auth/callback` without query parameters, so the Supabase redirect list
  does not change.

## 6. Magic-link rate limit

In `sendMagicLink` (`app/login/actions.ts`), after email validation and before sending (also in test mode, so tests
exercise it), using `public.hit_rate_limit` through `(await getDeps()).db`:

- `magic-ip:<sha256(rateLimitIdentity(ip) + IP_HASH_SALT)>`: **5 per 900 s**;
- `magic-email:<sha256(lowercased email + IP_HASH_SALT)>`: **3 per 900 s**.

Either limit → `{ status: 'error', error: 'auth.rateLimited' }`, new message (en: "Too many attempts. Try again in a
few minutes." / ru: «Слишком много попыток. Попробуйте через несколько минут.»). `rateLimitIdentity` moves from
`lib/widget/submit.ts` to `lib/http.ts` so both callers share it. GitHub sign-in sends no email and is not limited.

## 7. Constraints

- English code/comments/commits/docs; commit trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- No new runtime dependencies. Keep existing `data-testid`s; new: `blocked-origin-notice`, `blocked-origin-allow`.
- Messages in en and ru; `messages.test.ts` parity stays green.
- The migration must be applied to the cloud database **before** merging (the dashboard selects the new columns);
  the owner runs `supabase db push` or approves the agent running it.
- Widget package unchanged; its size budgets stay green.

## 8. Testing

- Unit (Vitest):
  - `originAllowed`: empty list, apex↔www both ways, scheme ignored, ports, other subdomains, `null`/`"null"`,
    garbage;
  - submit: 799 ms dropped silently, 800 ms stored; blocked origin → 403 and recorded;
  - config: allowed / blocked / no-Origin cases; blocked → 403, recorded, `widget_seen_at` untouched;
  - `markOriginBlocked` hourly throttle; `allowBlockedOrigin` appends, dedups, clears, respects limits and RLS
    (another user's project);
  - `clientIp` with and without `trustedHeader`;
  - `safeNext`: accepted paths, `//evil.com`, `/\evil`, `https://…`, `/login`, overlong, control characters;
  - `sendMagicLink`: sixth request from one IP and fourth for one email are refused.
- E2E (Playwright, test mode):
  - an anonymous visit to `/app/billing` → sign in → lands on `/app/billing`;
  - a report from a non-allowed origin shows the notice on Install; **Allow** makes the next report succeed;
  - response headers on `/`, `/app` and `/demo/shop` (framing rules as in §3, no `X-Powered-By`).
- Full `pnpm typecheck`, `pnpm test`, `pnpm format:check`, web e2e twice.
