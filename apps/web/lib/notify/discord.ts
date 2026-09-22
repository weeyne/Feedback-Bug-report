import { environmentLine, redactUrls, TYPE_STYLE, truncate } from './format';
import type { DeliveryResult, FeedbackMessage, Notification, Notifier } from './types';

const NO_MENTIONS = { parse: [] as string[] };
const EMBED_TOTAL_LIMIT = 6000;
const DESCRIPTION_LIMIT = 4000;
const EMBED_SAFETY_MARGIN = 20;

/**
 * Escapes masked-link and autolink syntax (`[text](url)`, `<url>`) in text written by the
 * anonymous reporter, then truncates without leaving a dangling escape backslash.
 */
function escapeLinks(text: string, max: number): string {
  const escaped = text.replace(/[[\]()<>]/g, '\\$&');
  if (escaped.length <= max) return escaped;
  let cut = escaped.slice(0, Math.max(0, max - 1));
  const backslashes = /\\+$/.exec(cut)?.[0].length ?? 0;
  if (backslashes % 2 === 1) cut = cut.slice(0, -1);
  return `${cut}…`;
}

function embedFor(m: FeedbackMessage) {
  const style = TYPE_STYLE[m.type];
  const fields = [
    ...(m.email ? [{ name: 'Email', value: escapeLinks(m.email, 254), inline: true }] : []),
    { name: 'Page', value: escapeLinks(m.metadata.url, 1024) },
    { name: 'Browser', value: truncate(environmentLine(m), 1024) },
  ];
  const errors = m.metadata.consoleErrors.slice(-3);
  if (errors.length) {
    fields.push({
      name: 'Console errors',
      value: truncate(errors.map((e) => `• ${e.message}`).join('\n'), 1024),
    });
  }
  const title = truncate(`${style.emoji} ${style.label} · ${m.projectName}`, 256);
  const used =
    title.length + fields.reduce((sum, field) => sum + field.name.length + field.value.length, 0);
  const budget = Math.min(DESCRIPTION_LIMIT, EMBED_TOTAL_LIMIT - used - EMBED_SAFETY_MARGIN);
  return {
    title,
    description: escapeLinks(m.message, Math.max(1, budget)),
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
        // A webhook URL never redirects; following one could leak the payload elsewhere.
        redirect: 'error',
      });
      return response.ok ? { ok: true } : classify(response);
    } catch (error) {
      return {
        ok: false,
        retryable: true,
        disable: false,
        error: `network: ${redactUrls((error as Error).message)}`,
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
