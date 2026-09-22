# Dymcode Widget (Phase 2): Design

**Date:** 2026-09-21
**Status:** Approved in brainstorming, pending spec review
**Parent spec:** `docs/superpowers/specs/2026-09-21-dymcode-design.md` (§4 Widget). This document refines §4
and records contract changes. Where the two disagree, this document wins for the widget.

## 1. Scope

Build `packages/widget`: the embeddable script that renders a trigger button and a feedback panel,
collects context and a screenshot, and submits to `POST /api/v1/widget/submit`. The real API is built
in phase 3, so this phase ships with a local mock API used for development and E2E tests.

Out of scope: screenshot annotation, draft persistence, a pre-load call queue for `window.Dymcode`,
copying build output into `apps/web` (phase 3), and the dashboard preview UI (phase 4). The
`mountWidget` preview export that phase 4 will use is in scope.

## 2. Decisions

| Topic | Decision |
|---|---|
| Layout | Corner panel anchored above the trigger, no overlay. Below 480px viewport width it becomes a full-width bottom sheet (max 90vh, scrolls inside). |
| Language | Built-in dictionaries `en`, `ru`, `uk`, `es`. The owner picks one, or `auto` (first supported of `navigator.languages`, else `en`). |
| Host JS API | `window.Dymcode.open(type?)`, `window.Dymcode.identify({ email?, id?, name? })`, `dymcode:ready` event on `window`. `data-hide-trigger` hides the floating button. |
| Rendering | Plain DOM with a tiny `h()` helper; no framework. |
| Screenshot | `modern-screenshot` in a separately loaded ES module. If its gzip size is far above ~15KB, compare with `@zumer/snapdom` and choose the smaller that passes the E2E test. |
| Dev and test | Vite dev page with hostile host CSS, plus a mock API plugin that validates payloads with the shared zod schemas. |
| Theme | Follows `prefers-color-scheme`. The accent is always the owner's `primaryColor`. Motion is disabled under `prefers-reduced-motion`. |

## 3. Package layout

```
packages/widget/
├── src/
│   ├── entry.ts              # IIFE entry: boot(window, currentScript)
│   ├── index.ts              # boot()
│   ├── screenshot-loader.ts  # memoized lazy import() of screenshot.js
│   ├── api.ts                # fetchConfig(), submitFeedback()
│   ├── i18n.ts               # dictionaries + resolveLocale()
│   ├── public-api.ts         # window.Dymcode + dymcode:ready
│   ├── context/
│   │   ├── console-buffer.ts # ring buffer of recent errors
│   │   └── metadata.ts       # collectMetadata()
│   ├── ui/
│   │   ├── h.ts              # DOM helper
│   │   ├── mount.ts          # mountWidget(host, config, options)
│   │   ├── trigger.ts        # floating button
│   │   ├── panel.ts          # panel/bottom sheet, form, states
│   │   └── styles.css        # injected into the shadow root as a string
│   └── screenshot.ts         # lazy module: capture(exclude) → Blob | null
├── dev/
│   ├── index.html            # host page with hostile global CSS
│   └── mock-api.ts           # Vite plugin implementing config + submit
├── e2e/                      # Playwright smoke tests
└── .size-limit.json
```

Build output goes to `packages/widget/dist/` (`widget.js`, `screenshot.js`).

## 4. Embedding and public API

```html
<script async src="https://dymcode.dev/w/widget.js" data-project-id="pk_…"></script>
<!-- optional attribute: data-hide-trigger -->
```

- **API origin** = `new URL(script.src).origin`. The widget and the API are served from the same origin
  in production, and from the Vite dev server in development.
- **`Dymcode.open(type?: 'bug' | 'idea' | 'general')`** opens the panel with the type preselected
  (default `bug`). Before the config has loaded, or if it failed, it logs one `console.warn` and does nothing.
- **`Dymcode.identify(user)`**, where `user: { email?: string; id?: string; name?: string }`:
  - `email` pre-fills the email field (the visitor can still edit it);
  - `id` and `name` are sent as `metadata.user`.

  Calling it again replaces the previous values. Invalid types are ignored with a `console.warn`.
- **`dymcode:ready`** is dispatched on `window` after the widget is mounted.

## 5. Contract changes

Phase 1 is on `main`, so the DB change is a **new migration**. The shared schemas are edited in place.

1. **Project locale.**
   - Migration `supabase/migrations/20260921000500_widget_locale.sql`:
     - `create type public.widget_locale as enum ('auto', 'en', 'ru', 'uk', 'es');`
     - `alter table public.projects add column locale public.widget_locale not null default 'auto';`
     - `grant update (locale) on public.projects to authenticated;`
   - `packages/shared/src/constants.ts`: `WIDGET_LOCALES = ['auto', 'en', 'ru', 'uk', 'es'] as const`, `type WidgetLocale`.
   - `WidgetConfigSchema` gains `locale: z.enum(WIDGET_LOCALES)`.
2. **Identified user.** `ClientMetadataSchema` gains
   `user: z.object({ id: z.string().max(128).optional(), name: z.string().max(128).optional() }).optional()`.
   `FeedbackMetadata` inherits it.
3. **Parent spec §5 config response** now includes `locale`.

## 6. Runtime behaviour

### Bootstrap (`index.ts`)
1. If `window.Dymcode` already exists, exit (double include).
2. Resolve the script element: use `document.currentScript`, falling back to `script[src*="widget.js"][data-project-id]`, then to the first `script[data-project-id]`.
   Read `data-project-id` and `data-hide-trigger`. If the project id is missing, `console.warn` once and exit.
3. Install the console buffer immediately (§6.4).
4. Install `window.Dymcode` (§4).
5. In `requestIdleCallback` (falling back to `setTimeout(…, 1)`), call `fetchConfig`.
   - On failure (non-2xx, network error, or a body that is not an object with the expected keys): `console.warn` once, render nothing.
   - On success: mount (§6.2) and dispatch `dymcode:ready`.

### Mount (`ui/mount.ts`)
- `mountWidget(container: HTMLElement, config: WidgetConfig, options: { preview?: boolean; hideTrigger?: boolean; deps?: PanelDeps; languages?: readonly string[] })`
  returns `{ host, open(type?), close(), identify(user), destroy() }`. `deps` injects side effects (submit, screenshot loader, metadata, clock) so the UI is testable; bootstrap wires the real ones.
- In normal mode the host is a `div` appended to `document.body` with inline style
  `all: initial; position: fixed; z-index: 2147483000`. It gets an open shadow root containing
  base styles, then `config.customCss` (if non-null), then the UI. Styles are applied as constructable
  stylesheets (`adoptedStyleSheets`, which also works under a strict `style-src` CSP), falling back to
  `<style>` elements where unsupported. `@import` rules in custom CSS are ignored in the constructable path.
- The accent color is set as a CSS custom property on the shadow root host (`--dc-accent`).
- `preview: true` renders the same UI but disables submission and screenshot capture. Phase 4 uses it for the live preview.

### Panel (`ui/panel.ts`)
- **Contents:**
  - type toggle (Bug / Idea / General), with a type-specific placeholder;
  - message textarea (required, max 5000);
  - optional email;
  - "Attach screenshot" toggle, checked by default, with a thumbnail;
  - hidden honeypot input named `website` (`tabindex=-1`, `autocomplete=off`, visually hidden);
  - send button;
  - "Powered by Dymcode" link to `config.badgeUrl` (`target=_blank rel=noopener`), unless `config.showBadge === false`.
- **Accessibility:**
  - `role="dialog"`, `aria-modal="false"`, labelled by its heading;
  - on open, focus moves to the textarea and Tab/Shift+Tab cycle within the panel;
  - Esc or the close button closes it and returns focus to the trigger. Clicking outside does not close.
- **Timer:** opening records `openedAt = performance.now()`. `elapsedMs = Math.round(performance.now() - openedAt)` at submit time.
- **Screenshot:**
  - On open, `import()` the screenshot module and capture the viewport, excluding the widget host.
  - While capturing, the thumbnail shows a spinner.
  - If loading or capturing fails, the toggle becomes disabled and unchecked, labelled "Screenshot unavailable". Submitting still works.
  - One capture per open.
- **Client validation:** the message must be non-blank after trim. An email, if given, must match a simple `x@y.z` shape. Errors show inline under the field.
- **Sending:** the button is disabled with a spinner.

| Result | Behaviour |
|---|---|
| 201, or 200 with `{ id: null }` | "Thanks!" state, auto-close after 2s, form reset |
| 429 | Inline "Too many submissions, try again later"; text kept |
| 400 | Inline generic error; details via one `console.warn`; text kept |
| 5xx or network error | Inline error with a "Retry" button; text kept |

### Console buffer (`context/console-buffer.ts`)
- **Sources:** `window` `error` event, `unhandledrejection`, and a wrapper over `console.error` that always calls the original.
- **Storage:** a ring of the last 10 entries, each `{ message ≤ 500 chars, source?, line?, at: Date.now() }`.
- **Exclusions:** entries whose `source` or stack contains the widget script URL.
- The buffer must never throw.

### Metadata (`context/metadata.ts`)
`collectMetadata(buffer, user)` is called at submit time and returns a `ClientMetadata`:
- `url`, `referrer`, `userAgent`;
- `language`, `timezone` (from `Intl`);
- `viewport` (`innerWidth` / `innerHeight`), `screen` (`w`, `h`, `dpr`);
- `consoleErrors`;
- `user` (only if `identify` provided `id` or `name`).

**Privacy: URL redaction.** Before truncation, `url` and `referrer` have the values of query parameters
(and of `key=value` pairs inside a query-like hash, e.g. `#access_token=…` or `#/cb?code=…`) replaced with
`[redacted]` when the parameter name matches, case-insensitively, one of `token`, `access_token`,
`refresh_token`, `id_token`, `code`, `key`, `secret`, `password`, `pass`, `auth`, `session`, `signature`,
`sig`. Invalid URLs are passed through unchanged (still truncated).

### Submit (`api.ts`)
- `submitFeedback(apiOrigin, payload, screenshot?: Blob)` sends `multipart/form-data`:
  - `payload` = JSON string of `{ projectKey, type, message, email?, metadata, elapsedMs, website }`;
  - `screenshot` = Blob.
- It returns a discriminated result: `{ ok: true } | { ok: false, reason: 'rate_limited' | 'invalid' | 'server' | 'network' }`.
- It never throws.

### Screenshot (`screenshot.ts`)
- `capture(exclude: Element): Promise<Blob | null>` captures the visible viewport.
- It masks `input[type=password]` and `[data-feedback-mask]` with solid blocks.
- It scales to max width 1600px and encodes WebP at quality 0.7, falling back to JPEG 0.8 when WebP encoding is unsupported.
- It returns `null` on any failure, or when the result exceeds `SCREENSHOT_MAX_BYTES`.

### i18n (`i18n.ts`)
- The dictionary keys cover every visible string: title, types, placeholders per type, email label, screenshot labels, send, sending, thanks, errors, retry, close, and powered by.
- `resolveLocale('auto', navigator.languages)` matches the primary subtag (`uk-UA` → `uk`), else `en`.

### Isolation and security
- User and config strings are set via `textContent` or attributes only. No `innerHTML` with data.
- Custom CSS lives only inside the shadow root.
- Every entry point (bootstrap, event handlers, public API) is wrapped so no exception reaches the host page.

## 7. Build

The build is two Vite builds, because Rollup cannot code-split IIFE output and the embed is a classic `<script>`:
1. `screenshot.js`: ES module, minified, exporting `capture`.
2. `widget.js`: IIFE, minified, target `es2019`.
   - It loads the screenshot module with `import(new URL('screenshot.js?v=' + __WIDGET_VERSION__, scriptSrc).href)`.
   - `__WIDGET_VERSION__` is the package version plus a short content hash, injected with `define`.

`@dymcode/shared` is imported only as types plus `./constants` and `./brand`; zod must not appear in `widget.js`.

**Size budgets** (`size-limit`, gzip; CI fails on excess):
- `dist/widget.js` ≤ 20KB;
- `dist/screenshot.js` ≤ 40KB.

## 8. Dev server and mock API

- `pnpm --filter @dymcode/widget dev` serves `dev/index.html`. The page has aggressive global CSS
  (`* { all: revert; font: 30px serif !important; box-sizing: content-box !important }`, and similar)
  and includes the widget from source with `data-project-id="pk_DevDevDevDev1234"`.
- **`dev/mock-api.ts`** (Vite plugin):
  - `GET /api/v1/widget/config?key=…` returns a valid `WidgetConfig`. Query overrides (`?locale=ru&badge=0`) allow manual testing.
  - `POST /api/v1/widget/submit` parses multipart, validates `payload` with `SubmitPayloadSchema` and returns:
    - 201 `{ id }` when valid;
    - 400 with the zod issues when invalid;
    - 200 `{ id: null }` when the honeypot is filled or `elapsedMs < 2000`.

    It checks the screenshot MIME type and size. It keeps the last submission in memory at
    `GET /__mock/last-submission` for E2E assertions.

## 9. Testing

| Layer | Coverage |
|---|---|
| Unit (Vitest + happy-dom) | `resolveLocale`; console buffer (ring of 10, truncation, own-error exclusion, original `console.error` still called); `collectMetadata` shape; `submitFeedback` multipart body and status→reason mapping; panel states (focus on open, Esc restores focus, blank-message error, success auto-close, 429 message, retry); `open`/`identify`; XSS: a trigger text of `<img src=x onerror=alert(1)>` renders as literal text |
| Contract | The payload built by the widget passes `SubmitPayloadSchema`, and `collectMetadata()` output passes `ClientMetadataSchema` (zod as a devDependency of the widget tests only) |
| E2E (Playwright, Chromium, no Docker) | (1) trigger visible and correctly sized despite hostile CSS; (2) full submit: the mock receives a valid payload with a WebP/JPEG screenshot; (3) `data-hide-trigger` + `Dymcode.open('idea')` opens the panel with Idea selected |
| DB (PGlite + CI Supabase) | `projects.locale` defaults to `'auto'`; invalid value rejected; owner can update `locale` |
| Shared | `WidgetConfigSchema` requires a valid `locale`; `ClientMetadataSchema` accepts/limits `user` |

**CI:** `check` job adds `pnpm --filter @dymcode/widget build` and `size-limit`. A new `e2e` job
installs Playwright Chromium and runs the smoke tests.
