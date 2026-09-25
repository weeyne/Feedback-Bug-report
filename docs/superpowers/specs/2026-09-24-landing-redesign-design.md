# Landing redesign (stage 4 of 4) — design

Stage 4 of the Bugping redesign (Gleap as reference). Stages 1–3 (brand, widget, dashboard) are on `main`.
This stage rebuilds the marketing landing page, adds a live product demo built from the real widget and
real dashboard components, and adds the theme toggle to the landing and login pages.

Owner decisions (brainstorm, 2026-09-24):

- Audience: mixed — the main copy speaks to developers and small teams; a "Who it's for" section adds
  online stores and web studios/freelancers.
- Demo: a scripted **live demo built from real code**, not a video or GIF. Everything that exists in the
  product must look exactly as in reality: the real widget, its real "Edit" button and the real
  annotation process, the real dashboard components. Nothing may be shown that does not exist (e.g. no
  dashboard card popping up on the customer's site).
- Trust: honest facts + a note from the author signed "Bugping developer" / «Разработчик Bugping».
  No testimonials until real ones exist; no fake ones ever.
- Hero: centered text with the large demo window under it (Gleap-like).
- Scroll animations: light (fade-up reveal, staggered cards, hover lift). No scroll-pinned storytelling.

## 1. Page structure

`apps/web/app/(marketing)/page.tsx`, top to bottom. Section ids in brackets are anchor targets.

1. **Header** (sticky; in `(marketing)/layout.tsx`): logo · nav links Features `#features`, How it works
   `#how`, Pricing `#pricing`, FAQ `#faq` · `ThemeToggle` · "Log in" (`/login`; the login page already
   redirects signed-in users to `/app`, so the page stays static) · primary "Start free" (`/login`).
   On scroll (an IntersectionObserver sentinel at the top of the page) the header gets
   `backdrop-blur`, a translucent `bg-background/80` and a bottom shadow. Below `md` the nav links,
   the toggle and "Log in" move into a `Sheet` opened by a ☰ button (`landing-menu`).
2. **Hero** (`#top`): badge "New: your own screenshots with markup"; `h1` with the word "earlier"
   in `text-primary`; subtitle; primary "Start free" (`landing-cta`, `/login`) + outline "See how it
   works" (scrolls to the demo); small muted note. Background: soft coral radial glow + the dot grid
   from the login page, both themes. Under the text: the **demo window** (§2).
3. **Facts strip**: four facts + a "Works on any site where you can add a script: HTML, React, Vue,
   WordPress, Shopify, Tilda" line (plain text names, no third-party logos).
4. **Features** (`#features`): bento grid (one large tile + five regular) — Screenshot & markup
   (large), Instantly in your chat, Full context, Dashboard, Lightweight, Your brand. Each tile has a
   lucide icon and a small static illustration built with CSS (no images).
5. **How it works** (`#how`): three numbered steps; step 2 shows the real install snippet (the same
   markup string the Install page uses, with a placeholder key `pk_your_project_key`) in
   `bg-zinc-950 text-zinc-100 font-mono` with the existing `CopyButton`.
6. **Who it's for**: three cards — Developers & SaaS, Online stores, Web studios & freelancers.
7. **From the author**: short note, signature "Bugping developer", `LadybugMark` avatar; points to
   the live widget in the corner.
8. **Pricing** (`#pricing`, keeps `data-testid="landing-pricing"`): Free / Pro (highlighted,
   "Popular" badge) / Lifetime cards with check lists. Free → `/login`; Pro and Lifetime → `/app/billing`
   (keeps `landing-pricing-cta` on the Pro button). Prices and limits come from the same copy as today
   ($9/month, $49 once, 20 reports/month, 30-day / 1-year screenshots).
9. **FAQ** (`#faq`): seven questions as a native `<details>` accordion (no JS), animated chevron.
10. **Final CTA**: full-width coral band, "Your first report — today" + "Start free".
11. **Footer** (`SiteFooter`, restyled): logo, links (Pricing, Log in, Privacy, Terms, Refunds),
    `LocaleSwitcher`, `ThemeToggle`, © Bugping.

`OwnWidget` (the owner's live widget in the corner) stays.

The legal pages (privacy, terms, refund) share the layout, so they get the new header and footer
without other changes.

## 2. Live demo

### 2.1 Stage

`components/marketing/demo/demo-stage.tsx` (client). A fixed 1280×720 logical canvas inside a browser
frame (traffic-light dots + a URL bar), scaled with `transform: scale()` to the container width
(ResizeObserver), so it looks identical on every screen. A scene label chip above the frame:
"Your customer's site" → "Your Telegram" → "Your Bugping dashboard"; the URL bar shows
`shop.example.com/checkout`, then `Telegram`, then the app host from `NEXT_PUBLIC_APP_URL`.

The whole stage is `aria-hidden` and `inert` with `pointer-events: none`; a visually hidden paragraph
describes the flow for screen readers and crawlers.

Lifecycle: nothing loads until the stage is within 200 px of the viewport (it is in the hero, so
usually right after first paint via `requestIdleCallback`/`setTimeout` fallback). The script pauses
when the stage leaves the viewport or `document.hidden`, and resumes where it stopped. One loop is
~20 s; at the end all scenes reset and it starts over.

Reduced motion (`prefers-reduced-motion: reduce`): the script does not autoplay. The stage shows three
static frames (one per scene, rendered from the same components in their final state) with a
"▶ Play demo" button that plays the loop once on request.

### 2.2 Scene 1 — the customer's site (real widget)

`app/demo/shop/page.tsx`: a static fake store page ("Nova sneakers", price, a dark "Pay" button) with
`robots: noindex`, excluded from the sitemap, loaded in a same-origin `<iframe>` inside the stage.
It mounts the **real widget** through the existing preview module (`/w/preview.js`, `mountWidget`) with
`preview: false` and custom `deps` (`PanelDeps`):

- `loadCapture` / `loadAnnotate`: the real ones (the same lazy chunks from `/w/`), so the screenshot is
  a real capture of the store page and the editor is the real annotation editor.
- `submit`: never touches the network; resolves `{ ok: true }` after ~600 ms and hands the payload and
  the screenshot blob to the demo (a `window.postMessage` to the parent, same origin checked).
- `collectMetadata`: the real one; `now`: `performance.now`.
- Config: brand colour `#E0321F`, locale = the page locale (`?lang=ru|en`), default position.

If `preview.js` cannot pass `deps` today, the widget package gains the smallest change that lets it
(the `MountOptions.deps` field already exists). No new network endpoints.

The **director** (`components/marketing/demo/director.ts`) drives the iframe with real DOM events on
the widget's open shadow root and the editor's shadow root, and moves a drawn cursor (an absolutely
positioned SVG in the stage) to each target's bounding box before acting:

1. cursor to the launcher → click → home screen;
2. click "Report a bug" → the form opens and the real auto-capture runs (wait for the screenshot
   block's ready state);
3. click the screenshot block's **Edit** button → the real editor opens; select the rectangle tool;
   drag a rectangle around the Pay button (pointerdown / pointermove steps / pointerup);
4. click **Done** → back to the form with the annotated thumbnail;
5. type "The pay button does nothing" / «Кнопка оплаты не работает» character by character
   (`input` events, ~45 ms per char);
6. click **Send** → the real "Thanks" screen.

Selectors come from the widget's existing class names (`.bp-*`); a unit test pins them against the
widget's own markup so a widget change that breaks the demo fails CI instead of the live page.
If any step cannot find its target within 3 s, the director stops, shows the final static frames and
logs one `console.warn` — the landing never shows a broken half-state.

### 2.3 Scene 2 — Telegram (faithful replica)

The real Telegram cannot be embedded, so `components/marketing/demo/telegram-chat.tsx` renders a
faithful replica of a Telegram chat: header with the bot avatar (ladybug), name "Bugping", "bot";
chat wallpaper-style background (a CSS gradient + subtle pattern drawn with CSS; no Telegram assets);
one incoming photo message: the **annotated screenshot blob from scene 1** plus the caption produced by
the **real `formatTelegram`** from `apps/web/lib/notify/format.ts` for the demo payload (project
"Nova Shop", the typed message, the demo URL, the real metadata collected in scene 1, one console
error line), rendered by a tiny whitelist renderer (`b`, `a`, `code`, line breaks; text escaped).
Time stamp and read ticks. Light and dark variants follow the site theme. The bot's text stays in
English because the real bot sends English.

### 2.4 Scene 3 — the dashboard (real components)

`app/demo/dashboard/page.tsx` (`noindex`, not in the sitemap, same-origin iframe): renders the real
dashboard components with fixture data and no database — the sidebar/app shell pieces, the feed header
with status tabs (New 1), one selected `feedback-row` and the `FeedbackDetailPanel` with the demo
message, page, browser and one console error. Links and actions are disabled (the iframe is inert).
The screenshot `<img>` in the row and the detail panel gets the scene-1 blob via `postMessage`
(object URL) right before the scene is shown. Theme and locale follow the landing (`?lang=` and the
`theme` value passed in the query and applied as the `html` class).

### 2.5 Timeline

Scene 1 ~12 s, cross-fade 500 ms, scene 2 ~3.5 s (message bubble slides in after 300 ms), cross-fade,
scene 3 ~4 s (row appears, detail panel slides in), fade out, reset. Durations are constants in
`director.ts`.

## 3. Visual and motion

- Tokens only (the same `globals.css` tokens as the dashboard); any literal colour has a light/dark pair.
  Headings Manrope 800 (`font-extrabold tracking-tight`); `h1` in the hero `text-4xl sm:text-6xl`.
- Cards: `rounded-2xl border bg-card`; hover `-translate-y-0.5` + `shadow-lg`, 200 ms.
- **Reveal**: a small client component `Reveal` (IntersectionObserver, `threshold: 0.15`, once) adds
  `data-shown` to its element; CSS `.reveal` fades up 16 px over 500 ms `cubic-bezier(.4,0,.2,1)`;
  children with `--i` stagger 80 ms. The hidden start state applies only when `html` has the
  `js` class (set by an inline script in the root layout), so without JS everything is visible.
  Reduced motion: no transform/opacity animation, content visible.
- Smooth anchor scrolling: `scroll-behavior: smooth` on `html` (disabled under reduced motion) and
  `scroll-margin-top` on sections for the sticky header.
- Login page: `ThemeToggle` in the top-right corner (the back link stays top-left).

## 4. Copy

All strings in `apps/web/messages/{en,ru}.json` under `landing.*` (ru texts approved in the
brainstorm; en written to match). Facts must stay true: widget size "≈15 KB" (the gzipped
`widget.js` budget), no claims of features the product lacks. The old `landing.*` keys that the new
page no longer uses are removed; `messages.test.ts` parity stays green.

## 5. Constraints

- English code/comments/commits/docs; commit trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- The landing stays statically rendered; no database access on `/`, `/demo/*`.
- Demo pages: `robots` `noindex, nofollow`, not in `sitemap.ts`; they make no API calls.
- No new runtime dependencies; no images besides generated CSS/SVG and the widget's own capture.
- Keep existing test ids: `landing-cta`, `landing-pricing`, `landing-pricing-cta`, `login-back`.
  New: `landing-header`, `landing-menu`, `landing-demo`, `demo-scene` (with `data-scene="site|telegram|dashboard"`),
  `landing-faq`, `theme-toggle` (on landing and login).
- Motion 200–500 ms (theme cross-fade 800 ms), transform/opacity only, all disabled under
  `prefers-reduced-motion: reduce`.
- Widget budgets unchanged (`widget.js` ≤ 20 KB gz; screenshot ≤ 40 KB; annotate ≤ 15 KB).

## 6. Testing

- Unit (Vitest):
  - director: with fake timers and a fake widget DOM, runs all steps in order, pauses/resumes,
    resets after the loop, and falls back to static frames when a target is missing;
  - the demo caption equals `formatTelegram(demoMessage).full`;
  - the Telegram whitelist renderer escapes everything outside `b`/`a`/`code`;
  - widget selector pin test (§2.2);
  - `Reveal` shows content immediately under reduced motion.
- E2E (Playwright):
  - landing: all sections present, nav anchors scroll, CTAs link correctly, theme toggle switches and
    persists;
  - demo: reaches `data-scene="dashboard"` within 30 s, and no request goes to `/api/v1/widget/*`
    from the demo iframes during the loop;
  - mobile 390×844: the ☰ menu opens with nav + theme toggle; no horizontal overflow;
  - login page has a working theme toggle;
  - `/demo/shop` and `/demo/dashboard` send `noindex`.
- Visual pass: light/dark × ru/en × 1280/390 px screenshots reviewed before merge.
