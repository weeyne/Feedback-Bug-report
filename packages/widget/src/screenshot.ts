import { SCREENSHOT_MAX_BYTES } from '@dymcode/shared/constants';
import { domToCanvas } from 'modern-screenshot';

const MAX_WIDTH = 1600;
const MASK_SELECTOR = 'input[type="password"], [data-feedback-mask]';

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Masks sensitive elements inside a cloned node by setting brightness(0) filter.
 * For password inputs, also clears the value and removes the value attribute.
 * Never throws; non-matching nodes and non-elements are untouched.
 */
export function maskClonedNode(node: Node): void {
  try {
    if (!(node instanceof Element)) return;
    if (!node.matches(MASK_SELECTOR)) return;
    node.setAttribute('style', `${node.getAttribute('style') ?? ''} filter: brightness(0)`.trim());
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
 * masked via brightness(0) filter during rendering. Returns null on any failure or if the
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
