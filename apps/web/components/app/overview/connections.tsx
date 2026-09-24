import Link from 'next/link';
import { Code2, Gamepad2, Send, type LucideIcon } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { cn } from 'cn';
import { buttonVariants } from '@/components/ui/button';
import type { Overview } from '@/lib/dashboard/overview';

function Tile({
  id,
  icon: Icon,
  name,
  ok,
  status,
  href,
  action,
}: {
  id: string;
  icon: LucideIcon;
  name: string;
  ok: boolean;
  status: string;
  href: string;
  action?: string;
}) {
  const body = (
    <>
      <span
        className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"
        aria-hidden
      >
        <Icon className="size-4" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="font-semibold">{name}</span>
        <span
          className={cn(
            'flex min-w-0 items-center gap-1.5 text-xs',
            ok ? 'font-semibold text-green-700 dark:text-green-400' : 'text-muted-foreground',
          )}
        >
          <span
            className={cn(
              'size-1.5 shrink-0 rounded-full',
              ok ? 'bg-green-600 dark:bg-green-400' : 'border border-muted-foreground/60',
            )}
            aria-hidden
          />
          <span className="truncate" title={status}>
            {status}
          </span>
        </span>
      </span>
    </>
  );
  const tile = 'flex min-w-0 items-center gap-2.5 rounded-xl border bg-card px-3 py-2.5 text-sm';
  if (action) {
    return (
      <div data-testid={`connection-${id}`} data-ok={ok} className={tile}>
        {body}
        <Link href={href} className={cn(buttonVariants({ size: 'xs' }), 'ml-auto')}>
          {action}
        </Link>
      </div>
    );
  }
  return (
    <Link
      href={href}
      data-testid={`connection-${id}`}
      data-ok={ok}
      className={cn(tile, 'transition-colors duration-200 hover:bg-muted')}
    >
      {body}
    </Link>
  );
}

export function Connections({
  projectId,
  widgetSeenAt,
  integrations,
}: {
  projectId: string;
  widgetSeenAt: string | null;
  integrations: Overview['integrations'];
}) {
  const t = useTranslations('overview');
  const tInt = useTranslations('integrations');
  const format = useFormatter();
  const base = `/app/p/${projectId}`;

  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid="overview-connections">
      <Tile
        id="widget"
        icon={Code2}
        name={t('widget')}
        ok={widgetSeenAt !== null}
        status={
          widgetSeenAt
            ? t('widgetSeen', { time: format.relativeTime(new Date(widgetSeenAt)) })
            : t('widgetNotSeen')
        }
        href={`${base}/install`}
        action={widgetSeenAt ? undefined : t('install')}
      />
      <Tile
        id="telegram"
        icon={Send}
        name={tInt('telegram_shared')}
        ok={integrations.telegram}
        status={integrations.telegram ? t('connected') : t('notConnected')}
        href={`${base}/integrations`}
      />
      <Tile
        id="discord"
        icon={Gamepad2}
        name={tInt('discord')}
        ok={integrations.discord}
        status={integrations.discord ? t('connected') : t('notConnected')}
        href={`${base}/integrations`}
      />
    </section>
  );
}
