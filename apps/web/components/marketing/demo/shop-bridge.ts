import type { ClientMetadata, SubmitPayload } from '@bugping/shared';
import { DEMO_MESSAGE, DEMO_SHOP_URL, DEMO_SUBMIT_DELAY_MS } from './protocol';

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
 * True when the page runs inside a frame (the demo stage's iframe). A top-level window is its own
 * `parent`.
 */
export function isEmbedded(win: Pick<BridgeWindow, 'parent'>): boolean {
  const parent: unknown = win.parent;
  return parent != null && parent !== win;
}

/**
 * Posts `message` to the embedding page, only when there is one (the store is inside the demo
 * stage's iframe) and only to this page's own origin. Returns whether it was posted.
 */
export function postToParent(
  win: Pick<BridgeWindow, 'parent' | 'location'>,
  message: { type: string },
): boolean {
  if (!isEmbedded(win) || !win.parent) return false;
  try {
    win.parent.postMessage(message, win.location.origin);
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

/**
 * The real client metadata with the fictional store's address (`DEMO_SHOP_URL`) in place of the
 * app's own /demo/shop URL, so the report tells the same story as the frame's URL bar. Everything
 * else (browser, viewport, console errors…) stays what the real widget collected.
 */
export function withDemoShopUrl(metadata: ClientMetadata): ClientMetadata {
  return { ...metadata, url: DEMO_SHOP_URL };
}

/** The prototypes whose `focus()` the embedded store disables; injectable for tests. */
export interface FocusPrototypes {
  HTMLElement: { prototype: { focus(options?: FocusOptions): void } };
  SVGElement?: { prototype: { focus(options?: FocusOptions): void } };
}

/**
 * Makes programmatic `focus()` a no-op in the embedded demo store's document. The real widget
 * focuses its panel, form and editor as it opens (good behaviour on a real site), but inside the
 * landing's demo iframe any such call moves the landing's focus into the iframe — a visitor typing
 * into a landing field (or into the landing's own widget) would lose their keystrokes. The director
 * drives the widget with dispatched events and never needs focus, so the iframe gives it up
 * entirely. Only call this when embedded: the standalone /demo/shop keeps real focus.
 */
export function disableProgrammaticFocus(win: FocusPrototypes): void {
  const noop = function focus() {};
  win.HTMLElement.prototype.focus = noop;
  if (win.SVGElement) win.SVGElement.prototype.focus = noop;
}
