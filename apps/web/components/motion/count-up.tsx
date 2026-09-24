'use client';

import { useFormatter } from 'next-intl';
import { useEffect, useState } from 'react';

function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

/**
 * Counts from 0 up to `value`. The server renders 0 for the animated (aria-hidden) number so
 * hydration never jumps from the final value back to 0; the real value always sits in an sr-only
 * span for screen readers and no-JS readers. Under prefers-reduced-motion the real value is shown
 * directly by CSS (before hydration too) and the animated number is hidden. Numbers are formatted
 * with the next-intl locale so server and client output always match.
 */
export function CountUp({ value, durationMs = 400 }: { value: number; durationMs?: number }) {
  const format = useFormatter();
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setDisplay(value);
      return;
    }
    let frame: number;
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / durationMs, 1);
      setDisplay(Math.round(value * easeOut(progress)));
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        setDisplay(value);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs]);

  return (
    <span data-value={value}>
      <span aria-hidden className="motion-reduce:hidden">
        {format.number(display)}
      </span>
      <span className="sr-only motion-reduce:not-sr-only">{format.number(value)}</span>
    </span>
  );
}
