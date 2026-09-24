# Dashboard redesign (redesign stage 3 of 4)

**Status:** approved in brainstorming, 2026-09-24
**Stage order:** 1 brand foundation (done) → 2 widget (done) → **3 dashboard** (this spec) → 4 landing with demo.
**Reference:** Gleap's dashboard; Bugping brand from stage 1 (coral, Manrope, ladybug, tokens in `apps/web/app/globals.css`).

## Goal

Make the dashboard (`apps/web/app/app/**`) feel like a finished product: a redesigned shell with a "back to site" link, a plan card and a sun/moon theme toggle; a new per-project **Overview** page (onboarding checklist, stat cards, 30-day chart, recent feedback, connection status); a redesigned feedback feed and detail panel; real empty states; the remaining pages restyled; light motion. Both light and dark themes everywhere.

## Decisions (from brainstorming)

| Topic | Decision |
|---|---|
| Overview content | All five: onboarding checklist, stat cards, 30-day chart by type, last 5 feedback, connection status. |
| Themes | Light theme = warm light sidebar (option A); dark theme = whole dashboard dark (stage 1 dark tokens). Sun/moon toggle. |
| Theme transition | Cross-fade via the View Transitions API, 0.8 s, `cubic-bezier(.4,0,.2,1)`; fallback: CSS color transitions of the same duration; instant under `prefers-reduced-motion`. No circular reveal. |
| Toggle animation | Knob slides with a slight spring; sun rays fold and the disc turns into a moon (reverse on the way back). |
| Theme default | Follows the OS until the user picks; the choice is remembered in the browser (next-themes storage). |
| "Widget installed" signal | New `projects.widget_seen_at`, set by the widget config endpoint at most once per hour. |
| Feed look | As the approved mockup: status tabs with a "new" count, type chips, rich rows, detail panel with big screenshot, data table, console errors, Resolve / Reply / Archive / Delete. |
| Motion | Light: page fade-in, staggered cards, count-up numbers, growing chart bars, drawn checkmarks, sliding detail panel, hover highlights; 0.2–0.5 s; off under `prefers-reduced-motion`. |

Mockups (local, git-ignored): `.superpowers/brainstorm/844-1790252839/content/dashboard-shell.html` (option A = light shell + Overview), `theme-toggle-v3.html` (toggle + cross-fade), `feed.html` (feed, detail, empty states).

## Out of scope

- Landing page redesign and the theme toggle on marketing/login pages (stage 4; they already follow the chosen theme via next-themes).
- A `resolved_at` timestamp ("resolved in the last 30 days"), search, bulk actions, assignees, tags.
- Timezone-aware day buckets (the chart uses UTC days).

## 1. Shell

`components/app/app-shell.tsx` is rebuilt; `components/app/project-nav.tsx` and `project-switcher.tsx` are restyled.

- **Sidebar (≥ md):** 240 px, background `--sidebar` (light: `#fbf4f1`; dark: `#1c1716`), right border.
  1. `Logo href="/app"` (stage 1 component).
  2. Project switcher (existing behaviour; styled as a card with a chevron; "New project" entry).
  3. Project nav (only when a project is selected): **Overview** (`/app/p/:id`), **Feedback** (`/app/p/:id/feedback`, with a badge = count of `new` visible feedback), Install, Integrations, Settings. Each item has a `lucide-react` icon (`LayoutDashboard`, `MessageSquare`, `Code2`, `Bell`, `Settings`); the active item is a raised card (light) / lighter surface (dark), weight 700.
  4. Spacer.
  5. **Plan card:** plan name (Free / Pro / Lifetime), for Free a usage bar `used / limit` ("13 of 20 feedback this month") and a primary button "Upgrade to Pro" → `/app/billing`; for Pro/Lifetime "Manage subscription" → `/app/billing` (no bar; "Unlimited").
  6. Footer links: "← Back to site" (`/`), "Account" (`/app/account`), then a row with the email (truncated), "Sign out" (existing server action) and the **theme toggle**.
- **Mobile (< md):** top bar with a menu button, `Logo`, and the theme toggle; the menu opens the same sidebar content in the existing `Sheet`.
- Existing `data-testid`s stay (`nav-billing`, `nav-account`, `nav-feedback`, `nav-install`, `nav-settings`, `nav-integrations`, …); new: `nav-overview`, `nav-back-to-site`, `theme-toggle`, `plan-card`.
- The new-feedback badge and the plan card data come from the `/app` layout (server), which already loads projects; it additionally loads `usage()` and, for the current project, the `new` count. The badge updates on the feed's existing 30 s auto-refresh (router refresh re-renders the layout).
- `/app` redirects to `/app/p/:first/` (Overview) instead of `/feedback`; no projects → `/app/new` (unchanged).

### Theme toggle (`components/theme-toggle.tsx`)

- Client component using `next-themes` `useTheme()`; renders a 56×30 switch button (`role="switch"`, `aria-checked` = dark, `aria-label` "Dark theme" / "Тёмная тема") with the animated sun/moon knob from the approved mockup (SVG built in JSX; knob `transform` 0.45 s spring `cubic-bezier(.5,1.6,.4,1)`, rays rotate+scale+fade, moon mask circle slides).
- Click: `document.startViewTransition(() => setTheme(next))` when available and motion is allowed; the root cross-fade is styled in `globals.css`: `::view-transition-old(root), ::view-transition-new(root) { animation-duration: .8s; animation-timing-function: cubic-bezier(.4,0,.2,1); }`. Otherwise add a `theme-fading` class to `<html>` for 850 ms that transitions `background-color, color, border-color, fill, stroke` over 0.8 s, then switch. Under `prefers-reduced-motion: reduce` switch instantly.
- `ThemeProvider` keeps `attribute="class"`, `defaultTheme="system"`, `enableSystem`, and keeps `disableTransitionOnChange` (the toggle handles its own transition; system-driven changes stay instant).
- Hydration: render a same-size placeholder until mounted (next-themes pattern) to avoid a mismatch.

## 2. Overview page

New route `app/app/p/[projectId]/page.tsx` (server component) + `components/app/overview/*`.

### Data (`lib/dashboard/overview.ts`, all via `withUser` like the rest of `lib/dashboard`)

`getOverview(deps, userId, projectId): Promise<Overview | null>` (null when the user doesn't own the project), one round trip where practical:

```ts
interface Overview {
  counts: { new: number; resolved: number; last30: number };   // visible + hidden (over-quota) rows
  usage: { used: number; limit: number | null; pro: boolean }; // existing usage()
  series: Array<{ day: string /* YYYY-MM-DD UTC */; bug: number; idea: number; general: number }>; // exactly 30 entries, oldest first, zero-filled
  recent: Array<{ id: string; type: FeedbackType; message: string /* ≤ 200 chars */; created_at: string; hidden: boolean }>; // 5 newest, any status
  checklist: { widgetSeen: boolean; notifications: boolean; firstFeedback: boolean };
  widgetSeenAt: string | null;
  integrations: { telegram: boolean; discord: boolean };        // enabled telegram_shared|telegram_custom / discord
}
```

- `hidden` rows are over-quota feedback of a non-Pro owner (same predicate as `hiddenFeedbackCount`); their message is never returned (empty string) and the UI shows a blurred placeholder row linking to `/app/billing`.
- `series` uses `generate_series` over the last 30 UTC days left-joined with grouped counts.
- `checklist.widgetSeen = widget_seen_at is not null`; `notifications = telegram || discord`; `firstFeedback = any feedback row exists` (existing `hasFeedback`).

### Migration

`supabase/migrations/20260925000100_widget_seen_at.sql`: `alter table public.projects add column widget_seen_at timestamptz;` No RLS change (owners already read their projects; the widget endpoint writes with the server connection). Applied to the cloud DB with the owner's consent (`supabase db push`).

### Widget "seen" ping (`lib/widget/config.ts`)

After a successful project lookup in `handleConfig`, fire-and-forget (via `deps.after` if available, else `void`):
`update public.projects set widget_seen_at = now() where id = $1 and (widget_seen_at is null or widget_seen_at < now() - interval '1 hour')`. A failure is logged and never affects the config response. The dashboard preview does not call this endpoint (it passes the config directly), so previews never mark a project as seen.

### UI (`components/app/overview/`)

Top to bottom, matching `dashboard-shell.html`:
1. `h1` "Overview" (800 weight) + project name as a subtitle.
2. **Checklist** card (only while not all done): title "First steps · N of 3", three step tiles with an animated check when done; each undone step has a link button: "Install the widget" → Install, "Connect notifications" → Integrations, "Get your first feedback" → Install (with the hint "send a test from your site").
3. **Four stat cards:** New, Resolved, Last 30 days, This month's limit (`13 / 20` or "Unlimited"). Numbers count up on first render (client component, 400 ms, `requestAnimationFrame`, skipped under reduced motion; the server-rendered final value is the initial text so no-JS and tests see the real number).
4. **Chart card** "Feedback, last 30 days": 30 stacked bars (bug = `--primary`, idea = amber `#F5B400` (dark: `#E0A800`), question = warm grey `#8A7F7B` (dark: `#A8998F`)), legend, tooltips via `title` with the date and counts; bars grow from 0 on first render. Plain HTML/CSS, no chart library. Empty (all zero): muted text "No feedback yet".
5. **Recent feedback** card: 5 rows (type pill, message, relative time) linking to `/app/p/:id/feedback?f=<id>&status=<its status>`; "All feedback →". Empty: "Nothing yet — install the widget to start."
6. **Connections** row: Widget ("On your site · seen 5 min ago" / "Not seen yet" → Install), Telegram, Discord ("Connected" / "Not connected" → Integrations).

## 3. Feedback feed and detail

Restyle of `app/app/p/[projectId]/feedback/page.tsx` and `components/app/feedback/*`; data functions unchanged except `listFeedback` also returns, per item, `url` (page path from metadata), `browser`, `email` (for the meta line); and a new `statusCounts(projectId)` → `{ new, resolved, archived }` for the tab badges (visible rows only).

- Header: `h1` "Feedback", the existing auto-refresh indicator; **status tabs** (segmented control: New (count badge) / Resolved / Archived); **type chips** (All / Bugs / Ideas / Questions) — same query params as today (`status`, `type`), same `data-testid`s.
- Rows: type pill (Bug = red tint, Idea = amber tint, Question = grey tint; dark-theme tints from tokens), two-line clamped message, meta line `path · browser · email`, screenshot thumbnail (signed URL is NOT fetched per row — the row shows a neutral thumbnail placeholder icon when `has_screenshot`), relative time. Selected row: tinted background + 3 px coral inset bar.
- Hidden over-quota placeholders and the "Upgrade to see N more" row keep their behaviour, restyled.
- Detail panel (right, 420 px; full-screen sheet on mobile as today): header with type pill, date, close; screenshot (existing `ScreenshotViewer`, larger, rounded); message; data table (page, browser, OS, viewport, screen, language, timezone, user, email); console errors in a dark monospace block; actions: **Resolve** (primary) / **Reopen** when resolved, **Reply** (only with an email: `mailto:` with subject "Re: your feedback"), **Archive**, **Delete** (confirm dialog, existing). Panel slides in from the right (200 ms).
- Empty states (component `EmptyState({ icon, title, body, action? })`):
  - no feedback at all in the project: 🐞 "It's quiet here" + "As soon as a visitor sends feedback it shows up here and in Telegram." + button "Install the widget";
  - `new` tab empty but the project has feedback: ✅ "All caught up" + "Open resolved";
  - `resolved` / `archived` empty: short text, no button;
  - filtered by type and empty: "No {type} in {status}" + "Clear filter".

## 4. Other pages

Same functionality, new look (cards with 12 px radius, `--border`, 800-weight `h1`, section descriptions in `--muted-foreground`, primary coral buttons, consistent spacing):
- **Install:** steps 1-2-3 ("Copy the snippet", "Paste before `</body>`", "Open your site — the checklist ticks itself"); code blocks in a dark block with the existing copy button; the "hide trigger / Bugping.open()" and "identify" sections as cards; a live status line "Widget seen 5 min ago" / "Not seen yet".
- **Integrations:** Telegram and Discord cards with status chips (Connected / Not connected / Error with the last error), existing actions; empty-ish state text when none connected.
- **Settings:** grouped cards (Appearance with the live widget preview, Behaviour, Allowed websites, Custom CSS (Pro), Danger zone).
- **Billing, Account, New project:** restyled cards; New project with a welcome block (ladybug mark, "Create your first project") when the user has no projects.

## 5. Motion, themes, accessibility

- All motion via Tailwind utilities / `tw-animate-css` classes and small CSS keyframes in `globals.css`; durations 200–500 ms (theme cross-fade 800 ms); one `@media (prefers-reduced-motion: reduce)` block disables animations/transitions for the dashboard (`.app-motion *` or equivalent scope) and the count-up/bar-grow scripts check `matchMedia`.
- Page enter: content fades in and moves up 6 px (300 ms) on route change (a keyed wrapper in the project layout).
- Every new colour uses theme tokens (or explicit light/dark pairs listed above); both themes are checked visually.
- Icons have `aria-hidden`; nav items are links with text; the theme switch is a labelled `role="switch"`; tabs use `aria-current`/`aria-pressed` consistent with today's filters; empty-state buttons are real links.

## 6. Testing

- Unit / DB (Vitest + PGlite):
  - `getOverview`: counts incl. hidden, 30-day zero-filled series by type in UTC, recent 5 with hidden rows masked, checklist flags, integrations flags, non-owner → null;
  - `statusCounts`; `listFeedback` new fields (`url` path, `browser`, `email`);
  - config ping: sets `widget_seen_at` when null, doesn't rewrite within an hour, rewrites after an hour, never fails the config response;
  - migration applies (PGlite runs all migrations).
- Component tests (Vitest `components/**/*.test.tsx`, `renderToStaticMarkup` where possible): `EmptyState` variants; theme toggle renders `role="switch"` with the right `aria-checked` for each theme.
- E2E (`apps/web/e2e`): login → `/app` lands on Overview with the checklist; the checklist's widget step turns done after the widget config endpoint is requested with that project's public key (config ping); feed → detail → Resolve moves the item and updates the tab count; theme toggle switches `html.dark` and persists across reload; existing dashboard, billing and login specs updated for the new shell and still pass.
- Controller visual pass: every page, light and dark, desktop and 390 px.
