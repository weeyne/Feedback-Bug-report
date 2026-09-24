# Widget follow-ups (after phase 2)

## Must do before phase 3 exposes the widget to real sites

**Viewport-accurate, memory-bounded screenshot capture** (`packages/widget/src/screenshot.ts`):
- The capture renders the whole document, then crops to the viewport. On scrolled pages, `position: fixed`
  elements (headers, modals, banners) are likely laid out against the full document and fall outside the crop.
- Long pages create docHeight × width canvases: they fail past browser canvas limits (then no screenshot)
  and may freeze the main thread.
- The crop scale `page.width / scrollWidth` is wrong on pages with horizontal overflow.
- Captures are transparent when the host page sets no background. Fill the output canvas with the page's
  computed background (or white) before `drawImage`.
- Add a Playwright E2E test on a scrolled page with a fixed header and a pixel check.
- The redesign's annotation editor and user-supplied images (paste/file/drop, `src/annotate/`,
  `src/image/prepare.ts`) don't touch this: they operate on whatever `screenshot.ts` already
  produced or the visitor supplied, so this capture follow-up still applies unchanged.

## Deferred minor findings (can wait)
- `console-buffer`: `event.lineno || undefined` drops a line number of 0.
- `MASK_SELECTOR` may not reach nested shadow roots on host pages (modern-screenshot flattens open roots; verify with a test).
- Escape only closes the panel while focus is inside it.
- The preview bottom-sheet media query uses the dashboard viewport, not the preview container (phase 4).
- Tests missing for the double-submit guard and for `identify()` swallowing a throwing handle.
- A failed send while the panel is hidden leaves status/retry set until the next open.
- Reopening during an in-flight send, then success, shows thanks and resets the new draft (consider a read-only textarea while sending).
- Mock API: overrides rely on the `Referer` header; malformed multipart returns 500. **The real phase-3 API must return 400.**
- CI builds the widget twice (`check` job and the `e2e` webServer).
- The host `div` styles are inline without `!important`: host rules like `div { display: none !important }` still apply. Consider re-attaching the widget if a Turbo/pjax navigation removes it.
- `requestIdleCallback` fallback, entry selector and CSP notes are done; document `data-feedback-mask` for site owners.
- `replaceSync` drops `@import` in custom CSS (documented in the spec).
