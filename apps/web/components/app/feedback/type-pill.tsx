import type { FeedbackType } from '@bugping/shared';
import { useTranslations } from 'next-intl';
import { cn } from 'cn';

/** Pill colours per feedback type, shared by the overview and the feed. */
export const TYPE_PILL: Record<FeedbackType, string> = {
  bug: 'bg-red-500/10 text-red-700 dark:text-red-300',
  idea: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  general: 'bg-stone-500/15 text-stone-700 dark:text-stone-300',
};

/** Chart/legend fill per feedback type (bug follows the brand primary). */
export const TYPE_FILL: Record<FeedbackType, string> = {
  bug: 'bg-primary',
  idea: 'bg-[#F5B400] dark:bg-[#E0A800]',
  general: 'bg-[#8A7F7B] dark:bg-[#A8998F]',
};

export function TypePill({ type, className }: { type: FeedbackType; className?: string }) {
  const t = useTranslations('feedback');
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-bold',
        TYPE_PILL[type],
        className,
      )}
    >
      {t(`type_${type}`)}
    </span>
  );
}
