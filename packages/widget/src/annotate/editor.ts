import { browserImageEnv, encodeWithinLimit } from '../image/prepare';
import { h } from '../ui/h';
import { fitRect, toImagePoint } from './geometry';
import { drawStrokes } from './render';
import styles from './styles.css?inline';
import type { AnnotateInput, AnnotateResult, Point, Stroke, Tool } from './types';

export interface EditorEnv {
  decode(
    blob: Blob,
  ): Promise<{ source: CanvasImageSource; width: number; height: number; close(): void }>;
  /**
   * Draws `strokes` over the image at full size. `lineScale` is the image-space stroke scale the
   * visitor saw on screen, so the exported marks are exactly as thick as the drawn ones.
   */
  exportImage(
    source: CanvasImageSource,
    width: number,
    height: number,
    strokes: Stroke[],
    lineScale: number,
  ): Promise<Blob>;
}

/** Space kept free below the image for a one-row toolbar (48px + 16px offset + a small gap). */
const TOOLBAR_HEIGHT = 72;
/** The toolbar's distance from the viewport's bottom edge (see styles.css). */
const TOOLBAR_BOTTOM = 16;
const VIEWPORT_PADDING = 24;
const MIN_RECT_SIZE = 4;
const MIN_PEN_STEP = 2;

/**
 * Constructable stylesheets are not `<style>` elements, so a strict `style-src` CSP on the host
 * does not block them. Returns false (nothing adopted) when unsupported, so callers can fall back.
 */
function adoptStyles(shadow: ShadowRoot, sources: string[]): boolean {
  try {
    if (typeof CSSStyleSheet !== 'function' || !('adoptedStyleSheets' in shadow)) return false;
    shadow.adoptedStyleSheets = sources.map((css) => {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      return sheet;
    });
    return true;
  } catch {
    return false;
  }
}

export const browserEditorEnv: EditorEnv = {
  decode: browserImageEnv.decode,
  async exportImage(source, width, height, strokes, lineScale) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(source, 0, 0, width, height);
      drawStrokes(ctx, strokes, lineScale);
    }
    return encodeWithinLimit(canvas, width, height);
  },
};

function isNonDegenerate(stroke: Stroke): boolean {
  if (stroke.tool === 'pen') return stroke.points.length >= 2;
  const [a, b] = stroke.points;
  if (!a || !b) return false;
  return Math.abs(a[0] - b[0]) >= MIN_RECT_SIZE && Math.abs(a[1] - b[1]) >= MIN_RECT_SIZE;
}

function copyStrokes(strokes: Stroke[]): Stroke[] {
  return strokes.map((s) => ({ tool: s.tool, points: s.points.map((p) => [p[0], p[1]] as Point) }));
}

/**
 * Opens a full-viewport annotation overlay over `input.image` and resolves with the marked-up
 * image once the visitor clicks Done, or `null` on Cancel/Escape/any failure. Never throws.
 */
export function openEditor(
  input: AnnotateInput,
  env: EditorEnv = browserEditorEnv,
): Promise<AnnotateResult | null> {
  return new Promise((resolve) => {
    let settled = false;
    let decoded: {
      source: CanvasImageSource;
      width: number;
      height: number;
      close(): void;
    } | null = null;
    let host: HTMLDivElement | null = null;
    // Owned by mount()'s redraw/scheduleRedraw, but cancelled from cleanup() so a redraw queued
    // just before Done/Cancel/Escape can never run against a removed host or a closed image.
    let rafId: number | null = null;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    function cleanup() {
      if (rafId !== null) {
        if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId);
        rafId = null;
      }
      host?.remove();
      decoded?.close();
    }

    function finish(value: AnnotateResult | null) {
      if (settled) return;
      settled = true;
      cleanup();
      if (previouslyFocused && previouslyFocused !== document.body) {
        try {
          previouslyFocused.focus();
        } catch {
          // ignore: host page's own concern, never fatal here
        }
      }
      resolve(value);
    }

    env.decode(input.image).then(
      (d) => {
        if (settled) {
          d.close();
          return;
        }
        decoded = d;
        try {
          mount(d);
        } catch {
          finish(null);
        }
      },
      () => finish(null),
    );

    function mount(image: { source: CanvasImageSource; width: number; height: number }): void {
      let strokes = copyStrokes(input.strokes ?? []);
      let currentStroke: Stroke | null = null;
      let activePointerId: number | null = null;
      let activeTool: Tool = 'rect';

      const dpr = window.devicePixelRatio || 1;
      const canvas = h('canvas', { class: 'bp-annotate-canvas', 'aria-label': input.t.canvas });
      /** Image-space stroke scale: a constant on-screen width, reused by the export. */
      let lineScale = 1;

      /** Fits the image above `reserved` pixels of toolbar space. */
      function layout(reserved: number) {
        const fit = fitRect(
          image.width,
          image.height,
          window.innerWidth,
          window.innerHeight - reserved,
          VIEWPORT_PADDING,
        );
        lineScale = 1 / fit.scale;
        // CSSOM, not a `style` attribute: a strict `style-src` CSP on the host blocks the latter.
        canvas.style.left = `${fit.x}px`;
        canvas.style.top = `${fit.y}px`;
        canvas.style.width = `${fit.width}px`;
        canvas.style.height = `${fit.height}px`;
        canvas.width = Math.max(1, Math.round(fit.width * dpr));
        canvas.height = Math.max(1, Math.round(fit.height * dpr));
      }
      layout(TOOLBAR_HEIGHT);

      function redraw() {
        rafId = null;
        // Guards a redraw that was already queued (via requestAnimationFrame) when Done/Cancel/
        // Escape settled the editor: cleanup() cancels the rAF, but this is a second line of
        // defense, and the try/catch below stops any draw failure (e.g. a closed image source)
        // from ever escaping as an uncaught exception into the host page.
        if (settled) return;
        try {
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          const canvasScale = canvas.width / image.width;
          ctx.setTransform(canvasScale, 0, 0, canvasScale, 0, 0);
          ctx.clearRect(0, 0, image.width, image.height);
          ctx.drawImage(image.source, 0, 0, image.width, image.height);
          const all = currentStroke ? [...strokes, currentStroke] : strokes;
          drawStrokes(ctx, all, lineScale);
        } catch {
          // ignore: never let a draw failure surface as an uncaught error in the host page
        }
      }
      function scheduleRedraw() {
        if (typeof requestAnimationFrame !== 'function') {
          redraw();
          return;
        }
        if (rafId !== null) return;
        rafId = requestAnimationFrame(redraw);
      }

      function pointFromEvent(e: PointerEvent): Point {
        const box = canvas.getBoundingClientRect();
        return toImagePoint(e.clientX, e.clientY, box, image.width, image.height);
      }

      /** Raw listeners (not via h()): guard them so nothing ever throws into the host page. */
      function listen(
        target: EventTarget,
        type: string,
        handler: (event: PointerEvent & KeyboardEvent) => void,
      ) {
        target.addEventListener(type, (event) => {
          try {
            handler(event as PointerEvent & KeyboardEvent);
          } catch {
            // ignore: an editor bug must never surface as an uncaught error in the host page
          }
        });
      }

      listen(canvas, 'pointerdown', (e) => {
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch {
          // ignore: capture is a nicety, not required for correctness
        }
        activePointerId = e.pointerId;
        const p = pointFromEvent(e);
        currentStroke = { tool: activeTool, points: activeTool === 'pen' ? [p] : [p, p] };
        scheduleRedraw();
      });

      listen(canvas, 'pointermove', (e) => {
        if (!currentStroke || e.pointerId !== activePointerId) return;
        const p = pointFromEvent(e);
        if (currentStroke.tool === 'pen') {
          const last = currentStroke.points[currentStroke.points.length - 1]!;
          const dx = p[0] - last[0];
          const dy = p[1] - last[1];
          if (Math.hypot(dx, dy) >= MIN_PEN_STEP) currentStroke.points.push(p);
        } else {
          currentStroke.points[1] = p;
        }
        scheduleRedraw();
      });

      function endStroke(e: PointerEvent) {
        if (!currentStroke || e.pointerId !== activePointerId) return;
        const stroke = currentStroke;
        currentStroke = null;
        activePointerId = null;
        if (isNonDegenerate(stroke)) strokes.push(stroke);
        scheduleRedraw();
      }
      listen(canvas, 'pointerup', endStroke);
      listen(canvas, 'pointercancel', endStroke);

      const toolButtons: Array<[Tool, HTMLButtonElement]> = [];
      function setActiveTool(tool: Tool) {
        activeTool = tool;
        for (const [t, btn] of toolButtons) btn.setAttribute('aria-pressed', String(t === tool));
      }
      function toolButton(tool: Tool, label: string): HTMLButtonElement {
        const btn = h(
          'button',
          {
            type: 'button',
            'data-tool': tool,
            'aria-pressed': String(tool === activeTool),
            onClick: () => setActiveTool(tool),
          },
          label,
        );
        toolButtons.push([tool, btn]);
        return btn;
      }

      const rectBtn = toolButton('rect', input.t.rect);
      const penBtn = toolButton('pen', input.t.pen);
      const hideBtn = toolButton('hide', input.t.hide);

      const undoBtn = h(
        'button',
        {
          type: 'button',
          onClick: () => {
            strokes.pop();
            scheduleRedraw();
          },
        },
        input.t.undo,
      );

      const cancelBtn = h(
        'button',
        {
          type: 'button',
          class: 'bp-annotate-cancel',
          'aria-label': input.t.cancel,
          onClick: () => finish(null),
        },
        '✕',
      );

      const doneBtn = h(
        'button',
        {
          type: 'button',
          class: 'bp-annotate-done',
          onClick: () => {
            void (async () => {
              try {
                const exported = await env.exportImage(
                  image.source,
                  image.width,
                  image.height,
                  strokes,
                  lineScale,
                );
                finish({ image: exported, strokes: copyStrokes(strokes) });
              } catch {
                finish(null);
              }
            })();
          },
        },
        input.t.done,
      );

      const toolbar = h(
        'div',
        { class: 'bp-annotate-toolbar', role: 'toolbar' },
        rectBtn,
        penBtn,
        hideBtn,
        undoBtn,
        cancelBtn,
        doneBtn,
      );

      const scrim = h('div', { class: 'bp-annotate-scrim' });
      const root = h('div', { class: 'bp-annotate-root' }, scrim, canvas, toolbar);

      host = document.createElement('div');
      host.setAttribute('data-bugping-annotate', '');
      host.style.cssText = 'all: initial; position: fixed; inset: 0; z-index: 2147483001';
      const shadow = host.attachShadow({ mode: 'open' });
      if (!adoptStyles(shadow, [styles])) {
        shadow.append(h('style', {}, styles));
      }
      shadow.append(root);
      document.body.append(host);

      // On a narrow phone the toolbar wraps onto a second row: fit the image above it instead.
      const toolbarSpace = toolbar.getBoundingClientRect().height + TOOLBAR_BOTTOM + 8;
      if (toolbarSpace > TOOLBAR_HEIGHT) layout(toolbarSpace);

      // Composed key events would reach the host page's shortcuts; keep them in the editor.
      for (const type of ['keypress', 'keyup']) {
        listen(host, type, (e) => e.stopPropagation());
      }
      listen(host, 'keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          finish(null);
          return;
        }
        if (e.key === 'Tab') {
          const focusable = toolbar.querySelectorAll<HTMLButtonElement>('button');
          if (focusable.length === 0) return;
          const first = focusable[0]!;
          const last = focusable[focusable.length - 1]!;
          // Focus lives inside the shadow tree: document.activeElement is only the host.
          const active = shadow.activeElement;
          if (e.shiftKey && active === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && active === last) {
            e.preventDefault();
            first.focus();
          }
        }
      });

      rectBtn.focus();
      redraw();
    }
  });
}
