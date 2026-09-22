import { formatTelegram, redactUrls } from './format';
import type { DeliveryResult, Notification, Notifier } from './types';

const CAPTION_LIMIT = 1024;

interface TelegramResponse {
  ok?: boolean;
  description?: string;
  parameters?: { retry_after?: number };
}

function classify(status: number, body: TelegramResponse): DeliveryResult {
  const error = body.description ?? `HTTP ${status}`;
  if (status === 429)
    return {
      ok: false,
      retryable: true,
      disable: false,
      error,
      retryAfterSec: body.parameters?.retry_after,
    };
  if (status >= 500) return { ok: false, retryable: true, disable: false, error };
  const disable = [401, 403, 404].includes(status) || /chat not found/i.test(error);
  return { ok: false, retryable: false, disable, error };
}

export function createTelegramNotifier(opts: {
  token: string;
  chatId: string;
  fetch: typeof fetch;
  timeoutMs?: number;
}): Notifier {
  const call = async (method: string, body: BodyInit, json: boolean): Promise<DeliveryResult> => {
    try {
      const response = await opts.fetch(`https://api.telegram.org/bot${opts.token}/${method}`, {
        method: 'POST',
        body,
        headers: json ? { 'content-type': 'application/json' } : undefined,
        signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
      });
      const data = (await response.json().catch(() => ({}))) as TelegramResponse;
      return response.ok && data.ok ? { ok: true } : classify(response.status, data);
    } catch (error) {
      return {
        ok: false,
        retryable: true,
        disable: false,
        error: `network: ${redactUrls((error as Error).message)}`,
      };
    }
  };
  const sendMessage = (text: string, html: boolean) =>
    call(
      'sendMessage',
      JSON.stringify({
        chat_id: opts.chatId,
        text,
        ...(html ? { parse_mode: 'HTML' } : {}),
        link_preview_options: { is_disabled: true },
      }),
      true,
    );

  return {
    async send(notification: Notification) {
      if (notification.kind === 'text') return sendMessage(notification.text, false);
      const { full, short } = formatTelegram(notification);
      if (!notification.screenshot) return sendMessage(full, true);

      const form = new FormData();
      form.append('chat_id', opts.chatId);
      form.append('parse_mode', 'HTML');
      form.append('caption', full.length <= CAPTION_LIMIT ? full : short);
      form.append(
        'photo',
        new Blob([notification.screenshot.data as BlobPart], {
          type: notification.screenshot.contentType,
        }),
        notification.screenshot.filename,
      );
      const photo = await call('sendPhoto', form, false);
      if (!photo.ok || full.length <= CAPTION_LIMIT) return photo;
      return sendMessage(full, true);
    },
  };
}
