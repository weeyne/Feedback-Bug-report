# Landing redesign (stage 4) — implementation plan

Spec: `docs/superpowers/specs/2026-09-24-landing-redesign-design.md` (binding). Branch: `feat/landing-redesign`.

Process: one fresh implementer subagent per task (commits its own work), then a separate reviewer
subagent checks the diff against the task text and the spec; fix rounds until clean. After the last
task: one whole-branch review, one fix wave, one re-review.

Every task runs, from the repo root: `pnpm typecheck`, `pnpm test`, `pnpm format:check`.
UI tasks also run `pnpm --filter @bugping/web e2e`. Widget changes also run
`pnpm --filter @bugping/widget build`, `pnpm --filter @bugping/widget size`,
`pnpm --filter @bugping/widget check:bundle` and `pnpm --filter @bugping/widget e2e`.
Before every commit: `git checkout apps/web/next-env.d.ts apps/web/AGENTS.md 2>/dev/null || true`.
Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Architecture decisions (made before the tasks)

- **The widget already accepts custom deps.** `mountWidget(container, config, { deps })` passes
  `deps` whenever `preview` is not true. The smallest widget change is therefore *exports only*:
  `src/preview.ts` additionally exports `createScreenshotLoader`, `createAnnotateLoader`,
  `collectMetadata` and `installConsoleBuffer`, so `/demo/shop` can build the real `PanelDeps`
  (the real lazy chunks from `/w/`, the real metadata collector and console buffer). `widget.js`,
  `screenshot.js` and `annotate.js` are untouched, so their budgets cannot move.
- **Selectors live with the widget.** `packages/widget/src/demo-selectors.ts` exports a frozen
  `DEMO_SELECTORS` object (launcher, bug card, shot block ready state, Edit button, editor host,
  rect tool, canvas, Done, message textarea, Send, thanks). The package gains an
  `"./demo-selectors"` export; the web app adds `@bugping/widget` to `transpilePackages` and
  imports it. A widget unit test mounts the real UI (and the real editor) in happy-dom and asserts
  that every selector matches, so a widget markup change fails CI.
- **Locale and theme of the demo iframes.** Both demo pages are same-origin, so they get the same
  `locale` cookie / `Accept-Language` (next-intl request locale) and the same `next-themes`
  localStorage value (plus its `storage` event on toggle) as the landing. No `?lang`/`?theme`
  plumbing is needed; the pages read the locale with `getLocale()`.
- **One source for browser/OS.** `describeAgent` moves out of `lib/widget/submit.ts` into
  `lib/widget/user-agent.ts` (exported, unchanged behaviour). The Telegram caption and the demo
  dashboard both derive `browser`/`os` with it from the metadata collected in scene 1, so the
  three scenes show the same facts. The demo code loads it with a dynamic `import()` so
  `ua-parser-js` stays out of the landing's first-load JS.
- **Scene 3 shows the report from scene 1.** The stage loads `/demo/dashboard` when scene 1 has
  finished, passing the demo report (message + client metadata) as a base64url JSON `?r=` query.
  The page validates it with the shared `ClientMetadataSchema` and length limits and falls back to a
  built-in fixture when missing/invalid. The screenshot blob arrives by `postMessage` (object URL).
  The page never touches the database or any API.
- **Director is DOM-adapter based.** `director.ts` is plain TS with injected `clock`
  (`setTimeout`/`clearTimeout`), a `stage` adapter (cursor move, scene switch, fallback) and the
  iframe window. Unit tests (Vitest, node environment — the web app has no DOM env) use fake
  shadow roots/elements.

## Tasks

### Task 1 — Widget exports, selectors, `/demo/shop`

Widget:
- `src/preview.ts`: also export `createScreenshotLoader`, `createAnnotateLoader`, `collectMetadata`,
  `installConsoleBuffer` (+ types). Update the header comment.
- `src/demo-selectors.ts` + `package.json` export `./demo-selectors`.
- `src/demo-selectors.test.ts` (happy-dom): mount with fake deps whose `loadCapture` resolves a tiny
  blob and whose `loadAnnotate` returns the real `annotate`/`openEditor` with a fake `EditorEnv`
  where needed; walk launcher → bug card → shot ready → Edit → editor (rect tool, canvas, Done) →
  message → Send → thanks, asserting each `DEMO_SELECTORS` entry matches exactly one element at that
  step.
Web:
- `next.config.ts`: `transpilePackages: ['@bugping/shared', '@bugping/widget']`.
- Each demo page keeps the root layout and exports `metadata.robots = { index: false, follow: false }`.
- `app/demo/shop/page.tsx` (server) + `components/marketing/demo/shop-widget.tsx` (client):
  a static fake store "Nova sneakers" (product card with a CSS-drawn sneaker, price, size chips,
  dark "Pay" button with a stable id `demo-pay`), strings via next-intl (`demoShop.*`), literal
  colours only with light/dark pairs. The client component loads `/w/preview.js` like
  `widget-preview.tsx`, installs the real console buffer, then on load the store logs one real
  `console.error` (a plausible payment script failure) that the buffer captures, and mounts the
  widget with `preview: false`, config `{ primaryColor: '#E0321F', locale: <page locale>,
  position: default, … valid WidgetConfig }` and deps:
  - `loadCapture`/`loadAnnotate`: `createScreenshotLoader('/w/screenshot.js')`,
    `createAnnotateLoader('/w/annotate.js')`;
  - `collectMetadata: () => collectMetadata(window, buffer.entries())`; `now: performance.now`;
  - `submit`: no network; after 600 ms posts `{ type: 'bugping-demo:submitted', payload, screenshot }`
    to `window.parent` with `targetOrigin = location.origin`, resolves `{ ok: true }`.
  Also posts `{ type: 'bugping-demo:ready' }` once mounted, and exposes nothing on `window`.
- Not in `sitemap.ts`; noindex via page metadata.
- Unit test for the shop's submit bridge (message shape, origin) where it is pure.

### Task 2 — Director

`components/marketing/demo/director.ts` (+ `director.test.ts`):
- Constants: step timings; scene durations (site ~12 s, telegram ~3.5 s, dashboard ~4 s, fade
  500 ms); `STEP_TIMEOUT_MS = 3000`; `TYPE_MS = 45`; demo message per locale.
- `createDirector({ frame: () => Window | null, stage, clock, locale, onSubmitted })` returns
  `{ start(), pause(), resume(), stop(), state() }`.
- Steps exactly as spec §2.2 on the widget's open shadow root (`[data-bugping]`) and the editor's
  shadow root (`[data-bugping-annotate]`): launcher click → bug card click → wait shot ready →
  Edit click → rect tool (click to be explicit) → drag a rectangle around `#demo-pay`
  (pointerdown, 12 pointermove steps, pointerup on the canvas, with `pointerId: 1`,
  `isPrimary: true`, client coordinates of the pay button padded by 10 px) → Done → wait thumb
  ready again → type the message char by char (`value += ch`, `input` event) → Send → wait thanks.
- Before each action, `stage.moveCursor(x, y)` to the target's centre (iframe coordinates) and wait
  for the cursor transition (~450 ms), then `stage.press()`.
- `waitFor(selector)` polls every 100 ms up to 3 s; on timeout: `console.warn` once, `stage.fallback()`,
  stop.
- Pause/resume: all waiting goes through the injected clock; `pause()` freezes the timeline (pending
  timers are cleared and remembered with their remaining time) and `resume()` continues.
- Loop: after scene 3 `stage.reset()` (reloads iframes) and starts over.
- Tests with a fake clock and fake DOM: full run in order, pause/resume, reset after the loop,
  fallback when a target is missing.

### Task 3 — Telegram replica

- `lib/widget/user-agent.ts` (move `describeAgent`, export; `submit.ts` imports it; test).
- `components/marketing/demo/demo-report.ts`: `buildDemoMessage({ payload, dashboardUrl })` →
  `FeedbackMessage` (project "Nova Shop", type from payload, message, email null, metadata =
  client metadata + `describeAgent`, screenshot null) and `demoCaption(m) = formatTelegram(m).full`.
- `components/marketing/demo/telegram-html.tsx`: whitelist renderer for Telegram HTML: `<b>`,
  `<a href>` (http(s) only; rendered as a non-navigating span/anchor styled as a link), `<code>`,
  `\n` → `<br>`; entities decoded; everything else as text. Returns React nodes (never
  `dangerouslySetInnerHTML`).
- `components/marketing/demo/telegram-chat.tsx`: header (ladybug avatar via `LadybugMark`/
  existing brand SVG, "Bugping", "bot"), wallpaper (CSS gradient + CSS pattern), incoming photo
  bubble (image = object URL of the scene-1 blob, or a text-only message when there is no image),
  caption, time stamp, read ticks; light/dark pairs.
- Tests: caption equals `formatTelegram(buildDemoMessage(...)).full`; renderer escapes everything
  outside `b`/`a`/`code` (script tags, attributes, `javascript:` hrefs, nested tags).

### Task 4 — `/demo/dashboard`

- `app/demo/dashboard/page.tsx` (noindex, dynamic, no DB): decodes `?r=` (see decisions) into a
  `FeedbackDetail` + `FeedbackListItem`; renders the real sidebar (`AppShell` or its pieces with
  fixture projects/usage — a project "Nova Shop"; `ProjectNav` needs the current project/section:
  add an optional `pathname` prop override, defaulting to `usePathname()`), the real feed header
  (`h1`, `StatusTabs` with counts `{ new: 1, resolved: 0, archived: 0 }`, `TypeChips`, `UsageBar`),
  `FeedbackList` with the one row selected, and `FeedbackDetailPanel` with a placeholder
  screenshot src.
- `components/marketing/demo/dashboard-bridge.tsx` (client): listens for
  `{ type: 'bugping-demo:screenshot', blob }` from `window.parent` (same origin check), sets the
  object URL on the detail panel's screenshot `<img>`(s), revokes the previous one; posts
  `{ type: 'bugping-demo:dashboard-ready' }` to the parent on mount.
- Detail panel `created_at` = now; the row time shows "now".
- Tests: `?r=` decoding (valid, invalid → fixture, oversized → fixture).

### Task 5 — Demo stage

`components/marketing/demo/demo-stage.tsx` (client) + small helpers:
- Browser frame (traffic lights, URL bar: `shop.example.com/checkout` / `Telegram` / app host from
  `NEXT_PUBLIC_APP_URL` via `getPublicEnv`), scene label chip, 1280×720 canvas scaled with
  `transform: scale()` by a ResizeObserver (the transform is on the canvas inside the frame, not on a
  page-level wrapper).
- `data-testid="landing-demo"` on the stage, `data-testid="demo-scene"` + `data-scene` on the visible
  scene; `aria-hidden`, `inert`, `pointer-events: none` on the frame; a visually hidden paragraph
  describing the flow.
- Lazy start (IntersectionObserver `rootMargin: 200px`, then `requestIdleCallback`/`setTimeout`),
  pause when off-screen or `document.hidden`, resume.
- Scenes cross-fade (opacity 500 ms). Drawn cursor (SVG) with a press ripple.
- Scene 2 → after 300 ms the bubble slides in; scene 3 → dashboard iframe (loaded with `?r=` when
  scene 1 finished; the director waits for `dashboard-ready` up to 8 s), post the screenshot, show.
- Reduced motion: no autoplay; three static frames (the shop page with the widget opened on the bug
  form — `?static=1` on `/demo/shop` opens the form and fills the message without the director;
  the Telegram replica with the fixture report; the dashboard page with the fixture report) and a
  "▶ Play demo" button that plays one loop.
- Fallback (director failure): the same static frames.

### Task 6 — Marketing layout

- `components/marketing/site-header.tsx`: sticky header per spec §1.1 with `data-testid="landing-header"`;
  scroll sentinel → `data-scrolled` → `backdrop-blur bg-background/80 shadow`; nav anchors
  `/#features` etc. (work from legal pages too); `ThemeToggle`; "Log in" and "Start free" as
  `<Link className={buttonVariants(...)}>`; below `md` a ☰ `Sheet` (`data-testid="landing-menu"` on
  the trigger) with the nav links, `ThemeToggle` and "Log in"; closes on link click.
- `SiteFooter` restyled (logo, links Pricing/Log in/Privacy/Terms/Refunds, `LocaleSwitcher`,
  `ThemeToggle`, © Bugping).
- Login page: `ThemeToggle` top-right (`data-testid="theme-toggle"` comes from the component).
- `html.js` class via an inline script in the root layout (`document.documentElement.classList.add('js')`).

### Task 7 — Landing sections and copy

- Sections §1.2–§1.10 in `app/(marketing)/page.tsx` split into `components/marketing/landing/*`.
- `Reveal` client component (+ CSS `.reveal`, `--i` stagger, `html.js` guard, reduced motion) and its
  test.
- Smooth scrolling + `scroll-margin-top` in `globals.css` (disabled under reduced motion).
- en/ru copy under `landing.*`; remove unused old keys; `messages.test.ts` green.
- Install snippet: the same string shape as the Install page with `pk_your_project_key` and the
  app URL; `CopyButton`.

### Task 8 — E2E and visual pass

- `apps/web/e2e/landing.spec.ts` per spec §6 (sections, anchors, CTAs, theme persist, demo reaches
  `dashboard` in 30 s with no `/api/v1/widget/*` request, mobile menu + no overflow, login toggle,
  noindex on `/demo/*`).
- Screenshots light/dark × ru/en × 1280/390 into the scratchpad; review and fix.
