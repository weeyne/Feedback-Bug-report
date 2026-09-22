import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from './index';

const config = {
  primaryColor: '#6366f1',
  triggerText: 'Feedback',
  position: 'bottom-right',
  showBadge: true,
  customCss: null,
  badgeUrl: 'https://dymcode.dev/?ref=pk_AbCdEfGh12345678&utm_source=widget',
  locale: 'en',
};

function script(attrs: Record<string, string>) {
  const el = document.createElement('script');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

const ready = () =>
  new Promise<void>((resolve) =>
    window.addEventListener('dymcode:ready', () => resolve(), { once: true }),
  );

describe('boot', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(config))),
    );
  });

  afterEach(() => {
    delete (window as { Dymcode?: unknown }).Dymcode;
    document.querySelectorAll('[data-dymcode]').forEach((el) => el.remove());
    vi.unstubAllGlobals();
    warn.mockRestore();
  });

  it('mounts from the script tag, calls the API on the script origin and fires ready', async () => {
    const isReady = ready();
    boot(
      window,
      script({ src: 'https://dymcode.dev/w/widget.js', 'data-project-id': 'pk_AbCdEfGh12345678' }),
    );
    expect(window.Dymcode).toBeDefined();
    await isReady;
    expect(fetch).toHaveBeenCalledWith(
      'https://dymcode.dev/api/v1/widget/config?key=pk_AbCdEfGh12345678',
      { credentials: 'omit' },
    );
    const host = document.querySelector('[data-dymcode]')!;
    expect(host.shadowRoot!.querySelector('.dc-trigger')).not.toBeNull();
  });

  it('respects data-hide-trigger and opens through window.Dymcode', async () => {
    const isReady = ready();
    boot(
      window,
      script({
        src: 'https://dymcode.dev/w/widget.js',
        'data-project-id': 'pk_AbCdEfGh12345678',
        'data-hide-trigger': '',
      }),
    );
    await isReady;
    const root = document.querySelector('[data-dymcode]')!.shadowRoot!;
    expect(root.querySelector('.dc-trigger')).toBeNull();
    (window.Dymcode as { open(type: string): void }).open('idea');
    expect(root.querySelector<HTMLElement>('.dc-panel')!.hidden).toBe(false);
    expect(root.querySelector('.dc-type[data-type="idea"]')!.getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('applies an email identified before the widget was ready', async () => {
    const isReady = ready();
    boot(
      window,
      script({ src: 'https://dymcode.dev/w/widget.js', 'data-project-id': 'pk_AbCdEfGh12345678' }),
    );
    (window.Dymcode as { identify(u: object): void }).identify({ email: 'ann@example.com' });
    await isReady;
    const root = document.querySelector('[data-dymcode]')!.shadowRoot!;
    expect(root.querySelector<HTMLInputElement>('.dc-email')!.value).toBe('ann@example.com');
  });

  it('does nothing without a project id', () => {
    boot(window, script({ src: 'https://dymcode.dev/w/widget.js' }));
    expect(window.Dymcode).toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
  });

  it('ignores a second include', () => {
    const existing = { open() {}, identify() {} };
    (window as { Dymcode?: unknown }).Dymcode = existing;
    boot(
      window,
      script({ src: 'https://dymcode.dev/w/widget.js', 'data-project-id': 'pk_AbCdEfGh12345678' }),
    );
    expect(window.Dymcode).toBe(existing);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('renders nothing and warns when the config cannot load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 404 })),
    );
    boot(
      window,
      script({ src: 'https://dymcode.dev/w/widget.js', 'data-project-id': 'pk_AbCdEfGh12345678' }),
    );
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    expect(document.querySelector('[data-dymcode]')).toBeNull();
  });

  it('releases the console buffer when the config cannot load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 404 })),
    );
    const before = console.error;
    boot(
      window,
      script({ src: 'https://dymcode.dev/w/widget.js', 'data-project-id': 'pk_AbCdEfGh12345678' }),
    );
    expect(console.error).not.toBe(before);
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    expect(console.error).toBe(before);
  });

  it('schedules startup with an idle callback bounded by a 3s timeout', () => {
    const idle = vi.fn();
    vi.stubGlobal('requestIdleCallback', idle);
    boot(
      window,
      script({ src: 'https://dymcode.dev/w/widget.js', 'data-project-id': 'pk_AbCdEfGh12345678' }),
    );
    expect(idle).toHaveBeenCalledWith(expect.any(Function), { timeout: 3000 });
  });
});
