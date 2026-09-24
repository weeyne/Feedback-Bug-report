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
