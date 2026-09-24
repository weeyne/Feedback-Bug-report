'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Menu } from 'lucide-react';
import { cn } from 'cn';
import { Logo } from '@/components/brand/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { buttonVariants } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

export type NavItem = { href: string; label: string };

/** The landing's mobile menu (below `md`): nav links, the theme toggle and "Log in". */
export function LandingMenu({
  items,
  menuLabel,
  navLabel,
  logIn,
  className,
}: {
  items: NavItem[];
  menuLabel: string;
  navLabel: string;
  logIn: NavItem;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        data-testid="landing-menu"
        aria-label={menuLabel}
        className={cn(
          'inline-flex size-9 items-center justify-center rounded-lg border bg-card transition-colors duration-200 hover:bg-accent dark:bg-muted',
          className,
        )}
      >
        <Menu className="size-5" aria-hidden />
      </SheetTrigger>
      <SheetContent side="right" className="w-72 gap-0 p-0">
        <SheetTitle className="sr-only">{menuLabel}</SheetTitle>
        <div className="flex h-14 items-center px-6">
          <Logo />
        </div>
        <nav aria-label={navLabel} className="flex flex-col gap-1 px-3 pt-2">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={close}
              className="rounded-lg px-3 py-2.5 text-base font-medium text-foreground transition-colors duration-200 hover:bg-muted"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex items-center justify-between gap-3 border-t p-4">
          <Link
            href={logIn.href}
            onClick={close}
            className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'flex-1')}
          >
            {logIn.label}
          </Link>
          <ThemeToggle />
        </div>
      </SheetContent>
    </Sheet>
  );
}
