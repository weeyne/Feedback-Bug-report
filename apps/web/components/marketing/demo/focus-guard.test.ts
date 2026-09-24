import { describe, expect, it, vi } from 'vitest';
import { installFocusGuard, type FocusGuardHost } from './focus-guard';

class Node {
  focus = vi.fn((_options?: FocusOptions) => {
    host.document.activeElement = this;
  });
  blur = vi.fn(() => {
    host.document.activeElement = body;
  });
  isConnected = true;
  constructor(readonly name: string) {}
}

let host: FocusGuardHost & { document: { activeElement: unknown } };
let body: Node;

function setup() {
  const docListeners = new Map<string, Set<(event: Event) => void>>();
  const winListeners = new Set<() => void>();
  const timers: Array<() => void> = [];
  body = new Node('body');
  host = {
    document: {
      activeElement: null,
      addEventListener: (type, listener) => {
        if (!docListeners.has(type)) docListeners.set(type, new Set());
        docListeners.get(type)!.add(listener);
      },
      removeEventListener: (type, listener) => docListeners.get(type)?.delete(listener),
    },
    addEventListener: (_type, listener) => winListeners.add(listener),
    removeEventListener: (_type, listener) => winListeners.delete(listener),
    setTimeout: (handler) => timers.push(handler),
    clearTimeout: () => {},
  };
  host.document.activeElement = body;
  const iframe = new Node('iframe');
  const cta = new Node('cta');
  const root = { contains: (node: unknown) => node === iframe };
  const dispose = installFocusGuard(root, host);
  /** `inner` is the real target inside a shadow root; `target` is then its retargeted host. */
  const fire = (type: 'focusin' | 'focusout', target: unknown, inner?: unknown) => {
    const event =
      inner === undefined ? { target } : { target, composedPath: () => [inner, target] };
    for (const listener of docListeners.get(type) ?? []) listener(event as unknown as Event);
  };
  const windowBlur = () => {
    for (const listener of winListeners) listener();
  };
  const flush = () => {
    while (timers.length) timers.shift()!();
  };
  /** Focus moves into the stage's iframe, as when the widget inside calls focus(). */
  const focusIframe = (from: Node | null) => {
    if (from) fire('focusout', from);
    windowBlur();
    host.document.activeElement = iframe;
  };
  return { iframe, cta, dispose, fire, flush, focusIframe, docListeners, winListeners };
}

describe('installFocusGuard', () => {
  it('gives focus back to the landing element that lost it, without scrolling', () => {
    const { cta, flush, focusIframe } = setup();
    host.document.activeElement = cta;
    focusIframe(cta);
    flush();
    expect(cta.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(host.document.activeElement).toBe(cta);
  });

  it('restores the real element inside a shadow root, not its retargeted host', () => {
    const { fire, flush, iframe } = setup();
    // The landing's widget: the textarea lives in the host's shadow root; the host is a plain div.
    const shadowHost = new Node('host');
    shadowHost.focus = vi.fn();
    const textarea = new Node('textarea');
    host.document.activeElement = shadowHost;
    fire('focusout', shadowHost, textarea);
    host.document.activeElement = iframe;
    flush();
    expect(textarea.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(shadowHost.focus).not.toHaveBeenCalled();
    expect(host.document.activeElement).toBe(textarea);
  });

  it('blurs the iframe when nothing on the landing had focus', () => {
    const { iframe, flush, focusIframe } = setup();
    focusIframe(null);
    flush();
    expect(iframe.blur).toHaveBeenCalled();
    expect(host.document.activeElement).toBe(body);
  });

  it('leaves normal focus changes on the landing alone', () => {
    const { cta, fire, flush } = setup();
    fire('focusout', body);
    host.document.activeElement = cta;
    fire('focusin', cta);
    flush();
    expect(cta.focus).not.toHaveBeenCalled();
    expect(host.document.activeElement).toBe(cta);
  });

  it('does not restore a stale element on a later bounce', () => {
    const { cta, iframe, fire, flush, focusIframe } = setup();
    host.document.activeElement = cta;
    fire('focusout', cta);
    host.document.activeElement = body;
    flush();
    focusIframe(null);
    flush();
    expect(cta.focus).not.toHaveBeenCalled();
    expect(iframe.blur).toHaveBeenCalled();
  });

  it('removes its listeners', () => {
    const { dispose, docListeners, winListeners } = setup();
    dispose();
    expect([...docListeners.values()].every((set) => set.size === 0)).toBe(true);
    expect(winListeners.size).toBe(0);
  });
});
