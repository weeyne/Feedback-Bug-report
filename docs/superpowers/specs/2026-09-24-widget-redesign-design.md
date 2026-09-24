# Widget redesign + own screenshot + annotation (redesign stage 2 of 4)

**Status:** approved in brainstorming, 2026-09-24
**Stage order:** 1 brand foundation (done) → **2 widget** (this spec) → 3 dashboard → 4 landing with demo.
**Reference:** Gleap's widget.

## Goal

Replace the embeddable widget's plain pill button and single form with a Gleap-like experience: a
round launcher, a home screen with three choices, a polished form, restrained animations, a
compact speed-dial + bottom sheet on phones, and a screenshot block where the visitor can use the
automatic page capture, attach their own image (file, paste, drag-and-drop) and annotate it
(rectangle, pen, blackout) before sending.

## Decisions (from brainstorming)

| Topic | Decision |
|---|---|
| Screenshot scope | Choose the source (auto capture / own file / paste / drop) **and** annotate. One image per feedback. |
| Desktop flow | Option A: launcher → home screen (greeting header + three cards) → form with a back arrow. |
| Mobile flow (viewport ≤ 640 px) | Option C: launcher → speed-dial of three labelled round buttons → form as a bottom sheet. |
| Type labels | `bug` "Report a bug", `idea` "Suggest an idea", `general` "Ask a question" (the `general` type id is unchanged). |
| Animations | Short (150–250 ms), opacity/transform only, disabled under `prefers-reduced-motion`. |
| Annotation code | Separate lazy chunk `annotate.js`, loaded only when the visitor opens the editor. |
| Server / DB | Unchanged: one screenshot part, `image/webp|png|jpeg`, ≤ 2 MB (`SCREENSHOT_MAX_BYTES`). |

## Out of scope

- Several images per feedback (needs server + schema changes).
- Customizable greeting/header text in the dashboard (stage 3 may add it).
- Annotation text labels, arrows, color picker, zoom/pan inside the editor.
- The viewport-accurate capture rework listed in `docs/superpowers/followups/2026-09-22-widget-followups.md` (capture code in `screenshot.ts` is reused as-is).

## 1. Architecture

### Bundles (`packages/widget`)

| File | Contents | Budget (gzip) |
|---|---|---|
| `dist/widget.js` | launcher, home screen, speed-dial, form, screenshot block, image preparation, thanks screen, styles, i18n | ≤ 20 KB (`.size-limit.json`, unchanged) |
| `dist/screenshot.js` | unchanged automatic capture (`capture(exclude)`) | ≤ 40 KB (unchanged) |
| `dist/annotate.js` (new) | full-screen annotation editor | ≤ 15 KB (new `.size-limit.json` entry) |
| `dist/preview.js` | dashboard preview entry (same UI code) | not limited |

- New Vite config `vite.annotate.config.ts` (ES module, `lib.entry: 'src/annotate/index.ts'`, `fileName: () => 'annotate.js'`, `emptyOutDir: false` so it doesn't wipe `screenshot.js`). The `build` script becomes: screenshot → annotate → widget → preview.
- `__WIDGET_VERSION__` in `vite.widget.config.ts` hashes **both** `screenshot.js` and `annotate.js`, so either change busts caches.
- `apps/web/scripts/copy-widget.mjs` copies `annotate.js` too.
- `scripts/check-bundle.mjs` also checks `annotate.js` for the forbidden list (`innerHTML`, `insertAdjacentHTML`, zod).
- Loading: a generic `createChunkLoader<T>(moduleUrl, pick)` replaces the screenshot-specific loader internals (`screenshot-loader.ts` keeps its exported `createScreenshotLoader` signature on top of it); `createAnnotateLoader` loads `annotate.js?v=…` next to the script, returning `null` on any failure. Both are memoized per page.

### Source layout (`packages/widget/src`)

The 430-line `ui/panel.ts` is split by responsibility:

| File | Responsibility |
|---|---|
| `ui/mount.ts` | shadow root, styles, accent/contrast variables, wires launcher + panel (existing; extended) |
| `ui/launcher.ts` (replaces `trigger.ts`) | round launcher button; icon swaps chat ↔ close; tooltip = `config.triggerText` |
| `ui/panel.ts` | panel shell, screen switching (`home` / `form` / `thanks`), open/close, focus trap, Escape, desktop vs sheet layout |
| `ui/home.ts` | desktop home screen: header + three cards |
| `ui/dial.ts` | mobile speed-dial |
| `ui/form.ts` | form screen: back arrow, message, screenshot block, email, honeypot, status/retry, send |
| `ui/shot-block.ts` | screenshot block state machine (section 2) |
| `ui/thanks.ts` | thanks screen with the check animation |
| `image/prepare.ts` | decode, downscale, re-encode own images (section 2) |
| `annotate/index.ts` (+ `annotate/*.ts`) | the lazy editor (section 3) |
| `ui/styles.css` | all widget styles (existing; rewritten) |

`ui/h.ts`, `api.ts`, `context/*`, `screenshot.ts`, `public-api.ts` keep their roles.

### Public API and embed behavior

- `Bugping.open()` with no argument opens the **home screen** (desktop) or the **speed-dial** (mobile). `Bugping.open('bug' | 'idea' | 'general')` opens that form directly. An invalid argument is treated as no argument (was: treated as `'bug'`).
- `WidgetHandle.open(type?: FeedbackType)` follows the same rule.
- `data-hide-trigger` still hides the launcher; `Bugping.open()` then shows the panel. With the launcher hidden on mobile, `open()` without a type shows the home screen inside the bottom sheet (no speed-dial without a launcher).
- `Bugping.identify()`, the `bugping:ready` event and metadata collection are unchanged.
- Dashboard preview (`mountWidget(..., { preview: true })`): full UI renders; nothing is captured or sent; the screenshot block shows a static placeholder thumbnail and its actions are disabled; the annotate chunk is never loaded.

## 2. Screenshot block and image preparation

### States (`ui/shot-block.ts`)

| State | UI | Actions |
|---|---|---|
| `empty` | dashed box: "📸 Capture this page · 📎 Your file", hint "or paste (Ctrl+V) / drop an image here" | capture, choose file |
| `capturing` | placeholder thumbnail with a shimmer | none (send is allowed) |
| `ready` | thumbnail + "✏️ Annotate", "📎 Replace", "🗑 Remove"; clicking the thumbnail = Annotate | annotate, replace, remove |
| `failed` | "Couldn't capture the page" + "📎 Your file" | choose file, capture again |
| `error` (own image) | inline error text; the previous state and image are kept | as the previous state |

Rules:

- Opening the **bug** form starts an automatic capture (as today, excluding the widget host). **Idea** and **question** forms start in `empty`.
- One image per feedback. A new capture, file, paste or drop replaces the current image and discards its annotations.
- Paste (`paste` event on the panel) and drop (`dragover`/`drop` on the form) are handled only while the form screen is visible; only `image/*` clipboard/drop items are taken, text paste into fields is untouched.
- File input: `<input type="file" accept="image/*">` (hidden, triggered by the action). Source files larger than 20 MB (`OWN_IMAGE_MAX_SOURCE_BYTES = 20 * 1024 * 1024`, widget-local constant) or not decodable produce the `error` message and are ignored.
- Send waits for a pending capture at most 8 s (existing `CAPTURE_WAIT_MS`) and then sends without it. Own images are prepared before they become `ready`, so send never waits on them.
- The block keeps the **original** image (after preparation) and the **annotated** image. Send uploads the annotated one if present, else the original. Reopening the editor starts from the original plus the previous annotation strokes (the editor returns its strokes for this).
- Thumbnails use object URLs, revoked on replace/remove/destroy (existing pattern).

### Image preparation (`image/prepare.ts`)

`prepareImage(blob): Promise<Blob>` — throws a typed `ImageError('not_image' | 'too_large' | 'decode')`:

1. Reject if `blob.size > OWN_IMAGE_MAX_SOURCE_BYTES` (`too_large`) or the type doesn't start with `image/` (`not_image`).
2. Decode with `createImageBitmap(blob)`; fall back to `HTMLImageElement` + object URL where `createImageBitmap` is missing. Decode failure → `decode`.
3. Scale to at most 1600 px wide (`MAX_WIDTH`, same as capture) keeping aspect ratio; never upscale.
4. Encode WebP at quality 0.8; if the browser returns a non-WebP blob, JPEG 0.85.
5. While the result is > `SCREENSHOT_MAX_BYTES`: retry at quality 0.6, then scale ×0.75 and retry, up to 4 attempts total; still too big → `too_large`.

The same function runs the editor's output through steps 4–5 (no downscale needed).

## 3. Annotation editor (`annotate.js`)

Exports `annotate(input: { image: Blob; strokes?: Stroke[]; t: AnnotateMessages; accent?: string }): Promise<{ image: Blob; strokes: Stroke[] } | null>` — `null` means cancelled.

- Full-viewport overlay in **its own** shadow root host appended to `document.body` (z-index above the widget), dark scrim, image fitted to the viewport with padding, toolbar pinned bottom-center on every screen size.
- Tools: **Rectangle** (default; 3 px stroke), **Pen** (freehand, 3 px, rounded joins), **Hide** (solid `#111` filled rectangle). One annotation color: `#FF3B30`, regardless of the project color.
- **Undo** (multi-step, removes the last stroke), **Done**, **Cancel** (✕ button or Escape; also restores focus to the widget).
- Input: Pointer Events (mouse, touch, pen), `touch-action: none` on the canvas, pointer capture during a stroke. Coordinates are stored in image pixel space so the result is resolution-independent.
- Strokes: `type Stroke = { tool: 'rect' | 'pen' | 'hide'; points: [number, number][] }` (rect/hide use two points).
- Done: renders the original image + strokes onto a canvas at the image's natural size, encodes via the preparation step 4–5, resolves `{ image, strokes }`.
- Accessibility: toolbar buttons are real buttons with labels and `aria-pressed`; focus starts on the active tool; Tab stays inside the editor; the canvas has an `aria-label` explaining it's a drawing surface.
- Loading failure in the widget: the block shows "Editor unavailable" under the thumbnail; the image stays and can be sent.

## 4. Look, motion, accessibility, i18n

### Look

- Launcher: 56 px circle (48 px on mobile), project color, chat-bubble icon; on open the icon rotates/cross-fades to ✕. `title`/`aria-label` = `config.triggerText`; `aria-expanded` reflects the panel.
- Panel: 360 px wide on desktop, 16 px radius, soft shadow; bottom sheet on mobile (full width, max 90 vh, grab handle, closes on ✕, Escape or a downward swipe > 80 px on the handle/header).
- Home header: gradient from the project color to a 25 %-lighter tint; title "Hi 👋", subtitle "Found a problem or have an idea? Tell us." Cards: icon tile, title, one-line hint, chevron.
- Foreground color on accent surfaces (launcher, header, send button): white if its WCAG contrast with the project color is ≥ 4.5, otherwise `#1a1414`. Computed in `mount.ts` and exposed as `--bp-on-accent`.
- Dark mode via `prefers-color-scheme` (existing variables extended). Position left/right honoured by launcher, panel and dial.
- "Powered by Bugping" badge in the panel footer when `showBadge`.
- Stable class hooks kept for custom CSS and tests: `bp-root`, `bp-trigger` (the launcher), `bp-panel`, `bp-message`, `bp-email`, `bp-send`, `bp-status`, `bp-retry`, `bp-thanks`, `bp-thumb` (with `data-state`), `bp-badge`. New hooks: `bp-home`, `bp-card` (with `data-type`), `bp-dial`, `bp-dial-item` (with `data-type`), `bp-form`, `bp-back`, `bp-shot` (with `data-state`), `bp-sheet`. The dashboard's custom-CSS hint (`apps/web/messages/{en,ru}.json`) lists the main hooks.

### Motion (all ≤ 250 ms, `transform`/`opacity` only)

- Launcher: scale 1.06 on hover; icon rotate + cross-fade on toggle.
- Panel: scale 0.96 → 1 and fade from the launcher corner (`transform-origin` at the launcher side); sheet slides up on mobile.
- Home → form: slide 16 px + fade; back reverses.
- Speed-dial: items rise and fade in with a 40 ms stagger.
- Capturing: shimmer on the placeholder thumbnail; ready thumbnail fades in.
- Thanks: SVG check stroke draws (`stroke-dashoffset`), then the panel auto-closes after 2 s (existing `THANKS_CLOSE_MS`).
- `@media (prefers-reduced-motion: reduce)`: no transitions/animations at all.

### Accessibility

- Panel `role="dialog"`, labelled by the current screen title; focus moves to the first card (home) or the message field (form); focus trap and Escape (existing behavior) apply to every screen; focus returns to the launcher on close.
- Cards and dial items are buttons with visible labels; the dial is a `role="menu"` with arrow-key navigation and `role="menuitem"` items.
- Field errors are linked with `aria-describedby`; the screenshot block announces state changes through a polite live region. (Closes two items from the widget follow-ups list.)

### i18n

All new strings in `src/i18n.ts` for `en`, `ru`, `uk`, `es`. `Messages` gains: home title/subtitle, card titles and hints for the three types, back, screenshot block labels (capture, your file, paste hint, annotate, replace, remove, capturing, capture failed, editor unavailable, image errors `not_image`/`too_large`/`decode`), and the annotate strings (rectangle, pen, hide, undo, done, cancel, canvas label). `title`/`types` keep existing keys where still used; unused keys are removed.

## 5. Testing

- Unit (Vitest + happy-dom, `packages/widget`):
  - panel screens: launcher → home (desktop) / dial (mobile width), card → form with the right type, back, thanks, reopen resets; `open()` with/without type; hide-trigger mode;
  - shot block: auto capture for bug only, capture failure → `failed`, own file → `ready`, paste and drop of an image, text paste ignored, replace discards annotations, remove, send uses annotated > original, pending capture timeout;
  - `prepareImage`: rejects non-images and > 20 MB, downscale math, never upscales, quality/size retry loop (canvas/`toBlob` stubbed);
  - annotate: tool switching, stroke recording in image space, undo, cancel resolves `null`, done renders strokes (canvas stubbed) and returns strokes;
  - `--bp-on-accent` contrast choice for light and dark project colors;
  - loaders: annotate chunk failure → `null`.
- Playwright (`packages/widget/e2e`, built bundles against the dev mock API):
  - desktop: launcher → home → bug → capture ready → annotate with a rectangle → Done → send → thanks; the submitted image differs from the unannotated capture;
  - paste an image from the clipboard into the idea form → thumbnail ready → send includes a screenshot part;
  - mobile viewport (390×844): dial opens, choose idea → bottom sheet → send;
  - `data-hide-trigger` + `Bugping.open()` → home; `Bugping.open('general')` → question form.
- `apps/web` e2e (`api.spec.ts`, `dashboard.spec.ts`) updated for the extra home-screen click (`.bp-card[data-type="bug"]`) and still pass.
- Size limits: `widget.js` ≤ 20 KB, `screenshot.js` ≤ 40 KB, `annotate.js` ≤ 15 KB; `check:bundle` covers `widget.js` and `annotate.js`.
- Manual visual pass by the controller: desktop and 390 px, light and dark, a light (#FACC15) and a dark (#1E3A8A) project color, left and right positions, reduced motion.
