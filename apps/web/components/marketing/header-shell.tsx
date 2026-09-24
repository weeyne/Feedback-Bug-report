'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { cn } from 'cn';

/**
 * The sticky header's frame. It only tracks whether the page is scrolled (the sentinel left the
 * viewport) and exposes it as `data-scrolled`. The sentinel is the 1px `[data-scroll-sentinel]`
 * element the marketing layout renders at the top of the page; the children stay server-rendered.
 */
export function HeaderShell({ className, children }: { className?: string; children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const sentinel = document.querySelector('[data-scroll-sentinel]');
    if (!sentinel || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries.at(-1);
      if (entry) setScrolled(!entry.isIntersecting);
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);
  return (
    <header
      data-testid="landing-header"
      data-scrolled={scrolled || undefined}
      className={cn(
        'sticky top-0 z-40 border-b border-transparent transition-[background-color,border-color,box-shadow] duration-200 ease-out motion-reduce:transition-none',
        'data-scrolled:border-border data-scrolled:bg-background/80 data-scrolled:shadow-sm data-scrolled:backdrop-blur',
        className,
      )}
    >
      {children}
    </header>
  );
}
