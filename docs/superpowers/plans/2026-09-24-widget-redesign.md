# Widget Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gleap-like embeddable widget (round launcher, home screen, form, speed-dial + bottom sheet on phones, restrained motion) with a screenshot block that supports auto capture, own image (file/paste/drop) and a lazily loaded annotation editor.

**Architecture:** Pure logic first (image preparation, color contrast, annotation geometry), then the lazy `annotate.js` chunk and its build pipeline, then i18n, then the screenshot-block component in isolation, then the UI shell rewrite (desktop), then the mobile layer, then end-to-end tests and dashboard touch-ups. The server and database do not change.

**Tech Stack:** TypeScript, plain DOM via the `h()` helper (no framework), Shadow DOM, Vite library builds, Vitest + happy-dom, Playwright, size-limit.

**Spec:** `docs/superpowers/specs/2026-09-24-widget-redesign-design.md`

**Visual reference (local, git-ignored):** `.superpowers/brainstorm/440-1790236750/content/widget-flow.html` (option A desktop, option C mobile) and `widget-form.html` (form, screenshot block, editor, mobile sheet, motion list). Open them in a browser for layout, spacing and colors.

## Global Constraints

- All code, comments, commit messages, docs in English. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never read, print, edit or commit `apps/web/.env.local`. Never run `supabase start` / `supabase db push`.
- Bundle budgets (gzip): `dist/widget.js` ≤ 20 KB, `dist/screenshot.js` ≤ 40 KB, `dist/annotate.js` ≤ 15 KB.
- `widget.js` and `annotate.js` must not contain `innerHTML`, `insertAdjacentHTML` or zod (`check:bundle`). Build DOM only with `h()` / `createElement`; text only via text nodes.
- Every event handler and public method must never throw into the host page (wrap with try/catch or `h()` listeners, which already catch).
- Widget uses the system font stack; no web fonts.
- Server contract unchanged: one `screenshot` multipart part, `image/webp|png|jpeg`, ≤ `SCREENSHOT_MAX_BYTES` (2 MB).
- Mobile ("compact") layout when `matchMedia('(max-width: 640px)')` matches at open time.
- Motion: 150–250 ms, only `transform`/`opacity` (and `stroke-dashoffset` for the thanks check); everything disabled under `@media (prefers-reduced-motion: reduce)`.
- Annotation color `#FF3B30`; hide tool fill `#111`.
- Locales: `en`, `ru`, `uk`, `es` — every new string in all four.
- Stable class hooks: `bp-root`, `bp-trigger` (the launcher), `bp-panel`, `bp-message`, `bp-email`, `bp-send`, `bp-status`, `bp-retry`, `bp-thanks`, `bp-thumb` (`data-state`), `bp-badge`; new: `bp-home`, `bp-card` (`data-type`), `bp-dial`, `bp-dial-item` (`data-type`), `bp-form`, `bp-back`, `bp-shot` (`data-state`), `bp-sheet`.
- Verification set (repo root): `pnpm typecheck`, `pnpm test`, `pnpm format:check`, `pnpm --filter @bugping/widget build && pnpm --filter @bugping/widget size && pnpm --filter @bugping/widget check:bundle`. Running `next dev`/e2e rewrites `apps/web/next-env.d.ts` — `git checkout apps/web/next-env.d.ts` before committing; never commit `.claude/`.

---

### Task 1: Image preparation and accent-color helpers

**Files:**
- Create: `packages/widget/src/image/prepare.ts`, `packages/widget/src/image/prepare.test.ts`
- Create: `packages/widget/src/ui/color.ts`, `packages/widget/src/ui/color.test.ts`

**Interfaces:**
- Produces:
  - `OWN_IMAGE_MAX_SOURCE_BYTES = 20 * 1024 * 1024`, `MAX_IMAGE_WIDTH = 1600`
  - `type ImageErrorCode = 'not_image' | 'too_large' | 'decode'`; `class ImageError extends Error { readonly code: ImageErrorCode }`
  - `interface Decoded { source: CanvasImageSource; width: number; height: number; close(): void }`
  - `interface ImageEnv { decode(blob: Blob): Promise<Decoded>; encode(source: CanvasImageSource, width: number, height: number, type: string, quality: number): Promise<Blob | null> }`
  - `browserImageEnv: ImageEnv`
  - `targetSize(width: number, height: number, max?: number): { width: number; height: number }`
  - `encodeWithinLimit(source: CanvasImageSource, width: number, height: number, env?: ImageEnv): Promise<Blob>` (throws `ImageError('too_large')`)
  - `prepareImage(blob: Blob, env?: ImageEnv): Promise<Blob>`
  - `contrastRatio(a: string, b: string): number`, `onAccent(hex: string): '#ffffff' | '#1a1414'`, `tint(hex: string, amount?: number): string`

- [ ] **Step 1: Write the failing tests**

`packages/widget/src/image/prepare.test.ts`:

```ts
import { SCREENSHOT_MAX_BYTES } from '@bugping/shared/constants';
import { describe, expect, it, vi } from 'vitest';
import {
  encodeWithinLimit,
  ImageError,
  OWN_IMAGE_MAX_SOURCE_BYTES,
  prepareImage,
  targetSize,
  type ImageEnv,
} from './prepare';

function env(opts: { w?: number; h?: number; sizes?: number[]; webp?: boolean; decodeFails?: boolean } = {}) {
  const sizes = [...(opts.sizes ?? [1000])];
  const calls: Array<{ width: number; height: number; type: string; quality: number }> = [];
  const close = vi.fn();
  const e: ImageEnv = {
    decode: async () => {
      if (opts.decodeFails) throw new Error('bad');
      return { source: {} as CanvasImageSource, width: opts.w ?? 800, height: opts.h ?? 600, close };
    },
    encode: async (_s, width, height, type, quality) => {
      calls.push({ width, height, type, quality });
      const outType = type === 'image/webp' && opts.webp === false ? 'image/png' : type;
      const size = sizes.length > 1 ? sizes.shift()! : sizes[0]!;
      return new Blob([new Uint8Array(size)], { type: outType });
    },
  };
  return { env: e, calls, close };
}

describe('targetSize', () => {
  it('scales wide images down to 1600 px keeping the aspect ratio', () => {
    expect(targetSize(3200, 1800)).toEqual({ width: 1600, height: 900 });
  });
  it('never upscales', () => {
    expect(targetSize(800, 600)).toEqual({ width: 800, height: 600 });
  });
  it('rounds and keeps at least 1 px', () => {
    expect(targetSize(4001, 1)).toEqual({ width: 1600, height: 1 });
  });
});

describe('prepareImage', () => {
  it('rejects non-images', async () => {
    const { env: e } = env();
    await expect(prepareImage(new Blob(['x'], { type: 'text/plain' }), e)).rejects.toMatchObject({ code: 'not_image' });
  });
  it('rejects sources over 20 MB before decoding', async () => {
    const big = { size: OWN_IMAGE_MAX_SOURCE_BYTES + 1, type: 'image/png' } as Blob;
    const { env: e } = env();
    const decode = vi.spyOn(e, 'decode');
    await expect(prepareImage(big, e)).rejects.toMatchObject({ code: 'too_large' });
    expect(decode).not.toHaveBeenCalled();
  });
  it('reports decode failures', async () => {
    const { env: e } = env({ decodeFails: true });
    const error = await prepareImage(new Blob(['x'], { type: 'image/png' }), e).catch((err) => err);
    expect(error).toBeInstanceOf(ImageError);
    expect(error.code).toBe('decode');
  });
  it('downscales and encodes WebP at 0.8, then releases the bitmap', async () => {
    const { env: e, calls, close } = env({ w: 3200, h: 1800 });
    const out = await prepareImage(new Blob(['x'], { type: 'image/heic' }), e);
    expect(out.type).toBe('image/webp');
    expect(calls[0]).toEqual({ width: 1600, height: 900, type: 'image/webp', quality: 0.8 });
    expect(close).toHaveBeenCalled();
  });
});

describe('encodeWithinLimit', () => {
  const big = SCREENSHOT_MAX_BYTES + 1;
  it('falls back to JPEG 0.85 when WebP is unsupported', async () => {
    const { env: e, calls } = env({ webp: false });
    const out = await encodeWithinLimit({} as CanvasImageSource, 100, 50, e);
    expect(out.type).toBe('image/jpeg');
    expect(calls.map((c) => [c.type, c.quality])).toEqual([
      ['image/webp', 0.8],
      ['image/jpeg', 0.85],
    ]);
  });
  it('lowers quality, then size, until it fits', async () => {
    const { env: e, calls } = env({ sizes: [big, big, 500] });
    const out = await encodeWithinLimit({} as CanvasImageSource, 1600, 900, e);
    expect(out.size).toBe(500);
    expect(calls.map((c) => [c.width, c.quality])).toEqual([
      [1600, 0.8],
      [1600, 0.6],
      [1200, 0.6],
    ]);
  });
  it('gives up with too_large after four attempts', async () => {
    const { env: e, calls } = env({ sizes: [big] });
    await expect(encodeWithinLimit({} as CanvasImageSource, 1600, 900, e)).rejects.toMatchObject({ code: 'too_large' });
    expect(calls).toHaveLength(4);
  });
});
```

`packages/widget/src/ui/color.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { contrastRatio, onAccent, tint } from './color';

describe('color helpers', () => {
  it('computes WCAG contrast', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 0);
    expect(contrastRatio('#E0321F', '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });
  it('picks white text on dark accents and dark text on light ones', () => {
    expect(onAccent('#1E3A8A')).toBe('#ffffff');
    expect(onAccent('#E0321F')).toBe('#ffffff');
    expect(onAccent('#FACC15')).toBe('#1a1414');
  });
  it('tints towards white', () => {
    expect(tint('#000000', 0.25)).toBe('#404040');
    expect(tint('#E0321F', 0)).toBe('#e0321f');
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm --filter @bugping/widget exec vitest run src/image src/ui/color.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`packages/widget/src/image/prepare.ts`:

```ts
import { SCREENSHOT_MAX_BYTES } from '@bugping/shared/constants';

export const OWN_IMAGE_MAX_SOURCE_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGE_WIDTH = 1600;

export type ImageErrorCode = 'not_image' | 'too_large' | 'decode';

export class ImageError extends Error {
  constructor(readonly code: ImageErrorCode) {
    super(code);
    this.name = 'ImageError';
  }
}

export interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  close(): void;
}

export interface ImageEnv {
  decode(blob: Blob): Promise<Decoded>;
  encode(
    source: CanvasImageSource,
    width: number,
    height: number,
    type: string,
    quality: number,
  ): Promise<Blob | null>;
}

/** Attempts in order: [scale, quality]. */
const ATTEMPTS: Array<[number, number]> = [
  [1, 0.8],
  [1, 0.6],
  [0.75, 0.6],
  [0.5625, 0.6],
];

export function targetSize(width: number, height: number, max = MAX_IMAGE_WIDTH) {
  const scale = Math.min(1, max / width);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export const browserImageEnv: ImageEnv = {
  async decode(blob) {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(blob);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    }
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  },
  encode(source, width, height, type, quality) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return Promise.resolve(null);
    ctx.drawImage(source, 0, 0, width, height);
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  },
};

/** WebP (JPEG where WebP encoding is unsupported), shrinking quality then size to fit 2 MB. */
export async function encodeWithinLimit(
  source: CanvasImageSource,
  width: number,
  height: number,
  env: ImageEnv = browserImageEnv,
): Promise<Blob> {
  for (const [scale, quality] of ATTEMPTS) {
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    let blob = await env.encode(source, w, h, 'image/webp', quality);
    if (!blob || blob.type !== 'image/webp') {
      blob = await env.encode(source, w, h, 'image/jpeg', quality + 0.05);
    }
    if (blob && blob.size <= SCREENSHOT_MAX_BYTES) return blob;
  }
  throw new ImageError('too_large');
}

/** Turns any browser-decodable image into an upload-ready WebP/JPEG ≤ 2 MB, ≤ 1600 px wide. */
export async function prepareImage(blob: Blob, env: ImageEnv = browserImageEnv): Promise<Blob> {
  if (blob.size > OWN_IMAGE_MAX_SOURCE_BYTES) throw new ImageError('too_large');
  if (!blob.type.startsWith('image/')) throw new ImageError('not_image');
  let decoded: Decoded;
  try {
    decoded = await env.decode(blob);
  } catch {
    throw new ImageError('decode');
  }
  try {
    const size = targetSize(decoded.width, decoded.height);
    return await encodeWithinLimit(decoded.source, size.width, size.height, env);
  } finally {
    decoded.close();
  }
}
```

Note the test "rejects sources over 20 MB before decoding" passes a fake blob with `type: 'image/png'`, so the size check must come first (as above).

`packages/widget/src/ui/color.ts`:

```ts
function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Text color for surfaces filled with the project color. */
export function onAccent(hex: string): '#ffffff' | '#1a1414' {
  return contrastRatio(hex, '#ffffff') >= 4.5 ? '#ffffff' : '#1a1414';
}

/** Mixes the color towards white by `amount` (0..1). */
export function tint(hex: string, amount = 0.25): string {
  return `#${channels(hex)
    .map((v) => Math.round(v + (255 - v) * amount).toString(16).padStart(2, '0'))
    .join('')}`;
}
```

Check: `#E0321F` vs white ≈ 4.52 → white (matches the test). If `onAccent('#E0321F')` fails due to rounding, the test is authoritative: the spec's brand primary was chosen to pass 4.5.

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @bugping/widget exec vitest run src/image src/ui/color.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/widget/src/image packages/widget/src/ui/color.ts packages/widget/src/ui/color.test.ts
git commit -m "feat(widget): image preparation and accent contrast helpers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Annotation editor chunk and its build pipeline

**Files:**
- Create: `packages/widget/src/annotate/types.ts`, `geometry.ts`, `render.ts`, `editor.ts`, `index.ts`, `styles.css`, and tests `geometry.test.ts`, `render.test.ts`, `editor.test.ts`
- Create: `packages/widget/src/chunk-loader.ts`, `packages/widget/src/chunk-loader.test.ts`
- Modify: `packages/widget/src/screenshot-loader.ts` (build on `createChunkLoader`, same exported signature)
- Create: `packages/widget/vite.annotate.config.ts`
- Modify: `packages/widget/package.json` (`build` script), `packages/widget/.size-limit.json`, `packages/widget/scripts/check-bundle.mjs`, `packages/widget/vite.widget.config.ts` (version hash), `packages/widget/vite.screenshot.config.ts` (keep `emptyOutDir: true` — it runs first), `packages/widget/dev/mock-api.ts` (source-mode mapping), `apps/web/scripts/copy-widget.mjs`

**Interfaces:**
- Consumes: `encodeWithinLimit`, `browserImageEnv` from `../image/prepare` (Task 1).
- Produces:
  - `type Tool = 'rect' | 'pen' | 'hide'`; `type Point = [number, number]`; `interface Stroke { tool: Tool; points: Point[] }`
  - `interface AnnotateMessages { rect: string; pen: string; hide: string; undo: string; done: string; cancel: string; canvas: string }`
  - `interface AnnotateInput { image: Blob; strokes?: Stroke[]; t: AnnotateMessages }`
  - `interface AnnotateResult { image: Blob; strokes: Stroke[] }`
  - `type AnnotateFn = (input: AnnotateInput) => Promise<AnnotateResult | null>` — exported from `annotate/types.ts`; `annotate.js` exports `annotate: AnnotateFn`
  - `ANNOTATION_COLOR = '#FF3B30'`, `HIDE_COLOR = '#111'`
  - `createChunkLoader<T>(moduleUrl: string, pick: (mod: unknown) => T | null, importer?: (url: string) => Promise<unknown>): () => Promise<T | null>`
  - `createAnnotateLoader(moduleUrl: string, importer?): () => Promise<AnnotateFn | null>` (in `chunk-loader.ts`)

- [ ] **Step 1: Chunk loader (TDD)**

`packages/widget/src/chunk-loader.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createAnnotateLoader, createChunkLoader } from './chunk-loader';

describe('createChunkLoader', () => {
  it('imports once and memoizes the picked export', async () => {
    const importer = vi.fn(async () => ({ run: () => 1 }));
    const load = createChunkLoader('https://x/a.js', (m) => (m as { run?: () => number }).run ?? null, importer);
    const [a, b] = await Promise.all([load(), load()]);
    expect(a).toBe(b);
    expect(importer).toHaveBeenCalledTimes(1);
  });
  it('resolves null on import failure or a missing export', async () => {
    expect(await createChunkLoader('u', () => 1, async () => Promise.reject(new Error('net')))()).toBeNull();
    expect(await createChunkLoader('u', () => null, async () => ({}))()).toBeNull();
  });
});

describe('createAnnotateLoader', () => {
  it('returns the annotate function', async () => {
    const annotate = async () => null;
    expect(await createAnnotateLoader('u', async () => ({ annotate }))()).toBe(annotate);
    expect(await createAnnotateLoader('u', async () => ({ annotate: 'x' }))()).toBeNull();
  });
});
```

`packages/widget/src/chunk-loader.ts`:

```ts
import type { AnnotateFn } from './annotate/types';

const nativeImport = (url: string): Promise<unknown> => import(/* @vite-ignore */ url);

/** Loads an ES module chunk on first use; any failure resolves null, never an error. */
export function createChunkLoader<T>(
  moduleUrl: string,
  pick: (mod: unknown) => T | null,
  importer: (url: string) => Promise<unknown> = nativeImport,
): () => Promise<T | null> {
  let pending: Promise<T | null> | undefined;
  return () =>
    (pending ??= importer(moduleUrl).then(
      (mod) => {
        try {
          return pick(mod);
        } catch {
          return null;
        }
      },
      () => null,
    ));
}

export function createAnnotateLoader(
  moduleUrl: string,
  importer?: (url: string) => Promise<unknown>,
): () => Promise<AnnotateFn | null> {
  return createChunkLoader(
    moduleUrl,
    (mod) => {
      const fn = (mod as { annotate?: unknown } | null)?.annotate;
      return typeof fn === 'function' ? (fn as AnnotateFn) : null;
    },
    importer,
  );
}
```

Rewrite `screenshot-loader.ts` as:

```ts
import { createChunkLoader } from './chunk-loader';

export type CaptureFn = (exclude: Element) => Promise<Blob | null>;

/** Loads the screenshot bundle on first use; any failure means "no screenshot", never an error. */
export function createScreenshotLoader(
  moduleUrl: string,
  importer?: (url: string) => Promise<unknown>,
): () => Promise<CaptureFn | null> {
  return createChunkLoader(
    moduleUrl,
    (mod) => {
      const capture = (mod as { capture?: unknown } | null)?.capture;
      return typeof capture === 'function' ? (capture as CaptureFn) : null;
    },
    importer,
  );
}
```

Run `pnpm --filter @bugping/widget exec vitest run src/chunk-loader.test.ts src/screenshot-loader.test.ts` → PASS.

- [ ] **Step 2: Geometry and render (TDD)**

`packages/widget/src/annotate/types.ts`:

```ts
export type Tool = 'rect' | 'pen' | 'hide';
export type Point = [number, number];
export interface Stroke {
  tool: Tool;
  points: Point[];
}
export interface AnnotateMessages {
  rect: string;
  pen: string;
  hide: string;
  undo: string;
  done: string;
  cancel: string;
  canvas: string;
}
export interface AnnotateInput {
  image: Blob;
  strokes?: Stroke[];
  t: AnnotateMessages;
}
export interface AnnotateResult {
  image: Blob;
  strokes: Stroke[];
}
export type AnnotateFn = (input: AnnotateInput) => Promise<AnnotateResult | null>;
export const ANNOTATION_COLOR = '#FF3B30';
export const HIDE_COLOR = '#111';
export const STROKE_WIDTH = 3;
```

`packages/widget/src/annotate/geometry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { fitRect, rectFromPoints, toImagePoint } from './geometry';

describe('geometry', () => {
  it('fits the image inside the viewport with padding, centered, never upscaling', () => {
    const fit = fitRect(1600, 900, 1000, 800, 24);
    expect(fit.scale).toBeCloseTo(0.595, 5);
    expect(fit.width).toBeCloseTo(952, 5);
    expect(fit.height).toBeCloseTo(535.5, 5);
    expect(fit.x).toBeCloseTo(24, 5);
    expect(fit.y).toBeCloseTo(132.25, 5);
    expect(fitRect(400, 300, 1000, 800, 24)).toMatchObject({ width: 400, height: 300, scale: 1, x: 300, y: 250 });
  });
  it('maps a client point into image pixels, clamped to the image', () => {
    const box = { left: 100, top: 50, width: 800, height: 450 };
    expect(toImagePoint(500, 275, box, 1600, 900)).toEqual([800, 450]);
    expect(toImagePoint(0, 0, box, 1600, 900)).toEqual([0, 0]);
    expect(toImagePoint(5000, 5000, box, 1600, 900)).toEqual([1600, 900]);
  });
  it('normalizes a rectangle from any two corners', () => {
    expect(rectFromPoints([30, 40], [10, 5])).toEqual({ x: 10, y: 5, width: 20, height: 35 });
  });
});
```

`packages/widget/src/annotate/geometry.ts`:

```ts
import type { Point } from './types';

export function fitRect(w: number, h: number, vw: number, vh: number, pad: number) {
  const scale = Math.min(1, (vw - 2 * pad) / w, (vh - 2 * pad) / h);
  const width = w * scale;
  const height = h * scale;
  return { x: (vw - width) / 2, y: (vh - height) / 2, width, height, scale };
}

export function toImagePoint(
  clientX: number,
  clientY: number,
  box: { left: number; top: number; width: number; height: number },
  imageWidth: number,
  imageHeight: number,
): Point {
  const x = ((clientX - box.left) / box.width) * imageWidth;
  const y = ((clientY - box.top) / box.height) * imageHeight;
  return [Math.min(imageWidth, Math.max(0, x)), Math.min(imageHeight, Math.max(0, y))];
}

export function rectFromPoints(a: Point, b: Point) {
  return {
    x: Math.min(a[0], b[0]),
    y: Math.min(a[1], b[1]),
    width: Math.abs(a[0] - b[0]),
    height: Math.abs(a[1] - b[1]),
  };
}
```

`packages/widget/src/annotate/render.test.ts` — use a recording fake 2D context:

```ts
import { describe, expect, it } from 'vitest';
import { drawStrokes } from './render';
import type { Stroke } from './types';

function fakeCtx() {
  const ops: string[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_t, key: string) =>
      ['strokeStyle', 'fillStyle', 'lineWidth', 'lineJoin', 'lineCap'].includes(key)
        ? undefined
        : (...args: unknown[]) => ops.push(`${key}(${args.join(',')})`),
    set: (_t, key: string, value) => (ops.push(`${key}=${value}`), true),
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, ops };
}

describe('drawStrokes', () => {
  it('draws rectangles and pen paths in the annotation color and hides with solid fill', () => {
    const strokes: Stroke[] = [
      { tool: 'rect', points: [[10, 10], [50, 40]] },
      { tool: 'pen', points: [[0, 0], [5, 5], [9, 3]] },
      { tool: 'hide', points: [[100, 100], [60, 80]] },
    ];
    const { ctx, ops } = fakeCtx();
    drawStrokes(ctx, strokes, 2);
    expect(ops).toContain('strokeStyle=#FF3B30');
    expect(ops).toContain('lineWidth=6');
    expect(ops).toContain('strokeRect(10,10,40,30)');
    expect(ops).toContain('moveTo(0,0)');
    expect(ops).toContain('lineTo(9,3)');
    expect(ops).toContain('fillStyle=#111');
    expect(ops).toContain('fillRect(60,80,40,20)');
  });
  it('ignores degenerate strokes', () => {
    const { ctx, ops } = fakeCtx();
    drawStrokes(ctx, [{ tool: 'rect', points: [[1, 1]] }, { tool: 'pen', points: [[1, 1]] }], 1);
    expect(ops.filter((op) => /Rect|lineTo/.test(op))).toEqual([]);
  });
});
```

`packages/widget/src/annotate/render.ts`:

```ts
import { rectFromPoints } from './geometry';
import { ANNOTATION_COLOR, HIDE_COLOR, STROKE_WIDTH, type Stroke } from './types';

/** Draws strokes in image space; `lineScale` keeps the on-screen stroke width constant. */
export function drawStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], lineScale: number): void {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const stroke of strokes) {
    const [a, b] = stroke.points;
    if (stroke.tool === 'hide') {
      if (!a || !b) continue;
      const r = rectFromPoints(a, b);
      ctx.fillStyle = HIDE_COLOR;
      ctx.fillRect(r.x, r.y, r.width, r.height);
      continue;
    }
    ctx.strokeStyle = ANNOTATION_COLOR;
    ctx.lineWidth = STROKE_WIDTH * lineScale;
    if (stroke.tool === 'rect') {
      if (!a || !b) continue;
      const r = rectFromPoints(a, b);
      ctx.strokeRect(r.x, r.y, r.width, r.height);
      continue;
    }
    if (stroke.points.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(stroke.points[0]![0], stroke.points[0]![1]);
    for (const [x, y] of stroke.points.slice(1)) ctx.lineTo(x, y);
    ctx.stroke();
  }
}
```

Run: `pnpm --filter @bugping/widget exec vitest run src/annotate` → PASS.

- [ ] **Step 3: The editor overlay**

`packages/widget/src/annotate/editor.ts` exports `openEditor(input: AnnotateInput, env: EditorEnv = browserEditorEnv): Promise<AnnotateResult | null>` where

```ts
export interface EditorEnv {
  decode(blob: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close(): void }>;
  exportImage(source: CanvasImageSource, width: number, height: number, strokes: Stroke[]): Promise<Blob>;
}
```

`browserEditorEnv.decode` = `browserImageEnv.decode` from `../image/prepare`. `browserEditorEnv.exportImage` draws `source` at natural size on a new canvas, calls `drawStrokes(ctx, strokes, Math.max(1, width / 1000))`, then returns `encodeWithinLimit(canvas, width, height)`.

Behavior (all via `h()`-style DOM creation — the editor has its own tiny `el()` helper or imports `../ui/h`; importing `h` is fine, it is small):

1. Decode `input.image`. Append to `document.body` a host `<div data-bugping-annotate>` with `style="all: initial; position: fixed; inset: 0; z-index: 2147483001"`, attach an open shadow root, adopt `annotate/styles.css` (same `adoptStyles` fallback approach as `ui/mount.ts` — copy that 10-line function into `annotate/editor.ts`; do not import `mount.ts`).
2. Layout: scrim (`rgba(20,16,16,.82)`), a `<canvas>` sized to `fitRect(w, h, innerWidth, innerHeight - 72, 24)` (72 px reserved for the toolbar), CSS size = fitted size, backing size = fitted size × `devicePixelRatio`; toolbar centered at the bottom with buttons: Rectangle, Pen, Hide (toggle group, `aria-pressed`), Undo, Cancel (✕), Done (primary). Labels from `input.t`. Canvas `aria-label = t.canvas`, `touch-action: none`.
3. Redraw function: clear, draw the image scaled to the canvas, then `drawStrokes` with a context transformed by `scale = canvas.width / imageWidth` and `lineScale = 1 / (fit.scale * dpr) * dpr` — simplest: `ctx.setTransform(canvasScale, 0, 0, canvasScale, 0, 0)` then `drawStrokes(ctx, strokes, 1 / fit.scale)` so strokes look 3 px on screen.
4. Pointer handling on the canvas: `pointerdown` → `setPointerCapture`, start a stroke with `toImagePoint(...)` for the current tool; `pointermove` → rect/hide replace the 2nd point, pen appends (skip points closer than 2 image px); `pointerup`/`pointercancel` → commit if the stroke is non-degenerate (rect/hide width and height ≥ 4 image px; pen ≥ 2 points). Redraw on every change (use `requestAnimationFrame` coalescing if available).
5. Undo removes the last stroke. Escape or Cancel resolves `null`. Done → `exportImage(...)` → resolves `{ image, strokes }`. On any exception during export, resolve `null`.
6. Initial strokes = `input.strokes ?? []` (copied). Focus the active tool button on open; trap Tab inside the toolbar; `keydown` Escape cancels. Clean up: remove the host, `close()` the decoded image, remove listeners, restore `document.activeElement` focus is the widget's job (it refocuses its thumbnail).

`packages/widget/src/annotate/styles.css`: scrim, centered canvas with 8 px radius and shadow, pill toolbar (white, 999 px radius, shadow), active tool tinted `#fff1ee` with `#E0321F` text, Done button `#E0321F` white text; buttons ≥ 36 px tall for touch; system font stack; fade-in 150 ms disabled under reduced motion.

`packages/widget/src/annotate/index.ts`:

```ts
import { openEditor } from './editor';
import type { AnnotateFn } from './types';

export const annotate: AnnotateFn = (input) => openEditor(input).catch(() => null);
```

`packages/widget/src/annotate/editor.test.ts` (happy-dom; stub `EditorEnv`; happy-dom canvas `getContext` may return null — guard: if `getContext('2d')` is null, skip drawing but keep stroke logic working):

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openEditor, type EditorEnv } from './editor';
import type { AnnotateMessages } from './types';

const t: AnnotateMessages = { rect: 'Rectangle', pen: 'Pen', hide: 'Hide', undo: 'Undo', done: 'Done', cancel: 'Cancel', canvas: 'Drawing area' };
const out = new Blob(['annotated'], { type: 'image/webp' });

function env(): EditorEnv & { exportImage: ReturnType<typeof vi.fn> } {
  return {
    decode: async () => ({ source: {} as CanvasImageSource, width: 1000, height: 500, close: () => {} }),
    exportImage: vi.fn(async () => out),
  };
}
const shadow = () => document.querySelector('[data-bugping-annotate]')!.shadowRoot!;
const button = (label: string) =>
  [...shadow().querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === label || b.textContent?.includes(label))!;
function drag(from: [number, number], to: [number, number]) {
  const canvas = shadow().querySelector('canvas')!;
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 500, right: 1000, bottom: 500, x: 0, y: 0, toJSON() {} });
  canvas.setPointerCapture = () => {};
  canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: from[0], clientY: from[1], pointerId: 1, bubbles: true }));
  canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: to[0], clientY: to[1], pointerId: 1, bubbles: true }));
  canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: to[0], clientY: to[1], pointerId: 1, bubbles: true }));
}
const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => document.querySelector('[data-bugping-annotate]')?.remove());

describe('annotation editor', () => {
  it('records a rectangle in image space and returns it with the exported image', async () => {
    const e = env();
    const result = openEditor({ image: new Blob(['x'], { type: 'image/png' }), t }, e);
    await flush();
    drag([100, 50], [300, 150]);
    button('Done').click();
    const value = await result;
    expect(value?.image).toBe(out);
    expect(value?.strokes).toEqual([{ tool: 'rect', points: [[100, 50], [300, 150]] }]);
    expect(document.querySelector('[data-bugping-annotate]')).toBeNull();
  });
  it('undo removes the last stroke; pen collects points', async () => {
    const e = env();
    const result = openEditor({ image: new Blob(['x'], { type: 'image/png' }), t }, e);
    await flush();
    button('Pen').click();
    drag([10, 10], [60, 60]);
    drag([100, 100], [200, 200]);
    button('Undo').click();
    button('Done').click();
    expect((await result)?.strokes).toEqual([{ tool: 'pen', points: [[10, 10], [60, 60]] }]);
  });
  it('Escape cancels with null and keeps prior strokes untouched', async () => {
    const prior = [{ tool: 'hide' as const, points: [[1, 1], [50, 50]] as [number, number][] }];
    const result = openEditor({ image: new Blob(['x'], { type: 'image/png' }), strokes: prior, t }, env());
    await flush();
    shadow().querySelector('button')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
    expect(await result).toBeNull();
    expect(prior).toHaveLength(1);
  });
  it('ignores tiny accidental rectangles', async () => {
    const result = openEditor({ image: new Blob(['x'], { type: 'image/png' }), t }, env());
    await flush();
    drag([10, 10], [11, 11]);
    button('Done').click();
    expect((await result)?.strokes).toEqual([]);
  });
});
```

(The canvas box in the test is 1000×500 CSS px and the image is 1000×500, so client points equal image points. If happy-dom lacks `PointerEvent`, define a minimal subclass of `MouseEvent` with `pointerId` in the test file.)

Run: `pnpm --filter @bugping/widget exec vitest run src/annotate` → PASS.

- [ ] **Step 4: Build pipeline**

`packages/widget/vite.annotate.config.ts`:

```ts
import { defineConfig } from 'vite';

// Separate ES module, loaded by widget.js with import() only when the visitor opens the editor.
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'es2019',
    lib: { entry: 'src/annotate/index.ts', formats: ['es'], fileName: () => 'annotate.js' },
  },
});
```

`packages/widget/package.json` `build` script:
`vite build --config vite.screenshot.config.ts && vite build --config vite.annotate.config.ts && vite build --config vite.widget.config.ts && vite build --config vite.preview.config.ts`

(If `vite.widget.config.ts` or `vite.preview.config.ts` have `emptyOutDir: true`, they would delete `annotate.js`; check both and make sure only the screenshot build empties `dist`.)

`packages/widget/vite.widget.config.ts`: hash `dist/screenshot.js` **and** `dist/annotate.js` into `__WIDGET_VERSION__`:

```ts
const chunkHash = createHash('sha256')
  .update(readFileSync(new URL('./dist/screenshot.js', import.meta.url)))
  .update(readFileSync(new URL('./dist/annotate.js', import.meta.url)))
  .digest('hex')
  .slice(0, 8);
```
(keep the existing variable naming style of the file; rename `screenshotHash` → `chunkHash` and update its comment.)

`.size-limit.json` — add `{ "name": "annotate.js", "path": "dist/annotate.js", "limit": "15 KB", "gzip": true }`.

`scripts/check-bundle.mjs` — loop over `['widget.js', 'annotate.js']`, same forbidden list, report per file.

`dev/mock-api.ts` — next to the `/src/screenshot.js` mapping add the same for `/src/annotate.js` → `/src/annotate/index.ts`.

`apps/web/scripts/copy-widget.mjs` — copy `annotate.js` as well; update the log line.

- [ ] **Step 5: Verify and commit**

Run: `pnpm --filter @bugping/widget test`, `pnpm --filter @bugping/widget build && pnpm --filter @bugping/widget size && pnpm --filter @bugping/widget check:bundle`, `pnpm typecheck`, `pnpm format:check`. Expected: pass; `annotate.js` well under 15 KB.

```bash
git add packages/widget apps/web/scripts/copy-widget.mjs
git commit -m "feat(widget): lazy annotation editor chunk

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Widget strings for the new UI

**Files:**
- Modify: `packages/widget/src/i18n.ts`, `packages/widget/src/i18n.test.ts`

**Interfaces:**
- Consumes: `AnnotateMessages` (Task 2) — `Messages.annotate` must be assignable to it.
- Produces: `Messages` gains the keys below (existing keys stay in this task; Task 5 removes `title`, `types`, `screenshot`, `screenshotUnavailable`). Nesting stays at most two levels (the test's `flatten` only handles two).

```ts
homeTitle: string;
homeSubtitle: string;
cards: Record<FeedbackType, string>;
cardHints: Record<FeedbackType, string>;
back: string;
shot: {
  label: string; capture: string; file: string; pasteHint: string; annotate: string;
  replace: string; remove: string; capturing: string; captureFailed: string;
  editorUnavailable: string; notImage: string; tooLarge: string; decode: string;
};
annotate: AnnotateMessages;
```

Values (use exactly):

| key | en | ru | uk | es |
|---|---|---|---|---|
| homeTitle | Hi 👋 | Привет 👋 | Привіт 👋 | Hola 👋 |
| homeSubtitle | Found a problem or have an idea? Tell us. | Нашли проблему или есть идея? Расскажите нам. | Знайшли проблему чи маєте ідею? Розкажіть нам. | ¿Encontraste un problema o tienes una idea? Cuéntanos. |
| cards.bug | Report a bug | Сообщить о баге | Повідомити про баг | Informar de un error |
| cards.idea | Suggest an idea | Предложить идею | Запропонувати ідею | Sugerir una idea |
| cards.general | Ask a question | Задать вопрос | Поставити запитання | Hacer una pregunta |
| cardHints.bug | Something is broken | Что-то сломалось | Щось зламалося | Algo no funciona |
| cardHints.idea | How to make it better | Как сделать лучше | Як зробити краще | Cómo mejorarlo |
| cardHints.general | We'll reply by email | Ответим на email | Відповімо на email | Te responderemos por email |
| back | Back | Назад | Назад | Atrás |
| shot.label | Screenshot | Скриншот | Скриншот | Captura |
| shot.capture | Capture this page | Снять страницу | Зняти сторінку | Capturar la página |
| shot.file | Your file | Свой файл | Свій файл | Tu archivo |
| shot.pasteHint | or paste (Ctrl+V) / drop an image here | или вставьте (Ctrl+V) / перетащите картинку сюда | або вставте (Ctrl+V) / перетягніть зображення сюди | o pega (Ctrl+V) / suelta una imagen aquí |
| shot.annotate | Annotate | Пометить | Позначити | Anotar |
| shot.replace | Replace | Заменить | Замінити | Reemplazar |
| shot.remove | Remove | Убрать | Прибрати | Quitar |
| shot.capturing | Capturing the page… | Снимаем страницу… | Знімаємо сторінку… | Capturando la página… |
| shot.captureFailed | Couldn't capture the page | Не удалось снять страницу | Не вдалося зняти сторінку | No se pudo capturar la página |
| shot.editorUnavailable | Editor unavailable | Редактор недоступен | Редактор недоступний | Editor no disponible |
| shot.notImage | That file isn't an image | Этот файл не картинка | Цей файл не зображення | Ese archivo no es una imagen |
| shot.tooLarge | The image is too large | Картинка слишком большая | Зображення завелике | La imagen es demasiado grande |
| shot.decode | Couldn't open the image | Не удалось открыть картинку | Не вдалося відкрити зображення | No se pudo abrir la imagen |
| annotate.rect | Rectangle | Рамка | Рамка | Rectángulo |
| annotate.pen | Pen | Карандаш | Олівець | Lápiz |
| annotate.hide | Hide | Скрыть | Приховати | Ocultar |
| annotate.undo | Undo | Отменить | Скасувати | Deshacer |
| annotate.done | Done | Готово | Готово | Listo |
| annotate.cancel | Cancel | Отмена | Скасувати | Cancelar |
| annotate.canvas | Screenshot drawing area | Область рисования на скриншоте | Область малювання на скриншоті | Área de dibujo de la captura |

Also change `placeholders.bug` for all locales to the richer prompt: en `What happened? What did you expect?`, ru `Что случилось? Что вы ожидали увидеть?`, uk `Що сталося? Що ви очікували побачити?`, es `¿Qué pasó? ¿Qué esperabas?`.

- [ ] **Step 1: Test first**

Add to `i18n.test.ts`:

```ts
it('has a card, a hint and a placeholder for every feedback type', () => {
  for (const messages of Object.values(MESSAGES)) {
    for (const type of FEEDBACK_TYPES) {
      expect(messages.cards[type]).toBeTruthy();
      expect(messages.cardHints[type]).toBeTruthy();
      expect(messages.placeholders[type]).toBeTruthy();
    }
  }
});
```
(import `FEEDBACK_TYPES` from `@bugping/shared/constants`). Run → FAIL.

- [ ] **Step 2: Add the keys and values, run `pnpm --filter @bugping/widget exec vitest run src/i18n.test.ts` → PASS; `pnpm --filter @bugping/widget typecheck` → PASS.**

- [ ] **Step 3: Commit**

```bash
git add packages/widget/src/i18n.ts packages/widget/src/i18n.test.ts
git commit -m "feat(widget): strings for the redesigned widget in en, ru, uk, es

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Screenshot block component

**Files:**
- Create: `packages/widget/src/ui/shot-block.ts`, `packages/widget/src/ui/shot-block.test.ts`

**Interfaces:**
- Consumes: `prepareImage`, `ImageError` (Task 1); `AnnotateFn`, `Stroke` (Task 2); `Messages['shot']`, `Messages['annotate']` (Task 3); `CaptureFn` (`screenshot-loader.ts`); `h` (`ui/h.ts`).
- Produces:

```ts
export type ShotState = 'empty' | 'capturing' | 'ready' | 'failed';
export interface ShotBlockDeps {
  loadCapture(): Promise<CaptureFn | null>;
  loadAnnotate(): Promise<AnnotateFn | null>;
  prepare?(blob: Blob): Promise<Blob>; // defaults to prepareImage
}
export interface ShotBlock {
  element: HTMLElement;           // root: <div class="bp-shot" data-state=...>
  state(): ShotState;
  /** Called whenever the form opens for a type: clears everything; auto-captures when `auto`. */
  reset(auto: boolean): void;
  capture(): void;
  addImage(blob: Blob): Promise<void>;
  /** Paste/drop helpers: return true when they consumed an image. */
  handlePaste(event: ClipboardEvent): boolean;
  handleDrop(event: DragEvent): boolean;
  /** The image to send (annotated > original), waiting for a pending capture up to `waitMs`. */
  result(waitMs: number): Promise<Blob | null>;
  destroy(): void;
}
export function createShotBlock(options: {
  t: Messages;
  deps: ShotBlockDeps | null;   // null = dashboard preview: static placeholder, actions disabled
  host: Element;                // excluded from captures
}): ShotBlock;
```

Behavior (spec §2, "States" and "Rules"):

- DOM: root `div.bp-shot[data-state]` with an `aria-live="polite"` visually hidden `span` that receives short state messages (`t.shot.capturing`, `t.shot.captureFailed`, error texts); a hidden `<input type="file" accept="image/*">`.
  - `empty`: dashed box with two buttons (`bp-shot-capture` "📸 {t.shot.capture}", `bp-shot-file` "📎 {t.shot.file}") and a hint line `t.shot.pasteHint`.
  - `capturing`: `span.bp-thumb[data-state="loading"]` with a shimmer.
  - `ready`: `button.bp-thumb[data-state="ready"]` containing `<img>` (object URL, `alt=""`), aria-label `t.shot.annotate`; action buttons `bp-shot-annotate` "✏️ {annotate}", `bp-shot-replace` "📎 {replace}", `bp-shot-remove` "🗑 {remove}".
  - `failed`: `span.bp-thumb[data-state="unavailable"]`, text `t.shot.captureFailed`, buttons file + capture-again.
  - errors: a `p.bp-shot-error` under the block; state and image unchanged.
- Generation counter: every `reset`, `capture`, `addImage`, `remove` bumps it; late results of an older generation are dropped (existing panel behavior, keep it).
- `capture()`: `capturing` → `deps.loadCapture()` → `capture(host)` → blob ? `ready` (original = blob, annotated = null, strokes = []) : `failed`.
- `addImage(blob)`: `prepare(blob)` → `ready` with the prepared blob; on `ImageError` show `notImage`/`tooLarge`/`decode` in `bp-shot-error` and keep the previous state.
- `handlePaste(e)`: first `e.clipboardData.items` entry with `kind === 'file'` and `type.startsWith('image/')` → `e.preventDefault()`, `addImage(file)`, return true; otherwise false (text paste untouched).
- `handleDrop(e)`: same for `e.dataTransfer.files`.
- Annotate (thumbnail or button): `deps.loadAnnotate()` → null → show `t.shot.editorUnavailable` in `bp-shot-error`; else `annotate({ image: original, strokes, t: t.annotate })` → result ? annotated = result.image, strokes = result.strokes, thumbnail shows annotated : unchanged. After the editor closes, focus returns to the thumbnail.
- Replace → file input click. Remove → `empty`.
- `result(waitMs)`: if `capturing`, wait for the pending capture up to `waitMs` (reuse `settlesWithin` from `ui/panel.ts` — move it into `shot-block.ts` and export it; Task 5 imports it from here), then return annotated ?? original ?? null.
- Preview (`deps === null`): `reset(auto)` renders `ready`-looking static placeholder thumbnail (`data-state="ready"`, no image) with all action buttons `disabled`; `result()` → null; paste/drop return false.
- Object URLs revoked on every image change and on `destroy()`.

- [ ] **Step 1: Write the failing tests** (`shot-block.test.ts`, happy-dom). Cover each of these with a real assertion:

```ts
import { describe, expect, it, vi } from 'vitest';
import { MESSAGES } from '../i18n';
import { ImageError } from '../image/prepare';
import { createShotBlock, type ShotBlockDeps } from './shot-block';

const t = MESSAGES.en;
const shot = new Blob(['shot'], { type: 'image/webp' });
const host = document.createElement('div');
const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(deps: Partial<ShotBlockDeps> = {}) {
  const full: ShotBlockDeps = {
    loadCapture: async () => async () => shot,
    loadAnnotate: async () => null,
    prepare: async (b) => new Blob([b], { type: 'image/webp' }),
    ...deps,
  };
  const block = createShotBlock({ t, deps: full, host });
  document.body.append(block.element);
  const q = (s: string) => block.element.querySelector<HTMLElement>(s);
  return { block, q, deps: full };
}

describe('shot block', () => {
  it('auto-captures when reset(true)', async () => {
    const { block } = setup();
    block.reset(true);
    expect(block.state()).toBe('capturing');
    await flush();
    expect(block.state()).toBe('ready');
    expect(await block.result(8000)).toBe(shot);
  });
  it('stays empty when reset(false)', () => {
    const { block, q } = setup();
    block.reset(false);
    expect(block.state()).toBe('empty');
    expect(q('.bp-shot-capture')).not.toBeNull();
  });
  it('shows failed when capture is unavailable', async () => {
    const { block } = setup({ loadCapture: async () => null });
    block.reset(true);
    await flush();
    expect(block.state()).toBe('failed');
    expect(await block.result(8000)).toBeNull();
  });
  it('adds a pasted image and ignores text paste', async () => {
    const { block } = setup();
    block.reset(false);
    const file = new File(['p'], 'p.png', { type: 'image/png' });
    const imageEvent = { clipboardData: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }] }, preventDefault: vi.fn() } as unknown as ClipboardEvent;
    const textEvent = { clipboardData: { items: [{ kind: 'string', type: 'text/plain' }] }, preventDefault: vi.fn() } as unknown as ClipboardEvent;
    expect(block.handlePaste(textEvent)).toBe(false);
    expect(block.handlePaste(imageEvent)).toBe(true);
    await flush();
    expect(block.state()).toBe('ready');
  });
  it('keeps the previous image and shows an error for a bad file', async () => {
    const { block, q } = setup({ prepare: async () => Promise.reject(new ImageError('not_image')) });
    block.reset(true);
    await flush();
    await block.addImage(new Blob(['x'], { type: 'text/plain' }));
    expect(block.state()).toBe('ready');
    expect(q('.bp-shot-error')?.textContent).toBe(t.shot.notImage);
    expect(await block.result(8000)).toBe(shot);
  });
  it('sends the annotated image and reopens the editor with the original and strokes', async () => {
    const annotated = new Blob(['a'], { type: 'image/webp' });
    const annotate = vi.fn(async () => ({ image: annotated, strokes: [{ tool: 'rect' as const, points: [[0, 0], [9, 9]] as [number, number][] }] }));
    const { block, q } = setup({ loadAnnotate: async () => annotate });
    block.reset(true);
    await flush();
    q('.bp-shot-annotate')!.click();
    await flush();
    expect(await block.result(8000)).toBe(annotated);
    q('.bp-shot-annotate')!.click();
    await flush();
    expect(annotate).toHaveBeenLastCalledWith(expect.objectContaining({ image: shot, strokes: [{ tool: 'rect', points: [[0, 0], [9, 9]] }] }));
  });
  it('a new image discards annotations', async () => {
    const annotate = vi.fn(async () => ({ image: new Blob(['a']), strokes: [] }));
    const { block, q } = setup({ loadAnnotate: async () => annotate });
    block.reset(true);
    await flush();
    q('.bp-shot-annotate')!.click();
    await flush();
    const replacement = new Blob(['new'], { type: 'image/png' });
    await block.addImage(replacement);
    const sent = await block.result(8000);
    expect(await sent!.text()).toBe('new');
  });
  it('shows editor unavailable when the chunk fails', async () => {
    const { block, q } = setup();
    block.reset(true);
    await flush();
    q('.bp-shot-annotate')!.click();
    await flush();
    expect(q('.bp-shot-error')?.textContent).toBe(t.shot.editorUnavailable);
    expect(block.state()).toBe('ready');
  });
  it('remove returns to empty', async () => {
    const { block, q } = setup();
    block.reset(true);
    await flush();
    q('.bp-shot-remove')!.click();
    expect(block.state()).toBe('empty');
    expect(await block.result(8000)).toBeNull();
  });
  it('drops a stale capture after reset', async () => {
    let finish!: (b: Blob) => void;
    const { block } = setup({ loadCapture: async () => () => new Promise<Blob>((r) => (finish = r)) });
    block.reset(true);
    await flush();
    block.reset(false);
    finish(shot);
    await flush();
    expect(block.state()).toBe('empty');
  });
  it('result() gives up on a capture that is still pending after waitMs', async () => {
    vi.useFakeTimers();
    const { block } = setup({ loadCapture: async () => () => new Promise<Blob>(() => {}) });
    block.reset(true);
    const pending = block.result(8000);
    await vi.advanceTimersByTimeAsync(8000);
    expect(await pending).toBeNull();
    vi.useRealTimers();
  });
  it('preview renders a disabled placeholder and never captures', () => {
    const block = createShotBlock({ t, deps: null, host });
    block.reset(true);
    expect(block.element.querySelectorAll('button:not([disabled])')).toHaveLength(0);
  });
});
```

(The "a new image discards annotations" test uses the default `prepare` from `setup`, which wraps the blob — `text()` of the wrapper equals the source bytes.)

Run → FAIL. Implement `shot-block.ts` to pass. Run → PASS.

- [ ] **Step 2: Commit**

```bash
git add packages/widget/src/ui/shot-block.ts packages/widget/src/ui/shot-block.test.ts
git commit -m "feat(widget): screenshot block with own images, paste, drop and annotation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: New widget UI shell (desktop)

**Files:**
- Create: `packages/widget/src/ui/launcher.ts`, `home.ts`, `form.ts`, `thanks.ts`, `icons.ts`
- Rewrite: `packages/widget/src/ui/panel.ts`, `packages/widget/src/ui/styles.css`
- Modify: `packages/widget/src/ui/mount.ts`, `packages/widget/src/public-api.ts`, `packages/widget/src/index.ts`, `packages/widget/src/i18n.ts` (remove `title`, `types`, `screenshot`, `screenshotUnavailable`)
- Delete: `packages/widget/src/ui/trigger.ts`
- Tests: rewrite `packages/widget/src/ui/mount.test.ts`; update `public-api.test.ts`, `index.test.ts`

**Interfaces:**
- Consumes: `createShotBlock`, `settlesWithin` (Task 4); `onAccent`, `tint` (Task 1); `createAnnotateLoader` (Task 2); new `Messages` keys (Task 3).
- Produces:
  - `PanelDeps` gains `loadAnnotate(): Promise<AnnotateFn | null>` (all other fields unchanged).
  - `WidgetHandle.open(type?: FeedbackType)` — no type = home (desktop) / dial (compact; Task 6).
  - `BugpingApi.open(type?)` — invalid or missing type → `handle.open()` with no type.
  - `MountOptions.compact?: () => boolean` (test hook; default `() => matchMedia('(max-width: 640px)').matches`, safe when `matchMedia` is missing → false). Task 6 uses it.
  - Panel screens: `'home' | 'form' | 'thanks'`; panel element has `data-screen`.
  - Icons module `icons.ts`: `chatIcon()`, `closeIcon()`, `backIcon()`, `chevronIcon()`, `checkIcon()` returning `SVGSVGElement` built with `document.createElementNS` (no innerHTML).

Layout and look follow `widget-flow.html` option A and `widget-form.html` (desktop row). Key rules:

- `mount.ts`: set `--bp-accent` (validated color, fallback `#E0321F`), `--bp-accent-2` = `tint(accent, 0.25)`, `--bp-on-accent` = `onAccent(accent)` on `.bp-root`. Keep: adopted styles + `<style>` fallback, preview host styles, `data-position`, `lang`, badge https check, `destroy`.
- `launcher.ts`: `button.bp-trigger` 56 px circle, `aria-label` and `title` = `config.triggerText`, `aria-haspopup="dialog"`, `aria-expanded` synced by the panel; contains chat icon and close icon stacked; `.bp-trigger[aria-expanded="true"]` rotates/cross-fades to the close icon.
- `panel.ts`: owns `div.bp-panel[role=dialog][aria-modal=false]`, the current screen, open/close/isOpen/setEmail/destroy, focus trap + Escape + key-propagation guard (keep the existing logic), `aria-labelledby` pointing at the current screen's title. `open(type?)`: no type → `home`; type → `form` for that type. Re-opening while `thanks` shows resets to the requested screen. Closing while a send is in flight settles quietly (keep the existing test behaviors: see the old `mount.test.ts` cases listed below).
- `home.ts`: `div.bp-home` with header (`h2` = `t.homeTitle`, `p` = `t.homeSubtitle`, gradient `linear-gradient(135deg, var(--bp-accent), var(--bp-accent-2))`, text `var(--bp-on-accent)`) and three `button.bp-card[data-type]` (emoji tile 🐞/💡/💬, title `t.cards[type]`, hint `t.cardHints[type]`, chevron). Focus goes to the first card.
- `form.ts`: `form.bp-form`: header row with `button.bp-back` (aria-label `t.back`, hidden when the form was opened directly by type **and** there's no home to go back to — i.e. always visible on desktop), title `t.cards[type]` with the emoji, close button; `textarea.bp-message` (placeholder per type, `aria-describedby` → its error `p`); the shot block element; `input.bp-email` (`aria-describedby` → its error); honeypot; `p.bp-status`; `button.bp-retry`; `button.bp-send` (accent background, `--bp-on-accent` text). The form wires `paste` on the panel and `dragover`/`drop` on itself to the shot block while visible. Opening the form calls `shotBlock.reset(type === 'bug')`. Send: same validation, payload (`buildPayload`), elapsed time, honeypot, busy state, errors and retry as today; screenshot = `await shotBlock.result(CAPTURE_WAIT_MS)`.
- `thanks.ts`: `div.bp-thanks[role=status]` with an SVG check whose path animates `stroke-dashoffset`, text `t.thanks`; auto-close after `THANKS_CLOSE_MS` (2000).
- Badge `a.bp-badge` in the panel footer on home and form when `showBadge` and https (existing rule).
- `index.ts`: `loadAnnotate: createAnnotateLoader(new URL(\`annotate.js?v=${encodeURIComponent(__WIDGET_VERSION__)}\`, scriptUrl).href)`.
- `public-api.ts`: invalid/missing type → `state.handle.open()`.
- `styles.css`: rewrite for the new structure. Keep `:host { all: initial }`, `[hidden] { display: none !important }`, `.bp-root` variables (light + `prefers-color-scheme: dark`), box-sizing. Panel 360 px wide, max-height `calc(100vh - 110px)`, 16 px radius, shadow `0 16px 48px rgba(20,20,30,.18)`, positioned above the launcher on the `data-position` side. Motion per Global Constraints: panel `transform: scale(.96)` + `opacity: 0` → `1` with `transform-origin` at the launcher corner; screens slide 16 px + fade; launcher hover `scale(1.06)`; thumbnail shimmer (`@keyframes`); check draw. One `@media (prefers-reduced-motion: reduce)` block that sets `transition: none !important; animation: none !important` on `.bp-root *`.

Tests — rewrite `mount.test.ts` keeping every behavior of the old suite that still applies, adapted to the new flow (open via launcher → home → click `.bp-card[data-type="bug"]` → form). Required cases:

1. host isolation; trigger `aria-label`/`title` = trigger text (no longer its text content);
2. constructable styles + `<style>` fallback + custom CSS order (unchanged);
3. accent variables: `--bp-accent`, `--bp-accent-2`, `--bp-on-accent` (`#1a1414` for `#FACC15`), position, locale;
4. hideTrigger; badge on/off and https-only; host fixed vs preview; isOpen;
5. launcher opens home; `aria-expanded` toggles; home focuses the first card; clicking a card opens the form for that type with the right placeholder and focuses the message;
6. back returns to home; `open('idea')` opens the idea form directly; `open()` opens home; reopen after thanks → requested screen;
7. bug form auto-captures (`.bp-thumb[data-state="ready"]` after flush); idea form does not call `loadCapture` until the capture button is clicked;
8. Escape closes and returns focus to the launcher; key-propagation guard; Tab wrap;
9. requires a message; validates email; `aria-describedby` links both errors;
10. submits payload with the screenshot and elapsed time; sends without a screenshot after removing it; sends without it when capture is still pending after 8 s;
11. thanks then auto-close after 2 s; rate-limit message keeps text; retry after network and server errors; busy state;
12. identify prefill rules (all four existing cases);
13. preview never submits and never loads chunks;
14. stale capture after close/reopen is ignored; closing during an in-flight send resets instead of showing thanks;
15. focus returns to the previously focused element with hideTrigger;
16. pasting an image while the form is open adds it (`handlePaste` path through the panel).

Update `public-api.test.ts` (invalid type → `open()` with no argument) and `index.test.ts` (`loadAnnotate` wired with the versioned `annotate.js` URL).

- [ ] **Step 1:** Write the new `mount.test.ts` cases above against the new structure; run → FAIL.
- [ ] **Step 2:** Implement the files; run `pnpm --filter @bugping/widget test` → PASS.
- [ ] **Step 3:** `pnpm --filter @bugping/widget build && pnpm --filter @bugping/widget size && pnpm --filter @bugping/widget check:bundle` → within budgets; `pnpm typecheck`, `pnpm format:check` → pass.
- [ ] **Step 4:** Commit.

```bash
git add -A packages/widget
git commit -m "feat(widget): redesigned launcher, home screen, form and thanks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Mobile speed-dial and bottom sheet

**Files:**
- Create: `packages/widget/src/ui/dial.ts`
- Modify: `packages/widget/src/ui/panel.ts`, `packages/widget/src/ui/mount.ts`, `packages/widget/src/ui/styles.css`
- Test: add a `describe('compact layout')` block to `packages/widget/src/ui/mount.test.ts` using `MountOptions.compact: () => true`

**Interfaces:**
- Consumes: `MountOptions.compact` and panel `open(type?)` (Task 5).
- Produces: `createDial({ t, onPick(type), onClose }): { element: HTMLElement; open(): void; close(): void; isOpen(): boolean }` — `div.bp-dial[role=menu]` with three `button.bp-dial-item[role=menuitem][data-type]` (label chip + round icon button).

Behavior (spec: mobile flow, look, motion, accessibility):

- Compact is evaluated at each open. Launcher click when compact: toggles the dial (launcher shows ✕ while the dial is open). Picking an item closes the dial and opens the form for that type as a bottom sheet.
- `open(type)` when compact → sheet form directly. `open()` without type when compact: if the launcher is visible → dial; if `hideTrigger` → home screen inside the sheet.
- Sheet: `.bp-panel` gains class `bp-sheet`: fixed to the bottom, full width, `max-height: 90vh`, top radius 16 px, grab handle element at the top; slides up (`translateY(100%)` → `0`, 220 ms). Close via ✕, Escape, or a downward drag on the handle/header of more than 80 px (pointer events on the handle/header; below 80 px it snaps back).
- Dial: items rise + fade with a 40 ms stagger (`transition-delay` via `style` per index); `Escape` closes the dial and focuses the launcher; `ArrowUp`/`ArrowDown` move focus between items; first item focused on open. Launcher 48 px when compact.
- Everything respects `data-position` (dial and chips align to the launcher side).

Tests (compact = true): launcher opens the dial (3 items, first focused, launcher `aria-expanded=true`); picking "idea" opens `.bp-panel.bp-sheet` on the idea form; Escape closes the dial; arrow keys move focus; `open('bug')` → sheet form; `open()` with hideTrigger → home in the sheet; swipe down > 80 px on the handle closes; < 80 px keeps it open. Desktop tests keep passing (compact defaults to false in happy-dom unless `matchMedia` says otherwise — pass `compact: () => false` in the shared `setup()` explicitly).

- [ ] **Step 1:** tests → FAIL. **Step 2:** implement → PASS. **Step 3:** build/size/check-bundle/typecheck/format → pass. **Step 4:** commit:

```bash
git add -A packages/widget
git commit -m "feat(widget): mobile speed-dial and bottom sheet

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: End-to-end tests, dashboard touch-ups, docs

**Files:**
- Modify: `packages/widget/e2e/widget.spec.ts`, `packages/widget/dev/built.html` (only if a paste/idea target is needed), `packages/widget/dev/mock-api.ts` (only if needed to expose the last screenshot bytes — it already has `/__mock/last-screenshot`)
- Modify: `apps/web/e2e/api.spec.ts`, `apps/web/e2e/dashboard.spec.ts` (extra home-screen click)
- Modify: `apps/web/messages/en.json`, `apps/web/messages/ru.json`: the custom-CSS hint lists the main hooks (`.bp-trigger`, `.bp-panel`, `.bp-home`, `.bp-card`, `.bp-form`, `.bp-send`, `.bp-shot`); `customHint` for hide-trigger says `Bugping.open()` opens the choice screen and `Bugping.open('bug')` the bug form. Keep ICU escaping (`'{'` etc.).
- Modify: `docs/superpowers/followups/2026-09-22-widget-followups.md` — remove the two accessibility items this stage closed (type group name, `aria-describedby`), note the annotation/own-image features don't change the capture follow-up.

Playwright cases (`packages/widget/e2e/widget.spec.ts`), replacing the old trigger-text and submit tests and keeping the hostile-CSS and masking checks:

1. Launcher keeps its own styles despite hostile host CSS: `.bp-trigger` computed `position: fixed`, `border-top-style: none`, width 56 px; `aria-label` = "Feedback".
2. Desktop bug flow: launcher → `.bp-card[data-type="bug"]` → `.bp-thumb[data-state="ready"]` (15 s) → masking check (existing pixel check) → `.bp-shot-annotate` → editor (`[data-bugping-annotate]`) → drag a rectangle on its canvas with `page.mouse` → Done → message → wait 2.1 s → send → `.bp-thanks` visible → `/__mock/last-submission` has a screenshot; fetch `/__mock/last-screenshot` and assert some pixels inside the drawn rectangle's border are red-dominant (`r > 200 && g < 90 && b < 90`).
3. Paste flow: open idea form → shot block `empty` → dispatch a synthetic `paste` event on the panel carrying a PNG `File` built in the page (`new DataTransfer()` + `items.add(file)`; `new ClipboardEvent('paste', { clipboardData: dt })`) → thumbnail ready → send → submission includes a screenshot.
4. Mobile: `test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })` in a `describe` → launcher → `.bp-dial-item[data-type="idea"]` → `.bp-panel.bp-sheet` visible → message → send → thanks.
5. Hidden trigger: `/dev/built-hidden.html` → `window.Bugping.open()` → `.bp-home` visible; `window.Bugping.open('general')` → form title "Ask a question".

`apps/web` e2e: after clicking `[data-bugping] .bp-trigger`, click `.bp-card[data-type="bug"]` before waiting for `.bp-thumb`.

- [ ] **Step 1:** Update specs; run `pnpm --filter @bugping/widget e2e` and `pnpm --filter @bugping/web e2e` → PASS (run each flaky-prone spec twice).
- [ ] **Step 2:** Messages + follow-ups doc; full verification set → pass.
- [ ] **Step 3:** Commit.

```bash
git add -A packages/widget apps/web/e2e apps/web/messages docs/superpowers/followups/2026-09-22-widget-followups.md
git commit -m "test(widget): end-to-end coverage for the redesigned widget; dashboard hints

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
