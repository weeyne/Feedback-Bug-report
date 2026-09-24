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
      {
        tool: 'rect',
        points: [
          [10, 10],
          [50, 40],
        ],
      },
      {
        tool: 'pen',
        points: [
          [0, 0],
          [5, 5],
          [9, 3],
        ],
      },
      {
        tool: 'hide',
        points: [
          [100, 100],
          [60, 80],
        ],
      },
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
    drawStrokes(
      ctx,
      [
        { tool: 'rect', points: [[1, 1]] },
        { tool: 'pen', points: [[1, 1]] },
      ],
      1,
    );
    expect(ops.filter((op) => /Rect|lineTo/.test(op))).toEqual([]);
  });
});
