# Locale URLs for public pages — design

Wave 3, part 3 of `docs/superpowers/followups/2026-09-28-launch-review.md` ("Russian audience invisible to search
engines"). Owner decisions (2026-09-29): public pages only (A); English keeps its current URLs, Russian gets a `/ru`
prefix (A); a first visit from a Russian-preferring browser is redirected once to the `/ru` page (A).

## 1. Scope

Localized URLs for the public pages only: `/` ↔ `/ru`, `/install` ↔ `/ru/install`, `/privacy` ↔ `/ru/privacy`,
`/terms` ↔ `/ru/terms`, `/refund` ↔ `/ru/refund`. Everything else keeps its URLs and its current locale rule (the
`locale` cookie, else `Accept-Language`, else English): `/app/**`, `/login`, `/auth/**`, `/demo/**`, `/api/**`,
`/w/**`, `/e2e-host`, metadata routes (`/sitemap.xml`, `/robots.txt`, icons, OG image).

## 2. Routing

- next-intl routing (`apps/web/i18n/routing.ts`): `locales: ['en', 'ru']`, `defaultLocale: 'en'`,
  `localePrefix: 'as-needed'`, `localeCookie: { name: 'locale' }` (the existing cookie; max-age one year like
  `setLocale`), `localeDetection: true`. Navigation helpers (`Link`, `useRouter`, `usePathname`, `redirect`,
  `getPathname`) from `createNavigation(routing)` in `apps/web/i18n/navigation.ts`.
- The public pages move from `app/(marketing)/…` to `app/[locale]/(marketing)/…` with a `[locale]` layout that
  validates the param (`hasLocale` → otherwise `notFound()`), calls `setRequestLocale`, and exports
  `generateStaticParams` for both locales. Page contents do not change.
- `apps/web/i18n/request.ts`: use the segment's `requestLocale` when it is a supported locale; otherwise the current
  cookie/`Accept-Language` rule (dashboard, login, demo). `timeZone` handling stays.
- `apps/web/proxy.ts` keeps its auth, `ref` and `bp_next` logic and runs the next-intl middleware only for the public
  paths above (unprefixed or `/ru`-prefixed). Detection behaviour for a public English URL:
  - no `locale` cookie and `Accept-Language` prefers `ru` → 302 to the `/ru` counterpart (query string kept, e.g.
    `/?ref=pk_…` → `/ru?ref=pk_…`, and the `ref` cookie is still set on that response);
  - `locale=ru` cookie → 302 to `/ru` counterpart; `locale=en` cookie → no redirect;
  - a `/ru` URL always renders Russian (and updates the cookie per next-intl's behaviour).
  - Bots that send English or no `Accept-Language` (Googlebot) are never redirected.
- The root layout's `<html lang>` matches the rendered locale on every route.

## 3. Links, switcher, demo

- Links on public pages (header, footer, hero/CTA, pricing, FAQ, install guides, legal cross-links, anchors like
  `/#pricing`) use the next-intl `Link` so `/ru` pages link to `/ru/…`. Links to `/login` and `/app/**` stay plain
  `next/link` (no prefix) and keep `prefetch={false}` where they point to `/app`.
- `LocaleSwitcher`: on public pages it navigates to the same page in the other locale (next-intl `useRouter().replace`
  with `{ locale }`), which also sets the cookie; elsewhere it keeps the current `setLocale` server action.
- The landing demo iframes (`/demo/shop`, `/demo/dashboard`) receive `?lang=<locale>` from the landing and render in
  that locale (validated; falls back to the current rule), so a first-time or bot visit to `/ru` shows a Russian
  demo. The other demo query params and the same-origin checks stay.

## 4. SEO

- Every public page's metadata: `alternates.canonical` (its own locale URL) and `alternates.languages` with `en`,
  `ru` and `x-default` (= the English URL), absolute via `metadataBase`.
- `sitemap.ts`: one entry per public page per locale, each with `alternates.languages` for both locales; `/login`
  stays once. `robots.ts` unchanged.
- OpenGraph `locale` follows the page locale.

## 5. Constraints

- English code/comments/commits; trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- No new dependencies (next-intl already installed), no migrations.
- Keep every existing `data-testid`; security headers keep applying (the headers `source` must still match
  `/ru/...` and exclude `/demo/*`).
- Nothing in `/app`, auth, billing, webhooks or the widget changes behaviour.

## 6. Testing

E2E: `/ru`, `/ru/install`, `/ru/privacy` render Russian with `<html lang="ru">`; `/` renders English; a context with
`locale: 'ru-RU'` and no cookie opening `/install` lands on `/ru/install`; with `locale=en` cookie it stays;
`/?ref=<key>` from a ru browser keeps `ref` and sets the cookie; the switcher moves `/install` ↔ `/ru/install`;
`hreflang`/canonical tags present on both versions; `/sitemap.xml` lists both versions; the `/ru` landing demo
reaches the dashboard scene in Russian; `/app`, `/login`, `/demo/*`, `/api/*`, `/w/widget.js` behave as before; the
existing suites (landing, legal, install guides, headers, dashboard, login) stay green, adjusted only where they
relied on the cookie to switch a public page's language. Unit: `request.ts` locale resolution (segment vs cookie).
