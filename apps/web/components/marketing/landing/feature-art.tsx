import { Camera, Check, EyeOff, MessageCircle, Pencil, Square, Undo2 } from 'lucide-react';
import { cn } from 'cn';
import { LadybugMark } from '@/components/brand/logo';

/*
 * Small static illustrations for the feature tiles, drawn with CSS and inline SVG only. Each one
 * depicts something the product really has; they are decorative (`aria-hidden`).
 */

/** A muted placeholder line of text. */
function Bar({ className }: { className?: string }) {
  return <span className={cn('block h-2 rounded-full bg-muted-foreground/20', className)} />;
}

/** A mini checkout page with the annotation editor's rectangle, pen stroke and hide bar. */
export function ShotArt() {
  return (
    <div aria-hidden className="flex flex-col items-center gap-3">
      <div className="relative w-full overflow-hidden rounded-xl border bg-background shadow-sm">
        <div className="flex h-6 items-center gap-1 border-b bg-muted/60 px-2.5">
          <span className="size-1.5 rounded-full bg-muted-foreground/30" />
          <span className="size-1.5 rounded-full bg-muted-foreground/30" />
          <span className="size-1.5 rounded-full bg-muted-foreground/30" />
        </div>
        <div className="grid grid-cols-[2fr_3fr] gap-4 p-4 sm:gap-8 sm:p-8">
          <div className="aspect-[4/5] rounded-lg bg-linear-to-br from-secondary to-muted" />
          <div className="flex flex-col gap-2.5 pt-1">
            <Bar className="h-2.5 w-3/4 bg-muted-foreground/30" />
            <Bar className="w-1/3" />
            <div className="mt-1 flex items-center gap-2">
              <Bar className="w-10" />
              {/* The "hide" tool: a solid box over private data. */}
              <span className="block h-3 w-20 rounded-sm bg-[#1a1414] ring-1 ring-white/10 dark:bg-black" />
            </div>
            <Bar className="w-5/6" />
            {/* The Pay button, boxed by the rectangle tool. */}
            <div className="relative mt-2 self-start">
              <span className="block h-7 w-24 rounded-md bg-foreground/85 sm:w-28" />
              <span className="absolute -inset-2 rounded-md border-2 border-primary" />
            </div>
          </div>
        </div>
        {/* The pen tool's freehand stroke. */}
        <svg
          viewBox="0 0 120 40"
          className="absolute right-6 bottom-5 hidden h-8 w-24 text-primary sm:block"
          fill="none"
        >
          <path
            d="M4 30 C 20 6, 34 6, 42 22 S 64 38, 76 18 S 100 4, 116 14"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className="flex items-center gap-1 rounded-full border bg-card p-1 shadow-sm">
        {[Square, Pencil, EyeOff].map((Icon, i) => (
          <span
            key={i}
            className={cn(
              'grid size-7 place-items-center rounded-full text-muted-foreground',
              i === 0 && 'bg-primary text-primary-foreground',
            )}
          >
            <Icon className="size-3.5" />
          </span>
        ))}
        <span className="mx-0.5 h-4 w-px bg-border" />
        <span className="grid size-7 place-items-center rounded-full text-muted-foreground">
          <Undo2 className="size-3.5" />
        </span>
      </div>
    </div>
  );
}

/** A chat message from the Bugping bot with a screenshot thumbnail. */
export function ChatArt() {
  return (
    <div aria-hidden className="flex items-end gap-2">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary">
        <LadybugMark size={20} />
      </span>
      <div className="w-full max-w-60 rounded-2xl rounded-bl-sm border bg-background p-1.5 shadow-sm">
        <div className="relative h-16 rounded-xl bg-linear-to-br from-secondary to-muted">
          <span className="absolute top-1/2 left-1/2 h-5 w-14 -translate-1/2 rounded-sm border-2 border-primary" />
        </div>
        <div className="flex flex-col gap-1.5 px-1.5 pt-2 pb-1">
          <Bar className="w-1/2 bg-muted-foreground/35" />
          <Bar className="w-5/6" />
          <div className="flex items-center justify-between gap-2">
            <Bar className="w-2/5" />
            <span className="flex items-center text-[10px] text-muted-foreground tabular-nums">
              12:04
              <Check className="-mr-1 ml-0.5 size-3 text-primary" />
              <Check className="size-3 text-primary" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A few rows of the report's metadata, with a console error. */
export function ContextArt({ labels }: { labels: { page: string; browser: string; os: string } }) {
  const rows = [
    [labels.page, '/checkout'],
    [labels.browser, 'Chrome 128'],
    [labels.os, 'macOS 15'],
  ] as const;
  return (
    <div aria-hidden className="rounded-xl border bg-background p-3 text-xs shadow-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="truncate font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2.5 truncate rounded-md bg-destructive/10 px-2 py-1 font-mono text-[11px] text-destructive">
        TypeError: pay is not a function
      </p>
    </div>
  );
}

/** The feedback list's status tabs and two rows with type chips. */
export function DashboardArt({
  statuses,
  types,
}: {
  statuses: [string, string, string];
  types: [string, string];
}) {
  return (
    <div aria-hidden className="rounded-xl border bg-background p-2 text-xs shadow-sm">
      <div className="flex gap-1 rounded-lg bg-muted p-0.5">
        {statuses.map((status, i) => (
          <span
            key={status}
            className={cn(
              'flex min-w-0 flex-1 items-center justify-center gap-1 truncate rounded-md px-1.5 py-1 text-center font-medium text-muted-foreground',
              i === 0 && 'bg-card text-foreground shadow-sm',
            )}
          >
            <span className="truncate">{status}</span>
            {i === 0 ? (
              <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                2
              </span>
            ) : null}
          </span>
        ))}
      </div>
      <ul className="mt-2 flex flex-col gap-1">
        {types.map((type, i) => (
          <li
            key={type}
            className={cn(
              'flex items-center gap-2 rounded-md px-1.5 py-1.5',
              i === 0 && 'bg-muted/70',
            )}
          >
            <span className="size-5 shrink-0 rounded bg-linear-to-br from-secondary to-muted-foreground/20" />
            <span className="shrink-0 rounded-full border px-1.5 text-[10px] font-semibold">
              {type}
            </span>
            <Bar className={i === 0 ? 'w-3/5' : 'w-2/5'} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The widget's gzipped size as a bar, with the screenshot chunk loaded only on demand. */
export function SizeArt({ size, onDemand }: { size: string; onDemand: string }) {
  return (
    <div aria-hidden className="flex flex-col gap-2.5 text-xs">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-muted-foreground">widget.js</span>
        <span className="font-bold">{size}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-muted">
        <span className="block h-full w-1/4 rounded-full bg-primary" />
      </div>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Camera className="size-3.5 shrink-0" />
        <span className="h-2.5 flex-1 rounded-full border border-dashed border-muted-foreground/40" />
        <span className="shrink-0">{onDemand}</span>
      </div>
    </div>
  );
}

/** Sample brand colours; the first (selected) one is the site's own primary. */
const SWATCHES = [
  'bg-[#e0321f] dark:bg-[#ff5a4a]',
  'bg-[#2563eb] dark:bg-[#3b82f6]',
  'bg-[#16a34a] dark:bg-[#22c55e]',
  'bg-[#7c3aed] dark:bg-[#8b5cf6]',
  'bg-[#1a1414] dark:bg-[#fbf4f1]',
];

/** Colour swatches and the launcher button, with its text as a tooltip, in the chosen colour. */
export function BrandArt({ trigger }: { trigger: string }) {
  return (
    <div aria-hidden className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex gap-1.5">
        {SWATCHES.map((swatch, i) => (
          <span
            key={swatch}
            className={cn(
              'size-6 rounded-full',
              swatch,
              i === 0 && 'ring-2 ring-primary ring-offset-2 ring-offset-card',
            )}
          />
        ))}
      </div>
      {/* The round launcher; the button text is its tooltip and accessible name. */}
      <span className="flex items-center gap-2">
        <span className="rounded-md border bg-popover px-2 py-1 text-xs font-medium text-popover-foreground shadow-sm">
          {trigger}
        </span>
        <span className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground shadow-md">
          <MessageCircle className="size-5" />
        </span>
      </span>
    </div>
  );
}
