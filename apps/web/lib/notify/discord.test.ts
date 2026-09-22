import { describe, expect, it, vi } from 'vitest';
import { createDiscordNotifier } from './discord';
import { sampleMessage } from '@/test/notify-fixtures';

const WEBHOOK = 'https://discord.com/api/webhooks/1/token';

function notifier(fetchImpl: typeof fetch) {
  return createDiscordNotifier({ webhookUrl: WEBHOOK, fetch: fetchImpl });
}

describe('discord notifier', () => {
  it('posts an embed as JSON without a screenshot and disables mentions', async () => {
    const fetchImpl = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(null, { status: 204 }),
    );
    expect(await notifier(fetchImpl as typeof fetch).send(sampleMessage())).toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(WEBHOOK);
    const body = JSON.parse(String(init!.body));
    expect(body.allowed_mentions).toEqual({ parse: [] });
    expect(body.embeds[0]).toMatchObject({
      title: '🐞 Bug · Acme <Shop>',
      url: 'https://dymcode.dev/projects/p1/feedback?f=f1',
      color: 0xef4444,
    });
    expect(body.embeds[0].description).toContain('Checkout');
    expect(body.embeds[0].fields.map((f: { name: string }) => f.name)).toEqual(
      expect.arrayContaining(['Email', 'Page', 'Browser', 'Console errors']),
    );
  });

  it('attaches the screenshot as a file referenced by the embed', async () => {
    const fetchImpl = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(null, { status: 204 }),
    );
    const screenshot = {
      data: new Uint8Array([9]),
      contentType: 'image/webp',
      filename: 'screenshot.webp',
    };
    await notifier(fetchImpl as typeof fetch).send(sampleMessage({ screenshot }));
    const form = fetchImpl.mock.calls[0]![1]!.body as FormData;
    const payload = JSON.parse(String(form.get('payload_json')));
    expect(payload.embeds[0].image).toEqual({ url: 'attachment://screenshot.webp' });
    expect(payload.allowed_mentions).toEqual({ parse: [] });
    expect((form.get('files[0]') as File).name).toBe('screenshot.webp');
  });

  it('sends text notices as content', async () => {
    const fetchImpl = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(null, { status: 204 }),
    );
    await notifier(fetchImpl as typeof fetch).send({ kind: 'text', text: 'Limit reached' });
    expect(JSON.parse(String(fetchImpl.mock.calls[0]![1]!.body))).toEqual({
      content: 'Limit reached',
      allowed_mentions: { parse: [] },
    });
  });

  it('classifies failures', async () => {
    const send = (response: Response) =>
      notifier((async () => response) as typeof fetch).send(sampleMessage());
    expect(
      await send(new Response(JSON.stringify({ retry_after: 1.5 }), { status: 429 })),
    ).toMatchObject({
      retryable: true,
      retryAfterSec: 1.5,
    });
    expect(await send(new Response('{}', { status: 404 }))).toMatchObject({
      retryable: false,
      disable: true,
    });
    expect(await send(new Response('{}', { status: 500 }))).toMatchObject({
      retryable: true,
      disable: false,
    });
  });

  it('never leaks the webhook URL in network errors', async () => {
    const offline = notifier((async () => {
      throw new TypeError(`Failed to parse URL from ${WEBHOOK}/extra`);
    }) as typeof fetch);
    const result = await offline.send(sampleMessage());
    expect(result).toMatchObject({ ok: false, retryable: true });
    const error = (result as { error: string }).error;
    expect(error).not.toContain('token');
    expect(error).not.toContain('discord.com');
    expect(error).toBe('network: Failed to parse URL from <url>');
  });

  it('refuses redirects', async () => {
    const fetchImpl = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(null, { status: 204 }),
    );
    await notifier(fetchImpl as typeof fetch).send(sampleMessage());
    expect(fetchImpl.mock.calls[0]![1]!.redirect).toBe('error');
  });

  it('keeps the whole embed within 6000 characters', async () => {
    const fetchImpl = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(null, { status: 204 }),
    );
    const base = sampleMessage();
    const long = sampleMessage({
      projectName: 'P'.repeat(300),
      message: 'm'.repeat(5000),
      email: `${'e'.repeat(300)}@example.com`,
      metadata: {
        ...base.metadata,
        url: `https://host.example/${'u'.repeat(2000)}`,
        browser: 'b'.repeat(1100),
        consoleErrors: [1, 2, 3].map((at) => ({ message: 'x'.repeat(500), at })),
      },
    });
    await notifier(fetchImpl as typeof fetch).send(long);
    const embed = JSON.parse(String(fetchImpl.mock.calls[0]![1]!.body)).embeds[0] as {
      title: string;
      description: string;
      fields: Array<{ name: string; value: string }>;
    };
    const total =
      embed.title.length +
      embed.description.length +
      embed.fields.reduce((sum, field) => sum + field.name.length + field.value.length, 0);
    expect(total).toBeLessThanOrEqual(6000);
    expect(embed.description.length).toBeGreaterThan(0);
    expect(embed.description.length).toBeLessThanOrEqual(4000);

    await notifier(fetchImpl as typeof fetch).send(sampleMessage({ message: 'm'.repeat(5000) }));
    const short = JSON.parse(String(fetchImpl.mock.calls[1]![1]!.body)).embeds[0];
    expect(short.description).toHaveLength(4000);
  });

  it('escapes masked-link syntax in reporter-controlled text', async () => {
    const fetchImpl = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(null, { status: 204 }),
    );
    const base = sampleMessage();
    await notifier(fetchImpl as typeof fetch).send(
      sampleMessage({
        message: 'Click [here](https://evil.example) <https://evil.example>',
        email: '[a](https://evil.example)@x.dev',
        metadata: { ...base.metadata, url: 'https://host.example/[x](https://evil.example)' },
      }),
    );
    const embed = JSON.parse(String(fetchImpl.mock.calls[0]![1]!.body)).embeds[0] as {
      description: string;
      fields: Array<{ name: string; value: string }>;
    };
    expect(embed.description).toBe(
      'Click \\[here\\]\\(https://evil.example\\) \\<https://evil.example\\>',
    );
    const field = (name: string) => embed.fields.find((f) => f.name === name)!.value;
    expect(field('Email')).toBe('\\[a\\]\\(https://evil.example\\)@x.dev');
    expect(field('Page')).toBe('https://host.example/\\[x\\]\\(https://evil.example\\)');
  });
});
