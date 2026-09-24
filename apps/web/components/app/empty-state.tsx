import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

export interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  body?: string;
  action?: { href: string; label: string; variant?: 'default' | 'outline' };
}

export function EmptyState({ icon, title, body, action }: EmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center gap-2 px-6 py-8 text-center"
      data-testid="empty-state"
    >
      {icon && (
        <div
          className="mb-1 grid size-11 place-items-center rounded-full bg-muted text-muted-foreground [&_svg]:size-5"
          aria-hidden
        >
          {icon}
        </div>
      )}
      <h3 className="text-sm font-bold">{title}</h3>
      {body && <p className="max-w-xs text-sm text-muted-foreground">{body}</p>}
      {action && (
        <Button
          size="sm"
          variant={action.variant ?? 'default'}
          className="mt-2 font-semibold"
          nativeButton={false}
          render={<Link href={action.href} />}
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}
