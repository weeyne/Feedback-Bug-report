import { SCREENSHOT_MAX_BYTES } from '@bugping/shared/constants';
import { domToCanvas } from 'modern-screenshot';

const MAX_WIDTH = 1600;
/** Upper bound for loading images/fonts while rendering, so a stalled resource cannot hang capture. */
const RESOURCE_TIMEOUT_MS = 5000;
const MASK_SELECTOR = 'input[type="password"], [data-feedback-mask]';

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Masks sensitive elements inside a cloned node: a solid black background and text color (so
 * glyphs on transparent backgrounds are covered too) plus a brightness(0) filter that blackens
 * images and children.
 * For password inputs, also clears the value and removes the value attribute.
 * Never throws; non-matching nodes and non-elements are untouched.
 */
export function maskClonedNode(node: Node): void {
  try {
    if (!(node instanceof Element)) return;
    if (!node.matches(MASK_SELECTOR)) return;
    const elem = node as HTMLElement | undefined;
    if (elem?.style?.setProperty) {
      elem.style.setProperty('background', '#000', 'important');
      elem.style.setProperty('color', '#000', 'important');
      elem.style.setProperty('filter', 'brightness(0)', 'important');
    }
    if (node instanceof HTMLInputElement && node.type === 'password') {
      node.value = '';
      node.removeAttribute('value');
    }
  } catch {
    // Never throw
  }
}

const TRANSPARENT = /^(transparent|rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\))$/;

/** The color a viewer should see behind the page: body, then html, else white. */
export function pageBackground(): string {
  for (const el of [document.body, document.documentElement]) {
    if (!el) continue;
    const color = getComputedStyle(el).backgroundColor;
    if (color && !TRANSPARENT.test(color.trim())) return color;
  }
  return '#ffffff';
}

/**
 * Captures the visible viewport without `exclude` (the widget host). Sensitive elements are
 * painted solid black during rendering. Returns null on any failure or if the
 * image is too large.
 */
export async function capture(exclude: Element): Promise<Blob | null> {
  try {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const scale = Math.min(1, MAX_WIDTH / w);
    // Render only the viewport. `position: relative` on the cloned root makes it the containing
    // block for absolutely positioned elements that had no positioned ancestor (so they move with
    // the offset like normal flow), while relative positioning does NOT become the containing
    // block for position:fixed elements (unlike transform/filter), so those stay viewport-bound.
    const canvas = await domToCanvas(document.documentElement, {
      width: w,
      height: h,
      scale,
      backgroundColor: pageBackground(),
      timeout: RESOURCE_TIMEOUT_MS,
      maximumCanvasSize: 4096,
      filter: (node) => node !== exclude,
      onCloneEachNode: maskClonedNode,
      style: { position: 'relative', top: `${-window.scrollY}px`, left: `${-window.scrollX}px` },
    });
    let blob = await toBlob(canvas, 'image/webp', 0.7);
    if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', 0.8);
    return blob && blob.size <= SCREENSHOT_MAX_BYTES ? blob : null;
  } catch {
    return null;
  }
}
