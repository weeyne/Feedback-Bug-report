import { rectFromPoints } from './geometry';
import { ANNOTATION_COLOR, HIDE_COLOR, STROKE_WIDTH, type Stroke } from './types';

/** Draws strokes in image space; `lineScale` keeps the on-screen stroke width constant. */
export function drawStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  lineScale: number,
): void {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const stroke of strokes) {
    const [a, b] = stroke.points;
    if (stroke.tool === 'hide') {
      if (!a || !b) continue;
      const r = rectFromPoints(a, b);
      ctx.fillStyle = HIDE_COLOR;
      ctx.fillRect(r.x, r.y, r.width, r.height);
      continue;
    }
    ctx.strokeStyle = ANNOTATION_COLOR;
    ctx.lineWidth = STROKE_WIDTH * lineScale;
    if (stroke.tool === 'rect') {
      if (!a || !b) continue;
      const r = rectFromPoints(a, b);
      ctx.strokeRect(r.x, r.y, r.width, r.height);
      continue;
    }
    if (stroke.points.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(stroke.points[0]![0], stroke.points[0]![1]);
    for (const [x, y] of stroke.points.slice(1)) ctx.lineTo(x, y);
    ctx.stroke();
  }
}
