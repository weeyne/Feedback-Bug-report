'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * Replays the enter animation on every route change inside a project. `.animate-enter` fills
 * `backwards` only, so no transform lingers to trap `position: fixed` descendants (the mobile
 * feedback detail panel).
 */
export function PageEnter({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="animate-enter">
      {children}
    </div>
  );
}
