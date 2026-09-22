import { SCREENSHOT_MAX_BYTES } from '@dymcode/shared/constants';
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

/**
 * Captures the visible viewport without `exclude` (the widget host). Sensitive elements are
 * painted solid black during rendering. Returns null on any failure or if the
 * image is too large.
 */
export async function capture(exclude: Element): Promise<Blob | null> {
  try {
    const view = {
      x: window.scrollX,
      y: window.scrollY,
      w: window.innerWidth,
      h: window.innerHeight,
    };
    const scale = Math.min(1, MAX_WIDTH / view.w);
    const page = await domToCanvas(document.documentElement, {
      scale,
      timeout: RESOURCE_TIMEOUT_MS,
      filter: (node) => node !== exclude,
      onCloneEachNode: maskClonedNode,
    });
    // Pixels per CSS px in the rendered page, whatever the library did with devicePixelRatio.
    const k = page.width / document.documentElement.scrollWidth;

    const out = document.createElement('canvas');
    out.width = Math.round(view.w * k);
    out.height = Math.round(view.h * k);
    const ctx = out.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(page, view.x * k, view.y * k, out.width, out.height, 0, 0, out.width, out.height);

    let blob = await toBlob(out, 'image/webp', 0.7);
    if (!blob || blob.type !== 'image/webp') blob = await toBlob(out, 'image/jpeg', 0.8);
    return blob && blob.size <= SCREENSHOT_MAX_BYTES ? blob : null;
  } catch {
    return null;
  }
}
