import type { CSSProperties, ReactNode } from 'react';
import { cn } from 'cn';

/** Header shared by the dashboard pages: 800-weight title, muted description, optional aside. */
export function PageHeader({
  title,
  description,
  aside,
}: {
  title: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {aside}
    </header>
  );
}

/** Content card with an optional title/description row; `index` staggers `.animate-enter`. */
export function SectionCard({
  title,
  description,
  aside,
  index = 0,
  className,
  children,
  ...rest
}: {
  title?: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
  index?: number;
  className?: string;
  children?: ReactNode;
  'data-testid'?: string;
}) {
  return (
    <section
      className={cn(
        'animate-enter flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-5',
        className,
      )}
      style={{ '--i': index } as CSSProperties}
      {...rest}
    >
      {(title || aside) && (
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="min-w-0">
            {title && <h2 className="font-bold">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}
