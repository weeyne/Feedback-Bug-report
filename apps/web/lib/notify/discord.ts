import { environmentLine, TYPE_STYLE, truncate } from './format';
import type { DeliveryResult, FeedbackMessage, Notification, Notifier } from './types';

const NO_MENTIONS = { parse: [] as string[] };

function embedFor(m: FeedbackMessage) {
  const style = TYPE_STYLE[m.type];
  const fields = [
    ...(m.email ? [{ name: 'Email', value: truncate(m.email, 254), inline: true }] : []),
    { name: 'Page', value: truncate(m.metadata.url, 1024) },
    { name: 'Browser', value: truncate(environmentLine(m), 1024) },
  ];
  const errors = m.metadata.consoleErrors.slice(-3);
  if (errors.length) {
    fields.push({
      name: 'Console errors',
      value: truncate(errors.map((e) => `• ${e.message}`).join('\n'), 1024),
    });
  }
  return {
    title: truncate(`${style.emoji} ${style.label} · ${m.projectName}`, 256),
    description: truncate(m.message, 4000),
    url: m.dashboardUrl,
    color: style.color,
    fields,
  };
}

async function classify(response: Response): Promise<DeliveryResult> {
  const error = `HTTP ${response.status}`;
  if (response.status === 429) {
    const body = (await response.json().catch(() => ({}))) as { retry_after?: number };
    return { ok: false, retryable: true, disable: false, error, retryAfterSec: body.retry_after };
  }
  if (response.status >= 500) return { ok: false, retryable: true, disable: false, error };
  return { ok: false, retryable: false, disable: [401, 404].includes(response.status), error };
}

export function createDiscordNotifier(opts: {
  webhookUrl: string;
  fetch: typeof fetch;
  timeoutMs?: number;
}): Notifier {
  const post = async (body: BodyInit, json: boolean): Promise<DeliveryResult> => {
    try {
      const response = await opts.fetch(opts.webhookUrl, {
        method: 'POST',
        body,
        headers: json ? { 'content-type': 'application/json' } : undefined,
        signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
      });
      return response.ok ? { ok: true } : classify(response);
    } catch (error) {
      return {
        ok: false,
        retryable: true,
        disable: false,
        error: `network: ${(error as Error).message}`,
      };
    }
  };

  return {
    async send(notification: Notification) {
      if (notification.kind === 'text') {
        return post(
          JSON.stringify({
            content: truncate(notification.text, 2000),
            allowed_mentions: NO_MENTIONS,
          }),
          true,
        );
      }
      const embed = embedFor(notification);
      if (!notification.screenshot) {
        return post(JSON.stringify({ embeds: [embed], allowed_mentions: NO_MENTIONS }), true);
      }
      const { data, contentType, filename } = notification.screenshot;
      const form = new FormData();
      form.append(
        'payload_json',
        JSON.stringify({
          embeds: [{ ...embed, image: { url: `attachment://${filename}` } }],
          allowed_mentions: NO_MENTIONS,
        }),
      );
      form.append('files[0]', new Blob([data as BlobPart], { type: contentType }), filename);
      return post(form, false);
    },
  };
}
