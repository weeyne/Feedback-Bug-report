import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./globals.css', import.meta.url), 'utf8');

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`missing ${selector} block`);
  return css.slice(start, css.indexOf('}', start));
}

function token(body: string, name: string): string {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(body);
  if (!match) throw new Error(`--${name} is not a 6-digit hex color`);
  return match[1]!;
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe.each([':root', '.dark'])('%s theme', (selector) => {
  const body = block(selector);

  it('primary buttons meet WCAG AA for normal text', () => {
    expect(
      contrast(token(body, 'primary'), token(body, 'primary-foreground')),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('body text meets WCAG AA', () => {
    expect(contrast(token(body, 'background'), token(body, 'foreground'))).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(
      contrast(token(body, 'background'), token(body, 'muted-foreground')),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the brand coral', () => {
    expect(token(body, 'brand').toUpperCase()).toBe('#FF4D3D');
  });
});
