import { describe, expect, it, vi } from 'vitest';
import { sampleMessage } from '@/test/notify-fixtures';
import { createTelegramNotifier } from './telegram';

const ok = () => new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
const tgError = (status: number, description: string, retryAfter?: number) =>
  new Response(
    JSON.stringify({
      ok: false,
      error_code: status,
      description,
      parameters: retryAfter ? { retry_after: retryAfter } : undefined,
    }),
    { status },
  );

function notifier(fetchImpl: typeof fetch) {
  return createTelegramNotifier({ token: '123:ABC', chatId: '424242', fetch: fetchImpl });
}

describe('telegram notifier', () => {
  it('sends a text message with HTML formatting when there is no screenshot', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => ok());
    expect(await notifier(fetchImpl as typeof fetch).send(sampleMessage())).toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.telegram.org/bot123:ABC/sendMessage');
    const body = JSON.parse(String(init!.body));
    expect(body).toMatchObject({ chat_id: '424242', parse_mode: 'HTML' });
    expect(body.text).toContain('Open in dashboard');
  });

  it('sends a photo with the caption when a screenshot is attached', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => ok());
    const screenshot = {
      data: new Uint8Array([1, 2, 3]),
      contentType: 'image/webp',
      filename: 'screenshot.webp',
    };
    await notifier(fetchImpl as typeof fetch).send(sampleMessage({ screenshot }));
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.telegram.org/bot123:ABC/sendPhoto');
    const form = init!.body as FormData;
    expect(form.get('chat_id')).toBe('424242');
    expect(form.get('parse_mode')).toBe('HTML');
    expect(String(form.get('caption'))).toContain('Checkout');
    expect((form.get('photo') as File).type).toBe('image/webp');
  });

  it('splits into photo + message when the caption exceeds 1024 chars', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => ok());
    const screenshot = {
      data: new Uint8Array([1]),
      contentType: 'image/jpeg',
      filename: 'screenshot.jpg',
    };
    await notifier(fetchImpl as typeof fetch).send(
      sampleMessage({ screenshot, message: 'y'.repeat(1500) }),
    );
    expect(fetchImpl.mock.calls.map(([url]) => String(url).split('/').pop())).toEqual([
      'sendPhoto',
      'sendMessage',
    ]);
    const caption = String((fetchImpl.mock.calls[0]![1]!.body as FormData).get('caption'));
    expect(caption.length).toBeLessThanOrEqual(1024);
    expect(JSON.parse(String(fetchImpl.mock.calls[1]![1]!.body)).text).toContain('y'.repeat(100));
  });

  it('sends plain text notices without parse mode', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => ok());
    await notifier(fetchImpl as typeof fetch).send({ kind: 'text', text: 'Limit <reached>' });
    const body = JSON.parse(String(fetchImpl.mock.calls[0]![1]!.body));
    expect(body).toEqual({
      chat_id: '424242',
      text: 'Limit <reached>',
      link_preview_options: { is_disabled: true },
    });
  });

  it('classifies failures', async () => {
    const send = (response: Response) =>
      notifier((async () => response) as typeof fetch).send(sampleMessage());
    expect(await send(tgError(429, 'Too Many Requests', 7))).toMatchObject({
      ok: false,
      retryable: true,
      disable: false,
      retryAfterSec: 7,
    });
    expect(await send(tgError(502, 'Bad Gateway'))).toMatchObject({
      retryable: true,
      disable: false,
    });
    expect(await send(tgError(403, 'Forbidden: bot was kicked'))).toMatchObject({
      retryable: false,
      disable: true,
    });
    expect(await send(tgError(400, 'Bad Request: chat not found'))).toMatchObject({
      disable: true,
    });
    expect(await send(tgError(400, 'Bad Request: message is too long'))).toMatchObject({
      retryable: false,
      disable: false,
    });
    const offline = notifier((async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch);
    expect(await offline.send(sampleMessage())).toMatchObject({
      ok: false,
      retryable: true,
      disable: false,
    });
  });
});
