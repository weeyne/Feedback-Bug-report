import { SubmitPayloadSchema, type ClientMetadata, type WidgetConfig } from '@bugping/shared';
import { describe, expect, it, vi } from 'vitest';
import { buildPayload, fetchConfig, submitFeedback } from './api';

const ORIGIN = 'https://dymcode.dev';
const config: WidgetConfig = {
  primaryColor: '#6366f1',
  triggerText: 'Feedback',
  position: 'bottom-right',
  showBadge: true,
  customCss: null,
  badgeUrl: 'https://dymcode.dev/?ref=pk_AbCdEfGh12345678&utm_source=widget',
  locale: 'auto',
};
const metadata: ClientMetadata = {
  url: 'https://host.example/',
  referrer: '',
  userAgent: 'UA',
  language: 'en',
  timezone: 'UTC',
  viewport: { w: 1280, h: 720 },
  screen: { w: 1920, h: 1080, dpr: 1 },
  consoleErrors: [],
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('fetchConfig', () => {
  it('requests the config for the key and returns it', async () => {
    const fetchImpl = vi.fn(async () => json(config));
    await expect(fetchConfig(ORIGIN, 'pk_AbCdEfGh12345678', fetchImpl)).resolves.toEqual(config);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dymcode.dev/api/v1/widget/config?key=pk_AbCdEfGh12345678',
      { credentials: 'omit' },
    );
  });

  it('returns null on non-2xx, network errors and malformed bodies', async () => {
    await expect(fetchConfig(ORIGIN, 'k', async () => json({}, 404))).resolves.toBeNull();
    await expect(
      fetchConfig(ORIGIN, 'k', async () => {
        throw new TypeError('offline');
      }),
    ).resolves.toBeNull();
    await expect(
      fetchConfig(ORIGIN, 'k', async () => json({ ...config, primaryColor: 'red;}body{x' })),
    ).resolves.toBeNull();
    await expect(
      fetchConfig(ORIGIN, 'k', async () => json({ ...config, locale: 'de' })),
    ).resolves.toBeNull();
    await expect(
      fetchConfig(ORIGIN, 'k', async () => new Response('not json')),
    ).resolves.toBeNull();
  });
});

describe('submitFeedback', () => {
  const payload = buildPayload({
    projectKey: 'pk_AbCdEfGh12345678',
    type: 'bug',
    message: 'Broken',
    email: '',
    metadata,
    elapsedMs: 5000,
    website: '',
  });

  it('posts multipart with payload JSON and the screenshot', async () => {
    const fetchImpl = vi.fn(async () => json({ id: 'x' }, 201));
    const shot = new Blob(['img'], { type: 'image/webp' });
    await expect(submitFeedback(ORIGIN, payload, shot, fetchImpl)).resolves.toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://dymcode.dev/api/v1/widget/submit');
    expect(init.method).toBe('POST');
    const body = init.body as FormData;
    expect(JSON.parse(String(body.get('payload')))).toEqual(payload);
    expect((body.get('screenshot') as File).type).toBe('image/webp');
  });

  it('omits the screenshot field when there is none', async () => {
    const fetchImpl = vi.fn(async () => json({ id: null }, 200));
    await expect(submitFeedback(ORIGIN, payload, null, fetchImpl)).resolves.toEqual({ ok: true });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.body as FormData).has('screenshot')).toBe(false);
  });

  it('maps failures to reasons', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(submitFeedback(ORIGIN, payload, null, async () => json({}, 429))).resolves.toEqual(
      {
        ok: false,
        reason: 'rate_limited',
      },
    );
    await expect(
      submitFeedback(ORIGIN, payload, null, async () => json({ issues: ['bad'] }, 400)),
    ).resolves.toEqual({ ok: false, reason: 'invalid' });
    expect(warn).toHaveBeenCalledOnce();
    await expect(submitFeedback(ORIGIN, payload, null, async () => json({}, 503))).resolves.toEqual(
      {
        ok: false,
        reason: 'server',
      },
    );
    await expect(
      submitFeedback(ORIGIN, payload, null, async () => {
        throw new TypeError('offline');
      }),
    ).resolves.toEqual({ ok: false, reason: 'network' });
    warn.mockRestore();
  });
});

describe('buildPayload', () => {
  it('trims text, drops a blank email and satisfies the shared contract', () => {
    const payload = buildPayload({
      projectKey: 'pk_AbCdEfGh12345678',
      type: 'idea',
      message: '  Dark mode please  ',
      email: '   ',
      metadata: { ...metadata, user: { id: 'u_1' } },
      elapsedMs: 3210.6,
      website: '',
    });
    expect(payload.message).toBe('Dark mode please');
    expect('email' in payload).toBe(false);
    expect(payload.elapsedMs).toBe(3211);
    expect(SubmitPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it('keeps a provided email', () => {
    const payload = buildPayload({
      projectKey: 'pk_AbCdEfGh12345678',
      type: 'bug',
      message: 'x',
      email: ' ann@example.com ',
      metadata,
      elapsedMs: 2500,
      website: '',
    });
    expect(payload.email).toBe('ann@example.com');
    expect(SubmitPayloadSchema.safeParse(payload).success).toBe(true);
  });
});
