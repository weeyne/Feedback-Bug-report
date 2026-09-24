import type { ClientMetadata, WidgetConfig } from '@bugping/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SubmitResult } from '../api';
import type { CaptureFn } from '../screenshot-loader';
import { tint } from './color';
import { mountWidget, type WidgetHandle } from './mount';
import type { PanelDeps } from './panel';
import baseCss from './styles.css?inline';

// happy-dom has no canvas/createImageBitmap: own images pass through preparation unchanged.
vi.mock('../image/prepare', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../image/prepare')>()),
  prepareImage: async (blob: Blob) => blob,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

const baseConfig: WidgetConfig = {
  primaryColor: '#6366f1',
  triggerText: 'Feedback',
  position: 'bottom-right',
  showBadge: true,
  customCss: null,
  badgeUrl: 'https://bugping.app/?ref=pk_AbCdEfGh12345678&utm_source=widget',
  locale: 'en',
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
const shot = new Blob(['img'], { type: 'image/webp' });

let handle: WidgetHandle | undefined;
afterEach(() => {
  handle?.destroy();
  handle = undefined;
  vi.useRealTimers();
});

function setup(
  options: {
    deps?: Partial<PanelDeps>;
    config?: Partial<WidgetConfig>;
    hideTrigger?: boolean;
    preview?: boolean;
    compact?: boolean;
  } = {},
) {
  let clock = 1000;
  const submit = vi.fn<(...a: Parameters<PanelDeps['submit']>) => Promise<SubmitResult>>(
    async () => ({ ok: true }),
  );
  const deps: PanelDeps = {
    projectKey: 'pk_AbCdEfGh12345678',
    submit,
    loadCapture: async () => async () => shot,
    loadAnnotate: async () => null,
    collectMetadata: () => metadata,
    now: () => clock,
    ...options.deps,
  };
  handle = mountWidget(
    document.body,
    { ...baseConfig, ...options.config },
    {
      deps,
      languages: ['en-US'],
      hideTrigger: options.hideTrigger,
      preview: options.preview,
      compact: () => options.compact ?? false,
    },
  );
  const root = handle.host.shadowRoot!;
  const q = <T extends Element = HTMLElement>(selector: string) => root.querySelector<T>(selector);
  const panel = () => q('.bp-panel')!;
  const escape = () =>
    panel().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  const message = () => q<HTMLTextAreaElement>('.bp-message')!;
  /** Launcher → home → card: the visitor's path to a form. */
  const openForm = (type: 'bug' | 'idea' | 'general' = 'bug') => {
    q('.bp-trigger')!.click();
    q(`.bp-card[data-type="${type}"]`)!.click();
  };
  const labelOf = (el: Element) =>
    root.getElementById(el.getAttribute('aria-labelledby') ?? '')?.textContent ?? null;
  return {
    handle,
    root,
    q,
    panel,
    escape,
    message,
    openForm,
    labelOf,
    submit,
    deps,
    tick: (ms: number) => (clock += ms),
  };
}

function pasteEvent(items: object[]) {
  const event = new Event('paste', { bubbles: true, cancelable: true, composed: true });
  Object.defineProperty(event, 'clipboardData', { value: { items } });
  return event;
}

describe('mountWidget', () => {
  it('renders an isolated host; the launcher is labelled with the trigger text', () => {
    const { handle, q } = setup({ config: { triggerText: '<img src=x onerror=alert(1)>' } });
    expect(handle.host.hasAttribute('data-bugping')).toBe(true);
    expect(handle.host.shadowRoot).not.toBeNull();
    const trigger = q('.bp-trigger')!;
    expect(trigger.getAttribute('aria-label')).toBe('<img src=x onerror=alert(1)>');
    expect(trigger.getAttribute('title')).toBe('<img src=x onerror=alert(1)>');
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.textContent).toBe('');
    expect(trigger.querySelectorAll('svg')).toHaveLength(2);
    expect(q('img')).toBeNull();
  });

  it('adopts base then custom CSS as constructable stylesheets when supported', () => {
    const { root } = setup({ config: { customCss: '.bp-trigger{border-radius:0}' } });
    expect(root.querySelectorAll('style')).toHaveLength(0);
    const sheets = root.adoptedStyleSheets;
    expect(sheets).toHaveLength(2);
    const text = (sheet: CSSStyleSheet) => Array.from(sheet.cssRules, (r) => r.cssText).join('');
    expect(text(sheets[1]!)).toContain('.bp-trigger');
    expect(text(sheets[1]!)).toContain('border-radius');
    expect(document.adoptedStyleSheets).toHaveLength(0);
    expect(document.head.innerHTML).not.toContain('border-radius:0');
  });

  it('falls back to <style> elements, custom after base, without constructable stylesheets', () => {
    vi.stubGlobal('CSSStyleSheet', undefined);
    try {
      const { root } = setup({ config: { customCss: '.bp-trigger{border-radius:0}' } });
      const styles = Array.from(root.querySelectorAll('style'), (s) => s.textContent);
      expect(styles).toHaveLength(2);
      expect(styles[0]).toBe(baseCss);
      expect(styles[1]).toBe('.bp-trigger{border-radius:0}');
      expect(document.head.innerHTML).not.toContain('border-radius:0');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('adopts only the base stylesheet without custom CSS', () => {
    const { root } = setup();
    expect(root.adoptedStyleSheets).toHaveLength(1);
  });

  it('exposes the accent, its tint and a readable on-accent color, position and locale', () => {
    const { q } = setup({
      config: { primaryColor: '#FACC15', position: 'bottom-left', locale: 'ru' },
    });
    const root = q('.bp-root')!;
    expect(root.style.getPropertyValue('--bp-accent')).toBe('#FACC15');
    expect(root.style.getPropertyValue('--bp-accent-2')).toBe(tint('#FACC15', 0.25));
    expect(root.style.getPropertyValue('--bp-on-accent')).toBe('#1a1414');
    expect(root.dataset.position).toBe('bottom-left');
    expect(root.getAttribute('lang')).toBe('ru');
    expect(q('.bp-home h2')!.textContent).toBe('Привет 👋');
  });

  it('uses white on a dark accent and falls back for an invalid color', () => {
    const dark = setup({ config: { primaryColor: '#1E3A8A' } });
    expect(dark.q('.bp-root')!.style.getPropertyValue('--bp-on-accent')).toBe('#ffffff');
    dark.handle.destroy();
    const invalid = setup({ config: { primaryColor: 'red' } });
    expect(invalid.q('.bp-root')!.style.getPropertyValue('--bp-accent')).toBe('#E0321F');
  });

  it('hides the launcher with hideTrigger', () => {
    const { q } = setup({ hideTrigger: true });
    expect(q('.bp-trigger')).toBeNull();
  });

  it('shows the badge in the footer on home and form, not on thanks, unless disabled', async () => {
    const shown = setup();
    const badge = shown.q<HTMLAnchorElement>('.bp-badge')!;
    expect(badge.href).toBe(baseConfig.badgeUrl);
    expect(badge.rel).toBe('noopener');
    expect(badge.target).toBe('_blank');
    const visible = () => !badge.closest('[hidden]');
    shown.handle.open();
    expect(visible()).toBe(true);
    shown.handle.open('bug');
    expect(visible()).toBe(true);
    shown.message().value = 'x';
    shown.q('.bp-send')!.click();
    await vi.waitFor(() => expect(shown.q('.bp-thanks')!.hidden).toBe(false));
    expect(visible()).toBe(false);
    shown.handle.destroy();
    expect(setup({ config: { showBadge: false } }).q('.bp-badge')).toBeNull();
  });

  it('renders the badge only for an https badge URL', () => {
    for (const badgeUrl of ['javascript:alert(1)', 'http://bugping.app/', '//bugping.app/']) {
      const { handle, q } = setup({ config: { badgeUrl } });
      expect(q('.bp-badge')).toBeNull();
      handle.destroy();
    }
    expect(setup().q('.bp-badge')).not.toBeNull();
  });

  it('fixes the host to the viewport in normal mode but not in preview', () => {
    const normal = setup();
    expect(normal.handle.host.style.getPropertyValue('all')).toBe('initial');
    expect(normal.handle.host.style.getPropertyValue('position')).toBe('fixed');
    expect(normal.handle.host.style.getPropertyValue('z-index')).toBe('2147483000');
    normal.handle.destroy();

    const preview = setup({ preview: true });
    expect(preview.handle.host.style.getPropertyValue('all')).toBe('initial');
    expect(preview.handle.host.style.getPropertyValue('position')).toBe('');
    expect(preview.handle.host.style.getPropertyValue('z-index')).toBe('');
  });

  it('reports open state through isOpen()', () => {
    const { handle, escape } = setup();
    expect(handle.isOpen()).toBe(false);
    handle.open();
    expect(handle.isOpen()).toBe(true);
    escape();
    expect(handle.isOpen()).toBe(false);
  });
});

describe('screens', () => {
  it('launcher opens home, focuses the first card; a card opens its form', () => {
    const { q, root, panel, message, labelOf } = setup();
    const trigger = q('.bp-trigger')!;
    trigger.click();
    expect(panel().hidden).toBe(false);
    expect(panel().getAttribute('role')).toBe('dialog');
    expect(panel().getAttribute('aria-modal')).toBe('false');
    expect(panel().dataset.screen).toBe('home');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(q('.bp-home')!.hidden).toBe(false);
    expect(q('.bp-form')!.hidden).toBe(true);
    expect(labelOf(panel())).toBe('Hi 👋');
    const cards = Array.from(root.querySelectorAll<HTMLElement>('.bp-card'));
    expect(cards.map((c) => c.dataset.type)).toEqual(['bug', 'idea', 'general']);
    expect(cards[0]!.textContent).toContain('Report a bug');
    expect(cards[0]!.textContent).toContain('Something is broken');
    expect(root.activeElement).toBe(cards[0]);

    q('.bp-card[data-type="idea"]')!.click();
    expect(panel().dataset.screen).toBe('form');
    expect(q('.bp-home')!.hidden).toBe(true);
    expect(q('.bp-form')!.hidden).toBe(false);
    expect(message().placeholder).toBe("What's your idea?");
    expect(labelOf(panel())).toContain('Suggest an idea');
    expect(root.activeElement).toBe(message());

    trigger.click();
    expect(panel().hidden).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('back returns home; open(type) opens a form directly; open() opens home', () => {
    const { handle, q, root, panel, message, escape } = setup();
    handle.open('idea');
    expect(panel().dataset.screen).toBe('form');
    expect(message().placeholder).toBe("What's your idea?");
    expect(q('.bp-back')!.hidden).toBe(false);
    expect(q('.bp-back')!.getAttribute('aria-label')).toBe('Back');

    q('.bp-back')!.click();
    expect(panel().dataset.screen).toBe('home');
    expect(root.activeElement).toBe(q('.bp-card[data-type="bug"]'));

    escape();
    handle.open();
    expect(panel().hidden).toBe(false);
    expect(panel().dataset.screen).toBe('home');
    handle.open('general');
    expect(panel().dataset.screen).toBe('form');
    expect(message().placeholder).toBe("What's on your mind?");
  });

  it('re-opening while thanks shows resets to the requested screen', async () => {
    const { handle, q, panel, message } = setup();
    handle.open('bug');
    message().value = 'first';
    q('.bp-send')!.click();
    await vi.waitFor(() => expect(q('.bp-thanks')!.hidden).toBe(false));
    expect(panel().dataset.screen).toBe('thanks');

    handle.open('idea');
    expect(panel().hidden).toBe(false);
    expect(panel().dataset.screen).toBe('form');
    expect(q('.bp-thanks')!.hidden).toBe(true);
    expect(message().value).toBe('');
    expect(message().placeholder).toBe("What's your idea?");

    message().value = 'second';
    q('.bp-send')!.click();
    await vi.waitFor(() => expect(q('.bp-thanks')!.hidden).toBe(false));
    handle.open();
    expect(panel().dataset.screen).toBe('home');
    expect(q('.bp-thanks')!.hidden).toBe(true);
  });
});

describe('screenshot', () => {
  it('the bug form captures automatically', async () => {
    const loadCapture = vi.fn(async () => async () => shot);
    const { q, openForm } = setup({ deps: { loadCapture } });
    openForm('bug');
    expect(q('.bp-shot')!.dataset.state).toBe('capturing');
    await flush();
    expect(q('.bp-shot')!.dataset.state).toBe('ready');
    expect(q('.bp-thumb')!.dataset.state).toBe('ready');
    expect(loadCapture).toHaveBeenCalledOnce();
  });

  it('the idea form waits for the capture button', async () => {
    const loadCapture = vi.fn(async () => async () => shot);
    const { q, openForm } = setup({ deps: { loadCapture } });
    openForm('idea');
    await flush();
    expect(loadCapture).not.toHaveBeenCalled();
    expect(q('.bp-shot')!.dataset.state).toBe('empty');
    q('.bp-shot-capture')!.click();
    await flush();
    expect(loadCapture).toHaveBeenCalledOnce();
    expect(q('.bp-thumb')!.dataset.state).toBe('ready');
  });

  it('pasting an image while the form is open adds it', async () => {
    const { q, panel, message, openForm, submit, handle } = setup();
    const file = new File(['p'], 'p.png', { type: 'image/png' });
    const item = { kind: 'file', type: 'image/png', getAsFile: () => file };

    handle.open();
    const onHome = pasteEvent([item]);
    panel().dispatchEvent(onHome);
    expect(onHome.defaultPrevented).toBe(false);
    handle.close();

    openForm('idea');
    expect(q('.bp-shot')!.dataset.state).toBe('empty');
    const text = pasteEvent([{ kind: 'string', type: 'text/plain' }]);
    message().dispatchEvent(text);
    expect(text.defaultPrevented).toBe(false);
    const image = pasteEvent([item]);
    message().dispatchEvent(image);
    expect(image.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(q('.bp-thumb')!.dataset.state).toBe('ready'));

    message().value = 'pasted';
    q('.bp-send')!.click();
    await vi.waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(submit.mock.calls[0]![1]).toBe(file);
  });

  it('dropping an image on the form adds it', async () => {
    const { q, openForm } = setup();
    openForm('general');
    const file = new File(['d'], 'd.png', { type: 'image/png' });
    const transfer = { types: ['Files'], files: [file] };
    const over = new Event('dragover', { bubbles: true, cancelable: true });
    Object.defineProperty(over, 'dataTransfer', { value: transfer });
    q('.bp-form')!.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: transfer });
    q('.bp-message')!.dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(q('.bp-thumb')!.dataset.state).toBe('ready'));
  });
});

describe('keyboard', () => {
  it('Escape closes and returns focus to the launcher', () => {
    const { q, root, panel, escape } = setup();
    q('.bp-trigger')!.click();
    escape();
    expect(panel().hidden).toBe(true);
    expect(root.activeElement).toBe(q('.bp-trigger'));
    expect(q('.bp-trigger')!.getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps key events typed in the panel away from host shortcuts', () => {
    const { handle, message } = setup();
    handle.open('bug');
    const hostListener = vi.fn();
    const types = ['keydown', 'keypress', 'keyup'] as const;
    for (const type of types) document.addEventListener(type, hostListener);
    try {
      for (const type of types) {
        message().dispatchEvent(
          new KeyboardEvent(type, { key: 'k', bubbles: true, composed: true }),
        );
      }
      expect(hostListener).not.toHaveBeenCalled();
    } finally {
      for (const type of types) document.removeEventListener(type, hostListener);
    }
  });

  it('Tab wraps inside the panel after the propagation guard', () => {
    const { handle, q, root } = setup();
    handle.open('bug');
    const badge = q<HTMLAnchorElement>('.bp-badge')!;
    badge.focus();
    badge.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, composed: true }),
    );
    expect(root.activeElement).toBe(q('.bp-back'));
    q('.bp-back')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, composed: true }),
    );
    expect(root.activeElement).toBe(badge);
  });

  it('returns focus to the previously focused element with hideTrigger', () => {
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    const { handle, panel, escape } = setup({ hideTrigger: true });
    handle.open();
    escape();
    expect(panel().hidden).toBe(true);
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});

describe('form', () => {
  it('requires a message and links the error', () => {
    const { handle, q, message, submit } = setup();
    handle.open('bug');
    q('.bp-send')!.click();
    const error = q('.bp-message-error')!;
    expect(error.textContent).toBe('Write a message first.');
    expect(error.id).not.toBe('');
    expect(message().getAttribute('aria-describedby')).toBe(error.id);
    expect(submit).not.toHaveBeenCalled();
  });

  it('validates the email shape and links the error', () => {
    const { handle, q, message, submit } = setup();
    handle.open('bug');
    message().value = 'Broken';
    q<HTMLInputElement>('.bp-email')!.value = 'nope';
    q('.bp-send')!.click();
    const error = q('.bp-email-error')!;
    expect(error.textContent).toBe('Check the email address.');
    expect(error.id).not.toBe('');
    expect(q('.bp-email')!.getAttribute('aria-describedby')).toBe(error.id);
    expect(submit).not.toHaveBeenCalled();
  });

  it('submits the payload with the screenshot and elapsed time', async () => {
    const { q, message, openForm, submit, tick } = setup();
    openForm('bug');
    await vi.waitFor(() => expect(q('.bp-thumb')!.dataset.state).toBe('ready'));
    message().value = '  Checkout fails  ';
    tick(4200);
    q('.bp-send')!.click();
    await vi.waitFor(() => expect(submit).toHaveBeenCalledOnce());
    const [payload, blob] = submit.mock.calls[0]!;
    expect(payload).toMatchObject({
      projectKey: 'pk_AbCdEfGh12345678',
      type: 'bug',
      message: 'Checkout fails',
      elapsedMs: 4200,
      website: '',
      metadata,
    });
    expect(blob).toBe(shot);
  });

  it('sends the chosen type', async () => {
    const { q, message, openForm, submit } = setup();
    openForm('general');
    message().value = 'Question';
    q('.bp-send')!.click();
    await vi.waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(submit.mock.calls[0]![0]).toMatchObject({ type: 'general' });
    expect(submit.mock.calls[0]![1]).toBeNull();
  });

  it('sends without a screenshot after removing it', async () => {
    const { handle, q, message, submit } = setup();
    handle.open('bug');
    await vi.waitFor(() => expect(q('.bp-thumb')!.dataset.state).toBe('ready'));
    q('.bp-shot-remove')!.click();
    expect(q('.bp-shot')!.dataset.state).toBe('empty');
    message().value = 'x';
    q('.bp-send')!.click();
    await vi.waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(submit.mock.calls[0]![1]).toBeNull();
  });

  it('sends without a screenshot when capture has not finished after 8s', async () => {
    vi.useFakeTimers();
    const { handle, q, message, submit } = setup({
      deps: { loadCapture: async () => () => new Promise<Blob | null>(() => {}) },
    });
    handle.open('bug');
    message().value = 'Capture hangs';
    q('.bp-send')!.click();
    await vi.advanceTimersByTimeAsync(7999);
    expect(submit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(submit).toHaveBeenCalledOnce();
    expect(submit.mock.calls[0]![1]).toBeNull();
  });

  it('shows thanks with a check, then closes and resets after 2s', async () => {
    const { handle, q, root, panel, message, labelOf } = setup();
    handle.open('bug');
    message().value = 'Great app';
    vi.useFakeTimers();
    q('.bp-send')!.click();
    await vi.waitFor(() => expect(q('.bp-thanks')!.hidden).toBe(false));
    const thanks = q('.bp-thanks')!;
    expect(thanks.getAttribute('role')).toBe('status');
    expect(thanks.querySelector('svg path')).not.toBeNull();
    expect(labelOf(panel())).toBe('Thanks! Your feedback was sent.');
    expect(root.activeElement).toBe(thanks);
    vi.advanceTimersByTime(2000);
    expect(panel().hidden).toBe(true);
    expect(message().value).toBe('');
  });

  it('keeps the text and explains rate limiting', async () => {
    const { handle, q, message } = setup({
      deps: { submit: async () => ({ ok: false, reason: 'rate_limited' }) },
    });
    handle.open('bug');
    message().value = 'Again';
    q('.bp-send')!.click();
    await vi.waitFor(() =>
      expect(q('.bp-status')!.textContent).toBe('Too many submissions. Try again later.'),
    );
    expect(message().value).toBe('Again');
    expect(q('.bp-retry')!.hidden).toBe(true);
  });

  it('offers retry after a network error', async () => {
    const submit = vi
      .fn<() => Promise<SubmitResult>>()
      .mockResolvedValueOnce({ ok: false, reason: 'network' })
      .mockResolvedValueOnce({ ok: true });
    const { handle, q, message } = setup({ deps: { submit } });
    handle.open('bug');
    message().value = 'Flaky';
    q('.bp-send')!.click();
    await vi.waitFor(() => expect(q('.bp-retry')!.hidden).toBe(false));
    expect(q('.bp-status')!.textContent).toBe("Couldn't send. Check your connection.");
    q('.bp-retry')!.click();
    await vi.waitFor(() => expect(q('.bp-thanks')!.hidden).toBe(false));
    expect(submit).toHaveBeenCalledTimes(2);
  });

  it('offers retry after a server error', async () => {
    const submit = vi
      .fn<() => Promise<SubmitResult>>()
      .mockResolvedValueOnce({ ok: false, reason: 'server' })
      .mockResolvedValueOnce({ ok: true });
    const { handle, q, message } = setup({ deps: { submit } });
    handle.open('bug');
    message().value = 'Server down';
    q('.bp-send')!.click();
    await vi.waitFor(() => expect(q('.bp-retry')!.hidden).toBe(false));
    expect(q('.bp-status')!.textContent).toBe("Couldn't send. Try again later.");
    expect(message().value).toBe('Server down');
    q('.bp-retry')!.click();
    await vi.waitFor(() => expect(q('.bp-thanks')!.hidden).toBe(false));
    expect(submit).toHaveBeenCalledTimes(2);
  });

  it('shows a busy state on the send button while sending', async () => {
    const pending = deferred<SubmitResult>();
    const submit = vi.fn<() => Promise<SubmitResult>>().mockReturnValue(pending.promise);
    const { handle, q, message } = setup({ deps: { submit } });
    handle.open('bug');
    message().value = 'busy check';
    q('.bp-send')!.click();
    await vi.waitFor(() => expect(q('.bp-send')!.getAttribute('aria-busy')).toBe('true'));
    expect(q<HTMLButtonElement>('.bp-send')!.disabled).toBe(true);
    expect(q('.bp-send')!.textContent).toBe('Sending…');
    pending.resolve({ ok: true });
    await vi.waitFor(() => expect(q('.bp-send')!.hasAttribute('aria-busy')).toBe(false));
  });
});

describe('identify', () => {
  it('pre-fills the email without overwriting typed input', () => {
    const { handle, q } = setup();
    handle.identify({ email: 'ann@example.com' });
    expect(q<HTMLInputElement>('.bp-email')!.value).toBe('ann@example.com');
    q<HTMLInputElement>('.bp-email')!.value = 'typed@example.com';
    handle.identify({ email: 'other@example.com' });
    expect(q<HTMLInputElement>('.bp-email')!.value).toBe('typed@example.com');
  });

  it('replaces a previously identified email', () => {
    const { handle, q } = setup();
    handle.identify({ email: 'a@example.com' });
    handle.identify({ email: 'b@example.com' });
    expect(q<HTMLInputElement>('.bp-email')!.value).toBe('b@example.com');
  });

  it('without an email clears the prefilled one', () => {
    const { handle, q } = setup();
    handle.identify({ email: 'a@example.com' });
    handle.identify({});
    expect(q<HTMLInputElement>('.bp-email')!.value).toBe('');
  });

  it('never clears text the visitor typed', () => {
    const { handle, q } = setup();
    handle.identify({ email: 'a@example.com' });
    q<HTMLInputElement>('.bp-email')!.value = 'typed@example.com';
    handle.identify({});
    expect(q<HTMLInputElement>('.bp-email')!.value).toBe('typed@example.com');
  });
});

describe('preview and lifecycle', () => {
  it('never submits and never loads chunks in preview mode', async () => {
    const loadCapture = vi.fn(async () => async () => shot);
    const loadAnnotate = vi.fn(async () => null);
    const { handle, q, message, submit } = setup({
      preview: true,
      deps: { loadCapture, loadAnnotate },
    });
    handle.open('bug');
    await flush();
    expect(q('.bp-shot')!.dataset.state).toBe('ready');
    expect(q<HTMLButtonElement>('.bp-shot-annotate')!.disabled).toBe(true);
    q('.bp-thumb')!.click();
    message().value = 'x';
    q('.bp-send')!.click();
    await flush();
    expect(submit).not.toHaveBeenCalled();
    expect(loadCapture).not.toHaveBeenCalled();
    expect(loadAnnotate).not.toHaveBeenCalled();
    expect(q('.bp-root')!.hasAttribute('data-preview')).toBe(true);
  });

  it('ignores a stale capture result from a closed-and-reopened panel', async () => {
    const first = deferred<CaptureFn | null>();
    const second = deferred<CaptureFn | null>();
    const loadCapture = vi
      .fn<PanelDeps['loadCapture']>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const shotA = new Blob(['a'], { type: 'image/webp' });
    const shotB = new Blob(['b'], { type: 'image/webp' });
    const { handle, q, message, escape, submit } = setup({ deps: { loadCapture } });

    handle.open('bug');
    escape();
    handle.open('bug');

    second.resolve(async () => shotB);
    await vi.waitFor(() => expect(q('.bp-thumb')!.dataset.state).toBe('ready'));

    first.resolve(async () => shotA);
    await flush();

    expect(q('.bp-thumb')!.dataset.state).toBe('ready');
    message().value = 'x';
    q('.bp-send')!.click();
    await vi.waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(submit.mock.calls[0]![1]).toBe(shotB);
  });

  for (const via of ['back', 'close and reopen'] as const) {
    it(`a send waiting for the capture keeps its type, time and screenshot (${via} → idea)`, async () => {
      const capture = deferred<Blob | null>();
      const { handle, q, root, panel, message, escape, submit, tick } = setup({
        deps: { loadCapture: async () => () => capture.promise },
      });
      handle.open('bug');
      tick(30000);
      message().value = 'Checkout fails';
      q('.bp-send')!.click();
      await flush();
      expect(submit).not.toHaveBeenCalled();

      if (via === 'back') {
        q('.bp-back')!.click();
      } else {
        escape();
        handle.open();
      }
      expect(panel().dataset.screen).toBe('home');
      q('.bp-card[data-type="idea"]')!.click();
      // The in-flight bug send is shown again instead of a fresh idea form.
      expect(panel().dataset.screen).toBe('form');
      expect(root.getElementById('bp-form-title')!.textContent).toContain('Report a bug');
      expect(q('.bp-send')!.getAttribute('aria-busy')).toBe('true');

      tick(500);
      capture.resolve(shot);
      await vi.waitFor(() => expect(submit).toHaveBeenCalledOnce());
      const [payload, blob] = submit.mock.calls[0]!;
      expect(payload).toMatchObject({ type: 'bug', message: 'Checkout fails', elapsedMs: 30000 });
      expect(blob).toBe(shot);
      await vi.waitFor(() => expect(q('.bp-thanks')!.hidden).toBe(false));
    });
  }

  it('resets instead of showing thanks when closed while a send is in flight', async () => {
    const pending = deferred<SubmitResult>();
    const submit = vi.fn<() => Promise<SubmitResult>>().mockReturnValue(pending.promise);
    const { handle, q, panel, message, escape } = setup({ deps: { submit } });
    handle.open('bug');
    message().value = 'in flight';
    q('.bp-send')!.click();
    escape();
    expect(panel().hidden).toBe(true);

    pending.resolve({ ok: true });
    await vi.waitFor(() => expect(message().value).toBe(''));
    expect(panel().hidden).toBe(true);

    handle.open('bug');
    expect(message().value).toBe('');
    expect(q('.bp-thanks')!.hidden).toBe(true);
    expect(q('.bp-form')!.hidden).toBe(false);
  });
});

describe('compact layout', () => {
  function dragSheet(el: Element, from: number, to: number) {
    el.setPointerCapture = () => {};
    el.dispatchEvent(
      new PointerEvent('pointerdown', { clientY: from, pointerId: 1, bubbles: true }),
    );
    el.dispatchEvent(new PointerEvent('pointermove', { clientY: to, pointerId: 1, bubbles: true }));
    el.dispatchEvent(new PointerEvent('pointerup', { clientY: to, pointerId: 1, bubbles: true }));
  }

  it('launcher opens the dial with three items, first focused, and expands the launcher', () => {
    const { q, root } = setup({ compact: true });
    const trigger = q('.bp-trigger')!;
    trigger.click();
    const dial = q('.bp-dial')!;
    expect(dial.hidden).toBe(false);
    expect(dial.getAttribute('role')).toBe('menu');
    const items = Array.from(root.querySelectorAll<HTMLElement>('.bp-dial-item'));
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.dataset.type)).toEqual(['bug', 'idea', 'general']);
    for (const item of items) expect(item.getAttribute('role')).toBe('menuitem');
    expect(root.activeElement).toBe(items[0]);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(q('.bp-panel')!.hidden).toBe(true);
  });

  it('clicking the launcher again closes the dial', () => {
    const { q } = setup({ compact: true });
    const trigger = q('.bp-trigger')!;
    trigger.click();
    trigger.click();
    expect(q('.bp-dial')!.hidden).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('picking an item closes the dial and opens the form for that type as a bottom sheet', () => {
    const { q, panel, message } = setup({ compact: true });
    q('.bp-trigger')!.click();
    q('.bp-dial-item[data-type="idea"]')!.click();
    expect(q('.bp-dial')!.hidden).toBe(true);
    expect(panel().hidden).toBe(false);
    expect(panel().classList.contains('bp-sheet')).toBe(true);
    expect(panel().dataset.screen).toBe('form');
    expect(message().placeholder).toBe("What's your idea?");
  });

  it('Escape closes the dial and returns focus to the launcher', () => {
    const { q, root } = setup({ compact: true });
    const trigger = q('.bp-trigger')!;
    trigger.click();
    const dial = q('.bp-dial')!;
    dial.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(dial.hidden).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(root.activeElement).toBe(trigger);
  });

  it('arrow keys move focus between dial items, wrapping at the ends', () => {
    const { q, root } = setup({ compact: true });
    q('.bp-trigger')!.click();
    const dial = q('.bp-dial')!;
    const items = Array.from(root.querySelectorAll<HTMLElement>('.bp-dial-item'));
    dial.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(root.activeElement).toBe(items[1]);
    dial.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(root.activeElement).toBe(items[2]);
    dial.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(root.activeElement).toBe(items[0]);
    dial.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(root.activeElement).toBe(items[2]);
  });

  it("open('bug') opens the form directly as a sheet, bypassing the dial", () => {
    const { handle, q, panel, message } = setup({ compact: true });
    handle.open('bug');
    expect(q('.bp-dial')!.hidden).toBe(true);
    expect(panel().hidden).toBe(false);
    expect(panel().classList.contains('bp-sheet')).toBe(true);
    expect(panel().dataset.screen).toBe('form');
    expect(message().placeholder).toBe('What happened? What did you expect?');
  });

  it('open() with hideTrigger shows the home screen inside the sheet, with no dial', () => {
    const { handle, q, panel } = setup({ compact: true, hideTrigger: true });
    expect(q('.bp-dial')).toBeNull();
    handle.open();
    expect(panel().hidden).toBe(false);
    expect(panel().classList.contains('bp-sheet')).toBe(true);
    expect(panel().dataset.screen).toBe('home');
  });

  it('open() without a type and a visible launcher opens the dial, not the sheet', () => {
    const { handle, q, panel } = setup({ compact: true });
    handle.open();
    expect(q('.bp-dial')!.hidden).toBe(false);
    expect(panel().hidden).toBe(true);
  });

  it('desktop open() (compact false) never shows a sheet', () => {
    const { handle, panel } = setup({ compact: false });
    handle.open('bug');
    expect(panel().classList.contains('bp-sheet')).toBe(false);
  });

  it('a downward drag on the handle past 80px closes the sheet; below it snaps back', () => {
    const { handle, q, panel } = setup({ compact: true });
    handle.open('bug');
    const sheetHandle = q('.bp-sheet-handle')!;
    dragSheet(sheetHandle, 0, 50);
    expect(panel().hidden).toBe(false);
    dragSheet(sheetHandle, 0, 90);
    expect(panel().hidden).toBe(true);
  });

  it('isOpen() and close() account for the dial as well as the panel', () => {
    const { handle, q } = setup({ compact: true });
    expect(handle.isOpen()).toBe(false);
    q('.bp-trigger')!.click();
    expect(handle.isOpen()).toBe(true);
    handle.close();
    expect(handle.isOpen()).toBe(false);
    expect(q('.bp-dial')!.hidden).toBe(true);
    expect(q('.bp-trigger')!.getAttribute('aria-expanded')).toBe('false');
  });
});
