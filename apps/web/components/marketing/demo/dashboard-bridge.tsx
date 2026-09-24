'use client';

import { useEffect } from 'react';
import {
  DEMO_MESSAGE,
  isDemoMessage,
  type DemoDashboardReadyMessage,
  type DemoScreenshotMessage,
} from './protocol';
import { postToParent, type BridgeWindow } from './shop-bridge';

/** The detail panel's screenshot image(s) (`FeedbackDetailPanel` → `ScreenshotViewer`). */
export const DEMO_SCREENSHOT_SELECTOR = '[data-testid="feedback-detail"] img';

/** The slice of `window` the dashboard bridge needs; injectable for tests. */
export interface DashboardBridgeWindow extends Pick<BridgeWindow, 'parent' | 'location'> {
  document: { querySelectorAll(selector: string): ArrayLike<{ src: string }> };
  URL: { createObjectURL(blob: Blob): string; revokeObjectURL(url: string): void };
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
}

/**
 * Connects /demo/dashboard to the landing's demo stage: shows every screenshot blob the stage
 * posts in the detail panel (as an object URL, revoking the previous one) and then tells the
 * stage the page is ready. Does nothing outside an iframe. Returns the cleanup.
 */
export function installDashboardBridge(win: DashboardBridgeWindow): () => void {
  const parent = win.parent;
  if (!parent || (parent as unknown) === win) return () => {};
  let current: string | null = null;
  const onMessage = (event: MessageEvent) => {
    if (event.source !== (parent as unknown)) return;
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
