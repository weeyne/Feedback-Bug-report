'use client';

import { useEffect, useState } from 'react';

function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

export function CountUp({ value, durationMs = 400 }: { value: number; durationMs?: number }) {
  const [display, setDisplay] = useState(value);

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

  return <>{display.toLocaleString()}</>;
}
