'use client';

import { UserRound } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { cn } from 'cn';
import { AppLink } from '@/components/app/link-prefetch';

/** The sidebar's Account link; marked as the current page while on /app/account. */
export function NavAccountLink({ label, className }: { label: string; className: string }) {
  const active = usePathname() === '/app/account';
  return (
    <AppLink
      href="/app/account"
      aria-current={active ? 'page' : undefined}
      className={cn(className, active && 'bg-card font-bold text-foreground dark:bg-accent')}
      data-testid="nav-account"
    >
      <UserRound className="size-4 shrink-0" aria-hidden />
      {label}
    </AppLink>
  );
}
