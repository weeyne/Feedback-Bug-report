import { ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { cn } from 'cn';
import { buttonVariants } from '@/components/ui/button';
import { originAllowed } from '@/lib/widget/origins';
import { AllowOriginButton } from './allow-origin-button';

/** Warns that the allow-list refused a site, until it is allowed or the list changes to allow it. */
export function BlockedOriginNotice({
  projectId,
  blockedOrigin,
  blockedAt,
  allowedOrigins,
}: {
  projectId: string;
  blockedOrigin: string | null;
  blockedAt: string | null;
  allowedOrigins: readonly string[];
}) {
  const t = useTranslations('blockedOrigin');
  const format = useFormatter();
  if (!blockedOrigin || !blockedAt || originAllowed(blockedOrigin, allowedOrigins)) return null;
  return (
    <section
      role="status"
      data-testid="blocked-origin-notice"
      className="flex flex-col gap-3 rounded-xl border border-amber-600/30 bg-amber-500/10 p-4 sm:flex-row sm:items-center dark:border-amber-400/30 dark:bg-amber-400/10"
    >
      <ShieldAlert className="size-5 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold break-all">{t('title', { origin: blockedOrigin })}</p>
        <p className="text-xs text-muted-foreground">
          {t('hint', { time: format.relativeTime(new Date(blockedAt)) })}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <AllowOriginButton projectId={projectId} />
        <Link
          href={`/app/p/${projectId}/settings`}
          className={cn(buttonVariants({ size: 'sm', variant: 'outline' }))}
        >
          {t('settings')}
        </Link>
      </div>
    </section>
  );
}
