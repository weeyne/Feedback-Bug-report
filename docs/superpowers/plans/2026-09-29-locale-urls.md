# Locale URLs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** `/ru` URLs for the public pages with hreflang, keeping English URLs and the dashboard unchanged.

**Architecture:** next-intl routing (`as-needed` prefix, the existing `locale` cookie) for a new `app/[locale]`
segment holding the public pages; the existing proxy delegates only public paths to the next-intl middleware.

**Tech Stack:** Next.js 16.3 App Router, next-intl 4.14, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-29-locale-urls-design.md`

## Global Constraints

- English code/comments/commits; trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (heredoc).
- No new dependencies, no migrations. Keep every existing `data-testid`.
- Before writing routing code read next-intl's routing/middleware/navigation docs in `apps/web/node_modules/next-intl`
  (README/docs or `.d.ts`) and Next 16's proxy/middleware docs in `apps/web/node_modules/next/dist/docs/` — both
  differ from older versions. The middleware file is `apps/web/proxy.ts` exporting `proxy`.
- UI: shadcn/ui on Base UI (no `asChild`); link buttons `<Link className={buttonVariants(...)}>`.
- Never read/print/commit `.env*`; never run `supabase` CLI; no Docker. `git checkout apps/web/next-env.d.ts`
  before committing.
- Verify: `pnpm typecheck`, `pnpm --filter @bugping/web test`, `pnpm format:check`, `pnpm --filter @bugping/web e2e`
  (timeout ~600000 ms). Security headers must still apply to `/ru/...` and not to `/demo/*`.

---

### Task 1: Routing — `[locale]` segment, proxy, detection

Spec §1, §2. Files: create `apps/web/i18n/routing.ts`, `apps/web/i18n/navigation.ts`,
`apps/web/app/[locale]/layout.tsx`; move `apps/web/app/(marketing)/**` to `apps/web/app/[locale]/(marketing)/**`
(git mv; fix imports); modify `apps/web/i18n/request.ts`, `apps/web/proxy.ts`, `apps/web/app/layout.tsx` if needed
for `<html lang>`; tests: unit for the locale resolution in `request.ts` (extract a pure
`resolveLocale({ requested, cookie, acceptLanguage })` into `apps/web/i18n/locale.ts` and test it), new
`apps/web/e2e/locale-urls.spec.ts` for routing + detection (spec §6 routing items), and adjust existing e2e that set
the `locale` cookie to get Russian on a public page (they now get a redirect to `/ru/...` — assert on the final page).

- `[locale]` layout: `hasLocale(routing.locales, locale)` else `notFound()`; `setRequestLocale(locale)`;
  `generateStaticParams = () => routing.locales.map((locale) => ({ locale }))`. The marketing `layout.tsx` (header,
  footer, sentinel) stays inside `(marketing)`.
- Make sure a bare dynamic `[locale]` cannot capture other top-level paths: static routes win, and unknown first
  segments must 404 (not render a page with `locale=<garbage>`).
- Proxy: run the next-intl middleware for `/`, `/install`, `/privacy`, `/terms`, `/refund` and `/ru`, `/ru/…` only;
  merge its response (rewrite/redirect + cookies) with the existing `ref` cookie logic so `/?ref=…` still sets `ref`
  (also on a redirect). `/app` auth redirect and `bp_next` unchanged. Keep the matcher's exclusions.
- Links are NOT changed in this task (Task 2); `/ru` pages may still link to English URLs until then.

Commit: `feat(web): /ru URLs for the public pages with one-time language detection`.

---

### Task 2: Links, switcher, demo language, hreflang and sitemap

Spec §3, §4. Files: public-page components under `apps/web/components/marketing/**`, `apps/web/components/install/**`,
`apps/web/components/marketing/legal-document.tsx` if it links, `apps/web/components/locale-switcher.tsx`, the demo
stage (`apps/web/components/marketing/demo/*`) and demo pages (`apps/web/app/demo/**`), page `generateMetadata`s
under `app/[locale]/(marketing)`, `apps/web/app/sitemap.ts` (+ `app/seo.test.ts`), e2e in `locale-urls.spec.ts`.

- Internal public links → next-intl `Link` from `@/i18n/navigation`; `/login` and `/app` links stay `next/link`
  (keep `prefetch={false}` on `/app` links from public pages).
- `LocaleSwitcher`: on public pages (detect with next-intl `usePathname`/a prop from the marketing layout) replace
  the route with `{ locale }`; elsewhere keep `setLocale`.
- Demo: pass `?lang=<locale>` to both demo iframes; demo pages validate it and render in that locale (next-intl:
  `setRequestLocale` or explicit `getTranslations({ locale })` / provider `locale` — pick what works with the demo's
  structure and document why in the commit). Existing demo behaviour (same-origin checks, `?r=`) unchanged.
- Metadata: a helper `publicAlternates(path, locale)` returning `{ canonical, languages: { en, ru, 'x-default' } }`
  used by every public page; OpenGraph `locale` per page.
- Sitemap: both locales per public page with `alternates.languages`; `/login` once.
- E2E: spec §6 link/switcher/SEO/demo items; `seo.test.ts` updated.

Commit: `feat(web): localized links, switcher, demo language and hreflang for the public pages`.
