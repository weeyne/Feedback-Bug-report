import type { ReactNode } from 'react';
import { cn } from 'cn';
import { Reveal } from '../reveal';

/** The landing's content column; matches the header's `max-w-6xl`. */
export const CONTAINER = 'mx-auto w-full max-w-6xl px-4 sm:px-6';

/** A card's surface with the shared hover lift. */
export const CARD =
  'rounded-2xl border bg-card text-card-foreground transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:translate-y-0';

/** A section heading with an optional muted subtitle, revealed on scroll. */
export function SectionHeading({
  id,
  title,
  subtitle,
  align = 'center',
  className,
}: {
  id?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  align?: 'center' | 'start';
  className?: string;
}) {
  return (
    <Reveal
      className={cn(
        'flex max-w-2xl flex-col gap-3',
        align === 'center' && 'mx-auto items-center text-center',
        className,
      )}
    >
      <h2 id={id} className="text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">
        {title}
      </h2>
      {subtitle ? <p className="text-lg text-pretty text-muted-foreground">{subtitle}</p> : null}
    </Reveal>
  );
}
