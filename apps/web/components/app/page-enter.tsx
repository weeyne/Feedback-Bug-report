'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * Replays the enter animation on every route change inside a project. `.animate-fade` animates
 * opacity only, so the wrapper never becomes the containing block of `position: fixed`
 * descendants (the mobile feedback detail panel), not even mid-animation.
 */
export function PageEnter({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="animate-fade">
      {children}
    </div>
  );
}
