'use client';

import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { Menu } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

/** The mobile menu: the sidebar content in a sheet that closes after navigating. */
export function MobileNav({ label, children }: { label: string; children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(pathname);
  // Close when the route changes while the sheet is open (derived during render, no effect).
  if (open && openedAt !== pathname) setOpen(false);
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setOpenedAt(pathname);
      }}
    >
      <SheetTrigger
        className="inline-flex size-9 items-center justify-center rounded-lg border bg-card transition-colors duration-200 hover:bg-accent dark:bg-muted"
        aria-label={label}
      >
        <Menu className="size-5" aria-hidden />
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-64 overflow-y-auto border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
      >
        {children}
      </SheetContent>
    </Sheet>
  );
}
