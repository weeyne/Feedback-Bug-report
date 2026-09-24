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
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
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
      const jpegQuality = Math.round((quality + 0.05) * 100) / 100;
      blob = await env.encode(source, w, h, 'image/jpeg', jpegQuality);
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
