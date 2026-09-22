import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

const TYPES = ['all', 'bug', 'idea', 'general'] as const;
const STATUSES = ['new', 'resolved', 'archived'] as const;

export async function FeedbackFilters({
  base,
  type,
  status,
}: {
  base: string;
  type?: string;
  status: string;
}) {
  const t = await getTranslations('feedback');
  const href = (next: { type?: string; status?: string }) => {
    const params = new URLSearchParams();
    const nextType = next.type ?? type;
    if (nextType && nextType !== 'all') params.set('type', nextType);
    params.set('status', next.status ?? status);
    return `${base}?${params.toString()}`;
  };
  const pill = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs ${active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`;
  return (
    <div className="flex flex-wrap gap-2">
      {TYPES.map((value) => (
        <Link
          key={value}
          href={href({ type: value })}
          className={pill((type ?? 'all') === value)}
          data-testid={`filter-type-${value}`}
        >
          {value === 'all' ? t('typeAll') : t(`type_${value}`)}
        </Link>
      ))}
      <span className="mx-1 border-l" />
      {STATUSES.map((value) => (
        <Link
          key={value}
          href={href({ status: value })}
          className={pill(status === value)}
          data-testid={`filter-status-${value}`}
        >
          {t(`status_${value}`)}
        </Link>
      ))}
    </div>
  );
}
