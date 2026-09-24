import { describe, expect, it } from 'vitest';
import { contrastRatio, onAccent, tint } from './color';

describe('color helpers', () => {
  it('computes WCAG contrast', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 0);
    expect(contrastRatio('#E0321F', '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });
  it('picks white text on dark accents and dark text on light ones', () => {
    expect(onAccent('#1E3A8A')).toBe('#ffffff');
    expect(onAccent('#E0321F')).toBe('#ffffff');
    expect(onAccent('#FACC15')).toBe('#1a1414');
  });
  it('tints towards white', () => {
    expect(tint('#000000', 0.25)).toBe('#404040');
    expect(tint('#E0321F', 0)).toBe('#e0321f');
  });
});
