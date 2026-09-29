import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/marketing/site-footer';
import { SiteHeader } from '@/components/marketing/site-header';

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col">
      {/* Scrolled out of view as soon as the page scrolls: the header then gets its backdrop. */}
      <div
        data-scroll-sentinel=""
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
      />
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
