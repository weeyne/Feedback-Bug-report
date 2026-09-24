function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Text color for surfaces filled with the project color. */
export function onAccent(hex: string): '#ffffff' | '#1a1414' {
  return contrastRatio(hex, '#ffffff') >= 4.5 ? '#ffffff' : '#1a1414';
}

/** Mixes the color towards white by `amount` (0..1). */
export function tint(hex: string, amount = 0.25): string {
  return `#${channels(hex)
    .map((v) =>
      Math.round(v + (255 - v) * amount)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}
