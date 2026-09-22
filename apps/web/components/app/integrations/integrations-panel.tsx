'use client';

import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  createTelegramLinkAction,
  disconnectIntegrationAction,
  integrationStatusAction,
  saveCustomBotAction,
  saveDiscordAction,
  sendTestAction,
} from '@/app/app/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type {
  IntegrationKind,
  IntegrationStatus,
  TelegramLink,
} from '@/lib/dashboard/integrations';

const POLL_MS = 2000;
const POLL_LIMIT_MS = 60_000;

function IntegrationStatusLabel({ status }: { status: IntegrationStatus }) {
  const t = useTranslations();
  const format = useFormatter();
  return (
    <div className="text-xs" data-testid={`integration-${status.kind}-status`}>
      {status.connected ? (
        <span className="text-green-600">{t('integrations.connected')}</span>
      ) : status.lastError ? (
        <span className="text-destructive">
          {t('integrations.error', { message: status.lastError })}
        </span>
      ) : (
        <span className="text-muted-foreground">{t('integrations.notConnected')}</span>
      )}
      {status.lastDeliveredAt && (
        <span className="ml-2 text-muted-foreground">
          {t('integrations.lastDelivery', {
            time: format.relativeTime(new Date(status.lastDeliveredAt)),
          })}
        </span>
      )}
    </div>
  );
}

function IntegrationCard({
  kind,
  status,
  hint,
  children,
  locked,
  pending,
  onSendTest,
  onDisconnect,
}: {
  kind: IntegrationKind;
  status: IntegrationStatus;
  hint: string;
  children: ReactNode;
  locked?: boolean;
  pending: boolean;
  onSendTest: () => void;
  onDisconnect: () => void;
}) {
  const t = useTranslations();
  const exists = status.connected || status.lastError !== null;
  return (
    <section
      className="flex flex-col gap-3 rounded-lg border p-4"
      data-testid={`integration-${kind}`}
      data-connected={String(status.connected)}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-medium">
            {t(`integrations.${kind}`)} {locked && <span className="text-xs">🔒 Pro</span>}
          </h2>
          <p className="text-sm text-muted-foreground">{hint}</p>
        </div>
        <IntegrationStatusLabel status={status} />
      </div>
      {children}
      {exists && (
        <div className="flex gap-2">
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
  return (
    <div className="flex flex-col gap-4">
      <IntegrationCard
        kind="telegram_shared"
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
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <a
                href={link.privateUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
                data-testid="tg-private-link"
              >
                {t('integrations.privateChat')}
              </a>
              <a
                href={link.groupUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
                data-testid="tg-group-link"
              >
                {t('integrations.addToGroup')}
              </a>
            </div>
            <p className="animate-pulse text-xs text-muted-foreground">
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
          <p className="text-sm">{t('integrations.bot', { username: custom.botUsername })}</p>
        )}
        <form
          className="flex flex-wrap gap-2"
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
              className="max-w-xs"
              data-testid="custom-token"
            />
            <Input
              name="chatId"
              placeholder={t('integrations.chatId')}
              className="max-w-[12rem]"
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
        status={byKind('discord')}
        hint={t('integrations.discordHint')}
        pending={pending}
        onSendTest={() =>
          run(() => sendTestAction(props.projectId, 'discord'), 'integrations.testSent')
        }
        onDisconnect={() => run(() => disconnectIntegrationAction(props.projectId, 'discord'))}
      >
        <form
          className="flex flex-wrap gap-2"
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
            className="max-w-md"
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
