import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from 'cn';
import { buttonVariants } from '@/components/ui/button';

export interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  body?: string;
  action?: { href: string; label: string; variant?: 'default' | 'outline' };
  /** Overrides the default `empty-state` test id. */
  testId?: string;
}

export function EmptyState({ icon, title, body, action, testId = 'empty-state' }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-8 text-center" data-testid={testId}>
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
        <Link
          href={action.href}
          className={cn(
            buttonVariants({ size: 'sm', variant: action.variant ?? 'default' }),
            'mt-2 font-semibold',
          )}
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
