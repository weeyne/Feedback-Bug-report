import { SCREENSHOT_MAX_BYTES } from '@dymcode/shared/constants';
import { domToCanvas } from 'modern-screenshot';

const MAX_WIDTH = 1600;
const MASK_SELECTOR = 'input[type="password"], [data-feedback-mask]';

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Captures the visible viewport without `exclude` (the widget host). Sensitive elements are
 * painted over. Returns null on any failure or if the image is too large.
 */
export async function capture(exclude: Element): Promise<Blob | null> {
  try {
    const view = {
      x: window.scrollX,
      y: window.scrollY,
      w: window.innerWidth,
      h: window.innerHeight,
    };
    const masks = Array.from(document.querySelectorAll(MASK_SELECTOR), (el) =>
      el.getBoundingClientRect(),
    );
    const scale = Math.min(1, MAX_WIDTH / view.w);
    const page = await domToCanvas(document.documentElement, {
      scale,
      filter: (node) => node !== exclude,
    });
    // Pixels per CSS px in the rendered page, whatever the library did with devicePixelRatio.
    const k = page.width / document.documentElement.scrollWidth;

    const out = document.createElement('canvas');
    out.width = Math.round(view.w * k);
    out.height = Math.round(view.h * k);
    const ctx = out.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(page, view.x * k, view.y * k, out.width, out.height, 0, 0, out.width, out.height);
    ctx.fillStyle = '#000';
    for (const r of masks) ctx.fillRect(r.left * k, r.top * k, r.width * k, r.height * k);

    let blob = await toBlob(out, 'image/webp', 0.7);
    if (!blob || blob.type !== 'image/webp') blob = await toBlob(out, 'image/jpeg', 0.8);
    return blob && blob.size <= SCREENSHOT_MAX_BYTES ? blob : null;
  } catch {
    return null;
  }
}
