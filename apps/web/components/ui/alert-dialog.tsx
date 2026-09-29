'use client';

import * as React from 'react';
import { AlertDialog as AlertDialogPrimitive } from '@base-ui/react/alert-dialog';
import { cn } from 'cn';

import { DialogOverlay } from '@/components/ui/dialog';

function AlertDialog<Payload>({ ...props }: AlertDialogPrimitive.Root.Props<Payload>) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

/** Title, description, header and footer are the Dialog parts; only the root and popup differ. */
function AlertDialogContent({ className, ...props }: AlertDialogPrimitive.Popup.Props) {
  return (
    <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal">
      <DialogOverlay />
      <AlertDialogPrimitive.Popup
        data-slot="alert-dialog-content"
        className={cn(
          'fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
          className,
        )}
        {...props}
      />
    </AlertDialogPrimitive.Portal>
  );
}

export { AlertDialog, AlertDialogContent };
