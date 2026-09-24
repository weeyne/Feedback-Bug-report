import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as chunkLoader from './chunk-loader';
import { boot } from './index';
import * as mount from './ui/mount';

// Spies that call through, so the real widget still mounts.
vi.mock('./chunk-loader', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./chunk-loader')>();
  return { ...actual, createAnnotateLoader: vi.fn(actual.createAnnotateLoader) };
});
vi.mock('./ui/mount', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./ui/mount')>();
  return { ...actual, mountWidget: vi.fn(actual.mountWidget) };
});

const config = {
  primaryColor: '#6366f1',
  triggerText: 'Feedback',
  position: 'bottom-right',
  showBadge: true,
  customCss: null,
  badgeUrl: 'https://bugping.app/?ref=pk_AbCdEfGh12345678&utm_source=widget',
  locale: 'en',
};

function script(attrs: Record<string, string>) {
  const el = document.createElement('script');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

const ready = () =>
  new Promise<void>((resolve) =>
    window.addEventListener('bugping:ready', () => resolve(), { once: true }),
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
    delete (window as { Bugping?: unknown }).Bugping;
    document.querySelectorAll('[data-bugping]').forEach((el) => el.remove());
    vi.unstubAllGlobals();
    warn.mockRestore();
    vi.mocked(chunkLoader.createAnnotateLoader).mockClear();
    vi.mocked(mount.mountWidget).mockClear();
  });

  it('mounts from the script tag, calls the API on the script origin and fires ready', async () => {
    const isReady = ready();
    boot(
      window,
      script({ src: 'https://bugping.app/w/widget.js', 'data-project-id': 'pk_AbCdEfGh12345678' }),
    );
    expect(window.Bugping).toBeDefined();
    await isReady;
    expect(fetch).toHaveBeenCalledWith(
      'https://bugping.app/api/v1/widget/config?key=pk_AbCdEfGh12345678',
      { credentials: 'omit' },
    );
    const host = document.querySelector('[data-bugping]')!;
    expect(host.shadowRoot!.querySelector('.bp-trigger')).not.toBeNull();
  });

  it('respects data-hide-trigger and opens through window.Bugping', async () => {
    const isReady = ready();
    boot(
      window,
      script({
        src: 'https://bugping.app/w/widget.js',
        'data-project-id': 'pk_AbCdEfGh12345678',
        'data-hide-trigger': '',
      }),
    );
    await isReady;
    const root = document.querySelector('[data-bugping]')!.shadowRoot!;
    expect(root.querySelector('.bp-trigger')).toBeNull();
    (window.Bugping as { open(type?: string): void }).open();
    const panel = root.querySelector<HTMLElement>('.bp-panel')!;
    expect(panel.hidden).toBe(false);
    expect(panel.dataset.screen).toBe('home');
    (window.Bugping as { open(type?: string): void }).open('idea');
    expect(panel.dataset.screen).toBe('form');
    expect(root.querySelector<HTMLTextAreaElement>('.bp-message')!.placeholder).toBe(
      "What's your idea?",
    );
  });

  it('wires the annotate loader to the versioned annotate.js next to the script', async () => {
    const isReady = ready();
    boot(
      window,
      script({ src: 'https://bugping.app/w/widget.js', 'data-project-id': 'pk_AbCdEfGh12345678' }),
    );
    await isReady;
    const createAnnotateLoader = vi.mocked(chunkLoader.createAnnotateLoader);
    expect(createAnnotateLoader).toHaveBeenCalledOnce();
    expect(createAnnotateLoader.mock.calls[0]![0]).toBe('https://bugping.app/w/annotate.js?v=test');
    const loader = createAnnotateLoader.mock.results[0]!.value;
    const deps = vi.mocked(mount.mountWidget).mock.calls[0]![2]!.deps!;
    expect(deps.loadAnnotate).toBe(loader);
  });

  it('applies an email identified before the widget was ready', async () => {
    const isReady = ready();
    boot(
      window,
      script({ src: 'https://bugping.app/w/widget.js', 'data-project-id': 'pk_AbCdEfGh12345678' }),
    );
    (window.Bugping as { identify(u: object): void }).identify({ email: 'ann@example.com' });
    await isReady;
    const root = document.querySelector('[data-bugping]')!.shadowRoot!;
    expect(root.querySelector<HTMLInputElement>('.bp-email')!.value).toBe('ann@example.com');
  });

  it('does nothing without a project id', () => {
    boot(window, script({ src: 'https://bugping.app/w/widget.js' }));
    expect(window.Bugping).toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
  });

  it('ignores a second include', () => {
    const existing = { open() {}, identify() {} };
    (window as { Bugping?: unknown }).Bugping = existing;
    boot(
      window,
      script({ src: 'https://bugping.app/w/widget.js', 'data-project-id': 'pk_AbCdEfGh12345678' }),
    );
    expect(window.Bugping).toBe(existing);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('renders nothing and warns when the config cannot load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 404 })),
    );
    boot(
      window,
      script({ src: 'https://bugping.app/w/widget.js', 'data-project-id': 'pk_AbCdEfGh12345678' }),
    );
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    expect(document.querySelector('[data-bugping]')).toBeNull();
  });

  it('releases the console buffer when the config cannot load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 404 })),
    );
    const before = console.error;
    boot(
      window,
      script({ src: 'https://bugping.app/w/widget.js', 'data-project-id': 'pk_AbCdEfGh12345678' }),
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
      script({ src: 'https://bugping.app/w/widget.js', 'data-project-id': 'pk_AbCdEfGh12345678' }),
    );
    expect(idle).toHaveBeenCalledWith(expect.any(Function), { timeout: 3000 });
  });
});
