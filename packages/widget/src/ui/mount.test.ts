import type { ClientMetadata, WidgetConfig } from '@dymcode/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SubmitResult } from '../api';
import type { CaptureFn } from '../screenshot-loader';
import { mountWidget, type WidgetHandle } from './mount';
import type { PanelDeps } from './panel';
import baseCss from './styles.css?inline';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const baseConfig: WidgetConfig = {
  primaryColor: '#6366f1',
  triggerText: 'Feedback',
  position: 'bottom-right',
  showBadge: true,
  customCss: null,
  badgeUrl: 'https://dymcode.dev/?ref=pk_AbCdEfGh12345678&utm_source=widget',
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
    },
  );
  const root = handle.host.shadowRoot!;
  const q = <T extends Element = HTMLElement>(selector: string) => root.querySelector<T>(selector);
  return { handle, root, q, submit, deps, tick: (ms: number) => (clock += ms) };
}

describe('mountWidget', () => {
  it('renders an isolated host with the trigger text as literal text', () => {
    const { handle, q } = setup({ config: { triggerText: '<img src=x onerror=alert(1)>' } });
    expect(handle.host.hasAttribute('data-dymcode')).toBe(true);
    expect(handle.host.shadowRoot).not.toBeNull();
    expect(q('.dc-trigger')!.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(q('img')).toBeNull();
  });

  it('adopts base then custom CSS as constructable stylesheets when supported', () => {
    const { root } = setup({ config: { customCss: '.dc-trigger{border-radius:0}' } });
    expect(root.querySelectorAll('style')).toHaveLength(0);
    const sheets = root.adoptedStyleSheets;
    expect(sheets).toHaveLength(2);
    const text = (sheet: CSSStyleSheet) => Array.from(sheet.cssRules, (r) => r.cssText).join('');
    expect(text(sheets[1]!)).toContain('.dc-trigger');
    expect(text(sheets[1]!)).toContain('border-radius');
    expect(document.adoptedStyleSheets).toHaveLength(0);
    expect(document.head.innerHTML).not.toContain('border-radius:0');
  });

  it('falls back to <style> elements, custom after base, without constructable stylesheets', () => {
    vi.stubGlobal('CSSStyleSheet', undefined);
    try {
      const { root } = setup({ config: { customCss: '.dc-trigger{border-radius:0}' } });
      const styles = Array.from(root.querySelectorAll('style'), (s) => s.textContent);
      expect(styles).toHaveLength(2);
      expect(styles[0]).toBe(baseCss);
      expect(styles[1]).toBe('.dc-trigger{border-radius:0}');
      expect(document.head.innerHTML).not.toContain('border-radius:0');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('adopts only the base stylesheet without custom CSS', () => {
    const { root } = setup();
    expect(root.adoptedStyleSheets).toHaveLength(1);
  });

  it('applies the accent color, position and locale', () => {
    const { q } = setup({
      config: { primaryColor: '#ff0000', position: 'bottom-left', locale: 'ru' },
    });
    const root = q('.dc-root')!;
    expect(root.style.getPropertyValue('--dc-accent')).toBe('#ff0000');
    expect(root.dataset.position).toBe('bottom-left');
    expect(q('.dc-title')!.textContent).toBe('Отправить отзыв');
  });

  it('hides the trigger with hideTrigger', () => {
    const { q } = setup({ hideTrigger: true });
    expect(q('.dc-trigger')).toBeNull();
  });

  it('shows the badge unless disabled', () => {
    const shown = setup();
    const badge = shown.q<HTMLAnchorElement>('.dc-badge')!;
    expect(badge.href).toBe(baseConfig.badgeUrl);
    expect(badge.rel).toBe('noopener');
    expect(badge.target).toBe('_blank');
    shown.handle.destroy();
    expect(setup({ config: { showBadge: false } }).q('.dc-badge')).toBeNull();
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
});

describe('panel', () => {
  it('opens from the trigger with focus in the message field', () => {
    const { q, root } = setup();
    q('.dc-trigger')!.click();
    expect(q('.dc-panel')!.hidden).toBe(false);
    expect(root.activeElement).toBe(q('.dc-message'));
  });

  it('open(type) preselects the type and its placeholder', () => {
    const { handle, q } = setup();
    handle.open('idea');
    expect(q('.dc-type[data-type="idea"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(q('.dc-type[data-type="bug"]')!.getAttribute('aria-pressed')).toBe('false');
    expect(q<HTMLTextAreaElement>('.dc-message')!.placeholder).toBe("What's your idea?");
  });

  it('Escape closes and returns focus to the trigger', () => {
    const { q, root } = setup();
    q('.dc-trigger')!.click();
    q('.dc-panel')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(q('.dc-panel')!.hidden).toBe(true);
    expect(root.activeElement).toBe(q('.dc-trigger'));
  });

  it('keeps key events typed in the panel away from host shortcuts', () => {
    const { handle, q } = setup();
    handle.open();
    const hostListener = vi.fn();
    const types = ['keydown', 'keypress', 'keyup'] as const;
    for (const type of types) document.addEventListener(type, hostListener);
    try {
      for (const type of types) {
        q('.dc-message')!.dispatchEvent(
          new KeyboardEvent(type, { key: 'k', bubbles: true, composed: true }),
        );
      }
      expect(hostListener).not.toHaveBeenCalled();
    } finally {
      for (const type of types) document.removeEventListener(type, hostListener);
    }
  });

  it('Tab from the last control still wraps to the first after the propagation guard', () => {
    const { handle, q, root } = setup();
    handle.open();
    const badge = q<HTMLAnchorElement>('.dc-badge')!;
    badge.focus();
    badge.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, composed: true }),
    );
    expect(root.activeElement).toBe(q('.dc-close'));
  });

  it('requires a message', async () => {
    const { handle, q, submit } = setup();
    handle.open();
    q('.dc-send')!.click();
    expect(q('.dc-message-error')!.textContent).toBe('Write a message first.');
    expect(submit).not.toHaveBeenCalled();
  });

  it('validates the email shape', async () => {
    const { handle, q, submit } = setup();
    handle.open();
    q<HTMLTextAreaElement>('.dc-message')!.value = 'Broken';
    q<HTMLInputElement>('.dc-email')!.value = 'nope';
    q('.dc-send')!.click();
    expect(q('.dc-email-error')!.textContent).toBe('Check the email address.');
    expect(submit).not.toHaveBeenCalled();
  });

  it('submits the payload with the screenshot and elapsed time', async () => {
    const { handle, q, submit, tick } = setup();
    handle.open('bug');
    await vi.waitFor(() => expect(q('.dc-thumb')!.dataset.state).toBe('ready'));
    q<HTMLTextAreaElement>('.dc-message')!.value = '  Checkout fails  ';
    tick(4200);
    q('.dc-send')!.click();
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

  it('sends without a screenshot when the toggle is off', async () => {
    const { handle, q, submit } = setup();
    handle.open();
    await vi.waitFor(() => expect(q('.dc-thumb')!.dataset.state).toBe('ready'));
    q<HTMLInputElement>('.dc-shot-toggle')!.checked = false;
    q<HTMLTextAreaElement>('.dc-message')!.value = 'x';
    q('.dc-send')!.click();
    await vi.waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(submit.mock.calls[0]![1]).toBeNull();
  });

  it('sends without a screenshot when capture has not finished after 8s', async () => {
    vi.useFakeTimers();
    const { handle, q, submit } = setup({
      deps: { loadCapture: async () => () => new Promise<Blob | null>(() => {}) },
    });
    handle.open();
    q<HTMLTextAreaElement>('.dc-message')!.value = 'Capture hangs';
    q('.dc-send')!.click();
    await vi.advanceTimersByTimeAsync(7999);
    expect(submit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(submit).toHaveBeenCalledOnce();
    expect(submit.mock.calls[0]![1]).toBeNull();
  });

  it('marks the screenshot unavailable when capture is not possible', async () => {
    const { handle, q, submit } = setup({ deps: { loadCapture: async () => null } });
    handle.open();
    await vi.waitFor(() => expect(q('.dc-thumb')!.dataset.state).toBe('unavailable'));
    const toggle = q<HTMLInputElement>('.dc-shot-toggle')!;
    expect(toggle.disabled).toBe(true);
    expect(toggle.checked).toBe(false);
    expect(q('.dc-shot')!.textContent).toContain('Screenshot unavailable');
    q<HTMLTextAreaElement>('.dc-message')!.value = 'x';
    q('.dc-send')!.click();
    await vi.waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(submit.mock.calls[0]![1]).toBeNull();
  });

  it('shows thanks, then closes and resets after 2s', async () => {
    const { handle, q } = setup();
    handle.open();
    q<HTMLTextAreaElement>('.dc-message')!.value = 'Great app';
    vi.useFakeTimers();
    q('.dc-send')!.click();
    await vi.waitFor(() => expect(q('.dc-thanks')!.hidden).toBe(false));
    vi.advanceTimersByTime(2000);
    expect(q('.dc-panel')!.hidden).toBe(true);
    expect(q<HTMLTextAreaElement>('.dc-message')!.value).toBe('');
  });

  it('keeps the text and explains rate limiting', async () => {
    const { handle, q } = setup({
      deps: { submit: async () => ({ ok: false, reason: 'rate_limited' }) },
    });
    handle.open();
    q<HTMLTextAreaElement>('.dc-message')!.value = 'Again';
    q('.dc-send')!.click();
    await vi.waitFor(() =>
      expect(q('.dc-status')!.textContent).toBe('Too many submissions. Try again later.'),
    );
    expect(q<HTMLTextAreaElement>('.dc-message')!.value).toBe('Again');
    expect(q('.dc-retry')!.hidden).toBe(true);
  });

  it('offers retry after a network error', async () => {
    const submit = vi
      .fn<() => Promise<SubmitResult>>()
      .mockResolvedValueOnce({ ok: false, reason: 'network' })
      .mockResolvedValueOnce({ ok: true });
    const { handle, q } = setup({ deps: { submit } });
    handle.open();
    q<HTMLTextAreaElement>('.dc-message')!.value = 'Flaky';
    q('.dc-send')!.click();
    await vi.waitFor(() => expect(q('.dc-retry')!.hidden).toBe(false));
    expect(q('.dc-status')!.textContent).toBe("Couldn't send. Check your connection.");
    q('.dc-retry')!.click();
    await vi.waitFor(() => expect(q('.dc-thanks')!.hidden).toBe(false));
    expect(submit).toHaveBeenCalledTimes(2);
  });

  it('identify pre-fills the email without overwriting typed input', () => {
    const { handle, q } = setup();
    handle.identify({ email: 'ann@example.com' });
    expect(q<HTMLInputElement>('.dc-email')!.value).toBe('ann@example.com');
    q<HTMLInputElement>('.dc-email')!.value = 'typed@example.com';
    handle.identify({ email: 'other@example.com' });
    expect(q<HTMLInputElement>('.dc-email')!.value).toBe('typed@example.com');
  });

  it('identify replaces a previously identified email', () => {
    const { handle, q } = setup();
    handle.identify({ email: 'a@example.com' });
    handle.identify({ email: 'b@example.com' });
    expect(q<HTMLInputElement>('.dc-email')!.value).toBe('b@example.com');
  });

  it('identify without an email clears the prefilled one', () => {
    const { handle, q } = setup();
    handle.identify({ email: 'a@example.com' });
    handle.identify({});
    expect(q<HTMLInputElement>('.dc-email')!.value).toBe('');
  });

  it('identify never clears text the visitor typed', () => {
    const { handle, q } = setup();
    handle.identify({ email: 'a@example.com' });
    q<HTMLInputElement>('.dc-email')!.value = 'typed@example.com';
    handle.identify({});
    expect(q<HTMLInputElement>('.dc-email')!.value).toBe('typed@example.com');
  });

  it('never submits in preview mode', async () => {
    const { handle, q, submit } = setup({ preview: true });
    handle.open();
    q<HTMLTextAreaElement>('.dc-message')!.value = 'x';
    q('.dc-send')!.click();
    await Promise.resolve();
    expect(submit).not.toHaveBeenCalled();
    expect(q('.dc-root')!.hasAttribute('data-preview')).toBe(true);
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
    const { handle, q, submit } = setup({ deps: { loadCapture } });

    handle.open('bug');
    q('.dc-panel')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    handle.open('bug');

    second.resolve(async () => shotB);
    await vi.waitFor(() => expect(q('.dc-thumb')!.dataset.state).toBe('ready'));

    first.resolve(async () => shotA);
    await new Promise((r) => setTimeout(r, 0));

    expect(q('.dc-thumb')!.dataset.state).toBe('ready');
    q<HTMLTextAreaElement>('.dc-message')!.value = 'x';
    q('.dc-send')!.click();
    await vi.waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(submit.mock.calls[0]![1]).toBe(shotB);
  });

  it('resets instead of showing thanks when closed while a send is in flight', async () => {
    const pending = deferred<SubmitResult>();
    const submit = vi.fn<() => Promise<SubmitResult>>().mockReturnValue(pending.promise);
    const { handle, q } = setup({ deps: { submit } });
    handle.open();
    q<HTMLTextAreaElement>('.dc-message')!.value = 'in flight';
    q('.dc-send')!.click();
    q('.dc-panel')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(q('.dc-panel')!.hidden).toBe(true);

    pending.resolve({ ok: true });
    await vi.waitFor(() => expect(q<HTMLTextAreaElement>('.dc-message')!.value).toBe(''));
    expect(q('.dc-panel')!.hidden).toBe(true);

    handle.open();
    expect(q<HTMLTextAreaElement>('.dc-message')!.value).toBe('');
    expect(q('.dc-thanks')!.hidden).toBe(true);
    expect(q('.dc-form')!.hidden).toBe(false);
  });

  it('shows a busy spinner on the send button while sending', async () => {
    const pending = deferred<SubmitResult>();
    const submit = vi.fn<() => Promise<SubmitResult>>().mockReturnValue(pending.promise);
    const { handle, q } = setup({ deps: { submit } });
    handle.open();
    q<HTMLTextAreaElement>('.dc-message')!.value = 'busy check';
    q('.dc-send')!.click();
    await vi.waitFor(() => expect(q('.dc-send')!.getAttribute('aria-busy')).toBe('true'));
    pending.resolve({ ok: true });
    await vi.waitFor(() => expect(q('.dc-send')!.hasAttribute('aria-busy')).toBe(false));
  });

  it('open() while thanks is showing resets and shows the form again', async () => {
    const { handle, q } = setup();
    handle.open();
    q<HTMLTextAreaElement>('.dc-message')!.value = 'first';
    q('.dc-send')!.click();
    await vi.waitFor(() => expect(q('.dc-thanks')!.hidden).toBe(false));

    handle.open('idea');
    expect(q('.dc-panel')!.hidden).toBe(false);
    expect(q('.dc-thanks')!.hidden).toBe(true);
    expect(q('.dc-form')!.hidden).toBe(false);
    expect(q<HTMLTextAreaElement>('.dc-message')!.value).toBe('');
    expect(q('.dc-type[data-type="idea"]')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('returns focus to the previously focused element when hideTrigger is set', () => {
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    const { handle, q } = setup({ hideTrigger: true });
    handle.open();
    q('.dc-panel')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(q('.dc-panel')!.hidden).toBe(true);
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});
