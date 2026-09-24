import { describe, expect, it } from 'vitest';
import { fitRect, rectFromPoints, toImagePoint } from './geometry';

describe('geometry', () => {
  it('fits the image inside the viewport with padding, centered, never upscaling', () => {
    const fit = fitRect(1600, 900, 1000, 800, 24);
    expect(fit.scale).toBeCloseTo(0.595, 5);
    expect(fit.width).toBeCloseTo(952, 5);
    expect(fit.height).toBeCloseTo(535.5, 5);
    expect(fit.x).toBeCloseTo(24, 5);
    expect(fit.y).toBeCloseTo(132.25, 5);
    expect(fitRect(400, 300, 1000, 800, 24)).toMatchObject({
      width: 400,
      height: 300,
      scale: 1,
      x: 300,
      y: 250,
    });
  });
  it('maps a client point into image pixels, clamped to the image', () => {
    const box = { left: 100, top: 50, width: 800, height: 450 };
    expect(toImagePoint(500, 275, box, 1600, 900)).toEqual([800, 450]);
    expect(toImagePoint(0, 0, box, 1600, 900)).toEqual([0, 0]);
    expect(toImagePoint(5000, 5000, box, 1600, 900)).toEqual([1600, 900]);
  });
  it('normalizes a rectangle from any two corners', () => {
    expect(rectFromPoints([30, 40], [10, 5])).toEqual({ x: 10, y: 5, width: 20, height: 35 });
  });
});
