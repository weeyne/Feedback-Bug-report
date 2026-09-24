'use client';

import { type ReactNode, useEffect, useLayoutEffect, useRef } from 'react';
import { cn } from 'cn';

/** The share of the element that must be visible before it reveals. */
export const REVEAL_THRESHOLD = 0.15;

/** Whether the element is shown right away, without waiting for it to scroll into view. */
export function initialShown(reducedMotion: boolean): boolean {
  return reducedMotion;
}

// `useLayoutEffect` warns during server rendering; the server never runs effects anyway.
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Fades its content up once it scrolls into view (CSS `.reveal` in globals.css). With `stagger`, the
 * container stays put and its `.reveal-item` children (with `--i`) fade up one after another.
 * The hidden start state applies only under `html.js`, so without JS everything is visible.
 *
 * Never wrap anything that contains `position: fixed` descendants: while animating, the transform
 * makes this element their containing block.
 */
export function Reveal({
  children,
  className,
  stagger = false,
}: {
  children: ReactNode;
  className?: string;
  stagger?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // The root layout's inline script sets `html.js` before first paint; in development React's
  // Strict Mode remount resets <html> attributes and drops it, so re-apply it (no-op in production).
  useIsomorphicLayoutEffect(() => {
    document.documentElement.classList.add('js');
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const show = () => element.setAttribute('data-shown', '');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (initialShown(reduced) || typeof IntersectionObserver === 'undefined') {
      show();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        // A crossing can report a ratio a hair under the threshold, hence the small allowance.
        const visible = entries.some(
          (entry) => entry.isIntersecting && entry.intersectionRatio >= REVEAL_THRESHOLD - 0.01,
        );
        if (!visible) return;
        show();
        observer.disconnect();
      },
      { threshold: REVEAL_THRESHOLD },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={cn('reveal', stagger && 'reveal-group', className)}>
      {children}
    </div>
  );
}
