import { afterEach, describe, expect, it, vi } from 'vitest';
import { openEditor, type EditorEnv } from './editor';
import type { AnnotateMessages } from './types';

const t: AnnotateMessages = {
  rect: 'Rectangle',
  pen: 'Pen',
  hide: 'Hide',
  undo: 'Undo',
  done: 'Done',
  cancel: 'Cancel',
  canvas: 'Drawing area',
};
const out = new Blob(['annotated'], { type: 'image/webp' });

function env(): EditorEnv & { exportImage: ReturnType<typeof vi.fn> } {
  return {
    decode: async () => ({
      source: {} as CanvasImageSource,
      width: 1000,
      height: 500,
      close: () => {},
    }),
    exportImage: vi.fn(async () => out),
  };
}
const shadow = () => document.querySelector('[data-bugping-annotate]')!.shadowRoot!;
const button = (label: string) =>
  [...shadow().querySelectorAll('button')].find(
    (b) => b.getAttribute('aria-label') === label || b.textContent?.includes(label),
  )!;
function drag(from: [number, number], to: [number, number]) {
  const canvas = shadow().querySelector('canvas')!;
  canvas.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 1000,
    height: 500,
    right: 1000,
    bottom: 500,
    x: 0,
    y: 0,
    toJSON() {},
  });
  canvas.setPointerCapture = () => {};
  canvas.dispatchEvent(
    new PointerEvent('pointerdown', {
      clientX: from[0],
      clientY: from[1],
      pointerId: 1,
      bubbles: true,
    }),
  );
  canvas.dispatchEvent(
    new PointerEvent('pointermove', {
      clientX: to[0],
      clientY: to[1],
      pointerId: 1,
      bubbles: true,
    }),
  );
  canvas.dispatchEvent(
    new PointerEvent('pointerup', { clientX: to[0], clientY: to[1], pointerId: 1, bubbles: true }),
  );
}
const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  document.querySelector('[data-bugping-annotate]')?.remove();
  vi.unstubAllGlobals();
});

describe('annotation editor', () => {
  it('records a rectangle in image space and returns it with the exported image', async () => {
    const e = env();
    const result = openEditor({ image: new Blob(['x'], { type: 'image/png' }), t }, e);
    await flush();
    drag([100, 50], [300, 150]);
    button('Done').click();
    const value = await result;
    expect(value?.image).toBe(out);
    expect(value?.strokes).toEqual([
      {
        tool: 'rect',
        points: [
          [100, 50],
          [300, 150],
        ],
      },
    ]);
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
    expect((await result)?.strokes).toEqual([
      {
        tool: 'pen',
        points: [
          [10, 10],
          [60, 60],
        ],
      },
    ]);
  });
  it('Escape cancels with null and keeps prior strokes untouched', async () => {
    const prior = [
      {
        tool: 'hide' as const,
        points: [
          [1, 1],
          [50, 50],
        ] as [number, number][],
      },
    ];
    const result = openEditor(
      { image: new Blob(['x'], { type: 'image/png' }), strokes: prior, t },
      env(),
    );
    await flush();
    shadow()
      .querySelector('button')!
      .dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }),
      );
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

  it('cancels a queued redraw on settle so it never draws after cleanup (regression)', async () => {
    // Drive requestAnimationFrame manually: capture the queued callback instead of running it,
    // so we can settle the editor first and only then decide whether to flush it.
    const rafCallbacks: FrameRequestCallback[] = [];
    const raf = vi.fn((cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    const caf = vi.fn();
    vi.stubGlobal('requestAnimationFrame', raf);
    vi.stubGlobal('cancelAnimationFrame', caf);

    const e = env();
    const result = openEditor({ image: new Blob(['x'], { type: 'image/png' }), t }, e);
    await flush();

    const canvas = shadow().querySelector('canvas')!;
    canvas.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 1000,
      height: 500,
      right: 1000,
      bottom: 500,
      x: 0,
      y: 0,
      toJSON() {},
    });
    canvas.setPointerCapture = () => {};
    const drawImage = vi.fn();
    canvas.getContext = (() => ({
      setTransform: () => {},
      clearRect: () => {},
      drawImage,
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      strokeRect: () => {},
      fillRect: () => {},
    })) as unknown as HTMLCanvasElement['getContext'];

    // A pointer move queues exactly one redraw via requestAnimationFrame; it is not flushed.
    canvas.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 10, clientY: 10, pointerId: 1, bubbles: true }),
    );
    canvas.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 60, clientY: 60, pointerId: 1, bubbles: true }),
    );
    expect(raf).toHaveBeenCalledTimes(1);

    // Settle the editor (Done resolves, cleanup runs) before that queued frame ever fires.
    canvas.dispatchEvent(
      new PointerEvent('pointerup', { clientX: 60, clientY: 60, pointerId: 1, bubbles: true }),
    );
    button('Done').click();
    await result;

    // cleanup() must have cancelled the still-pending frame.
    expect(caf).toHaveBeenCalledWith(1);

    // Even if a browser ran the queued callback anyway, it must not throw and must not draw
    // against the now-removed host / closed image.
    drawImage.mockClear();
    const pending = rafCallbacks[0]!;
    expect(() => pending(0)).not.toThrow();
    expect(drawImage).not.toHaveBeenCalled();
  });
});
