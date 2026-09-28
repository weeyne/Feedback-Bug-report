import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/logo';
import { cn } from 'cn';

/** Centred layout for 404 / error screens. `embedded` drops the full-screen backdrop (inside the dashboard shell). */
export function StatusPage({
  code,
  title,
  body,
  note,
  embedded = false,
  children,
}: {
  code?: string;
  title: string;
  body: string;
  note?: string;
  embedded?: boolean;
  children: ReactNode;
}) {
  const Root = embedded ? 'div' : 'main';
  return (
    <Root
      className={cn(
        'flex flex-col items-center justify-center gap-6 p-4 text-center',
        embedded
          ? 'min-h-[70vh]'
          : 'min-h-screen bg-muted bg-[radial-gradient(var(--input)_1px,transparent_1px)] bg-size-[18px_18px]',
      )}
    >
      {!embedded && <Logo size="lg" href="/" />}
      <div className="flex max-w-md flex-col items-center gap-2">
        {code && (
          <p
            aria-hidden
            className="text-7xl font-extrabold tracking-tight text-primary tabular-nums sm:text-8xl"
          >
            {code}
          </p>
        )}
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
        <p className="text-balance text-muted-foreground">{body}</p>
        {note && <p className="text-xs text-muted-foreground/80 tabular-nums">{note}</p>}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">{children}</div>
    </Root>
  );
}
