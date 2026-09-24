import { describe, expect, it, vi } from 'vitest';
import {
  DEMO_REPLAY_SELECTOR,
  DEMO_SCREENSHOT_SELECTOR,
  installDashboardBridge,
  type DashboardBridgeWindow,
} from './dashboard-bridge';
import { DEMO_MESSAGE } from './protocol';

const ORIGIN = 'https://bugping.app';

/** An element that logs its `animation-name` writes and the style flush (`offsetWidth`). */
const fakeElement = (name: string, calls: string[]) => {
  const style = {
    set animationName(value: string) {
      calls.push(`${name}:${value || 'stylesheet'}`);
    },
    get animationName() {
      return '';
    },
  };
  return {
    src: '',
    style,
    get offsetWidth() {
      calls.push('flush');
      return 0;
    },
  };
};

function fakeWindow({ embedded = true, reduced = false } = {}) {
  const postMessage = vi.fn();
  const parent = { postMessage };
  const calls: string[] = [];
  const image = fakeElement('img', calls);
  image.src = 'data:placeholder';
  const images = [image];
  const animated = [fakeElement('page', calls), fakeElement('detail', calls)];
  const listeners = new Set<(event: MessageEvent) => void>();
  let next = 0;
  const createObjectURL = vi.fn(() => `blob:${ORIGIN}/${++next}`);
  const revokeObjectURL = vi.fn();
  const querySelectorAll = vi.fn((selector: string) =>
    selector === DEMO_REPLAY_SELECTOR ? animated : images,
  );
  const win: DashboardBridgeWindow = {
    parent,
    location: { origin: ORIGIN },
    document: { querySelectorAll },
    matchMedia: () => ({ matches: reduced }),
    URL: { createObjectURL, revokeObjectURL },
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
  };
  if (!embedded) win.parent = win as unknown as DashboardBridgeWindow['parent'];
  const dispatch = (event: Partial<MessageEvent>) => {
    for (const listener of listeners) listener(event as MessageEvent);
  };
  return {
    win,
    parent,
    calls,
    animated,
    postMessage,
    images,
    listeners,
    dispatch,
    createObjectURL,
    revokeObjectURL,
    querySelectorAll,
  };
}

const blob = new Blob(['shot'], { type: 'image/webp' });

describe('demo dashboard bridge', () => {
  it('tells the parent it is ready, with the page origin as targetOrigin', () => {
    const { win, postMessage } = fakeWindow();
    installDashboardBridge(win);
    expect(postMessage).toHaveBeenCalledWith({ type: DEMO_MESSAGE.dashboardReady }, ORIGIN);
  });

  it('does nothing outside an iframe', () => {
    const { win, listeners } = fakeWindow({ embedded: false });
    installDashboardBridge(win)();
    expect(listeners.size).toBe(0);
  });

  it('shows each posted screenshot in the detail panel and revokes the previous URL', () => {
    const { win, parent, images, dispatch, revokeObjectURL, querySelectorAll } = fakeWindow();
    installDashboardBridge(win);
    const message = { type: DEMO_MESSAGE.screenshot, blob };
    dispatch({ origin: ORIGIN, source: parent as unknown as Window, data: message });
    expect(querySelectorAll).toHaveBeenCalledWith(DEMO_SCREENSHOT_SELECTOR);
    expect(images[0]!.src).toBe(`blob:${ORIGIN}/1`);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    dispatch({ origin: ORIGIN, source: parent as unknown as Window, data: message });
    expect(images[0]!.src).toBe(`blob:${ORIGIN}/2`);
    expect(revokeObjectURL).toHaveBeenCalledWith(`blob:${ORIGIN}/1`);
  });

  it('ignores other origins, other sources, other types and non-blobs', () => {
    const { win, parent, images, dispatch, createObjectURL } = fakeWindow();
    installDashboardBridge(win);
    const source = parent as unknown as Window;
    dispatch({
      origin: 'https://evil.example',
      source,
      data: { type: DEMO_MESSAGE.screenshot, blob },
    });
    dispatch({
      origin: ORIGIN,
      source: {} as Window,
      data: { type: DEMO_MESSAGE.screenshot, blob },
    });
    dispatch({ origin: ORIGIN, source, data: { type: DEMO_MESSAGE.ready, blob } });
    dispatch({ origin: ORIGIN, source, data: { type: DEMO_MESSAGE.screenshot, blob: 'x' } });
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(images[0]!.src).toBe('data:placeholder');
  });

  it('stops listening and revokes the current URL on cleanup', () => {
    const { win, parent, dispatch, listeners, revokeObjectURL } = fakeWindow();
    const cleanup = installDashboardBridge(win);
    dispatch({
      origin: ORIGIN,
      source: parent as unknown as Window,
      data: { type: DEMO_MESSAGE.screenshot, blob },
    });
    cleanup();
    expect(listeners.size).toBe(0);
    expect(revokeObjectURL).toHaveBeenCalledWith(`blob:${ORIGIN}/1`);
  });

  it('restarts the entry animations when the stage shows scene 3', () => {
    const { win, parent, dispatch, calls } = fakeWindow();
    installDashboardBridge(win);
    const source = parent as unknown as Window;
    dispatch({ origin: ORIGIN, source, data: { type: DEMO_MESSAGE.dashboardShow } });
    // Off, one style flush, back to the stylesheet's own animation.
    expect(calls).toEqual([
      'page:none',
      'detail:none',
      'flush',
      'page:stylesheet',
      'detail:stylesheet',
    ]);
    // Not from another source or origin.
    dispatch({ origin: ORIGIN, source: {} as Window, data: { type: DEMO_MESSAGE.dashboardShow } });
    dispatch({
      origin: 'https://evil.example',
      source,
      data: { type: DEMO_MESSAGE.dashboardShow },
    });
    expect(calls).toHaveLength(5);
  });

  it('replays nothing under reduced motion', () => {
    const { win, parent, dispatch, calls } = fakeWindow({ reduced: true });
    installDashboardBridge(win);
    dispatch({
      origin: ORIGIN,
      source: parent as unknown as Window,
      data: { type: DEMO_MESSAGE.dashboardShow },
    });
    expect(calls).toEqual([]);
  });
});
