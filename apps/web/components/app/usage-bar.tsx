import { getTranslations } from 'next-intl/server';
import { cn } from 'cn';

export async function UsageBar({ used, limit }: { used: number; limit: number | null }) {
  const t = await getTranslations('feedback');
  if (limit === null)
    return (
      <p className="text-xs text-muted-foreground tabular-nums" data-testid="usage-bar">
        {t('usagePro', { used })}
      </p>
    );
  const percent = Math.min(100, Math.round((used / limit) * 100));
  return (
    <div
      className="flex items-center gap-2.5 text-xs text-muted-foreground tabular-nums"
      data-testid="usage-bar"
    >
      <div
        className="h-1.5 w-24 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={used}
        aria-label={t('usage', { used, limit })}
      >
        <div
          className={cn('h-full rounded-full', percent >= 100 ? 'bg-destructive' : 'bg-primary')}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span>{t('usage', { used, limit })}</span>
    </div>
  );
}
