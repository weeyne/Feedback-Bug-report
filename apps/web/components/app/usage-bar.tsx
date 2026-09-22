import { getTranslations } from 'next-intl/server';

export async function UsageBar({ used, limit }: { used: number; limit: number | null }) {
  const t = await getTranslations('feedback');
  if (limit === null)
    return (
      <p className="text-xs text-muted-foreground" data-testid="usage-bar">
        {t('usagePro', { used })}
      </p>
    );
  const percent = Math.min(100, Math.round((used / limit) * 100));
  return (
    <div className="flex items-center gap-3 text-xs" data-testid="usage-bar">
      <div className="h-2 w-32 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full ${percent >= 100 ? 'bg-destructive' : 'bg-primary'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span>{t('usage', { used, limit })}</span>
    </div>
  );
}
