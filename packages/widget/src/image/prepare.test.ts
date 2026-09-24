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

function env(
  opts: { w?: number; h?: number; sizes?: number[]; webp?: boolean; decodeFails?: boolean } = {},
) {
  const sizes = [...(opts.sizes ?? [1000])];
  const calls: Array<{ width: number; height: number; type: string; quality: number }> = [];
  const close = vi.fn();
  const e: ImageEnv = {
    decode: async () => {
      if (opts.decodeFails) throw new Error('bad');
      return {
        source: {} as CanvasImageSource,
        width: opts.w ?? 800,
        height: opts.h ?? 600,
        close,
      };
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
    await expect(prepareImage(new Blob(['x'], { type: 'text/plain' }), e)).rejects.toMatchObject({
      code: 'not_image',
    });
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
    await expect(encodeWithinLimit({} as CanvasImageSource, 1600, 900, e)).rejects.toMatchObject({
      code: 'too_large',
    });
    expect(calls).toHaveLength(4);
  });
});
