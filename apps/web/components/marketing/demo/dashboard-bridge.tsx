'use client';

import { useEffect } from 'react';
import {
  DEMO_MESSAGE,
  isDemoMessage,
  type DemoDashboardReadyMessage,
  type DemoScreenshotMessage,
} from './protocol';
import { isEmbedded, postToParent, type BridgeWindow } from './shop-bridge';

/** The detail panel's screenshot image(s) (`FeedbackDetailPanel` → `ScreenshotViewer`). */
export const DEMO_SCREENSHOT_SELECTOR = '[data-testid="feedback-detail"] img';

/**
 * The elements whose own entry animations (`PageEnter`'s `.animate-fade` wrapper inside `<main>`,
 * the detail panel's `.animate-slide`) the bridge restarts when scene 3 is shown.
 */
export const DEMO_REPLAY_SELECTOR = 'main > .animate-fade, [data-testid="feedback-detail"]';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

interface BridgeElement {
  src: string;
  style: { animationName: string };
  readonly offsetWidth: number;
}

/** The slice of `window` the dashboard bridge needs; injectable for tests. */
export interface DashboardBridgeWindow extends Pick<BridgeWindow, 'parent' | 'location'> {
  document: { querySelectorAll(selector: string): ArrayLike<BridgeElement> };
  matchMedia(query: string): { matches: boolean };
  URL: { createObjectURL(blob: Blob): string; revokeObjectURL(url: string): void };
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
}

/**
 * Restarts the dashboard's own CSS entry animations on `DEMO_REPLAY_SELECTOR` (no new animation
 * is added). They use a `backwards` fill, so once finished they are gone from `getAnimations()`
 * and cannot be replayed through the Web Animations API: the animation name is switched off, the
 * style flushed (reading `offsetWidth`) and the stylesheet's animation switched back on, which
 * starts it afresh. Nothing under reduced motion (those animations are off there anyway).
 */
export function replayEntryAnimations(win: Pick<DashboardBridgeWindow, 'document' | 'matchMedia'>) {
  if (win.matchMedia(REDUCED_MOTION).matches) return;
  const elements = Array.from(win.document.querySelectorAll(DEMO_REPLAY_SELECTOR));
  if (elements.length === 0) return;
  for (const el of elements) el.style.animationName = 'none';
  void elements[0]!.offsetWidth;
  for (const el of elements) el.style.animationName = '';
}

/**
 * Connects /demo/dashboard to the landing's demo stage: shows every screenshot blob the stage
 * posts in the detail panel (as an object URL, revoking the previous one) and then tells the
 * stage the page is ready. The page loads while scene 2 plays, so its entry animations run
 * unseen: when the stage shows scene 3 it posts `dashboardShow` and the bridge replays them.
 * Does nothing outside an iframe. Returns the cleanup.
 */
export function installDashboardBridge(win: DashboardBridgeWindow): () => void {
  const parent = win.parent;
  if (!parent || !isEmbedded(win)) return () => {};
  let current: string | null = null;
  const onMessage = (event: MessageEvent) => {
    if (event.source !== (parent as unknown)) return;
    if (isDemoMessage(event, win.location.origin, DEMO_MESSAGE.dashboardShow)) {
      replayEntryAnimations(win);
      return;
    }
    if (!isDemoMessage(event, win.location.origin, DEMO_MESSAGE.screenshot)) return;
    const { blob } = event.data as DemoScreenshotMessage;
    if (!(blob instanceof Blob)) return;
    const next = win.URL.createObjectURL(blob);
    for (const img of Array.from(win.document.querySelectorAll(DEMO_SCREENSHOT_SELECTOR))) {
      img.src = next;
    }
    if (current) win.URL.revokeObjectURL(current);
    current = next;
  };
  win.addEventListener('message', onMessage);
  const ready: DemoDashboardReadyMessage = { type: DEMO_MESSAGE.dashboardReady };
  postToParent(win, ready);
  return () => {
    win.removeEventListener('message', onMessage);
    if (current) win.URL.revokeObjectURL(current);
    current = null;
  };
}

/** Mounted once by /demo/dashboard; renders nothing. */
export function DashboardBridge() {
  useEffect(() => installDashboardBridge(window), []);
  return null;
}
