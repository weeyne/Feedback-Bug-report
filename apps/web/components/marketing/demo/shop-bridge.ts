import type { SubmitPayload } from '@bugping/shared';
import { DEMO_MESSAGE, DEMO_SUBMIT_DELAY_MS } from './protocol';

/** The slice of `window` the bridge needs; injectable for tests. */
export interface BridgeWindow {
  parent: { postMessage(message: unknown, targetOrigin: string): void } | null;
  location: { origin: string };
  setTimeout(handler: () => void, ms: number): unknown;
}

export interface SubmittedMessage {
  type: typeof DEMO_MESSAGE.submitted;
  payload: SubmitPayload;
  screenshot: Blob | null;
}

/**
 * Posts `message` to the embedding page, only when there is one (the store is inside the demo
 * stage's iframe) and only to this page's own origin. Returns whether it was posted.
 */
export function postToParent(
  win: Pick<BridgeWindow, 'parent' | 'location'>,
  message: { type: string },
): boolean {
  const parent = win.parent;
  if (!parent || (parent as unknown) === win) return false;
  try {
    parent.postMessage(message, win.location.origin);
    return true;
  } catch {
    return false;
  }
}

/**
 * The demo store's `PanelDeps.submit`: never touches the network. After `delayMs` it hands the
 * payload and the (annotated) screenshot to the stage and reports success to the widget.
 */
export function createDemoSubmit(win: BridgeWindow, delayMs = DEMO_SUBMIT_DELAY_MS) {
  return (payload: SubmitPayload, screenshot: Blob | null): Promise<{ ok: true }> =>
    new Promise((resolve) => {
      win.setTimeout(() => {
        const message: SubmittedMessage = { type: DEMO_MESSAGE.submitted, payload, screenshot };
        postToParent(win, message);
        resolve({ ok: true });
      }, delayMs);
    });
}
