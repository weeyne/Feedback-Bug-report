'use client';

import { useRouter } from 'next/navigation';
import { Bell, Bot, ExternalLink, Gamepad2, Lock, Send, type LucideIcon } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';
import { cn } from 'cn';
import {
  createTelegramLinkAction,
  disconnectIntegrationAction,
  integrationStatusAction,
  saveCustomBotAction,
  saveDiscordAction,
  sendTestAction,
} from '@/app/app/actions';
import { EmptyState } from '@/components/app/empty-state';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type {
  IntegrationKind,
  IntegrationStatus,
  TelegramLink,
} from '@/lib/dashboard/integrations';

const POLL_MS = 2000;
const POLL_LIMIT_MS = 60_000;

const ICONS: Record<IntegrationKind, LucideIcon> = {
  telegram_shared: Send,
  telegram_custom: Bot,
  discord: Gamepad2,
};

function IntegrationStatusChip({ status }: { status: IntegrationStatus }) {
  const t = useTranslations('integrations');
  const state = status.connected ? 'connected' : status.lastError ? 'error' : 'off';
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
        state === 'connected' &&
          'bg-green-600/10 text-green-700 dark:bg-green-400/10 dark:text-green-400',
        state === 'error' && 'bg-destructive/10 text-destructive',
        state === 'off' && 'bg-muted text-muted-foreground',
      )}
      data-testid={`integration-${status.kind}-status`}
      data-state={state}
    >
      <span
        className={cn(
          'size-1.5 shrink-0 rounded-full',
          state === 'connected' && 'bg-green-600 dark:bg-green-400',
          state === 'error' && 'bg-destructive',
          state === 'off' && 'border border-muted-foreground/60',
        )}
        aria-hidden
      />
      {state === 'connected'
        ? t('connected')
        : state === 'error'
          ? t('errorChip')
          : t('notConnected')}
    </span>
  );
}

function IntegrationCard({
  kind,
  index,
  status,
  hint,
  children,
  locked,
  pending,
  onSendTest,
  onDisconnect,
}: {
  kind: IntegrationKind;
  index: number;
  status: IntegrationStatus;
  hint: string;
  children: ReactNode;
  locked?: boolean;
  pending: boolean;
  onSendTest: () => void;
  onDisconnect: () => void;
}) {
  const t = useTranslations();
  const format = useFormatter();
  const exists = status.enabled || status.connected || status.lastError !== null;
  const Icon = ICONS[kind];
  return (
    <section
      className="animate-enter flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-5"
      style={{ '--i': index } as CSSProperties}
      data-testid={`integration-${kind}`}
      data-connected={String(status.connected)}
    >
      <div className="flex items-start gap-3">
        <span
          className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"
          aria-hidden
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex flex-wrap items-center gap-2 font-bold">
              {t(`integrations.${kind}`)}
              {locked && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                  <Lock className="size-3" aria-hidden />
                  Pro
                </span>
              )}
            </h2>
            <IntegrationStatusChip status={status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
        </div>
      </div>
      {!status.connected && status.lastError && (
        <p
          className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm break-words text-destructive"
          role="status"
        >
          {t('integrations.error', { message: status.lastError })}
        </p>
      )}
      {children}
      {exists && (
        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            data-testid={`send-test-${kind}`}
            onClick={onSendTest}
          >
            {t('integrations.sendTest')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            data-testid={`disconnect-${kind}`}
            onClick={onDisconnect}
          >
            {t('integrations.disconnect')}
          </Button>
          {status.lastDeliveredAt && (
            <span className="ml-auto text-xs text-muted-foreground">
              {t('integrations.lastDelivery', {
                time: format.relativeTime(new Date(status.lastDeliveredAt)),
              })}
            </span>
          )}
        </div>
      )}
    </section>
  );
}

export function IntegrationsPanel(props: {
  projectId: string;
  bot: string;
  pro: boolean;
  initial: IntegrationStatus[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const [statuses, setStatuses] = useState(props.initial);
  const [link, setLink] = useState<TelegramLink | null>(null);
  const [pending, start] = useTransition();
  const pollStarted = useRef(0);
  const byKind = (kind: IntegrationKind) => statuses.find((s) => s.kind === kind)!;
  const errorText = (key: string) =>
    t(key === 'integrations.notConnected' ? 'integrations.notConnectedError' : key);

  const refresh = async () => {
    const next = await integrationStatusAction(props.projectId);
    if (next) setStatuses(next);
    return next;
  };

  useEffect(() => {
    if (!link) return;
    pollStarted.current = Date.now();
    const timer = setInterval(async () => {
      const next = await refresh();
      if (next?.find((s) => s.kind === 'telegram_shared')?.connected) {
        clearInterval(timer);
        setLink(null);
        router.refresh();
      } else if (Date.now() - pollStarted.current > POLL_LIMIT_MS) {
        clearInterval(timer);
        setLink(null);
        toast.error(t('integrations.linkExpired'));
      }
    }, POLL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success?: string) =>
    start(async () => {
      const result = await fn();
      if (result.ok) {
        if (success) toast.success(t(success));
        await refresh();
      } else toast.error(errorText(result.error ?? 'errors.generic'));
    });

  const custom = byKind('telegram_custom');
  const noneConnected = statuses.every((s) => !s.connected);
  return (
    <div className="flex flex-col gap-4">
      {noneConnected && (
        <div className="animate-fade rounded-xl border border-dashed bg-card/60">
          <EmptyState
            icon={<Bell />}
            title={t('integrations.emptyTitle')}
            body={t('integrations.emptyBody')}
            testId="integrations-empty"
          />
        </div>
      )}
      <IntegrationCard
        kind="telegram_shared"
        index={0}
        status={byKind('telegram_shared')}
        hint={t('integrations.telegram_sharedHint', { bot: props.bot })}
        pending={pending}
        onSendTest={() =>
          run(() => sendTestAction(props.projectId, 'telegram_shared'), 'integrations.testSent')
        }
        onDisconnect={() =>
          run(() => disconnectIntegrationAction(props.projectId, 'telegram_shared'))
        }
      >
        {link ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <a
                href={link.privateUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="tg-private-link"
                className={buttonVariants({ size: 'sm' })}
              >
                {t('integrations.privateChat')}
                <ExternalLink aria-hidden />
              </a>
              <a
                href={link.groupUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="tg-group-link"
                className={buttonVariants({ size: 'sm', variant: 'outline' })}
              >
                {t('integrations.addToGroup')}
                <ExternalLink aria-hidden />
              </a>
            </div>
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <span
                className="size-2 shrink-0 animate-pulse rounded-full bg-primary motion-reduce:animate-none"
                aria-hidden
              />
              {t('integrations.waitingTelegram')}
            </p>
          </div>
        ) : (
          !byKind('telegram_shared').connected && (
            <Button
              size="sm"
              className="self-start"
              disabled={pending}
              data-testid="tg-connect"
              onClick={() =>
                start(async () => {
                  const result = await createTelegramLinkAction(props.projectId);
                  if (result.ok) setLink(result.link);
                  else toast.error(t(result.error));
                })
              }
            >
              {t('integrations.connect')}
            </Button>
          )
        )}
      </IntegrationCard>

      <IntegrationCard
        kind="telegram_custom"
        index={1}
        status={custom}
        hint={t('integrations.telegram_customHint')}
        locked={!props.pro}
        pending={pending}
        onSendTest={() =>
          run(() => sendTestAction(props.projectId, 'telegram_custom'), 'integrations.testSent')
        }
        onDisconnect={() =>
          run(() => disconnectIntegrationAction(props.projectId, 'telegram_custom'))
        }
      >
        {custom.botUsername && (
          <p className="text-sm font-semibold">
            {t('integrations.bot', { username: custom.botUsername })}
          </p>
        )}
        <form
          className="flex flex-wrap items-center gap-2"
          action={(form) =>
            run(
              () =>
                saveCustomBotAction(
                  props.projectId,
                  String(form.get('token') ?? ''),
                  String(form.get('chatId') ?? ''),
                ),
              'integrations.testSent',
            )
          }
        >
          <fieldset disabled={!props.pro || pending} className="contents">
            <Input
              name="token"
              type="password"
              autoComplete="off"
              placeholder={t('integrations.botToken')}
              className="min-w-40 flex-[2_1_12rem]"
              data-testid="custom-token"
            />
            <Input
              name="chatId"
              placeholder={t('integrations.chatId')}
              className="min-w-32 flex-[1_1_8rem]"
              data-testid="custom-chat"
            />
            <Button type="submit" size="sm" data-testid="custom-save">
              {t('integrations.save')}
            </Button>
          </fieldset>
        </form>
      </IntegrationCard>

      <IntegrationCard
        kind="discord"
        index={2}
        status={byKind('discord')}
        hint={t('integrations.discordHint')}
        pending={pending}
        onSendTest={() =>
          run(() => sendTestAction(props.projectId, 'discord'), 'integrations.testSent')
        }
        onDisconnect={() => run(() => disconnectIntegrationAction(props.projectId, 'discord'))}
      >
        <form
          className="flex flex-wrap items-center gap-2"
          action={(form) =>
            run(
              () => saveDiscordAction(props.projectId, String(form.get('webhookUrl') ?? '')),
              'integrations.testSent',
            )
          }
        >
          <Input
            name="webhookUrl"
            type="url"
            autoComplete="off"
            placeholder="https://discord.com/api/webhooks/…"
            className="min-w-48 flex-[1_1_16rem]"
            disabled={pending}
            data-testid="discord-url"
          />
          <Button type="submit" size="sm" disabled={pending} data-testid="discord-save">
            {t('integrations.save')}
          </Button>
        </form>
      </IntegrationCard>
    </div>
  );
}
